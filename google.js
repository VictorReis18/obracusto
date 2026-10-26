/*
 * Lê a planilha de custos direto do Google Planilhas, com login Google.
 *
 * - Login: biblioteca oficial Google Identity Services (carregada de accounts.google.com).
 *   O app pede só permissão de leitura de planilhas (spreadsheets.readonly).
 * - Leitura: Google Sheets API v4. Baixa só as colunas que o app usa (COLUNAS_USADAS em importar.js)
 *   e entrega para ImportarPlanilha.montarBase, o mesmo caminho do arquivo .xlsx.
 *
 * O login só funciona com o app aberto por http://localhost:8765 (atalho "ObraCusto" ou "Abrir ObraCusto.bat"),
 * que é o endereço autorizado no projeto do Google Cloud.
 */
(function (raiz) {
  'use strict';

  const ESCOPO = 'https://www.googleapis.com/auth/spreadsheets.readonly';
  const API = 'https://sheets.googleapis.com/v4/spreadsheets/';
  const GIS = 'https://accounts.google.com/gsi/client';

  let clienteToken = null;
  let clienteId = null;
  let token = null;
  let expiraEm = 0;
  let aoReceber = null;
  let aoFalhar = null;

  // Aceita o link inteiro da planilha ou só o ID
  function idDaPlanilha(linkOuId) {
    const s = String(linkOuId || '').trim();
    const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(s);
    return m ? m[1] : s;
  }

  function carregarGis() {
    if (raiz.google && raiz.google.accounts && raiz.google.accounts.oauth2) return Promise.resolve();
    return new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = GIS;
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => falha(new Error('não consegui carregar o login do Google (verifique a internet)'));
      document.head.appendChild(s);
    });
  }

  function pedirToken(id) {
    if (token && clienteId === id && Date.now() < expiraEm - 60000) return Promise.resolve(token);
    if (!clienteToken || clienteId !== id) {
      clienteToken = raiz.google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: ESCOPO,
        callback: r => aoReceber && aoReceber(r),
        error_callback: e => aoFalhar && aoFalhar(e),
      });
      clienteId = id;
      token = null;
    }
    return new Promise((ok, falha) => {
      aoReceber = r => {
        if (r.error) {
          falha(new Error(r.error === 'access_denied' ? 'a permissão de leitura não foi concedida' : (r.error_description || r.error)));
          return;
        }
        token = r.access_token;
        expiraEm = Date.now() + (Number(r.expires_in) || 3600) * 1000;
        ok(token);
      };
      aoFalhar = e => {
        const tipo = e && e.type;
        falha(new Error(
          tipo === 'popup_closed' ? 'a janela de login do Google foi fechada antes de terminar'
            : tipo === 'popup_failed_to_open' ? 'o navegador bloqueou a janela de login do Google; permita pop-ups para localhost:8765'
              : (e && (e.message || tipo)) || 'falha no login do Google'));
      };
      clienteToken.requestAccessToken();
    });
  }

  async function chamar(url) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (r.ok) return r.json();
    let msg = '';
    try {
      const j = await r.json();
      msg = (j.error && j.error.message) || '';
    } catch (e) { /* resposta sem JSON */ }
    if (r.status === 401) {
      token = null;
      throw new Error('o login expirou; clique de novo para entrar');
    }
    if (r.status === 403) {
      throw new Error('acesso negado. Confira se entrou com a conta que tem acesso à planilha e se a Google Sheets API está ativada no projeto do Google Cloud. ' + msg);
    }
    if (r.status === 404) throw new Error('planilha não encontrada; confira o link nas configurações');
    throw new Error(`erro ${r.status} do Google. ${msg}`);
  }

  // Índice da coluna (0 = A) -> letra(s) da coluna
  function letra(n) {
    let s = '';
    for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }

  const aspas = nome => "'" + nome.replace(/'/g, "''") + "'";

  /**
   * Faz login (se preciso) e lê a planilha.
   * @param opcoes { clientId, planilha (link ou ID), importador (ImportarPlanilha), aoAndar(texto) }
   * @returns base no mesmo formato de ImportarPlanilha.importar
   */
  async function ler(opcoes) {
    const importador = opcoes.importador;
    const andar = opcoes.aoAndar || (() => {});
    const id = idDaPlanilha(opcoes.planilha);
    if (!opcoes.clientId) throw new Error('falta o ID do cliente OAuth na configuração do Google');
    if (!id) throw new Error('falta o link da planilha na configuração do Google');

    await carregarGis();
    andar('Aguardando o login no Google…');
    await pedirToken(opcoes.clientId);

    andar('Lendo a lista de abas…');
    const url = API + encodeURIComponent(id);
    const info = await chamar(url + '?fields=properties.title,sheets.properties.title');
    const usadas = importador.abasUsadas(info.sheets.map(s => s.properties.title));
    if (!usadas.bd_estruturas) throw new Error('a planilha não tem a aba "BD_Estruturas"');

    // 1º os cabeçalhos, para saber em que coluna está cada informação
    const alvos = Object.keys(usadas);
    const cab = await chamar(url + '/values:batchGet?' +
      alvos.map(a => 'ranges=' + encodeURIComponent(aspas(usadas[a]) + '!1:1')).join('&'));
    const pedidos = [];
    alvos.forEach((alvo, i) => {
      const cabecalho = ((cab.valueRanges[i] || {}).values || [[]])[0];
      const mapa = importador.colunas(cabecalho);
      for (const nomeCol of importador.COLUNAS_USADAS[alvo]) {
        if (mapa[nomeCol] != null) pedidos.push({ alvo, letra: letra(mapa[nomeCol]) });
      }
    });

    // 2º só as colunas usadas, com os valores sem formatação (números e datas como número)
    andar('Baixando estruturas e preços…');
    const dados = await chamar(url + '/values:batchGet?majorDimension=COLUMNS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&' +
      pedidos.map(p => 'ranges=' + encodeURIComponent(`${aspas(usadas[p.alvo])}!${p.letra}:${p.letra}`)).join('&'));

    // Remonta as linhas de cada aba só com as colunas baixadas (o cabeçalho continua na 1ª linha)
    const abas = {};
    for (const alvo of alvos) {
      const cols = [];
      pedidos.forEach((p, i) => {
        if (p.alvo === alvo) cols.push((((dados.valueRanges[i] || {}).values) || [[]])[0] || []);
      });
      const total = Math.max(0, ...cols.map(c => c.length));
      const linhas = new Array(total);
      for (let r = 0; r < total; r++) linhas[r] = cols.map(c => (c[r] === '' || c[r] === undefined ? null : c[r]));
      abas[alvo] = linhas;
    }

    andar('Montando a base…');
    return importador.montarBase(abas, 'Google Planilhas: ' + ((info.properties && info.properties.title) || id));
  }

  raiz.PlanilhaGoogle = { ler, idDaPlanilha, carregarGis };
})(window);

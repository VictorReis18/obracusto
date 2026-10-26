/*
 * Lê a planilha de controle de custos e monta a base usada pelo app.
 * Os dados podem vir de um arquivo .xlsx (importar) ou direto do Google Planilhas (montarBase,
 * chamado por google.js).
 *
 * Abas usadas:
 *   BD_Estruturas  -> estrutura de cada produto (matérias-primas, quantidades e preços)
 *   Aux            -> descrição dos produtos (colunas Item / Descrição)
 *   IR_Produção    -> descrição dos produtos que não estão na Aux
 *
 * Funciona no navegador (window.ImportarPlanilha) e no Node (module.exports).
 */
(function (raiz) {
  'use strict';

  // Colunas usadas de cada aba, pelo nome do cabeçalho (sem acento e em minúsculas)
  const COLUNAS_USADAS = {
    bd_estruturas: ['grupo', 'produto', 'codigo', 'descricao', 'unidade', 'quantidade', 'data ultima compra', 'valor ultima compra', 'ipi'],
    aux: ['item', 'descricao'],
    ir_producao: ['item', 'descricao do item'],
  };

  // Agrupa variações de escrita que existem na planilha ("Fogão a Lenha", "Pit Smoker", "Lareiras ")
  const GRUPOS = {
    'acessorios': 'Acessórios',
    'calefatores': 'Calefatores',
    'churrasqueiras': 'Churrasqueiras',
    'fogao a lenha': 'Fogão a lenha',
    'fornos': 'Fornos',
    'insertos': 'Insertos',
    'lareira': 'Lareiras',
    'lareiras': 'Lareiras',
    'lareiras pellet': 'Lareiras pellet',
    'parrillas': 'Parrillas',
    'pit smoker': 'Pit Smoker',
    'pitsmoker': 'Pit Smoker',
    'revenda': 'Revenda',
  };

  function semAcento(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function texto(v) {
    if (v == null) return '';
    return String(v).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }

  function chave(v) {
    return semAcento(texto(v)).toLowerCase();
  }

  // 510243.0 -> "510243"; "002522.01" continua igual
  function codigo(v) {
    if (v == null) return '';
    if (typeof v === 'number') return String(v);
    const s = texto(v);
    return /^\d+\.0+$/.test(s) ? s.replace(/\.0+$/, '') : s;
  }

  function numero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = texto(v);
    if (!s) return null;
    // "1.234,56" (formato brasileiro) ou "1234.56"
    const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
    return isFinite(n) ? n : null;
  }

  // Número de série do Excel -> "AAAA-MM-DD". Zero (MAXIFS sem compra) vira vazio.
  function data(v) {
    if (typeof v !== 'number' || v < 30000) return '';
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }

  function grupo(v) {
    const k = chave(v);
    return GRUPOS[k] || texto(v);
  }

  // Nome real de cada aba usada, a partir da lista de abas da planilha: { bd_estruturas: 'BD_Estruturas', ... }
  function abasUsadas(nomes) {
    const achadas = {};
    for (const alvo of Object.keys(COLUNAS_USADAS)) {
      const real = nomes.find(n => chave(n) === alvo);
      if (real) achadas[alvo] = real;
    }
    return achadas;
  }

  // Devolve { nomeNormalizado: índiceDaColuna } usando a primeira ocorrência de cada cabeçalho
  function colunas(cabecalho) {
    const mapa = {};
    (cabecalho || []).forEach((v, i) => {
      const k = chave(v);
      if (k && !(k in mapa)) mapa[k] = i;
    });
    return mapa;
  }

  function lerDescricoes(abas) {
    const desc = {};
    const fontes = [['aux', 'descricao'], ['ir_producao', 'descricao do item']];
    for (const [aba, colDesc] of fontes) {
      const ls = abas[aba];
      if (!ls || !ls.length) continue;
      const c = colunas(ls[0]);
      const ci = c['item'], cd = c[colDesc];
      if (ci == null || cd == null) continue;
      for (let i = 1; i < ls.length; i++) {
        const r = ls[i] || [];
        const sku = codigo(r[ci]);
        const d = texto(r[cd]);
        if (sku && d && !desc[sku]) desc[sku] = d;
      }
    }
    return desc;
  }

  /**
   * Monta a base a partir das linhas de cada aba.
   * @param abas { bd_estruturas: linhas[][], aux: linhas[][], ir_producao: linhas[][] } (a 1ª linha é o cabeçalho)
   * @param origem nome exibido no app (arquivo ou planilha do Google)
   */
  function montarBase(abas, origem) {
    const ls = abas.bd_estruturas;
    if (!ls || !ls.length) throw new Error('A planilha não tem a aba "BD_Estruturas".');

    const c = colunas(ls[0]);
    const col = {
      grupo: c['grupo'],
      produto: c['produto'],
      codigo: c['codigo'],
      descricao: c['descricao'],
      unidade: c['unidade'],
      quantidade: c['quantidade'],
      data: c['data ultima compra'],
      valor: c['valor ultima compra'],
      ipi: c['ipi'],
    };
    const faltando = ['produto', 'codigo', 'descricao', 'unidade', 'quantidade', 'valor']
      .filter(k => col[k] == null);
    if (faltando.length) {
      throw new Error('Colunas não encontradas na aba BD_Estruturas: ' + faltando.join(', '));
    }

    const descricoes = lerDescricoes(abas);
    const materiais = [];
    const idxMaterial = new Map();
    const produtos = {};
    let linhasLidas = 0;

    for (let i = 1; i < ls.length; i++) {
      const r = ls[i] || [];
      const sku = codigo(r[col.produto]);
      if (!sku) continue;
      const qtd = numero(r[col.quantidade]);
      const desc = texto(r[col.descricao]);
      const cod = codigo(r[col.codigo]);
      if (qtd == null && !desc && !cod) continue;

      const mat = [
        cod === '-' ? '' : cod,
        desc,
        texto(r[col.unidade]).toUpperCase(),
        numero(r[col.valor]) || 0,
        col.ipi != null ? numero(r[col.ipi]) || 0 : 0,
        col.data != null ? data(r[col.data]) : '',
      ];
      const k = mat.join('|');
      let im = idxMaterial.get(k);
      if (im == null) {
        im = materiais.length;
        materiais.push(mat);
        idxMaterial.set(k, im);
      }

      let p = produtos[sku];
      if (!p) {
        p = produtos[sku] = {
          d: descricoes[sku] || '',
          g: col.grupo != null ? grupo(r[col.grupo]) : '',
          e: [],
        };
      }
      p.e.push([im, qtd || 0]);
      linhasLidas++;
    }

    return {
      versao: 1,
      arquivo: origem || '',
      importadoEm: new Date().toISOString(),
      linhas: linhasLidas,
      materiais,
      produtos,
    };
  }

  /**
   * Lê um arquivo .xlsx baixado da planilha.
   * @param XLSX     biblioteca SheetJS
   * @param conteudo ArrayBuffer / Buffer do arquivo .xlsx
   * @param nomeArquivo nome exibido no app
   */
  function importar(XLSX, conteudo, nomeArquivo) {
    const tipo = conteudo instanceof ArrayBuffer ? 'array' : 'buffer';
    // Primeiro só os nomes das abas, para depois ler apenas as três que interessam
    const nomes = XLSX.read(conteudo, { type: tipo, bookSheets: true }).SheetNames;
    const usadas = abasUsadas(nomes);
    const wb = XLSX.read(conteudo, {
      type: tipo,
      sheets: Object.values(usadas),
      dense: true,
      cellFormula: false,
      cellHTML: false,
      cellText: false,
    });
    const abas = {};
    for (const [alvo, real] of Object.entries(usadas)) {
      abas[alvo] = XLSX.utils.sheet_to_json(wb.Sheets[real], { header: 1, raw: true, defval: null, blankrows: false });
    }
    return montarBase(abas, nomeArquivo);
  }

  const api = { importar, montarBase, abasUsadas, colunas, COLUNAS_USADAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.ImportarPlanilha = api;
})(typeof window !== 'undefined' ? window : globalThis);

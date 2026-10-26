/*
 * ObraCusto — custeio (uso interno): levanta o custo que depois serve de base para o orçamento ao cliente.
 * Cada produto da aba BD_Estruturas tem a lista de matérias-primas que usa. O custeio soma
 * essas matérias-primas (quantidade × valor da última compra) para chegar no custo, e aplica
 * um markup para sugerir um preço de referência.
 *
 * No código, cada custeio é chamado de "orçamento" (orcs / atual), como nos dados já salvos.
 *
 * Tudo fica salvo no navegador (localStorage). Nada é enviado para a internet.
 */
(function () {
  'use strict';

  const CHAVES = {
    orcs: 'orc.v1.orcamentos',
    config: 'orc.v1.config',
    base: 'orc.v1.base',
  };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  // ============================================================
  // Utilidades
  // ============================================================

  function ler(chave, padrao) {
    try {
      const s = localStorage.getItem(chave);
      return s ? JSON.parse(s) : padrao;
    } catch (e) {
      return padrao;
    }
  }

  function gravar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
      return true;
    } catch (e) {
      avisar('Não foi possível salvar neste navegador: ' + e.message, 'erro');
      return false;
    }
  }

  const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtQtd = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
  const fmt2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
  const fmtIpi = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 });

  const moeda = v => fmtMoeda.format(v || 0);
  const qtdFmt = v => fmtQtd.format(v || 0);

  function dataBR(iso) {
    if (!iso) return '—';
    const [a, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
  }

  function hoje() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  // Aceita "1.234,56", "1234,56", "1234.56" e "1.500" (milhar)
  function numero(s) {
    if (typeof s === 'number') return isFinite(s) ? s : null;
    s = String(s == null ? '' : s).trim().replace(/\s|R\$|%|×|x/gi, '');
    if (!s) return null;
    let n;
    if (s.includes(',')) n = Number(s.replace(/\./g, '').replace(',', '.'));
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) n = Number(s.replace(/\./g, ''));
    else n = Number(s);
    return isFinite(n) ? n : null;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function normal(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function novoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  const numOrc = n => String(n).padStart(4, '0');

  function avisar(msg, tipo) {
    const el = document.createElement('div');
    el.className = 'aviso' + (tipo ? ' ' + tipo : '');
    el.textContent = msg;
    const caixa = $('#avisos');
    while (caixa.children.length >= 2) caixa.firstElementChild.remove();
    caixa.appendChild(el);
    setTimeout(() => el.remove(), tipo === 'erro' ? 7000 : 3200);
  }

  function baixar(nome, conteudo, tipo) {
    const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ============================================================
  // Base de preços (vem do dados.js ou de uma planilha carregada no app)
  // ============================================================

  let base;
  let baseCarregadaNoApp = false; // true quando a base veio de uma planilha carregada pelo botão
  let indiceProdutos = [];
  let indiceMps = [];

  function carregarBase() {
    const padrao = window.BASE_PADRAO;
    const salva = ler(CHAVES.base, null);
    baseCarregadaNoApp = !!(salva && salva.produtos && (!padrao || salva.importadoEm > padrao.importadoEm));
    if (baseCarregadaNoApp) return salva;
    return padrao || { produtos: {}, materiais: [], arquivo: '', importadoEm: '' };
  }

  // Linha de estrutura: [código, descrição, unidade, qtd por unidade, valor unit., IPI, data última compra]
  function estruturaDe(sku) {
    const p = base.produtos[sku];
    if (!p) return [];
    return p.e.map(([im, q]) => {
      const m = base.materiais[im];
      return [m[0], m[1], m[2], q, m[3], m[4], m[5]];
    });
  }

  function custoEstrutura(estr) {
    let sem = 0, com = 0, semPreco = 0;
    for (const r of estr) {
      const v = r[3] * r[4];
      sem += v;
      com += v * (1 + (r[5] || 0));
      if (!r[4]) semPreco++;
    }
    return { sem, com, semPreco };
  }

  function montarIndice() {
    indiceProdutos = Object.keys(base.produtos).map(sku => {
      const p = base.produtos[sku];
      return {
        tipo: 'produto',
        codigo: sku,
        descricao: p.d,
        grupo: p.g,
        n: p.e.length,
        custo: custoEstrutura(estruturaDe(sku)),
        busca: normal(sku + ' ' + p.d + ' ' + p.g),
        cod: normal(sku),
      };
    });

    // Uma entrada por matéria-prima, com o preço da compra mais recente
    const mps = new Map();
    for (const m of base.materiais) {
      const k = m[0] || m[1];
      if (!k) continue;
      const atualM = mps.get(k);
      if (!atualM || (m[5] || '') > (atualM[5] || '')) mps.set(k, m);
    }
    indiceMps = Array.from(mps.values()).map(m => ({
      tipo: 'mp',
      codigo: m[0],
      descricao: m[1],
      un: m[2],
      preco: m[3],
      ipi: m[4],
      data: m[5],
      busca: normal(m[0] + ' ' + m[1]),
      cod: normal(m[0]),
    }));
  }

  function buscar(texto) {
    const q = normal(texto).trim();
    if (!q) return [];
    const termos = q.split(/\s+/);
    const pontuar = r => (r.cod === q ? 0 : r.cod.startsWith(q) ? 1 : 2);
    const filtrar = lista => lista
      .filter(r => termos.every(t => r.busca.includes(t)))
      .sort((a, b) => pontuar(a) - pontuar(b) || a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
    return filtrar(indiceProdutos).concat(filtrar(indiceMps));
  }

  // ============================================================
  // Orçamentos
  // ============================================================

  let orcs = ler(CHAVES.orcs, []);
  let config = Object.assign({
    proximoNumero: 1,
    markupPadrao: 1,
    baseCustoPadrao: 'sem',
    googlePlanilha: 'https://docs.google.com/spreadsheets/d/1iG6U_Lq6tEuBozfaeMONddmkuN7h6BA2e645gdRrBBY/edit',
    googleClientId: '',
    ultimoId: null,
  }, ler(CHAVES.config, {}));

  let atual = null;
  const expandidos = new Set();
  let vista = 'itens';

  function salvarConfig() {
    gravar(CHAVES.config, config);
  }

  let timerSalvar = null;
  function salvar() {
    if (atual) atual.atualizadoEm = new Date().toISOString();
    $('#statusSalvo').textContent = 'Salvando…';
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(salvarAgora, 300);
  }
  function salvarAgora() {
    clearTimeout(timerSalvar);
    timerSalvar = null;
    if (gravar(CHAVES.orcs, orcs)) $('#statusSalvo').textContent = 'Salvo neste computador';
  }
  window.addEventListener('beforeunload', () => { if (timerSalvar) salvarAgora(); });

  function criarOrcamento() {
    const agora = new Date().toISOString();
    const o = {
      id: novoId(),
      numero: config.proximoNumero++,
      criadoEm: agora,
      atualizadoEm: agora,
      cliente: '',
      obra: '',
      contato: '',
      data: hoje(),
      obs: '',
      baseCusto: config.baseCustoPadrao,
      markup: config.markupPadrao,
      itens: [],
      precosDe: base.importadoEm,
    };
    orcs.unshift(o);
    salvarConfig();
    return o;
  }

  function custoItem(it) {
    if (it.tipo === 'produto') return custoEstrutura(it.estrutura);
    if (it.tipo === 'mp') return { sem: it.preco, com: it.preco * (1 + (it.ipi || 0)), semPreco: it.preco ? 0 : 1 };
    return { sem: it.preco || 0, com: it.preco || 0, semPreco: 0 };
  }

  // custo = custo considerado (s/ ou c/ IPI, conforme o custeio); preco = preço sugerido de referência
  function calcular(o) {
    const t = { custoSem: 0, custoCom: 0, custo: 0, preco: 0 };
    const linhas = o.itens.map(it => {
      const c = custoItem(it);
      const custoUnit = o.baseCusto === 'com' ? c.com : c.sem;
      const precoUnit = it.precoManual != null ? it.precoManual : custoUnit * (o.markup || 0);
      const l = { it, c, custoUnit, custoTotal: custoUnit * it.qtd, precoUnit, precoTotal: precoUnit * it.qtd };
      t.custoSem += c.sem * it.qtd;
      t.custoCom += c.com * it.qtd;
      t.custo += l.custoTotal;
      t.preco += l.precoTotal;
      return l;
    });
    t.ipi = t.custoCom - t.custoSem;
    t.margem = t.preco - t.custo;
    t.margemPct = t.preco ? t.margem / t.preco : 0;
    return { linhas, t };
  }

  // Soma as matérias-primas de todos os itens (produtos e matérias-primas avulsas)
  function consolidar(o) {
    const mapa = new Map();
    const somar = (cod, desc, un, qtd, preco, ipi, data) => {
      const k = (cod || desc) + '|' + un;
      let m = mapa.get(k);
      if (!m) mapa.set(k, m = { cod, desc, un, qtd: 0, sem: 0, com: 0, data: '', precos: new Set() });
      m.qtd += qtd;
      m.sem += qtd * preco;
      m.com += qtd * preco * (1 + (ipi || 0));
      m.precos.add(preco);
      if ((data || '') > m.data) m.data = data;
    };
    for (const it of o.itens) {
      if (it.tipo === 'produto') {
        for (const r of it.estrutura) somar(r[0], r[1], r[2], r[3] * it.qtd, r[4], r[5], r[6]);
      } else if (it.tipo === 'mp') {
        somar(it.codigo, it.descBase || it.descricao, it.un, it.qtd, it.preco, it.ipi, it.data);
      }
    }
    return Array.from(mapa.values()).sort((a, b) => a.desc.localeCompare(b.desc, 'pt-BR'));
  }

  function abrir(o) {
    atual = o;
    config.ultimoId = o.id;
    salvarConfig();
    expandidos.clear();
    renderEditor();
  }

  function adicionar(r, qtd, confirmar) {
    if (!atual) return;
    if (!(qtd > 0)) qtd = 1;
    const chaveItem = it => it.tipo + '|' + (it.codigo || it.descricao);
    let item = atual.itens.find(it => it.tipo !== 'avulso' && chaveItem(it) === chaveItem(r));
    if (item) {
      item.qtd += qtd;
    } else if (r.tipo === 'produto') {
      item = {
        id: novoId(), tipo: 'produto', codigo: r.codigo, descricao: r.descricao, grupo: r.grupo,
        qtd, estrutura: estruturaDe(r.codigo), precoManual: null,
      };
      atual.itens.push(item);
    } else {
      item = {
        id: novoId(), tipo: 'mp', codigo: r.codigo, descricao: r.descricao, descBase: r.descricao,
        un: r.un, qtd, preco: r.preco, ipi: r.ipi, data: r.data, precoManual: null,
      };
      atual.itens.push(item);
    }
    salvar();
    renderItens();
    renderResumo();
    destacar(item.id);
    if (confirmar) avisar(`${r.codigo || r.descricao}: ${qtdFmt(item.qtd)} no custeio nº ${numOrc(atual.numero)}`, 'ok');
  }

  function destacar(id) {
    const tr = $(`#vistaItens tr[data-id="${id}"]`);
    if (!tr) return;
    tr.classList.add('destaque');
    tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setTimeout(() => tr.classList.remove('destaque'), 1300);
  }

  // Traz os preços e estruturas da base atual para o orçamento aberto
  function atualizarPrecos() {
    let naoEncontrados = 0;
    for (const it of atual.itens) {
      if (it.tipo === 'produto') {
        if (base.produtos[it.codigo]) it.estrutura = estruturaDe(it.codigo);
        else naoEncontrados++;
      } else if (it.tipo === 'mp') {
        const m = indiceMps.find(x => (x.codigo || x.descricao) === (it.codigo || it.descBase));
        if (m) Object.assign(it, { preco: m.preco, ipi: m.ipi, data: m.data, un: m.un });
        else naoEncontrados++;
      }
    }
    atual.precosDe = base.importadoEm;
    salvar();
    renderEditor();
    avisar(naoEncontrados
      ? `Preços atualizados. ${naoEncontrados} item(ns) não existem mais na planilha e mantiveram o preço antigo.`
      : 'Preços atualizados com a planilha atual.', 'ok');
  }

  // ============================================================
  // Tela: editor
  // ============================================================

  function renderEditor() {
    if (!atual) return;
    for (const el of $$('#tela-editor [data-campo]')) {
      const k = el.dataset.campo;
      let v = atual[k];
      if (k === 'markup') v = fmtQtd.format(v || 0);
      el.value = v == null ? '' : v;
      el.classList.remove('invalido');
    }
    renderTitulo();
    renderAvisoPrecos();
    renderItens();
    renderResumo();
    $('#statusSalvo').textContent = 'Salvo neste computador';
  }

  function renderTitulo() {
    $('#tituloOrc').textContent = `Custeio nº ${numOrc(atual.numero)}` + (atual.cliente ? ` · ${atual.cliente}` : '');
  }

  function renderAvisoPrecos() {
    const el = $('#avisoPrecos');
    const temCatalogo = atual.itens.some(it => it.tipo !== 'avulso');
    if (!temCatalogo || !atual.precosDe || atual.precosDe === base.importadoEm) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `<span>Este custeio usa os preços da planilha carregada em <strong>${dataBR(atual.precosDe)}</strong>.
      A planilha atual foi carregada em <strong>${dataBR(base.importadoEm)}</strong>.</span>
      <button type="button" class="btn pequeno" data-acao="atualizarPrecos">Atualizar preços</button>`;
  }

  function htmlEstrutura(it) {
    const linhas = it.estrutura.map(r => {
      const total = r[3] * it.qtd;
      return `<tr class="${r[4] ? '' : 'sem-preco'}">
        <td class="codigo">${esc(r[0] || '—')}</td>
        <td>${esc(r[1])}</td>
        <td>${esc(r[2])}</td>
        <td class="num">${qtdFmt(r[3])}</td>
        <td class="num">${qtdFmt(total)}</td>
        <td class="num">${r[4] ? moeda(r[4]) : '<span class="alerta">sem preço</span>'}</td>
        <td class="num">${fmtIpi.format(r[5] || 0)}</td>
        <td class="num">${moeda(total * r[4])}</td>
        <td class="num">${moeda(total * r[4] * (1 + (r[5] || 0)))}</td>
        <td class="num">${dataBR(r[6])}</td>
      </tr>`;
    }).join('');
    const c = custoEstrutura(it.estrutura);
    return `<table class="estrutura">
      <thead><tr>
        <th>Código</th><th>Matéria-prima</th><th>Un</th><th class="num">Qtd / unid.</th><th class="num">Qtd total</th>
        <th class="num">Valor unit.</th><th class="num">IPI</th><th class="num">Total s/ IPI</th><th class="num">Total c/ IPI</th>
        <th class="num">Última compra</th>
      </tr></thead>
      <tbody>${linhas || '<tr><td colspan="10">Produto sem matérias-primas na planilha.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="7">Total para ${qtdFmt(it.qtd)} unidade(s)</td>
        <td class="num">${moeda(c.sem * it.qtd)}</td><td class="num">${moeda(c.com * it.qtd)}</td><td></td></tr></tfoot>
    </table>`;
  }

  const ROTULO_TIPO = { produto: '', mp: 'Matéria-prima', avulso: 'Avulso' };

  // i = posição do item na lista; itens alternam de cor (cor-a / cor-b) e o detalhe acompanha a cor do item
  function htmlLinhaItem(l, i) {
    const it = l.it;
    const aberto = expandidos.has(it.id);
    const cor = i % 2 ? 'cor-b' : 'cor-a';
    const sub = [];
    if (it.grupo) sub.push(esc(it.grupo));
    if (it.tipo === 'mp') sub.push(`${esc(it.un)} · última compra ${dataBR(it.data)}`);
    if (l.c.semPreco) sub.push(`<span class="alerta">⚠ ${l.c.semPreco} matéria(s)-prima(s) sem preço na planilha</span>`);

    const custoUnit = it.tipo === 'avulso'
      ? `<input class="campo-tabela num" data-edita="preco" value="${fmt2.format(it.preco || 0)}" inputmode="decimal" aria-label="Custo unitário">`
      : `<span data-calc="custoUnit">${moeda(l.custoUnit)}</span>`;

    let h = `<tr data-id="${it.id}" class="${cor} ${aberto ? 'aberto' : ''} ${it.precoManual != null ? 'preco-manual' : ''}">
      <td class="col-exp">${it.tipo === 'produto'
        ? `<button type="button" class="btn-icone" data-acao="expandir" aria-expanded="${aberto}" title="Ver matérias-primas">${aberto ? '▾' : '▸'}</button>`
        : ''}</td>
      <td><span class="codigo">${esc(it.codigo || '—')}</span>
        ${ROTULO_TIPO[it.tipo] ? `<br><span class="tag tag-${it.tipo}">${ROTULO_TIPO[it.tipo]}</span>` : ''}</td>
      <td class="desc">
        <textarea class="campo-tabela campo-desc" data-edita="descricao" rows="2" aria-label="Descrição"
          placeholder="${it.tipo === 'avulso' ? 'Descreva o item (ex.: frete, instalação)' : 'Sem descrição na planilha — digite uma'}">${esc(it.descricao)}</textarea>
        ${sub.length ? `<div class="sub">${sub.join(' · ')}</div>` : ''}
      </td>
      <td class="num"><span class="campo-qtd">
        <input class="campo-tabela num" data-edita="qtd" value="${qtdFmt(it.qtd)}" inputmode="decimal" aria-label="Quantidade">
      </span></td>
      <td class="num">${custoUnit}</td>
      <td class="num" data-calc="custoTotal">${moeda(l.custoTotal)}</td>
      <td class="num"><span class="campo-preco">
        <input class="campo-tabela num" data-edita="precoManual" value="${fmt2.format(l.precoUnit)}" inputmode="decimal"
          aria-label="Preço sugerido unitário" title="Calculado como custo × markup. Digite um valor para testar um preço e ver a margem.">
        <button type="button" class="btn-icone" data-acao="precoAuto" title="Voltar ao preço calculado (custo × markup)">↺</button>
      </span></td>
      <td class="num" data-calc="precoTotal">${moeda(l.precoTotal)}</td>
      <td><button type="button" class="btn-icone perigo" data-acao="remover" title="Remover item" aria-label="Remover item">✕</button></td>
    </tr>`;
    if (aberto) h += `<tr class="detalhe ${cor}" data-detalhe="${it.id}"><td colspan="9" class="detalhe-conteudo">${htmlEstrutura(it)}</td></tr>`;
    return h;
  }

  function renderItens() {
    $$('.segmentado [data-vista]').forEach(b => b.classList.toggle('ativa', b.dataset.vista === vista));
    $('#vistaItens').hidden = vista !== 'itens';
    $('#vistaMp').hidden = vista !== 'mp';

    if (vista === 'mp') {
      $('#vistaMp').innerHTML = htmlConsolidado();
      return;
    }
    if (!atual.itens.length) {
      $('#vistaItens').innerHTML = `<div class="vazio">Nenhum item ainda.<br>
        Busque acima um produto pelo código (ex.: <span class="codigo">F900FDGF</span>) ou pela descrição (ex.: <em>churrasqueira</em>).</div>`;
      return;
    }
    const { linhas, t } = calcular(atual);
    $('#vistaItens').innerHTML = `<div class="tabela-rolagem"><table class="tabela itens">
      <thead><tr>
        <th class="col-exp"></th><th>Código</th><th>Descrição</th><th class="num">Qtd</th>
        <th class="num">Custo unit.</th><th class="num">Custo total</th><th class="num">Preço sug. unit.</th><th class="num">Preço sug. total</th><th></th>
      </tr></thead>
      <tbody>${linhas.map(htmlLinhaItem).join('')}</tbody>
      <tfoot><tr><td></td><td colspan="4">${linhas.length} item(ns)</td>
        <td class="num" data-calc="tCusto">${moeda(t.custo)}</td><td></td>
        <td class="num" data-calc="tPreco">${moeda(t.preco)}</td><td></td></tr></tfoot>
    </table></div>
    <p class="nota-tabela">Clique em ▸ para ver as matérias-primas de cada produto. O preço sugerido é custo × markup, só como referência para o orçamento; digite outro valor para testar um preço (fica destacado em amarelo).</p>`;
  }

  function htmlConsolidado() {
    const lista = consolidar(atual);
    if (!lista.length) {
      return `<div class="vazio">Adicione produtos para ver o total de matéria-prima necessária.</div>`;
    }
    let sem = 0, com = 0;
    const linhas = lista.map(m => {
      sem += m.sem;
      com += m.com;
      const unit = m.qtd ? m.sem / m.qtd : 0;
      const varia = m.precos.size > 1;
      return `<tr class="${unit ? '' : 'sem-preco'}">
        <td class="codigo">${esc(m.cod || '—')}</td>
        <td>${esc(m.desc)}</td>
        <td>${esc(m.un)}</td>
        <td class="num">${qtdFmt(m.qtd)}</td>
        <td class="num">${unit ? moeda(unit) + (varia ? ' <span class="alerta" title="A planilha tem preços diferentes para este código em produtos diferentes; este é o valor médio.">(média)</span>' : '') : '<span class="alerta">sem preço</span>'}</td>
        <td class="num">${moeda(m.sem)}</td>
        <td class="num">${moeda(m.com)}</td>
        <td class="num">${dataBR(m.data)}</td>
      </tr>`;
    }).join('');
    const avulsos = atual.itens.filter(it => it.tipo === 'avulso').length;
    return `<div class="tabela-rolagem"><table class="tabela">
      <thead><tr><th>Código</th><th>Matéria-prima</th><th>Un</th><th class="num">Qtd total</th><th class="num">Valor unit.</th>
        <th class="num">Total s/ IPI</th><th class="num">Total c/ IPI</th><th class="num">Última compra</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td colspan="5">${lista.length} matéria(s)-prima(s)</td><td class="num">${moeda(sem)}</td><td class="num">${moeda(com)}</td><td></td></tr></tfoot>
    </table></div>
    <p class="nota-tabela">Soma de todas as matérias-primas dos produtos do custeio, já multiplicadas pelas quantidades.${avulsos ? ` Os ${avulsos} item(ns) avulso(s) não entram nesta lista.` : ''}</p>`;
  }

  // Atualiza só os números (sem redesenhar a tabela, para não perder o campo em edição)
  function atualizarNumeros() {
    const { linhas, t } = calcular(atual);
    const tbody = $('#vistaItens tbody');
    if (tbody && vista === 'itens') {
      for (const l of linhas) {
        const tr = tbody.querySelector(`tr[data-id="${l.it.id}"]`);
        if (!tr) continue;
        const set = (k, v) => { const el = tr.querySelector(`[data-calc="${k}"]`); if (el) el.textContent = v; };
        set('custoUnit', moeda(l.custoUnit));
        set('custoTotal', moeda(l.custoTotal));
        set('precoTotal', moeda(l.precoTotal));
        const ip = tr.querySelector('[data-edita="precoManual"]');
        if (ip && document.activeElement !== ip) ip.value = fmt2.format(l.precoUnit);
        tr.classList.toggle('preco-manual', l.it.precoManual != null);
        if (expandidos.has(l.it.id)) {
          const d = tbody.querySelector(`tr[data-detalhe="${l.it.id}"] .detalhe-conteudo`);
          if (d) d.innerHTML = htmlEstrutura(l.it);
        }
      }
      const tf = $('#vistaItens tfoot');
      if (tf) {
        tf.querySelector('[data-calc="tCusto"]').textContent = moeda(t.custo);
        tf.querySelector('[data-calc="tPreco"]').textContent = moeda(t.preco);
      }
    }
    if (vista === 'mp') $('#vistaMp').innerHTML = htmlConsolidado();
    renderResumo(t);
  }

  function renderResumo(t) {
    t = t || calcular(atual).t;
    $('#rCustoSem').textContent = moeda(t.custoSem);
    $('#rIpi').textContent = moeda(t.ipi);
    $('#rCustoCom').textContent = moeda(t.custoCom);
    $('#rCustoRotulo').textContent = `Custo total (${atual.baseCusto === 'com' ? 'c/' : 's/'} IPI)`;
    $('#rCusto').textContent = moeda(t.custo);
    $('#rPreco').textContent = moeda(t.preco);
    $('#rMargem').textContent = t.preco ? `${moeda(t.margem)} (${fmtPct.format(t.margemPct)})` : '—';
  }

  function ligarEditor() {
    // Campos do cabeçalho e do resumo
    $('#tela-editor').addEventListener('input', e => {
      const el = e.target;
      const k = el.dataset.campo;
      if (!k || !atual) return;
      if (k === 'markup') {
        const v = numero(el.value);
        const ok = v != null && v >= 0;
        el.classList.toggle('invalido', !ok);
        if (!ok) return;
        atual[k] = v;
      } else {
        atual[k] = el.value;
      }
      if (k === 'cliente') renderTitulo();
      if (k === 'markup' || k === 'baseCusto') atualizarNumeros();
      salvar();
    });
    $('#tela-editor').addEventListener('change', e => {
      const k = e.target.dataset.campo;
      if (k === 'baseCusto') { atual.baseCusto = e.target.value; atualizarNumeros(); salvar(); }
      if (k === 'markup' && atual) {
        e.target.value = fmtQtd.format(atual[k] || 0);
        e.target.classList.remove('invalido');
      }
    });

    // Tabela de itens
    const vi = $('#vistaItens');
    vi.addEventListener('input', e => {
      const el = e.target;
      const campo = el.dataset.edita;
      if (!campo) return;
      const it = itemDaLinha(el);
      if (!it) return;
      if (campo === 'descricao') {
        it.descricao = el.value;
      } else if (campo === 'precoManual') {
        if (!el.value.trim()) {
          it.precoManual = null;
        } else {
          const v = numero(el.value);
          el.classList.toggle('invalido', v == null || v < 0);
          if (v == null || v < 0) return;
          it.precoManual = v;
        }
        atualizarNumeros();
      } else {
        const v = numero(el.value);
        el.classList.toggle('invalido', v == null || v < 0);
        if (v == null || v < 0) return;
        it[campo] = v;
        atualizarNumeros();
      }
      salvar();
    });
    vi.addEventListener('change', e => {
      const el = e.target;
      const campo = el.dataset.edita;
      const it = itemDaLinha(el);
      if (!it) return;
      el.classList.remove('invalido');
      if (campo === 'qtd') el.value = qtdFmt(it.qtd);
      if (campo === 'preco') el.value = fmt2.format(it.preco || 0);
      if (campo === 'precoManual') atualizarNumeros();
    });
    vi.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('.campo-tabela')) {
        e.preventDefault();
        e.target.blur();
      }
    });
    vi.addEventListener('click', e => {
      const b = e.target.closest('[data-acao]');
      if (!b) return;
      const it = itemDaLinha(b);
      if (!it) return;
      if (b.dataset.acao === 'expandir') {
        if (expandidos.has(it.id)) expandidos.delete(it.id); else expandidos.add(it.id);
        renderItens();
      } else if (b.dataset.acao === 'remover') {
        atual.itens = atual.itens.filter(x => x !== it);
        expandidos.delete(it.id);
        salvar();
        renderItens();
        renderResumo();
        renderAvisoPrecos();
      } else if (b.dataset.acao === 'precoAuto') {
        it.precoManual = null;
        atualizarNumeros();
        salvar();
      }
    });

    $$('.segmentado [data-vista]').forEach(b => b.addEventListener('click', () => {
      vista = b.dataset.vista;
      renderItens();
    }));

    $('#btnAvulso').addEventListener('click', () => {
      const it = { id: novoId(), tipo: 'avulso', codigo: '', descricao: '', un: 'UN', qtd: 1, preco: 0, precoManual: null };
      atual.itens.push(it);
      vista = 'itens';
      salvar();
      renderItens();
      renderResumo();
      const inp = $(`#vistaItens tr[data-id="${it.id}"] [data-edita="descricao"]`);
      if (inp) inp.focus();
    });

    $('#tela-editor').addEventListener('click', e => {
      const b = e.target.closest('[data-acao]');
      if (!b || b.closest('#vistaItens')) return;
      const acao = b.dataset.acao;
      if (acao === 'atualizarPrecos') atualizarPrecos();
      else if (acao === 'imprimir') imprimir();
      else if (acao === 'exportarExcel') exportarExcel(b);
      else if (acao === 'duplicar') duplicar(atual);
      else if (acao === 'excluir') excluir(atual);
    });

    ligarBusca();
  }

  function itemDaLinha(el) {
    const tr = el.closest('tr[data-id]');
    return tr && atual.itens.find(it => it.id === tr.dataset.id);
  }

  // ---------- busca ----------
  function ligarBusca() {
    const busca = $('#busca');
    const caixa = $('#resultados');
    const qtdNova = $('#qtdNova');
    let resultados = [];
    let sel = 0;
    const LIMITE = 40;

    const fechar = () => { caixa.hidden = true; };

    function render() {
      if (!busca.value.trim()) { fechar(); return; }
      caixa.hidden = false;
      if (!resultados.length) {
        caixa.innerHTML = `<div class="res-vazio">Nada encontrado para “${esc(busca.value)}”.</div>`;
        return;
      }
      const vis = resultados.slice(0, LIMITE);
      caixa.innerHTML = vis.map((r, i) => {
        const custo = r.tipo === 'produto'
          ? `custo ${moeda(r.custo.sem)}<br>${r.n} matéria(s)-prima(s)`
          : `${moeda(r.preco)} / ${esc(r.un)}`;
        const tag = r.tipo === 'produto'
          ? (r.grupo ? `<span class="tag">${esc(r.grupo)}</span>` : '')
          : '<span class="tag tag-mp">Matéria-prima</span>';
        return `<div class="res ${i === sel ? 'sel' : ''}" data-i="${i}" role="option" aria-selected="${i === sel}">
          <div class="linha1"><span class="codigo">${esc(r.codigo || '—')}</span>${tag}</div>
          <div class="desc">${esc(r.descricao) || '<em>sem descrição na planilha</em>'}</div>
          <div class="custo">${custo}</div>
        </div>`;
      }).join('') + (resultados.length > LIMITE
        ? `<div class="res-mais">Mostrando ${LIMITE} de ${resultados.length}. Digite mais para refinar.</div>` : '');
      const s = caixa.querySelector('.res.sel');
      if (s) s.scrollIntoView({ block: 'nearest' });
    }

    function escolher(i) {
      const r = resultados[i];
      if (!r) return;
      const q = numero(qtdNova.value);
      adicionar(r, q && q > 0 ? q : 1);
      busca.value = '';
      qtdNova.value = '1';
      resultados = [];
      fechar();
      busca.focus();
    }

    busca.addEventListener('input', () => {
      resultados = buscar(busca.value);
      sel = 0;
      render();
    });
    busca.addEventListener('focus', () => { if (busca.value.trim()) render(); });
    busca.addEventListener('blur', () => setTimeout(fechar, 150));
    busca.addEventListener('keydown', e => {
      const max = Math.min(resultados.length, LIMITE) - 1;
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, max); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); render(); e.preventDefault(); }
      else if (e.key === 'Enter') { escolher(sel); e.preventDefault(); }
      else if (e.key === 'Escape') fechar();
    });
    qtdNova.addEventListener('keydown', e => {
      if (e.key === 'Enter' && resultados.length) { escolher(sel); e.preventDefault(); }
    });
    caixa.addEventListener('mousedown', e => {
      const el = e.target.closest('[data-i]');
      if (!el) return;
      e.preventDefault();
      escolher(Number(el.dataset.i));
    });
  }

  // ---------- ações do orçamento ----------
  function duplicar(o) {
    const copia = JSON.parse(JSON.stringify(o));
    const agora = new Date().toISOString();
    Object.assign(copia, { id: novoId(), numero: config.proximoNumero++, criadoEm: agora, atualizadoEm: agora, data: hoje() });
    copia.itens.forEach(it => { it.id = novoId(); });
    orcs.unshift(copia);
    salvarConfig();
    salvarAgora();
    abrir(copia);
    mostrarTela('editor');
    avisar(`Cópia criada: custeio nº ${numOrc(copia.numero)}`, 'ok');
  }

  function excluir(o) {
    const nome = `nº ${numOrc(o.numero)}${o.cliente ? ' (' + o.cliente + ')' : ''}`;
    if (!confirm(`Excluir o custeio ${nome}? Isso não pode ser desfeito.`)) return;
    orcs = orcs.filter(x => x !== o);
    salvarAgora();
    if (atual === o) abrir(orcs[0] || criarOrcamento());
    if (!$('#tela-lista').hidden) renderLista();
    avisar(`Custeio ${nome} excluído.`);
  }

  // ---------- impressão ----------
  // Relatório de custeio (documento interno). detalhar = incluir as matérias-primas de cada produto.
  function htmlImpressao(detalhar) {
    const o = atual;
    const { linhas, t } = calcular(o);
    const ipi = o.baseCusto === 'com' ? 'c/' : 's/';
    const cli = [['Cliente', o.cliente], ['Obra / projeto', o.obra], ['Contato', o.contato]]
      .filter(([, v]) => v)
      .map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('');

    const itens = linhas.map((l, i) => `<tr>
      <td>${i + 1}</td>
      <td>${esc(l.it.codigo)}</td>
      <td>${esc(l.it.descricao || l.it.codigo)}</td>
      <td class="num">${qtdFmt(l.it.qtd)}${l.it.tipo !== 'produto' && l.it.un ? ' ' + esc(l.it.un) : ''}</td>
      <td class="num">${moeda(l.custoUnit)}</td>
      <td class="num">${moeda(l.custoTotal)}</td>
      <td class="num">${moeda(l.precoUnit)}</td>
      <td class="num">${moeda(l.precoTotal)}</td>
    </tr>`).join('');

    let h = `<div class="imp-cabecalho">
      <div class="imp-marca">
        <img src="img/logo.png" alt="" class="imp-logo">
        <div>
          <div class="imp-empresa">Relatório de custeio</div>
          <div class="imp-app">ObraCusto</div>
          <div class="imp-interno">Uso interno</div>
        </div>
      </div>
      <div class="imp-num">
        <div class="imp-titulo">Custeio nº ${numOrc(o.numero)}</div>
        <div>Data: ${dataBR(o.data)}</div>
        <div>Preços da planilha de ${dataBR(o.precosDe)}</div>
      </div>
    </div>
    ${cli ? `<table class="imp-cliente">${cli}</table>` : ''}
    <table class="imp-tabela">
      <thead><tr><th>#</th><th>Código</th><th>Descrição</th><th class="num">Qtd</th>
        <th class="num">Custo unit.</th><th class="num">Custo total</th>
        <th class="num">Preço sug. unit.</th><th class="num">Preço sug. total</th></tr></thead>
      <tbody>${itens || '<tr><td colspan="8">Sem itens.</td></tr>'}</tbody>
    </table>
    <table class="imp-totais">
      <tr><td>Custo s/ IPI</td><td class="num">${moeda(t.custoSem)}</td></tr>
      <tr><td>IPI</td><td class="num">${moeda(t.ipi)}</td></tr>
      <tr><td>Custo c/ IPI</td><td class="num">${moeda(t.custoCom)}</td></tr>
      <tr class="total"><td>Custo total (${ipi} IPI)</td><td class="num">${moeda(t.custo)}</td></tr>
    </table>
    <table class="imp-totais imp-pequena">
      <tr><td>Markup de referência</td><td class="num">× ${fmtQtd.format(o.markup)}</td></tr>
      <tr class="destaque"><td>Preço sugerido</td><td class="num">${moeda(t.preco)}</td></tr>
      <tr><td>Margem sobre o preço</td><td class="num">${moeda(t.margem)} (${fmtPct.format(t.margemPct)})</td></tr>
    </table>`;

    const produtos = o.itens.filter(it => it.tipo === 'produto');
    if (detalhar && produtos.length) {
      h += `<div class="imp-secao">Matérias-primas por produto</div>` + produtos.map(it => `
        <div class="imp-produto-titulo">${esc(it.codigo)} — ${esc(it.descricao)} · ${qtdFmt(it.qtd)} un. · custo unit. ${moeda(custoEstrutura(it.estrutura).sem)} s/ IPI</div>
        <table class="imp-tabela imp-pequena">
          <thead><tr><th>Código</th><th>Matéria-prima</th><th>Un</th><th class="num">Qtd / unid.</th><th class="num">Qtd total</th>
            <th class="num">Valor unit.</th><th class="num">Total s/ IPI</th></tr></thead>
          <tbody>${it.estrutura.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td>
            <td class="num">${qtdFmt(r[3])}</td><td class="num">${qtdFmt(r[3] * it.qtd)}</td>
            <td class="num">${r[4] ? moeda(r[4]) : 'sem preço'}</td><td class="num">${moeda(r[3] * it.qtd * r[4])}</td></tr>`).join('')}</tbody>
        </table>`).join('');
    }

    const mps = consolidar(o);
    if (mps.length) {
      h += `<div class="imp-secao">Matéria-prima total</div>
      <table class="imp-tabela imp-pequena">
        <thead><tr><th>Código</th><th>Matéria-prima</th><th>Un</th><th class="num">Qtd total</th><th class="num">Valor unit.</th><th class="num">Total s/ IPI</th><th class="num">Total c/ IPI</th></tr></thead>
        <tbody>${mps.map(m => `<tr><td>${esc(m.cod)}</td><td>${esc(m.desc)}</td><td>${esc(m.un)}</td>
          <td class="num">${qtdFmt(m.qtd)}</td><td class="num">${moeda(m.qtd ? m.sem / m.qtd : 0)}</td>
          <td class="num">${moeda(m.sem)}</td><td class="num">${moeda(m.com)}</td></tr>`).join('')}</tbody>
      </table>`;
    }

    if (o.obs) h += `<div class="imp-secao">Observações internas</div><div class="imp-obs">${esc(o.obs)}</div>`;
    h += `<div class="imp-rodape">ObraCusto · Emitido em ${dataBR(hoje())} · Documento interno de custeio, não enviar ao cliente</div>`;
    return h;
  }

  async function imprimir() {
    if (!atual.itens.length) { avisar('Adicione itens antes de imprimir.', 'erro'); return; }
    $('#impressao').innerHTML = htmlImpressao($('#impDetalhe').checked);
    // Espera o ícone do cabeçalho carregar, senão ele sai em branco na impressão
    await Promise.all($$('#impressao img').map(img => (img.complete ? null : new Promise(ok => { img.onload = img.onerror = ok; }))));
    const titulo = document.title;
    document.title = `ObraCusto - Custeio ${numOrc(atual.numero)}${atual.cliente ? ' - ' + atual.cliente : ''}`;
    window.print();
    document.title = titulo;
  }

  // ---------- exportação para Excel no formato do Modelo.xlsx ----------
  // Um bloco por produto (como no Modelo.xlsx); matérias-primas avulsas e itens avulsos vão
  // juntos num bloco "OUTROS ITENS". Peso e dimensões ficam em branco para preencher no Excel.
  async function exportarExcel(botao) {
    const o = atual;
    if (!o.itens.length) { avisar('Adicione itens antes de exportar.', 'erro'); return; }
    botao.disabled = true;
    try {
      const JSZip = await carregarScript('lib/jszip.min.js', 'JSZip');
      const blocos = o.itens.filter(it => it.tipo === 'produto').map(it => ({
        ref: it.codigo,
        descricao: it.descricao,
        qtd: it.qtd,
        itens: it.estrutura.map(r => ({ codigo: r[0], descricao: r[1], un: r[2], qtd: r[3], preco: r[4], ipi: r[5], data: r[6] })),
      }));
      const outros = o.itens.filter(it => it.tipo !== 'produto');
      if (outros.length) {
        blocos.push({
          ref: '',
          descricao: 'OUTROS ITENS (matérias-primas avulsas e custos extras)',
          qtd: 1,
          itens: outros.map(it => ({
            codigo: it.codigo, descricao: it.descricao, un: it.un, qtd: it.qtd,
            preco: it.preco || 0, ipi: it.ipi || 0, data: it.data || '',
          })),
        });
      }
      const nome = [o.cliente, o.obra].filter(Boolean).join(' – ') || `Nº ${numOrc(o.numero)}`;
      const arquivo = await window.ExportarModelo.gerar(JSZip, window.MODELO_XLSX, {
        titulo: `CUSTEIO "${nome.toUpperCase()}"`,
        blocos,
        totalGeral: true,
      }, 'blob');
      const nomeArquivo = `Custeio ${numOrc(o.numero)}${o.cliente ? ' - ' + o.cliente : ''}`.replace(/[\\/:*?"<>|]+/g, ' ').trim();
      baixar(nomeArquivo + '.xlsx', arquivo);
    } catch (e) {
      avisar('Não consegui gerar a planilha: ' + e.message, 'erro');
    } finally {
      botao.disabled = false;
    }
  }

  // ============================================================
  // Tela: lista de orçamentos
  // ============================================================

  function renderLista() {
    const q = normal($('#filtroLista').value).trim();
    const lista = orcs
      .filter(o => !q || normal(`${numOrc(o.numero)} ${o.cliente} ${o.obra}`).includes(q))
      .sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''));
    if (!lista.length) {
      $('#lista').innerHTML = `<div class="vazio">${orcs.length ? 'Nenhum custeio com esse filtro.' : 'Nenhum custeio salvo ainda.'}</div>`;
      return;
    }
    $('#lista').innerHTML = `<div class="tabela-rolagem"><table class="tabela lista">
      <thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Obra / projeto</th><th class="num">Itens</th><th class="num">Custo total</th><th class="num">Preço sugerido</th><th>Alterado em</th><th></th></tr></thead>
      <tbody>${lista.map(o => {
        const { t } = calcular(o);
        return `<tr data-orc="${o.id}" class="${o === atual ? 'atual' : ''}">
        <td class="codigo">${numOrc(o.numero)}</td>
        <td>${dataBR(o.data)}</td>
        <td>${esc(o.cliente) || '<span class="alerta">sem cliente</span>'}</td>
        <td>${esc(o.obra)}</td>
        <td class="num">${o.itens.length}</td>
        <td class="num">${moeda(t.custo)}</td>
        <td class="num">${moeda(t.preco)}</td>
        <td>${dataBR(o.atualizadoEm)}</td>
        <td class="acoes">
          <button type="button" class="btn pequeno" data-acao="abrir">Abrir</button>
          <button type="button" class="btn pequeno" data-acao="duplicar">Duplicar</button>
          <button type="button" class="btn-icone perigo" data-acao="excluir" title="Excluir" aria-label="Excluir">✕</button>
        </td>
      </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }

  function ligarLista() {
    $('#filtroLista').addEventListener('input', renderLista);
    $('#lista').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-orc]');
      if (!tr) return;
      const o = orcs.find(x => x.id === tr.dataset.orc);
      if (!o) return;
      const b = e.target.closest('[data-acao]');
      const acao = b ? b.dataset.acao : 'abrir';
      if (acao === 'abrir') { abrir(o); mostrarTela('editor'); }
      else if (acao === 'duplicar') duplicar(o);
      else if (acao === 'excluir') excluir(o);
    });

    $('#btnBackup').addEventListener('click', () => {
      salvarAgora();
      const dados = { app: 'orcamentos', versao: 1, exportadoEm: new Date().toISOString(), orcamentos: orcs, config };
      baixar(`custeios-backup-${hoje()}.json`, JSON.stringify(dados, null, 1), 'application/json');
    });
    $('#btnRestaurar').addEventListener('click', () => $('#arquivoBackup').click());
    $('#arquivoBackup').addEventListener('change', async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const dados = JSON.parse(await f.text());
        if (!dados || !Array.isArray(dados.orcamentos)) throw new Error('arquivo não é uma cópia deste app');
        // Descarta orçamentos em branco (criados automaticamente) para não duplicar numeração
        orcs = orcs.filter(o => o.itens.length || o.cliente || o.obra || o.obs);
        let novos = 0, substituidos = 0;
        for (const o of dados.orcamentos) {
          const i = orcs.findIndex(x => x.id === o.id);
          if (i >= 0) { orcs[i] = o; substituidos++; } else { orcs.push(o); novos++; }
        }
        const maior = Math.max(0, ...orcs.map(o => o.numero || 0));
        config.proximoNumero = Math.max(config.proximoNumero, maior + 1);
        salvarConfig();
        salvarAgora();
        abrir(orcs.find(o => atual && o.id === atual.id) || orcs[0] || criarOrcamento());
        renderLista();
        avisar(`Cópia importada: ${novos} novo(s), ${substituidos} atualizado(s).`, 'ok');
      } catch (err) {
        avisar('Não consegui importar: ' + err.message, 'erro');
      }
    });
  }

  // ============================================================
  // Tela: base de preços
  // ============================================================

  function renderBase() {
    const produtos = Object.keys(base.produtos).length;
    const semDesc = indiceProdutos.filter(p => !p.descricao).length;
    const comSemPreco = indiceProdutos.filter(p => p.custo.semPreco).length;
    const hora = base.importadoEm ? new Date(base.importadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    $('#infoBase').innerHTML = `<dl class="info-base">
      <dt>Origem</dt><dd>${esc(base.arquivo) || '—'}</dd>
      <dt>Carregada em</dt><dd>${dataBR(base.importadoEm)}${hora ? ' às ' + hora : ''}${baseCarregadaNoApp ? '' : ' (base que veio com o app)'}</dd>
      <dt>Produtos</dt><dd>${produtos.toLocaleString('pt-BR')}</dd>
      <dt>Matérias-primas</dt><dd>${indiceMps.length.toLocaleString('pt-BR')}</dd>
      <dt>Sem descrição</dt><dd>${semDesc} produto(s) não têm descrição nas abas Aux / IR_Produção</dd>
      <dt>Sem preço</dt><dd>${comSemPreco} produto(s) usam alguma matéria-prima sem preço de compra</dd>
    </dl>`;
    $('#btnBaseOriginal').hidden = !baseCarregadaNoApp || !window.BASE_PADRAO;

    for (const el of $$('[data-config]')) {
      const k = el.dataset.config;
      el.value = k === 'markupPadrao' ? fmtQtd.format(config[k]) : config[k];
    }

    // Login Google só funciona com o app aberto pelo atalho (http://localhost:8765)
    const arquivoLocal = location.protocol === 'file:';
    $('#avisoArquivoLocal').hidden = !arquivoLocal;
    if (!config.googleClientId) $('#configGoogle').open = true;
    if (!arquivoLocal && config.googleClientId) window.PlanilhaGoogle.carregarGis().catch(() => {});

    const sel = $('#grupoCatalogo');
    const grupos = Array.from(new Set(indiceProdutos.map(p => p.grupo).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const atualG = sel.value;
    sel.innerHTML = '<option value="">Todos os grupos</option>' + grupos.map(g => `<option>${esc(g)}</option>`).join('');
    sel.value = grupos.includes(atualG) ? atualG : '';
    renderCatalogo();
  }

  const abertosCatalogo = new Set();

  function renderCatalogo() {
    const q = normal($('#filtroCatalogo').value).trim();
    const termos = q ? q.split(/\s+/) : [];
    const g = $('#grupoCatalogo').value;
    const soSemPreco = $('#soSemPreco').checked;
    const lista = indiceProdutos
      .filter(p => (!g || p.grupo === g) && (!soSemPreco || p.custo.semPreco) && termos.every(t => p.busca.includes(t)))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
    const LIM = 200;
    if (!lista.length) { $('#catalogo').innerHTML = '<div class="vazio">Nenhum produto encontrado.</div>'; return; }
    $('#catalogo').innerHTML = `<div class="tabela-rolagem"><table class="tabela catalogo">
      <thead><tr><th class="col-exp"></th><th>Código</th><th>Descrição</th><th>Grupo</th><th class="num">Matérias-primas</th>
        <th class="num">Custo s/ IPI</th><th class="num">Custo c/ IPI</th><th></th></tr></thead>
      <tbody>${lista.slice(0, LIM).map(p => {
        const aberto = abertosCatalogo.has(p.codigo);
        return `<tr class="linha-produto" data-sku="${esc(p.codigo)}">
          <td class="col-exp">${aberto ? '▾' : '▸'}</td>
          <td class="codigo">${esc(p.codigo)}</td>
          <td>${esc(p.descricao) || '<span class="alerta">sem descrição</span>'}
            ${p.custo.semPreco ? `<div class="alerta">⚠ ${p.custo.semPreco} sem preço</div>` : ''}</td>
          <td>${esc(p.grupo)}</td>
          <td class="num">${p.n}</td>
          <td class="num">${moeda(p.custo.sem)}</td>
          <td class="num">${moeda(p.custo.com)}</td>
          <td><button type="button" class="btn pequeno" data-acao="addCatalogo">+ Custeio</button></td>
        </tr>${aberto ? `<tr class="detalhe"><td colspan="8">${htmlEstrutura({ estrutura: estruturaDe(p.codigo), qtd: 1 })}</td></tr>` : ''}`;
      }).join('')}</tbody>
    </table></div>
    <p class="nota-tabela">${lista.length > LIM ? `Mostrando ${LIM} de ${lista.length} produtos. Use o filtro para encontrar os demais.` : `${lista.length} produto(s).`}</p>`;
  }

  // Carrega uma biblioteca da pasta lib/ só quando ela for usada
  async function carregarScript(src, global) {
    if (window[global]) return window[global];
    await new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => falha(new Error(`não encontrei o arquivo ${src} na pasta do app`));
      document.head.appendChild(s);
    });
    return window[global];
  }

  // Passa a usar a base recém-lida (do arquivo .xlsx ou do Google)
  function aplicarBaseNova(nova, status) {
    const n = Object.keys(nova.produtos).length;
    if (!n) throw new Error('nenhum produto encontrado na aba BD_Estruturas');
    if (!gravar(CHAVES.base, nova)) throw new Error('o navegador não deixou salvar a base');
    base = nova;
    baseCarregadaNoApp = true;
    montarIndice();
    renderBase();
    if (atual) renderAvisoPrecos();
    status.className = 'status-import ok';
    status.textContent = `Pronto: ${n} produtos e ${indiceMps.length} matérias-primas carregados. Os novos itens já usam estes preços; custeios antigos podem ser atualizados pelo aviso no topo do custeio.`;
  }

  async function importarPlanilha(arquivo) {
    const status = $('#statusImport');
    const botao = $('#btnImportar');
    status.className = 'status-import';
    status.textContent = `Lendo “${arquivo.name}”… isso leva alguns segundos.`;
    botao.disabled = true;
    await new Promise(r => setTimeout(r, 50));
    try {
      const XLSX = await carregarScript('lib/xlsx.full.min.js', 'XLSX');
      aplicarBaseNova(window.ImportarPlanilha.importar(XLSX, await arquivo.arrayBuffer(), arquivo.name), status);
    } catch (e) {
      status.className = 'status-import erro';
      status.textContent = 'Não consegui ler a planilha: ' + e.message;
    } finally {
      botao.disabled = false;
    }
  }

  async function atualizarDoGoogle() {
    const status = $('#statusGoogle');
    if (location.protocol === 'file:') {
      status.className = 'status-import erro';
      status.textContent = 'Para entrar com a conta Google, abra o app pelo atalho “ObraCusto” (ou “Abrir ObraCusto.bat”), na pasta do app.';
      return;
    }
    if (!config.googleClientId.trim()) {
      $('#configGoogle').open = true;
      $('[data-config="googleClientId"]').focus();
      status.className = 'status-import erro';
      status.textContent = 'Falta colar o ID do cliente OAuth. Siga os passos da configuração inicial abaixo do botão.';
      return;
    }
    const botao = $('#btnGoogle');
    botao.disabled = true;
    status.className = 'status-import';
    try {
      aplicarBaseNova(await window.PlanilhaGoogle.ler({
        clientId: config.googleClientId.trim(),
        planilha: config.googlePlanilha,
        importador: window.ImportarPlanilha,
        aoAndar: t => { status.textContent = t; },
      }), status);
    } catch (e) {
      status.className = 'status-import erro';
      status.textContent = 'Não consegui ler a planilha do Google: ' + e.message;
    } finally {
      botao.disabled = false;
    }
  }

  function ligarBase() {
    $('#btnGoogle').addEventListener('click', atualizarDoGoogle);
    $('#btnImportar').addEventListener('click', () => $('#arquivoXlsx').click());
    $('#arquivoXlsx').addEventListener('change', e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) importarPlanilha(f);
    });
    $('#btnBaseOriginal').addEventListener('click', () => {
      if (!confirm('Voltar a usar a base que veio com o app? A planilha carregada será descartada.')) return;
      try { localStorage.removeItem(CHAVES.base); } catch (e) { /* sem acesso ao armazenamento */ }
      base = carregarBase();
      montarIndice();
      renderBase();
      $('#statusImport').textContent = '';
      $('#statusGoogle').textContent = '';
      avisar('Usando a base original.', 'ok');
    });

    $('#tela-base').addEventListener('input', e => {
      const k = e.target.dataset.config;
      if (!k) return;
      if (k === 'markupPadrao') {
        const v = numero(e.target.value);
        e.target.classList.toggle('invalido', v == null || v < 0);
        if (v == null || v < 0) return;
        config[k] = v;
      } else {
        config[k] = e.target.value;
      }
      salvarConfig();
    });
    $('#tela-base').addEventListener('change', e => {
      const k = e.target.dataset.config;
      if (k === 'baseCustoPadrao') { config[k] = e.target.value; salvarConfig(); }
    });

    $('#filtroCatalogo').addEventListener('input', renderCatalogo);
    $('#grupoCatalogo').addEventListener('change', renderCatalogo);
    $('#soSemPreco').addEventListener('change', renderCatalogo);
    $('#catalogo').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-sku]');
      if (!tr) return;
      const sku = tr.dataset.sku;
      if (e.target.closest('[data-acao="addCatalogo"]')) {
        const p = indiceProdutos.find(x => x.codigo === sku);
        if (p && atual) adicionar(p, 1, true);
        return;
      }
      if (abertosCatalogo.has(sku)) abertosCatalogo.delete(sku); else abertosCatalogo.add(sku);
      renderCatalogo();
    });
  }

  // ============================================================
  // Navegação e início
  // ============================================================

  function mostrarTela(nome) {
    for (const s of $$('.tela')) s.hidden = s.id !== 'tela-' + nome;
    $$('.abas [data-tela]').forEach(b => b.classList.toggle('ativa', b.dataset.tela === nome));
    if (nome === 'lista') renderLista();
    if (nome === 'base') renderBase();
    if (nome === 'editor') renderEditor();
    window.scrollTo(0, 0);
  }

  // Aberto pelo atalho (http://localhost), avisa o servidor local a cada 30 s que o app está em uso.
  // Quando todas as janelas do app fecham, os avisos param e o servidor se encerra sozinho (servidor.py).
  // No site publicado (GitHub Pages) não há servidor local, então não faz nada.
  function manterServidor() {
    if (location.protocol !== 'http:' || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    const faixa = $('#avisoServidor');
    const sinal = () => fetch('/__vivo', { cache: 'no-store' })
      .then(() => { faixa.hidden = true; })
      .catch(() => { faixa.hidden = false; });
    sinal();
    setInterval(sinal, 30000);
  }

  function iniciar() {
    manterServidor();
    base = carregarBase();
    montarIndice();

    $$('.abas [data-tela]').forEach(b => b.addEventListener('click', () => mostrarTela(b.dataset.tela)));
    $('#btnNovo').addEventListener('click', () => {
      salvarAgora();
      abrir(criarOrcamento());
      salvarAgora();
      mostrarTela('editor');
      $('[data-campo="cliente"]').focus();
    });

    ligarEditor();
    ligarLista();
    ligarBase();

    const ultimo = orcs.find(o => o.id === config.ultimoId) || orcs[0];
    if (ultimo) abrir(ultimo);
    else { abrir(criarOrcamento()); salvarAgora(); }

    // Primeiro acesso (ex.: no site publicado, que não traz preços embutidos): vai direto para a base
    if (!Object.keys(base.produtos).length) {
      mostrarTela('base');
      const status = $('#statusGoogle');
      status.className = 'status-import';
      status.textContent = 'Para começar, clique em “Atualizar da planilha do Google” e entre com a sua conta da empresa.';
    }
  }

  iniciar();
})();

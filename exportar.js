/*
 * Gera a planilha de custeio (.xlsx) no formato do Modelo.xlsx.
 *
 * O próprio modelo (embutido em modelo.js) é a base do arquivo: as linhas 15 a 26 dele (o 2º bloco)
 * servem de molde para cada produto, e cada célula gerada reaproveita a formatação da célula
 * correspondente do modelo. Assim cores, bordas, fontes e formatos ficam iguais aos do modelo.
 *
 * Funciona no navegador (window.ExportarModelo) e no Node (module.exports).
 */
(function (raiz) {
  'use strict';

  const ABA = 'xl/worksheets/sheet1.xml';

  // Linhas do Modelo.xlsx usadas como molde
  const MOLDE = {
    titulo1: 1,
    titulo2: 2,
    separador: 15, // faixa cinza + "Quantidade:" na coluna K
    cabecalho: 16, // REF | Produto | Peso Liq. Kg | L x A x P (mm) + quantidade na coluna K
    produto: 17,
    rotulos: 18,   // s/IPI | Com IPI
    subtotal: 19,
    branco: 20,
    cabTabela: 21, // Codigo | Descrição | Ultima Compra | ...
    item: 22,
    vao1: 25,      // linhas em branco entre um bloco e outro
    vao2: 26,
  };

  const COLUNAS = 'ABCDEFGHIJK';

  // No modelo, F, G e H têm a largura padrão: cabeçalhos ficam cortados e valores acima de
  // R$ 1.000 aparecem como #####. Aqui elas ficam um pouco mais largas.
  const LARGURAS = { 6: 11.5, 7: 11.5, 8: 15.7 };

  // O "% IPI" do modelo usa o formato 0% (6,5% aparece como 7%). Cria uma cópia do estilo da
  // célula com o formato 0,00% e devolve o índice do novo estilo.
  function estiloIpiComDecimais(stylesXml, indice) {
    const m = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
    if (!m) return null;
    const xfs = m[2].match(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || [];
    if (!xfs[indice]) return null;
    const novo = xfs[indice]
      .replace(/numFmtId="\d+"/, 'numFmtId="10"')
      .replace(/<xf (?![^>]*applyNumberFormat)/, '<xf applyNumberFormat="1" ');
    const novoIndice = xfs.length;
    const xml = stylesXml.replace(m[0], `<cellXfs count="${novoIndice + 1}">${m[2]}${novo}</cellXfs>`);
    return { xml, indice: novoIndice };
  }

  function ajustarColunas(xml) {
    return xml.replace(/<cols>([\s\S]*?)<\/cols>/, (m, dentro) => {
      const inicio = c => +(/min="(\d+)"/.exec(c) || [0, 0])[1];
      const cols = (dentro.match(/<col [^>]*\/>/g) || []).filter(c => {
        const max = +(/max="(\d+)"/.exec(c) || [0, 0])[1];
        return !Object.keys(LARGURAS).some(n => n >= inicio(c) && n <= max);
      });
      for (const [n, w] of Object.entries(LARGURAS)) cols.push(`<col min="${n}" max="${n}" width="${w}" customWidth="1"/>`);
      cols.sort((a, b) => inicio(a) - inicio(b));
      return `<cols>${cols.join('')}</cols>`;
    });
  }

  function escXml(s) {
    return String(s == null ? '' : s)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // "AAAA-MM-DD" -> número de série de data do Excel
  function serialData(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return '';
    return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  // { numeroDaLinha: { attrs, celulas: [{ col, attrs, conteudo }] } }
  function lerLinhas(xml) {
    const linhas = {};
    const reLinha = /<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g;
    let m;
    while ((m = reLinha.exec(xml))) {
      const celulas = [];
      const reCel = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let c;
      while ((c = reCel.exec(m[3]))) celulas.push({ col: c[1], attrs: c[2], conteudo: c[3] });
      linhas[m[1]] = { attrs: m[2], celulas };
    }
    return linhas;
  }

  // valor: texto, número, '' (célula vazia) ou { f: fórmula, v: valor já calculado }
  function celula(ref, estilo, valor) {
    const s = estilo ? ` s="${estilo}"` : '';
    if (valor == null || valor === '' || (typeof valor === 'number' && !isFinite(valor))) return `<c r="${ref}"${s}/>`;
    if (typeof valor === 'number') return `<c r="${ref}"${s}><v>${valor}</v></c>`;
    if (typeof valor === 'object') {
      const v = typeof valor.v === 'number' && isFinite(valor.v) ? `<v>${valor.v}</v>` : '';
      return `<c r="${ref}"${s}><f>${escXml(valor.f)}</f>${v}</c>`;
    }
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escXml(valor)}</t></is></c>`;
  }

  // Copia uma linha do modelo para a linha r, trocando o conteúdo das colunas em `valores`
  function linha(molde, r, valores) {
    valores = valores || {};
    const cels = molde.celulas.map(c => {
      const ref = c.col + r;
      if (Object.prototype.hasOwnProperty.call(valores, c.col)) {
        const estilo = (c.attrs.match(/\bs="(\d+)"/) || [])[1];
        return { col: c.col, xml: celula(ref, estilo, valores[c.col]) };
      }
      return { col: c.col, xml: c.conteudo == null ? `<c r="${ref}"${c.attrs}/>` : `<c r="${ref}"${c.attrs}>${c.conteudo}</c>` };
    });
    for (const col of Object.keys(valores)) {
      if (!molde.celulas.some(c => c.col === col)) cels.push({ col, xml: celula(col + r, null, valores[col]) });
    }
    cels.sort((a, b) => COLUNAS.indexOf(a.col) - COLUNAS.indexOf(b.col));
    return `<row r="${r}"${molde.attrs}>${cels.map(c => c.xml).join('')}</row>`;
  }

  /**
   * @param JSZip        biblioteca JSZip
   * @param modeloBase64 conteúdo do Modelo.xlsx em base64
   * @param dados {
   *   titulo,
   *   blocos: [{ ref, descricao, qtd, peso, dimensoes,
   *              itens: [{ codigo, descricao, data: 'AAAA-MM-DD', un, qtd (por unidade), preco, ipi }] }],
   *   totalGeral: true para acrescentar a linha de total no fim
   * }
   * @param tipoSaida 'blob' (navegador) ou 'nodebuffer' (Node)
   */
  async function gerar(JSZip, modeloBase64, dados, tipoSaida) {
    const zip = await JSZip.loadAsync(modeloBase64, { base64: true });
    const xml = await zip.file(ABA).async('string');
    const ini = xml.indexOf('<sheetData>');
    const fim = xml.indexOf('</sheetData>');
    if (ini < 0 || fim < 0) throw new Error('o modelo não tem a planilha esperada');
    const moldes = lerLinhas(xml.slice(ini, fim));
    const M = nome => {
      const l = moldes[MOLDE[nome]];
      if (!l) throw new Error(`a linha ${MOLDE[nome]} do modelo não foi encontrada`);
      return l;
    };

    const celIpi = M('item').celulas.find(c => c.col === 'I');
    const estiloIpi = celIpi && (celIpi.attrs.match(/\bs="(\d+)"/) || [])[1];
    if (estiloIpi) {
      const estilos = await zip.file('xl/styles.xml').async('string');
      const ipi = estiloIpiComDecimais(estilos, +estiloIpi);
      if (ipi) {
        zip.file('xl/styles.xml', ipi.xml);
        celIpi.attrs = celIpi.attrs.replace(/\bs="\d+"/, `s="${ipi.indice}"`);
      }
    }

    const saida = [];
    const mesclas = ['B1:J2'];
    const subtotais = [];

    saida.push(linha(M('titulo1'), 1, { B: dados.titulo }));
    saida.push(linha(M('titulo2'), 2));

    let r = 3;
    for (const b of dados.blocos) {
      const rCab = r + 1, rProd = r + 2, rSub = r + 4, rItem1 = r + 7;
      const itens = b.itens.length ? b.itens : [null];
      const rItemN = rItem1 + itens.length - 1;

      saida.push(linha(M('separador'), r));
      saida.push(linha(M('cabecalho'), rCab, { K: b.qtd }));
      saida.push(linha(M('produto'), rProd, { B: b.ref, C: b.descricao, E: b.peso == null ? '' : b.peso, G: b.dimensoes || '' }));
      saida.push(linha(M('rotulos'), r + 3));

      let somaSem = 0, somaCom = 0;
      const linhasItens = itens.map((it, i) => {
        const ri = rItem1 + i;
        if (!it) return linha(M('item'), ri, { B: '', C: '', D: '', E: '', F: '', G: '', H: '', I: '', J: '' });
        const total = it.qtd * it.preco;
        const totalIpi = total * (1 + (it.ipi || 0));
        somaSem += total;
        somaCom += totalIpi;
        return linha(M('item'), ri, {
          B: it.codigo || '',
          C: it.descricao || '',
          D: serialData(it.data),
          E: it.un || '',
          F: it.qtd,
          G: it.preco,
          H: { f: `F${ri}*G${ri}`, v: total },
          I: it.ipi || 0,
          J: { f: `H${ri}*(1+I${ri})`, v: totalIpi },
        });
      });

      saida.push(linha(M('subtotal'), rSub, {
        H: { f: `SUM(H${rItem1}:H${rItemN})`, v: somaSem },
        J: { f: `SUM(J${rItem1}:J${rItemN})`, v: somaCom },
      }));
      saida.push(linha(M('branco'), r + 5));
      saida.push(linha(M('cabTabela'), r + 6));
      saida.push(...linhasItens);

      for (const lin of [rCab, rProd]) mesclas.push(`C${lin}:D${lin}`, `E${lin}:F${lin}`, `G${lin}:H${lin}`);
      subtotais.push({ rSub, rQtd: rCab, somaSem, somaCom, qtd: b.qtd });

      r = rItemN + 1;
      saida.push(linha(M('vao1'), r));
      saida.push(linha(M('vao2'), r + 1));
      r += 2;
    }

    if (dados.totalGeral && subtotais.length) {
      saida.push(linha(M('rotulos'), r));
      saida.push(linha(M('subtotal'), r + 1, {
        C: 'Total do custeio (subtotal × quantidade de cada bloco)',
        G: 'TOTAL',
        H: { f: subtotais.map(s => `H${s.rSub}*K${s.rQtd}`).join('+'), v: subtotais.reduce((a, s) => a + s.somaSem * s.qtd, 0) },
        J: { f: subtotais.map(s => `J${s.rSub}*K${s.rQtd}`).join('+'), v: subtotais.reduce((a, s) => a + s.somaCom * s.qtd, 0) },
      }));
      r += 2;
    }

    let novo = ajustarColunas(xml.slice(0, ini)) + '<sheetData>' + saida.join('') + xml.slice(fim);
    novo = novo
      .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="B1:K${r - 1}"/>`)
      .replace(/<sheetViews>[\s\S]*?<\/sheetViews>/,
        '<sheetViews><sheetView tabSelected="1" workbookViewId="0"><selection activeCell="E5" sqref="E5"/></sheetView></sheetViews>')
      .replace(/<mergeCells[^>]*>[\s\S]*?<\/mergeCells>/,
        `<mergeCells count="${mesclas.length}">${mesclas.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`);
    zip.file(ABA, novo);

    // Excel recalcula as fórmulas ao abrir; tira o caminho da pasta onde o modelo foi salvo
    const wb = await zip.file('xl/workbook.xml').async('string');
    zip.file('xl/workbook.xml', wb
      .replace(/<mc:AlternateContent[\s\S]*?<\/mc:AlternateContent>/, '')
      .replace(/<calcPr([^>]*?)\/>/, (m, a) => (/fullCalcOnLoad/.test(a) ? m : `<calcPr${a} fullCalcOnLoad="1"/>`)));

    return zip.generateAsync({
      type: tipoSaida || 'blob',
      compression: 'DEFLATE',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  const api = { gerar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.ExportarModelo = api;
})(typeof window !== 'undefined' ? window : globalThis);

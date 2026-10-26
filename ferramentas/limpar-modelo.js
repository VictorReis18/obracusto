// Gera o modelo.js a partir do Modelo.xlsx SEM os dados de exemplo (códigos, descrições, preços),
// sem o nome do autor e sem o caminho da pasta — para poder publicar o app no GitHub.
// Mantém só as linhas usadas como molde pela exportação (1-2 e 15-26), com a formatação intacta.
// Rodar sempre que o Modelo.xlsx mudar (o Modelo.xlsx fica só no computador, fora do GitHub).
// Uso, na pasta do app: node ferramentas/limpar-modelo.js .
const fs = require('fs');
const path = require('path');
const APP = path.resolve(process.argv[2] || '.');
const JSZip = require(path.join(APP, 'lib', 'jszip.min.js'));

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(APP, 'Modelo.xlsx')));

  // ---- planilha ----
  let aba = await zip.file('xl/worksheets/sheet1.xml').async('string');
  const manter = n => n <= 2 || (n >= 15 && n <= 26);
  aba = aba.replace(/<row r="(\d+)"[^>]*>[\s\S]*?<\/row>/g, (m, n) => (manter(+n) ? m : ''));

  // células preenchidas pela exportação: ficam vazias, só com a formatação
  const dinamicas = new Set(['K16', 'B17', 'C17', 'E17', 'G17', 'H19', 'J19']);
  for (let r = 22; r <= 24; r++) for (const c of 'BCDEFGHIJ') dinamicas.add(c + r);
  aba = aba.replace(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (m, ref, attrs) =>
    (dinamicas.has(ref) ? `<c r="${ref}"${attrs.replace(/\s+t="[^"]*"/, '')}/>` : m));

  const mesclas = ['B1:J2', 'C16:D16', 'E16:F16', 'G16:H16', 'C17:D17', 'E17:F17', 'G17:H17'];
  aba = aba
    .replace(/<mergeCells[\s\S]*?<\/mergeCells>/, `<mergeCells count="${mesclas.length}">${mesclas.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`)
    .replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, '<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>');
  zip.file('xl/worksheets/sheet1.xml', aba);

  // ---- textos compartilhados: esvazia os que não são mais usados (mantendo a numeração) ----
  const usados = new Set();
  aba.replace(/<c [^>]*t="s"[^>]*><v>(\d+)<\/v><\/c>/g, (m, i) => usados.add(+i));
  let textos = await zip.file('xl/sharedStrings.xml').async('string');
  let i = -1;
  const removidos = [];
  textos = textos.replace(/<si>[\s\S]*?<\/si>/g, si => {
    i++;
    if (usados.has(i)) return si;
    removidos.push(si.replace(/<[^>]+>/g, ''));
    return '<si><t></t></si>';
  });
  zip.file('xl/sharedStrings.xml', textos);

  // ---- autor e caminho da pasta ----
  const core = (await zip.file('docProps/core.xml').async('string'))
    .replace(/<dc:creator>[^<]*<\/dc:creator>/, '<dc:creator>ObraCusto</dc:creator>')
    .replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy>ObraCusto</cp:lastModifiedBy>');
  zip.file('docProps/core.xml', core);
  const wb = (await zip.file('xl/workbook.xml').async('string')).replace(/<mc:AlternateContent[\s\S]*?<\/mc:AlternateContent>/, '');
  zip.file('xl/workbook.xml', wb);

  const b64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  fs.writeFileSync(path.join(APP, 'modelo.js'),
    '// Modelo.xlsx embutido (base64), só com a formatação: sem os dados de exemplo, autor ou caminho de pasta.\n' +
    '// A exportação para Excel usa este arquivo como base. Gerado em ' + new Date().toISOString().slice(0, 10) + ' a partir de Modelo.xlsx.\n' +
    'window.MODELO_XLSX = "' + b64 + '";\n');

  console.log('textos mantidos:', [...usados].sort((a, b) => a - b).length, '| textos esvaziados:', removidos.length);
  console.log('exemplos removidos:', removidos.slice(0, 8).join(' | '));
  const conf = await JSZip.loadAsync(b64, { base64: true });
  const tudo = (await Promise.all(Object.keys(conf.files).map(f => conf.file(f) ? conf.file(f).async('string') : ''))).join('\n');
  for (const proibido of ['Victor', 'vitor.reis', 'CV20.45.16GPT', 'CHAPA SAE', 'C:\\Users', '510578', '255 X 273']) {
    console.log(`  contém "${proibido}"?`, tudo.includes(proibido));
  }
})().catch(e => { console.error('FALHA', e); process.exit(1); });

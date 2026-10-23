/*
 * Monta o .xlsx final no formato do Template_Aplicação_LMR.xlsx, sem bibliotecas (cola num nó Code).
 * Abas, estilos, larguras e mesclagens vêm das peças do próprio template (PARTES = arquivos internos do .xlsx,
 * como texto). Preenche:
 *   DOCS DE REFERÊNCIA   — cabeçalho (lista, especificação, subsistema) + uma linha por material
 *   DESCRIÇÃO DOCUMENTOS — igual ao template (a equipe completa depois, decisão 25)
 *   APLICAÇÃO - LMR      — FICHA_PMIB, CÓDIGO_LMR, TAG_LMR (coluna Status vazia, decisão 17)
 * O zip sai sem compressão (só CRC32): o Excel abre normalmente.
 */

// ── texto → XML e bytes ──
function xmlEsc(v) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function utf8(s) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'utf8'));
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { c = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00); }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}
function base64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    s += A[n >> 18] + A[(n >> 12) & 63] + (i + 1 < bytes.length ? A[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? A[n & 63] : '=');
  }
  return s;
}

// ── zip sem compressão ──
const CRC_TAB = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TAB[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(arquivos) { // [{ nome, dados: Uint8Array }]
  const partes = [];
  const central = [];
  let pos = 0;
  const DATA = 0x5a21, HORA = 0x6000; // 01/01/2025 12:00, fixo: o mesmo conteúdo dá o mesmo arquivo
  const cab = (tam, f) => { const b = new Uint8Array(tam); f(new DataView(b.buffer)); return b; };
  for (const a of arquivos) {
    const nome = utf8(a.nome);
    const crc = crc32(a.dados);
    const n = a.dados.length;
    const local = cab(30, v => {
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true);
      v.setUint16(10, HORA, true); v.setUint16(12, DATA, true); v.setUint32(14, crc, true); v.setUint32(18, n, true);
      v.setUint32(22, n, true); v.setUint16(26, nome.length, true); v.setUint16(28, 0, true);
    });
    central.push({ nome, crc, n, pos });
    partes.push(local, nome, a.dados);
    pos += 30 + nome.length + n;
  }
  const inicioCentral = pos;
  for (const c of central) {
    const h = cab(46, v => {
      v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0800, true);
      v.setUint16(10, 0, true); v.setUint16(12, HORA, true); v.setUint16(14, DATA, true); v.setUint32(16, c.crc, true);
      v.setUint32(20, c.n, true); v.setUint32(24, c.n, true); v.setUint16(28, c.nome.length, true);
      v.setUint32(42, c.pos, true);
    });
    partes.push(h, c.nome);
    pos += 46 + c.nome.length;
  }
  partes.push(cab(22, v => {
    v.setUint32(0, 0x06054b50, true); v.setUint16(8, central.length, true); v.setUint16(10, central.length, true);
    v.setUint32(12, pos - inicioCentral, true); v.setUint32(16, inicioCentral, true);
  }));
  const out = new Uint8Array(pos + 22);
  let k = 0;
  for (const p of partes) { out.set(p, k); k += p.length; }
  return out;
}

// ── abas ──
const celula = (ref, s, v) => (v == null || v === '' ? `<c r="${ref}" s="${s}"/>`
  : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`);
const SPANS = 'x14ac:dyDescent="0.3"';

/** DOCS DE REFERÊNCIA: linhas 1–6 do template (com o cabeçalho preenchido) + uma linha por material a partir da 7. */
function abaDocs(modelo, cab, docs) {
  const ini = modelo.slice(0, modelo.indexOf('<sheetData>') + '<sheetData>'.length);
  const fimDados = modelo.indexOf('</sheetData>');
  const depois = modelo.slice(fimDados);
  const linhasTemplate = modelo.slice(ini.length, fimDados).match(/<row [^>]*>.*?<\/row>/g) || [];
  const porNum = Object.fromEntries(linhasTemplate.map(r => [Number(r.match(/r="(\d+)"/)[1]), r]));
  // C2, C3, C4: valores do cabeçalho (C4 traz "-" no template)
  const valorEm = (linha, ref, v) => linha.replace(new RegExp(`<c r="${ref}" s="(\\d+)"(?: t="s")?(?:/>|>.*?</c>)`), (_, s) => celula(ref, s, v));
  const topo = [
    porNum[1],
    valorEm(porNum[2], 'C2', cab['LISTA DE SOBRESSALENTE']),
    valorEm(porNum[3], 'C3', cab['ESPECIFICAÇÃO TÉCNICA / CAPÍTULO']),
    valorEm(porNum[4], 'C4', cab.SUBSISTEMA || '-'),
    porNum[5], porNum[6],
  ];
  const COLS = [['A', 10, 'CÓDIGO PMIB'], ['B', 10, 'PART NUMBER'], ['C', 10, 'DESCRIÇÃO DO MATERIAL'], ['D', 10, 'RDS-PP DOCUMENTO - PRINCIPAL'],
    ['E', 11, 'QTD'], ['F', 17, 'TAGS'], ['G', 18, 'OBSERVAÇÕES']];
  const corpo = docs.map((d, i) => {
    const r = 7 + i;
    return `<row r="${r}" spans="1:7" ht="33" customHeight="1" ${SPANS}>${COLS.map(([c, s, k]) => celula(c + r, s, d[k])).join('')}</row>`;
  });
  const ultima = 6 + Math.max(docs.length, 1);
  return ini.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:G${ultima}"/>`) + topo.join('') + corpo.join('') + depois;
}

/** APLICAÇÃO - LMR: cabeçalho do template + linhas; filtro automático cobrindo as linhas. */
function abaAplicacao(modelo, linhas) {
  const ini = modelo.slice(0, modelo.indexOf('<sheetData>') + '<sheetData>'.length);
  const fimDados = modelo.indexOf('</sheetData>');
  const cabecalho = modelo.slice(ini.length, fimDados);
  const n = linhas.length + 1;
  const partes = new Array(linhas.length);
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i], r = i + 2;
    partes[i] = `<row r="${r}" spans="1:4" ${SPANS}>${celula('A' + r, 1, l.FICHA_PMIB)}${celula('B' + r, 1, l['CÓDIGO_LMR'])}${celula('C' + r, 1, l.TAG_LMR)}</row>`;
  }
  return ini.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:D${n}"/>`) + cabecalho + partes.join('')
    + modelo.slice(fimDados).replace(/<autoFilter ref="A1:C1"/, `<autoFilter ref="A1:C${n}"`);
}

/**
 * dados = { cabecalho: {LISTA DE SOBRESSALENTE, ESPECIFICAÇÃO TÉCNICA / CAPÍTULO, SUBSISTEMA}, docs: [linhas da DOCS], linhas: [aplicação] }
 * Devolve os bytes do .xlsx (Uint8Array).
 */
function montaAplicacaoXlsx(PARTES, dados) {
  const p = { ...PARTES };
  // tira o caminho local de quem salvou o template e ajusta o filtro da APLICAÇÃO
  p['xl/workbook.xml'] = p['xl/workbook.xml']
    .replace(/<mc:AlternateContent[^]*?<\/mc:AlternateContent>/, '')
    .replace(/'APLICAÇÃO - LMR'!\$A\$1:\$C\$1/, `'APLICAÇÃO - LMR'!$A$1:$C$${dados.linhas.length + 1}`);
  p['xl/worksheets/sheet1.xml'] = abaDocs(PARTES['xl/worksheets/sheet1.xml'], dados.cabecalho || {}, dados.docs || []);
  p['xl/worksheets/sheet3.xml'] = abaAplicacao(PARTES['xl/worksheets/sheet3.xml'], dados.linhas || []);
  const ordem = ['[Content_Types].xml', ...Object.keys(p).filter(k => k !== '[Content_Types].xml')];
  return zip(ordem.map(nome => ({ nome, dados: utf8(p[nome]) })));
}

// ── planilha simples (Base, ALTERAÇÕES): várias abas, cabeçalho em negrito com filtro, tudo texto menos números ──
const ESTILOS_SIMPLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>'
  + '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function colunaLetra(i) { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; }

/** abas = [{ nome, colunas: [..], linhas: [{col: valor}], larguras?: {col: n}, numeros?: [cols], texto?: true (aba de uma coluna, sem cabeçalho) }] */
function planilhaSimples(abas) {
  const folhas = abas.map(a => {
    const cols = a.colunas;
    const num = new Set(a.numeros || []);
    const cel = (ref, v, s, numero) => {
      if (v == null || v === '') return '';
      if (numero && typeof v === 'number' || numero && /^-?\d+(\.\d+)?$/.test(String(v))) return `<c r="${ref}"><v>${Number(v)}</v></c>`;
      return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    };
    const rows = [];
    if (!a.texto) rows.push(`<row r="1">${cols.map((c, j) => cel(colunaLetra(j) + 1, c, 1)).join('')}</row>`);
    const ini = a.texto ? 1 : 2;
    a.linhas.forEach((l, i) => {
      const r = ini + i;
      rows.push(`<row r="${r}">${cols.map((c, j) => cel(colunaLetra(j) + r, l[c], a.texto && i === 0 ? 3 : 2, num.has(c))).join('')}</row>`);
    });
    const ultima = Math.max(ini - 1 + a.linhas.length, 1);
    const fim = colunaLetra(cols.length - 1);
    const larg = cols.map((c, j) => `<col min="${j + 1}" max="${j + 1}" width="${(a.larguras || {})[c] || 18}" customWidth="1"/>`).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + `<dimension ref="A1:${fim}${ultima}"/>`
      + (a.texto ? '<sheetViews><sheetView workbookViewId="0"/></sheetViews>' : '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>')
      + `<cols>${larg}</cols><sheetData>${rows.join('')}</sheetData>`
      + (a.texto ? '' : `<autoFilter ref="A1:${fim}${ultima}"/>`) + '</worksheet>';
  });
  const arquivos = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + folhas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>'
      + abas.map((a, i) => `<sheet name="${xmlEsc(a.nome.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets><definedNames>'
      + abas.map((a, i) => (a.texto ? '' : `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xmlEsc(a.nome.slice(0, 31))}'!$A$1:$${colunaLetra(a.colunas.length - 1)}$${Math.max(a.linhas.length + 1, 1)}</definedName>`)).join('')
      + '</definedNames></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + folhas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${folhas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', ESTILOS_SIMPLES],
    ...folhas.map((f, i) => [`xl/worksheets/sheet${i + 1}.xml`, f]),
  ];
  return zip(arquivos.map(([nome, t]) => ({ nome, dados: utf8(t) })));
}

// ── arquivo da Base (mesmas abas e colunas do escreve_base.py) ──
const LEIA_ME_BASE = [
  'BASE DA APLICAÇÃO LMR',
  '',
  'Cada linha da aba BASE é um material numa posição (TAG, painel, local). O Workflow B expande cada linha em',
  'QTD POR TRECHO linhas iguais em cada trecho de TRECHOS, na ordem física das UGs.',
  '',
  "RDS-PP e PAIS: #ST[XX]=M[XX] vira o #ST e o M de cada UG. RDS-PP sem [XX] fica igual em todos os trechos.",
  "PAIS: TAG | RDS-PP do pai, separados por ' ; ' quando há mais de um pai. Com PAIS, o CÓDIGO cita o pai no lugar de ÁREA/PAINEL.",
  "TAG COM RDS-PP: SIM → TAG_LMR leva 'RDS-PP: {RDS-PP}{TAG}'; NÃO → '{ESCOPO} - {TAG} - {DESCRIÇÃO}'.",
  '',
  'Para alterar a aplicação: edite esta aba (trocar PMIB, mudar QTD, incluir ou tirar trechos) e rode o Workflow B,',
  'ou use o Workflow C (C1 compara com o Status PMIB novo; C2 aplica as alterações aprovadas).',
  'CABEÇALHO: LISTA DE SOBRESSALENTE, ESPECIFICAÇÃO TÉCNICA / CAPÍTULO e SUBSISTEMA do topo da aba DOCS DE REFERÊNCIA da aplicação.',
  'DOCS DE REFERÊNCIA: uma linha por material; a coluna TAGS é refeita pelo Workflow B a partir da BASE.',
  'HISTÓRICO: todas as alterações aplicadas pelo Workflow C. DIFERENÇAS: efeito da última rodada do C2.',
  'Não mude os nomes das colunas nem os nomes das abas.',
];
const LARGURAS_BASE = { LINHA: 7, ESCOPO: 8, SUBSISTEMA: 18, FICHA_PMIB: 17, 'DESCRIÇÃO': 45, 'ÁREA/PAINEL': 22, 'RDS-PP': 34, TAG: 10,
  'TAG COM RDS-PP': 9, PAIS: 40, LOCAL: 20, 'ELEVAÇÃO': 10, EIXO: 6, TRECHOS: 40, 'QTD POR TRECHO': 9, CAMPO: 34, VALOR: 80,
  'CÓDIGO PMIB': 17, 'PART NUMBER': 22, 'DESCRIÇÃO DO MATERIAL': 45, 'RDS-PP DOCUMENTO - PRINCIPAL': 32, TAGS: 30, 'OBSERVAÇÕES': 30,
  MOTIVO: 60, 'ONDE NA BASE': 30, 'DESCRIÇÃO NOVA': 45, RESULTADO: 60, 'COPIAR POSIÇÕES DE': 17, 'PMIB ATUAL': 17, 'PMIB NOVO': 17, TIPO: 22 };

/** d = { colunasBase, base, cabecalho: {campo: valor}, docs, relacoes, historico, diferencas, colunasHistorico, colunasDiferencas } */
function planilhaDaBase(d) {
  const docsCols = ['CÓDIGO PMIB', 'PART NUMBER', 'DESCRIÇÃO DO MATERIAL', 'RDS-PP DOCUMENTO - PRINCIPAL', 'QTD', 'TAGS', 'OBSERVAÇÕES'];
  const relCols = ['PMIB PAI', 'PMIB FILHO', 'CATEGORIA', 'SEÇÃO', 'ITEM NO STATUS', 'FONTE'];
  const abas = [
    { nome: 'BASE', colunas: d.colunasBase, linhas: d.base, numeros: ['LINHA', 'QTD POR TRECHO'] },
    { nome: 'CABEÇALHO', colunas: ['CAMPO', 'VALOR'], linhas: Object.entries(d.cabecalho || {}).map(([CAMPO, VALOR]) => ({ CAMPO, VALOR })) },
    { nome: 'DOCS DE REFERÊNCIA', colunas: docsCols, linhas: d.docs || [], numeros: ['QTD'] },
  ];
  if ((d.relacoes || []).length) abas.push({ nome: 'RELAÇÕES', colunas: relCols, linhas: d.relacoes });
  if ((d.historico || []).length) abas.push({ nome: 'HISTÓRICO', colunas: d.colunasHistorico, linhas: d.historico });
  if ((d.diferencas || []).length) abas.push({ nome: 'DIFERENÇAS', colunas: d.colunasDiferencas, linhas: d.diferencas, numeros: ['LINHAS DA APLICAÇÃO ANTES', 'LINHAS DA APLICAÇÃO DEPOIS'] });
  abas.push({ nome: 'LEIA-ME', colunas: ['T'], linhas: LEIA_ME_BASE.map(T => ({ T })), larguras: { T: 120 }, texto: true });
  for (const a of abas) a.larguras = { ...LARGURAS_BASE, ...(a.larguras || {}) };
  return planilhaSimples(abas);
}

const PLANILHA = { montaAplicacaoXlsx, planilhaSimples, planilhaDaBase, base64, crc32, zip, utf8 };
if (typeof module !== 'undefined') module.exports = PLANILHA;

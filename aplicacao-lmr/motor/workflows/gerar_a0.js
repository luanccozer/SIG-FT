/*
 * Gera o workflow "LMR - A0 Conferir materiais" para importar no n8n do AMP (primeiro degrau do fluxo A novo, sem IA).
 * Entrada (formulário): os PDFs do sistema, o Status PMIB (.xlsx) e o nome do sistema.
 * Saída: CONFERÊNCIA MATERIAIS - {sistema}.xlsx (MATERIAIS, DOCUMENTOS) e a mensagem final.
 * Spec: docs/superpowers/specs/2026-11-03-lmr-a0-conferir-materiais-design.md
 *
 * Mesmo desenho do B e do A1: um Loop entrega 1 PDF por volta; o Code confere só esse documento e devolve 1 item.
 *
 * Uso: node workflows/gerar_a0.js
 *      gera o .json e testa com documentos fictícios; se houver dados/textos_{sistema}.json (PDFs reais extraídos
 *      com indice/extrai_como_n8n.mjs), confere também contra o índice A1 (só local).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const MOTOR = ler('lmr.js');
const PLANILHA_JS = ler('planilha.js');
const INDICE_JS = ler('indice', 'indice.js');
const CONF_JS = ler('conferencia', 'conferencia.js');
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CAMPO_SISTEMA = 'Sistema';
const pos = (col, lin = 0) => [col * 260, lin * 200];

const { BIN_STATUS, LE_STATUS, SEPARA } = require('./pecas_a.js');

// Uma volta do Loop: o texto de um PDF → o que a conferência precisa desse documento (1 item).
const CONFERE = `${MOTOR}
${INDICE_JS}
${CONF_JS}
${LE_STATUS}
const r = [];
$input.all().forEach((item, i) => {
  const j = item.json || {};
  let arquivo = j.arquivo;
  if (!arquivo) try { arquivo = $('Lote de documentos').itemMatching(i).json.arquivo; } catch (e) { arquivo = ''; }
  arquivo = arquivo || 'documento sem nome.pdf';
  const erro = j.error ? String(j.error.message || j.error) : '';
  const paginas = Array.isArray(j.text) ? j.text : String(j.text || '').split('\\n\\n');
  r.push({ json: CONFERENCIA.confereDocumento(arquivo, erro ? [] : paginas, catalogo, erro) });
});
return r;`;

// Fim do Loop: junta os documentos e monta o .xlsx (1 item).
const MONTA = `${MOTOR}
${PLANILHA_JS}
${INDICE_JS}
${CONF_JS}
${LE_STATUS}
const documentos = $input.all().map(i => i.json).filter(j => j && Array.isArray(j.materiais));
const form = $('Formulário').first();
const sistema = String((form.json || {})['${CAMPO_SISTEMA}'] || '').trim() || 'Sistema';
const ignorados = Object.values(form.binary || {}).map(b => b.fileName || '').filter(n => !/\\.(pdf|xlsx)$/i.test(n));
const { abas, resumo } = CONFERENCIA.montaConferencia({ documentos, catalogo, sistema, ignorados });
const bytes = PLANILHA.planilhaSimples(abas);
return [{ json: resumo,
  binary: { data: { data: PLANILHA.base64(bytes), mimeType: '${XLSX_MIME}', fileName: resumo.arquivo, fileExtension: 'xlsx' } } }];`;

// ── nós ──
const nodes = [];
const add = n => (nodes.push(n), n.name);
add({
  parameters: {
    formTitle: 'LMR — A0 Conferir materiais',
    formDescription: 'Envie os PDFs do sistema e o Status PMIB. No fim esta página mostra quantos materiais do Status estão nos documentos e baixa a CONFERÊNCIA.',
    formFields: { values: [
      { fieldLabel: 'Documentos (PDF)', fieldType: 'file', multipleFiles: true, acceptFileTypes: '.pdf', requiredField: true },
      { fieldLabel: 'Status PMIB (.xlsx)', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.xlsx', requiredField: true },
      { fieldLabel: CAMPO_SISTEMA, requiredField: true, placeholder: 'Água Pura' },
    ] },
    options: {},
  },
  name: 'Formulário', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.2, position: pos(0, 1), webhookId: crypto.randomUUID(),
});
// ramo de cima roda primeiro: o Status já está lido quando o Loop começa (os Codes buscam pelo nome do nó)
add({ parameters: { operation: 'xlsx', binaryPropertyName: BIN_STATUS, options: { headerRow: false, includeEmptyCells: true, sheetName: 'Lista de Materiais' } },
  name: 'Lê Status PMIB', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(1, 0) });
add({ parameters: { jsCode: SEPARA }, name: 'Separa PDFs', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(1, 2) });
add({ parameters: { batchSize: 1, options: {} }, name: 'Lote de documentos', type: 'n8n-nodes-base.splitInBatches', typeVersion: 3, position: pos(2, 2) });
add({ parameters: { operation: 'pdf', binaryPropertyName: 'data', options: { joinPages: false, keepSource: 'json' } },
  name: 'Lê PDF (por página)', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(3, 3), onError: 'continueRegularOutput' });
add({ parameters: { jsCode: CONFERE }, name: 'Confere documento', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(4, 3) });
add({ parameters: { jsCode: MONTA }, name: 'Monta conferência', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(3, 1.5) });
add({
  parameters: { operation: 'completion', respondWith: 'returnBinary', inputDataFieldName: 'data', completionTitle: 'Conferência dos materiais',
    completionMessage: '={{ $json.mensagem }}' },
  name: 'Entrega a conferência', type: 'n8n-nodes-base.form', typeVersion: 1, position: pos(4, 1.5), webhookId: crypto.randomUUID(),
});
add({
  parameters: { content: '## LMR — A0 Conferir materiais (sem IA)\n1. ⋯ → *Settings* → *Save manual executions* = **Save**.\n2. **Execute workflow** → no formulário envie **os PDFs** do sistema (pode selecionar vários), o **Status PMIB** e o nome do sistema.\n3. **Deixe a aba do formulário aberta**: no fim ela mostra quantos materiais do Status foram achados e baixa **CONFERÊNCIA MATERIAIS - {sistema}.xlsx**.\n4. Me devolva só a **mensagem final**. A planilha fica com você.\n\nO Loop lê **1 PDF por volta**. PDF que falhar ou não tiver texto aparece com aviso na aba DOCUMENTOS, e os outros seguem.', height: 320, width: 560 },
  name: 'Leia-me', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos(0, -1.6),
});

const connections = {};
const liga = (de, para, saida = 0) => {
  connections[de] = connections[de] || { main: [] };
  while (connections[de].main.length <= saida) connections[de].main.push([]);
  connections[de].main[saida].push({ node: para, type: 'main', index: 0 });
};
liga('Formulário', 'Lê Status PMIB');
liga('Formulário', 'Separa PDFs');
liga('Separa PDFs', 'Lote de documentos');
liga('Lote de documentos', 'Monta conferência', 0); // done
liga('Lote de documentos', 'Lê PDF (por página)', 1); // loop
liga('Lê PDF (por página)', 'Confere documento');
liga('Confere documento', 'Lote de documentos');
liga('Monta conferência', 'Entrega a conferência');

const wf = { name: 'LMR - A0 Conferir materiais', nodes, connections,
  settings: { executionOrder: 'v1', saveManualExecutions: true, saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all', saveExecutionProgress: true },
  pinData: {}, meta: { templateCredsSetupCompleted: true } };
const destino = path.join(__dirname, 'LMR_A0_conferir_materiais.json');
fs.writeFileSync(destino, JSON.stringify(wf, null, 2));
console.log('ok', path.basename(destino), nodes.length, 'nós,', (fs.statSync(destino).size / 1024).toFixed(0), 'KB');

// ───────────────────────── testes locais ─────────────────────────
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const SAIDA = path.join(RAIZ, 'saida', 'teste_a0');
fs.mkdirSync(SAIDA, { recursive: true });

// T1 — o .json: JSON válido, nós e ligações na ordem da spec
const lido = JSON.parse(fs.readFileSync(destino, 'utf8'));
assert.deepStrictEqual(lido.nodes.filter(n => n.type !== 'n8n-nodes-base.stickyNote').map(n => n.name),
  ['Formulário', 'Lê Status PMIB', 'Separa PDFs', 'Lote de documentos', 'Lê PDF (por página)', 'Confere documento', 'Monta conferência', 'Entrega a conferência']);
const destinos = de => (lido.connections[de].main || []).map(s => s.map(c => c.node));
assert.deepStrictEqual(destinos('Formulário'), [['Lê Status PMIB', 'Separa PDFs']]);
assert.deepStrictEqual(destinos('Lote de documentos'), [['Monta conferência'], ['Lê PDF (por página)']]);
assert.deepStrictEqual(destinos('Confere documento'), [['Lote de documentos']]);
assert.ok(!lido.nodes.some(n => /merge|wait/i.test(n.type)), 'sem Merge e sem Wait');
for (const n of lido.nodes) if (n.type.endsWith('.code')) new AsyncFn('$', '$input', n.parameters.jsCode); // compila
console.log('T1 ok  .json válido: 8 nós em linha, Loop 1 PDF por volta, sem Merge/Wait, Codes compilam');

// T2 — ponta a ponta com documentos fictícios, imitando o n8n:
// Separa → Loop (1 por volta) → Extract (joinPages=false, keepSource=json) → Confere → done → Monta
const STATUS_FICT = [
  ['GERENCIAMENTO'], ['SISTEMA X | #ST00=X00ABC10&MPB020'],
  ['ITEM', 'QTD.', 'UNID.', 'DESCRIÇÃO', 'CÓDIGO DO MATERIAL', 'CÓDIGO CMI', 'MARCA/MODELO', 'CÓDIGO PMIB', 'PDM usado', 'STATUS', 'TIPO DE ENTREGA'],
  [1, null, null, 'Conjunto', null, null, null, null, null, null, null],
  [1.1, 2, 'UN', 'Bomba encapsulada', 1000001, null, 'Fabricante A / F1015U-717', '1111111111.0001', '', 'EM ELABORAÇÃO', 'FÍSICA'],
  [1.2, 2, 'UN', 'Transmissor de vibração', 1000002, null, 'Fabricante B / VTV122', '1111111111.0002', '', 'EM ELABORAÇÃO', 'FÍSICA'],
  [1.3, 50, 'L', 'Resina', 1000003, null, 'Fabricante C / RX-100', '1111111111.0003', '', 'EM ELABORAÇÃO', 'FÍSICA'],
  [1.4, 1, 'UN', 'Válvula', 1000004, null, 'Fabricante D / V-9', '1111111111.0004', '', 'DUPLICADO', 'FÍSICA'],
];
const DOCS_FICT = [
  { arquivo: '#ST00=X00ABC10&MPB020[0].pdf', paginas: ['LISTA DE SOBRESSALENTES DO SISTEMA X', '1.1 Bomba encapsulada GP101 1000001 UN 2\n1.2 Transmissor VTV122 1000002 UN 2'] },
  { arquivo: 'Diagrama escaneado.pdf', paginas: ['', ' ', ''] },
  { arquivo: '#ST00=X00ABC10&MLU010[0].pdf', erro: 'arquivo protegido por senha' },
];
const leXlsx = arq => JSON.parse(require('child_process').execFileSync('python', ['-X', 'utf8', '-c',
  'import openpyxl,json,sys\nwb=openpyxl.load_workbook(sys.argv[1])\nprint(json.dumps({ws.title:[list(r) for r in ws.iter_rows(values_only=True)] for ws in wb},ensure_ascii=False,default=str))', arq], { encoding: 'utf8', maxBuffer: 1 << 28 }));

async function rodaA0(docs, statusRows, sistema, extras = []) {
  const code = nome => lido.nodes.find(n => n.name === nome).parameters.jsCode;
  const lidosStatus = statusRows.map(row => ({ json: { row } }));
  const binForm = Object.fromEntries([...docs.map(d => d.arquivo), 'X_STATUS_PMIB.xlsx', ...extras].map((n, i) => [`f${i}`, { fileName: n }]));
  const $ = no => ({
    all: () => (no === 'Lê Status PMIB' ? lidosStatus : []),
    first: () => ({ json: { [CAMPO_SISTEMA]: sistema }, binary: binForm }),
    itemMatching: () => { throw new Error('sem pareamento no teste'); },
  });
  const separados = await new AsyncFn('$', '$input', code('Separa PDFs'))($, { first: () => ({ binary: binForm }) });
  assert.strictEqual(separados.length, docs.length, 'Separa PDFs: 1 item por PDF, sem o Status e sem os não-PDF');
  const voltas = [];
  for (const d of docs) {
    const extraido = d.erro ? { error: d.erro, arquivo: d.arquivo } : { arquivo: d.arquivo, numpages: d.paginas.length, text: d.paginas };
    const out = await new AsyncFn('$', '$input', code('Confere documento'))($, { all: () => [{ json: extraido }] });
    assert.strictEqual(out.length, 1, 'Confere documento devolve 1 item');
    voltas.push({ json: JSON.parse(JSON.stringify(out[0].json)) });
  }
  const out = await new AsyncFn('$', '$input', code('Monta conferência'))($, { all: () => voltas });
  assert.strictEqual(out.length, 1, 'Monta conferência devolve 1 item');
  return out[0];
}

(async () => {
  const r = await rodaA0(DOCS_FICT, STATUS_FICT, 'Sistema X', ['nota.txt']);
  assert.strictEqual(r.binary.data.fileName, 'CONFERÊNCIA MATERIAIS - Sistema X.xlsx');
  const arq = path.join(SAIDA, r.binary.data.fileName);
  fs.writeFileSync(arq, Buffer.from(r.binary.data.data, 'base64'));
  const x = leXlsx(arq);
  assert.deepStrictEqual(Object.keys(x), ['MATERIAIS', 'DOCUMENTOS']);
  const cab = x.MATERIAIS[0];
  const mats = Object.fromEntries(x.MATERIAIS.slice(1).map(l => [l[cab.indexOf('PMIB')], l[cab.indexOf('ACHADO')]]));
  assert.deepStrictEqual(mats, { '1111111111.0001': 'SIM', '1111111111.0002': 'SIM', '1111111111.0003': 'NÃO' });
  const cabD = x.DOCUMENTOS[0];
  const av = Object.fromEntries(x.DOCUMENTOS.slice(1).map(l => [l[0], l[cabD.indexOf('AVISO')]]));
  assert.deepStrictEqual(av, { '#ST00=X00ABC10&MPB020[0].pdf': null, 'Diagrama escaneado.pdf': 'sem texto: escaneado?',
    '#ST00=X00ABC10&MLU010[0].pdf': 'PDF não lido: arquivo protegido por senha' });
  assert.strictEqual(r.json.mensagem, '2 de 3 materiais achados nos documentos · 3 documentos, 5 páginas (3 sem texto)'
    + ' · Não achados (1): 1111111111.0003 · Documentos com aviso (2): Diagrama escaneado.pdf, #ST00=X00ABC10&MLU010[0].pdf'
    + ' · Arquivos ignorados (não são PDF): nota.txt');
  console.log('T2 ok  ponta a ponta (fictício):', r.json.mensagem);

  // T3 (só local) — PDFs reais: os achados batem com a aba MATERIAIS do índice A1 (mesma busca, outra montagem).
  const INDICE = require('../indice/indice.js');
  const LMR = require('../lmr.js');
  const D = path.join(RAIZ, 'dados');
  const SISTEMAS = { agua_pura: 'Água Pura', aeracao: 'Aeração Axial', regvel: 'Reg. Vel. e Pot. Hidráulica', sfc: 'SFC HF-01 e HF-02' };
  let rodou = 0;
  for (const [n, nome] of Object.entries(SISTEMAS)) {
    const arqTextos = path.join(D, `textos_${n}.json`);
    if (!fs.existsSync(arqTextos)) { console.log(`T3 —   ${nome}: sem textos extraídos (pulado, não conta como aprovado)`); continue; }
    const docs = JSON.parse(fs.readFileSync(arqTextos, 'utf8'));
    const status = JSON.parse(fs.readFileSync(path.join(D, `status_${n}.json`), 'utf8')).linhas;
    const t0 = Date.now();
    const r3 = await rodaA0(docs, status, nome);
    const catalogo = LMR.lerStatusPmib(status).catalogo;
    const indexados = docs.map(d => INDICE.indexaDocumento(d.arquivo, d.erro ? [] : d.paginas, catalogo));
    const a1 = INDICE.montaIndice({ indexados, catalogo, sistema: nome }).resumo;
    assert.strictEqual(r3.json.achados, a1.materiaisAchados, `${nome}: achados do A0 = achados do A1`);
    assert.strictEqual(r3.json.materiais, a1.materiais, `${nome}: materiais do A0 = materiais do A1`);
    rodou++;
    console.log(`T3 ok  ${nome}: ${r3.json.achados}/${r3.json.materiais} achados (igual ao A1) · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  console.log(rodou ? 'TUDO OK' : 'TUDO OK (sem a regressão com dados reais: rode na máquina com o Box)');
})().catch(e => { console.error('FALHOU', e.stack); process.exit(1); });

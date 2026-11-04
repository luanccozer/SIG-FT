/*
 * Gera o workflow "LMR - A1 Índice dos documentos" para importar no n8n do AMP (Workflow A, etapa 1, sem IA).
 * Entrada (formulário): os PDFs do sistema, o Status PMIB (.xlsx) e, opcionalmente, a BASE de um sistema já aplicado
 *                       (gabarito: o índice é conferido contra ela dentro do AMP; nada sai de lá).
 * Saída: ÍNDICE LMR - {sistema}.xlsx (RESUMO, DOCUMENTOS, MATERIAIS, RDS-PP, ELEVAÇÕES, SEM TEXTO,
 *        CONFERÊNCIA TAGS e CONFERÊNCIA MATERIAIS se houver gabarito, PÁGINAS com o texto de cada página).
 *
 * Mesmo desenho do B: um Loop entrega 1 PDF por volta; o Code indexa só esse documento. No fim um Code monta o .xlsx.
 * A aba PÁGINAS é a entrada do A2 (leitura com IA): o A2 não precisa reabrir os PDFs com texto.
 *
 * Uso: node workflows/gerar_a1.js
 *      gera o .json e testa com documentos fictícios; se houver dados/textos_{sistema}.json (PDFs reais extraídos
 *      com indice/extrai_como_n8n.mjs), roda também com eles (só local, nada disso vai para o repositório).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const RAIZ = path.join(__dirname, '..');
const MOTOR = fs.readFileSync(path.join(RAIZ, 'lmr.js'), 'utf8');
const PLANILHA_JS = fs.readFileSync(path.join(RAIZ, 'planilha.js'), 'utf8');
const INDICE_JS = fs.readFileSync(path.join(RAIZ, 'indice', 'indice.js'), 'utf8');
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CAMPO_SISTEMA = 'Sistema';
const pos = (col, lin = 0) => [col * 260, lin * 200];

const { BIN_STATUS, BIN_BASE, LE_STATUS, SEPARA, INDEXA } = require('./pecas_a.js');

// Fim do Loop: junta os documentos, confere com a BASE (se veio) e monta o .xlsx.
const MONTA = `${MOTOR}
${PLANILHA_JS}
${INDICE_JS}
${LE_STATUS}
const ler = no => { try { return $(no).all().map(i => i.json).filter(r => !r.error); } catch (e) { return []; } };
const indexados = $input.all().map(i => i.json).filter(j => j && j.doc);
// nome do Status: do formulário (versão upload) ou da lista da pasta (versão Box)
const nomes = Object.values($('Formulário').first().binary || {}).map(b => b.fileName);
try { nomes.push(...$('Lista arquivos').all().map(i => i.json.arquivo)); } catch (e) { /* versão upload */ }
// nome do sistema: campo do formulário; sem ele (versão Box), o fim do nome do Status ("… - {sistema}.xlsx")
const doCampo = String(($('Formulário').first().json || {})['${CAMPO_SISTEMA}'] || '').trim();
const sistema = doCampo || String(nomes.find(n => /STATUS/i.test(n || '')) || '').replace(/\\.xlsx$/i, '').split(/\\s+-\\s+/).slice(1).join(' - ').trim() || 'Sistema';
const { abas, resumo } = INDICE.montaIndice({ indexados, catalogo, base: ler('Lê BASE (gabarito)'), sistema, hash: LMR.hashLinha });
const bytes = PLANILHA.planilhaSimples(abas);
const nome = 'ÍNDICE LMR - ' + sistema + '.xlsx';
const kb = Math.round(bytes.length / 1024);
return [{ json: { ...resumo, arquivo: nome, kb, mensagem: resumo.mensagem + ' · ' + kb + ' KB' },
  binary: { data: { data: PLANILHA.base64(bytes), mimeType: '${XLSX_MIME}', fileName: nome, fileExtension: 'xlsx' } } }];`;

const MENSAGEM = '={{ $json.mensagem }}';

// ── nós ──
const nodes = [];
const add = n => (nodes.push(n), n.name);
add({
  parameters: {
    formTitle: 'LMR — A1 Índice dos documentos',
    formDescription: 'Envie os PDFs do sistema e o Status PMIB. A BASE é opcional: serve de gabarito para conferir o índice. No fim esta página baixa o ÍNDICE.',
    formFields: { values: [
      { fieldLabel: 'Documentos (PDF)', fieldType: 'file', multipleFiles: true, acceptFileTypes: '.pdf', requiredField: true },
      { fieldLabel: 'Status PMIB (.xlsx)', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.xlsx', requiredField: true },
      { fieldLabel: CAMPO_SISTEMA, requiredField: true, placeholder: 'Água Pura' },
      { fieldLabel: 'BASE para conferência (.xlsx, opcional)', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.xlsx', requiredField: false },
    ] },
    options: {},
  },
  name: 'Formulário', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.2, position: pos(0, 1), webhookId: crypto.randomUUID(),
});
// ramos de cima (rodam primeiro): só leitura; os Codes buscam pelo nome do nó
add({ parameters: { operation: 'xlsx', binaryPropertyName: BIN_STATUS, options: { headerRow: false, includeEmptyCells: true, sheetName: 'Lista de Materiais' } },
  name: 'Lê Status PMIB', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(1, 0) });
add({ parameters: { operation: 'xlsx', binaryPropertyName: BIN_BASE, options: { headerRow: true, includeEmptyCells: true, sheetName: 'BASE' } },
  name: 'Lê BASE (gabarito)', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(1, 1), onError: 'continueRegularOutput' });
// ramo de baixo: PDFs → Loop (1 por volta) → texto por página → índice do documento
add({ parameters: { jsCode: SEPARA }, name: 'Separa PDFs', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(1, 2.5) });
add({ parameters: { batchSize: 1, options: {} }, name: 'Lote de documentos', type: 'n8n-nodes-base.splitInBatches', typeVersion: 3, position: pos(2, 2.5) });
add({ parameters: { operation: 'pdf', binaryPropertyName: 'data', options: { joinPages: false, keepSource: 'json' } },
  name: 'Lê PDF (por página)', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(3, 3.5), onError: 'continueRegularOutput' });
add({ parameters: { jsCode: INDEXA }, name: 'Indexa documento', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(4, 3.5) });
add({ parameters: { jsCode: MONTA }, name: 'Monta índice', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(3, 2) });
add({
  parameters: { operation: 'completion', respondWith: 'returnBinary', inputDataFieldName: 'data', completionTitle: 'Índice dos documentos', completionMessage: MENSAGEM },
  name: 'Entrega o índice', type: 'n8n-nodes-base.form', typeVersion: 1, position: pos(4, 2), webhookId: crypto.randomUUID(),
});
add({
  parameters: { content: '## LMR — A1 Índice dos documentos (sem IA)\n1. **Execute workflow** → envie **todos os PDFs** do sistema (pode selecionar vários), o **Status PMIB**, o **nome do sistema** e, se for teste, a **BASE LMR** do mesmo sistema (gabarito).\n2. **Deixe a aba do formulário aberta**: no fim ela mostra o resumo e baixa **ÍNDICE LMR - {sistema}.xlsx**.\n3. Me devolva só a **mensagem final** (números e assinatura). A planilha fica com você.\n4. ⋯ → *Settings* → *Save manual executions* = **Save**.\n\nO Loop lê **1 PDF por volta**. Se um PDF falhar, ele aparece com aviso na aba DOCUMENTOS e os outros seguem.', height: 340, width: 560 },
  name: 'Leia-me', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos(0, -1.8),
});

const connections = {};
const liga = (de, para, saida = 0) => {
  connections[de] = connections[de] || { main: [] };
  while (connections[de].main.length <= saida) connections[de].main.push([]);
  connections[de].main[saida].push({ node: para, type: 'main', index: 0 });
};
liga('Formulário', 'Lê Status PMIB');
liga('Formulário', 'Lê BASE (gabarito)');
liga('Formulário', 'Separa PDFs');
liga('Separa PDFs', 'Lote de documentos');
liga('Lote de documentos', 'Monta índice', 0); // done
liga('Lote de documentos', 'Lê PDF (por página)', 1); // loop
liga('Lê PDF (por página)', 'Indexa documento');
liga('Indexa documento', 'Lote de documentos');
liga('Monta índice', 'Entrega o índice');

const wf = { name: 'LMR - A1 Índice dos documentos', nodes, connections,
  settings: { executionOrder: 'v1', saveManualExecutions: true, saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all', saveExecutionProgress: true },
  pinData: {}, meta: { templateCredsSetupCompleted: true } };
const destino = path.join(__dirname, 'LMR_A1_indice_documentos.json');
fs.writeFileSync(destino, JSON.stringify(wf, null, 2));
console.log('ok', path.basename(destino), nodes.length, 'nós,', (fs.statSync(destino).size / 1024).toFixed(0), 'KB');

// ───────────────────────── versão Box: lê a pasta e grava o ÍNDICE nela ─────────────────────────
// Nó Box padrão do n8n (GET /folders/{id} devolve a lista de arquivos em item_collection, até 100).
// Se o AMP só tiver o GEV BOX, troque BOX abaixo pelo tipo dele e gere de novo.
const BOX = { type: 'n8n-nodes-base.box', typeVersion: 1 };
const CAMPO_PASTA = 'Pasta do Box (link ou ID)';
const LISTA = `const pasta = $input.first().json;
const itens = (pasta.item_collection && pasta.item_collection.entries) || [];
const papel = n => (/\\.pdf$/i.test(n) ? 'pdf' : !/\\.xlsx$/i.test(n) ? '' : /STATUS/i.test(n) ? 'status' : /^BASE/i.test(n) ? 'base' : '');
const r = itens.filter(e => e.type === 'file' && papel(e.name)).map(e => ({ json: { id: e.id, arquivo: e.name, papel: papel(e.name) } }));
if (!r.some(i => i.json.papel === 'status')) throw new Error('A pasta não tem o Status PMIB (.xlsx com STATUS no nome).');
if (pasta.item_collection && pasta.item_collection.total_count > itens.length) throw new Error('A pasta tem mais de ' + itens.length + ' itens: separe os PDFs numa subpasta.');
return r;`;
const ID_PASTA = `const v = String($input.first().json['${CAMPO_PASTA}'] || '').trim();
const m = v.match(/\\/folder\\/(\\d+)/) || v.match(/^(\\d+)$/);
if (!m) throw new Error('Cole o endereço da pasta como aparece no navegador (https://app.box.com/folder/123456789) ou só o número. Link compartilhado (/s/...) não serve.');
return [{ json: { pasta: m[1] } }];`;
const so = papel => `return $input.all().filter(i => i.json.papel === '${papel}')${papel === 'pdf' ? '' : '.slice(0, 1)'};`;

const nb = [];
const addB = n => (nb.push(n), n.name);
const igual = (nome, p, extra = {}) => addB({ ...nodes.find(n => n.name === nome), position: p, ...extra });
const baixa = (nome, p, opcional) => addB({ parameters: { resource: 'file', operation: 'download', fileId: '={{ $json.id }}', binaryPropertyName: 'data' },
  name: nome, type: BOX.type, typeVersion: BOX.typeVersion, position: p, ...(opcional ? { onError: 'continueRegularOutput' } : {}) });
addB({
  parameters: { formTitle: 'LMR — A1 Índice dos documentos (Box)',
    formDescription: 'Cole o link da pasta do Box com os PDFs do sistema e o Status PMIB (e, se for teste, a BASE LMR). Use o endereço do navegador (https://app.box.com/folder/…), não o link compartilhado. O ÍNDICE é gravado na mesma pasta.',
    formFields: { values: [{ fieldLabel: CAMPO_PASTA, fieldType: 'text', requiredField: true, placeholder: 'https://app.box.com/folder/123456789' }] }, options: {} },
  name: 'Formulário', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.2, position: pos(0, 1), webhookId: crypto.randomUUID(),
});
addB({ parameters: { jsCode: ID_PASTA }, name: 'ID da pasta', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(1, 1) });
addB({ parameters: { resource: 'folder', operation: 'get', folderId: '={{ $json.pasta }}' },
  name: 'Lê pasta (Box)', type: BOX.type, typeVersion: BOX.typeVersion, position: pos(1.5, 2) });
addB({ parameters: { jsCode: LISTA }, name: 'Lista arquivos', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(2, 1) });
// ramos de cima rodam primeiro: Status e BASE já lidos quando o Loop começa
addB({ parameters: { jsCode: so('status') }, name: 'Só Status', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(3, 0) });
baixa('Baixa Status (Box)', pos(4, 0));
igual('Lê Status PMIB', pos(5, 0), { parameters: { operation: 'xlsx', binaryPropertyName: 'data', options: { headerRow: false, includeEmptyCells: true, sheetName: 'Lista de Materiais' } } });
addB({ parameters: { jsCode: so('base') }, name: 'Só BASE', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(3, 1) });
baixa('Baixa BASE (Box)', pos(4, 1), true);
igual('Lê BASE (gabarito)', pos(5, 1), { parameters: { operation: 'xlsx', binaryPropertyName: 'data', options: { headerRow: true, includeEmptyCells: true, sheetName: 'BASE' } } });
addB({ parameters: { jsCode: so('pdf') }, name: 'Só PDFs', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(3, 2.5) });
igual('Lote de documentos', pos(4, 2.5));
baixa('Baixa PDF (Box)', pos(5, 3.5), true);
igual('Lê PDF (por página)', pos(6, 3.5));
igual('Indexa documento', pos(7, 3.5));
igual('Monta índice', pos(5, 2));
addB({ parameters: { resource: 'file', operation: 'upload', fileName: '={{ $binary.data.fileName }}', binaryData: true, binaryPropertyName: 'data',
  parentId: "={{ $('Lê pasta (Box)').first().json.id }}" }, name: 'Grava ÍNDICE no Box', type: BOX.type, typeVersion: BOX.typeVersion, position: pos(6, 1.4) });
igual('Entrega o índice', pos(6, 2.2), { webhookId: crypto.randomUUID() });
addB({
  parameters: { content: '## LMR — A1 Índice dos documentos (Box, sem IA)\n1. Nos nós **Box** (Lê pasta, Baixa…, Grava…) escolha a credencial do Box.\n2. **Execute workflow** → cole o **endereço da pasta** como aparece no navegador (`https://app.box.com/folder/123…`). Não é preciso ID de arquivo: o workflow lista a pasta e acha cada arquivo sozinho. A pasta deve ter os PDFs, o **Status PMIB** (com STATUS no nome) e, se for teste, a **BASE LMR** (gabarito).\n3. O **ÍNDICE LMR - {sistema}.xlsx** é gravado na mesma pasta e baixado na página final.\n4. Me devolva só a **mensagem final**.\n\nAté 100 itens na pasta. O Loop lê **1 PDF por volta**.', height: 340, width: 560 },
  name: 'Leia-me', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos(0, -1.8),
});
const cb = {};
const ligaB = (de, para, saida = 0) => {
  cb[de] = cb[de] || { main: [] };
  while (cb[de].main.length <= saida) cb[de].main.push([]);
  cb[de].main[saida].push({ node: para, type: 'main', index: 0 });
};
[['Formulário', 'ID da pasta'], ['ID da pasta', 'Lê pasta (Box)'], ['Lê pasta (Box)', 'Lista arquivos'], ['Lista arquivos', 'Só Status'], ['Lista arquivos', 'Só BASE'], ['Lista arquivos', 'Só PDFs'],
  ['Só Status', 'Baixa Status (Box)'], ['Baixa Status (Box)', 'Lê Status PMIB'], ['Só BASE', 'Baixa BASE (Box)'], ['Baixa BASE (Box)', 'Lê BASE (gabarito)'],
  ['Só PDFs', 'Lote de documentos'], ['Baixa PDF (Box)', 'Lê PDF (por página)'], ['Lê PDF (por página)', 'Indexa documento'], ['Indexa documento', 'Lote de documentos'],
  ['Monta índice', 'Grava ÍNDICE no Box'], ['Monta índice', 'Entrega o índice']].forEach(([de, para]) => ligaB(de, para));
ligaB('Lote de documentos', 'Monta índice', 0); // done
ligaB('Lote de documentos', 'Baixa PDF (Box)', 1); // loop
const wfBox = { ...wf, name: 'LMR - A1 Índice dos documentos (Box)', nodes: nb, connections: cb };
const destinoBox = path.join(__dirname, 'LMR_A1_indice_box.json');
fs.writeFileSync(destinoBox, JSON.stringify(wfBox, null, 2));
console.log('ok', path.basename(destinoBox), nb.length, 'nós,', (fs.statSync(destinoBox).size / 1024).toFixed(0), 'KB');

// ───────────────────────── testes locais ─────────────────────────
const INDICE = require('../indice/indice.js');
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const SAIDA = path.join(RAIZ, 'saida', 'teste_a1');
fs.mkdirSync(SAIDA, { recursive: true });

// T1 — separação das TAGs que o pdfjs cola
const casos = [
  ['QM306VQM307G', ['QM306V', 'QM307G']], ['BL315FL314S', ['BL315', 'FL314S']], ['PITBP316T', ['BP316T']],
  ['TITBT158TPITBP159T', ['BT158T', 'BP159T']], ['XK002XK002', ['XK002', 'XK002']], ['EJA530E', []], ['SU7621', []],
  ['VTV122', []], ['DN150', []], ['08934100PCC00', []], ['GP101', ['GP101']], ['HN101', ['HN101']],
];
for (const [s, esp] of casos) assert.deepStrictEqual(INDICE.segmenta(s), esp, `segmenta(${s})`);
assert.deepStrictEqual(INDICE.tagsDoTexto('BS141T,BS143T,BS\n160T e #ST00=M00MKF10UZ010-UZ001'), ['BS141T', 'BS143T', 'BS160T']);
assert.deepStrictEqual(INDICE.elevacoesDoTexto('EL 98.500 EL. 104,2 NIVEL 12.3').map(e => e.valor), ['98,50', '104,20']);
console.log('T1 ok  separação de TAGs, RDS-PP fora, quebra de linha, elevações');

// T2 — inventário pelo nome
const inv = n => { const r = INDICE.inventarioDoNome(n); return [r.codigo, r.tipo, r.revisao, r.avisos.length]; };
assert.deepStrictEqual(inv('#ST00=X00ABC10&MPB020[R1A].pdf'), ['#ST00=X00ABC10&MPB020', 'MPB', 'R1A', 0]);
assert.deepStrictEqual(inv('ST00=X00ABC10&MPB020[0].pdf'), ['#ST00=X00ABC10&MPB020', 'MPB', '0', 1]);
assert.deepStrictEqual(inv('#ST60=X01ABC10TB030-TB001&EMA010.[0C].pdf'), ['#ST60=X01ABC10TB030-TB001&EMA010', 'EMA', '0C', 0]);
assert.deepStrictEqual(inv('#ST00=X00ABC10UZ010-UZ901&MPA010[0]_lista_material_skid.pdf'), ['#ST00=X00ABC10UZ010-UZ901&MPA010', 'MPA', '0', 0]);
assert.deepStrictEqual(inv('Lista de materiais.pdf'), ['', '', '', 1]);
// o código do nome (válido) prevalece sobre o do carimbo; a diferença fica como aviso
const dNome = INDICE.indexaDocumento('#ST50=X00ABC10TB030&EFF010[0] - menor.pdf', ['CÓDIGO DE ITAIPU\n#ST00=X00ABC10&EDC090\nREVISÃO\n0 ref. #ST00=X00ABC10&EDC090'], []);
assert.strictEqual(dNome.doc.codigo, '#ST50=X00ABC10TB030&EFF010');
assert.match(dNome.doc.avisos.join('|'), /diferente do carimbo/);
console.log('T2 ok  inventário pelo nome do arquivo; o código do nome prevalece sobre o carimbo');

// T3 — workflow de ponta a ponta com documentos fictícios (texto no formato do pdfjs: mesma altura = colado)
const carimbo = c => `CÓDIGO DE ITAIPU\n${c}\nREVISÃO\n0`;
const DOCS_FICT = [
  { arquivo: '#ST00=X00ABC10&MPB020[0].pdf', paginas: [
    `${carimbo('#ST00=X00ABC10&MPB020')}\nLISTA DE SOBRESSALENTES`,
    `${carimbo('#ST00=X00ABC10&MPB020')}\n1.1\nBomba encapsulada\nGP101, GP102\nFabricante A\nF1015U-717\n1000001\nUN\n2\n1.2\nTransmissor de vibração\nBS141T, BS143T, BS\n160T\nFabricante B\nVTV122\n1000002\nUN\n2\n1.3\nResina\nFabricante C\nRX-100\n1000003\nL\n50`,
  ] },
  { arquivo: '#ST00=X00ABC10&MFB030[0]_P&ID.pdf', paginas: [
    `${carimbo('#ST00=X00ABC10&MFB030')}\nGP101GP102\nPITBP316TLITBL317T\nBS141TBS143TBS160T\nBL315FL314S\nEL 98.500\nDN150 - TE04s-AS\nmodelo EJA530E e SU7621\n#ST00=X00ABC10UZ010-UZ001`,
  ] },
  { arquivo: 'Diagrama escaneado.pdf', paginas: ['', ' ', ''] },
  { arquivo: '#ST00=X00ABC10&MLU010[0].pdf', erro: 'arquivo protegido por senha' },
];
const STATUS_FICT = [
  ['GERENCIAMENTO'], ['SISTEMA X | #ST00=X00ABC10&MPB020'], ['REVISÃO DA LISTA DE SOBRESSALENTES ATUAL EM USO: 0 - DATA'],
  ['ITEM', 'QTD.', 'UNID.', 'DESCRIÇÃO', 'CÓDIGO DO MATERIAL', 'CÓDIGO CMI', 'MARCA/MODELO', 'CÓDIGO PMIB', 'PDM usado', 'STATUS', 'TIPO DE ENTREGA'],
  [1, null, null, 'Conjunto', null, null, null, null, null, null, null],
  [1.1, 2, 'UN', 'Bomba encapsulada', 1000001, null, 'Fabricante A / F1015U-717', '1111111111.0001', '', 'EM ELABORAÇÃO', 'FÍSICA'],
  [1.2, 2, 'UN', 'Transmissor de vibração', 1000002, null, 'Fabricante B / VTV122', '1111111111.0002', '', 'EM ELABORAÇÃO', 'FÍSICA'],
  [1.3, 50, 'L', 'Resina', 1000003, null, 'Fabricante C / RX-100', '1111111111.0003', '', 'EM ELABORAÇÃO', 'FÍSICA'],
  [1.4, 1, 'UN', 'Válvula', 1000004, null, 'Fabricante D / V-9', '1111111111.0004', '', 'DUPLICADO', 'FÍSICA'],
];
const BASE_FICT = [
  { FICHA_PMIB: '1111111111.0001', TAG: 'GP101' }, { FICHA_PMIB: '1111111111.0001', TAG: 'GP102' },
  { FICHA_PMIB: '1111111111.0002', TAG: 'BS141T' }, { FICHA_PMIB: '1111111111.0002', TAG: 'BS143T' }, { FICHA_PMIB: '1111111111.0002', TAG: 'BS160T' },
  { FICHA_PMIB: '1111111111.0003', TAG: '' }, { FICHA_PMIB: '1111111111.0002', TAG: 'X.1' },
];

// imita o n8n: Separa → Loop (1 por volta) → Extract (joinPages=false, keepSource=json) → Indexa → done → Monta
async function rodaA1(docs, statusRows, base, nomeStatus, sistema) {
  const lidosStatus = statusRows.map(row => ({ json: { row } }));
  const lidosBase = base ? base.map(json => ({ json })) : [{ json: { error: 'sem binário' } }];
  const $ = no => ({
    all: () => (no === 'Lê Status PMIB' ? lidosStatus : no === 'Lê BASE (gabarito)' ? lidosBase : []),
    first: () => ({ json: sistema ? { [CAMPO_SISTEMA]: sistema } : {}, binary: { a: { fileName: 'x.pdf' }, b: { fileName: nomeStatus } } }),
    itemMatching: () => { throw new Error('sem pareamento no teste'); },
  });
  const voltas = [];
  for (const d of docs) {
    const extraido = d.erro ? { error: d.erro, arquivo: d.arquivo } : { arquivo: d.arquivo, numpages: d.paginas.length, text: d.paginas };
    const out = await new AsyncFn('$', '$input', INDEXA)($, { all: () => [{ json: extraido }] });
    voltas.push(...out.map(o => ({ json: JSON.parse(JSON.stringify(o.json)) })));
  }
  const [r] = await new AsyncFn('$', '$input', MONTA)($, { all: () => voltas });
  return r;
}
const leXlsx = arq => JSON.parse(require('child_process').execFileSync('python', ['-X', 'utf8', '-c',
  'import openpyxl,json,sys\nwb=openpyxl.load_workbook(sys.argv[1])\nprint(json.dumps({ws.title:[list(r) for r in ws.iter_rows(values_only=True)] for ws in wb},ensure_ascii=False,default=str))', arq], { encoding: 'utf8', maxBuffer: 1 << 28 }));

(async () => {
  const r = await rodaA1(DOCS_FICT, STATUS_FICT, BASE_FICT, '#ST00=X00ABC10&MPB020_STATUS_PMIB - Sistema X.xlsx');
  const arq = path.join(SAIDA, r.binary.data.fileName);
  fs.writeFileSync(arq, Buffer.from(r.binary.data.data, 'base64'));
  const x = leXlsx(arq);
  const j = r.json;
  assert.strictEqual(r.binary.data.fileName, 'ÍNDICE LMR - Sistema X.xlsx');
  assert.strictEqual(j.documentos, 4);
  assert.strictEqual(j.semTexto, 3);
  assert.strictEqual(j.materiais, 3); // o DUPLICADO sai
  assert.strictEqual(j.materiaisAchados, 3);
  assert.ok(!x['CÓDIGOS PADRÃO KKS'] && !x.TAGS, 'sem a aba de códigos KKS: as TAGs variam de formato por sistema');
  assert.ok(!x.DOCUMENTOS[0].includes('TAGS'), 'DOCUMENTOS sem a contagem de códigos KKS');
  const mats = Object.fromEntries(x.MATERIAIS.slice(1).map(l => [l[2], l]));
  const colSug = x.MATERIAIS[0].indexOf('TAGS DA LISTA (SUGESTÃO)');
  assert.strictEqual(mats['1111111111.0001'][colSug], 'GP101, GP102');
  assert.strictEqual(mats['1111111111.0002'][colSug], 'BS141T, BS143T, BS160T');
  assert.strictEqual(mats['1111111111.0003'][colSug], null);
  assert.deepStrictEqual(j.conferencia, { tags: 6, candidatas: 5, soTexto: 0, curtas: 1, pmibs: 3, iguais: 2 });
  const conf = Object.fromEntries(x['CONFERÊNCIA TAGS'].slice(1).map(l => [l[0], l[2]]));
  assert.strictEqual(conf['X.1'], 'CURTA (conferir à mão)');
  assert.ok(x.RESUMO.some(l => /curtas demais/.test(l[0]) && l[1] === 1));
  const docs = Object.fromEntries(x.DOCUMENTOS.slice(1).map(l => [l[0], l]));
  const colAv = x.DOCUMENTOS[0].indexOf('AVISOS');
  assert.match(docs['#ST00=X00ABC10&MLU010[0].pdf'][colAv], /PDF não lido: arquivo protegido/);
  assert.match(docs['Diagrama escaneado.pdf'][colAv], /nome sem código/);
  assert.deepStrictEqual(x['SEM TEXTO'].slice(1).map(l => l[2]), ['1-3']);
  assert.deepStrictEqual(x['ELEVAÇÕES'].slice(1).map(l => l[0]), ['98,50']);
  assert.strictEqual(x['PÁGINAS'].length - 1, 6);
  assert.deepStrictEqual(x['PÁGINAS'][0], ['ARQUIVO', 'CÓDIGO', 'PÁGINA', 'CARACTERES', 'TEXTO1']);
  assert.match(j.mensagem, new RegExp('^' + ['4 documentos, 6 páginas \\(3 sem texto\\)', '3 de 3 materiais do Status achados',
'Gabarito: 5 de 6 TAGs da BASE achadas \\(5 candidatas, 0 só no texto; 1 curtas para conferir à mão\\)',
    '2 de 3 PMIBs com TAGs sugeridas iguais às da BASE', 'Documentos com aviso \\(2\\): Diagrama escaneado\\.pdf, #ST00=X00ABC10&MLU010\\[0\\]\\.pdf',
    '\\d+ KB$'].join(' · ')));
  console.log('T3 ok  ponta a ponta (fictício):', JSON.stringify({ tags: j.tags, assinatura: j.assinatura, conferencia: j.conferencia }));

  // T5 — campo Sistema; página longa em TEXTO1..n (lida de volta pelo agente.js); TAG da BASE não achada; sem gabarito
  const AGENTE = require('../agente/agente.js');
  const LMR = require('../lmr.js');
  const longa = Array.from({ length: 7000 }, (_, i) => `linha ${String(i).padStart(4, '0')}`).join('\n'); // ~70 mil caracteres
  const DOCS5 = [...DOCS_FICT.slice(0, 2), { arquivo: '#ST00=X00ABC10&ACC010[0].pdf', paginas: [longa, 'GP101 fim do workstatement'] }];
  const r5 = await rodaA1(DOCS5, STATUS_FICT, [...BASE_FICT, { FICHA_PMIB: '1111111111.0003', TAG: 'ZZ999X' }], 'qualquer.xlsx', 'Água Teste');
  assert.strictEqual(r5.binary.data.fileName, 'ÍNDICE LMR - Água Teste.xlsx');
  const arq5 = path.join(SAIDA, r5.binary.data.fileName);
  fs.writeFileSync(arq5, Buffer.from(r5.binary.data.data, 'base64'));
  const pags = leXlsx(arq5)['PÁGINAS'];
  assert.deepStrictEqual(pags[0], ['ARQUIVO', 'CÓDIGO', 'PÁGINA', 'CARACTERES', 'TEXTO1', 'TEXTO2', 'TEXTO3']);
  const linhaLonga = pags.find(l => l[0] === '#ST00=X00ABC10&ACC010[0].pdf' && l[2] === 1);
  assert.strictEqual(linhaLonga[3], longa.length);
  assert.strictEqual(linhaLonga.slice(4).join(''), longa, 'TEXTO1..3 juntos = a página inteira');
  const objs = pags.slice(1).map(l => Object.fromEntries(pags[0].map((c, i) => [c, l[i]])));
  const relidos = AGENTE.indexadosDoRoteiro(objs, LMR.lerStatusPmib(STATUS_FICT).catalogo);
  const relida = relidos.find(d => d.doc.arquivo === '#ST00=X00ABC10&ACC010[0].pdf');
  assert.deepStrictEqual(relida.paginas.map(p => p.texto), [longa, 'GP101 fim do workstatement'], 'indexadosDoRoteiro remonta o texto');
  assert.match(r5.json.mensagem, / · TAGs da BASE não achadas \(1\): ZZ999X · /);
  assert.match(r5.json.mensagem, / · 1 páginas em mais de uma coluna de texto · /);
  const r6 = await rodaA1(DOCS_FICT.slice(0, 2), STATUS_FICT, null, '#ST00=X00ABC10&MPB020_STATUS_PMIB - Sistema X.xlsx');
  assert.strictEqual(r6.binary.data.fileName, 'ÍNDICE LMR - Sistema X.xlsx', 'sem o campo, o nome sai do arquivo do Status');
  assert.ok(!/Gabarito/.test(r6.json.mensagem));
  console.log('T5 ok  campo Sistema, página longa em TEXTO1..3 (relida pelo agente.js), TAG não achada, sem gabarito');

  // T4 (só local) — PDFs reais: texto extraído como o n8n (indice/extrai_como_n8n.mjs → dados/textos_{sistema}.json),
  // conferido contra o Status e a BASE do mesmo sistema. Os dados reais ficam fora do repositório.
  const D = path.join(RAIZ, 'dados');
  const SISTEMAS = { agua_pura: 'Água Pura', aeracao: 'Aeração Axial', regvel: 'Reg. Vel. e Pot. Hidráulica', sfc: 'SFC HF-01 e HF-02' };
  for (const [n, nome] of Object.entries(SISTEMAS)) {
    const arqTextos = path.join(D, `textos_${n}.json`);
    if (!fs.existsSync(arqTextos)) { console.log(`T4 —   ${nome}: sem textos extraídos`); continue; }
    const docs4 = JSON.parse(fs.readFileSync(arqTextos, 'utf8'));
    const status = JSON.parse(fs.readFileSync(path.join(D, `status_${n}.json`), 'utf8')).linhas;
    const base = JSON.parse(fs.readFileSync(path.join(D, `base_${n}.json`), 'utf8')).base;
    const t0 = Date.now();
    const r4 = await rodaA1(docs4, status, base, `X_STATUS_PMIB - ${nome}.xlsx`);
    fs.writeFileSync(path.join(SAIDA, r4.binary.data.fileName), Buffer.from(r4.binary.data.data, 'base64'));
    const j4 = r4.json;
    console.log(`T4     ${nome}: ${j4.documentos} docs, ${j4.paginas} p. (${j4.semTexto} sem texto), ${j4.tags} TAGs, materiais ${j4.materiaisAchados}/${j4.materiais}, `
      + `sugestão ${j4.comSugestao} · conferência ${JSON.stringify(j4.conferencia)} · ${j4.kb} KB · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  console.log('TUDO OK');
})().catch(e => { console.error('FALHOU', e.stack); process.exit(1); });

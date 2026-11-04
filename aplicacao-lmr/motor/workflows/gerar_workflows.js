/*
 * Gera o workflow "LMR - B Gerar aplicação a partir da Base" para importar no n8n do AMP.
 * Entrada (formulário): o arquivo da Base da Aplicação (.xlsx, abas BASE e DOCS DE REFERÊNCIA).
 * Saída: APLICAÇÃO LMR no formato do template (abas DOCS DE REFERÊNCIA, DESCRIÇÃO DOCUMENTOS e APLICAÇÃO - LMR),
 *        entregue na página final; VALIDAÇÃO à parte (na execução).
 *
 * Desenho (v1.6): o Code nunca vê a aplicação inteira. Um Loop entrega 20 linhas da Base por volta,
 * o Code expande só essas. No fim, um Code monta o .xlsx com as peças do template (planilha.js).
 *
 * Uso: node workflows/gerar_workflows.js   (gera e testa localmente com as 5 Bases)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MOTOR = fs.readFileSync(path.join(__dirname, '..', 'lmr.js'), 'utf8');
const PLANILHA_JS = fs.readFileSync(path.join(__dirname, '..', 'planilha.js'), 'utf8');
const PARTES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dados', 'template_partes.json'), 'utf8'));
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const LOTE = 20;
const pos = (col, lin = 0) => [col * 260, lin * 200];
const CAMPO_BASE = 'Base da Aplicação (.xlsx)';
const BINARIO = '={{ Object.keys($binary)[0] }}';

const GERA = `${MOTOR}
// ───── Uma volta do Loop: até ${LOTE} linhas da Base → linhas da aplicação + achados ─────
// TAGs da Base inteira (V6: a TAG do pai citada no CÓDIGO tem de existir como TAG de material).
const tags = new Set();
for (const i of $('Lê BASE').all()) for (const t of LMR.txt(i.json.TAG).split('/')) if (t) tags.add(t);
const lote = $input.all().map(i => i.json).filter(r => LMR.txt(r.FICHA_PMIB));
return LMR.geraLote(lote, tags).map(json => ({ json }));`;

// Fim do Loop: junta as linhas, a DOCS e o CABEÇALHO da Base e monta a planilha no formato do template.
const MONTA = `${PLANILHA_JS}
const PARTES = ${JSON.stringify(PARTES)};
const ler = no => { try { return $(no).all().map(i => i.json).filter(r => !r.error); } catch (e) { return []; } };
const t = v => (v == null ? '' : String(v).trim());
const cabecalho = {};
for (const r of ler('Lê CABEÇALHO')) if (t(r.CAMPO)) cabecalho[t(r.CAMPO)] = t(r.VALOR);
// TAGS da DOCS DE REFERÊNCIA refeitas a partir da BASE (valem as edições feitas na BASE)
const tags = {};
for (const r of ler('Lê BASE')) if (t(r.FICHA_PMIB) && t(r.TAG)) (tags[t(r.FICHA_PMIB)] = tags[t(r.FICHA_PMIB)] || new Set()).add(t(r.TAG));
const docs = ler('Lê DOCS DE REFERÊNCIA').filter(d => t(d['CÓDIGO PMIB']))
  .map(d => ({ ...d, TAGS: [...(tags[t(d['CÓDIGO PMIB'])] || [])].sort().join(', ') }));
const linhas = [];
for (const i of $input.all()) for (const l of i.json.linhas || []) linhas.push(l);
const bytes = PLANILHA.montaAplicacaoXlsx(PARTES, { cabecalho, docs, linhas });
const enviado = Object.values($('Formulário').first().binary || {})[0] || {};
const sistema = t(enviado.fileName).replace(/\\.xlsx$/i, '').replace(/^BASE LMR\\s*-\\s*/i, '') || 'Base';
const nome = 'APLICAÇÃO LMR - ' + sistema + '.xlsx';
return [{ json: { arquivo: nome, linhas: linhas.length, materiaisNaDocs: docs.length, kb: Math.round(bytes.length / 1024) },
  binary: { data: { data: PLANILHA.base64(bytes), mimeType: '${XLSX_MIME}', fileName: nome, fileExtension: 'xlsx' } } }];`;

// Assinatura = nº de linhas + soma dos hashes das linhas (não depende da ordem nem do lote).
const ITENS = "$('Lote da Base').all(0)";
const SOMA = campo => `${ITENS}.reduce((a, i) => a + i.json.${campo}, 0)`;
const MENSAGEM = `={{ 'Assinatura ' + ${SOMA('n')} + '-' + (${SOMA('h')} % 4294967296).toString(16).toUpperCase().padStart(8, '0') + ' · ' + ${ITENS}.length + ' linhas da Base → ' + ${SOMA('n')} + ' linhas na aplicação, ' + ${SOMA('bloqueadas')} + ' bloqueadas. A VALIDAÇÃO está na execução (aba Executions).' }}`;

// ── nós ──
const nodes = [];
const add = n => (nodes.push(n), n.name);
const extrai = (nome, aba, p, opcional) => add({
  parameters: { operation: 'xlsx', binaryPropertyName: BINARIO, options: { headerRow: true, includeEmptyCells: true, sheetName: aba } },
  name: nome, type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: p,
  ...(opcional ? { onError: 'continueRegularOutput' } : {}),
});
const arquivo = (nome, arq, aba, p) => add({ parameters: { operation: 'xlsx', options: { fileName: arq, sheetName: aba } },
  name: nome, type: 'n8n-nodes-base.convertToFile', typeVersion: 1.1, position: p });
const separa = (nome, campo, p) => add({ parameters: { fieldToSplitOut: campo, include: 'noOtherFields', options: {} },
  name: nome, type: 'n8n-nodes-base.splitOut', typeVersion: 1, position: p });

add({
  parameters: {
    formTitle: 'LMR — Gerar aplicação a partir da Base',
    formDescription: 'Envie o arquivo da Base da Aplicação (abas BASE e DOCS DE REFERÊNCIA). No fim esta página mostra a assinatura e baixa a APLICAÇÃO LMR.',
    formFields: { values: [{ fieldLabel: CAMPO_BASE, fieldType: 'file', multipleFiles: false, acceptFileTypes: '.xlsx', requiredField: true }] },
    options: {},
  },
  name: 'Formulário', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.2, position: pos(0, 1), webhookId: crypto.randomUUID(),
});
// ramos de cima (rodam primeiro): CABEÇALHO e DOCS DE REFERÊNCIA só são lidos; o Code do fim busca pelo nome do nó
extrai('Lê CABEÇALHO', 'CABEÇALHO', pos(1, 0), true);
extrai('Lê DOCS DE REFERÊNCIA', 'DOCS DE REFERÊNCIA', pos(1, 1), true);
// ramo de baixo: BASE → Loop → Code por lote → achados e planilha final
extrai('Lê BASE', 'BASE', pos(1, 2.5));
add({ parameters: { batchSize: LOTE, options: {} }, name: 'Lote da Base', type: 'n8n-nodes-base.splitInBatches', typeVersion: 3, position: pos(2, 2.5) });
add({ parameters: { jsCode: GERA }, name: 'Gera linhas do lote', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(3, 3.5) });
separa('Achados', 'achados', pos(4, 1.5));
arquivo('Arquivo VALIDAÇÃO', 'VALIDAÇÃO.xlsx', 'VALIDAÇÃO', pos(5, 1.5));
add({ parameters: { jsCode: MONTA }, name: 'Monta aplicação (template)', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(4, 2.5) });
add({
  parameters: { operation: 'completion', respondWith: 'returnBinary', inputDataFieldName: 'data', completionTitle: 'Aplicação LMR gerada', completionMessage: MENSAGEM },
  name: 'Entrega a aplicação', type: 'n8n-nodes-base.form', typeVersion: 1, position: pos(5, 2.5), webhookId: crypto.randomUUID(),
});
add({
  parameters: { content: `## LMR — B Gerar aplicação a partir da Base\n1. **Execute workflow** → envie o arquivo **BASE LMR - {sistema}.xlsx**.\n2. **Deixe a aba do formulário aberta**: no fim ela mostra a assinatura e baixa a **APLICAÇÃO LMR** no formato do template (DOCS DE REFERÊNCIA, DESCRIÇÃO DOCUMENTOS, APLICAÇÃO - LMR).\n3. VALIDAÇÃO: aba **Executions** → abra a execução → nó **Arquivo VALIDAÇÃO** → *Binary* → *Download*.\n4. ⋯ → *Settings* → *Save manual executions* = **Save**.\n\nO Loop entrega ${LOTE} linhas da Base por volta ao Code. Se o Code reclamar de tempo, baixe o *Batch Size* do nó **Lote da Base**.`, height: 320, width: 560 },
  name: 'Leia-me', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos(0, -1.8),
});

// ── conexões ──
const connections = {};
const liga = (de, para, saida = 0) => {
  connections[de] = connections[de] || { main: [] };
  while (connections[de].main.length <= saida) connections[de].main.push([]);
  connections[de].main[saida].push({ node: para, type: 'main', index: 0 });
};
liga('Formulário', 'Lê CABEÇALHO');
liga('Formulário', 'Lê DOCS DE REFERÊNCIA');
liga('Formulário', 'Lê BASE');
liga('Lê BASE', 'Lote da Base');
liga('Lote da Base', 'Achados', 0); // saída "done": tudo o que voltou do Code
liga('Lote da Base', 'Monta aplicação (template)', 0);
liga('Lote da Base', 'Gera linhas do lote', 1); // saída "loop": o lote da vez
liga('Gera linhas do lote', 'Lote da Base');
liga('Achados', 'Arquivo VALIDAÇÃO');
liga('Monta aplicação (template)', 'Entrega a aplicação');

const wf = { name: 'LMR - B Gerar aplicação a partir da Base (v1.6)', nodes, connections,
  settings: { executionOrder: 'v1', saveManualExecutions: true, saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all', saveExecutionProgress: true },
  pinData: {}, meta: { templateCredsSetupCompleted: true } };
const destino = path.join(__dirname, 'LMR_B_gerar_aplicacao.json');
fs.writeFileSync(destino, JSON.stringify(wf, null, 2));
console.log('ok', path.basename(destino), nodes.length, 'nós,', (fs.statSync(destino).size / 1024).toFixed(0), 'KB');

// ── teste local: imita Extract (aba BASE relida do .xlsx), Loop, Code, Split Out e a mensagem final ──
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const D = path.join(__dirname, '..', 'dados');
const esperado = JSON.parse(fs.readFileSync(path.join(D, 'bases_resumo.json'), 'utf8'));
let falhas = 0;
(async () => {
  for (const n of Object.keys(esperado)) {
    const lidos = JSON.parse(fs.readFileSync(path.join(D, `base_lida_${n}.json`), 'utf8')).map(json => ({ json }));
    const voltas = [];
    let maior = 0;
    for (let i = 0; i < lidos.length; i += LOTE) {
      const lote = lidos.slice(i, i + LOTE);
      const $ = no => ({ all: () => (no === 'Lê BASE' ? lidos : []) });
      const out = await new AsyncFn('$', '$input', GERA)($, { all: () => lote });
      maior = Math.max(maior, JSON.stringify(out).length);
      voltas.push(...out);
    }
    const $ = () => ({ all: () => voltas });
    const msg = new Function('$', 'return ' + MENSAGEM.slice(3, -2))($);
    const linhas = voltas.flatMap(v => v.json.linhas);
    const B = JSON.parse(fs.readFileSync(path.join(D, `base_${n}.json`), 'utf8'));
    const saidasMonta = { 'Lê CABEÇALHO': Object.entries(B.cabecalho).map(([CAMPO, VALOR]) => ({ json: { CAMPO, VALOR } })),
      'Lê DOCS DE REFERÊNCIA': B.docs.map(json => ({ json })), 'Lê BASE': lidos,
      'Formulário': [{ json: {}, binary: { [CAMPO_BASE]: { fileName: `BASE LMR - ${n}.xlsx` } } }] };
    const $m = no => ({ all: () => saidasMonta[no], first: () => saidasMonta[no][0] });
    const [final] = await new AsyncFn('$', '$input', MONTA)($m, { all: () => voltas });
    const SAIDA = path.join(__dirname, '..', 'saida', 'teste_b');
    fs.mkdirSync(SAIDA, { recursive: true });
    fs.writeFileSync(path.join(SAIDA, final.binary.data.fileName), Buffer.from(final.binary.data.data, 'base64'));
    const achados = voltas.flatMap(v => v.json.achados);
    const e = esperado[n];
    const ok = msg.startsWith(`Assinatura ${e.assinatura} `) && linhas.length === e.linhas && msg.includes(` ${e.bloqueadas} bloqueadas`);
    if (!ok) falhas++;
    console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${n}: ${msg.split(' · ')[0]} · ${linhas.length} linhas, ${achados.length} achados · maior saída do Code ${(maior / 1024).toFixed(0)} KB · ${final.json.arquivo} ${final.json.kb} KB, DOCS ${final.json.materiaisNaDocs}`);
  }
  process.exit(falhas ? 1 : 0);
})();

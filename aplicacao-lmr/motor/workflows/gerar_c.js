/*
 * Gera os workflows do C (alterações sobre a Base) para importar no n8n do AMP:
 *   LMR_C1_comparar_status.json  — Base + Status PMIB novo → planilha ALTERAÇÕES (você marca APLICAR = SIM)
 *   LMR_C2_aplicar_alteracoes.json — Base + ALTERAÇÕES revisada → Base nova (HISTÓRICO e DIFERENÇAS)
 * Depois do C2, a Base nova vai para o Workflow B.
 *
 * Mesmo desenho do B: cada aba é lida por um Extract ligado direto ao formulário; um Code só, no fim, com
 * pouco dado (Status ~150 linhas, Base ≤ 1.200 linhas).
 * Uso: node workflows/gerar_c.js   (gera e testa localmente: caso real da Reg. Vel.)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const MOTOR = fs.readFileSync(path.join(RAIZ, 'lmr.js'), 'utf8');
const PLANILHA_JS = fs.readFileSync(path.join(RAIZ, 'planilha.js'), 'utf8');
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const pos = (col, lin = 0) => [col * 260, lin * 200];

// Escolhe o arquivo pelo nome; se o nome não ajudar, pela ordem dos campos do formulário.
const binario = (re, ordem) => `={{ Object.keys($binary).find(k => ${re}.test($binary[k].fileName || '')) || Object.keys($binary)[${ordem}] }}`;
const BIN_BASE = binario('/BASE/i', 0);

// Funções comuns dos dois Codes: leitura das abas e entrega do arquivo
const COMUM = `${MOTOR}
${PLANILHA_JS}
const ler = no => { try { return $(no).all().map(i => i.json).filter(r => !r.error); } catch (e) { return []; } };
const t = v => (v == null ? '' : String(v).trim());
const arquivo = (bytes, nome) => ({ data: { data: PLANILHA.base64(bytes), mimeType: '${XLSX_MIME}', fileName: nome, fileExtension: 'xlsx' } });
const enviado = re => Object.values($('Formulário').first().binary || {}).find(b => re.test(b.fileName || '')) || Object.values($('Formulário').first().binary || {})[0] || {};
const sistema = t(enviado(/BASE/i).fileName).replace(/\\.xlsx$/i, '').replace(/^BASE LMR\\s*-\\s*/i, '').replace(/\\s*-\\s*\\d{4}-\\d{2}-\\d{2}( \\d+)?$/, '') || 'Base';`;

const LEIA_ME_ALT = [
  'ALTERAÇÕES — como revisar',
  '',
  'Cada linha é uma alteração sugerida pela comparação entre a Base e o Status PMIB novo.',
  'APLICAR = SIM → o Workflow C2 aplica. Vazio ou NÃO → fica só no HISTÓRICO como ignorada.',
  'Descrição e part number seguem o Status e já vêm com SIM. Substituir, excluir e incluir vêm vazios: confirme.',
  '',
  'TIPO: SUBSTITUIR_MATERIAL, EXCLUIR, INCLUIR, ALTERAR_QTD, ATUALIZAR_DESCRICAO, ATUALIZAR_PART_NUMBER.',
  'EXCLUIR que na verdade é troca: mude TIPO para SUBSTITUIR_MATERIAL e preencha PMIB NOVO (e DESCRIÇÃO NOVA / PART NUMBER NOVO).',
  'INCLUIR: para o material entrar na aplicação, preencha COPIAR POSIÇÕES DE com o PMIB cujas posições ele ocupa',
  '         (e QTD POR TRECHO, se diferente). Sem isso ele entra só na DOCS DE REFERÊNCIA.',
  'TRECHOS (opcional): restringe a alteração. ÍMPARES, PARES, AMD, AMC ou lista (U-01, U-09A, AMD-02).',
  'ALTERAR_QTD: PMIB ATUAL + QTD POR TRECHO (+ TRECHOS). Vale por posição (linha da BASE).',
  'Você pode acrescentar linhas à mão, com qualquer TIPO acima. Não mude os nomes das colunas.',
];

const C1_CODE = `${COMUM}
// ───── C1: Status PMIB novo × Base → ALTERAÇÕES ─────
const statusRows = $('Lê Status PMIB').all().filter(i => !i.json.error)
  .map(i => (Array.isArray(i.json) ? i.json : Array.isArray(i.json.row) ? i.json.row : Object.values(i.json)));
const r = LMR.comparaBaseStatus({ statusRows, base: ler('Lê BASE'), docs: ler('Lê DOCS DE REFERÊNCIA'), relacoes: ler('Lê RELAÇÕES') });
const bytes = PLANILHA.planilhaSimples([
  { nome: 'ALTERAÇÕES', colunas: LMR.COLUNAS_ALTERACOES, linhas: r.alteracoes, numeros: ['Nº'],
    larguras: { 'Nº': 5, TIPO: 24, APLICAR: 9, 'PMIB ATUAL': 17, 'PMIB NOVO': 17, 'DESCRIÇÃO NOVA': 45, 'PART NUMBER NOVO': 22, TRECHOS: 16, 'QTD POR TRECHO': 9, 'COPIAR POSIÇÕES DE': 17, 'ONDE NA BASE': 34, MOTIVO: 70 } },
  { nome: 'LEIA-ME', colunas: ['T'], linhas: ${JSON.stringify(LEIA_ME_ALT)}.concat(['', 'Status: ' + (r.resumo.lista || '') + ' rev. ' + (r.resumo.revisao || '') + ' · ' + r.resumo.pmibsNoStatus + ' PMIBs no Status, ' + r.resumo.pmibsNaBase + ' na BASE'], (r.resumo.avisos || []).map(a => 'Aviso do Status: ' + a)).map(T => ({ T })), larguras: { T: 120 }, texto: true },
]);
const confirmar = r.alteracoes.filter(a => a.APLICAR === '').length;
const nome = 'ALTERAÇÕES - ' + sistema + '.xlsx';
return [{ json: { arquivo: nome, sugestoes: r.alteracoes.length, aConfirmar: confirmar, porTipo: r.alteracoes.reduce((m, a) => (m[a.TIPO] = (m[a.TIPO] || 0) + 1, m), {}) },
  binary: arquivo(bytes, nome) }];`;

const C2_CODE = `${COMUM}
// ───── C2: Base + ALTERAÇÕES revisada → Base nova ─────
const hoje = new Date().toISOString().slice(0, 10);
const cabecalho = {};
for (const r of ler('Lê CABEÇALHO')) if (t(r.CAMPO)) cabecalho[t(r.CAMPO)] = t(r.VALOR);
const base = ler('Lê BASE');
const r = LMR.aplicaAlteracoes({ base, docs: ler('Lê DOCS DE REFERÊNCIA'), relacoes: ler('Lê RELAÇÕES'), historico: ler('Lê HISTÓRICO'),
  alteracoes: ler('Lê ALTERAÇÕES').filter(a => t(a.TIPO)), data: hoje });
const conta = (rs, re) => rs.filter(h => h.DATA === hoje && re.test(h.RESULTADO)).length;
const linhasAplic = rs => rs.reduce((s, x) => s + t(x.TRECHOS).split(/[,;\\s]+/).filter(Boolean).length * (Number(x['QTD POR TRECHO']) || 0), 0);
const bytes = PLANILHA.planilhaDaBase({ colunasBase: LMR.COLUNAS_BASE, base: r.base, cabecalho, docs: r.docs, relacoes: r.relacoes,
  historico: r.historico, diferencas: r.diferencas, colunasHistorico: LMR.COLUNAS_HISTORICO, colunasDiferencas: LMR.COLUNAS_DIFERENCAS });
const nome = 'BASE LMR - ' + sistema + ' - ' + hoje + '.xlsx';
return [{ json: { arquivo: nome, aplicadas: conta(r.historico, /^aplicada/), ignoradas: conta(r.historico, /^ignorada/), recusadas: conta(r.historico, /^não aplicada/),
    linhasDaBase: base.length + ' → ' + r.base.length, linhasDaAplicacao: linhasAplic(base) + ' → ' + linhasAplic(r.base), avisos: r.avisos },
  binary: arquivo(bytes, nome) }];`;

// ── montagem dos workflows ──
function workflow(nome, campos, leituras, ultima, codigo, mensagem, leiaMe) {
  const nodes = [];
  const connections = {};
  const add = n => (nodes.push(n), n.name);
  const liga = (de, para) => { (connections[de] = connections[de] || { main: [[]] }).main[0].push({ node: para, type: 'main', index: 0 }); };
  add({ parameters: { formTitle: nome, formDescription: leiaMe.split('\n')[1] || '', formFields: { values: campos.map(fieldLabel => ({ fieldLabel, fieldType: 'file', multipleFiles: false, acceptFileTypes: '.xlsx', requiredField: true })) }, options: {} },
    name: 'Formulário', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.2, position: pos(0, leituras.length / 2), webhookId: crypto.randomUUID() });
  // leituras de cima rodam primeiro; a última (embaixo) segue para o Code
  [...leituras, ultima].forEach(([no, aba, bin, cabecalho = true, opcional = true], i) => {
    add({ parameters: { operation: 'xlsx', binaryPropertyName: bin, options: { headerRow: cabecalho, includeEmptyCells: true, sheetName: aba } },
      name: no, type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(1, i), ...(opcional ? { onError: 'continueRegularOutput' } : {}) });
    liga('Formulário', no);
  });
  add({ parameters: { jsCode: codigo }, name: 'Processa', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(2, leituras.length) });
  add({ parameters: { operation: 'completion', respondWith: 'returnBinary', inputDataFieldName: 'data', completionTitle: nome, completionMessage: mensagem },
    name: 'Entrega', type: 'n8n-nodes-base.form', typeVersion: 1, position: pos(3, leituras.length), webhookId: crypto.randomUUID() });
  add({ parameters: { content: leiaMe, height: 300, width: 560 }, name: 'Leia-me', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos(0, -1.8) });
  liga(ultima[0], 'Processa');
  liga('Processa', 'Entrega');
  return { name: nome, nodes, connections,
    settings: { executionOrder: 'v1', saveManualExecutions: true, saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all', saveExecutionProgress: true },
    pinData: {}, meta: { templateCredsSetupCompleted: true } };
}

const C1 = workflow('LMR - C1 Comparar Status PMIB com a Base', ['Base da Aplicação (.xlsx)', 'Status PMIB novo (.xlsx)'],
  [['Lê BASE', 'BASE', BIN_BASE, true, false], ['Lê DOCS DE REFERÊNCIA', 'DOCS DE REFERÊNCIA', BIN_BASE], ['Lê RELAÇÕES', 'RELAÇÕES', BIN_BASE]],
  ['Lê Status PMIB', 'Lista de Materiais', binario('/STATUS/i', 1), false, false],
  C1_CODE,
  "={{ $json.sugestoes + ' sugestões (' + $json.aConfirmar + ' para confirmar). Revise a coluna APLICAR na planilha baixada e use o C2.' }}",
  '## LMR — C1 Comparar Status PMIB com a Base\nEnvie a Base e o Status PMIB novo. Sai a planilha ALTERAÇÕES.\n\n1. **Execute workflow** → envie os dois arquivos (Base no 1º campo, Status no 2º).\n2. A página final baixa **ALTERAÇÕES - {sistema}.xlsx**.\n3. Revise a coluna **APLICAR** (SIM / NÃO) e as colunas de apoio; veja a aba LEIA-ME.\n4. Rode o **C2** com a Base e a planilha revisada.');

const C2 = workflow('LMR - C2 Aplicar alterações na Base', ['Base da Aplicação (.xlsx)', 'ALTERAÇÕES revisada (.xlsx)'],
  [['Lê BASE', 'BASE', BIN_BASE, true, false], ['Lê CABEÇALHO', 'CABEÇALHO', BIN_BASE], ['Lê DOCS DE REFERÊNCIA', 'DOCS DE REFERÊNCIA', BIN_BASE],
    ['Lê RELAÇÕES', 'RELAÇÕES', BIN_BASE], ['Lê HISTÓRICO', 'HISTÓRICO', BIN_BASE]],
  ['Lê ALTERAÇÕES', 'ALTERAÇÕES', binario('/ALTERA/i', 1), true, false],
  C2_CODE,
  "={{ $json.aplicadas + ' aplicadas, ' + $json.ignoradas + ' ignoradas, ' + $json.recusadas + ' recusadas · linhas da aplicação ' + $json.linhasDaAplicacao + ($json.avisos.length ? ' · AVISOS: ' + $json.avisos.join(' | ') : '') + '. Confira o HISTÓRICO na Base nova e rode o Workflow B com ela.' }}",
  '## LMR — C2 Aplicar alterações na Base\nEnvie a Base e a planilha ALTERAÇÕES revisada. Sai a Base nova.\n\n1. **Execute workflow** → envie a Base (1º campo) e a ALTERAÇÕES revisada (2º campo).\n2. A página final baixa **BASE LMR - {sistema} - {data}.xlsx** (a Base antiga não muda).\n3. Confira as abas **HISTÓRICO** (o que foi aplicado, ignorado ou recusado) e **DIFERENÇAS**.\n4. Rode o **Workflow B** com a Base nova para gerar a aplicação.');

for (const [arq, wf] of [['LMR_C1_comparar_status.json', C1], ['LMR_C2_aplicar_alteracoes.json', C2]]) {
  fs.writeFileSync(path.join(__dirname, arq), JSON.stringify(wf, null, 2));
  console.log('ok', arq, wf.nodes.length, 'nós,', (fs.statSync(path.join(__dirname, arq)).size / 1024).toFixed(0), 'KB');
}

// ── teste local: C1 → (decisões do caso real) → C2, com os arquivos relidos como o Extract entrega ──
const { execFileSync } = require('child_process');
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const D = path.join(RAIZ, 'dados');
const SAIDA = path.join(RAIZ, 'saida', 'teste_c');
fs.mkdirSync(SAIDA, { recursive: true });
const leXlsx = (arq, aba) => JSON.parse(execFileSync('python', ['-X', 'utf8', '-c',
  'import openpyxl,json,sys\nws=openpyxl.load_workbook(sys.argv[1])[sys.argv[2]]\nr=list(ws.iter_rows(values_only=True))\nprint(json.dumps([{k:("" if v is None else v) for k,v in zip(r[0],x)} for x in r[1:]],ensure_ascii=False))', arq, aba], { encoding: 'utf8' }));
const roda = async (codigo, saidas, binarios) => {
  const $ = no => ({ all: () => saidas[no] || [], first: () => (no === 'Formulário' ? { json: {}, binary: binarios } : (saidas[no] || [])[0]) });
  const [r] = await new AsyncFn('$', codigo)($);
  const arq = path.join(SAIDA, r.binary.data.fileName);
  fs.writeFileSync(arq, Buffer.from(r.binary.data.data, 'base64'));
  return { json: r.json, arq };
};
const itens = rs => rs.map(json => ({ json }));
(async () => {
  const b = JSON.parse(fs.readFileSync(path.join(D, 'base_regvel.json'), 'utf8'));
  const lidos = JSON.parse(fs.readFileSync(path.join(D, 'base_lida_regvel.json'), 'utf8'));
  const status = JSON.parse(fs.readFileSync(path.join(D, 'status_regvel.json'), 'utf8')).linhas;
  const comuns = { 'Lê BASE': itens(lidos), 'Lê DOCS DE REFERÊNCIA': itens(b.docs), 'Lê RELAÇÕES': itens(b.relacoes),
    'Lê CABEÇALHO': itens(Object.entries(b.cabecalho).map(([CAMPO, VALOR]) => ({ CAMPO, VALOR }))), 'Lê HISTÓRICO': [{ json: { error: 'aba não existe' } }] };
  const c1 = await roda(C1_CODE, { ...comuns, 'Lê Status PMIB': status.map(row => ({ json: { row } })) },
    { a: { fileName: 'BASE LMR - Reg. Vel. e Pot. Hidráulica.xlsx' }, b: { fileName: '#ST00=M00MEU10&MPB020_STATUS_PMIB - Reg Vel.xlsx' } });
  console.log('  C1:', JSON.stringify(c1.json));
  // decisões do caso real, feitas "na planilha" relida
  const alt = leXlsx(c1.arq, 'ALTERAÇÕES');
  const linha = (tipo, p) => alt.find(a => a.TIPO === tipo && [a['PMIB ATUAL'], a['PMIB NOVO']].includes(`4500063671.${p}`));
  const i1641 = linha('INCLUIR', '1641');
  Object.assign(linha('EXCLUIR', '0795'), { TIPO: 'SUBSTITUIR_MATERIAL', APLICAR: 'SIM', 'PMIB NOVO': i1641['PMIB NOVO'], 'DESCRIÇÃO NOVA': i1641['DESCRIÇÃO NOVA'], 'PART NUMBER NOVO': i1641['PART NUMBER NOVO'] });
  i1641.APLICAR = 'NÃO';
  linha('EXCLUIR', '1137').APLICAR = 'SIM';
  linha('EXCLUIR', '1141').APLICAR = 'SIM';
  linha('INCLUIR', '1640').APLICAR = 'SIM';
  const P = require('../planilha.js');
  const L0 = require('../lmr.js');
  fs.writeFileSync(path.join(SAIDA, 'ALTERAÇÕES - Reg. Vel. (caso real revisado).xlsx'),
    P.planilhaSimples([{ nome: 'ALTERAÇÕES', colunas: L0.COLUNAS_ALTERACOES, linhas: alt, numeros: ['Nº'] }]));
  const c2 = await roda(C2_CODE, { ...comuns, 'Lê ALTERAÇÕES': itens(alt) },
    { a: { fileName: 'BASE LMR - Reg. Vel. e Pot. Hidráulica.xlsx' }, b: { fileName: 'ALTERAÇÕES - Reg. Vel. e Pot. Hidráulica.xlsx' } });
  console.log('  C2:', JSON.stringify(c2.json));
  // a Base nova, relida, passa pelo B (mesmo geraLote do AMP)
  const L = require('../lmr.js');
  const nova = leXlsx(c2.arq, 'BASE');
  const tags = new Set(nova.map(r => L.txt(r.TAG)).filter(Boolean));
  const out = L.geraLote(nova, tags);
  const n = out.reduce((s, x) => s + x.n, 0);
  const sig = L.assinaturaSoma(n, out.reduce((s, x) => s + x.h, 0));
  const pmibs = new Set(out.flatMap(x => x.linhas.map(l => l.FICHA_PMIB)));
  const ok = n === 5990 && !pmibs.has('4500063671.0795') && pmibs.has('4500063671.1641') && !pmibs.has('4500063671.1137');
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} B sobre a Base nova: ${sig} (${n} linhas) · abas ${leXlsx(c2.arq, 'HISTÓRICO').length} no HISTÓRICO, ${leXlsx(c2.arq, 'DIFERENÇAS').length} em DIFERENÇAS`);
  process.exit(ok ? 0 : 1);
})();

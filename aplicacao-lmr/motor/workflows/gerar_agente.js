/*
 * Gera os workflows da leitura com o agente do AMP (sem IA no n8n):
 *   LMR_AG1_preparar_etapas.json — PDFs + Status PMIB → ROTEIRO LMR - {sistema}.xlsx (mensagens das 4 etapas do agente,
 *                                  perguntas de controle e o que o AG2 precisa: CONFIG, STATUS PMIB, ÍNDICE).
 *   LMR_AG2_montar_base.json     — roteiro + JSONs do agente → BASE LMR - {sistema}.xlsx (entrada do Workflow B).
 * A lógica está em agente/agente.js (testada em agente/teste_agente.js); aqui só os nós.
 *
 * Uso: node workflows/gerar_agente.js   (gera e testa: imita o n8n nó a nó com Água Pura e o "agente perfeito";
 *      o .xlsx do roteiro é lido de volta pelo openpyxl, como o Extract from File faria)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { BIN_STATUS, LE_STATUS, SEPARA, INDEXA } = require('./pecas_a.js');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const MOTOR = ler('lmr.js'), PLANILHA_JS = ler('planilha.js'), INDICE_JS = ler('indice', 'indice.js'), LEITURA_JS = ler('leitura', 'leitura.js'), AGENTE_JS = ler('agente', 'agente.js');
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const pos = (col, lin = 0) => [col * 260, lin * 200];
const SETTINGS = { executionOrder: 'v1', saveManualExecutions: true, saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all', saveExecutionProgress: true };

function construtor() {
  const nodes = [], connections = {};
  const add = n => (nodes.push({ webhookId: undefined, ...n }), n.name);
  const code = (nome, js, p) => add({ parameters: { jsCode: js }, name: nome, type: 'n8n-nodes-base.code', typeVersion: 2, position: p });
  const liga = (de, para, saida = 0) => {
    connections[de] = connections[de] || { main: [] };
    while (connections[de].main.length <= saida) connections[de].main.push([]);
    connections[de].main[saida].push({ node: para, type: 'main', index: 0 });
  };
  const fim = nome => ({ name: nome, nodes: nodes.map(n => (n.webhookId === undefined ? (({ webhookId, ...x }) => x)(n) : n)), connections, settings: SETTINGS, pinData: {}, meta: { templateCredsSetupCompleted: true } });
  return { nodes, add, code, liga, fim };
}
const dropdown = (fieldLabel, opcoes) => ({ fieldLabel, fieldType: 'dropdown', requiredField: true, fieldOptions: { values: opcoes.map(option => ({ option })) } });

// ───────────────────────── AG1 — Preparar etapas ─────────────────────────
const F = {
  esc: 'Escopo (ex.: UG, RV)', sub: 'Subsistema (ex.: ÁGUA PURA)', tre: 'Trechos do projeto',
  lis: 'Lista de trechos (só para LISTA, AMD ou AMC; ex.: U-01, U-02)', esp: 'Especificação técnica / capítulo (opcional)',
  eix: 'Eixo (usado onde o documento não disser)', frq: 'Frequência quando o documento não disser',
  kit: 'Kits de manutenção de um equipamento', pec: 'Peças, acessórios e consumíveis de um equipamento',
  etd: 'Etapa de documentos (opcional; uma linha por documento: parte do nome = etapa 1 a 4)',
};
const OPCOES_EIXO = ['AB', 'BC', 'CD', 'MB', 'JB', 'JD', 'SEM EIXO'];
const OPCOES_FREQ = ['Deixar pendência', 'Ambas (50 e 60 Hz)', '50 Hz', '60 Hz'];
const OPCOES_TRECHOS = ['TODAS', 'ÍMPARES', 'PARES', 'LISTA', 'AMD', 'AMC'];
const OPCOES_KITS = ['Levam a TAG do equipamento', 'Sem TAG (1 por trecho, na área do equipamento)', 'Citam o equipamento como PAI'];
const OPCOES_PECAS = ['Levam a TAG do equipamento', 'Citam o equipamento como PAI'];

const PREPARA = `${MOTOR}
${PLANILHA_JS}
${INDICE_JS}
${LEITURA_JS}
${AGENTE_JS}
${LE_STATUS}
const f = $('Formulário').first().json;
const v = k => String(f[k] == null ? '' : f[k]).trim();
let st;
try { st = LMR.lerStatusPmib(statusRows); } catch (err) { throw new Error('Status PMIB não lido (aba "Lista de Materiais"): ' + err.message); }
const indexados = $input.all().map(i => i.json).filter(j => j && j.doc);
if (!indexados.length) throw new Error('Nenhum PDF lido.');
const nomes = Object.values($('Formulário').first().binary || {}).map(b => b.fileName);
const sistema = String(nomes.find(n => /STATUS/i.test(n || '')) || '').replace(/\\.xlsx$/i, '').split(/\\s+-\\s+/).slice(1).join(' - ').trim() || v(${JSON.stringify(F.sub)}).toUpperCase() || 'Sistema';
const kit = v(${JSON.stringify(F.kit)}), frq = v(${JSON.stringify(F.frq)});
const cfg = { sistema, escopo: v(${JSON.stringify(F.esc)}).toUpperCase(), subsistema: v(${JSON.stringify(F.sub)}).toUpperCase(),
  trechos: v(${JSON.stringify(F.tre)}) || 'TODAS', listaTrechos: v(${JSON.stringify(F.lis)}), eixo: /^SEM/i.test(v(${JSON.stringify(F.eix)})) ? '' : v(${JSON.stringify(F.eix)}),
  frequencia: /^Ambas/i.test(frq) ? 'AMBAS' : /^(50|60)/.test(frq) ? frq.toUpperCase() : '',
  kits: /^Sem/i.test(kit) ? 'SEM TAG' : /PAI/i.test(kit) ? 'PAI' : 'TAG', pecas: /PAI/i.test(v(${JSON.stringify(F.pec)})) ? 'PAI' : 'TAG',
  especificacao: v(${JSON.stringify(F.esp)}), etapaDocs: v(${JSON.stringify(F.etd)}) };
const r = AGENTE.roteiro(indexados, st, cfg);
const bytes = PLANILHA.planilhaSimples(AGENTE.abasDoRoteiro(r, statusRows, indexados, cfg));
const nome = 'ROTEIRO LMR - ' + sistema + '.xlsx';
const etapas = r.etapas.map(e => 'etapa ' + e.n + ': ' + (e.pular ? 'pular' : e.anexos.length + ' PDF(s)' + (e.mensagens.length > 1 ? ', ' + e.mensagens.length + ' partes' : ''))).join(' · ');
return [{ json: { ...r.resumo, etapas, arquivo: nome, kb: Math.round(bytes.length / 1024) },
  binary: { data: { data: PLANILHA.base64(bytes), mimeType: '${XLSX_MIME}', fileName: nome, fileExtension: 'xlsx' } } }];`;

const MENSAGEM_AG1 = "={{ 'Roteiro pronto: ' + $json.documentos + ' PDFs, ' + $json.paginas + ' páginas' + ($json.semTexto ? ' (' + $json.semTexto + ' sem texto: o agente lê como imagem)' : '') + ' · ' + $json.materiais + ' materiais · '"
  + " + $json.perguntas + ' perguntas de controle · ' + $json.etapas + '. Abra a aba ROTEIRO e siga as etapas no agente LMR do AMP; no fim rode o AG2 Montar Base com este arquivo e os .json do agente.' }}";

const ag1 = (() => {
  const w = construtor();
  w.add({ parameters: { formTitle: 'LMR — AG1 Preparar etapas do agente',
    formDescription: 'Envie os PDFs do sistema e o Status PMIB e preencha os dados da aplicação. Sai o ROTEIRO (.xlsx) com as mensagens das 4 etapas para o agente LMR do AMP. Não usa IA.',
    formFields: { values: [
      { fieldLabel: 'Documentos (PDF)', fieldType: 'file', multipleFiles: true, acceptFileTypes: '.pdf', requiredField: true },
      { fieldLabel: 'Status PMIB (.xlsx)', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.xlsx', requiredField: true },
      { fieldLabel: F.esc, requiredField: true, placeholder: 'UG' },
      { fieldLabel: F.sub, requiredField: true, placeholder: 'ÁGUA PURA' },
      dropdown(F.tre, OPCOES_TRECHOS),
      { fieldLabel: F.lis, requiredField: false },
      dropdown(F.eix, OPCOES_EIXO),
      dropdown(F.frq, OPCOES_FREQ),
      dropdown(F.kit, OPCOES_KITS),
      dropdown(F.pec, OPCOES_PECAS),
      { fieldLabel: F.esp, requiredField: false },
      { fieldLabel: F.etd, fieldType: 'textarea', requiredField: false, placeholder: 'MLU010 = 1\nManual da bomba = 3' },
    ] }, options: {} },
  name: 'Formulário', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.2, position: pos(0, 1), webhookId: crypto.randomUUID() });
  w.add({ parameters: { operation: 'xlsx', binaryPropertyName: BIN_STATUS, options: { headerRow: false, includeEmptyCells: true, sheetName: 'Lista de Materiais' } },
    name: 'Lê Status PMIB', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(1, 0) });
  w.code('Separa PDFs', SEPARA, pos(1, 2));
  w.add({ parameters: { batchSize: 1, options: {} }, name: 'Lote de documentos', type: 'n8n-nodes-base.splitInBatches', typeVersion: 3, position: pos(2, 2) });
  w.add({ parameters: { operation: 'pdf', binaryPropertyName: 'data', options: { joinPages: false, keepSource: 'json' } },
    name: 'Lê PDF (por página)', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(3, 3), onError: 'continueRegularOutput' });
  w.code('Indexa documento', INDEXA, pos(4, 3));
  w.code('Prepara etapas', PREPARA, pos(3, 1));
  w.add({ parameters: { operation: 'completion', respondWith: 'returnBinary', inputDataFieldName: 'data', completionTitle: 'ROTEIRO LMR pronto', completionMessage: MENSAGEM_AG1 },
    name: 'Entrega o roteiro', type: 'n8n-nodes-base.form', typeVersion: 1, position: pos(4, 1), webhookId: crypto.randomUUID() });
  w.add({ parameters: { content: '## LMR — AG1 Preparar etapas (sem IA)\n1. ⋯ → *Settings* → *Save manual executions* = **Save**.\n2. **Execute workflow** → envie os PDFs e o Status PMIB e preencha o formulário (mesmas opções do Workflow A: kits, peças, trechos, eixo). Deixe a aba aberta.\n3. A página final baixa **ROTEIRO LMR - {sistema}.xlsx**. Abra a aba **ROTEIRO** e siga as etapas no **agente LMR** do AMP (um chat por etapa).\n4. Se um documento caiu na etapa errada, rode de novo preenchendo **Etapa de documentos** (ex.: `MLU010 = 1`).\n5. No fim, rode o **AG2 Montar Base** com o roteiro e os .json do agente.', height: 340, width: 600 },
    name: 'Leia-me', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos(0, -1.5) });
  w.liga('Formulário', 'Lê Status PMIB');
  w.liga('Formulário', 'Separa PDFs');
  w.liga('Separa PDFs', 'Lote de documentos');
  w.liga('Lote de documentos', 'Prepara etapas', 0); // done
  w.liga('Lote de documentos', 'Lê PDF (por página)', 1); // loop
  w.liga('Lê PDF (por página)', 'Indexa documento');
  w.liga('Indexa documento', 'Lote de documentos');
  w.liga('Prepara etapas', 'Entrega o roteiro');
  return w.fim('LMR - AG1 Preparar etapas do agente');
})();

// ───────────────────────── AG2 — Montar Base ─────────────────────────
const ACHA = cond => `Object.keys($binary).find(k => ${cond})`;
const NOME = "($binary[k].fileName || '')";
const BIN_ROTEIRO = `={{ ${ACHA(`/^ROTEIRO/i.test(${NOME})`)} || ${ACHA(`/\\.xlsx$/i.test(${NOME}) && !/^BASE/i.test(${NOME})`)} }}`;
const BIN_GABARITO = `={{ ${ACHA(`/^BASE/i.test(${NOME}) && /\\.xlsx$/i.test(${NOME})`)} || 'sem_base' }}`;

const SEPARA_RESPOSTAS = `const b = $input.first().binary || {};
const r = Object.values(b).filter(x => /\\.(json|txt|md)$/i.test(x.fileName || '')).map(x => ({ json: { arquivo: x.fileName }, binary: { data: x } }));
if (!r.length) throw new Error('Envie os arquivos .json que o agente entregou (etapas 1 a 4).');
return r;`;

const MONTA = `${MOTOR}
${PLANILHA_JS}
${INDICE_JS}
${LEITURA_JS}
${AGENTE_JS}
${LE_STATUS}
const ler = no => { try { return $(no).all().map(i => i.json).filter(r => !r.error); } catch (err) { return []; } };
if (!statusRows.length) throw new Error('O roteiro não tem a aba STATUS PMIB: envie o ROTEIRO gerado pelo AG1.');
const cfg = AGENTE.configDoRoteiro(ler('Lê CONFIG'));
const indexados = AGENTE.indexadosDoRoteiro(ler('Lê ÍNDICE'), catalogo);
const separados = $('Separa respostas').all();
const respostas = $input.all().map((i, k) => {
  const j = i.json || {};
  const texto = typeof j.data === 'string' ? j.data : Object.values(j).find(x => typeof x === 'string' && x.includes('{')) || '';
  return { arquivo: ((separados[k] || {}).json || {}).arquivo || 'resposta ' + (k + 1), texto };
});
const m = AGENTE.montaBaseDoAgente({ LMR, statusRows, indexados, cfg, controle: ler('Lê CONTROLE'), respostas });
const extras = m.extras;
const gab = ler('Lê BASE (gabarito)').filter(x => String(x.FICHA_PMIB || '').trim());
let conferencia = null;
if (gab.length) {
  const c = LEITURA.comparaComGabarito(m.base, gab);
  conferencia = { ...LEITURA.comparaAplicacao(m.base, gab, LMR), pmibs: c.pmibs, campos: c.total };
  extras.push({ nome: 'CONFERÊNCIA', colunas: ['PMIB', 'TAGS', 'PAIS', 'RDS', 'ELEV', 'EIXO', 'TRECHOS'], linhas: c.linhas, larguras: { TAGS: 50, PAIS: 40, RDS: 50, TRECHOS: 50 } });
}
const bytes = PLANILHA.planilhaDaBase({ colunasBase: LMR.COLUNAS_BASE, base: m.base, cabecalho: m.cabecalho, docs: m.docs, relacoes: m.relacoes, extras });
const nome = 'BASE LMR - ' + (cfg.sistema || cfg.subsistema || 'Sistema') + '.xlsx';
const tipos = {};
for (const p of m.pendencias) tipos[p.TIPO] = (tipos[p.TIPO] || 0) + 1;
return [{ json: { ...m.resumo, tipos: Object.entries(tipos).map(([k, n]) => n + ' ' + k).join(', '), conferencia, arquivo: nome },
  binary: { data: { data: PLANILHA.base64(bytes), mimeType: '${XLSX_MIME}', fileName: nome, fileExtension: 'xlsx' } } }];`;

const MENSAGEM_AG2 = "={{ 'BASE gerada: ' + $json.linhasBase + ' linhas · ' + $json.materiais + ' materiais (' + $json.lidosPeloAgente + ' lidos pelo agente) · ' + $json.areas + ' áreas · etapas recebidas: ' + ($json.etapas || 'nenhuma')"
  + " + ' · controle: ' + $json.controleCertas + ' de ' + $json.controlePerguntas + ' certas · ' + $json.pendencias + ' pendências' + ($json.tipos ? ' (' + $json.tipos + ')' : '')"
  + " + ($json.conferencia ? ' · CONFERÊNCIA com a BASE enviada: ' + $json.conferencia.iguais + ' de ' + $json.conferencia.gabarito + ' linhas da aplicação iguais (' + $json.conferencia.iguaisSemNomeDaArea + ' sem contar o nome da área)' : '')"
  + " + '. Revise PENDÊNCIAS (CONTROLE e CONFERIR primeiro) e use a BASE no Workflow B.' }}";

const ag2 = (() => {
  const w = construtor();
  w.add({ parameters: { formTitle: 'LMR — AG2 Montar Base (agente)',
    formDescription: 'Envie o ROTEIRO gerado pelo AG1 e os arquivos .json que o agente LMR entregou (todas as etapas e partes). Para teste, envie também a BASE já aplicada (gabarito). Sai a BASE LMR. Não usa IA.',
    formFields: { values: [
      { fieldLabel: 'ROTEIRO do AG1 (.xlsx)', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.xlsx', requiredField: true },
      { fieldLabel: 'Respostas do agente (.json)', fieldType: 'file', multipleFiles: true, acceptFileTypes: '.json,.txt,.md', requiredField: true },
      { fieldLabel: 'BASE para conferência (.xlsx, opcional)', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.xlsx', requiredField: false },
    ] }, options: {} },
  name: 'Formulário', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.2, position: pos(0, 3), webhookId: crypto.randomUUID() });
  // leitores do roteiro (rodam antes, por estarem acima); a última volta é a das respostas
  const leitores = [['Lê BASE (gabarito)', BIN_GABARITO, 'BASE', true], ['Lê Status PMIB', BIN_ROTEIRO, 'STATUS PMIB', false],
    ['Lê CONFIG', BIN_ROTEIRO, 'CONFIG', true], ['Lê CONTROLE', BIN_ROTEIRO, 'CONTROLE', true], ['Lê ÍNDICE', BIN_ROTEIRO, 'ÍNDICE', true]];
  leitores.forEach(([nome, bin, aba, cab], i) => {
    w.add({ parameters: { operation: 'xlsx', binaryPropertyName: bin, options: { headerRow: cab, includeEmptyCells: true, sheetName: aba } },
      name: nome, type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(1, i), onError: 'continueRegularOutput' });
    w.liga('Formulário', nome);
  });
  w.code('Separa respostas', SEPARA_RESPOSTAS, pos(1, 6));
  w.add({ parameters: { operation: 'text', binaryPropertyName: 'data', options: {} }, name: 'Lê respostas', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(2, 6) });
  w.code('Monta Base', MONTA, pos(3, 6));
  w.add({ parameters: { operation: 'completion', respondWith: 'returnBinary', inputDataFieldName: 'data', completionTitle: 'BASE LMR gerada', completionMessage: MENSAGEM_AG2 },
    name: 'Entrega a Base', type: 'n8n-nodes-base.form', typeVersion: 1, position: pos(4, 6), webhookId: crypto.randomUUID() });
  w.add({ parameters: { content: '## LMR — AG2 Montar Base (sem IA)\n1. **Execute workflow** → envie o **ROTEIRO** do AG1 e **todos** os .json do agente (etapas 1 a 4 e as partes da etapa 4). Para teste, envie também a BASE emitida (gabarito).\n2. A página final baixa **BASE LMR - {sistema}.xlsx**. Me devolva a **mensagem final**.\n3. Revise **PENDÊNCIAS**: *CONTROLE* (o agente errou páginas: repita a etapa daquele trecho), *CONFERIR* (valor lido pelo agente que não está no texto do PDF: confira no desenho), *LEITURA*, *ÁREA*, *QTD*, *ELEVAÇÃO*. Abas **CONTROLE DO AGENTE** e **RESPOSTAS DO AGENTE** mostram o que veio do agente.\n4. Ajustes de áreas: **A Revisar áreas** (aba ÁREAS). Depois, **Workflow B**.\n\nPode rodar de novo com um .json corrigido: não chama IA.', height: 360, width: 620 },
    name: 'Leia-me', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos(0, -1.5) });
  w.liga('Formulário', 'Separa respostas');
  w.liga('Separa respostas', 'Lê respostas');
  w.liga('Lê respostas', 'Monta Base');
  w.liga('Monta Base', 'Entrega a Base');
  return w.fim('LMR - AG2 Montar Base (agente)');
})();

// ───────────────────────── A (agente AMP) — tudo numa execução ─────────────────────────
// Sondas S9/S10 (28/10/2026): o nó CUSTOM.amp lê o pedido de $json.chatInput, devolve a resposta em output (e sessionId,
// files); itens do mesmo nó dividem a sessão se o Session ID não mudar; PDF em Files não chega ao agente (erro 424/500)
// → o texto das páginas vai na mensagem. Fluxo: índice → E1 → E2+E3 → página "Confira as áreas" → E4 → Base.
const AGENTE_NO = { agentId: { __rl: true, value: '{"agentName":"Leitor LMR","model":"bedrock-claude-sonnet-5.5"}', mode: 'list', cachedResultName: 'Leitor LMR' },
  sessionId: '={{ $json.sessionId }}', options: {} };
// sem credencial no .json: cada pessoa escolhe a sua conta AMP no nó ao importar (o ID é da conta de quem criou)
const PAUSA = 10, PAUSA_LONGA = 60;
const FC = { ...F, conf: 'Conferir as áreas antes de ligar os materiais' };
const CFG = `const f = $('Formulário').first().json;
const v = k => String(f[k] == null ? '' : f[k]).trim();
const nomes = Object.values($('Formulário').first().binary || {}).map(b => b.fileName);
const kit = v(${JSON.stringify(F.kit)}), frq = v(${JSON.stringify(F.frq)});
const cfg = { sistema: String(nomes.find(n => /STATUS/i.test(n || '')) || '').replace(/\\.xlsx$/i, '').split(/\\s+-\\s+/).slice(1).join(' - ').trim() || v(${JSON.stringify(F.sub)}).toUpperCase() || 'Sistema',
  escopo: v(${JSON.stringify(F.esc)}).toUpperCase(), subsistema: v(${JSON.stringify(F.sub)}).toUpperCase(),
  trechos: v(${JSON.stringify(F.tre)}) || 'TODAS', listaTrechos: v(${JSON.stringify(F.lis)}), eixo: /^SEM/i.test(v(${JSON.stringify(F.eix)})) ? '' : v(${JSON.stringify(F.eix)}),
  frequencia: /^Ambas/i.test(frq) ? 'AMBAS' : /^(50|60)/.test(frq) ? frq.toUpperCase() : '',
  kits: /^Sem/i.test(kit) ? 'SEM TAG' : /PAI/i.test(kit) ? 'PAI' : 'TAG', pecas: /PAI/i.test(v(${JSON.stringify(F.pec)})) ? 'PAI' : 'TAG',
  especificacao: v(${JSON.stringify(F.esp)}), etapaDocs: v(${JSON.stringify(F.etd)}), sessao: 'lmr-' + $execution.id };
const indexados = $('Junta índice').first().json.indexados;`;
const BIB = `${MOTOR}\n${INDICE_JS}\n${LEITURA_JS}\n${AGENTE_JS}\n${LE_STATUS}`;
const JUNTA = `const indexados = $input.all().map(i => i.json).filter(j => j && j.doc);
if (!indexados.length) throw new Error('Nenhum PDF lido.');
return [{ json: { indexados } }];`;
// etapa sem página: uma chamada mínima (o Loop precisa de um item para chegar ao fim)
const vazia = n => `{ json: { etapa: ${n}, parte: '0', rotulo: 'etapa ${n} (sem páginas)', vazia: true, sessionId: cfg.sessao + '-e${n}-vazia', chatInput: 'Responda somente com {}', controle: [], pmibs: [], caracteres: 0 } }`;
const respostasDe = no => `$('${no}').first().json.respostas`;
const PLANEJA_E1 = `${BIB}\n${CFG}
const st = LMR.lerStatusPmib(statusRows);
const p = AGENTE.tarefasWorkflow(indexados, st, cfg, [1]);
return p.tarefas.length ? p.tarefas.map(json => ({ json })) : [${vazia(1)}];`;
const PLANEJA_E23 = `${BIB}\n${CFG}
const st = LMR.lerStatusPmib(statusRows);
const ctx = AGENTE.contextoDasRespostas(${respostasDe('Guarda E1')}, indexados, cfg);
const p = AGENTE.tarefasWorkflow(indexados, st, cfg, [2, 3], ctx);
return p.tarefas.length ? p.tarefas.map(json => ({ json })) : [${vazia(2)}];`;
const PREPARA_AREAS = `${BIB}\n${CFG}
const ctx = AGENTE.contextoDasRespostas([...${respostasDe('Guarda E1')}, ...${respostasDe('Guarda E23')}], indexados, cfg);
const pagina = LEITURA.formAreas(ctx.areas, []);
return [{ json: { areas: ctx.areas, conferir: !/^N/i.test(v(${JSON.stringify(FC.conf)})), campos: JSON.stringify(pagina.campos), descricao: pagina.descricao } }];`;
const APLICA_AREAS = `${LEITURA_JS}
const pa = $('Prepara áreas').first().json;
let areas = pa.areas, conferidas = false;
try { const r = $('Confira as áreas').first().json; if (r) { areas = LEITURA.aplicaFormAreas(pa.areas, r); conferidas = true; } } catch (err) { /* página não usada */ }
return [{ json: { areas, conferidas } }];`;
const PLANEJA_E4 = `${BIB}\n${CFG}
const st = LMR.lerStatusPmib(statusRows);
const ctx = AGENTE.contextoDasRespostas([...${respostasDe('Guarda E1')}, ...${respostasDe('Guarda E23')}], indexados, cfg);
ctx.areas = $('Aplica áreas').first().json.areas;
const p = AGENTE.tarefasWorkflow(indexados, st, cfg, [4], ctx);
return p.tarefas.length ? p.tarefas.map(json => ({ json })) : [${vazia(4)}];`;
// erro do nó do agente: temporário (limite, tempo, 424/500 do runtime) → espera e tenta de novo; até 3 vezes por chamada
const CONTA = (lote, planeja) => `const j = $input.first().json || {};
let tf;
try { tf = $('${lote}').itemMatching(0).json; } catch (err) { tf = $('${lote}').first(1).json; }
const erro = String((j.error && (j.error.message || j.error.description || j.error)) || j.message || 'erro do nó do agente').slice(0, 300);
const temporario = /too many requests|rate.?limit|\\b429\\b|\\b424\\b|runtime|quota|time.?out|timed out|overload|\\b50[0234]\\b|ECONNRESET|temporar/i.test(erro);
const max = Math.min(60, 3 * $('${planeja}').all().length + 3);
return [{ json: { ...tf, desistir: !temporario || $runIndex >= max - 1, erroAgente: erro } }];`;
const CONFERE = lote => `return $input.all().map((item, i) => {
  let tf;
  try { tf = $('${lote}').itemMatching(i).json; } catch (err) { tf = $('${lote}').first(1).json; }
  const j = item.json || {};
  const texto = j.desistir ? '' : typeof j.output === 'string' ? j.output : j.output != null ? JSON.stringify(j.output) : '';
  return { json: { rotulo: tf.rotulo, etapa: tf.etapa, vazia: !!tf.vazia, caracteres: tf.caracteres, texto: String(texto).slice(0, 200000), erro: j.desistir ? j.erroAgente : '' } };
});`;
const GUARDA = `const r = $input.all().map(i => i.json).filter(x => !x.vazia);
return [{ json: { respostas: r.map(x => ({ arquivo: x.rotulo, texto: x.texto })), chamadas: r.map(x => ({ CHAMADA: x.rotulo, 'CARACTERES ENVIADOS': x.caracteres, 'CARACTERES RECEBIDOS': (x.texto || '').length, ERRO: x.erro || '' })) } }];`;
const MONTA_A = `${MOTOR}\n${PLANILHA_JS}\n${INDICE_JS}\n${LEITURA_JS}\n${AGENTE_JS}\n${LE_STATUS}\n${CFG}
const ler = no => { try { return $(no).all().map(i => i.json).filter(r => !r.error); } catch (err) { return []; } };
const st = LMR.lerStatusPmib(statusRows);
const g1 = $('Guarda E1').first().json, g23 = $('Guarda E23').first().json;
const v4 = $input.all().map(i => i.json).filter(x => !x.vazia);
const g4 = { respostas: v4.map(x => ({ arquivo: x.rotulo, texto: x.texto })), chamadas: v4.map(x => ({ CHAMADA: x.rotulo, 'CARACTERES ENVIADOS': x.caracteres, 'CARACTERES RECEBIDOS': (x.texto || '').length, ERRO: x.erro || '' })) };
// perguntas enviadas e etapas sem página dependem só das páginas (não das respostas): refeitas aqui
const todas = AGENTE.tarefasWorkflow(indexados, st, cfg, [1, 2, 3, 4], {});
const aa = $('Aplica áreas').first().json;
const m = AGENTE.montaBaseDoAgente({ LMR, statusRows, indexados, cfg, controle: AGENTE.gabaritoDoControle(todas.controle), semTexto: false,
  respostas: [...g1.respostas, ...g23.respostas, ...g4.respostas], areasConferidas: aa.areas, etapasSemPaginas: [1, 2, 3, 4].filter(k => !todas.tarefas.some(x => x.etapa === k)) });
const chamadas = [...g1.chamadas, ...g23.chamadas, ...g4.chamadas];
for (const c of chamadas) if (c.ERRO) m.pendencias.unshift({ PMIB: '', ITEM: '', 'DESCRIÇÃO': 'AGENTE', TIPO: 'CHAMADA', DETALHE: c.CHAMADA + ': sem resposta do agente depois de 3 tentativas (' + c.ERRO + ')' });
const extras = [...m.extras, { nome: 'CHAMADAS DO AGENTE', colunas: ['CHAMADA', 'CARACTERES ENVIADOS', 'CARACTERES RECEBIDOS', 'ERRO'], linhas: chamadas, larguras: { CHAMADA: 24, ERRO: 80 } }];
const gab = ler('Lê BASE (gabarito)').filter(x => String(x.FICHA_PMIB || '').trim());
let conferencia = null;
if (gab.length) {
  const c = LEITURA.comparaComGabarito(m.base, gab);
  conferencia = { ...LEITURA.comparaAplicacao(m.base, gab, LMR), pmibs: c.pmibs, campos: c.total };
  extras.push({ nome: 'CONFERÊNCIA', colunas: ['PMIB', 'TAGS', 'PAIS', 'RDS', 'ELEV', 'EIXO', 'TRECHOS'], linhas: c.linhas, larguras: { TAGS: 50, PAIS: 40, RDS: 50, TRECHOS: 50 } });
}
const bytes = PLANILHA.planilhaDaBase({ colunasBase: LMR.COLUNAS_BASE, base: m.base, cabecalho: m.cabecalho, docs: m.docs, relacoes: m.relacoes, extras });
const nome = 'BASE LMR - ' + cfg.sistema + '.xlsx';
const tipos = {};
for (const p of m.pendencias) tipos[p.TIPO] = (tipos[p.TIPO] || 0) + 1;
return [{ json: { ...m.resumo, pendencias: m.pendencias.length, chamadas: chamadas.length, falhas: chamadas.filter(c => c.ERRO).length, conferidas: !!aa.conferidas,
  tipos: Object.entries(tipos).map(([k, n]) => n + ' ' + k).join(', '), conferencia, arquivo: nome },
  binary: { data: { data: PLANILHA.base64(bytes), mimeType: '${XLSX_MIME}', fileName: nome, fileExtension: 'xlsx' } } }];`;
const MENSAGEM_A = "={{ 'BASE gerada: ' + $json.linhasBase + ' linhas · ' + $json.materiais + ' materiais (' + $json.lidosPeloAgente + ' lidos pelo agente) · ' + $json.areas + ' áreas' + ($json.conferidas ? ' (conferidas)' : '')"
  + " + ' · ' + $json.chamadas + ' chamadas ao agente' + ($json.falhas ? ' (' + $json.falhas + ' sem resposta)' : '') + ' · controle: ' + $json.controleCertas + ' de ' + $json.controlePerguntas + ' certas · ' + $json.pendencias + ' pendências' + ($json.tipos ? ' (' + $json.tipos + ')' : '')"
  + " + ($json.conferencia ? ' · CONFERÊNCIA com a BASE enviada: ' + $json.conferencia.iguais + ' de ' + $json.conferencia.gabarito + ' linhas da aplicação iguais (' + $json.conferencia.iguaisSemNomeDaArea + ' sem contar o nome da área)' : '')"
  + " + '. Revise PENDÊNCIAS e use a BASE no Workflow B.' }}";

const agA = (() => {
  const w = construtor();
  w.add({ parameters: { formTitle: 'LMR — A Gerar Base (agente AMP)',
    formDescription: 'Envie os PDFs do sistema e o Status PMIB e preencha os dados da aplicação. O agente Leitor LMR lê o texto dos documentos em 4 etapas. Deixe esta aba aberta: no meio aparece a página "Confira as áreas". No fim esta página baixa a BASE.',
    formFields: { values: [
      { fieldLabel: 'Documentos (PDF)', fieldType: 'file', multipleFiles: true, acceptFileTypes: '.pdf', requiredField: true },
      { fieldLabel: 'Status PMIB (.xlsx)', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.xlsx', requiredField: true },
      { fieldLabel: F.esc, requiredField: true, placeholder: 'UG' },
      { fieldLabel: F.sub, requiredField: true, placeholder: 'ÁGUA PURA' },
      dropdown(F.tre, OPCOES_TRECHOS),
      { fieldLabel: F.lis, requiredField: false },
      dropdown(F.eix, OPCOES_EIXO),
      dropdown(F.frq, OPCOES_FREQ),
      dropdown(F.kit, OPCOES_KITS),
      dropdown(F.pec, OPCOES_PECAS),
      dropdown(FC.conf, ['Sim (uma página mostra as áreas lidas)', 'Não']),
      { fieldLabel: F.esp, requiredField: false },
      { fieldLabel: F.etd, fieldType: 'textarea', requiredField: false, placeholder: 'MLU010 = 1\nManual da bomba = 3' },
      { fieldLabel: 'BASE para conferência (.xlsx, opcional)', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.xlsx', requiredField: false },
    ] }, options: {} },
  name: 'Formulário', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.2, position: pos(0, 2), webhookId: crypto.randomUUID() });
  w.add({ parameters: { operation: 'xlsx', binaryPropertyName: `={{ ${ACHA(`/^BASE/i.test(${NOME})`)} || 'sem_base' }}`, options: { headerRow: true, includeEmptyCells: true, sheetName: 'BASE' } },
    name: 'Lê BASE (gabarito)', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(1, 0), onError: 'continueRegularOutput' });
  w.add({ parameters: { operation: 'xlsx', binaryPropertyName: BIN_STATUS, options: { headerRow: false, includeEmptyCells: true, sheetName: 'Lista de Materiais' } },
    name: 'Lê Status PMIB', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(1, 1) });
  w.code('Separa PDFs', SEPARA, pos(1, 3));
  w.add({ parameters: { batchSize: 1, options: {} }, name: 'Lote de documentos', type: 'n8n-nodes-base.splitInBatches', typeVersion: 3, position: pos(2, 3) });
  w.add({ parameters: { operation: 'pdf', binaryPropertyName: 'data', options: { joinPages: false, keepSource: 'json' } },
    name: 'Lê PDF (por página)', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(3, 4), onError: 'continueRegularOutput' });
  w.code('Indexa documento', INDEXA, pos(4, 4));
  w.code('Junta índice', JUNTA, pos(3, 2.5));
  // um Loop por grupo de etapas: Lote → Pausa → Agente → (erro? → conta → desiste? → pausa longa → Agente) → Confere → Lote
  const loop = (sufixo, planeja, col, lin) => {
    const lote = `Lote ${sufixo}`;
    w.add({ parameters: { batchSize: 1, options: {} }, name: lote, type: 'n8n-nodes-base.splitInBatches', typeVersion: 3, position: pos(col, lin) });
    w.add({ parameters: { amount: PAUSA, unit: 'seconds' }, name: `Pausa ${sufixo}`, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: pos(col + 1, lin + 1), webhookId: crypto.randomUUID() });
    w.add({ parameters: AGENTE_NO, name: `Agente ${sufixo}`, type: 'CUSTOM.amp', typeVersion: 1, position: pos(col + 2, lin + 1), onError: 'continueRegularOutput' });
    w.add({ parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      conditions: [{ id: crypto.randomUUID(), leftValue: '={{ $json.error }}', rightValue: '', operator: { type: 'string', operation: 'exists', singleValue: true } }], combinator: 'and' }, options: {} },
      name: `Erro? ${sufixo}`, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(col + 3, lin + 1) });
    w.code(`Conta tentativas ${sufixo}`, CONTA(lote, planeja), pos(col + 3, lin + 2.2));
    w.add({ parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ id: crypto.randomUUID(), leftValue: '={{ $json.desistir }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
      name: `Desiste? ${sufixo}`, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(col + 4, lin + 2.2) });
    w.add({ parameters: { amount: PAUSA_LONGA, unit: 'seconds' }, name: `Pausa longa ${sufixo}`, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: pos(col + 2, lin + 2.6), webhookId: crypto.randomUUID() });
    w.code(`Confere ${sufixo}`, CONFERE(lote), pos(col + 4, lin + 1));
    w.liga(planeja, lote);
    w.liga(lote, `Pausa ${sufixo}`, 1);
    w.liga(`Pausa ${sufixo}`, `Agente ${sufixo}`);
    w.liga(`Agente ${sufixo}`, `Erro? ${sufixo}`);
    w.liga(`Erro? ${sufixo}`, `Conta tentativas ${sufixo}`, 0); // true: erro
    w.liga(`Erro? ${sufixo}`, `Confere ${sufixo}`, 1);
    w.liga(`Conta tentativas ${sufixo}`, `Desiste? ${sufixo}`);
    w.liga(`Desiste? ${sufixo}`, `Confere ${sufixo}`, 0); // true: segue sem resposta (PENDÊNCIA)
    w.liga(`Desiste? ${sufixo}`, `Pausa longa ${sufixo}`, 1);
    w.liga(`Pausa longa ${sufixo}`, `Agente ${sufixo}`);
    w.liga(`Confere ${sufixo}`, lote);
    return lote;
  };
  w.code('Planeja E1', PLANEJA_E1, pos(4, 1));
  const l1 = loop('E1', 'Planeja E1', 5, 0);
  w.code('Guarda E1', GUARDA, pos(6, -1));
  w.liga(l1, 'Guarda E1', 0);
  w.code('Planeja E2/E3', PLANEJA_E23, pos(7, -1));
  w.liga('Guarda E1', 'Planeja E2/E3');
  const l23 = loop('E23', 'Planeja E2/E3', 8, 0);
  w.code('Guarda E23', GUARDA, pos(9, -1));
  w.liga(l23, 'Guarda E23', 0);
  w.code('Prepara áreas', PREPARA_AREAS, pos(10, -1));
  w.liga('Guarda E23', 'Prepara áreas');
  w.add({ parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ id: crypto.randomUUID(), leftValue: '={{ $json.conferir }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
    name: 'Conferir áreas?', type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(11, -1) });
  w.add({ parameters: { operation: 'page', defineForm: 'json', jsonOutput: '={{ $json.campos }}',
    options: { formTitle: 'Confira as áreas', formDescription: '={{ $json.descricao }}', buttonLabel: 'Ligar os materiais' } },
    name: 'Confira as áreas', type: 'n8n-nodes-base.form', typeVersion: 1, position: pos(12, -1.8), webhookId: crypto.randomUUID() });
  w.code('Aplica áreas', APLICA_AREAS, pos(13, -1));
  w.liga('Prepara áreas', 'Conferir áreas?');
  w.liga('Conferir áreas?', 'Confira as áreas', 0);
  w.liga('Conferir áreas?', 'Aplica áreas', 1);
  w.liga('Confira as áreas', 'Aplica áreas');
  w.code('Planeja E4', PLANEJA_E4, pos(14, -1));
  w.liga('Aplica áreas', 'Planeja E4');
  const l4 = loop('E4', 'Planeja E4', 15, 0);
  w.code('Monta Base', MONTA_A, pos(16, -1));
  w.add({ parameters: { operation: 'completion', respondWith: 'returnBinary', inputDataFieldName: 'data', completionTitle: 'BASE LMR gerada', completionMessage: MENSAGEM_A },
    name: 'Entrega a Base', type: 'n8n-nodes-base.form', typeVersion: 1, position: pos(17, -1), webhookId: crypto.randomUUID() });
  w.liga(l4, 'Monta Base', 0);
  w.liga('Monta Base', 'Entrega a Base');
  w.add({ parameters: { content: '## LMR — A Gerar Base (agente AMP)\n**Antes da 1ª execução**, nos 3 nós **Agente E1 / E23 / E4**: escolha *Credential* = a sua **AMP account** e *Custom Agent* = **Leitor LMR**; *Prompt* = `{{ $json.chatInput }}`; *Session ID* = `{{ $json.sessionId }}` (sem nada depois das chaves); *Files* vazio; *Add option* → **timeout** = o maior valor aceito.\n\n1. ⋯ → *Settings* → *Save manual executions* = **Save**.\n2. **Execute workflow** → PDFs + Status PMIB + opções (kits/peças como no Workflow A). Para teste, envie a BASE emitida (gabarito).\n3. **Deixe a aba aberta.** Depois das etapas 1–3 aparece **Confira as áreas**: preencha só o que falta (elevação, RDS-PP, trechos da área) e clique em **Ligar os materiais**.\n4. No fim baixa **BASE LMR - {sistema}.xlsx**. Me devolva a mensagem final.\n\nO agente recebe o TEXTO das páginas (o PDF em Files não chega a ele). Pausa de 10 s entre chamadas; erro temporário → espera 60 s e tenta de novo (até 3 vezes).', height: 460, width: 680 },
    name: 'Leia-me', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos(0, -2.5) });
  w.liga('Formulário', 'Lê BASE (gabarito)');
  w.liga('Formulário', 'Lê Status PMIB');
  w.liga('Formulário', 'Separa PDFs');
  w.liga('Separa PDFs', 'Lote de documentos');
  w.liga('Lote de documentos', 'Junta índice', 0);
  w.liga('Lote de documentos', 'Lê PDF (por página)', 1);
  w.liga('Lê PDF (por página)', 'Indexa documento');
  w.liga('Indexa documento', 'Lote de documentos');
  w.liga('Junta índice', 'Planeja E1');
  return w.fim('LMR - A Gerar Base (agente AMP)');
})();

for (const [wf, arq] of [[ag1, 'LMR_AG1_preparar_etapas.json'], [ag2, 'LMR_AG2_montar_base.json'], [agA, 'LMR_A_agente_amp.json']]) {
  const destino = path.join(__dirname, arq);
  fs.writeFileSync(destino, JSON.stringify(wf, null, 2));
  console.log('ok', arq, wf.nodes.length, 'nós,', (fs.statSync(destino).size / 1024).toFixed(0), 'KB');
}

// ───────────────────────── teste local: imita o n8n nó a nó ─────────────────────────
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const roda = (js, $, entrada) => new AsyncFn('$', '$input', js)($, { all: () => entrada, first: () => entrada[0] });
const copia = o => JSON.parse(JSON.stringify(o));
const D = path.join(RAIZ, 'dados');
const SAIDA = path.join(RAIZ, 'saida', 'teste_agente');

(async () => {
  const n = 'agua_pura';
  if (!fs.existsSync(path.join(D, `textos_${n}.json`))) { console.log('sem dados/textos_agua_pura.json: teste local pulado'); return; }
  const LMR = require('../lmr.js');
  const AGENTE = require('../agente/agente.js');
  const { agentePerfeito, textos } = require('../agente/perfeito.js');
  fs.mkdirSync(SAIDA, { recursive: true });
  const docs = JSON.parse(fs.readFileSync(path.join(D, `textos_${n}.json`), 'utf8'));
  const statusRows = JSON.parse(fs.readFileSync(path.join(D, `status_${n}.json`), 'utf8')).linhas;
  const gab = JSON.parse(fs.readFileSync(path.join(D, `base_${n}.json`), 'utf8')).base;
  const form = { [F.esc]: 'UG', [F.sub]: 'Água Pura', [F.tre]: 'TODAS', [F.lis]: '', [F.eix]: 'CD', [F.frq]: 'Deixar pendência', [F.esp]: '',
    [F.kit]: OPCOES_KITS[1], [F.pec]: OPCOES_PECAS[0], [F.etd]: '' };

  // AG1
  const saidas = { 'Formulário': [{ json: form, binary: { a: { fileName: 'x.pdf' }, b: { fileName: '#ST00=M00MKF10&MPB020_STATUS_PMIB - Água Pura.xlsx' } } }],
    'Lê Status PMIB': statusRows.map(row => ({ json: { row } })) };
  const $ = no => ({ all: () => saidas[no] || [], first: () => (saidas[no] || [])[0], itemMatching: () => { throw new Error('sem pareamento'); } });
  const indexados = [];
  for (const d of docs) indexados.push(...copia(await roda(INDEXA, $, [{ json: { arquivo: d.arquivo, text: d.paginas || [] } }])));
  const [ro] = await roda(PREPARA, $, indexados);
  assert.strictEqual(ro.binary.data.fileName, 'ROTEIRO LMR - Água Pura.xlsx');
  const arqRoteiro = path.join(SAIDA, ro.binary.data.fileName);
  fs.writeFileSync(arqRoteiro, Buffer.from(ro.binary.data.data, 'base64'));
  console.log(`AG1 ok: ${ro.json.documentos} PDFs, ${ro.json.paginas} páginas, ${ro.json.perguntas} perguntas, ${ro.json.etapas} (${ro.json.kb} KB)`);

  // .xlsx do roteiro lido de volta (openpyxl), como o Extract from File
  const lido = JSON.parse(execFileSync('python', [path.join(RAIZ, 'agente', 'le_xlsx.py'), arqRoteiro, 'STATUS PMIB:sem', 'CONFIG:cab', 'CONTROLE:cab', 'ÍNDICE:cab', 'ETAPA 1:sem'],
    { encoding: 'utf8', maxBuffer: 1 << 28 }));
  assert.ok(lido['ETAPA 1'][0][0].startsWith('ETAPA 1 de 4'), 'aba ETAPA 1');

  // agente perfeito (respostas do gabarito, na forma do roteiro) → AG2
  const st = LMR.lerStatusPmib(statusRows);
  const cfg = AGENTE.configDoRoteiro(lido.CONFIG);
  assert.strictEqual(cfg.kits, 'SEM TAG');
  const r = AGENTE.roteiro(indexados.map(i => i.json), st, cfg);
  const resp = textos(agentePerfeito(r, gab, LMR.trechosDoProjeto('TODAS', []).map(x => x.trecho)));
  const s2 = {
    'Formulário': [{ json: {}, binary: Object.fromEntries(resp.map((x, i) => [`r${i}`, { fileName: x.arquivo }])) }],
    'Lê Status PMIB': lido['STATUS PMIB'].map(row => ({ json: { row } })),
    'Lê CONFIG': lido.CONFIG.map(json => ({ json })), 'Lê CONTROLE': lido.CONTROLE.map(json => ({ json })), 'Lê ÍNDICE': lido['ÍNDICE'].map(json => ({ json })),
    'Lê BASE (gabarito)': gab.map(json => ({ json })),
  };
  const $2 = no => ({ all: () => s2[no] || [], first: () => (s2[no] || [])[0] });
  s2['Separa respostas'] = copia(await roda(SEPARA_RESPOSTAS, $2, s2['Formulário']));
  const [b] = await roda(MONTA, $2, resp.map(x => ({ json: { data: x.texto } })));
  fs.writeFileSync(path.join(SAIDA, b.binary.data.fileName), Buffer.from(b.binary.data.data, 'base64'));
  const j = b.json;
  console.log(`AG2 ok: ${j.linhasBase} linhas, ${j.lidosPeloAgente} lidos pelo agente, controle ${j.controleCertas}/${j.controlePerguntas}, pendências ${j.pendencias} (${j.tipos}); conferência ${j.conferencia.iguais}/${j.conferencia.gabarito}`);
  assert.strictEqual(b.binary.data.fileName, 'BASE LMR - Água Pura.xlsx');
  assert.strictEqual(j.controleCertas, j.controlePerguntas);
  assert.strictEqual(j.conferencia.iguais, j.conferencia.gabarito, 'agente perfeito: Base igual ao gabarito');
  // sem respostas → erro claro
  await assert.rejects(() => roda(SEPARA_RESPOSTAS, $2, [{ json: {}, binary: { a: { fileName: 'ROTEIRO.xlsx' } } }]), /Envie os arquivos .json/);
  // a BASE gerada abre e tem as abas que o B e o Revisar áreas leem
  const abasBase = JSON.parse(execFileSync('python', ['-c', `import openpyxl,json,sys; print(json.dumps(openpyxl.load_workbook(sys.argv[1], read_only=True).sheetnames, ensure_ascii=True))`,
    path.join(SAIDA, b.binary.data.fileName)], { encoding: 'utf8' }));
  for (const a of ['BASE', 'CABEÇALHO', 'DOCS DE REFERÊNCIA', 'PENDÊNCIAS', 'LEITURA', 'ÁREAS', 'CONTROLE DO AGENTE', 'RESPOSTAS DO AGENTE', 'CONFERÊNCIA'])
    assert.ok(abasBase.includes(a), `aba ${a} na BASE`);
  // ── A (agente AMP): fluxo inteiro, com o agente perfeito e um erro 424 temporário na 1ª chamada das etapas 2/3 ──
  {
    const LEITURA = require('../leitura/leitura.js');
    const { respondedor, preencheAreas } = require('../agente/perfeito.js');
    const exec = (js, $, entrada, runIndex = 0) => new AsyncFn('$', '$input', '$execution', '$runIndex', js)($, { all: () => entrada, first: () => entrada[0] }, { id: 77 }, runIndex);
    const formA = { ...form, [FC.conf]: 'Sim (uma página mostra as áreas lidas)' };
    const sA = { 'Formulário': [{ json: formA, binary: { a: { fileName: 'x.pdf' }, b: { fileName: '#ST00=M00MKF10&MPB020_STATUS_PMIB - Água Pura.xlsx' } } }],
      'Lê Status PMIB': statusRows.map(row => ({ json: { row } })), 'Lê BASE (gabarito)': gab.map(json => ({ json })) };
    let atual = null;
    const $A = no => ({ all: () => sA[no] || [], first: (ramo) => (ramo === 1 && /^Lote /.test(no) ? atual : (sA[no] || [])[0]),
      itemMatching: () => { if (/^Lote /.test(no)) return atual; throw new Error('sem pareamento'); } });
    sA['Junta índice'] = copia(await exec(JUNTA, $A, indexados));
    const st = LMR.lerStatusPmib(statusRows);
    const r = AGENTE.roteiro(indexados.map(i => i.json), st, AGENTE.configDoRoteiro(lido.CONFIG));
    const responde = respondedor(r, agentePerfeito(r, gab, LMR.trechosDoProjeto('TODAS', []).map(x => x.trecho)));
    let chamadas = 0, erros = 0, contaRuns = 0;
    const loop = async (sufixo, planeja) => {
      const voltas = [];
      for (const tf of sA[planeja]) {
        atual = tf;
        let saida;
        for (;;) {
          chamadas++;
          const falha = sufixo === 'E23' && erros === 0; // 1ª chamada das etapas 2/3: o runtime recusa
          const ag = falha ? { json: { error: { message: '424 - {"message":"Received error (500) from runtime."}' } } } : { json: { sessionId: tf.json.sessionId, output: responde(tf.json), files: [] } };
          if (!falha) { saida = ag; break; }
          erros++;
          const [c] = copia(await exec(CONTA(`Lote ${sufixo}`, planeja), $A, [ag], contaRuns++));
          if (c.json.desistir) { saida = c; break; }
        }
        voltas.push(...copia(await exec(CONFERE(`Lote ${sufixo}`), $A, [saida])));
      }
      return voltas;
    };
    sA['Planeja E1'] = copia(await exec(PLANEJA_E1, $A, sA['Junta índice']));
    sA['Guarda E1'] = copia(await exec(GUARDA, $A, await loop('E1', 'Planeja E1')));
    sA['Planeja E2/E3'] = copia(await exec(PLANEJA_E23, $A, sA['Guarda E1']));
    sA['Guarda E23'] = copia(await exec(GUARDA, $A, await loop('E23', 'Planeja E2/E3')));
    sA['Prepara áreas'] = copia(await exec(PREPARA_AREAS, $A, sA['Guarda E23']));
    const pa = sA['Prepara áreas'][0].json;
    assert.ok(pa.conferir && JSON.parse(pa.campos).length >= 4, 'página Confira as áreas');
    const gabAreas = agentePerfeito(r, gab, LMR.trechosDoProjeto('TODAS', []).map(x => x.trecho))[0].json.areas;
    sA['Confira as áreas'] = [{ json: preencheAreas(LEITURA, pa.areas, gabAreas, LMR.trechosDoProjeto('TODAS', []).map(x => x.trecho)) }];
    sA['Aplica áreas'] = copia(await exec(APLICA_AREAS, $A, sA['Confira as áreas']));
    sA['Planeja E4'] = copia(await exec(PLANEJA_E4, $A, sA['Aplica áreas']));
    const [bA] = await exec(MONTA_A, $A, await loop('E4', 'Planeja E4'));
    fs.writeFileSync(path.join(SAIDA, 'BASE LMR - Água Pura (agente AMP).xlsx'), Buffer.from(bA.binary.data.data, 'base64'));
    const jA = bA.json;
    console.log(`A agente AMP ok: ${jA.chamadas} chamadas (+${erros} recusa simulada, repetida), ${jA.linhasBase} linhas, controle ${jA.controleCertas}/${jA.controlePerguntas}, pendências ${jA.pendencias} (${jA.tipos}); conferência ${jA.conferencia.iguais}/${jA.conferencia.gabarito}`);
    assert.strictEqual(jA.falhas, 0);
    assert.ok(jA.conferidas);
    assert.strictEqual(jA.controleCertas, jA.controlePerguntas);
    assert.strictEqual(jA.conferencia.iguais, jA.conferencia.gabarito, 'agente perfeito: Base igual ao gabarito');
    assert.ok(sA['Planeja E1'].every(x => x.json.sessionId.startsWith('lmr-77-e1-')), 'sessão por chamada');
    // sem resposta (erro permanente): a chamada vira PENDÊNCIA CHAMADA e a Base sai assim mesmo
    const [cp] = await exec(CONTA('Lote E4', 'Planeja E4'), $A, [{ json: { error: { message: 'modelo não configurado' } } }], 0);
    assert.ok(cp.json.desistir, 'erro permanente não desiste');
  }
  console.log('TUDO OK');
})().catch(err => { console.error(err); process.exit(1); });

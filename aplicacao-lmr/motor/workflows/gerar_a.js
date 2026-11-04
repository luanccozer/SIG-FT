/*
 * Gera o workflow "LMR - A Gerar Base (IA)" para importar no n8n do AMP: documentos do sistema → BASE LMR.
 * Entrada (formulário): PDFs, Status PMIB, escopo, subsistema, trechos do projeto; BASE emitida opcional (gabarito).
 * Saída: BASE LMR - {sistema}.xlsx (BASE, CABEÇALHO, DOCS DE REFERÊNCIA, RELAÇÕES + PENDÊNCIAS, LEITURA, ÁREAS,
 *        RESPOSTAS IA e, com gabarito, CONFERÊNCIA). É a entrada do Workflow B.
 *
 * Fluxo (v3, leitura em etapas pequenas — modelos fracos erram menos com uma pergunta por chamada):
 *   PDFs → Loop (1 por volta) → índice (A1) → IA: áreas (1 chamada) → página "Confira as áreas" (opcional: nome,
 *   RDS-PP, elevação e trechos de cada área; áreas que faltam) → plano da leitura → Loop "IA: leituras" com 3 tipos:
 *     · confirmação das TAGs da lista (quais candidatas são do material; TAG própria ou de equipamento) — 20 por chamada;
 *     · área das TAGs (páginas onde aparecem; responde o número da área; aceita mais de uma área) — até 40 TAGs;
 *     · leitura completa só dos materiais sem TAG achada pelo código — até 5 por chamada.
 *   → regras sem IA (lista do painel, TAG trocada por outra letra final, kits e peças pela convenção do formulário,
 *   frequência pelo Status, RDS-PP por grupo de frequência, trechos por área) → monta a Base.
 * Os nós de IA são Basic LLM Chain (o AI Agent do n8n não aceita o GEV LLM Model); o modelo é ligado à mão em cada um.
 *
 * Uso: node workflows/gerar_a.js   (gera e testa: imita o n8n nó a nó, com respostas da "IA perfeita" e sem IA)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { BIN_STATUS, BIN_BASE, LE_STATUS, SEPARA, INDEXA } = require('./pecas_a.js');

const RAIZ = path.join(__dirname, '..');
const MOTOR = fs.readFileSync(path.join(RAIZ, 'lmr.js'), 'utf8');
const PLANILHA_JS = fs.readFileSync(path.join(RAIZ, 'planilha.js'), 'utf8');
const LEITURA_JS = fs.readFileSync(path.join(RAIZ, 'leitura', 'leitura.js'), 'utf8');
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const pos = (col, lin = 0) => [col * 260, lin * 200];

const F = {
  esc: 'Escopo (ex.: UG, RV)', sub: 'Subsistema (ex.: ÁGUA PURA)', tre: 'Trechos do projeto',
  lis: 'Lista de trechos (só para LISTA, AMD ou AMC; ex.: U-01, U-02)', esp: 'Especificação técnica / capítulo (opcional)',
  eix: 'Eixo (usado onde o documento não disser)', frq: 'Frequência quando o documento não disser',
  kit: 'Kits de manutenção de um equipamento', pec: 'Peças, acessórios e consumíveis de um equipamento',
  conf: 'Conferir as áreas antes de ler os materiais',
};
const OPCOES_EIXO = ['AB', 'BC', 'CD', 'MB', 'JB', 'JD', 'SEM EIXO'];
const OPCOES_FREQ = ['Deixar pendência', 'Ambas (50 e 60 Hz)', '50 Hz', '60 Hz'];
const OPCOES_TRECHOS = ['TODAS', 'ÍMPARES', 'PARES', 'LISTA', 'AMD', 'AMC'];
// Reg. Vel. e Aeração levam a TAG do equipamento no kit; Água Pura deixa o kit sem TAG (1 por trecho, na área).
const OPCOES_KITS = ['Levam a TAG do equipamento', 'Sem TAG (1 por trecho, na área do equipamento)', 'Citam o equipamento como PAI'];
// Água Pura e Aeração: a peça leva a TAG do equipamento; Reg. Vel.: a peça cita o equipamento como PAI.
const OPCOES_PECAS = ['Levam a TAG do equipamento', 'Citam o equipamento como PAI'];
const OPCOES_CONF = ['Sim (uma página mostra as áreas lidas)', 'Não'];
const FORM = `const f = $('Formulário').first().json;
const v = k => String(f[k] == null ? '' : f[k]).trim();
const e = { lista: '', subsistema: v(${JSON.stringify(F.sub)}).toUpperCase() };`;
const RESPOSTA = 'j => (j.error ? \'\' : j.output != null ? j.output : j.text != null ? j.text : \'\')';

// Depois do índice: prepara a leitura das ÁREAS (1 chamada).
const PREP_AREAS = `${MOTOR}
${LEITURA_JS}
${LE_STATUS}
${FORM}
let st;
try { st = LMR.lerStatusPmib(statusRows); } catch (err) { throw new Error('Status PMIB não lido (aba "Lista de Materiais"): ' + err.message); }
const indexados = $input.all().map(i => i.json).filter(j => j && j.doc);
if (!indexados.length) throw new Error('Nenhum PDF lido.');
e.lista = st.lista;
const ind = LEITURA.indiceCompacto(indexados);
return [{ json: { prompt: LEITURA.promptAreas(ind, e), ind, documentos: indexados.length } }];`;

// Resposta das ÁREAS → áreas conferidas no texto + campos da página "Confira as áreas".
const LE_AREAS = `${LEITURA_JS}
${FORM}
const prep = $('Prepara leitura de áreas').first().json;
const j = $input.first().json || {};
const resposta = (${RESPOSTA})(j);
const { areas, avisos } = LEITURA.leAreas(resposta, prep.ind, e.subsistema);
if (j.desistir) avisos.push('IA de áreas sem resposta depois de várias tentativas: ' + j.erroIA);
const pagina = LEITURA.formAreas(areas, avisos);
const bruta = String(typeof resposta === 'string' ? resposta : JSON.stringify(resposta)).slice(0, 30000);
return [{ json: { areas, avisos, conferir: !/^N/i.test(v(${JSON.stringify(F.conf)})), campos: JSON.stringify(pagina.campos), descricao: pagina.descricao, respostaAreas: bruta } }];`;

// Áreas (conferidas na página, se ela rodou) → plano da leitura: tarefas pequenas, uma pergunta por chamada
// ("em qual área está cada TAG" para as TAGs que o código achou; leitura completa só do resto). 1 item por chamada.
const PREP_MATS = `${MOTOR}
${LEITURA_JS}
${LE_STATUS}
${FORM}
const prep = $('Prepara leitura de áreas').first().json;
const la = $('Lê áreas').first().json;
let areas = la.areas, conferidas = false;
try { const r = $('Confira as áreas').first().json; if (r) { areas = LEITURA.aplicaFormAreas(la.areas, r); conferidas = true; } } catch (err) { /* página não usada */ }
e.lista = LMR.lerStatusPmib(statusRows).lista;
const plano = LEITURA.planoDeLeitura(prep.ind, catalogo, areas, e);
return plano.tarefas.map((tf, i) => ({ json: { ...tf, areas, conferidas, ...(i ? {} : { conhecidos: plano.conhecidos }) } }));`;

// Uma volta: confere a resposta do lote (TAG no texto, área conhecida).
const CONFERE = `${LEITURA_JS}
const prep = $('Prepara leitura de áreas').first().json;
const r = [];
$input.all().forEach((item, i) => {
  let tf;
  try { tf = $('Lote de leituras').itemMatching(i).json; } catch (err) { tf = $('Lote de leituras').first(1).json; }
  const j = item.json || {};
  const resposta = (${RESPOSTA})(j);
  const bruta = String(typeof resposta === 'string' ? resposta : JSON.stringify(resposta)).slice(0, 30000);
  const desistiu = j.desistir ? 'IA sem resposta depois de várias tentativas: ' + j.erroIA : '';
  if (tf.tipo === 'area') {
    const c = LEITURA.confereAreasDasTags(resposta, tf, prep.ind, tf.areas);
    r.push({ json: { lote: tf.lote, tipo: tf.tipo, classif: c.classif, avisos: desistiu ? [desistiu] : c.avisos, resposta: bruta } });
  } else if (tf.tipo === 'confirma') {
    const c = LEITURA.confereConfirma(resposta, tf);
    r.push({ json: { lote: tf.lote, tipo: tf.tipo, confirmacoes: c.confirmacoes, avisos: desistiu ? [desistiu] : c.avisos, resposta: bruta } });
  } else if (tf.tipo === 'material') {
    const decisoes = LEITURA.confereMateriais(resposta, tf, prep.ind, tf.areas);
    if (desistiu) for (const d of decisoes) d.avisos.push(desistiu);
    r.push({ json: { lote: tf.lote, tipo: tf.tipo, decisoes, avisos: [], resposta: bruta } });
  } else r.push({ json: { lote: tf.lote, tipo: tf.tipo, avisos: [], resposta: '' } });
});
return r;`;

// Erro do nó de IA: se for temporário ("too many requests", tempo esgotado, serviço sobrecarregado), devolve o pedido
// para nova tentativa depois da pausa longa. $runIndex conta as vezes que este nó rodou na execução: o limite é
// 3 por lote (teto 30). Erro permanente (ex.: modelo não ligado) ou limite passado → o lote segue sem leitura (PENDÊNCIAS).
const PAUSA = 20, PAUSA_LONGA = 60;
const LIMITE_MATERIAIS = "Math.min(60, 3 * $('Prepara leituras').all().length + 3)";
const conta = (origem, max) => `const j = $input.first().json || {};
const max = ${max};
let tf;
try { tf = $('${origem}').itemMatching(0).json; } catch (err) { tf = $('${origem}').first(${origem === 'Lote de leituras' ? 1 : 0}).json; }
const erro = String((j.error && (j.error.message || j.error.description || j.error)) || j.message || 'erro do nó de IA').slice(0, 300);
const temporario = /too many requests|rate.?limit|\\b429\\b|quota|time.?out|timed out|overload|\\b50[234]\\b|ECONNRESET|temporar/i.test(erro);
return [{ json: { ...tf, desistir: !temporario || $runIndex >= max - 1, erroIA: erro } }];`;

// Fim: monta a Base e as abas de revisão.
const MONTA = `${MOTOR}
${PLANILHA_JS}
${LEITURA_JS}
${LE_STATUS}
${FORM}
const ler = no => { try { return $(no).all().map(i => i.json).filter(r => !r.error); } catch (err) { return []; } };
const st = LMR.lerStatusPmib(statusRows);
const prep = $('Prepara leitura de áreas').first().json;
const pm = $('Prepara leituras').first().json;
const la = $('Lê áreas').first().json;
const voltas = $input.all().map(i => i.json);
const decisoes = LEITURA.decisoesDaLeitura(pm.conhecidos, voltas.flatMap(x => x.classif || []), voltas.flatMap(x => x.decisoes || []),
  Object.assign({}, ...voltas.map(x => x.confirmacoes || {})), /PAI/i.test(v(${JSON.stringify(F.pec)})) ? 'PAI' : 'TAG');
const r = LEITURA.montaBase({ LMR, catalogo: st.catalogo, relacoes: st.relacoes, lista: st.lista, statusRows, areas: pm.areas, decisoes,
  escopo: v(${JSON.stringify(F.esc)}).toUpperCase(), subsistema: e.subsistema, trechos: v(${JSON.stringify(F.tre)}) || 'TODAS',
  listaTrechos: v(${JSON.stringify(F.lis)}).split(/[,;\\s]+/).filter(Boolean), especificacao: v(${JSON.stringify(F.esp)}), eixo: v(${JSON.stringify(F.eix)}),
  frequencia: v(${JSON.stringify(F.frq)}).replace(/^Ambas.*/i, 'AMBAS'), ind: prep.ind,
  kits: /^Sem/i.test(v(${JSON.stringify(F.kit)})) ? 'SEM TAG' : /PAI/i.test(v(${JSON.stringify(F.kit)})) ? 'PAI' : 'TAG' });
const extras = [
  { nome: 'PENDÊNCIAS', colunas: ['PMIB', 'ITEM', 'DESCRIÇÃO', 'TIPO', 'DETALHE'], linhas: r.pendencias, larguras: { 'DESCRIÇÃO': 45, DETALHE: 80 } },
  { nome: 'LEITURA', colunas: Object.keys(r.leitura[0] || { PMIB: '' }), linhas: r.leitura, larguras: { 'DESCRIÇÃO': 45, TAGS: 50, 'EVIDÊNCIA': 40, REGRAS: 60, AVISOS: 60, 'FREQUÊNCIA': 30 } },
  { nome: 'ÁREAS', colunas: LEITURA.COLUNAS_AREAS,
    linhas: LEITURA.abaAreas(pm.areas, r.base).concat((la.avisos || []).map(x => ({ 'ÁREA/PAINEL': 'AVISO', 'EVIDÊNCIA': x }))),
    larguras: { 'ÁREA/PAINEL': 30, 'NOVO NOME': 22, 'RDS-PP': 40, 'RDS-PP LIDO': 40, 'EVIDÊNCIA': 60 } },
  { nome: 'RESPOSTAS IA', colunas: ['LEITURA', 'RESPOSTA', 'AVISOS'], larguras: { RESPOSTA: 150, AVISOS: 60 },
    linhas: [{ LEITURA: 'áreas', RESPOSTA: la.respostaAreas, AVISOS: (la.avisos || []).join(' | ') }].concat(voltas.filter(x => x.tipo !== 'nada')
      .map(x => ({ LEITURA: ({ area: 'área das TAGs', confirma: 'confirmação das TAGs da lista', material: 'leitura completa' }[x.tipo] || x.tipo) + ', lote ' + x.lote, RESPOSTA: x.resposta, AVISOS: (x.avisos || []).join(' | ') }))) },
];
const gab = ler('Lê BASE (gabarito)').filter(x => String(x.FICHA_PMIB || '').trim());
let conferencia = null;
if (gab.length) {
  const c = LEITURA.comparaComGabarito(r.base, gab);
  conferencia = { ...LEITURA.comparaAplicacao(r.base, gab, LMR), pmibs: c.pmibs, campos: c.total };
  extras.push({ nome: 'CONFERÊNCIA', colunas: ['PMIB', 'TAGS', 'PAIS', 'RDS', 'ELEV', 'EIXO', 'TRECHOS'], linhas: c.linhas, larguras: { TAGS: 50, PAIS: 40, RDS: 50, TRECHOS: 50 } });
}
const bytes = PLANILHA.planilhaDaBase({ colunasBase: LMR.COLUNAS_BASE, base: r.base, cabecalho: r.cabecalho, docs: r.docs, relacoes: r.relacoes, extras });
const nomes = Object.values($('Formulário').first().binary || {}).map(b => b.fileName);
const sistema = String(nomes.find(n => /STATUS/i.test(n || '')) || '').replace(/\\.xlsx$/i, '').split(/\\s+-\\s+/).slice(1).join(' - ').trim() || e.subsistema || 'Sistema';
const nome = 'BASE LMR - ' + sistema + '.xlsx';
return [{ json: { ...r.resumo, conferidas: !!pm.conferidas, conferencia, arquivo: nome, kb: Math.round(bytes.length / 1024) },
  binary: { data: { data: PLANILHA.base64(bytes), mimeType: '${XLSX_MIME}', fileName: nome, fileExtension: 'xlsx' } } }];`;

const MENSAGEM = "={{ 'BASE gerada: ' + $json.linhasBase + ' linhas · ' + $json.materiais + ' materiais (' + $json.pelaCodigo + ' com TAG achada pelo código, ' + $json.lidosPelaIA + ' com leitura da IA) · '"
  + " + $json.areas + ' áreas' + ($json.conferidas ? ' (conferidas)' : '') + ' · ' + $json.regras + ' materiais ajustados por regra (aba LEITURA, coluna REGRAS) · ' + $json.pendencias + ' pendências (aba PENDÊNCIAS)'"
  + " + ($json.conferencia ? ' · CONFERÊNCIA com a BASE enviada: ' + $json.conferencia.iguais + ' de ' + $json.conferencia.gabarito + ' linhas da aplicação iguais (' + $json.conferencia.iguaisSemNomeDaArea + ' sem contar o nome da área; geradas ' + $json.conferencia.gerada + '); campos iguais por material: ' + JSON.stringify($json.conferencia.campos) + ' de ' + $json.conferencia.pmibs : '')"
  + " + '. Revise as abas PENDÊNCIAS e LEITURA e use a BASE no Workflow B.' }}";

const SISTEMA_IA = 'Você responde somente com um objeto JSON válido, sem texto antes ou depois e sem comentários. Copie códigos e TAGs exatamente como estão no texto. Quando o texto não disser, use null.';

// ── nós ──
const nodes = [];
const add = n => (nodes.push(n), n.name);
const code = (nome, js, p) => add({ parameters: { jsCode: js }, name: nome, type: 'n8n-nodes-base.code', typeVersion: 2, position: p });
// Basic LLM Chain: aceita o GEV LLM Model (o AI Agent do n8n só aceita alguns modelos). Saída em $json.text.
const agente = (nome, p) => add({
  parameters: { promptType: 'define', text: `={{ ${JSON.stringify(SISTEMA_IA + '\n\n')} + $json.prompt }}` },
  name: nome, type: '@n8n/n8n-nodes-langchain.chainLlm', typeVersion: 1.5, position: p,
  retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueErrorOutput',
});
const pausa = (nome, seg, p) => add({ parameters: { amount: seg, unit: 'seconds' }, name: nome, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: p, webhookId: crypto.randomUUID() });
const desiste = (nome, p) => add({
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ id: crypto.randomUUID(), leftValue: '={{ $json.desistir }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
  name: nome, type: 'n8n-nodes-base.if', typeVersion: 2, position: p,
});
add({
  parameters: {
    formTitle: 'LMR — A Gerar Base (IA)',
    formDescription: 'Envie os PDFs do sistema e o Status PMIB e preencha os dados da aplicação. Para teste, envie também a BASE LMR já aplicada (gabarito). No fim esta página baixa a BASE.',
    formFields: { values: [
      { fieldLabel: 'Documentos (PDF)', fieldType: 'file', multipleFiles: true, acceptFileTypes: '.pdf', requiredField: true },
      { fieldLabel: 'Status PMIB (.xlsx)', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.xlsx', requiredField: true },
      { fieldLabel: F.esc, requiredField: true, placeholder: 'UG' },
      { fieldLabel: F.sub, requiredField: true, placeholder: 'ÁGUA PURA' },
      { fieldLabel: F.tre, fieldType: 'dropdown', requiredField: true, fieldOptions: { values: OPCOES_TRECHOS.map(option => ({ option })) } },
      { fieldLabel: F.lis, requiredField: false },
      { fieldLabel: F.eix, fieldType: 'dropdown', requiredField: true, fieldOptions: { values: OPCOES_EIXO.map(option => ({ option })) } },
      { fieldLabel: F.frq, fieldType: 'dropdown', requiredField: true, fieldOptions: { values: OPCOES_FREQ.map(option => ({ option })) } },
      { fieldLabel: F.kit, fieldType: 'dropdown', requiredField: true, fieldOptions: { values: OPCOES_KITS.map(option => ({ option })) } },
      { fieldLabel: F.pec, fieldType: 'dropdown', requiredField: true, fieldOptions: { values: OPCOES_PECAS.map(option => ({ option })) } },
      { fieldLabel: F.conf, fieldType: 'dropdown', requiredField: true, fieldOptions: { values: OPCOES_CONF.map(option => ({ option })) } },
      { fieldLabel: F.esp, requiredField: false },
      { fieldLabel: 'BASE para conferência (.xlsx, opcional)', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.xlsx', requiredField: false },
    ] },
    options: {},
  },
  name: 'Formulário', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.2, position: pos(0, 1), webhookId: crypto.randomUUID(),
});
add({ parameters: { operation: 'xlsx', binaryPropertyName: BIN_STATUS, options: { headerRow: false, includeEmptyCells: true, sheetName: 'Lista de Materiais' } },
  name: 'Lê Status PMIB', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(1, 0) });
add({ parameters: { operation: 'xlsx', binaryPropertyName: BIN_BASE, options: { headerRow: true, includeEmptyCells: true, sheetName: 'BASE' } },
  name: 'Lê BASE (gabarito)', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(1, 1), onError: 'continueRegularOutput' });
code('Separa PDFs', SEPARA, pos(1, 2.5));
add({ parameters: { batchSize: 1, options: {} }, name: 'Lote de documentos', type: 'n8n-nodes-base.splitInBatches', typeVersion: 3, position: pos(2, 2.5) });
add({ parameters: { operation: 'pdf', binaryPropertyName: 'data', options: { joinPages: false, keepSource: 'json' } },
  name: 'Lê PDF (por página)', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(3, 3.5), onError: 'continueRegularOutput' });
code('Indexa documento', INDEXA, pos(4, 3.5));
code('Prepara leitura de áreas', PREP_AREAS, pos(3, 1.5));
agente('IA: áreas', pos(4, 1.5));
code('Conta tentativas (áreas)', conta('Prepara leitura de áreas', '6'), pos(4, 3.2));
desiste('Desiste? (áreas)', pos(5, 3.2));
pausa('Pausa longa (áreas)', PAUSA_LONGA, pos(5, 4.2));
code('Lê áreas', LE_AREAS, pos(5, 1.5));
add({
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ id: crypto.randomUUID(), leftValue: '={{ $json.conferir }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
  name: 'Conferir áreas?', type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(6, 1.5),
});
// página do formulário no meio da execução (mesmo nó da página final): campos montados pelo Code "Lê áreas"
add({
  parameters: { operation: 'page', defineForm: 'json', jsonOutput: '={{ $json.campos }}',
    options: { formTitle: 'Confira as áreas', formDescription: '={{ $json.descricao }}', buttonLabel: 'Ler os materiais' } },
  name: 'Confira as áreas', type: 'n8n-nodes-base.form', typeVersion: 1, position: pos(7, 0.8), webhookId: crypto.randomUUID(),
});
code('Prepara leituras', PREP_MATS, pos(8, 1.5));
add({ parameters: { batchSize: 1, options: {} }, name: 'Lote de leituras', type: 'n8n-nodes-base.splitInBatches', typeVersion: 3, position: pos(9, 1.5) });
pausa('Pausa', PAUSA, pos(10, 2.5));
agente('IA: leituras', pos(11, 2.5));
code('Conta tentativas (leituras)', conta('Lote de leituras', LIMITE_MATERIAIS), pos(11, 4.2));
desiste('Desiste? (leituras)', pos(12, 4.2));
pausa('Pausa longa (leituras)', PAUSA_LONGA, pos(12, 5.2));
code('Confere leitura', CONFERE, pos(12, 2.5));
code('Monta Base', MONTA, pos(10, 0.3));
add({
  parameters: { operation: 'completion', respondWith: 'returnBinary', inputDataFieldName: 'data', completionTitle: 'BASE LMR gerada', completionMessage: MENSAGEM },
  name: 'Entrega a Base', type: 'n8n-nodes-base.form', typeVersion: 1, position: pos(11, 0.3), webhookId: crypto.randomUUID(),
});
add({
  parameters: { content: '## LMR — A Gerar Base (IA) · v2\n**Antes da 1ª execução:** nos nós **IA: áreas** e **IA: leituras** (Basic LLM Chain), clique no **+** de *Model* embaixo do nó e escolha o **GEV LLM Model**; dentro dele escolha o modelo (recomendado: **Gemini Flash 3**). Os dois nós precisam do modelo.\n\n1. ⋯ → *Settings* → *Save manual executions* = **Save**.\n2. **Execute workflow** → envie os PDFs e o Status PMIB e preencha o formulário. **Kits**: Água Pura = *Sem TAG*; Reg. Vel. e Aeração = *Levam a TAG do equipamento*. **Peças**: Reg. Vel. = *Citam o equipamento como PAI*; os outros = *Levam a TAG do equipamento*. Para teste, envie a **BASE LMR** do mesmo sistema (gabarito).\n3. **Deixe a aba do formulário aberta.** Com *Conferir as áreas = Sim*, depois de ~1 min aparece a página **Confira as áreas**: preencha só o que estiver errado ou faltando (nome, RDS-PP, elevação, trechos da área se ela não estiver em todos; áreas que faltam, uma por linha) e clique em **Ler os materiais**.\n4. No fim a página baixa **BASE LMR - {sistema}.xlsx**. Me devolva a **mensagem final**. Revise **PENDÊNCIAS** e **LEITURA** (coluna REGRAS = o que o código corrigiu sem IA) e use a BASE no **Workflow B**.\n\nA leitura é feita em chamadas pequenas (confirmação das TAGs, área das TAGs, leitura completa só do que o código não achou), com **pausa de 20 s** entre elas. Se o serviço recusar ("too many requests"), espera 60 s e tenta de novo (até 3 vezes por lote); se não der, o lote vai para PENDÊNCIAS.', height: 460, width: 640 },
  name: 'Leia-me', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos(0, -2),
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
liga('Lote de documentos', 'Prepara leitura de áreas', 0); // done
liga('Lote de documentos', 'Lê PDF (por página)', 1); // loop
liga('Lê PDF (por página)', 'Indexa documento');
liga('Indexa documento', 'Lote de documentos');
liga('Prepara leitura de áreas', 'IA: áreas');
liga('IA: áreas', 'Lê áreas', 0);
liga('IA: áreas', 'Conta tentativas (áreas)', 1); // saída de erro
liga('Conta tentativas (áreas)', 'Desiste? (áreas)');
liga('Desiste? (áreas)', 'Lê áreas', 0); // true: segue sem áreas
liga('Desiste? (áreas)', 'Pausa longa (áreas)', 1); // false: espera e tenta de novo
liga('Pausa longa (áreas)', 'IA: áreas');
liga('Lê áreas', 'Conferir áreas?');
liga('Conferir áreas?', 'Confira as áreas', 0); // true: página do formulário
liga('Conferir áreas?', 'Prepara leituras', 1); // false: segue com as áreas lidas
liga('Confira as áreas', 'Prepara leituras');
liga('Prepara leituras', 'Lote de leituras');
liga('Lote de leituras', 'Monta Base', 0); // done
liga('Lote de leituras', 'Pausa', 1); // loop
liga('Pausa', 'IA: leituras');
liga('IA: leituras', 'Confere leitura', 0);
liga('IA: leituras', 'Conta tentativas (leituras)', 1); // saída de erro
liga('Conta tentativas (leituras)', 'Desiste? (leituras)');
liga('Desiste? (leituras)', 'Confere leitura', 0); // true: lote vai para PENDÊNCIAS
liga('Desiste? (leituras)', 'Pausa longa (leituras)', 1); // false: espera e tenta de novo
liga('Pausa longa (leituras)', 'IA: leituras');
liga('Confere leitura', 'Lote de leituras');
liga('Monta Base', 'Entrega a Base');

const wf = { name: 'LMR - A Gerar Base (IA) v2', nodes, connections,
  settings: { executionOrder: 'v1', saveManualExecutions: true, saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all', saveExecutionProgress: true },
  pinData: {}, meta: { templateCredsSetupCompleted: true } };
const destino = path.join(__dirname, 'LMR_A_gerar_base.json');
fs.writeFileSync(destino, JSON.stringify(wf, null, 2));
console.log('ok', path.basename(destino), nodes.length, 'nós,', (fs.statSync(destino).size / 1024).toFixed(0), 'KB');

// ───────────────────────── LMR - A Revisar áreas (sem IA) ─────────────────────────
// A BASE gerada pelo A tem a aba ÁREAS (uma linha por área). O usuário preenche ELEVAÇÃO, EIXO, RDS-PP e NOVO NOME e
// envia a BASE de volta: este workflow aplica nas linhas da BASE e refaz as pendências de elevação.
const REVISA = `${MOTOR}
${PLANILHA_JS}
${LEITURA_JS}
const ler = no => { try { return $(no).all().map(i => i.json).filter(r => !r.error); } catch (err) { return []; } };
const base = ler('Lê BASE').filter(r => String(r.FICHA_PMIB || '').trim());
const areas = ler('Lê ÁREAS').filter(r => String(r['ÁREA/PAINEL'] || '').trim());
if (!base.length) throw new Error('O arquivo enviado não tem a aba BASE.');
if (!areas.length) throw new Error('O arquivo enviado não tem a aba ÁREAS (ela vem da BASE gerada pelo Workflow A).');
const rv = LEITURA.revisaAreas({ base, areas, pendencias: ler('Lê PENDÊNCIAS') });
const cabecalho = {};
for (const r of ler('Lê CABEÇALHO')) if (String(r.CAMPO || '').trim()) cabecalho[String(r.CAMPO).trim()] = r.VALOR;
const leitura = ler('Lê LEITURA'), respostas = ler('Lê RESPOSTAS IA');
const extras = [
  { nome: 'PENDÊNCIAS', colunas: ['PMIB', 'ITEM', 'DESCRIÇÃO', 'TIPO', 'DETALHE'], linhas: rv.pendencias, larguras: { 'DESCRIÇÃO': 45, DETALHE: 80 } },
  { nome: 'LEITURA', colunas: Object.keys(leitura[0] || { PMIB: '' }), linhas: leitura, larguras: { 'DESCRIÇÃO': 45, TAGS: 50, 'EVIDÊNCIA': 40, AVISOS: 60 } },
  { nome: 'ÁREAS', colunas: LEITURA.COLUNAS_AREAS, linhas: rv.areas, larguras: { 'ÁREA/PAINEL': 30, 'NOVO NOME': 22, 'RDS-PP': 40, 'RDS-PP LIDO': 40, 'EVIDÊNCIA': 60 } },
];
if (respostas.length) extras.push({ nome: 'RESPOSTAS IA', colunas: ['LEITURA', 'RESPOSTA'], linhas: respostas, larguras: { RESPOSTA: 150 } });
const gab = ler('Lê BASE (gabarito)').filter(x => String(x.FICHA_PMIB || '').trim());
let conferencia = null;
if (gab.length) {
  const c = LEITURA.comparaComGabarito(rv.base, gab);
  conferencia = { ...LEITURA.comparaAplicacao(rv.base, gab, LMR), pmibs: c.pmibs, campos: c.total };
  extras.push({ nome: 'CONFERÊNCIA', colunas: ['PMIB', 'TAGS', 'PAIS', 'RDS', 'ELEV', 'EIXO', 'TRECHOS'], linhas: c.linhas, larguras: { TAGS: 50, PAIS: 40, RDS: 50, TRECHOS: 50 } });
}
const bytes = PLANILHA.planilhaDaBase({ colunasBase: LMR.COLUNAS_BASE, base: rv.base, cabecalho, docs: ler('Lê DOCS DE REFERÊNCIA'), relacoes: ler('Lê RELAÇÕES'), extras });
const enviado = Object.values($('Formulário').first().binary || {})[0] || {};
const nome = String(enviado.fileName || 'BASE LMR.xlsx').replace(/\.xlsx$/i, '').replace(/\s*-\s*revisada$/i, '') + ' - revisada.xlsx';
return [{ json: { ...rv.resumo, conferencia, arquivo: nome },
  binary: { data: { data: PLANILHA.base64(bytes), mimeType: '${XLSX_MIME}', fileName: nome, fileExtension: 'xlsx' } } }];`;
const MENSAGEM_REVISA = "={{ 'BASE revisada: ' + $json.areas + ' áreas aplicadas, ' + $json.linhasAlteradas + ' linhas alteradas · ' + $json.pendencias + ' pendências'"
  + " + ($json.semElevacao ? ' (' + $json.semElevacao + ' linhas ainda sem elevação)' : '')"
  + " + ($json.conferencia ? ' · CONFERÊNCIA: ' + $json.conferencia.iguais + ' de ' + $json.conferencia.gabarito + ' linhas da aplicação iguais; campos iguais por material: ' + JSON.stringify($json.conferencia.campos) + ' de ' + $json.conferencia.pmibs : '')"
  + " + '. Use a BASE revisada no Workflow B.' }}";
const wfRevisa = (() => {
  const nds = [];
  const cn = {};
  const ad = n => (nds.push(n), n.name);
  const lg = (de, para) => { (cn[de] = cn[de] || { main: [[]] }).main[0].push({ node: para, type: 'main', index: 0 }); };
  ad({ parameters: { formTitle: 'LMR — A Revisar áreas', formDescription: 'Envie a BASE gerada pelo Workflow A com a aba ÁREAS preenchida (ELEVAÇÃO, EIXO, RDS-PP, NOVO NOME). Sai a BASE revisada.',
    formFields: { values: [
      { fieldLabel: 'BASE com a aba ÁREAS revisada (.xlsx)', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.xlsx', requiredField: true },
      { fieldLabel: 'BASE para conferência (.xlsx, opcional)', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.xlsx', requiredField: false }] }, options: {} },
  name: 'Formulário', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.2, position: pos(0, 3), webhookId: crypto.randomUUID() });
  const abas = ['CABEÇALHO', 'DOCS DE REFERÊNCIA', 'RELAÇÕES', 'PENDÊNCIAS', 'LEITURA', 'RESPOSTAS IA', 'ÁREAS', 'BASE'];
  abas.forEach((aba, i) => {
    ad({ parameters: { operation: 'xlsx', binaryPropertyName: '={{ Object.keys($binary)[0] }}', options: { headerRow: true, includeEmptyCells: true, sheetName: aba } },
      name: `Lê ${aba}`, type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(1, i), onError: 'continueRegularOutput' });
    lg('Formulário', `Lê ${aba}`);
  });
  ad({ parameters: { operation: 'xlsx', binaryPropertyName: "={{ Object.keys($binary)[1] || 'sem_gabarito' }}", options: { headerRow: true, includeEmptyCells: true, sheetName: 'BASE' } },
    name: 'Lê BASE (gabarito)', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(1, -1), onError: 'continueRegularOutput' });
  cn['Formulário'].main[0].unshift({ node: 'Lê BASE (gabarito)', type: 'main', index: 0 }); // roda antes das outras
  ad({ parameters: { jsCode: REVISA }, name: 'Aplica as áreas', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(2, abas.length - 1) });
  ad({ parameters: { operation: 'completion', respondWith: 'returnBinary', inputDataFieldName: 'data', completionTitle: 'BASE revisada', completionMessage: MENSAGEM_REVISA },
    name: 'Entrega a Base revisada', type: 'n8n-nodes-base.form', typeVersion: 1, position: pos(3, abas.length - 1), webhookId: crypto.randomUUID() });
  ad({ parameters: { content: '## LMR — A Revisar áreas (sem IA)\n1. Abra a BASE gerada pelo **Workflow A**, aba **ÁREAS**. Para cada área preencha ou corrija **ELEVAÇÃO**, **EIXO**, **RDS-PP** e, se quiser outro nome, **NOVO NOME** (duas áreas com o mesmo NOVO NOME viram uma só). Não mexa nas colunas **… LIDO / LIDA**.\n2. Salve, clique em **Execute workflow** e envie o arquivo (para teste, envie também a BASE emitida como gabarito).\n3. A página final baixa **… - revisada.xlsx**. Confira PENDÊNCIAS e use a BASE revisada no **Workflow B**.\n\nPode repetir quantas vezes quiser: não chama a IA.', height: 320, width: 560 },
    name: 'Leia-me', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos(0, -2) });
  lg('Lê BASE', 'Aplica as áreas');
  lg('Aplica as áreas', 'Entrega a Base revisada');
  return { ...wf, name: 'LMR - A Revisar áreas', nodes: nds, connections: cn };
})();
const destinoRevisa = path.join(__dirname, 'LMR_A_revisar_areas.json');
fs.writeFileSync(destinoRevisa, JSON.stringify(wfRevisa, null, 2));
console.log('ok', path.basename(destinoRevisa), wfRevisa.nodes.length, 'nós,', (fs.statSync(destinoRevisa).size / 1024).toFixed(0), 'KB');

// ───────────────────────── teste local: imita o n8n nó a nó ─────────────────────────
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const D = path.join(RAIZ, 'dados');
const SAIDA = path.join(RAIZ, 'saida', 'teste_a');
fs.mkdirSync(SAIDA, { recursive: true });
const roda = (js, $, entrada, runIndex = 0) => new AsyncFn('$', '$input', '$runIndex', js)($, { all: () => entrada, first: () => entrada[0] }, runIndex);
const copia = o => JSON.parse(JSON.stringify(o));

// ia(prompt) → texto da resposta; null = erro permanente (modelo não ligado); { erro } = recusa nesta tentativa
// conferir(campos) → respostas da página "Confira as áreas" (só quando o formulário pede a conferência)
async function rodaA(docs, statusRows, gabarito, form, nomeStatus, ia, conferir) {
  const saidas = {
    'Formulário': [{ json: form, binary: { a: { fileName: 'x.pdf' }, b: { fileName: nomeStatus } } }],
    'Lê Status PMIB': statusRows.map(row => ({ json: { row } })),
    'Lê BASE (gabarito)': gabarito ? gabarito.map(json => ({ json })) : [{ json: { error: 'sem binário' } }],
  };
  let loteAtual = null;
  const $ = no => ({
    all: () => saidas[no] || [], first: () => (saidas[no] || [])[0],
    itemMatching: () => { if (no === 'Lote de leituras') return loteAtual; throw new Error('sem pareamento'); },
  });
  const execucoes = { 'áreas': 0, materiais: 0 };
  let tentativas = 0;
  const CONTA = { 'áreas': conta('Prepara leitura de áreas', '6'), materiais: conta('Lote de leituras', LIMITE_MATERIAIS) };
  const chamaIA = async (qual, item) => {
    for (;;) {
      const r = ia(item.json.prompt);
      if (typeof r === 'string') return { json: { text: r } }; // Basic LLM Chain devolve em text
      tentativas++;
      const c = copia(await roda(CONTA[qual], $, [{ json: { error: { message: r == null ? 'modelo não ligado' : r.erro } } }], execucoes[qual]++))[0];
      if (c.json.desistir) return c; // Desiste? = true
      item = c; // Pausa longa → IA de novo
    }
  };
  const indexados = [];
  for (const d of docs) indexados.push(...copia(await roda(INDEXA, $, [{ json: { arquivo: d.arquivo, text: d.paginas || [] } }])));
  saidas['Prepara leitura de áreas'] = copia(await roda(PREP_AREAS, $, indexados));
  saidas['IA: áreas'] = [await chamaIA('áreas', saidas['Prepara leitura de áreas'][0])];
  saidas['Lê áreas'] = copia(await roda(LE_AREAS, $, saidas['IA: áreas']));
  const la = saidas['Lê áreas'][0].json;
  if (la.conferir) saidas['Confira as áreas'] = [{ json: (conferir || (() => ({})))(JSON.parse(la.campos), la.descricao) }];
  saidas['Prepara leituras'] = copia(await roda(PREP_MATS, $, saidas['Confira as áreas'] || saidas['Lê áreas']));
  const voltas = [];
  for (const lote of saidas['Prepara leituras']) {
    loteAtual = lote;
    voltas.push(...copia(await roda(CONFERE, $, [await chamaIA('materiais', lote)])));
  }
  return { r: (await roda(MONTA, $, voltas))[0], lotes: voltas.length, tentativas, prompts: saidas['Prepara leituras'].map(x => x.json.prompt.length),
    textos: saidas['Prepara leituras'].map(x => x.json.prompt), pagina: la };
}

(async () => {
  const LMR = require('../lmr.js');
  const LEITURA = require('../leitura/leitura.js');
  const { oraculo } = require('../leitura/oraculo.js');
  const n = 'agua_pura';
  if (!fs.existsSync(path.join(D, `textos_${n}.json`))) { console.log('sem dados/textos_agua_pura.json: teste local pulado'); return; }
  const docs = JSON.parse(fs.readFileSync(path.join(D, `textos_${n}.json`), 'utf8'));
  const statusRows = JSON.parse(fs.readFileSync(path.join(D, `status_${n}.json`), 'utf8')).linhas;
  const gab = JSON.parse(fs.readFileSync(path.join(D, `base_${n}.json`), 'utf8')).base;
  const form = { [F.esc]: 'UG', [F.sub]: 'Água Pura', [F.tre]: 'TODAS', [F.lis]: '', [F.eix]: 'CD', [F.frq]: 'Deixar pendência', [F.esp]: 'UNIDADE GERADORA / AUXILIARES DA UG',
    [F.kit]: OPCOES_KITS[1], [F.pec]: OPCOES_PECAS[0], [F.conf]: 'Não' }; // Água Pura: kit sem TAG; peça com a TAG do equipamento
  const nomeStatus = '#ST00=M00MKF10&MPB020_STATUS_PMIB - Água Pura.xlsx';

  // T1 — IA perfeita: a resposta sai do gabarito, no formato pedido pelo prompt (com ```json em volta)
  const or = oraculo(gab);
  // pedidos da etapa "em qual área está cada TAG": áreas numeradas e lista de TAGs
  const ehPedidoDeArea = prompt => /TAREFA: para cada TAG da lista/.test(prompt);
  const tagsDoPedido = prompt => (prompt.match(/^TAGS: (.*)$/m) || ['', ''])[1].split(', ').filter(Boolean);
  const numeroDaArea = (prompt, nome) => { const m = [...prompt.matchAll(/^(\d+)\. "([^"]+)"/gm)].find(x => x[2] === nome); return m ? Number(m[1]) : 0; };
  const tagOraculo = new Map();
  for (const m of or.mats.values()) for (const x of m.tags) if (!tagOraculo.has(x.tag)) tagOraculo.set(x.tag, x);
  // TAG da lista de sobressalentes que o gabarito não usa (equipamento do kit; divergência lista × aplicação emitida):
  // a "IA perfeita" responde a área do material no gabarito
  const stT = LMR.lerStatusPmib(statusRows);
  const indT = LEITURA.indiceCompacto(docs.map(d => require('../indice/indice.js').indexaDocumento(d.arquivo, d.paginas || [], stT.catalogo)));
  for (const [pmib, m] of or.mats) for (const tg of indT.sug[pmib] || []) if (!tagOraculo.has(tg)) tagOraculo.set(tg, { area: (m.tags[0] || {}).area || m.area, rds_proprio: true });
  const ehConfirma = prompt => /TAREFA: para cada material abaixo há o trecho da lista/.test(prompt);
  const respondeConfirma = prompt => JSON.stringify({ materiais: [...prompt.matchAll(/^- pmib: (\S+) \|.*\n  candidatas: (.*)$/gm)].map(([, pmib, c]) => {
    const m = or.mats.get(pmib) || { tags: [], pais: [] }; const minhas = [...m.tags.map(x => x.tag), ...m.pais];
    return { pmib, tags: c.split(', ').filter(x => minhas.includes(x) || !minhas.length), papel: m.pais.length ? 'peca' : 'proprio' }; }) });
  const respondeAreas = (prompt, f) => JSON.stringify({ tags: tagsDoPedido(prompt).map(tag => ({ tag, ...f(tag) })) });
  const iaPerfeita = prompt => {
    if (/TAREFA: liste as ÁREAS/.test(prompt)) return '```json\n' + JSON.stringify({ areas: or.areas }) + '\n```';
    if (ehConfirma(prompt)) return respondeConfirma(prompt);
    if (ehPedidoDeArea(prompt)) return respondeAreas(prompt, tag => { const x = tagOraculo.get(tag) || {}; return { area: numeroDaArea(prompt, x.area), rds_proprio: x.rds_proprio, elevacao: x.elevacao || null }; });
    const pmibs = [...prompt.matchAll(/- pmib: (\S+)/g)].map(m => m[1]);
    return JSON.stringify({ materiais: pmibs.map(p => or.mats.get(p) || { pmib: p }) });
  };
  const t1 = await rodaA(docs, statusRows, gab, form, nomeStatus, iaPerfeita);
  const j1 = t1.r.json;
  fs.writeFileSync(path.join(SAIDA, t1.r.binary.data.fileName), Buffer.from(t1.r.binary.data.data, 'base64'));
  assert.strictEqual(t1.r.binary.data.fileName, 'BASE LMR - Água Pura.xlsx');
  assert.strictEqual(j1.pelaCodigo, 78, 'TAGs achadas pelo código (lista de sobressalentes e do painel)');
  assert.ok(t1.lotes <= 10, `${t1.lotes} chamadas de leitura`); // 5 área das TAGs + 3 confirmação + 2 leitura completa (a v2 fazia 13 maiores)
  assert.ok(j1.pendencias <= 4, JSON.stringify(j1)); // divergências da lista: 0813/0815 sem TAG confirmada (QTD) e 2 TAGs de kit só na lista
  assert.ok(j1.conferencia.iguais >= 3200, 'linhas iguais ao gabarito: ' + j1.conferencia.iguais); // o resto é divergência lista R1A × aplicação emitida
  console.log(`T1 ok  IA perfeita: ${j1.pelaCodigo} materiais com TAG do código, ${t1.lotes} chamadas de leitura (prompts ${Math.min(...t1.prompts)}–${Math.max(...t1.prompts)} car.) → BASE ${j1.linhasBase} linhas; conferência ${j1.conferencia.iguais}/${j1.conferencia.gabarito} linhas, campos ${JSON.stringify(j1.conferencia.campos)}`);

  // T2 — a BASE gerada passa pelo Workflow B (relida do .xlsx como o Extract faz) e dá as mesmas linhas
  const { execFileSync } = require('child_process');
  const lida = JSON.parse(execFileSync('python', ['-X', 'utf8', '-c',
    'import openpyxl,json,sys\nwb=openpyxl.load_workbook(sys.argv[1])\nws=wb["BASE"]\nr=list(ws.iter_rows(values_only=True))\nprint(json.dumps({"base":[{k:("" if v is None else v) for k,v in zip(r[0],x)} for x in r[1:]],"abas":wb.sheetnames},ensure_ascii=False))',
    path.join(SAIDA, t1.r.binary.data.fileName)], { encoding: 'utf8' }));
  const app = lida.base.map(LMR.linhaParaModelo).filter(m => m.qtd > 0).flatMap(LMR.geraModelo);
  assert.strictEqual(app.length, j1.conferencia.gerada);
  for (const aba of ['BASE', 'CABEÇALHO', 'DOCS DE REFERÊNCIA', 'PENDÊNCIAS', 'LEITURA', 'ÁREAS', 'RESPOSTAS IA', 'CONFERÊNCIA', 'LEIA-ME']) assert.ok(lida.abas.includes(aba), aba);
  console.log(`T2 ok  BASE relida do .xlsx → ${app.length} linhas da aplicação; abas: ${lida.abas.join(', ')}`);

  // T3 — sem IA (modelo não ligado): a Base sai, tudo em PENDÊNCIAS, nada inventado
  const t3 = await rodaA(docs, statusRows, null, form, nomeStatus, () => null);
  const j3 = t3.r.json;
  assert.strictEqual(j3.lidosPelaIA, 0);
  assert.strictEqual(j3.areas, 0);
  assert.ok(j3.pendencias > 0);
  console.log(`T3 ok  sem IA: BASE ${j3.linhasBase} linhas, ${j3.pendencias} pendências, sem conferência`);

  // T4 — IA que responde mal: TAG inventada e área fora da lista viram aviso; JSON quebrado não derruba
  const iaRuim = prompt => {
    if (/TAREFA: liste as ÁREAS/.test(prompt)) return 'Aqui está: {"areas":[{"nome":"SKID","rds":"#ST00=M00MKF10UZ999-UZ999","local":"casa de forca","elevacao":"98.5","eixo":"XY"}]}';
    if (ehPedidoDeArea(prompt) || ehConfirma(prompt)) return 'não sei';
    const pmibs = [...prompt.matchAll(/- pmib: (\S+)/g)].map(m => m[1]);
    if (pmibs.includes(primeiroLido)) return `{"materiais":[{"pmib":"${primeiroLido}","tags":[{"tag":"ZZ999X","area":"PAINEL INEXISTENTE","rds_proprio":true}]}]}`;
    if (!primeiroLido) { primeiroLido = pmibs[0]; return iaRuim(prompt); }
    return 'não sei';
  };
  let primeiroLido = '';
  const t4 = await rodaA(docs, statusRows, null, form, nomeStatus, iaRuim);
  const lida4 = path.join(SAIDA, 'BASE LMR - Água Pura (IA ruim).xlsx');
  fs.writeFileSync(lida4, Buffer.from(t4.r.binary.data.data, 'base64'));
  const pend = JSON.parse(execFileSync('python', ['-X', 'utf8', '-c',
    'import openpyxl,json,sys\nwb=openpyxl.load_workbook(sys.argv[1])\nprint(json.dumps([list(r) for r in wb["PENDÊNCIAS"].iter_rows(values_only=True)]+[list(r) for r in wb["ÁREAS"].iter_rows(values_only=True)],ensure_ascii=False))', lida4], { encoding: 'utf8' }));
  const txt = JSON.stringify(pend);
  assert.match(txt, /TAG ZZ999X não está nos documentos/);
  assert.match(txt, /fora da lista de áreas/);
  assert.match(txt, /resposta da IA sem JSON válido/);
  assert.match(txt, /TAG \w+: área não identificada/);
  assert.match(txt, /UZ999-UZ999 não está nos documentos/);
  assert.match(txt, /"SKID",null,null,"CASA DE FORÇA","98,50"/); // ÁREA, NOVO NOME, RDS-PP (inventado → vazio), LOCAL, ELEVAÇÃO
  console.log(`T4 ok  IA ruim: TAG inventada, área desconhecida, RDS-PP inventado e JSON quebrado viram PENDÊNCIAS (${t4.r.json.pendencias})`);
  // T5 — o serviço recusa as 2 primeiras tentativas de cada chamada ("too many requests"): mesmo resultado do T1
  const recusas = new Map();
  const iaLimitada = prompt => {
    const k = prompt.length + prompt.slice(-200);
    const n = recusas.get(k) || 0;
    recusas.set(k, n + 1);
    return n < 2 ? { erro: 'The service is receiving too many requests from you' } : iaPerfeita(prompt);
  };
  const t5 = await rodaA(docs, statusRows, gab, form, nomeStatus, iaLimitada);
  assert.strictEqual(t5.r.json.lidosPelaIA, j1.lidosPelaIA, 'materiais lidos com recusas');
  assert.strictEqual(t5.r.json.conferencia.iguais, j1.conferencia.iguais);
  console.log(`T5 ok  serviço recusando 2× cada chamada: ${t5.tentativas} recusas, tudo lido, conferência igual ao T1`);

  // T6 — recusa permanente: desiste depois do limite e a Base sai com PENDÊNCIAS (sem loop infinito)
  const t6 = await rodaA(docs, statusRows, null, form, nomeStatus, () => ({ erro: 'The service is receiving too many requests from you' }));
  assert.strictEqual(t6.r.json.lidosPelaIA, 0);
  console.log(`T6 ok  recusa permanente: ${t6.tentativas} tentativas no total, BASE com ${t6.r.json.pendencias} pendências`);
  // T7 — erros vistos na 1ª execução no AMP: nome da área copiado com o RDS-PP, QTD da lista de sobressalentes, eixo vazio
  const iaAmp = prompt => {
    if (/TAREFA: liste as ÁREAS/.test(prompt)) return JSON.stringify({ areas: [
      { nome: 'SKID DE ÁGUA PURA', rds: '#ST00=M00MKF10UZ010-UZ001', local: 'CASA DE FORÇA', elevacao: '98,50', eixo: null },
      { nome: 'PAINEL DE CONTROLE (PWB)', rds: '#ST00=M00MKF10UH010-UH001', local: 'CASA DE FORÇA', elevacao: null, eixo: null }] });
    if (ehConfirma(prompt)) return iaPerfeita(prompt);
    if (ehPedidoDeArea(prompt)) return respondeAreas(prompt, () => ({ area: 1, rds_proprio: true }));
    const pmibs = [...prompt.matchAll(/- pmib: (\S+)/g)].map(m => m[1]);
    return JSON.stringify({ materiais: pmibs.map(p => ({ pmib: p, tags: [], pais: [],
      area: p.endsWith('0838') ? 'PAINEL DE CONTROLE (PWB) (#ST00=M00MKF10UH010-UH001)' : '2. "SKID DE ÁGUA PURA"', qtd_instalada: 2, evidencia: '#ST00=M00MKF10&MPB020 p.4' })) });
  };
  const t7 = await rodaA(docs, statusRows, null, form, nomeStatus, iaAmp);
  const b7 = path.join(SAIDA, 'BASE LMR - Água Pura (T7).xlsx');
  fs.writeFileSync(b7, Buffer.from(t7.r.binary.data.data, 'base64'));
  const x7 = JSON.parse(execFileSync('python', ['-X', 'utf8', '-c',
    'import openpyxl,json,sys\nwb=openpyxl.load_workbook(sys.argv[1])\nprint(json.dumps({a:[list(r) for r in wb[a].iter_rows(values_only=True)] for a in ["BASE","PENDÊNCIAS"]},ensure_ascii=False))', b7], { encoding: 'utf8' }));
  const h = x7.BASE[0], linhas = x7.BASE.slice(1);
  const pend7 = JSON.stringify(x7['PENDÊNCIAS']);
  assert.ok(!/fora da lista de áreas/.test(pend7), 'nome com RDS-PP aceito');
  assert.ok(linhas.every(l => l[h.indexOf('ÁREA/PAINEL')]), 'toda linha com área');
  assert.ok(linhas.every(l => l[h.indexOf('EIXO')] === 'CD'), 'eixo do formulário');
  const semElev = linhas.filter(l => !l[h.indexOf('ELEVAÇÃO')]);
  assert.ok(semElev.length && semElev.every(l => l[h.indexOf('ÁREA/PAINEL')] === 'PWB'), 'só o PWB (sem elevação no documento) fica sem elevação');
  assert.match(pend7, /a área PWB não tem elevação escrita nos documentos: preencha ELEVAÇÃO nas \d+ linhas/);
  assert.match(pend7, /QTD 2 recusada: a fonte citada é a lista de sobressalentes/);
  console.log(`T7 ok  nome de área com RDS-PP aceito, eixo CD do formulário, PWB sem elevação vira PENDÊNCIA, QTD de reposição recusada`);
  // T9 — revisão das áreas: o usuário preenche a elevação do PWB e renomeia/troca o RDS-PP do SKID na aba ÁREAS
  const leAbas = arq => JSON.parse(execFileSync('python', ['-X', 'utf8', '-c',
    'import openpyxl,json,sys\nwb=openpyxl.load_workbook(sys.argv[1])\nout={}\nfor ws in wb:\n  r=list(ws.iter_rows(values_only=True))\n  out[ws.title]=[{k:("" if v is None else v) for k,v in zip(r[0],x)} for x in r[1:]] if r and ws.title!="LEIA-ME" else []\nprint(json.dumps(out,ensure_ascii=False,default=str))', arq], { encoding: 'utf8', maxBuffer: 1 << 26 }));
  const a7 = leAbas(b7);
  a7['ÁREAS'] = a7['ÁREAS'].map(a => (a['ÁREA/PAINEL'] === 'PWB' ? { ...a, 'ELEVAÇÃO': 98.5 }
    : a['ÁREA/PAINEL'] === 'SKID DE ÁGUA PURA' || a['ÁREA/PAINEL'] === 'SKID' ? { ...a, 'NOVO NOME': 'SKID AP', 'RDS-PP': '#ST00=M00MKF10UZ010-UZ002' } : a));
  const $r = no => ({ all: () => (no === 'Formulário' ? [] : (a7[no.replace(/^Lê /, '')] || []).map(json => ({ json }))),
    first: () => ({ binary: { a: { fileName: 'BASE LMR - Água Pura.xlsx' } } }) });
  const [r9] = await roda(REVISA, $r, []);
  const b9 = path.join(SAIDA, r9.binary.data.fileName);
  fs.writeFileSync(b9, Buffer.from(r9.binary.data.data, 'base64'));
  const x9 = leAbas(b9);
  assert.strictEqual(r9.binary.data.fileName, 'BASE LMR - Água Pura - revisada.xlsx');
  assert.ok(x9.BASE.every(l => l['ELEVAÇÃO'] === '98,50'), 'toda linha com elevação');
  assert.ok(x9.BASE.filter(l => l['ÁREA/PAINEL'] === 'SKID AP').every(l => l['RDS-PP'] === '#ST[XX]=M[XX]MKF10UZ010-UZ002'), 'SKID renomeado com o RDS-PP novo');
  assert.ok(!x9.BASE.some(l => l['ÁREA/PAINEL'] === 'SKID'), 'não sobra SKID');
  assert.ok(!x9['PENDÊNCIAS'].some(p => p.TIPO === 'ELEVAÇÃO'), 'pendência de elevação resolvida');
  const app9 = x9.BASE.map(LMR.linhaParaModelo).filter(m => m.qtd > 0).flatMap(LMR.geraModelo);
  assert.ok(app9.length > 0 && app9.every(l => !l.codigo.includes('[?]') || /QTD/.test(l.codigo)), 'aplicação sem campo faltando');
  // PAIS que citam o RDS-PP antigo da área passam a citar o novo
  const rvP = LEITURA.revisaAreas({ base: [{ FICHA_PMIB: '1', 'ÁREA/PAINEL': 'A', 'RDS-PP': '#ST[XX]=M[XX]XXX10UZ010', PAIS: 'GP101 | #ST[XX]=M[XX]XXX10UZ010', 'ELEVAÇÃO': '' }],
    areas: [{ 'ÁREA/PAINEL': 'A', 'NOVO NOME': '', 'RDS-PP': '#ST00=M00XXX10UZ020', 'RDS-PP LIDO': '#ST00=M00XXX10UZ010', 'ELEVAÇÃO': '98,5', 'ELEVAÇÃO LIDA': '' }], pendencias: [] });
  assert.strictEqual(rvP.base[0].PAIS, 'GP101 | #ST[XX]=M[XX]XXX10UZ020');
  assert.strictEqual(rvP.base[0]['ELEVAÇÃO'], '98,50');
  console.log(`T9 ok  revisão das áreas: ${r9.json.linhasAlteradas} linhas alteradas, elevação do PWB aplicada, SKID → SKID AP com RDS-PP novo (também nos PAIS), pendência de elevação resolvida`);

  // T8 — elevação por TAG e por material: sobrepõe a da área se estiver escrita nos documentos; inventada é recusada
  const iaElev = prompt => {
    if (/TAREFA: liste as ÁREAS/.test(prompt)) return JSON.stringify({ areas: [{ nome: 'SKID', rds: '#ST00=M00MKF10UZ010-UZ001', local: 'CASA DE FORÇA', elevacao: '98,50', eixo: 'eixo C/D' }] });
    if (ehConfirma(prompt)) return iaPerfeita(prompt);
    if (ehPedidoDeArea(prompt)) return respondeAreas(prompt, tag => ({ area: 1, elevacao: tag === 'GP101' ? 'EL 104.200' : tag === 'GP102' ? '77,77' : null }));
    const pmibs = [...prompt.matchAll(/- pmib: (\S+)/g)].map(m => m[1]);
    elevMaterial = elevMaterial || pmibs[0];
    return JSON.stringify({ materiais: pmibs.map(p => ({ pmib: p, tags: [], area: 'SKID', qtd_instalada: 1, evidencia: 'desenho &MPA010', elevacao: p === elevMaterial ? '104,2' : null })) });
  };
  let elevMaterial = '';
  const t8 = await rodaA(docs, statusRows, null, { ...form, [F.eix]: 'SEM EIXO' }, nomeStatus, iaElev);
  const b8 = path.join(SAIDA, 'BASE LMR - Água Pura (T8).xlsx');
  fs.writeFileSync(b8, Buffer.from(t8.r.binary.data.data, 'base64'));
  const x8 = JSON.parse(execFileSync('python', ['-X', 'utf8', '-c',
    'import openpyxl,json,sys\nwb=openpyxl.load_workbook(sys.argv[1])\nprint(json.dumps({a:[list(r) for r in wb[a].iter_rows(values_only=True)] for a in ["BASE","PENDÊNCIAS"]},ensure_ascii=False))', b8], { encoding: 'utf8' }));
  const h8 = x8.BASE[0], col = k => h8.indexOf(k);
  const lin = (pmib, tag) => x8.BASE.slice(1).find(l => l[col('FICHA_PMIB')] === pmib && (tag == null || l[col('TAG')] === tag));
  assert.strictEqual(lin('4500063671.0810', 'GP101')[col('ELEVAÇÃO')], '104,20');
  assert.strictEqual(lin('4500063671.0810', 'GP102')[col('ELEVAÇÃO')], '98,50');
  assert.strictEqual(lin(elevMaterial)[col('ELEVAÇÃO')], '104,20');
  assert.strictEqual(lin('4500063671.0812')[col('ELEVAÇÃO')], '98,50');
  assert.ok(x8.BASE.slice(1).every(l => l[col('EIXO')] === 'CD'), 'eixo "C/D" do documento');
  assert.match(JSON.stringify(x8['PENDÊNCIAS']), /elevação 77,77 \(TAG GP102\) não está escrita nos documentos/);
  console.log('T8 ok  elevação por TAG (104,20) e por material sobrepõe a da área (98,50); 77,77 inventada recusada; eixo "C/D" → CD');

  // T10 — página "Confira as áreas": a IA leu SKID sem elevação e PWB; o usuário dá a elevação do SKID, renomeia o PWB,
  // tira uma área inventada e acrescenta o SCP (tanque) que faltou. A leitura dos materiais já usa as áreas conferidas.
  const iaAreas = prompt => {
    if (/TAREFA: liste as ÁREAS/.test(prompt)) return JSON.stringify({ areas: [
      { nome: 'SKID', rds: '#ST00=M00MKF10UZ010-UZ001', local: 'CASA DE FORÇA', elevacao: null },
      { nome: 'PAINEL DE CONTROLE (PWB)', rds: '#ST00=M00MKF10UH010-UH001', local: 'CASA DE FORÇA', elevacao: null },
      { nome: 'CONJ. BOMBA 1', rds: null, local: null, elevacao: null }] });
    return iaPerfeita(prompt);
  };
  let campos10 = null;
  const t10 = await rodaA(docs, statusRows, gab, { ...form, [F.conf]: OPCOES_CONF[0] }, nomeStatus, iaAreas, campos => {
    campos10 = campos;
    const k = rot => campos.find(c => c.fieldLabel.startsWith(rot)).fieldLabel;
    return { [k('1. SKID — elevação')]: '98.5', [k('2. PWB — elevação')]: '98,50', [k('3. CONJ. BOMBA 1 — nome')]: 'remover',
      'Áreas que faltam (uma por linha: NOME; RDS-PP; ELEVAÇÃO)': 'SCP; #ST00=M00MKF10CM050; 104,20\nSPN; ST00=M00MKF10CN010; 98,50' };
  });
  assert.strictEqual(campos10.length, 3 * 4 + 1, 'campos da página: 4 por área (nome, RDS-PP, elevação, trechos) + áreas que faltam');
  assert.ok(campos10.every(c => typeof c.fieldLabel === 'string' && c.fieldLabel.length < 120));
  assert.match(t10.pagina.descricao, /A IA leu 3 área/);
  const p10 = t10.textos[0];
  assert.match(p10, /"SKID" — RDS-PP #ST00=M00MKF10UZ010-UZ001 — EL\. 98,50/);
  assert.match(p10, /"SCP" — RDS-PP #ST00=M00MKF10CM050 — EL\. 104,20/);
  assert.match(p10, /"SPN" — RDS-PP #ST00=M00MKF10CN010 — EL\. 98,50\n   documentos do conjunto: #ST00=M00MKF10CN010-CN001&MTB010 - SISTEMA DE PRESSURIZAÇÃO POR NITROGÊNIO/);
  assert.ok(!/CONJ\. BOMBA/.test(p10), 'área removida');
  assert.strictEqual(t10.r.json.conferidas, true);
  assert.strictEqual(t10.r.json.areas, 4);
  console.log(`T10 ok página "Confira as áreas": ${campos10.length} campos; elevação dada, área removida, SCP e SPN acrescentadas; ${t10.r.json.conferencia.iguais}/${t10.r.json.conferencia.gabarito} linhas iguais`);

  // T11 — regras sem IA: TAGs da lista do painel, área do painel e kit pela convenção do formulário
  const iaPainel = prompt => {
    if (/TAREFA: liste as ÁREAS/.test(prompt) || ehPedidoDeArea(prompt) || ehConfirma(prompt)) return iaPerfeita(prompt);
    const pmibs = [...prompt.matchAll(/- pmib: (\S+)/g)].map(m => m[1]);
    // erros vistos no AMP (com a leitura em etapas esses materiais nem chegam à IA: as regras precisam segurar igual): TAGs da lista de sobressalentes (72.23, KA4), componente do painel no SKID, kit com o equipamento como pai
    const erro = { '4500063671.0873': { tags: ['72.6', '72.7', '72.13', '72.16', '72.22', '72.23'].map(tag => ({ tag, area: 'SKID', rds_proprio: true })) },
      '4500063671.0885': { tags: ['KA1', 'KA2', 'KA3', 'KA4'].map(tag => ({ tag, area: 'PWB', rds_proprio: true })) },
      '4500063671.0848': { tags: [], pais: ['GP101', 'GP102'], area: null, frequencia: 'AMBAS' } };
    return JSON.stringify({ materiais: pmibs.map(p => (erro[p] ? { pmib: p, ...erro[p] } : or.mats.get(p) || { pmib: p })) });
  };
  for (const [kits, esperado] of [[OPCOES_KITS[1], 'SEM TAG'], [OPCOES_KITS[0], 'TAG'], [OPCOES_KITS[2], 'PAI']]) {
    const t11 = await rodaA(docs, statusRows, gab, { ...form, [F.kit]: kits }, nomeStatus, iaPainel);
    const b11 = path.join(SAIDA, `BASE LMR - Água Pura (T11 ${esperado}).xlsx`);
    fs.writeFileSync(b11, Buffer.from(t11.r.binary.data.data, 'base64'));
    const x11 = leAbas(b11);
    const de = pmib => x11.BASE.filter(l => l.FICHA_PMIB === pmib);
    assert.deepStrictEqual(de('4500063671.0873').map(l => l.TAG).sort(), ['72.13', '72.16', '72.18', '72.22', '72.24', '72.6', '72.7']);
    assert.ok(de('4500063671.0873').every(l => l['ÁREA/PAINEL'] === 'PWB'), 'área do painel');
    assert.deepStrictEqual(de('4500063671.0885').map(l => l.TAG), ['KA1', 'KA2', 'KA3']);
    const kit = de('4500063671.0848');
    if (esperado === 'SEM TAG') assert.ok(kit.length === 1 && !kit[0].TAG && !kit[0].PAIS && kit[0]['QTD POR TRECHO'] === 1 && kit[0]['ÁREA/PAINEL'] === 'SKID', 'kit sem TAG');
    if (esperado === 'TAG') assert.deepStrictEqual(kit.map(l => l.TAG), ['GP101', 'GP102']);
    if (esperado === 'PAI') assert.ok(kit.length === 2 && kit.every(l => !l.TAG && /^GP10[12] \| #ST/.test(l.PAIS)), 'kit com pai');
    assert.ok(kit.every(l => l.TRECHOS === 'U-01, U-02, U-03, U-04, U-05, U-06, U-07, U-08, U-09, U-09A'), 'kit da bomba de 50 Hz: AMBAS da leitura cede ao modelo citado no Status');
    assert.match(JSON.stringify(x11.LEITURA), /lista de materiais do painel/);
    if (esperado === 'SEM TAG') assert.strictEqual(t11.r.json.conferencia.iguais, j1.conferencia.iguais, 'regras corrigem os erros: igual à IA perfeita');
  }
  console.log('T11 ok regras: TAGs e área da lista do painel no lugar das lidas (72.24, KA1…KA3, PWB); kit nas 3 convenções; AMBAS → 50 Hz pelo modelo');

  // T12 — resposta cortada no meio: os materiais inteiros são aproveitados, o resto vai para PENDÊNCIAS
  const iaCortada = prompt => { const r = iaPerfeita(prompt); return /TAREFA: liste as ÁREAS/.test(prompt) ? r : r.slice(0, Math.floor(r.length * 0.6)); };
  const t12 = await rodaA(docs, statusRows, null, form, nomeStatus, iaCortada);
  assert.ok(t12.r.json.lidosPelaIA > j1.lidosPelaIA / 3 && t12.r.json.pendencias > 0, `lidos ${t12.r.json.lidosPelaIA}`);
  console.log(`T12 ok resposta cortada: ${t12.r.json.lidosPelaIA} de ${j1.lidosPelaIA} materiais com leitura da IA recuperados das partes inteiras; o resto em PENDÊNCIAS`);
  console.log('TUDO OK');
})().catch(e => { console.error('FALHOU', e.stack); process.exit(1); });

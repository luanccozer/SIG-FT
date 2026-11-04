/*
 * Gera os workflows n8n da Fase 0 (S1–S8) em motor/fase0/*.json.
 * O motor (../lmr.js) é embutido inteiro nos nós Code que precisam dele.
 * Uso: node gerar_fase0.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MOTOR = fs.readFileSync(path.join(__dirname, '..', 'lmr.js'), 'utf8');
const uuid = () => crypto.randomUUID();

// ── construtores de nó ──
let x = 0;
const pos = (col, lin = 0) => [col * 260, lin * 200];
const manual = (nome = 'Executar (manual)') => ({ parameters: {}, name: nome, type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0) });
const codeJs = (nome, js, p) => ({ parameters: { jsCode: js }, name: nome, type: 'n8n-nodes-base.code', typeVersion: 2, position: p });
const codePy = (nome, py, p) => ({ parameters: { language: 'python', pythonCode: py }, name: nome, type: 'n8n-nodes-base.code', typeVersion: 2, position: p });
const nota = (nome, texto, p, w = 420, h = 220) => ({ parameters: { content: texto, height: h, width: w }, name: nome, type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: p });
const campoArquivo = (rotulo, aceita) => ({ fieldLabel: rotulo, fieldType: 'file', multipleFiles: false, acceptFileTypes: aceita, requiredField: true });
const formTrigger = (titulo, desc, campos, p = pos(0)) => ({
  parameters: { formTitle: titulo, formDescription: desc, formFields: { values: campos }, options: {} },
  name: 'Formulário (gatilho)', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.2, position: p, webhookId: uuid(),
});
const liga = (...pares) => {
  const c = {};
  for (const [de, para, saida = 0] of pares) {
    c[de] = c[de] || { main: [] };
    while (c[de].main.length <= saida) c[de].main.push([]);
    c[de].main[saida].push({ node: para, type: 'main', index: 0 });
  }
  return c;
};
const salva = (arquivo, nome, nodes, connections) => {
  const wf = { name: nome, nodes, connections, settings: { executionOrder: 'v1' }, pinData: {}, meta: { templateCredsSetupCompleted: true } };
  fs.writeFileSync(path.join(__dirname, arquivo), JSON.stringify(wf, null, 2));
  console.log('ok', arquivo, nodes.length, 'nós');
};

// Renomeia os binários vindos do formulário para nomes fixos (xlsx / pdf), qualquer que seja o rótulo do campo.
const RENOMEIA_BINARIOS = `
const out = [];
for (const item of $input.all()) {
  const bin = item.binary || {};
  const novo = {};
  for (const [k, v] of Object.entries(bin)) {
    const nome = (v.fileName || k).toLowerCase();
    if (nome.endsWith('.pdf')) novo.pdf = v;
    else if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) novo.xlsx = novo.xlsx ? novo.xlsx : v;
    else novo[k] = v;
  }
  out.push({ json: { binariosRecebidos: Object.keys(bin), renomeadosPara: Object.keys(novo) }, binary: novo });
}
return out;`;

// Linhas vindas do Extract from File → lista de listas (o motor lê assim).
const PARA_LINHAS = `
// Extract from File devolve um item por linha. Sem cabeçalho, as chaves são as colunas.
const linhas = $input.all().map(i => {
  const j = i.json;
  if (Array.isArray(j)) return j;
  if (Array.isArray(j.row)) return j.row;
  return Object.values(j);
});`;

// ───────── S1 — Code: JavaScript e Python ─────────
salva('S1_code_js_python.json', 'LMR Fase 0 - S1 Code JS e Python', [
  manual(),
  codeJs('S1a Motor LMR (JavaScript)', `${MOTOR}
// ───── teste S1a: o motor roda dentro do nó Code? ─────
const nomes = ts => ts.map(t => t.trecho).join(',');
const r = {
  node: typeof process !== 'undefined' ? process.version : 'desconhecido',
  impares: nomes(LMR.trechosDoProjeto('IMPARES')),
  impares60: nomes(LMR.trechosDoMaterial(LMR.trechosDoProjeto('IMPARES'), 60).trechos),
  elevacao: LMR.formataElevacao('106,105'),
  codigo: LMR.montaCodigo({ escopo: 'UG', subsistema: 'TESTE', area: 'SKID', rds: LMR.expandeRds('#ST[XX]=M[XX]ABC10UZ010-UZ001', 'U-09A'), pais: [], local: 'CASA DE FORÇA', elev: '98,50', eixo: 'CD', trecho: 'U-09A' }),
};
r.esperado_ok = r.impares === 'U-01,U-03,U-05,U-07,U-09,U-10,U-12,U-14,U-16,U-18'
  && r.impares60 === 'U-10,U-12,U-14,U-16,U-18' && r.elevacao.valor === '106,11'
  && r.codigo === 'UG - TESTE - SKID - RDS-PP: #ST50=M19ABC10UZ010-UZ001 - CASA DE FORÇA - ELEV. 98,50 - EIXO CD - TRECHO U-09A';
// bibliotecas externas: usadas para gerar .xlsx com várias abas (S3)
for (const lib of ['xlsx', 'exceljs']) { try { require(lib); r['require_' + lib] = 'disponível'; } catch (e) { r['require_' + lib] = 'não: ' + String(e.message).slice(0, 80); } }
return [{ json: r }];`, pos(1, -1)),
  codePy('S1b Python', `import sys
out = {"python": sys.version}
for mod in ["json", "re", "datetime", "openpyxl", "pandas", "pymupdf", "fitz"]:
    try:
        __import__(mod)
        out[mod] = "disponível"
    except Exception as e:
        out[mod] = "não: " + str(e)[:80]
return [{"json": out}]`, pos(1, 1)),
  nota('Leia-me S1', '## S1 — Code roda JavaScript e Python?\n1. Clique em **Execute workflow**.\n2. Abra **S1a**: copie a saída JSON. `esperado_ok` deve ser `true`.\n3. Abra **S1b**: copie a saída JSON (versão do Python e bibliotecas).\n\nSe S1b der erro de linguagem, abra o nó e troque *Language* para a opção Python disponível.', pos(1, 2), 460, 240),
], liga(['Executar (manual)', 'S1a Motor LMR (JavaScript)'], ['Executar (manual)', 'S1b Python']));

// ───────── S2 — Extract from File: xlsx e PDF por página ─────────
salva('S2_extract_from_file.json', 'LMR Fase 0 - S2 Extract from File', [
  formTrigger('LMR Fase 0 - S2', 'Envie o Status PMIB fictício (.xlsx) e o PDF fictício.', [
    campoArquivo('Status PMIB (xlsx)', '.xlsx'), campoArquivo('Documento (pdf)', '.pdf')]),
  codeJs('Separa arquivos', RENOMEIA_BINARIOS, pos(1)),
  { parameters: { operation: 'xlsx', binaryPropertyName: 'xlsx', options: { headerRow: false, includeEmptyCells: true } },
    name: 'Lê xlsx', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(2, -1) },
  codeJs('S2a Motor lê o Status', `${MOTOR}
${PARA_LINHAS}
const s = LMR.lerStatusPmib(linhas);
return [{ json: {
  linhasRecebidas: linhas.length, primeiraLinhaComDados: linhas.find(l => l.some(c => c != null && c !== '')),
  lista: s.lista, revisao: s.revisao, pmibs: s.catalogo.map(c => c.pmib.slice(-4)),
  relacoes: s.relacoes.map(r => r.pmibPai.slice(-4) + ' > ' + r.pmibFilho.slice(-4)), agrupadores: s.agrupadores.length,
  granel: s.catalogo.filter(c => c.granel).map(c => c.pmib.slice(-4)), avisos: s.avisos,
  esperado_ok: s.catalogo.length === 6 && s.relacoes.length === 2 && s.agrupadores.length === 1 && s.revisao === '1A',
} }];`, pos(3, -1)),
  { parameters: { operation: 'pdf', binaryPropertyName: 'pdf', options: { joinPages: false } },
    name: 'Lê PDF (por página)', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: pos(2, 1) },
  codeJs('S2b Texto por página', `
const j = $input.first().json;
const paginas = Array.isArray(j.text) ? j.text : (typeof j.text === 'string' ? j.text.split('\\f') : []);
const achados = paginas.map((t, i) => ({ pagina: i + 1,
  tags: (String(t).match(/\\b[A-Z]{2}\\d{3}[A-Z]?\\b/g) || []).filter(x => !/^(EL|ID)/.test(x)),
  rds: String(t).match(/#ST\\d\\d=[A-Z0-9-&]+/g) || [], elevacoes: String(t).match(/EL \\d+\\.\\d+/g) || [] }));
return [{ json: { tipoDoCampoText: Array.isArray(j.text) ? 'lista (uma por página)' : typeof j.text, paginas: paginas.length, achados,
  chavesDaSaida: Object.keys(j), numpages: j.numpages,
  esperado_ok: paginas.length === 3 && achados[1] && achados[1].tags.includes('GP901') } }];`, pos(3, 1)),
  nota('Leia-me S2', '## S2 — Extract from File\n1. Clique em **Execute workflow**: abre um formulário de teste.\n2. Envie `apoio/STATUS_PMIB_ficticio.xlsx` e `apoio/documento_ficticio.pdf`.\n3. Copie a saída de **S2a** e **S2b**. `esperado_ok` deve ser `true` nas duas.\n4. Repita com a REF-0013 no lugar do Status (só para ver se lê 1,2 MB; S2a vai dar erro de cabeçalho, é esperado) e anote o tempo.', pos(1, 2), 480, 260),
], liga(['Formulário (gatilho)', 'Separa arquivos'], ['Separa arquivos', 'Lê xlsx'], ['Separa arquivos', 'Lê PDF (por página)'],
  ['Lê xlsx', 'S2a Motor lê o Status'], ['Lê PDF (por página)', 'S2b Texto por página']));

// ───────── S3 — Convert to File: xlsx (uma aba / várias abas / template) ─────────
const LINHAS_FICT = `
const linhas = [];
for (const t of ['U-01', 'U-03', 'U-09A']) for (const tag of ['GP901', 'GP902']) linhas.push({
  FICHA_PMIB: '9999999999.0001',
  'CÓDIGO_LMR': 'UG - TESTE - SKID - RDS-PP: #ST50=M01ABC10UZ010-UZ001 - CASA DE FORÇA - ELEV. 98,50 - EIXO CD - TRECHO ' + t,
  TAG_LMR: 'UG - ' + tag + ' - RDS-PP: #ST50=M01ABC10UZ010-UZ001' + tag + ' - Bomba centrífuga 60 Hz modelo X1' });`;
salva('S3_convert_to_file.json', 'LMR Fase 0 - S3 Convert to File', [
  formTrigger('LMR Fase 0 - S3', 'Envie o Template_Aplicação_LMR.xlsx (usado só no teste S3c).', [campoArquivo('Template (xlsx)', '.xlsx')]),
  codeJs('Linhas fictícias', `${LINHAS_FICT}
return linhas.map(l => ({ json: l }));`, pos(1, -1)),
  { parameters: { operation: 'xlsx', options: { sheetName: 'APLICAÇÃO - LMR', fileName: 'S3a_uma_aba.xlsx' } },
    name: 'S3a Convert to File (uma aba)', type: 'n8n-nodes-base.convertToFile', typeVersion: 1.1, position: pos(2, -1) },
  codeJs('S3b JS várias abas no template', `
// Precisa da biblioteca xlsx no Code (ver S1a: require_xlsx). Abre o template enviado e preenche 2 abas.
let XLSX;
try { XLSX = require('xlsx'); } catch (e) { return [{ json: { resultado: 'sem biblioteca xlsx no Code: ' + e.message } }]; }
${LINHAS_FICT}
const item = $input.first();
const k = Object.keys(item.binary || {})[0];
const buf = await this.helpers.getBinaryDataBuffer(0, k);
const wb = XLSX.read(buf, { type: 'buffer' });
XLSX.utils.sheet_add_json(wb.Sheets['APLICAÇÃO - LMR'], linhas, { origin: 'A2', skipHeader: true });
wb.SheetNames.includes('VALIDAÇÃO') || XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ LINHA: 2, REGRA: 'V1', MENSAGEM: 'teste' }]), 'VALIDAÇÃO');
const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
const bin = await this.helpers.prepareBinaryData(out, 'S3b_template_preenchido.xlsx');
return [{ json: { abas: wb.SheetNames }, binary: { data: bin } }];`, pos(2, 1)),
  codePy('S3c Python várias abas (openpyxl)', `import base64, io
try:
    import openpyxl
except Exception as e:
    return [{"json": {"resultado": "sem openpyxl: " + str(e)[:100]}}]
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "APLICAÇÃO - LMR"
ws.append(["FICHA_PMIB", "CÓDIGO_LMR", "TAG_LMR"])
ws.append(["9999999999.0001", "UG - TESTE - SKID - RDS-PP: #ST50=M01ABC10UZ010-UZ001 - CASA DE FORÇA - ELEV. 98,50 - EIXO CD - TRECHO U-01", "UG - GP901 - Bomba"])
v = wb.create_sheet("VALIDAÇÃO")
v.append(["LINHA", "REGRA", "MENSAGEM"])
v.append([2, "V1", "teste"])
buf = io.BytesIO()
wb.save(buf)
return [{"json": {"abas": wb.sheetnames}, "binary": {"data": {"data": base64.b64encode(buf.getvalue()).decode(), "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "fileName": "S3c_python.xlsx"}}}]`, pos(2, 2)),
  nota('Leia-me S3', '## S3 — gerar .xlsx\n1. **Execute workflow** e envie o `Template_Aplicação_LMR.xlsx`.\n2. Em cada nó S3a, S3b, S3c: aba *Binary* → **Download**. Abra no Excel.\n3. Anote: S3a abriu com 6 linhas? S3b manteve as abas do template e preencheu APLICAÇÃO - LMR? S3c criou 2 abas?', pos(3, -1), 460, 240),
], liga(['Formulário (gatilho)', 'Linhas fictícias'], ['Formulário (gatilho)', 'S3b JS várias abas no template'], ['Formulário (gatilho)', 'S3c Python várias abas (openpyxl)'],
  ['Linhas fictícias', 'S3a Convert to File (uma aba)']));

// ───────── S4 — GEV BOX: ler e gravar (nós GEV adicionados à mão) ─────────
salva('S4_gev_box.json', 'LMR Fase 0 - S4 GEV BOX', [
  manual(),
  codeJs('Cria arquivo de teste', `
const texto = 'Teste LMR Fase 0 - ' + new Date().toISOString() + '\\nLinha fictícia: UG - TESTE - SKID';
const bin = await this.helpers.prepareBinaryData(Buffer.from(texto, 'utf8'), 'teste_lmr_fase0.txt', 'text/plain');
return [{ json: { tamanho: texto.length }, binary: { data: bin } }];`, pos(1)),
  codeJs('Confere arquivo lido', `
const i = $input.first();
const k = Object.keys(i.binary || {})[0];
if (!k) return [{ json: { resultado: 'nenhum arquivo chegou do GEV BOX', chaves: Object.keys(i.json) } }];
const buf = await this.helpers.getBinaryDataBuffer(0, k);
return [{ json: { arquivo: i.binary[k].fileName, bytes: buf.length, inicio: buf.toString('utf8', 0, 60) } }];`, pos(4)),
  nota('Leia-me S4', '## S4 — GEV BOX (adicionar à mão)\n1. Entre **Cria arquivo de teste** e **Confere arquivo lido**, clique no **+** e procure **GEV BOX**.\n2. 1º GEV BOX: operação de **upload** do arquivo `data` para a sua pasta de teste.\n3. 2º GEV BOX: **download** do mesmo arquivo. Ligue a saída em **Confere arquivo lido**.\n4. Execute. Anote: gravou? leu? qual o campo de pasta/arquivo pedido (ID, caminho)?', pos(2, 1), 520, 260),
], liga(['Executar (manual)', 'Cria arquivo de teste']));

// ───────── S5 + S6 — LLM: imagem/PDF e mascaramento (nós GEV adicionados à mão) ─────────
const TEXTO_S6 = `Lista de sobressalentes (FICTÍCIA)
Item 1 - Bomba centrífuga - TAGs: GP901, GP902 - RDS-PP: #ST50=M01ABC10UZ010-UZ001 - Código do material: 9990001 - PMIB 9999999999.0001
Item 2 - Transmissor de pressão - TAG: BP903T - RDS-PP: #ST60=M14ABC10CN010-CN401 - Código do material: 08934100ABC31-111F - PMIB 9999999999.0002
Item 3 - Válvula - TAG: QM904G - RDS-PP: #ST00=M00ABC10&MFB030 - Código do material: HPI-904SP2-058-000-A4 - PMIB 9999999999.0003`;
salva('S5_S6_llm.json', 'LMR Fase 0 - S5 S6 LLM', [
  manual(),
  codeJs('S6 Prepara texto', `
const texto = ${JSON.stringify(TEXTO_S6)};
const prompt = 'Copie, sem alterar nenhum caractere, cada TAG, RDS-PP, código do material e PMIB do texto abaixo. Responda só com JSON no formato {"linhas":[{"item":1,"tags":[],"rds":"","codigo_material":"","pmib":""}]}.\\n\\n' + texto;
return [{ json: { prompt, texto } }];`, pos(1)),
  codeJs('S6 Compara resposta', `
const esperado = {
  tags: ['GP901', 'GP902', 'BP903T', 'QM904G'],
  rds: ['#ST50=M01ABC10UZ010-UZ001', '#ST60=M14ABC10CN010-CN401', '#ST00=M00ABC10&MFB030'],
  codigos: ['9990001', '08934100ABC31-111F', 'HPI-904SP2-058-000-A4'],
  pmib: ['9999999999.0001', '9999999999.0002', '9999999999.0003'],
};
const j = $input.first().json;
const resposta = String(j.text ?? j.output ?? j.response ?? JSON.stringify(j));
const r = {};
for (const [grupo, valores] of Object.entries(esperado)) r[grupo] = valores.map(v => ({ valor: v, intacto: resposta.includes(v) }));
const alterados = Object.values(r).flat().filter(x => !x.intacto).map(x => x.valor);
return [{ json: { alterados, todos_intactos: alterados.length === 0, trecho_da_resposta: resposta.slice(0, 600) } }];`, pos(4)),
  nota('Leia-me S5 e S6', '## S6 — mascaramento\n1. Entre **S6 Prepara texto** e **S6 Compara resposta**, adicione **Basic LLM Chain** (prompt: expressão `{{ $json.prompt }}`) e ligue nele um **GEV LLM Model** (Gemini Flash-Lite).\n2. Execute. Copie a saída de **S6 Compara resposta**. `todos_intactos` deve ser `true`.\n3. Repita com o modelo Claude Sonnet.\n\n## S5 — imagem e PDF grande\nNo mesmo canvas, monte à parte: **Form** (campo arquivo) → **Amp Agent** ou **Basic LLM Chain** com o PDF fictício. Pergunte "Quais TAGs aparecem na página 2?". Depois tente um PDF grande (67–78 MB). Anote o limite ou o erro.', pos(2, 1), 560, 360),
], liga(['Executar (manual)', 'S6 Prepara texto']));

// ───────── S7 — Sub-workflow: conta como execução publicada? ─────────
salva('S7a_subworkflow_filho.json', 'LMR Fase 0 - S7 FILHO', [
  { parameters: { inputSource: 'passthrough' }, name: 'Chamado por outro workflow', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1, position: pos(0) },
  codeJs('Responde', `return [{ json: { recebido: $input.first().json, respondidoEm: new Date().toISOString() } }];`, pos(1)),
], liga(['Chamado por outro workflow', 'Responde']));
salva('S7b_subworkflow_pai.json', 'LMR Fase 0 - S7 PAI', [
  formTrigger('LMR Fase 0 - S7', 'Clique em enviar. Este formulário chama o workflow FILHO.', [{ fieldLabel: 'Observação', fieldType: 'text', requiredField: false }]),
  { parameters: { source: 'database', workflowId: { __rl: true, mode: 'list', value: '' }, options: {} }, name: 'Chama o FILHO', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: pos(1) },
  nota('Leia-me S7', '## S7 — sub-workflow conta 1 ou 2 execuções?\n1. Importe **S7a FILHO** antes e salve.\n2. Neste PAI, abra **Chama o FILHO** e escolha o workflow `LMR Fase 0 - S7 FILHO`.\n3. Anote o contador em *Settings → Usage and plan*.\n4. **Publish** o PAI, abra a URL de produção do formulário e envie 1 vez.\n5. Veja o contador de novo: subiu 1 ou 2? Depois **despublique** o PAI.\n\nGasta até 2 das 50 execuções do mês.', pos(1, 1), 520, 300),
], liga(['Formulário (gatilho)', 'Chama o FILHO']));

// ───────── S8 — Formulário com espera: perguntar a frequência ─────────
salva('S8_formulario_espera.json', 'LMR Fase 0 - S8 Pergunta de frequência', [
  formTrigger('LMR Fase 0 - S8', 'Simula o início de uma aplicação nova (projeto com UGs de 50 e 60 Hz).', [
    { fieldLabel: 'Trechos do projeto', fieldType: 'dropdown', fieldOptions: { values: [{ option: 'TODAS' }, { option: 'IMPARES' }, { option: 'PARES' }] }, requiredField: true }]),
  codeJs('Acha materiais sem frequência', `${MOTOR}
const opcao = $input.first().json['Trechos do projeto'] || 'TODAS';
const proj = LMR.trechosDoProjeto(opcao);
const materiais = [{ tag: 'GP901', hz: 60 }, { tag: 'BP903T', hz: null }, { tag: 'QM904G', hz: null }];
const semHz = materiais.filter(m => LMR.trechosDoMaterial(proj, m.hz).pergunta).map(m => m.tag);
return [{ json: { opcao, trechos: proj.map(t => t.trecho), semFrequencia: semHz } }];`, pos(1)),
  { parameters: { formFields: { values: [
      { fieldLabel: 'BP903T', fieldType: 'dropdown', fieldOptions: { values: [{ option: '50 Hz' }, { option: '60 Hz' }, { option: 'Ambas' }] }, requiredField: true },
      { fieldLabel: 'QM904G', fieldType: 'dropdown', fieldOptions: { values: [{ option: '50 Hz' }, { option: '60 Hz' }, { option: 'Ambas' }] }, requiredField: true }] },
    options: { formTitle: 'Frequência não encontrada nos documentos', formDescription: 'Escolha a aplicação de cada material.' } },
    name: 'Pergunta a frequência (espera)', type: 'n8n-nodes-base.form', typeVersion: 1, position: pos(2), webhookId: uuid() },
  codeJs('Aplica a resposta', `${MOTOR}
const base = $('Acha materiais sem frequência').first().json;
const resp = $input.first().json;
const proj = LMR.trechosDoProjeto(base.opcao);
const hz = v => v === 'Ambas' ? 'AMBAS' : Number(String(v).replace(/\\D/g, ''));
const r = base.semFrequencia.map(tag => ({ tag, resposta: resp[tag], fonte: 'manual',
  trechos: LMR.trechosDoMaterial(proj, hz(resp[tag])).trechos.map(t => t.trecho) }));
return [{ json: { materiais: r, esperado_ok: r.length === 2 && r.every(m => m.trechos.length > 0) } }];`, pos(3)),
  nota('Leia-me S8', '## S8 — pausar e perguntar\n1. **Execute workflow**: abre o 1º formulário. Escolha **TODAS**.\n2. O fluxo para e abre o 2º formulário com BP903T e QM904G. Escolha uma frequência para cada.\n3. Copie a saída de **Aplica a resposta**. `esperado_ok` deve ser `true`.\n4. Anote: o 2º formulário abriu sozinho na mesma aba? Quanto tempo ele espera?', pos(1, 1), 520, 260),
], liga(['Formulário (gatilho)', 'Acha materiais sem frequência'], ['Acha materiais sem frequência', 'Pergunta a frequência (espera)'], ['Pergunta a frequência (espera)', 'Aplica a resposta']));

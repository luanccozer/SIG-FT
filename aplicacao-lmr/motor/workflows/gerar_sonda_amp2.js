/*
 * Gera "LMR - Sonda 2 do nó AMP Agent" (S10): o agente consegue LER o PDF enviado em Files?
 * A sonda 1 mostrou: Prompt = chatInput, resposta em output, o agente vê o NOME do anexo mas não o conteúdo, e itens
 * do mesmo nó dividem a sessão. Três chamadas em sequência:
 *   A — PDF em Files + pedido livre para abrir e transcrever (sessão "a");
 *   B — 90 s depois, mesma sessão, sem arquivo: "leia agora o arquivo enviado antes" (indexação demorada?);
 *   C — sessão nova, sem arquivo, com o texto da página 1 extraído pelo n8n no pedido (caminho só texto).
 * Uso: node workflows/gerar_sonda_amp2.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PERGUNTA = 'Responda em JSON no fim: {"paginas":<n>,"palavras_pagina_1":"<as 30 primeiras palavras da página 1>","codigos_pagina_1":["até 15 códigos como GP101, QM104G, BS141T que estão na página 1"],"ve_desenho":<true|false>,"como_leu":"<texto, imagem, ferramenta de busca…>"}';
const A = `const f = $('Formulário').first();
const pdf = Object.values(f.binary || {}).find(b => /\\.pdf$/i.test(b.fileName || ''));
const sessao = 'lmr-sonda2-' + $execution.id;
return [{ json: { sessionId: sessao + '-a', chatInput: 'SONDA 2 (A). Anexei o arquivo ' + (pdf ? pdf.fileName : '?') + '. Abra o arquivo e leia o conteúdo antes de responder. Se precisar carregar o conteúdo completo, carregue. ${PERGUNTA.replace(/'/g, "\\'")}' }, binary: pdf ? { data: pdf } : {} }];`;
const B = `const a = $('Prepara A').first().json;
return [{ json: { sessionId: a.sessionId, chatInput: 'SONDA 2 (B). Mesma conversa: leia agora o arquivo que enviei na mensagem anterior. ${PERGUNTA.replace(/'/g, "\\'")}' } }];`;
const C = `const a = $('Prepara A').first().json;
const pags = $('Lê PDF').first().json.text;
const p1 = String(Array.isArray(pags) ? pags[0] : pags || '').slice(0, 6000);
return [{ json: { sessionId: a.sessionId.replace(/-a$/, '-c'), chatInput: 'SONDA 2 (C). Sem anexo: abaixo está o texto da página 1, extraído do PDF. ${PERGUNTA.replace(/'/g, "\\'")}\\n\\nTEXTO DA PÁGINA 1:\\n' + p1 } }];`;
const MOSTRA = `const corta = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 2500 ? s.slice(0, 2500) + '…' : s; };
const de = no => { try { return $(no).first().json; } catch (e) { return { erro: 'não rodou' }; } };
const r = ['AMP Agent A', 'AMP Agent B', 'AMP Agent C'].map(n => { const j = de(n); return n + ' (' + Object.keys(j).join(', ') + ')\\n  output = ' + corta(j.output != null ? j.output : j.error || j.erro) + '\\n  files = ' + corta(j.files); });
return [{ json: { relatorio: r.join('\\n\\n') } }];`;

const id = () => crypto.randomUUID();
const code = (name, js, x) => ({ parameters: { jsCode: js }, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, 0] });
const agente = (name, x) => ({ parameters: { agentId: { __rl: true, mode: 'list', value: '' }, options: {} }, name, type: 'CUSTOM.amp', typeVersion: 1, position: [x, 0], onError: 'continueRegularOutput' });
const nodes = [
  { parameters: { formTitle: 'LMR — Sonda 2 do nó AMP Agent', formDescription: 'Envie o mesmo PDF da sonda 1 (P&ID de 1 página). Leva uns 3 minutos.',
    formFields: { values: [{ fieldLabel: 'PDF de teste', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.pdf', requiredField: true }] }, options: {} },
    name: 'Formulário', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.2, position: [0, 0], webhookId: id() },
  code('Prepara A', A, 240),
  agente('AMP Agent A', 480),
  { parameters: { amount: 90, unit: 'seconds' }, name: 'Espera 90 s', type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: [720, 0], webhookId: id() },
  code('Prepara B', B, 960),
  agente('AMP Agent B', 1200),
  { parameters: { jsCode: "return [{ json: {}, binary: { data: Object.values($('Formulário').first().binary || {})[0] } }];" }, name: 'Pega o PDF', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1440, 0] },
  { parameters: { operation: 'pdf', binaryPropertyName: 'data', options: { joinPages: false } }, name: 'Lê PDF', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1, position: [1680, 0] },
  code('Prepara C', C, 1920),
  agente('AMP Agent C', 2160),
  code('Mostra', MOSTRA, 2400),
  { parameters: { operation: 'completion', respondWith: 'text', completionTitle: 'Resultado da sonda 2', completionMessage: '={{ $json.relatorio }}' },
    name: 'Resultado', type: 'n8n-nodes-base.form', typeVersion: 1, position: [2640, 0], webhookId: id() },
  { parameters: { content: '## Sonda 2 do nó AMP Agent (S10)\nNos 3 nós **AMP Agent** (A, B, C), preencha igual:\n- **Credential**: AMP account · **Custom Agent**: Leitor LMR\n- **Prompt**: `{{ $json.chatInput }}`\n- **Session ID**: `{{ $json.sessionId }}`\n- **Files**: no **A**, o binário `data` (como na sonda 1); no **B** e no **C**, vazio\n- *Add option* → **timeout**: o maior valor aceito (ex.: 600 s)\n\nDepois de configurar o **A**, selecione-o, **Ctrl+C**, cole num txt e anexe (quero ver os nomes internos dos campos). Rode e me devolva a página final.', height: 380, width: 600 },
    name: 'Leia-me', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -440] },
];
const ordem = ['Formulário', 'Prepara A', 'AMP Agent A', 'Espera 90 s', 'Prepara B', 'AMP Agent B', 'Pega o PDF', 'Lê PDF', 'Prepara C', 'AMP Agent C', 'Mostra', 'Resultado'];
const connections = {};
ordem.slice(0, -1).forEach((de, i) => { connections[de] = { main: [[{ node: ordem[i + 1], type: 'main', index: 0 }]] }; });
const wf = { name: 'LMR - Sonda 2 do nó AMP Agent', nodes, connections,
  settings: { executionOrder: 'v1', saveManualExecutions: true, saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' }, pinData: {}, meta: { templateCredsSetupCompleted: false } };
const destino = path.join(__dirname, 'LMR_S10_sonda2_amp_agent.json');
fs.writeFileSync(destino, JSON.stringify(wf, null, 2));

// teste local dos Code
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const saidas = { 'Formulário': [{ json: {}, binary: { x: { fileName: "P'ID.pdf" } } }], 'Lê PDF': [{ json: { text: ['GP101 QM104G texto'] } }],
  'AMP Agent A': [{ json: { sessionId: 's', output: '{"paginas":1}', files: [] } }] };
const $ = no => ({ first: () => (saidas[no] || [])[0] });
const roda = js => new AsyncFn('$', '$execution', js)($, { id: 42 });
(async () => {
  saidas['Prepara A'] = await roda(A);
  const a = saidas['Prepara A'][0];
  if (a.json.sessionId !== 'lmr-sonda2-42-a' || !a.binary.data || !/P'ID\.pdf/.test(a.json.chatInput)) throw new Error('Prepara A');
  const [b] = await roda(B), [c] = await roda(C);
  if (b.json.sessionId !== a.json.sessionId || b.binary || c.json.sessionId !== 'lmr-sonda2-42-c' || !/GP101 QM104G/.test(c.json.chatInput)) throw new Error('Prepara B/C');
  const [m] = await roda(MOSTRA);
  if (!/AMP Agent A .*\n  output = \{"paginas":1\}/.test(m.json.relatorio) || !/AMP Agent B \(erro\)\n  output = não rodou/.test(m.json.relatorio)) throw new Error('Mostra');
  console.log('ok', path.basename(destino), nodes.length, 'nós · teste local OK');
})().catch(e => { console.error(e); process.exit(1); });

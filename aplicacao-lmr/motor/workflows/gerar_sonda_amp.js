/*
 * Gera "LMR - Sonda do nó AMP Agent" (S9): descobre como o nó CUSTOM.amp recebe o pedido, se aceita arquivo (PDF)
 * e onde devolve a resposta. Dois itens entram no nó:
 *   item 1 — com o PDF de teste em binário (data) e o pedido repetido em vários campos, cada um dizendo o próprio nome;
 *   item 2 — sem binário (só texto).
 * A resposta do agente diz por qual campo leu e se viu o anexo; a página final mostra tudo o que o nó devolveu.
 * Uso: node workflows/gerar_sonda_amp.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CAMPOS = ['chatInput', 'prompt', 'message', 'text', 'input', 'query'];
const PREPARA = `const f = $input.first();
const pdf = Object.values(f.binary || {}).find(b => /\\.pdf$/i.test(b.fileName || ''));
const pedido = (campo, item) => 'SONDA DO WORKFLOW. Você recebeu este pedido pelo campo "' + campo + '" (item ' + item + '). '
  + 'Responda SOMENTE com este JSON, sem texto antes ou depois: '
  + '{"campo":"' + campo + '","item":' + item + ',"anexos":["nome de cada arquivo que você consegue ver nesta mensagem"],'
  + '"paginas":<número de páginas do primeiro anexo ou null>,"inicio_pagina_1":"<as 15 primeiras palavras da página 1 do anexo ou null>",'
  + '"ve_imagem":<true se você consegue ver o desenho da página 1 como imagem, false se não, null se não há anexo>}';
const item = (n, comPdf) => ({ json: Object.fromEntries(${JSON.stringify(CAMPOS)}.map(c => [c, pedido(c, n)])), ...(comPdf && pdf ? { binary: { data: pdf } } : {}) });
return [item(1, true), item(2, false)];`;

const MOSTRA = `const corta = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 1500 ? s.slice(0, 1500) + '…' : s; };
const linhas = $input.all().map((i, k) => {
  const j = i.json || {};
  const campos = Object.keys(j).filter(c => !${JSON.stringify(CAMPOS)}.includes(c));
  return 'SAÍDA ' + (k + 1) + ' — campos devolvidos: ' + (campos.join(', ') || '(nenhum além dos de entrada)')
    + (i.binary ? ' — binário: ' + Object.keys(i.binary).join(', ') : '')
    + '\\n' + campos.map(c => '  ' + c + ' = ' + corta(j[c])).join('\\n');
});
return [{ json: { relatorio: linhas.join('\\n\\n') || '(o nó não devolveu nada)' } }];`;

const no = (n) => ({ webhookId: undefined, ...n });
const nodes = [
  no({ parameters: { formTitle: 'LMR — Sonda do nó AMP Agent', formDescription: 'Envie 1 PDF pequeno (2–5 páginas, com desenho). A página final mostra o que o agente recebeu e devolveu.',
    formFields: { values: [{ fieldLabel: 'PDF de teste', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.pdf', requiredField: true }] }, options: {} },
    name: 'Formulário', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.2, position: [0, 0], webhookId: crypto.randomUUID() }),
  no({ parameters: { jsCode: PREPARA }, name: 'Prepara sonda', type: 'n8n-nodes-base.code', typeVersion: 2, position: [260, 0] }),
  no({ parameters: { agentId: { __rl: true, mode: 'list', value: '' }, options: {} }, name: 'AMP Agent', type: 'CUSTOM.amp', typeVersion: 1, position: [520, 0],
    onError: 'continueRegularOutput' }),
  no({ parameters: { jsCode: MOSTRA }, name: 'Mostra resposta', type: 'n8n-nodes-base.code', typeVersion: 2, position: [780, 0] }),
  no({ parameters: { operation: 'completion', respondWith: 'text', completionTitle: 'Resultado da sonda', completionMessage: '={{ $json.relatorio }}' },
    name: 'Resultado', type: 'n8n-nodes-base.form', typeVersion: 1, position: [1040, 0], webhookId: crypto.randomUUID() }),
  no({ parameters: { content: '## Sonda do nó AMP Agent (S9)\n1. Abra o nó **AMP Agent**: escolha a credencial **AMP account** e o agente **Leitor LMR**. Anote TODOS os campos e opções que o nó mostra (clique em *Add option*).\n2. ⋯ → *Settings* → *Save manual executions* = **Save**.\n3. **Execute workflow** → envie um PDF pequeno com desenho.\n4. Me devolva: o texto da página final + a lista de campos/opções do nó.\n\nSe a saída mostrar que o agente não recebeu o pedido, abra o nó, ponha no campo de mensagem a expressão `{{ $json.chatInput }}` e rode de novo.', height: 330, width: 560 },
    name: 'Leia-me', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -400] }),
].map(n => (n.webhookId === undefined ? (({ webhookId, ...x }) => x)(n) : n));
const connections = {};
for (const [de, para] of [['Formulário', 'Prepara sonda'], ['Prepara sonda', 'AMP Agent'], ['AMP Agent', 'Mostra resposta'], ['Mostra resposta', 'Resultado']])
  connections[de] = { main: [[{ node: para, type: 'main', index: 0 }]] };
const wf = { name: 'LMR - Sonda do nó AMP Agent', nodes, connections,
  settings: { executionOrder: 'v1', saveManualExecutions: true, saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' }, pinData: {}, meta: { templateCredsSetupCompleted: false } };
const destino = path.join(__dirname, 'LMR_S9_sonda_amp_agent.json');
fs.writeFileSync(destino, JSON.stringify(wf, null, 2));

// teste local: o Code de preparo e o de relatório
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const roda = (js, entrada) => new AsyncFn('$input', js)({ all: () => entrada, first: () => entrada[0] });
(async () => {
  const itens = await roda(PREPARA, [{ json: {}, binary: { PDF_de_teste: { fileName: 'teste.pdf', mimeType: 'application/pdf' } } }]);
  if (itens.length !== 2 || !itens[0].binary || itens[1].binary || !/campo "chatInput"/.test(itens[0].json.chatInput)) throw new Error('Prepara sonda');
  const [r] = await roda(MOSTRA, [{ json: { ...itens[0].json, output: '{"campo":"chatInput"}' } }, { json: { ...itens[1].json, error: 'x' } }]);
  if (!/output = \{"campo":"chatInput"\}/.test(r.json.relatorio) || !/error = x/.test(r.json.relatorio)) throw new Error('Mostra resposta');
  console.log('ok', path.basename(destino), nodes.length, 'nós · teste local OK');
})().catch(e => { console.error(e); process.exit(1); });

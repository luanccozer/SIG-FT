/*
 * Teste local do modo workflow (nó AMP Agent com o texto das páginas na mensagem), nos 4 sistemas com dados.
 * Para cada sistema: tarefas da etapa 1 → "agente perfeito" responde cada chamada → contexto → etapas 2 e 3 → etapa 4
 * → Base com a regra estrita (o agente só viu texto: valor fora do texto sai). Confere: tamanho das chamadas, toda página
 * útil enviada uma vez, controle só das páginas enviadas, JSON em bloco ```json com texto em volta, Base × gabarito.
 * Uso: node agente/teste_workflow.js     (MSG=agua_pura mostra o começo de uma mensagem de cada etapa)
 */
const fs = require('fs');
const path = require('path');
const LMR = require('../lmr.js');
const INDICE = require('../indice/indice.js');
const LEITURA = require('../leitura/leitura.js');
const AGENTE = require('./agente.js');
const { agentePerfeito } = require('./perfeito.js');
const D = path.join(__dirname, '..', 'dados');

const SIS = {
  agua_pura: { nome: 'Água Pura', escopo: 'UG', sub: 'ÁGUA PURA', kits: 'SEM TAG', pecas: 'TAG', eixo: 'CD', minimo: 3400 },
  regvel: { nome: 'Reg. Vel. e Pot. Hidráulica', escopo: 'RV', sub: 'PARTE MECÂNICA', kits: 'TAG', pecas: 'PAI' },
  aeracao: { nome: 'Aeração Axial', escopo: 'UG', sub: 'AERAÇÃO AXIAL DA TURBINA', freq: 'AMBAS', kits: 'TAG', pecas: 'TAG' },
  sfc: { nome: 'SFC', escopo: 'UG', sub: 'SFC', trechos: 'LISTA', lista: ['AMD-03', 'AMC-02'], kits: 'TAG', pecas: 'TAG' },
};

let falhas = 0;
const ok = (cond, msg) => { if (!cond) { console.log(`   FALHA: ${msg}`); falhas++; } };
for (const [n, s] of Object.entries(SIS)) {
  if (!fs.existsSync(path.join(D, `textos_${n}.json`))) { console.log(`— ${s.nome}: sem textos`); continue; }
  const statusRows = JSON.parse(fs.readFileSync(path.join(D, `status_${n}.json`), 'utf8')).linhas;
  const st = LMR.lerStatusPmib(statusRows);
  const gab = JSON.parse(fs.readFileSync(path.join(D, `base_${n}.json`), 'utf8')).base;
  const indexados = JSON.parse(fs.readFileSync(path.join(D, `textos_${n}.json`), 'utf8')).map(d => INDICE.indexaDocumento(d.arquivo, d.paginas || [], st.catalogo));
  const cfg = { sistema: s.nome, escopo: s.escopo, subsistema: s.sub, trechos: s.trechos || 'TODAS', listaTrechos: (s.lista || []).join(', '), eixo: s.eixo || '',
    frequencia: s.freq || '', kits: s.kits, pecas: s.pecas, especificacao: '', etapaDocs: '', sessao: 'lmr-teste' };
  // respostas perfeitas, por chamada
  const r = AGENTE.roteiro(indexados, st, cfg);
  const perf = agentePerfeito(r, gab, LMR.trechosDoProjeto(cfg.trechos, s.lista || []).map(x => x.trecho));
  const por = k => perf.find(x => x.json.etapa === k).json;
  const corretas = new Map(r.controle.map(q => [q.id, q.corretas]));
  const mats = new Map(perf.filter(x => x.json.etapa === 4).flatMap(x => x.json.materiais).map(m => [m.pmib, m]));
  const jaFoi = new Set();
  const semE1 = { ativo: false, done: false };
  const responde = tf => {
    const j = { etapa: tf.etapa, parte: tf.parte, arquivos: [], controle: tf.controle.map(id => ({ id, presentes: corretas.get(id) })), observacoes: [] };
    const primeira = !jaFoi.has(tf.etapa); jaFoi.add(tf.etapa);
    if (tf.etapa === 1) j.areas = primeira ? por(1).areas : [];
    if (tf.etapa === 2) j.tags = [];
    if (tf.etapa === 3) j.tags = primeira ? por(3).tags : [];
    // sistema sem documento de arranjo (sem etapa 1): as áreas vêm na primeira chamada das etapas 2/3
    if (tf.etapa > 1 && tf.etapa < 4 && !semE1.done) { semE1.done = semE1.ativo; if (semE1.ativo) j.areas = por(1).areas; }
    if (tf.etapa === 4) j.materiais = tf.pmibs.map(p => mats.get(p) || { pmib: p, encontrado: false, tags: [] });
    return `Li ${tf.controle.length} páginas de controle {sem chaves no JSON}.\n\`\`\`json\n${JSON.stringify(j)}\n\`\`\`\nResumo: ok.`; // texto em volta, como o Sonnet 5.5 respondeu na sonda 2
  };
  const roda = tarefas => tarefas.map(tf => ({ arquivo: tf.rotulo, texto: responde(tf) }));

  const p1 = AGENTE.tarefasWorkflow(indexados, st, cfg, [1]);
  semE1.ativo = !p1.tarefas.length;
  const r1 = roda(p1.tarefas);
  const ctx1 = AGENTE.contextoDasRespostas(r1, indexados, cfg);
  const p23 = AGENTE.tarefasWorkflow(indexados, st, cfg, [2, 3], ctx1);
  const r23 = roda(p23.tarefas);
  const ctx = AGENTE.contextoDasRespostas([...r1, ...r23], indexados, cfg);
  // página "Confira as áreas" (depois das etapas 2 e 3, antes da 4): a equipe completa o que o texto não traz (elevação, RDS-PP, trechos da área), como no teste_a
  const projeto = LMR.trechosDoProjeto(cfg.trechos, s.lista || []).map(x => x.trecho);
  const campos = LEITURA.formAreas(ctx.areas, []).campos.map(c => c.fieldLabel);
  const resp = {};
  ctx.areas.forEach((a, i) => {
    const g = por(1).areas.find(x => x.nome === a.original || x.nome === a.nome) || {};
    const rotulo = campo => campos.find(c => c.startsWith(`${i + 1}. ${a.nome} — ${campo}`));
    if (g.elevacao && g.elevacao !== a.elev) resp[rotulo('elevação')] = g.elevacao;
    if (g.rds && !a.rds) resp[rotulo('RDS-PP')] = g.rds;
    if ((g.trechos || []).length && g.trechos.length < projeto.length) resp[rotulo('trechos')] = g.trechos.join(', ');
  });
  const conferidas = LEITURA.aplicaFormAreas(ctx.areas, resp);
  ctx.areas = conferidas;
  const p4 = AGENTE.tarefasWorkflow(indexados, st, cfg, [4], ctx);
  const r4 = roda(p4.tarefas);
  const todas = [...p1.tarefas, ...p23.tarefas, ...p4.tarefas];
  if (process.env.MSG === n) for (const tf of [p1.tarefas[0], p23.tarefas[0], p4.tarefas[0]].filter(Boolean)) console.log(`\n──── ${tf.rotulo} (${tf.caracteres} car.) ────\n${tf.chatInput.slice(0, 2500)}\n`);

  // chamadas: tamanho, páginas úteis enviadas uma vez por etapa, controle só das páginas enviadas, sessões distintas
  const maior = Math.max(...todas.map(x => x.caracteres));
  ok(todas.filter(x => x.etapa < 4).every(x => x.caracteres <= 80000 + 30000), `chamada de ${maior} caracteres`);
  ok(new Set(todas.map(x => x.sessionId)).size === todas.length, 'sessões repetidas');
  ok(p4.tarefas.reduce((k, x) => k + x.pmibs.length, 0) === st.catalogo.length, 'materiais faltando na etapa 4');
  for (const tf of todas) for (const id of tf.controle) { const q = r.controle.find(x => x.id === id); ok(tf.chatInput.includes(`### ${q.arquivo} — página ${q.pagina}\n`), `${id} sem a página na mensagem`); }
  ok(!todas.some(x => /CORRETAS/.test(x.chatInput)), 'gabarito numa mensagem');
  ok(ctx1.areas.length > 0 || n === 'aeracao', 'nenhuma área no contexto da etapa 2');

  const controle = AGENTE.gabaritoDoControle([...p1.controle, ...p23.controle, ...p4.controle]);
  const m = AGENTE.montaBaseDoAgente({ LMR, statusRows, indexados, cfg, controle, respostas: [...r1, ...r23, ...r4], semTexto: false,
    areasConferidas: conferidas, etapasSemPaginas: [1, 2, 3, 4].filter(k => !todas.some(x => x.etapa === k)) });
  const ap = LEITURA.comparaAplicacao(m.base, gab, LMR);
  const tipos = {};
  for (const p of m.pendencias) tipos[p.TIPO] = (tipos[p.TIPO] || 0) + 1;
  console.log(`${s.nome}: ${todas.length} chamadas (E1 ${p1.tarefas.length}, E2/E3 ${p23.tarefas.length}, E4 ${p4.tarefas.length}; maior ${maior} car.; total ${Math.round(todas.reduce((k, x) => k + x.caracteres, 0) / 1000)} mil car.)`);
  console.log(`   agente perfeito (só texto) → ${ap.iguais}/${ap.gabarito} linhas iguais (${ap.iguaisSemNomeDaArea} sem nome da área); controle ${m.resumo.controleCertas}/${m.resumo.controlePerguntas}; pendências ${JSON.stringify(tipos)}`);
  ok(m.resumo.controleCertas === m.resumo.controlePerguntas && !tipos.CONTROLE && !tipos.ETAPA, 'controle/etapa com pendência no agente perfeito');
  ok(!tipos.CONFERIR, 'CONFERIR no modo só texto');
  if (s.minimo) ok(ap.iguais >= s.minimo, `${ap.iguais} linhas iguais (mínimo ${s.minimo})`);
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exit(falhas ? 1 : 0);

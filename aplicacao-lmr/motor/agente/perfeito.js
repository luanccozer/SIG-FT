/*
 * "Agente perfeito" para testes: as respostas das 4 etapas do agente, tiradas de uma Base já aplicada (gabarito),
 * no formato pedido pelo roteiro (r = AGENTE.roteiro). Controle respondido com as corretas.
 */
const LMR = require('../lmr.js');
const { oraculo } = require('../leitura/oraculo.js');

function agentePerfeito(r, gab, projeto) {
  const or = oraculo(gab);
  const controle = n => r.controle.filter(q => q.etapa === n).map(q => ({ id: q.id, presentes: q.corretas }));
  const arquivos = n => r.etapas[n - 1].anexos.map(a => ({ arquivo: a.arquivo, paginas: a.total, paginas_lidas: a.ler, paginas_ilegiveis: '' }));
  const areas = or.areas.map(a => {
    const tr = [...new Set(gab.filter(x => LMR.txt(x['ÁREA/PAINEL']).toUpperCase() === a.nome).flatMap(x => LMR.txt(x.TRECHOS).split(/[,\s]+/).filter(Boolean)))];
    return { ...a, trechos: tr.length && tr.length < projeto.length ? tr : [], evidencia: 'gabarito' };
  });
  const tags = [];
  for (const m of or.mats.values()) for (const x of m.tags) if (!tags.some(y => y.tag === x.tag && y.area === x.area)) tags.push({ tag: x.tag, area: x.area, rds_proprio: x.rds_proprio, elevacao: x.elevacao, evidencia: 'gabarito' });
  const mats = [...or.mats.values()].map(m => ({ ...m, encontrado: true, papel: m.pais.length ? 'peca' : 'proprio', kit: false }));
  const e4 = r.etapas[3].mensagens.map((msg, i) => {
    const pmibs = new Set(msg.linhas.map(l => (l.match(/^- (\S+) \| item /) || [])[1]).filter(Boolean));
    return { arquivo: `etapa4_materiais${msg.rotulo ? `_parte${msg.rotulo}` : ''}.json`,
      json: { etapa: 4, parte: msg.rotulo || '1', arquivos: arquivos(4), controle: i ? [] : controle(4), materiais: mats.filter(m => pmibs.has(m.pmib)) } };
  });
  return [
    { arquivo: 'etapa1_areas.json', json: { etapa: 1, parte: '1', arquivos: arquivos(1), controle: controle(1), areas } },
    { arquivo: 'etapa2_conjuntos.json', json: { etapa: 2, parte: '1', arquivos: arquivos(2), controle: controle(2), tags: [] } },
    { arquivo: 'etapa3_equipamentos.json', json: { etapa: 3, parte: '1', arquivos: arquivos(3), controle: controle(3), tags } },
    ...e4,
  ];
}
const textos = rs => rs.map(x => ({ arquivo: x.arquivo, texto: JSON.stringify(x.json, null, 1) }));

// Uma chamada do workflow (tarefa de AGENTE.tarefasWorkflow) → resposta do agente perfeito, com texto em volta do
// bloco ```json (como o Sonnet 5.5 respondeu na sonda 2). Áreas e TAGs vão na primeira chamada que puder levá-las.
function respondedor(r, perf) {
  const por = k => (perf.find(x => x.json.etapa === k) || { json: {} }).json;
  const corretas = new Map(r.controle.map(q => [q.id, q.corretas]));
  const mats = new Map(perf.filter(x => x.json.etapa === 4).flatMap(x => x.json.materiais).map(m => [m.pmib, m]));
  const dado = { areas: false, tags: false };
  return tf => {
    if (tf.vazia) return '{}';
    const j = { etapa: tf.etapa, parte: tf.parte, arquivos: [], controle: tf.controle.map(id => ({ id, presentes: corretas.get(id) })), observacoes: [] };
    if (tf.etapa < 4) { j.areas = dado.areas ? [] : por(1).areas || []; dado.areas = true; }
    if (tf.etapa === 2 || tf.etapa === 3) { j.tags = dado.tags ? [] : por(3).tags || []; dado.tags = true; }
    if (tf.etapa === 4) j.materiais = tf.pmibs.map(p => mats.get(p) || { pmib: p, encontrado: false, tags: [] });
    return 'Li as páginas {sem chaves no JSON}.\n```json\n' + JSON.stringify(j) + '\n```\nResumo: ok.';
  };
}

// Página "Confira as áreas" preenchida pela equipe: o que o texto não traz (elevação, RDS-PP, trechos da área).
function preencheAreas(LEITURA, areas, gabaritoAreas, projeto) {
  const campos = LEITURA.formAreas(areas, []).campos.map(c => c.fieldLabel);
  const resp = {};
  areas.forEach((a, i) => {
    const g = gabaritoAreas.find(x => x.nome === a.original || x.nome === a.nome) || {};
    const rotulo = campo => campos.find(c => c.startsWith(`${i + 1}. ${a.nome} — ${campo}`));
    if (g.elevacao && g.elevacao !== a.elev) resp[rotulo('elevação')] = g.elevacao;
    if (g.rds && !a.rds) resp[rotulo('RDS-PP')] = g.rds;
    if ((g.trechos || []).length && g.trechos.length < projeto.length) resp[rotulo('trechos')] = g.trechos.join(', ');
  });
  return resp;
}

module.exports = { agentePerfeito, textos, respondedor, preencheAreas };

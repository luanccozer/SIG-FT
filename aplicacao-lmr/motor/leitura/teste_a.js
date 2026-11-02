/*
 * Teste local do A2/A3 com os PDFs reais (dados/textos_{sistema}.json) e a Base emitida como gabarito, em todos os
 * sistemas que temos (a leitura não pode ser feita sob medida para um sistema).
 *   "IA perfeita": respostas montadas a partir do gabarito → mede a montagem e as regras, não o modelo.
 *   Compara a leitura em etapas (v3: área das TAGs achadas pelo código + leitura completa só do resto) com a leitura
 *   de tudo por material (v2), em número de chamadas, tamanho dos pedidos e linhas iguais ao gabarito.
 *   "sem IA": nenhuma resposta → Base com PENDÊNCIAS, sem nada inventado.
 * Uso: node leitura/teste_a.js     (PROMPT=agua_pura mostra um pedido de cada tipo)
 */
const fs = require('fs');
const path = require('path');
const LMR = require('../lmr.js');
const INDICE = require('../indice/indice.js');
const LEITURA = require('./leitura.js');
const { oraculo } = require('./oraculo.js');
const D = path.join(__dirname, '..', 'dados');

const SIS = {
  agua_pura: { nome: 'Água Pura', escopo: 'UG', sub: 'ÁGUA PURA', kits: 'SEM TAG', pecas: 'TAG' },
  regvel: { nome: 'Reg. Vel. e Pot. Hidráulica', escopo: 'RV', sub: 'PARTE MECÂNICA', kits: 'TAG', pecas: 'PAI' },
  aeracao: { nome: 'Aeração Axial', escopo: 'UG', sub: 'AERAÇÃO AXIAL DA TURBINA', freq: 'AMBAS', kits: 'TAG' },
  sfc: { nome: 'SFC', escopo: 'UG', sub: 'SFC', trechos: 'LISTA', lista: ['AMD-03', 'AMC-02'], kits: 'TAG' },
};

// "IA perfeita" para os dois tipos de pedido da leitura em etapas
function iaPerfeita(or, sugDe) {
  const daTag = new Map();
  for (const m of or.mats.values()) for (const x of m.tags) { const l = daTag.get(x.tag) || daTag.set(x.tag, []).get(x.tag); if (!l.some(y => y.area === x.area)) l.push(x); }
  for (const [pmib, m] of or.mats) for (const tg of sugDe(pmib)) if (!daTag.has(tg)) daTag.set(tg, [{ area: (m.tags[0] || {}).area || m.area, rds_proprio: true }]);
  return tf => {
    if (tf.tipo === 'confirma') return JSON.stringify({ materiais: tf.pmibs.map(p => { const m = or.mats.get(p) || { tags: [], pais: [] }; const minhas = [...m.tags.map(x => x.tag), ...m.pais];
      return { pmib: p, tags: tf.candidatas[p].filter(x => minhas.includes(x) || (m.kit && !minhas.length)), papel: m.pais.length ? 'peca' : 'proprio' }; }) });
    if (tf.tipo === 'area') {
      const num = nome => { const m = [...tf.prompt.matchAll(/^(\d+)\. "([^"]+)"/gm)].find(x => x[2] === nome); return m ? Number(m[1]) : 0; };
      return JSON.stringify({ tags: tf.tags.flatMap(tag => (daTag.get(tag) || [{}]).map(x => ({ tag, area: num(x.area), rds_proprio: x.rds_proprio, elevacao: x.elevacao || null }))) });
    }
    return JSON.stringify({ materiais: (tf.pmibs || []).map(p => or.mats.get(p) || { pmib: p }) });
  };
}

let falhas = 0;
for (const [n, s] of Object.entries(SIS)) {
  if (!fs.existsSync(path.join(D, `textos_${n}.json`))) { console.log(`— ${s.nome}: sem textos`); continue; }
  const statusRows = JSON.parse(fs.readFileSync(path.join(D, `status_${n}.json`), 'utf8')).linhas;
  const st = LMR.lerStatusPmib(statusRows);
  const gab = JSON.parse(fs.readFileSync(path.join(D, `base_${n}.json`), 'utf8')).base;
  const indexados = JSON.parse(fs.readFileSync(path.join(D, `textos_${n}.json`), 'utf8')).map(d => INDICE.indexaDocumento(d.arquivo, d.paginas || [], st.catalogo));
  const ind = LEITURA.indiceCompacto(indexados);
  const e = { lista: st.lista, subsistema: s.sub, pecas: s.pecas || 'TAG' };
  const pA = LEITURA.promptAreas(ind, e);
  const or = oraculo(gab);
  const lidas = LEITURA.leAreas(JSON.stringify({ areas: or.areas }), ind, s.sub).areas;
  // página "Confira as áreas": o usuário preenche o que o texto não traz (elevação, RDS-PP, trechos da área)
  const campos = LEITURA.formAreas(lidas, []).campos.map(c => c.fieldLabel);
  const resp = {};
  const projeto = LMR.trechosDoProjeto(s.trechos || 'TODAS', s.lista || []).map(x => x.trecho);
  lidas.forEach((a, i) => {
    const g = or.areas.find(x => x.nome === a.original || x.nome === a.nome) || {};
    const rotulo = campo => campos.find(c => c.startsWith(`${i + 1}. ${a.nome} — ${campo}`));
    if (g.elevacao && g.elevacao !== a.elev) resp[rotulo('elevação')] = g.elevacao;
    if (g.rds && !a.rds) resp[rotulo('RDS-PP')] = g.rds;
    const tr = [...new Set(gab.filter(r => LMR.txt(r['ÁREA/PAINEL']).toUpperCase() === (a.original || a.nome)).flatMap(r => LMR.txt(r.TRECHOS).split(/[,\s]+/).filter(Boolean)))];
    if (tr.length && tr.length < projeto.length) resp[rotulo('trechos')] = tr.join(', ');
  });
  const areas = process.env.SEM_PAGINA ? lidas : LEITURA.aplicaFormAreas(lidas, resp);
  const preenchidos = Object.keys(resp).length;
  const comum = { LMR, catalogo: st.catalogo, relacoes: st.relacoes, lista: st.lista, statusRows, areas, escopo: s.escopo, subsistema: s.sub,
    trechos: s.trechos || 'TODAS', listaTrechos: s.lista || [], frequencia: s.freq, kits: s.kits, ind };
  const ia = iaPerfeita(or, p => ind.sug[p] || []);

  // v3: em etapas
  const plano = LEITURA.planoDeLeitura(ind, st.catalogo, areas, e);
  const classif = [], decMat = [], conf = {};
  for (const tf of plano.tarefas) {
    if (tf.tipo === 'area') classif.push(...LEITURA.confereAreasDasTags(ia(tf), tf, ind, areas).classif);
    else if (tf.tipo === 'confirma') Object.assign(conf, LEITURA.confereConfirma(ia(tf), tf).confirmacoes);
    else if (tf.tipo === 'material') decMat.push(...LEITURA.confereMateriais(ia(tf), tf, ind, areas));
  }
  const r3 = LEITURA.montaBase({ ...comum, decisoes: LEITURA.decisoesDaLeitura(plano.conhecidos, classif, decMat, conf, s.pecas) });
  // v2: tudo por material
  const tarefas2 = LEITURA.tarefasMateriais(ind, st.catalogo, areas, e);
  const r2 = LEITURA.montaBase({ ...comum, decisoes: tarefas2.flatMap(tf => LEITURA.confereMateriais(ia(tf), tf, ind, areas)) });
  const semIA = LEITURA.montaBase({ ...comum, areas: [], decisoes: [] });

  const tam = x => x.map(t => t.prompt.length);
  const ap3 = LEITURA.comparaAplicacao(r3.base, gab, LMR), ap2 = LEITURA.comparaAplicacao(r2.base, gab, LMR);
  const c3 = LEITURA.comparaComGabarito(r3.base, gab);
  const porTipo = tp => plano.tarefas.filter(t => t.tipo === tp);
  const k = Object.values(plano.conhecidos);
  console.log(`${s.nome}: ${st.catalogo.length} materiais; prompt de áreas ${pA.length} car.; ${areas.length} áreas; ${preenchidos} campos preenchidos na página "Confira as áreas"`);
  console.log(`   v2 (tudo por material): ${tarefas2.length} chamadas (${Math.min(...tam(tarefas2))}–${Math.max(...tam(tarefas2))} car.) → ${ap2.iguais}/${ap2.gabarito} linhas iguais`);
  console.log(`   v3 (em etapas): ${k.length} materiais com TAG do código (${k.filter(x => /painel/.test(x.fonte)).length} do painel); `
    + `${porTipo('area').length} chamadas "área das TAGs" + ${porTipo('confirma').length} de "confirmação das TAGs da lista" + ${porTipo('material').length} de leitura completa`
    + `${plano.tarefas.length ? ` (${Math.min(...tam(plano.tarefas))}–${Math.max(...tam(plano.tarefas))} car.)` : ''} → ${ap3.iguais}/${ap3.gabarito} linhas iguais (${ap3.iguaisSemNomeDaArea} sem contar o nome da área); campos ${JSON.stringify(c3.total)}; pendências ${r3.pendencias.length}`);
  console.log(`   sem IA → BASE ${semIA.base.length} linhas, pendências ${semIA.pendencias.length}`);
  const dif = c3.linhas.filter(l => Object.entries(l).some(([kk, v]) => kk !== 'PMIB' && v !== 'OK'));
  for (const l of dif.slice(0, Number(process.env.DIF || 4))) console.log('   ≠', l.PMIB.slice(-4), Object.entries(l).filter(([kk, v]) => kk !== 'PMIB' && v !== 'OK').map(([kk, v]) => `${kk}: ${v}`).join(' ║ ').slice(0, 200));
  // a leitura em etapas não pode ficar pior que a leitura de tudo por material (com a mesma "IA perfeita")
  if (process.env.DIFV === n) { const c2 = LEITURA.comparaComGabarito(r2.base, gab); const ok = l => Object.entries(l).every(([kk, v]) => kk === 'PMIB' || v === 'OK');
    for (const l of c3.linhas) { const l2 = c2.linhas.find(x => x.PMIB === l.PMIB); if (l2 && ok(l2) && !ok(l)) console.log('   v2 ok, v3 ≠', l.PMIB.slice(-4), (plano.conhecidos[l.PMIB] || {}).fonte || 'leitura completa', Object.entries(l).filter(([kk, v]) => kk !== 'PMIB' && v !== 'OK').map(([kk, v]) => kk + ': ' + v).join(' ║ ').slice(0, 220)); } }
  if (process.env.LINHAS === n) { const lin = b => b.map(LMR.linhaParaModelo).filter(m => m.qtd > 0).flatMap(LMR.geraModelo); const g = lin(gab), a = lin(r3.base);
    console.log('   gab:', g.slice(0, 2).map(l => l.codigo + ' || ' + l.tag)); console.log('   ger:', a.slice(0, 2).map(l => l.codigo + ' || ' + l.tag));
    const tp = {}; for (const x of r3.pendencias) tp[x.TIPO + ': ' + x.DETALHE.slice(0, 60)] = (tp[x.TIPO + ': ' + x.DETALHE.slice(0, 60)] || 0) + 1; console.log('   pend:', JSON.stringify(tp).slice(0, 600)); }
  if (ap3.iguais < ap2.iguais * 0.9) { console.log(`   FALHA: v3 (${ap3.iguais}) bem abaixo da v2 (${ap2.iguais})`); falhas++; }
  if (process.env.PROMPT === n) for (const tp of ['area', 'material']) { const t = porTipo(tp)[0]; if (t) console.log(`\n──── pedido "${tp}" ────\n${t.prompt.slice(0, 6000)}\n`); }
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exit(falhas ? 1 : 0);

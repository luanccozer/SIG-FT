/*
 * "IA perfeita" para testes: as respostas que a leitura com IA daria, tiradas de uma Base já aplicada (gabarito).
 * Área sem nome no gabarito → o RDS-PP vira o nome (limite do gabarito antigo, não da montagem).
 */
const LMR = require('../lmr.js');
const LEITURA = require('./leitura.js');

const nomeArea = r => { const tg = LEITURA.tagNoRds(r['RDS-PP']); return LMR.txt(r['ÁREA/PAINEL']).toUpperCase() || LMR.txt(r['RDS-PP']).slice(0, tg ? -tg.length : undefined); };
function oraculo(gab) {
  const areas = new Map();
  for (const r of gab) {
    const tg = LEITURA.tagNoRds(r['RDS-PP']);
    const nome = nomeArea(r);
    if (areas.has(nome) && areas.get(nome).elevacao !== r['ELEVAÇÃO']) areas.get(nome).elevacao = null; // área em várias elevações
    if (!nome || areas.has(nome)) continue;
    const rds = LMR.txt(r['RDS-PP']).slice(0, tg ? -tg.length : undefined).replace('#ST[XX]=M[XX]', '#ST00=M00');
    areas.set(nome, { nome, rds, local: r.LOCAL, elevacao: r['ELEVAÇÃO'], eixo: r.EIXO || null });
  }
  const UG50 = new Set(LMR.UGS.filter(u => u.hz === 50).map(u => u.trecho)), UG60 = new Set(LMR.UGS.filter(u => u.hz === 60).map(u => u.trecho));
  const mats = new Map();
  for (const r of gab) {
    const p = LMR.txt(r.FICHA_PMIB);
    const m = mats.get(p) || { pmib: p, tags: [], pais: [], area: null, qtd_instalada: null, frequencia: null, trechos: new Set(), evidencia: 'gabarito' };
    const area = nomeArea(r) || null;
    // elevação por TAG (a mesma TAG pode estar em mais de uma elevação)
    if (LMR.txt(r.TAG) && !m.tags.some(x => x.tag === r.TAG && x.elevacao === r['ELEVAÇÃO'] && x.area === area)) m.tags.push({ tag: r.TAG, area, rds_proprio: r['TAG COM RDS-PP'] === 'SIM', elevacao: r['ELEVAÇÃO'] });
    for (const q of LMR.txt(r.PAIS).split(';').map(s => LMR.txt(s.split('|')[0])).filter(Boolean)) if (!m.pais.includes(q)) m.pais.push(q);
    const tp = LEITURA.tagNoRds(r['RDS-PP']);
    if (tp && !m.pais.includes(tp)) m.pais.push(tp);
    if (!LMR.txt(r.TAG)) { m.area = area; m.elevacao = r['ELEVAÇÃO']; m.qtd_instalada = Number(r['QTD POR TRECHO']) || null; }
    for (const tr of LMR.txt(r.TRECHOS).split(/[,\s]+/).filter(Boolean)) m.trechos.add(tr);
    mats.set(p, m);
  }
  for (const m of mats.values()) {
    const tr = [...m.trechos];
    m.frequencia = tr.every(x => UG50.has(x)) ? '50' : tr.every(x => UG60.has(x)) ? '60' : null;
    if (m.tags.length) m.pais = [];
    delete m.trechos;
  }
  return { areas: [...areas.values()], mats };
}

module.exports = { oraculo };

/*
 * Testes do Workflow C (alterações sobre a Base), sem AMP.
 *   T1  Reg. Vel. real: C1 com o Status atual acha 0795, 1137, 1141 (saíram) e 1640, 1641 (entraram).
 *   T2  Reg. Vel. real: decisões (0795→1641, excluir 1137 e 1141, 1640 só na DOCS) aplicadas pelo C2.
 *   T3  C1 de novo sobre a Base nova: nada a sugerir.
 *   T4  Água Pura fictício: substituir só nas ÍMPARES, QTD 2 nas PARES, PMIB fora da Base, trecho inválido.
 *   T5  Reg. Vel. fictício: excluir um pai avisa os filhos; incluir copiando posições.
 * Uso: node alteracoes/teste_c.js
 */
const fs = require('fs');
const path = require('path');
const L = require('../lmr.js');

const D = path.join(__dirname, '..', 'dados');
const ler = n => JSON.parse(fs.readFileSync(path.join(D, n + '.json'), 'utf8'));
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok   ' : 'FALHA'} ${msg}`); if (!c) falhas++; };
const P = n => `4500063671.${n}`;
const geraTudo = base => {
  const tags = new Set(base.map(r => L.txt(r.TAG)).filter(Boolean));
  return L.geraLote(base.map(r => JSON.parse(JSON.stringify(r))), tags);
};
const linhasDe = (itens, pmib) => itens.flatMap(i => i.linhas).filter(l => l.FICHA_PMIB === pmib);
const ctx = n => { const b = ler('base_' + n); return { base: ler('base_lida_' + n), docs: b.docs, relacoes: b.relacoes, status: ler('status_' + n).linhas }; };

// ── T1 ──
const rv = ctx('regvel');
const c1 = L.comparaBaseStatus({ statusRows: rv.status, base: rv.base, docs: rv.docs, relacoes: rv.relacoes });
const tipos = c1.alteracoes.map(a => `${a.TIPO} ${a['PMIB ATUAL'] || a['PMIB NOVO']}`).sort();
ok(JSON.stringify(tipos) === JSON.stringify([`EXCLUIR ${P('0795')}`, `EXCLUIR ${P('1137')}`, `EXCLUIR ${P('1141')}`, `INCLUIR ${P('1640')}`, `INCLUIR ${P('1641')}`].sort()),
  `T1 C1 Reg. Vel.: ${tipos.join(', ')}`);
ok(c1.alteracoes.every(a => a.APLICAR === ''), 'T1 substituir/excluir/incluir vêm sem APLICAR (confirmação humana)');

// ── T2: o que o usuário faria na planilha ──
const dec = c1.alteracoes.map(a => ({ ...a }));
const linha = (tipo, pmib) => dec.find(a => a.TIPO === tipo && (a['PMIB ATUAL'] === pmib || a['PMIB NOVO'] === pmib));
const inc1641 = linha('INCLUIR', P('1641'));
Object.assign(linha('EXCLUIR', P('0795')), { TIPO: 'SUBSTITUIR_MATERIAL', APLICAR: 'SIM', 'PMIB NOVO': P('1641'), 'DESCRIÇÃO NOVA': inc1641['DESCRIÇÃO NOVA'], 'PART NUMBER NOVO': inc1641['PART NUMBER NOVO'] });
inc1641.APLICAR = 'NÃO'; // já entrou pela substituição
linha('EXCLUIR', P('1137')).APLICAR = 'SIM';
linha('EXCLUIR', P('1141')).APLICAR = 'SIM';
linha('INCLUIR', P('1640')).APLICAR = 'SIM'; // sem posição: só DOCS
const antes = geraTudo(rv.base);
const c2 = L.aplicaAlteracoes({ base: rv.base, docs: rv.docs, relacoes: rv.relacoes, alteracoes: dec, data: '2026-10-23' });
const depois = geraTudo(c2.base);
const n0795 = linhasDe(antes, P('0795')).length;
ok(n0795 > 0 && linhasDe(depois, P('0795')).length === 0 && linhasDe(depois, P('1641')).length === n0795, `T2 0795 → 1641: ${n0795} linhas da aplicação trocadas`);
ok(linhasDe(depois, P('1137')).length === 0 && linhasDe(depois, P('1141')).length === 0, `T2 1137 e 1141 fora (${linhasDe(antes, P('1137')).length + linhasDe(antes, P('1141')).length} linhas removidas)`);
ok(linhasDe(depois, P('1640')).length === 0 && c2.docs.some(d => d['CÓDIGO PMIB'] === P('1640')), 'T2 1640 entra só na DOCS DE REFERÊNCIA');
const dDocs = new Set(c2.docs.map(d => d['CÓDIGO PMIB']));
ok(!dDocs.has(P('0795')) && dDocs.has(P('1641')) && !dDocs.has(P('1137')), 'T2 DOCS: sai 0795, entra 1641');
const nA = antes.reduce((s, i) => s + i.n, 0), nD = depois.reduce((s, i) => s + i.n, 0);
const removidas = linhasDe(antes, P('1137')).length + linhasDe(antes, P('1141')).length;
ok(nD === nA - removidas, `T2 total de linhas: ${nA} → ${nD}`);
// o resto da aplicação não mudou
const resto = itens => itens.flatMap(i => i.linhas).filter(l => ![P('0795'), P('1641'), P('1137'), P('1141')].includes(l.FICHA_PMIB)).map(l => `${l.FICHA_PMIB}|${l['CÓDIGO_LMR']}|${l.TAG_LMR}`).sort().join('\n');
ok(resto(antes) === resto(depois), 'T2 demais linhas da aplicação idênticas');
const sub = linhasDe(depois, P('1641'))[0];
ok(sub && sub.TAG_LMR.includes(inc1641['DESCRIÇÃO NOVA']), `T2 TAG_LMR com a descrição nova: ${sub && sub.TAG_LMR}`);
ok(c2.historico.length === dec.length && c2.historico.filter(h => h.RESULTADO.startsWith('aplicada')).length === 4 && c2.historico.filter(h => h.RESULTADO.startsWith('ignorada')).length === 1, `T2 HISTÓRICO: ${c2.historico.map(h => `${h.TIPO}:${h.RESULTADO.split(':')[0]}`).join(', ')}`);
ok(c2.diferencas.length === 3, `T2 DIFERENÇAS: ${c2.diferencas.map(d => `${d.TIPO} ${d['LINHAS DA APLICAÇÃO ANTES']}→${d['LINHAS DA APLICAÇÃO DEPOIS']}`).join(', ')}`);

// ── T3 ──
const c1b = L.comparaBaseStatus({ statusRows: rv.status, base: c2.base, docs: c2.docs, relacoes: c2.relacoes });
ok(c1b.alteracoes.length === 1 && c1b.alteracoes[0].TIPO === 'INCLUIR' && c1b.alteracoes[0]['PMIB NOVO'] === P('1640'), `T3 C1 sobre a Base nova: só 1640 continua sem posição (${c1b.alteracoes.map(a => a.TIPO + ' ' + (a['PMIB ATUAL'] || a['PMIB NOVO'])).join(', ')})`);

// ── T4: Água Pura, casos fictícios ──
const ap = ctx('agua_pura');
const pmA = L.txt(ap.base[0].FICHA_PMIB);
const pmB = L.txt(ap.base.find(r => L.txt(r.FICHA_PMIB) !== pmA && L.txt(r.TRECHOS).split(', ').length >= 10).FICHA_PMIB);
const alt4 = [
  { 'Nº': 1, TIPO: 'SUBSTITUIR_MATERIAL', APLICAR: 'SIM', 'PMIB ATUAL': pmA, 'PMIB NOVO': P('9001'), 'DESCRIÇÃO NOVA': 'MATERIAL FICTÍCIO DE TESTE', 'PART NUMBER NOVO': 'PN-TESTE', TRECHOS: 'ÍMPARES' },
  { 'Nº': 2, TIPO: 'ALTERAR_QTD', APLICAR: 'SIM', 'PMIB ATUAL': pmB, TRECHOS: 'PARES', 'QTD POR TRECHO': '3' },
  { 'Nº': 3, TIPO: 'EXCLUIR', APLICAR: 'SIM', 'PMIB ATUAL': P('9999') },
  { 'Nº': 4, TIPO: 'ALTERAR_QTD', APLICAR: 'SIM', 'PMIB ATUAL': pmB, TRECHOS: 'U-21', 'QTD POR TRECHO': '2' },
  { 'Nº': 5, TIPO: 'EXCLUIR', APLICAR: '', 'PMIB ATUAL': pmB },
];
const a0 = geraTudo(ap.base);
const r4 = L.aplicaAlteracoes({ base: ap.base, docs: ap.docs, relacoes: ap.relacoes, alteracoes: alt4, data: '2026-10-23' });
const a1 = geraTudo(r4.base);
const imp = new Set(L.trechosDoProjeto('IMPARES').map(t => t.trecho));
const trechoDe = l => l['CÓDIGO_LMR'].match(/TRECHO (\S+)$/)[1];
const novos = linhasDe(a1, P('9001'));
ok(novos.length > 0 && novos.every(l => imp.has(trechoDe(l))) && linhasDe(a1, pmA).every(l => !imp.has(trechoDe(l))), `T4 substituição só nas ÍMPARES: ${novos.length} linhas novas, ${linhasDe(a1, pmA).length} antigas nas PARES`);
ok(novos.length + linhasDe(a1, pmA).length === linhasDe(a0, pmA).length, 'T4 total do material substituído igual');
const porTrecho = (itens, pm) => itens.flatMap(i => i.linhas).filter(l => l.FICHA_PMIB === pm).reduce((m, l) => m.set(trechoDe(l), (m.get(trechoDe(l)) || 0) + 1), new Map());
const q0 = porTrecho(a0, pmB), q1 = porTrecho(a1, pmB);
const posicoes = t => ap.base.filter(r => L.txt(r.FICHA_PMIB) === pmB && L.txt(r.TRECHOS).split(', ').includes(t)).length;
ok([...q1].every(([t, q]) => (imp.has(t) ? q === q0.get(t) : q === 3 * posicoes(t))), `T4 QTD 3 por posição nas PARES de ${pmB}: ${[...q1].map(([t, q]) => `${t}:${q}`).join(' ')}`);
const res = n => r4.historico.find(h => h['Nº'] === n).RESULTADO;
ok(/não está na BASE/.test(res(3)), `T4 PMIB fora da Base recusado: ${res(3)}`);
ok(/trecho inválido/.test(res(4)), `T4 trecho inválido recusado: ${res(4)}`);
ok(/^ignorada/.test(res(5)) && linhasDe(a1, pmB).length > 0, `T4 APLICAR vazio não aplica: ${res(5)}`);
ok(r4.docs.some(d => d['CÓDIGO PMIB'] === P('9001') && d['PART NUMBER'] === 'PN-TESTE') && r4.docs.some(d => d['CÓDIGO PMIB'] === pmA), 'T4 DOCS: novo PMIB entra, antigo fica (ainda usado nas PARES)');

// ── T5: Reg. Vel., pai excluído e inclusão por posição ──
const pai = rv.base.find(r => L.txt(r.TAG) && rv.base.some(f => L.txt(f.PAIS).split(/\s*;\s*/).some(p => L.txt(p.split('|')[0]) === L.txt(r.TAG))));
const r5 = L.aplicaAlteracoes({ base: rv.base, docs: rv.docs, relacoes: rv.relacoes, data: '2026-10-23', alteracoes: [
  { 'Nº': 1, TIPO: 'EXCLUIR', APLICAR: 'SIM', 'PMIB ATUAL': L.txt(pai.FICHA_PMIB) },
  { 'Nº': 2, TIPO: 'INCLUIR', APLICAR: 'SIM', 'PMIB NOVO': P('1640'), 'DESCRIÇÃO NOVA': 'PLAQUETA', 'COPIAR POSIÇÕES DE': P('1641') },
  { 'Nº': 3, TIPO: 'INCLUIR', APLICAR: 'SIM', 'PMIB NOVO': P('1640'), 'DESCRIÇÃO NOVA': 'PLAQUETA', 'COPIAR POSIÇÕES DE': L.txt(rv.base.find(r => L.txt(r.FICHA_PMIB) !== L.txt(pai.FICHA_PMIB) && /U-01/.test(r.TRECHOS)).FICHA_PMIB), TRECHOS: 'U-01, U-02', 'QTD POR TRECHO': '1' },
] });
ok(r5.avisos.some(a => /era pai de/.test(a)), `T5 excluir pai avisa: ${r5.avisos[0] || '(sem aviso)'}`);
ok(/não está na BASE/.test(r5.historico[1].RESULTADO), `T5 copiar posições de PMIB fora da Base recusado`);
const inc = linhasDe(geraTudo(r5.base), P('1640'));
ok(inc.length > 0 && inc.every(l => ['U-01', 'U-02'].includes(trechoDe(l))), `T5 inclusão copiando posições em U-01 e U-02: ${inc.length} linhas`);

fs.mkdirSync(path.join(__dirname, '..', 'saida', 'teste_c'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'saida', 'teste_c', 'regvel_decisoes.json'), JSON.stringify(dec, null, 1));
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);

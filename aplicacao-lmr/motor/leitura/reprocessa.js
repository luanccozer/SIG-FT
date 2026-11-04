/*
 * Reprocessa as respostas da IA guardadas numa BASE gerada no AMP (aba RESPOSTAS IA), com a conferência e a montagem
 * atuais, sem chamar a IA de novo. Serve para medir correções do código contra respostas reais.
 * Uso: node leitura/reprocessa.js <BASE gerada.xlsx> <sistema: agua_pura|regvel|…> <escopo> <subsistema> <eixo>
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const LMR = require('../lmr.js');
const INDICE = require('../indice/indice.js');
const LEITURA = require('./leitura.js');

const [arq, n, escopo = 'UG', subsistema = '', eixo = ''] = process.argv.slice(2);
const D = path.join(__dirname, '..', 'dados');
const respostas = JSON.parse(execFileSync('python', ['-X', 'utf8', '-c',
  'import openpyxl,json,sys\nwb=openpyxl.load_workbook(sys.argv[1])\nprint(json.dumps([list(r) for r in wb["RESPOSTAS IA"].iter_rows(values_only=True)][1:],ensure_ascii=False))', arq], { encoding: 'utf8', maxBuffer: 1 << 26 }));
const statusRows = JSON.parse(fs.readFileSync(path.join(D, `status_${n}.json`), 'utf8')).linhas;
const st = LMR.lerStatusPmib(statusRows);
const gab = JSON.parse(fs.readFileSync(path.join(D, `base_${n}.json`), 'utf8')).base;
const ind = LEITURA.indiceCompacto(JSON.parse(fs.readFileSync(path.join(D, `textos_${n}.json`), 'utf8')).map(d => INDICE.indexaDocumento(d.arquivo, d.paginas || [], st.catalogo)));
const e = { lista: st.lista, subsistema };
const { areas, avisos } = LEITURA.leAreas(respostas[0][1], ind, subsistema);
const tarefas = LEITURA.tarefasMateriais(ind, st.catalogo, areas, e);
// os lotes do AMP podem ter outro tamanho: junta todas as respostas e reparte pelos lotes atuais
const todos = respostas.slice(1).flatMap(([, r]) => (LEITURA.json(r) || {}).materiais || []);
const decisoes = tarefas.flatMap(tf => LEITURA.confereMateriais(JSON.stringify({ materiais: tf.pmibs.map(p => todos.find(m => m.pmib === p) || { pmib: p }) }), tf, ind, areas));
const r = LEITURA.montaBase({ LMR, catalogo: st.catalogo, relacoes: st.relacoes, lista: st.lista, statusRows, areas, decisoes, escopo, subsistema, trechos: 'TODAS', eixo, ind, kits: process.env.LMR_KITS || 'TAG' });
const c = LEITURA.comparaComGabarito(r.base, gab);
const ap = LEITURA.comparaAplicacao(r.base, gab, LMR);
const tipos = {};
for (const p of r.pendencias) { const k = `${p.TIPO}: ${p.DETALHE.replace(/"[^"]*"|\d+(\.\d+)?|[A-Z]{2}\d{3}[A-Z]?/g, '…').slice(0, 60)}`; tipos[k] = (tipos[k] || 0) + 1; }
console.log(`áreas ${areas.length} (avisos ${avisos.length}): ${areas.map(a => `${a.nome} [${a.rds || '-'} ${a.elev || '-'} ${a.eixo || '-'}]`).join('; ')}`);
console.log(`BASE ${r.base.length} linhas; aplicação: gabarito ${ap.gabarito}, gerada ${ap.gerada}, iguais ${ap.iguais} (sem o nome da área: ${ap.iguaisSemNomeDaArea}); campos iguais (de ${c.pmibs}): ${JSON.stringify(c.total)}`);
console.log('pendências:', r.pendencias.length, JSON.stringify(tipos));

// revisão das áreas simulada (6º argumento: JSON { "ÁREA": { "NOVO NOME", "RDS-PP", "ELEVAÇÃO", "EIXO" } })
const edicoes = process.argv[7] ? JSON.parse(fs.readFileSync(process.argv[7], 'utf8')) : null;
if (edicoes) {
  const aba = LEITURA.abaAreas(areas, r.base).map(a => ({ ...a, ...(edicoes[a['ÁREA/PAINEL']] || {}) }));
  const rv = LEITURA.revisaAreas({ base: r.base, areas: aba, pendencias: r.pendencias });
  const c2 = LEITURA.comparaComGabarito(rv.base, gab), ap2 = LEITURA.comparaAplicacao(rv.base, gab, LMR);
  console.log(`DEPOIS DA REVISÃO DAS ÁREAS: ${rv.resumo.linhasAlteradas} linhas alteradas; aplicação: iguais ${ap2.iguais} de ${ap2.gabarito} (sem o nome da área: ${ap2.iguaisSemNomeDaArea}); campos: ${JSON.stringify(c2.total)}; pendências ${rv.pendencias.length}`);
  const dif = c2.linhas.filter(l => Object.entries(l).some(([k, v]) => k !== 'PMIB' && v !== 'OK'));
  for (const l of dif.slice(0, 40)) console.log('   ≠', l.PMIB.slice(-4), Object.entries(l).filter(([k, v]) => k !== 'PMIB' && v !== 'OK').map(([k, v]) => `${k}: ${v}`).join(' ║ ').slice(0, 230));
}

/*
 * Workflow B local: BASE (JSON exportado pelo rodar_workflow_b.py) -> APLICAÇÃO LMR no template oficial.
 * Reproduz os nós Code do LMR_B_gerar_aplicacao.json: lotes de 20 -> LMR.geraLote -> PLANILHA.montaAplicacaoXlsx.
 * Uso: node rodar_workflow_b.js <entrada.json> <saida.xlsx> <validacao.json>
 */
const fs = require('fs');
const path = require('path');
// motor do repositório (aplicacao-lmr/motor) quando esta pasta está dentro de aplicacao-lmr/; senão, a cópia do Box
const MOTOR = process.env.LMR_MOTOR || [path.join(__dirname, '..', 'motor'), 'C:/Users/260040670/Box/DocManager Itaipu/Docs Aconex/LMR/motor']
  .find(p => fs.existsSync(path.join(p, 'lmr.js')));
const LMR = require(path.join(MOTOR, 'lmr.js'));
const PLANILHA = require(path.join(MOTOR, 'planilha.js'));
const PARTES = JSON.parse(fs.readFileSync(path.join(MOTOR, 'dados', 'template_partes.json'), 'utf8'));
const [entrada, saida, validacao] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(entrada, 'utf8'));
const t = v => (v == null ? '' : String(v).trim());

// nó "Gera linhas do lote": TAGs da Base inteira (V6) + lotes de 20
const tags = new Set();
for (const r of d.base) for (const x of LMR.txt(r.TAG).split('/')) if (x) tags.add(x);
const pns = new Map(d.docs.map(x => [t(x['CÓDIGO PMIB']), t(x['PART NUMBER'])]));
const voltas = [];
const base = d.base.filter(r => t(r.FICHA_PMIB));
for (let i = 0; i < base.length; i += 20) voltas.push(...LMR.geraLote(base.slice(i, i + 20), tags, pns));

// nó "Monta aplicação (template)"
const tagsPorPmib = {};
for (const r of d.base) if (t(r.FICHA_PMIB) && t(r.TAG)) (tagsPorPmib[t(r.FICHA_PMIB)] = tagsPorPmib[t(r.FICHA_PMIB)] || new Set()).add(t(r.TAG));
const docs = d.docs.filter(x => t(x['CÓDIGO PMIB'])).map(x => ({ ...x, TAGS: [...(tagsPorPmib[t(x['CÓDIGO PMIB'])] || [])].sort().join(', ') }));
const linhas = voltas.flatMap(v => v.linhas);
fs.writeFileSync(saida, PLANILHA.montaAplicacaoXlsx(PARTES, { cabecalho: d.cabecalho, docs, linhas }));

// assinatura e VALIDAÇÃO (mesma conta da mensagem final do B)
const n = voltas.reduce((a, v) => a + v.n, 0), h = voltas.reduce((a, v) => a + v.h, 0) % 4294967296;
const bloqueadas = voltas.reduce((a, v) => a + v.bloqueadas, 0);
const achados = voltas.flatMap(v => v.achados);
fs.writeFileSync(validacao, JSON.stringify({ assinatura: `${n}-${h.toString(16).toUpperCase().padStart(8, '0')}`, linhas: linhas.length, bloqueadas, achados }));
console.log(`Assinatura ${n}-${h.toString(16).toUpperCase().padStart(8, '0')} · ${base.length} linhas da Base -> ${linhas.length} linhas na aplicação, ${bloqueadas} bloqueadas, ${achados.length} achados`);

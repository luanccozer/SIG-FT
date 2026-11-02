/*
 * Testes do fluxo A enxuto com o sistema fictício (roda em qualquer máquina, sem os dados do Box).
 * Uso: node agente/teste_enxuto.js
 */
const AGENTE = require('./agente.js');
const F = require('./fixture_enxuto.js');
const R = require('./recuperacao.js');

let falhas = 0;
const ok = (cond, msg) => { if (!cond) { console.log(`   FALHA: ${msg}`); falhas++; } };
const { LMR, statusRows, st, cfg } = F;
const indexados = F.indexados();
const P = n => `4500000000.000${n}`;
const monta = respostas => AGENTE.montaBaseDoAgente({ LMR, statusRows, indexados, cfg, controle: [], respostas, semTexto: false, etapasSemPaginas: [3] });
const lacunasDe = materiais => R.lacunas({ m: monta(F.respostasBoas(materiais)), st, indexados });

// ── Task 1: lacunas ──
{
  const m = monta(F.respostasBoas());
  ok(m.base.length === 6, `fixture: ${m.base.length} linhas na Base (esperava 6)`);
  const l = R.lacunas({ m, st, indexados });
  ok(!l.enviar.length && !l.semPagina.length, `sem lacunas: ${JSON.stringify([...l.enviar, ...l.semPagina].map(x => [x.pmib, x.campo, x.tag]))}`);
}
{
  const l = lacunasDe(F.materiaisBons().filter(x => x.pmib !== P(2)));
  const x = l.enviar.filter(y => y.pmib === P(2));
  ok(x.length === 1 && x[0].campo === 'tag' && x[0].prioridade === 1 && x[0].paginas.length >= 1, `material sem resposta: ${JSON.stringify(x)}`);
}
{
  const ms = F.materiaisBons();
  Object.assign(ms[1], { encontrado: false, tags: [] });
  const x = lacunasDe(ms).enviar.filter(y => y.pmib === P(2));
  ok(x.length === 1 && x[0].campo === 'tag' && x[0].prioridade === 1, `encontrado false: ${JSON.stringify(x)}`);
}
{
  const ms = F.materiaisBons();
  ms[0].tags = [F.tag('GP101', 'INEXISTENTE')];
  // o motor ainda acha a área pelo documento; aqui nenhuma fonte diz a área
  const m = monta(F.respostasBoas(ms));
  m.base[0]['ÁREA/PAINEL'] = '';
  const x = R.lacunas({ m, st, indexados }).enviar.filter(y => y.pmib === P(1) && y.campo === 'area');
  ok(x.length === 1 && x[0].prioridade === 2 && x[0].tag === 'GP101' && x[0].valorLido === 'INEXISTENTE', `TAG sem área: ${JSON.stringify(x)}`);
}
{
  const ms = F.materiaisBons();
  ms[4].tags = [F.tag('ZZ999')];
  const x = lacunasDe(ms).enviar.filter(y => y.pmib === P(5) && y.campo === 'tag');
  ok(x.length === 1 && x[0].prioridade === 2 && x[0].tag === 'ZZ999', `TAG V8: ${JSON.stringify(x)}`);
}
{
  const m = monta(F.respostasBoas());
  m.base[0]['ELEVAÇÃO'] = '';
  const x = R.lacunas({ m, st, indexados }).enviar.filter(y => y.campo === 'elevacao');
  ok(x.length === 1 && x[0].prioridade === 3 && x[0].tag === m.base[0].TAG, `TAG sem elevação: ${JSON.stringify(x)}`);
}
{
  const ms = F.materiaisBons();
  ms[5].qtd_instalada = null;
  const x = lacunasDe(ms).enviar.filter(y => y.pmib === P(6));
  ok(x.length === 1 && x[0].campo === 'qtd_instalada' && x[0].prioridade === 3, `QTD: ${JSON.stringify(x)}`);
  ok(x[0] && x[0].paginas.every(p => indexados[p.k].doc.tipo !== 'MPB'), 'QTD nunca procura na lista de sobressalentes');
}
{
  const ms = F.materiaisBons().filter(x => x.pmib !== P(2));
  ms[4].qtd_instalada = null; // prioridade 3
  ms[3].tags = [F.tag('ZZ999')]; // prioridade 2
  const e = lacunasDe(ms).enviar;
  ok(e.map(x => x.prioridade).every((p, i, a) => !i || a[i - 1] <= p), `ordem: ${e.map(x => x.prioridade)}`);
  ok(e.every((x, i) => x.id === `L-${i + 1}`), `ids: ${e.map(x => x.id)}`);
}
{
  const m = monta(F.respostasBoas());
  m.pendencias.push({ PMIB: P(6), ITEM: '6', 'DESCRIÇÃO': 'x', TIPO: 'QTD', DETALHE: 'x' });
  // sem documento de material além da lista de sobressalentes: não há onde procurar a quantidade
  const soLista = indexados.filter(d => d.doc.tipo === 'MPB');
  const l = R.lacunas({ m, st, indexados: soLista });
  ok(l.semPagina.some(x => x.pmib === P(6) && x.campo === 'qtd_instalada') && !l.enviar.some(x => x.pmib === P(6)), `sem página: ${JSON.stringify(l.semPagina)}`);
}
{
  // TAG citada em 7 páginas: no máximo 5 candidatas
  const INDICE = require('../indice/indice.js');
  const muitos = [INDICE.indexaDocumento('#ST00=M00ABC10UZ010-UZ901&MPA010_lista.pdf', Array.from({ length: 7 }, (_, i) => `página ${i + 1} COD00002 GP102 bomba de circulação`), st.catalogo)];
  const m = monta(F.respostasBoas());
  m.leitura = m.leitura.map(x => (x.PMIB === P(2) ? { ...x, TAGS: '', PAIS: '', 'ÁREA': '' } : x));
  const x = R.lacunas({ m, st, indexados: muitos }).enviar.find(y => y.pmib === P(2));
  ok(x && x.paginas.length === 5, `páginas: ${x && x.paginas.length}`);
}

// ── Task 1: tarefas ──
const lacunaFicticia = (i, prioridade = 1, paginas = [{ k: 1, pagina: 1 }]) => ({ id: `L-${i}`, pmib: P(1), item: '1', descricao: 'x', codigo: 'c', campo: 'tag', tag: null, prioridade, valorLido: '', paginas });
{
  const { tarefas, sobra } = R.tarefas(Array.from({ length: 25 }, (_, i) => lacunaFicticia(i + 1)), indexados, cfg);
  ok(tarefas.map(x => x.lacunas.length).join() === '10,10,5', `25 lacunas: ${tarefas.map(x => x.lacunas.length)}`);
  ok(!sobra.length, 'sobra com 25 lacunas');
  ok(new Set(tarefas.map(x => x.sessionId)).size === 3 && tarefas[0].sessionId === 'lmr-teste-r-p1', `sessões: ${tarefas.map(x => x.sessionId)}`);
  ok(tarefas.every(x => x.etapa === 'R' && Array.isArray(x.controle) && !x.controle.length && Array.isArray(x.pmibs)), 'formato da tarefa');
  const t0 = tarefas[0];
  ok(t0.chatInput.startsWith('WORKFLOW LMR'), 'mensagem começa com WORKFLOW LMR');
  ok(t0.lacunas.every(id => t0.chatInput.includes(`${id} |`)), 'id de cada lacuna na mensagem');
  ok(t0.chatInput.includes(`### ${indexados[1].doc.arquivo} — página 1`), 'bloco da página');
  ok(t0.chatInput.includes('RESPOSTA'), 'pedido de resposta');
  ok(t0.chatInput.split(`### ${indexados[1].doc.arquivo} — página 1`).length === 2, 'página repetida aparece uma vez');
  ok(t0.caracteres === t0.chatInput.length, 'caracteres');
}
{
  const lista = Array.from({ length: 120 }, (_, i) => lacunaFicticia(i + 1, i < 100 ? 1 : 3));
  const { tarefas, sobra } = R.tarefas(lista, indexados, cfg);
  ok(tarefas.length === 10 && sobra.length === 20, `120 lacunas: ${tarefas.length} chamadas, ${sobra.length} em sobra`);
  ok(sobra.every(x => x.prioridade === 3), 'sobra fica com a menor prioridade');
}
{
  // página enorme: a chamada respeita o limite de 80 mil caracteres
  const INDICE = require('../indice/indice.js');
  const grande = [INDICE.indexaDocumento('#ST00=M00ABC10UZ010-UZ901&MPA010_lista.pdf', [`COD00001 GP101 ${'x '.repeat(50000)}`, `COD00001 GP101 ${'y '.repeat(50000)}`], st.catalogo)];
  const { tarefas } = R.tarefas([lacunaFicticia(1, 1, [{ k: 0, pagina: 1 }, { k: 0, pagina: 2 }])], grande, cfg);
  ok(tarefas.length === 1 && tarefas[0].caracteres <= 80000, `página enorme: ${tarefas.map(x => x.caracteres)}`);
}

// ── Task 2: aplica ──
const respostaR = (...recuperacoes) => [{ arquivo: 'recuperador parte 1', texto: F.texto({ etapa: 'R', parte: '1', recuperacoes }) }];
const lacunaDe = (id, pmib, campo, tag, valorLido = '') => ({ id, pmib, item: '1', descricao: 'x', codigo: 'c', campo, tag, prioridade: 1, valorLido, paginas: [{ k: 1, pagina: 1 }] });
const aplica = (materiais, lacunas, recuperacoes) => {
  const Rl = AGENTE.leRespostas(F.respostasBoas(materiais));
  return R.aplica({ respostasR: respostaR(...recuperacoes), lacunas, R: Rl, indexados });
};
const doMaterial = (r, pmib) => JSON.parse(r.resposta.texto).materiais.find(x => x.pmib === pmib);
const semMaterial = n => F.materiaisBons().filter(x => x.pmib !== P(n));
{
  const r = aplica(semMaterial(2), [lacunaDe('L-1', P(2), 'tag', null)], [{ lacuna: 'L-1', achou: true, campo: 'tag', valor: ['GP102'], papel: 'peca', evidencia: 'doc p.1', procurou: '' }]);
  const x = doMaterial(r, P(2));
  ok(x && x.encontrado === true && x.papel === 'peca' && x.tags.map(y => y.tag).join() === 'GP102', `tag recuperada: ${JSON.stringify(x)}`);
  ok(r.enviadas === 1 && r.resolvidas === 1 && !r.pendencias.length, `contagem: ${r.enviadas}/${r.resolvidas}/${r.pendencias.length}`);
  ok(JSON.parse(r.resposta.texto).etapa === 4 && JSON.parse(r.resposta.texto).parte === 'R', 'resposta sintética da etapa 4');
}
{
  const r = aplica(semMaterial(2), [lacunaDe('L-1', P(2), 'tag', null)], [{ lacuna: 'L-1', achou: true, campo: 'tag', valor: ['ZZ999'], papel: 'peca', evidencia: 'doc p.1' }]);
  ok(!r.resposta && r.resolvidas === 0, 'TAG fora do texto não entra');
  ok(r.pendencias.length === 1 && r.pendencias[0].TIPO === 'RECUPERADOR' && r.pendencias[0].DETALHE.includes('ZZ999'), `pendência: ${JSON.stringify(r.pendencias)}`);
}
{
  const ms = F.materiaisBons();
  ms[0].tags = [F.tag('ZZ999'), F.tag('GP102')];
  const r = aplica(ms, [lacunaDe('L-1', P(1), 'tag', 'ZZ999')], [{ lacuna: 'L-1', achou: true, campo: 'tag', valor: 'GP101', papel: 'proprio', evidencia: 'doc p.1' }]);
  ok(doMaterial(r, P(1)).tags.map(y => y.tag).sort().join() === 'GP101,GP102', `troca a TAG inválida: ${JSON.stringify(doMaterial(r, P(1)).tags)}`);
}
{
  const ms = F.materiaisBons();
  ms[0].tags = [{ tag: 'GP101', area: null }, { tag: 'GP102', area: 'SKID' }];
  const r = aplica(ms, [lacunaDe('L-1', P(1), 'area', 'GP101')], [{ lacuna: 'L-1', achou: true, campo: 'area', valor: 'SKID', evidencia: 'doc p.1' }]);
  const x = doMaterial(r, P(1));
  ok(x.tags.find(y => y.tag === 'GP101').area === 'SKID' && x.tags.find(y => y.tag === 'GP102').area === 'SKID', `área: ${JSON.stringify(x.tags)}`);
}
{
  const r = aplica(F.materiaisBons(), [lacunaDe('L-1', P(1), 'elevacao', 'GP101')], [{ lacuna: 'L-1', achou: true, campo: 'elevacao', valor: '98.5', evidencia: 'doc p.1' }]);
  ok(doMaterial(r, P(1)).tags[0].elevacao === '98,50', `elevação normalizada: ${JSON.stringify(doMaterial(r, P(1)).tags)}`);
  const inv = aplica(F.materiaisBons(), [lacunaDe('L-1', P(1), 'elevacao', 'GP101')], [{ lacuna: 'L-1', achou: true, campo: 'elevacao', valor: 'alta', evidencia: 'doc p.1' }]);
  ok(!inv.resposta && inv.pendencias.length === 1, 'elevação inválida vira pendência');
}
{
  const ms = F.materiaisBons();
  ms[5].qtd_instalada = null;
  const r = aplica(ms, [lacunaDe('L-1', P(6), 'qtd_instalada', null)], [{ lacuna: 'L-1', achou: true, campo: 'qtd_instalada', valor: 4, evidencia: '#ST00=M00ABC10UZ010-UZ901&MPA010 p.2' }]);
  const x = doMaterial(r, P(6));
  ok(x.qtd_instalada === 4 && x.evidencia.includes('&MPA010 p.2') && x.evidencia.includes('recuperador'), `quantidade: ${JSON.stringify(x)}`);
  const rep = aplica(ms, [lacunaDe('L-1', P(6), 'qtd_instalada', null)], [{ lacuna: 'L-1', achou: true, campo: 'qtd_instalada', valor: 4, evidencia: '#ST00=M00ABC10&MPB020 p.1' }]);
  ok(!rep.resposta && rep.pendencias.length === 1, 'quantidade da lista de sobressalentes é recusada');
}
{
  const r = aplica(semMaterial(2), [lacunaDe('L-1', P(2), 'tag', null)], [{ lacuna: 'L-1', achou: false, campo: 'tag', valor: null, evidencia: '', procurou: 'doc X p.3' }]);
  ok(r.pendencias.length === 1 && r.pendencias[0].DETALHE.includes('doc X p.3'), `não achou: ${JSON.stringify(r.pendencias)}`);
}
{
  const r = aplica(F.materiaisBons(), [lacunaDe('L-1', P(1), 'area', 'GP101')], [{ lacuna: 'L-1', achou: true, campo: 'area', valor: 'OUTRA', evidencia: 'doc p.1' }]);
  ok(!r.resposta && r.pendencias[0].DETALHE.includes('SKID'), `campo já preenchido não muda: ${JSON.stringify(r.pendencias)}`);
  const inv = aplica(F.materiaisBons(), [lacunaDe('L-1', P(1), 'area', 'GP101', 'SKID')], [{ lacuna: 'L-1', achou: true, campo: 'area', valor: 'OUTRA', evidencia: 'doc p.1' }]);
  ok(doMaterial(inv, P(1)).tags[0].area === 'OUTRA', 'valor recusado pelo motor pode ser substituído');
}
{
  const r = aplica(semMaterial(2), [lacunaDe('L-1', P(2), 'tag', null)], [{ lacuna: 'L-9', achou: true, campo: 'tag', valor: ['GP102'], papel: 'peca' }, { lacuna: 'L-1', achou: true, campo: 'area', valor: 'SKID' }]);
  ok(!r.resposta && r.resolvidas === 0 && r.pendencias.length >= 2 && r.pendencias.some(p => p.DETALHE.includes('L-9')), `lacuna desconhecida ou campo trocado: ${JSON.stringify(r.pendencias)}`);
}
{
  const r = aplica(semMaterial(2), [lacunaDe('L-1', P(2), 'tag', null)], []);
  ok(r.pendencias.length === 1 && /sem resposta do Recuperador/.test(r.pendencias[0].DETALHE), `sem resposta: ${JSON.stringify(r.pendencias)}`);
  const Rl = AGENTE.leRespostas(F.respostasBoas(semMaterial(2)));
  const q = R.aplica({ respostasR: [{ arquivo: 'r', texto: 'não é JSON' }], lacunas: [lacunaDe('L-1', P(2), 'tag', null), lacunaDe('L-2', P(1), 'elevacao', 'GP101')], R: Rl, indexados });
  ok(!q.resposta && q.pendencias.length === 2, `resposta sem JSON: ${JSON.stringify(q.pendencias)}`);
}
{
  const r = aplica(semMaterial(2), [lacunaDe('L-1', P(2), 'tag', null)], [{ lacuna: 'L-1', achou: true, campo: 'tag', valor: ['GP102'], evidencia: 'doc p.1' }]);
  ok(!r.resposta && r.pendencias.length === 1 && /papel/.test(r.pendencias[0].DETALHE), `tag sem papel: ${JSON.stringify(r.pendencias)}`);
}
{
  const ms = semMaterial(2);
  const rs = F.respostasBoas(ms);
  const a = R.aplica({ respostasR: respostaR({ lacuna: 'L-1', achou: true, campo: 'tag', valor: ['GP102'], papel: 'proprio', evidencia: 'doc p.1' }), lacunas: [lacunaDe('L-1', P(2), 'tag', null)], R: AGENTE.leRespostas(rs), indexados });
  const m = monta([...rs, a.resposta]);
  ok(m.base.some(x => x.FICHA_PMIB === P(2) && x.TAG === 'GP102' && x['ÁREA/PAINEL'] === 'SKID'), 'integração: PMIB recuperado tem linha com a TAG e a área da tabela');
  ok(R.aplica({ respostasR: [], lacunas: [], R: AGENTE.leRespostas(rs), indexados }).resposta === null, 'sem lacunas: resposta null');
}

console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exit(falhas ? 1 : 0);

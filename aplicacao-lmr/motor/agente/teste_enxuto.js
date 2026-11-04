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

// ── Task 3: validador ──
const baseBoa = () => monta(F.respostasBoas());
const valida = (base, pendencias = []) => R.valida({ base, pendencias, catalogo: st.catalogo, LMR });
{
  const m = baseBoa();
  ok(!valida(m.base, m.pendencias).length, `fixture sem violação: ${JSON.stringify(valida(m.base, m.pendencias))}`);
  const sem = m.base.filter(x => x.FICHA_PMIB !== P(2));
  const v = valida(sem);
  ok(v.length === 1 && v[0].REGRA === 'PMIB' && v[0].FICHA_PMIB === P(2), `PMIB sem linha: ${JSON.stringify(v)}`);
  ok(!valida(sem, [{ PMIB: P(2), TIPO: 'LEITURA', DETALHE: 'não achou' }]).length, 'PMIB sem linha com motivo não trava');
}
for (const campo of ['ÁREA/PAINEL', 'ELEVAÇÃO', 'EIXO', 'LOCAL', 'RDS-PP', 'TRECHOS', 'QTD POR TRECHO']) {
  const m = baseBoa();
  m.base[0][campo] = '';
  const v = valida(m.base).filter(x => x.REGRA === 'CAMPO');
  ok(v.length === 1 && v[0].DETALHE.includes(campo) && v[0]['LINHA DA BASE'] === 1, `${campo} vazio: ${JSON.stringify(v)}`);
  ok(!valida(m.base, [{ PMIB: P(1), TIPO: 'ÁREA', DETALHE: 'x' }]).length, `${campo} vazio com pendência do PMIB não trava`);
  ok(!valida(m.base, [{ PMIB: '', 'DESCRIÇÃO': 'ÁREA SKID', TIPO: 'ÁREA', DETALHE: 'x' }]).filter(x => x.REGRA === 'CAMPO' && campo !== 'ÁREA/PAINEL').length, `${campo} vazio com pendência da área não trava`);
}
{
  const m = baseBoa();
  Object.assign(m.base[5], { PAIS: 'GP101 | #ST[XX]=M[XX]ABC10UZ010-UZ001', 'ÁREA/PAINEL': '', 'RDS-PP': '' });
  ok(!valida(m.base).filter(x => x.REGRA === 'CAMPO').length, 'linha com PAIS dispensa área e RDS-PP');
}
{
  const m = baseBoa();
  m.base[0]['ELEVAÇÃO'] = '98.5';
  ok(!valida(m.base).length && m.base[0]['ELEVAÇÃO'] === '98,50', 'elevação corrigível é corrigida na linha');
  m.base[0]['ELEVAÇÃO'] = 'abc';
  ok(valida(m.base).some(x => x.REGRA === 'FORMATO' && /elevação/.test(x.DETALHE)), 'elevação inválida');
}
for (const [campo, valor, rx] of [['EIXO', 'XY', /eixo/], ['TRECHOS', 'U-99', /trecho/i], ['RDS-PP', 'ABC10UZ010-UZ001', /RDS/], ['RDS-PP', '#ST[XX]=M[XX]ABC10UZ010[XX]', /\[XX\]/]]) {
  const m = baseBoa();
  m.base[0][campo] = valor;
  ok(valida(m.base).some(x => x.REGRA === 'FORMATO' && rx.test(x.DETALHE)), `${campo}=${valor}: ${JSON.stringify(valida(m.base))}`);
}
{
  // formato é conferido também na linha sem QTD (o motor não gera a aplicação dela)
  const m = baseBoa();
  Object.assign(m.base[5], { 'QTD POR TRECHO': '', EIXO: 'XY' });
  ok(valida(m.base, [{ PMIB: P(6), TIPO: 'QTD', DETALHE: 'x' }]).some(x => x.REGRA === 'FORMATO' && /eixo/.test(x.DETALHE)), 'formato em linha sem QTD');
}
{
  const m = baseBoa();
  m.base[0].LOCAL = 'OUTRO LOCAL ESCRITO';
  ok(!valida(m.base).length, 'local fora da lista não trava (a spec não pede; a lista fechada ainda é pendência da equipe)');
}
// ── Task 3: pendências de área e bloqueio ──
{
  const m = baseBoa();
  m.base[0].LOCAL = ''; m.base[1].LOCAL = '';
  const p = R.pendenciasDeArea(m.base, []);
  ok(p.length === 1 && p[0].TIPO === 'ÁREA' && p[0]['DESCRIÇÃO'] === 'ÁREA SKID' && p[0].DETALHE.includes('LOCAL'), `pendência por área: ${JSON.stringify(p)}`);
  ok(!R.pendenciasDeArea(m.base, p).length, 'não duplica a que já existe');
  ok(!R.valida({ base: m.base, pendencias: p, catalogo: st.catalogo, LMR }).length, 'área em branco com a pendência gerada não trava');
  const b = R.abasDoBloqueio([{ REGRA: 'CAMPO', 'LINHA DA BASE': 1, FICHA_PMIB: P(1), DETALHE: 'x' }], [{ CHAMADA: 'c', ERRO: '' }]);
  ok(b.map(x => x.nome).join() === 'VIOLAÇÕES,CHAMADAS DO AGENTE' && b[0].linhas.length === 1 && b[1].linhas.length === 1, `abas do bloqueio: ${JSON.stringify(b.map(x => x.nome))}`);
}
// ── Task 3: checaResposta ──
{
  const c = R.checaResposta;
  ok(!c({ output: 'Li tudo {sem chaves}.\n```json\n{"etapa":1}\n```\nFim.' }).error, 'JSON em bloco com texto em volta');
  ok(!c({ output: 'Aqui: {"etapa":1} pronto' }).error, 'JSON sem bloco');
  ok(!c({ output: '{}' }).error, 'resposta da chamada vazia');
  ok(!c({ output: { etapa: 1 } }).error, 'output já é objeto');
  ok(/temporar/.test((c({ output: '```json\n{"etapa":1,"tags":[{"tag":"GP' }).error || {}).message), 'JSON cortado');
  ok(/temporar/.test((c({ output: '' }).error || {}).message), 'resposta vazia');
  const j = { error: { message: 'modelo não configurado' } };
  ok(c(j).error.message === 'modelo não configurado', 'erro existente fica intacto');
  ok(c({ output: '{}', sessionId: 's' }).sessionId === 's', 'mantém os outros campos');
}

// ── Task 4: workflow gerado ──
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const wf = require('../workflows/LMR_A_enxuto.json');
const NO = new Map(wf.nodes.map(n => [n.name, n]));
const LOOPS = ['E1', 'E23', 'E4', 'R'];
ok(wf.nodes.length >= 54 && wf.nodes.length <= 62, `nós: ${wf.nodes.length}`);
for (const n of ['Guarda E4', 'Planeja R', 'Lote R', 'Pausa R', 'Agente R', 'Erro? R', 'Conta tentativas R', 'Desiste? R', 'Pausa longa R', 'Confere R', 'Monta Base', 'Entrega a Base', ...LOOPS.map(s => `Checa ${s}`)]) ok(NO.has(n), `nó ${n}`);
const agenteDe = s => { const n = NO.get(`Agente ${s}`); return n && JSON.parse(n.parameters.agentId.value); };
for (const [s, nome] of [['E1', 'Leitor LMR'], ['E23', 'Leitor LMR'], ['E4', 'Ligador LMR'], ['R', 'Recuperador LMR']]) {
  ok(agenteDe(s) && agenteDe(s).agentName === nome && agenteDe(s).model === 'bedrock-claude-sonnet-5.5', `agente de ${s}: ${JSON.stringify(agenteDe(s))}`);
}
const liga = (de, para, saida = 0) => ((wf.connections[de] || { main: [] }).main[saida] || []).some(x => x.node === para);
ok(liga('Lote E4', 'Guarda E4', 0) && liga('Guarda E4', 'Planeja R') && liga('Planeja R', 'Lote R') && liga('Lote R', 'Monta Base', 0) && liga('Monta Base', 'Entrega a Base'), 'ligações do fim do fluxo');
ok(!liga('Lote E4', 'Monta Base', 0), 'Lote E4 não vai direto para Monta Base');
for (const s of LOOPS) ok(liga(`Agente ${s}`, `Checa ${s}`) && liga(`Checa ${s}`, `Erro? ${s}`) && !liga(`Agente ${s}`, `Erro? ${s}`), `Checa no loop ${s}`);
ok(wf.nodes.every(n => !n.credentials), 'sem credencial no JSON');
const leiaMe = wf.nodes.find(n => n.type === 'n8n-nodes-base.stickyNote').parameters.content;
ok(['Leitor LMR', 'Ligador LMR', 'Recuperador LMR'].every(x => leiaMe.includes(x)), 'Leia-me cita os 3 agentes');
ok(wf.nodes.every(n => !String(n.parameters.jsCode || '').includes('\r')), 'código sem CR');
ok(NO.get('Planeja R').parameters.jsCode.includes('RECUPERACAO.tarefas(l.enviar, indexados, cfg, aa.areas)'), 'Planeja R passa as áreas');
{
  // os workflows antigos ficam iguais; só os UUIDs mudam ao gerar de novo
  const pasta = path.join(__dirname, '..', 'workflows');
  const norm = s => s.replace(/\\r\\n/g, '\\n').replace(/\r\n/g, '\n').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'U');
  const doGit = execFileSync('git', ['show', 'HEAD:aplicacao-lmr/motor/workflows/LMR_A_agente_amp.json'], { encoding: 'utf8', cwd: pasta, maxBuffer: 1 << 28 });
  ok(norm(fs.readFileSync(path.join(pasta, 'LMR_A_agente_amp.json'), 'utf8')) === norm(doGit), 'LMR_A_agente_amp.json mudou além dos UUIDs');
}

// ── Revisão final: casos que o motor produz sozinho e não podem travar a entrega ──
const montaCfg = (c, respostas = F.respostasBoas()) => AGENTE.montaBaseDoAgente({ LMR, statusRows, indexados, cfg: { ...cfg, ...c }, controle: [], respostas, semTexto: false, etapasSemPaginas: [3] });
{
  // fora de UG o RDS-PP é o do documento
  const m = montaCfg({ trechos: 'LISTA', listaTrechos: ['AMD-03', 'AMC-02'] });
  const base = R.rdsForaDeUg(m.base);
  ok(base.length === m.base.length && base.every(r => r['RDS-PP'] === '#ST00=M00ABC10UZ010-UZ001'), `AMD/AMC literal: ${JSON.stringify(base.map(r => r['RDS-PP']))}`);
  const v = R.valida({ base, pendencias: m.pendencias, catalogo: st.catalogo, LMR });
  ok(!v.length, `AMD/AMC não trava: ${JSON.stringify(v.slice(0, 2))}`);
  const mista = montaCfg({ trechos: 'LISTA', listaTrechos: ['U-01', 'AMD-03'] });
  const b2 = R.rdsForaDeUg(mista.base);
  ok(b2.length === 2 * mista.base.length && b2.every((r, i) => r.LINHA === i + 1), `linha mista divide: ${b2.length}`);
  ok(b2.filter(r => r.TRECHOS === 'U-01').every(r => /\[XX\]/.test(r['RDS-PP'])) && b2.filter(r => r.TRECHOS === 'AMD-03').every(r => r['RDS-PP'].startsWith('#ST00=M00')), 'UG mantém [XX], AMD fica literal');
  const v2 = R.valida({ base: b2, pendencias: mista.pendencias, catalogo: st.catalogo, LMR });
  ok(!v2.length, `linha mista não trava: ${JSON.stringify(v2.slice(0, 2))}`);
  const so = montaCfg({});
  ok(JSON.stringify(R.rdsForaDeUg(so.base)) === JSON.stringify(so.base), 'só UG fica igual');
}
{
  // valor que nem tem a forma de RDS-PP sai da linha e vira pendência da área; M inválido continua travando
  const m = baseBoa();
  for (const r of m.base) r['RDS-PP'] = 'ABC10UZ010-UZ001';
  const p = R.limpaRdsSemForma(m.base);
  ok(p.length === 1 && p[0].TIPO === 'ÁREA' && p[0]['DESCRIÇÃO'] === 'ÁREA SKID' && p[0].DETALHE.includes('ABC10UZ010-UZ001'), `RDS-PP sem forma: ${JSON.stringify(p)}`);
  ok(m.base.every(r => !r['RDS-PP']) && !valida(m.base, p).length, 'RDS-PP sem forma com pendência não trava');
  const f = baseBoa();
  f.base[0]['RDS-PP'] = '#ST00=F00ABC10UZ010-UZ001';
  ok(!R.limpaRdsSemForma(f.base).length && !valida(f.base).length, `outra letra no lugar do M: ${JSON.stringify(valida(f.base))}`);
  const x = baseBoa();
  x.base[0]['RDS-PP'] = '#ST00=M99ABC10UZ010-UZ001';
  ok(!R.limpaRdsSemForma(x.base).length && valida(x.base).some(y => y.REGRA === 'FORMATO'), 'M inválido continua travando');
}
{
  // filho documental de pai sem área: a linha sai sem local, elevação e eixo
  const m = baseBoa();
  Object.assign(m.base[5], { PAIS: 'GP101 | #ST[XX]=M[XX]ABC10UZ010-UZ001', 'ÁREA/PAINEL': '', 'RDS-PP': '', LOCAL: '', 'ELEVAÇÃO': '', EIXO: '' });
  const p = R.pendenciasDeLinha({ base: m.base, pendencias: [], catalogo: st.catalogo, areas: m.areas });
  ok(p.length === 1 && p[0].PMIB === P(6) && p[0].TIPO === 'ÁREA', `linha sem área: ${JSON.stringify(p)}`);
  ok(!valida(m.base, p).length, 'linha sem área com pendência não trava');
  ok(!R.pendenciasDeLinha({ base: m.base, pendencias: p, catalogo: st.catalogo, areas: m.areas }).length, 'não duplica');
}
{
  // material de 60 Hz em projeto só de 50 Hz: TRECHOS vazio
  const ms = F.materiaisBons();
  ms[0].frequencia = '60';
  const m = montaCfg({ trechos: 'LISTA', listaTrechos: ['U-01', 'U-02'] }, F.respostasBoas(ms));
  ok(m.base.some(r => r.FICHA_PMIB === P(1) && !r.TRECHOS), 'fixture: linha sem TRECHOS');
  const p = R.pendenciasDeLinha({ base: m.base, pendencias: m.pendencias, catalogo: st.catalogo, areas: m.areas });
  ok(p.length === 1 && p[0].PMIB === P(1) && p[0].TIPO === 'FREQUÊNCIA', `sem trecho: ${JSON.stringify(p)}`);
  ok(!R.valida({ base: m.base, pendencias: [...m.pendencias, ...p], catalogo: st.catalogo, LMR }).length, 'sem trecho com pendência não trava');
}
{
  // RDS-PP por frequência sem trecho no grupo: a linha some no motor; só nesse caso o PMIB sem linha ganha motivo
  const sem = baseBoa().base.filter(x => x.FICHA_PMIB !== P(2));
  const p = R.pendenciasDeLinha({ base: sem, pendencias: [], catalogo: st.catalogo, areas: [{ nome: 'SKID', rds: '#ST[F]=M[F]ABC10UZ010-UZ001' }] });
  ok(p.length === 1 && p[0].PMIB === P(2) && p[0].TIPO === 'FREQUÊNCIA', `[F] sem trecho: ${JSON.stringify(p)}`);
  ok(!R.pendenciasDeLinha({ base: sem, pendencias: [], catalogo: st.catalogo, areas: [{ nome: 'SKID', rds: '#ST00=M00ABC10UZ010-UZ001' }] }).length, 'PMIB sem linha por outro motivo continua no Validador');
}
{
  // filho documental com linha completa não é material sem posição
  const m = monta(F.respostasBoas());
  m.leitura = m.leitura.map(x => (x.PMIB === P(6) ? { ...x, TAGS: '', PAIS: '', 'ÁREA': '' } : x));
  m.base.find(r => r.FICHA_PMIB === P(6)).PAIS = 'GP101 | #ST[XX]=M[XX]ABC10UZ010-UZ001';
  const l = R.lacunas({ m, st, indexados });
  ok(![...l.enviar, ...l.semPagina].some(y => y.pmib === P(6) && y.campo === 'tag'), `lacuna falsa em filho documental: ${JSON.stringify(l.enviar.map(y => [y.pmib, y.campo]))}`);
}
{
  // quantidade da lista de sobressalentes é recusada pelo motor; o Recuperador acha a instalada
  const ms = F.materiaisBons();
  Object.assign(ms[5], { qtd_instalada: 8, evidencia: '#ST00=M00ABC10&MPB020 p.1' });
  const r = aplica(ms, [lacunaDe('L-1', P(6), 'qtd_instalada', null)], [{ lacuna: 'L-1', achou: true, campo: 'qtd_instalada', valor: 4, evidencia: '#ST00=M00ABC10UZ010-UZ901&MPA010 p.2' }]);
  ok(r.resolvidas === 1 && r.resposta && doMaterial(r, P(6)).qtd_instalada === 4, `quantidade recusada é trocada: ${JSON.stringify(r.pendencias)}`);
  const linha = r.resposta && monta([...F.respostasBoas(ms), r.resposta]).base.find(x => x.FICHA_PMIB === P(6));
  ok(linha && Number(linha['QTD POR TRECHO']) === 4, `quantidade chega à Base: ${JSON.stringify(linha)}`);
}
{
  // TAG em vários materiais: uma lacuna só, aplicada a todos; quantidade vem antes de elevação
  const ms = F.materiaisBons();
  ms[5].qtd_instalada = null;
  const m = monta(F.respostasBoas(ms));
  for (const r of m.base) if (r.TAG === 'GP101') r['ELEVAÇÃO'] = '';
  const e = R.lacunas({ m, st, indexados }).enviar;
  const elev = e.filter(y => y.campo === 'elevacao');
  ok(elev.length === 1 && elev[0].pmibs && [...elev[0].pmibs].sort().join() === [P(1), P(3)].join(), `elevação por TAG: ${JSON.stringify(elev)}`);
  ok(e.findIndex(y => y.campo === 'qtd_instalada') < e.findIndex(y => y.campo === 'elevacao'), `quantidade antes de elevação: ${e.map(y => y.campo)}`);
  const a = monta(F.respostasBoas());
  for (const r of a.base) if (r.TAG === 'GP101') r['ÁREA/PAINEL'] = '';
  const area = R.lacunas({ m: a, st, indexados }).enviar.filter(y => y.campo === 'area');
  ok(area.length === 1 && area[0].pmibs && area[0].pmibs.length === 2, `área por TAG: ${JSON.stringify(area)}`);
  const r = aplica(F.materiaisBons(), [{ ...lacunaDe('L-1', P(1), 'elevacao', 'GP101'), pmibs: [P(1), P(3)] }], [{ lacuna: 'L-1', achou: true, campo: 'elevacao', valor: '98.5', evidencia: 'doc p.1' }]);
  ok(r.resolvidas === 1 && r.resposta && [P(1), P(3)].every(p => doMaterial(r, p) && doMaterial(r, p).tags[0].elevacao === '98,50'), `vale para todos os materiais da TAG: ${JSON.stringify(r.pendencias)}`);
}
{
  // o Recuperador recebe os nomes das áreas quando procura área
  const com = R.tarefas([lacunaDe('L-1', P(1), 'area', 'GP101')], indexados, cfg, [{ nome: 'SKID' }, { nome: 'GALERIA' }]);
  ok(/ÁREAS VÁLIDAS[^\n]*SKID[^\n]*GALERIA/.test(com.tarefas[0].chatInput), 'lista de áreas na mensagem');
  ok(!/ÁREAS VÁLIDAS/.test(R.tarefas([lacunaDe('L-1', P(1), 'tag', null)], indexados, cfg, [{ nome: 'SKID' }]).tarefas[0].chatInput), 'sem lacuna de área, sem lista');
  ok(/ÁREAS VÁLIDAS/.test(fs.readFileSync(path.join(__dirname, 'kb', 'recuperador_regras.md'), 'utf8')), 'regra do Recuperador cita a lista');
}

// ── Task 5: Knowledge base e prompts dos agentes novos ──
{
  const pasta = __dirname;
  const le = (...p) => { try { return fs.readFileSync(path.join(pasta, ...p), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } };
  const glossario = le('regras_lmr.md').split(/^## /m).find(s => s.startsWith('2. Glossário'));
  for (const a of ['ligador_regras.md', 'recuperador_regras.md']) ok(glossario && le('kb', a).includes(glossario.trim()), `glossário em ${a}`);
  ok(le('kb', 'ligador_regras.md').includes('Etapa 4') && !le('kb', 'ligador_regras.md').includes('Etapa 1'), 'ligador_regras só com a etapa 4');
  ok(le('kb', 'ligador_formatos.md').includes('Etapa 4') && !le('kb', 'ligador_formatos.md').includes('Etapa 1'), 'ligador_formatos só com a etapa 4');
  ok(/recuperacoes/.test(le('kb', 'recuperador_formatos.md')) && /papel/.test(le('kb', 'recuperador_formatos.md')), 'formato do Recuperador');
  ok(/só preenche|Nunca altere/i.test(le('kb', 'recuperador_regras.md')), 'regra de não alterar');
  for (const a of ['system_prompt_ligador.md', 'system_prompt_recuperador.md']) for (const x of ['WORKFLOW LMR', 'bloco ```json', 'Use só o que está escrito']) ok(le(a).includes(x), `${a} cita ${x}`);
  // o Leitor LMR e o workflow antigo seguem com os arquivos de sempre
  const iguais = execFileSync('git', ['status', '--short', '--', 'system_prompt.md', 'regras_lmr.md', 'formatos_json.md'], { encoding: 'utf8', cwd: pasta });
  ok(!iguais.trim(), `arquivos do Leitor mudaram: ${iguais}`);
}

const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const copia = o => JSON.parse(JSON.stringify(o));
const rotuloDe = ini => NO.get('Formulário').parameters.formFields.values.find(c => c.fieldLabel.startsWith(ini)).fieldLabel;
const form = { [rotuloDe('Escopo')]: 'UG', [rotuloDe('Subsistema')]: 'FICTICIO', [rotuloDe('Trechos')]: 'TODAS', [rotuloDe('Lista de trechos')]: '', [rotuloDe('Eixo')]: 'CD',
  [rotuloDe('Frequência')]: 'Ambas (50 e 60 Hz)', [rotuloDe('Kits')]: 'Levam a TAG do equipamento', [rotuloDe('Peças')]: 'Levam a TAG do equipamento', [rotuloDe('Conferir')]: 'Não', [rotuloDe('Especificação')]: '', [rotuloDe('Etapa de documentos')]: '' };

// imita o n8n nó a nó com o código do próprio workflow; responde(tarefa) devolve o texto do agente ou { error }
async function simula(responde, opcoes = {}) {
  const s = { 'Formulário': [{ json: { ...form, ...opcoes }, binary: { a: { fileName: 'x.pdf' }, b: { fileName: 'x_STATUS_PMIB - Fictício.xlsx' } } }], 'Lê Status PMIB': statusRows.map(row => ({ json: { row } })), 'Lê BASE (gabarito)': [] };
  let atual = null;
  const $ = no => ({ all: () => s[no] || [], first: ramo => (ramo === 1 && /^Lote /.test(no) ? atual : (s[no] || [])[0]), itemMatching: () => { if (/^Lote /.test(no)) return atual; throw new Error('sem pareamento'); } });
  const exec = (nome, entrada, runIndex = 0) => new AsyncFn('$', '$input', '$execution', '$runIndex', NO.get(nome).parameters.jsCode)($, { all: () => entrada, first: () => entrada[0] }, { id: 77 }, runIndex).then(copia);
  const chamadas = [];
  let runs = 0;
  const loop = async (sufixo, planeja) => {
    const voltas = [];
    for (const tf of s[planeja]) {
      atual = tf;
      let saida;
      for (;;) {
        const r = tf.json.vazia ? '{}' : await responde(tf.json);
        chamadas.push(tf.json);
        const ag = r && r.error ? { json: { error: r.error } } : { json: { sessionId: tf.json.sessionId, output: r, files: [] } };
        const [checado] = await exec(`Checa ${sufixo}`, [ag]);
        if (!checado.json.error) { saida = checado; break; }
        const [c] = await exec(`Conta tentativas ${sufixo}`, [checado], runs++);
        if (c.json.desistir) { saida = c; break; }
      }
      voltas.push(...await exec(`Confere ${sufixo}`, [saida]));
    }
    runs = 0;
    return voltas;
  };
  s['Junta índice'] = [{ json: { indexados: copia(indexados) } }];
  s['Planeja E1'] = await exec('Planeja E1', s['Junta índice']);
  s['Guarda E1'] = await exec('Guarda E1', await loop('E1', 'Planeja E1'));
  s['Planeja E2/E3'] = await exec('Planeja E2/E3', s['Guarda E1']);
  s['Guarda E23'] = await exec('Guarda E23', await loop('E23', 'Planeja E2/E3'));
  s['Prepara áreas'] = await exec('Prepara áreas', s['Guarda E23']);
  s['Aplica áreas'] = await exec('Aplica áreas', s['Prepara áreas']);
  s['Planeja E4'] = await exec('Planeja E4', s['Aplica áreas']);
  s['Guarda E4'] = await exec('Guarda E4', await loop('E4', 'Planeja E4'));
  s['Planeja R'] = await exec('Planeja R', s['Guarda E4']);
  const [b] = await exec('Monta Base', await loop('R', 'Planeja R'));
  const expr = v => new Function('$json', `return (${String(v).replace(/^=\{\{/, '').replace(/\}\}$/, '')});`)(b.json);
  const p = NO.get('Entrega a Base').parameters;
  return { b, chamadas, planejaR: s['Planeja R'], titulo: expr(p.completionTitle), mensagem: expr(p.completionMessage) };
}
const abasDoXlsx = b => {
  const bytes = Buffer.from(b.binary.data.data, 'base64');
  const s = bytes.toString('latin1');
  return [...new Set([...Buffer.from(s, 'latin1').toString('utf8').matchAll(/<sheet [^>]*name="([^"]+)"/g)].map(x => x[1]))];
};
// agente fictício: cada etapa responde o certo; depois de cada Teste só muda o que cada um pede
const blocos = () => { const [e1, e2, e4] = F.respostasBoas(); return { e1: e1.texto, e2: e2.texto, materiais: F.materiaisBons() }; };
const agenteBom = (ajusta = {}) => tf => {
  const { e1, e2, materiais } = blocos();
  if (tf.etapa === 1) return e1;
  if (tf.etapa === 2 || tf.etapa === 3) return e2;
  if (tf.etapa === 4) return (ajusta.e4 || (t2 => F.texto({ etapa: 4, parte: t2.parte, materiais: materiais.filter(m => t2.pmibs.includes(m.pmib)) })))(tf, materiais);
  return (ajusta.r || (() => F.texto({ etapa: 'R', parte: tf.parte, recuperacoes: [] })))(tf);
};

(async () => {
  {
    const x = await simula(agenteBom());
    ok(x.planejaR.length === 1 && x.planejaR[0].json.vazia === true, `sem lacunas, item vazia: ${x.planejaR.length}`);
    ok(x.b.binary.data.fileName === 'BASE LMR - Fictício.xlsx' && !x.b.json.bloqueada, `Base sai: ${x.b.binary.data.fileName} ${JSON.stringify(x.b.json.primeiras || '')}`);
    ok(x.titulo === 'BASE LMR gerada' && /6 linhas/.test(x.mensagem), `mensagem: ${x.titulo} | ${x.mensagem}`);
    ok(/Leitor \d+/.test(x.mensagem) && /Ligador \d+/.test(x.mensagem) && /Recuperador 0/.test(x.mensagem), `chamadas por agente: ${x.mensagem}`);
  }
  {
    const x = await simula(agenteBom({
      e4: (tf, ms) => F.texto({ etapa: 4, parte: tf.parte, materiais: ms.filter(m => tf.pmibs.includes(m.pmib) && m.pmib !== P(2)) }),
      r: tf => F.texto({ etapa: 'R', parte: tf.parte, recuperacoes: tf.lacunas.map(lacuna => ({ lacuna, achou: true, campo: 'tag', valor: ['GP102'], papel: 'proprio', evidencia: '#ST00=M00ABC10UZ010-UZ901&MPA010 p.1', procurou: '' })) }),
    }));
    ok(x.b.json.lacunasEnviadas === 1 && x.b.json.lacunasResolvidas === 1, `lacunas: ${x.b.json.lacunasEnviadas}/${x.b.json.lacunasResolvidas}`);
    ok(/1 lacunas? enviadas?.*1 resolvidas?/.test(x.mensagem), `mensagem conta as lacunas: ${x.mensagem}`);
    ok(x.b.binary.data.fileName.startsWith('BASE') && x.b.json.linhasBase === 6, `linha recuperada: ${x.b.json.linhasBase}`);
    ok(x.chamadas.some(t2 => t2.etapa === 'R' && t2.chatInput.includes(P(2))), 'Recuperador recebeu o PMIB');
  }
  {
    const x = await simula(agenteBom({
      e4: (tf, ms) => F.texto({ etapa: 4, parte: tf.parte, materiais: ms.filter(m => tf.pmibs.includes(m.pmib) && m.pmib !== P(2)) }),
      r: () => ({ error: { message: '424 - runtime' } }),
    }));
    ok(x.b.binary.data.fileName.startsWith('BASE'), `Recuperador falhou, Base sai: ${x.b.binary.data.fileName}`);
    ok(x.b.json.falhas === 1 && /CHAMADA/.test(x.b.json.tipos) && /RECUPERADOR/.test(x.b.json.tipos), `pendências: ${x.b.json.falhas} ${x.b.json.tipos}`);
  }
  {
    // JSON cortado na E4: repete; depois da última tentativa os PMIBs do lote viram lacunas
    let vezes = 0;
    const x = await simula(agenteBom({
      e4: () => { vezes++; return '```json\n{"etapa":4,"materiais":[{"pmib":"45'; },
      r: tf => F.texto({ etapa: 'R', parte: tf.parte, recuperacoes: [] }),
    }));
    ok(vezes > 1, `JSON cortado repete: ${vezes} tentativas`);
    ok(x.chamadas.some(t2 => t2.etapa === 'R' && !t2.vazia && t2.chatInput.includes(P(1))), 'PMIBs do lote viram lacunas');
    ok(x.b.json.falhas >= 1, `chamada com falha: ${x.b.json.falhas}`);
  }
  {
    // violação que passa pelo fluxo inteiro: o motor aceita o RDS-PP lido e o Validador acusa o M inválido
    const y = await simulaComAreas(agenteBom());
    ok(y.b.json.bloqueada === true && y.b.binary.data.fileName === 'BLOQUEIO LMR - Fictício.xlsx', `bloqueio: ${y.b.binary.data.fileName}`);
    const abas = abasDoXlsx(y.b);
    ok(abas.includes('VIOLAÇÕES') && abas.includes('CHAMADAS DO AGENTE') && !abas.includes('BASE'), `abas do bloqueio: ${abas}`);
    ok(y.titulo === 'BASE LMR bloqueada' && /violaç/.test(y.mensagem), `mensagem de bloqueio: ${y.titulo} | ${y.mensagem}`);
  }
  {
    // resposta cortada em todas as tentativas: o que veio inteiro é aproveitado e só o resto vira lacuna
    const x = await simula(agenteBom({
      e4: (tf, ms) => `\`\`\`json\n{"etapa":4,"materiais":[${ms.filter(m => tf.pmibs.includes(m.pmib) && m.pmib !== P(2)).map(m => JSON.stringify(m)).join(',')},{"pmib":"${P(2)}","tags":[{"ta`,
    }));
    const lacunasR = x.chamadas.filter(t2 => t2.etapa === 'R' && !t2.vazia).flatMap(t2 => t2.lacunasEnviadas);
    ok(lacunasR.length && lacunasR.every(l => l.pmib === P(2)), `só o material cortado vira lacuna: ${JSON.stringify(lacunasR.map(l => l.pmib))}`);
    ok(x.b.json.falhas >= 1 && x.b.binary.data.fileName.startsWith('BASE'), `aproveita o corte e registra a falha: ${x.b.json.falhas} ${x.b.binary.data.fileName}`);
    ok(/Ligador 1 \(1 sem resposta\)/.test(x.mensagem) && /Recuperador \d+ ·/.test(x.mensagem), `falha no agente certo: ${x.mensagem}`);
  }
  {
    // projeto só de AMD/AMC passa pelo fluxo inteiro e sai com o RDS-PP do documento
    const x = await simula(agenteBom(), { [rotuloDe('Trechos')]: 'LISTA', [rotuloDe('Lista de trechos')]: 'AMD-03, AMC-02' });
    ok(x.b.binary.data.fileName.startsWith('BASE') && !x.b.json.bloqueada, `AMD/AMC entrega a Base: ${x.mensagem}`);
  }
  {
    // valor sem a forma de RDS-PP na área: a Base sai, com a pendência da área
    const x = await simula(tf => (tf.etapa === 1 ? F.texto({ etapa: 1, parte: tf.parte, areas: [{ nome: 'SKID', rds: 'ABC10UZ010-UZ001', local: 'CASA DE FORÇA', elevacao: '98,50', eixo: 'CD', trechos: [], evidencia: 'x' }] }) : agenteBom()(tf)));
    ok(x.b.binary.data.fileName.startsWith('BASE') && /ÁREA/.test(x.b.json.tipos), `RDS-PP sem forma entrega a Base: ${x.mensagem}`);
  }
  {
    // a mensagem final diz tudo, na entrega e no bloqueio
    const b = await simula(agenteBom());
    ok(/6 com linha/.test(b.mensagem) && /0 com pendência/.test(b.mensagem), `PMIBs na mensagem: ${b.mensagem}`);
    const f = await simula(agenteBom({ r: () => ({ error: { message: '424 - runtime' } }), e4: (tf, ms) => F.texto({ etapa: 4, parte: tf.parte, materiais: ms.filter(m => tf.pmibs.includes(m.pmib) && m.pmib !== P(2)) }) }));
    ok(/Recuperador 1 \(1 sem resposta\)/.test(f.mensagem), `falha por agente: ${f.mensagem}`);
    const y = await simulaComAreas(agenteBom());
    ok(/com linha/.test(y.mensagem) && /Leitor \d+/.test(y.mensagem) && /lacunas enviadas/.test(y.mensagem) && /controle:/.test(y.mensagem), `bloqueio traz os números: ${y.mensagem}`);
  }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

// o mesmo fluxo, com um RDS-PP de M inválido vindo da leitura da área
async function simulaComAreas(responde) {
  return simula(tf => {
    if (tf.etapa !== 1) return responde(tf);
    return F.texto({ etapa: 1, parte: tf.parte, areas: [{ nome: 'SKID', rds: '#ST00=M99ABC10UZ010-UZ001', local: 'CASA DE FORÇA', elevacao: '98,50', eixo: 'CD', trechos: [], evidencia: 'x' }] });
  });
}

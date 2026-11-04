/*
 * Regressão da Fase 1 contra os 5 exemplos.
 * Uso: node teste_fase1.js   (depois de python -X utf8 extrair.py)
 * Grava saida/fase1_resultado.json com os detalhes para o relatório.
 */
const fs = require('fs');
const path = require('path');
const L = require('./lmr');

const DADOS = path.join(__dirname, 'dados');
const SAIDA = path.join(__dirname, 'saida');
fs.mkdirSync(SAIDA, { recursive: true });
const ler = n => JSON.parse(fs.readFileSync(path.join(DADOS, n + '.json'), 'utf8'));

// escopo/subsistema como aparecem no estilo antigo de cada aplicação
const APPS = {
  agua_pura: { escopo: 'UG', subsistema: 'Água Pura' },
  aeracao: { escopo: 'AERAÇÃO AXIAL DA TURBINA', subsistema: 'UH' },
  ccar: { escopo: 'RV', subsistema: 'UG', subsistemaNaTag: 'UG' },
  regvel: { escopo: 'RV', subsistema: 'UH' },
  sfc: { escopo: 'SFC', subsistema: null },
};

let falhas = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'OK  ' : 'FALHA'} ${msg}`); if (!cond) falhas++; };
const multiset = arr => arr.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
const difMultiset = (a, b) => { const out = []; for (const [k, v] of a) { const d = v - (b.get(k) || 0); if (d > 0) out.push([k, d]); } return out; };
const resultado = {};

// ── T1 Catálogo ──
console.log('\nT1  Status PMIB → CATÁLOGO + RELAÇÕES documentais');
const esperado = { agua_pura: 87, aeracao: 14, ccar: 57, regvel: 141, sfc: 41 };
const status = {};
for (const n of Object.keys(APPS)) {
  const s = L.lerStatusPmib(ler('status_' + n).linhas);
  status[n] = s;
  ok(s.catalogo.length === esperado[n], `${n}: ${s.catalogo.length} PMIBs válidos (esperado ${esperado[n]}), lista ${s.lista} rev. ${s.revisao}, ${s.relacoes.length} relações, ${s.agrupadores.length} agrupadores, ${s.avisos.length} avisos`);
}
const todos = Object.values(status).flatMap(s => s.catalogo.map(c => c.pmib));
ok(new Set(todos).size === todos.length, `nenhum PMIB repetido entre os 5 Status (${todos.length})`);
const rv = status.regvel.relacoes;
const filhosDe = p => rv.filter(r => r.pmibPai.endsWith(p)).map(r => r.pmibFilho.slice(-4));
const paisDe = p => rv.filter(r => r.pmibFilho.endsWith(p)).map(r => r.pmibPai.slice(-4));
ok(filhosDe('.0808').length > 0, `Reg. Vel. 0808 (conjunto de vedações) tem filhos: ${filhosDe('.0808').join(', ')}`);
ok(paisDe('.1131').length >= 2, `Reg. Vel. 1131 tem vários pais: ${paisDe('.1131').join(', ')}`);
ok(paisDe('.1150').length >= 1 && filhosDe('.1150').length >= 1, `Reg. Vel. 1150 é pai e filho (pais ${paisDe('.1150')}; filhos ${filhosDe('.1150')})`);
resultado.catalogo = Object.fromEntries(Object.entries(status).map(([n, s]) => [n, { pmibs: s.catalogo.length, relacoes: s.relacoes.length, agrupadores: s.agrupadores.map(a => `${a.secao}|${a.item} ${a.descricao.slice(0, 60)}`), avisos: s.avisos }]));
resultado.relacoesRegVel = rv.map(r => `${r.secao}|${r.itemNoStatus}: ${r.pmibPai.slice(-4)} → ${r.pmibFilho.slice(-4)}`);

// ── T2 Trechos, frequência, elevação ──
console.log('\nT2  Trechos do projeto ∩ frequência; elevação');
const nomes = ts => ts.map(t => t.trecho).join(',');
ok(nomes(L.trechosDoProjeto('ÍMPARES')) === 'U-01,U-03,U-05,U-07,U-09,U-10,U-12,U-14,U-16,U-18', `ÍMPARES = ${nomes(L.trechosDoProjeto('ÍMPARES'))}`);
ok(nomes(L.trechosDoProjeto('PARES')) === 'U-02,U-04,U-06,U-08,U-09A,U-11,U-13,U-15,U-17,U-18A', `PARES = ${nomes(L.trechosDoProjeto('PARES'))}`);
ok(nomes(L.trechosDoMaterial(L.trechosDoProjeto('IMPARES'), 60).trechos) === 'U-10,U-12,U-14,U-16,U-18', 'ÍMPARES ∩ 60 Hz = U-10,U-12,U-14,U-16,U-18');
ok(L.trechosDoMaterial(L.trechosDoProjeto('TODAS'), null).pergunta === true, 'TODAS sem frequência → pergunta ao usuário');
ok(L.trechosDoMaterial(L.trechosDoProjeto('AMC'), null).pergunta === false, 'AMC sem frequência → não pergunta');
ok(L.trechosDoMaterial(L.trechosDoProjeto('LISTA', ['U-1', 'U9A']), null).pergunta === false, 'LISTA só de 50 Hz sem frequência → não pergunta');
ok(L.expandeRds('#ST[XX]=M[XX]MKF10UZ010-UZ001', 'U-09A') === '#ST50=M19MKF10UZ010-UZ001', 'expande U-09A → #ST50=M19');
ok(L.expandeRds('#ST[XX]=M[XX]MKF10UZ010-UZ001', 'U-18A') === '#ST60=M20MKF10UZ010-UZ001', 'expande U-18A → #ST60=M20');
const e = L.formataElevacao('106,105');
ok(e.valor === '106,11' && !!e.aviso, `106,105 → ${e.valor} com aviso`);
ok(L.formataElevacao(98.5).valor === '98,50' && !L.formataElevacao('EL 98.500').aviso, '98.5 → 98,50; "EL 98.500" sem aviso');
// CCAR: contagem por trecho segue a posição física?
const ccarRows = ler('app_ccar').abas['APLICAÇÃO - LMR'].slice(1).filter(r => r[0]);
const porTrecho = {};
for (const r of ccarRows) { const t = L.normalizaTrecho((String(r[1]).match(/TRECHO\s*(\S+)\s*$/) || [])[1]); porTrecho[t] = (porTrecho[t] || 0) + 1; }
const imp = new Set(L.trechosDoProjeto('IMPARES').map(t => t.trecho));
const grupos = [...new Set(Object.entries(porTrecho).map(([t, c]) => `${imp.has(t) ? 'ímpar' : 'par'}:${c}`))];
ok(grupos.length === 2, `CCAR: linhas por trecho agrupam pela posição física → ${grupos.join(' / ')}`);

// ── T3 Água Pura: Tabela_Tags (Base) → CÓDIGO_LMR no estilo antigo ──
console.log('\nT3  Água Pura: Tags individuais → CÓDIGO_LMR (estilo antigo)');
const tt = ler('tabela_tags_agua_pura').abas['Tags individuais'].slice(1).filter(r => r && r[0]);
const appAP = ler('app_agua_pura').abas['APLICAÇÃO - LMR'].slice(1).filter(r => r[0]);
const antigoAP = r => `${r[1]} - ${r[2]} - ${r[3]} - RDS-PP: ${r[4]} - ${String(r[5]).toUpperCase()} - ELEV. ${String(r[6]).replace('.', ',')} - EIXO ${r[7]} - TRECHO ${r[8]}`;
const genAP = multiset(tt.map(r => String(r[0]).replace(/^'/, '') + '|' + antigoAP(r)));
const realAP = multiset(appAP.map(r => String(r[0]) + '|' + String(r[1]).trim()));
const faltam = difMultiset(realAP, genAP);
ok(faltam.length === 0, `${appAP.length - faltam.reduce((s, [, d]) => s + d, 0)}/${appAP.length} linhas idênticas`);

// ── T4 Reconstrução das aplicações emitidas ──
console.log('\nT4  Reconstrução (aplicação emitida → campos)');
const recon = {};
resultado.reconstrucao = {};
for (const [n, cfg] of Object.entries(APPS)) {
  const rows = ler('app_' + n).abas['APLICAÇÃO - LMR'];
  const r = L.reconstroi(rows, cfg);
  recon[n] = r;
  const lidas = r.linhas.filter(l => l.cod.ok).length;
  ok(lidas === r.linhas.length, `${n}: ${lidas}/${r.linhas.length} decompostas; ${r.resumo.semProblema} já no padrão de campos (sem nenhum problema)`);
  resultado.reconstrucao[n] = r.resumo;
  for (const [k, v] of Object.entries(r.resumo.problemas).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`        ${String(v).padStart(5)}  ${k}`);
}

// ── T5 Regeração no padrão v1.4 + ida e volta ──
console.log('\nT5  Padrão v1.4 a partir da reconstrução; ida e volta (monta → decompõe → mesmos campos)');
const NOVO = { agua_pura: ['UG', 'ÁGUA PURA'], aeracao: ['UG', 'AERAÇÃO AXIAL DA TURBINA'], ccar: ['RV', 'PARTE DIGITAL'], regvel: ['RV', 'PARTE MECÂNICA'], sfc: ['UG', 'SFC'] };
const novas = {};
resultado.amostras = {};
for (const [n, r] of Object.entries(recon)) {
  const cat = new Map(status[n].catalogo.map(c => [c.pmib, c]));
  const [escopo, subsistema] = NOVO[n];
  const linhas = r.linhas.filter(l => l.cod.ok).map(l => {
    const c = l.cod;
    const campos = {
      escopo, subsistema, area: c.area, rds: c.rds, pais: c.pais.map(p => ({ tag: p.tag, rds: p.rds })),
      local: c.local, elev: c.elev, eixo: c.eixo, trecho: c.trecho,
      tag: l.tag.tag, casoRds: l.tag.casoRds, descricao: cat.has(l.pmib) ? cat.get(l.pmib).descricao : null,
    };
    return { pmib: l.pmib, codigo: L.montaCodigo(campos), tag: L.montaTag(campos), campos, antigo: { codigo: l.codigoBruto, tag: l.tagBruta } };
  });
  novas[n] = linhas;
  let iguais = 0;
  for (const l of linhas) {
    const d = L.decompoeCodigo(l.codigo, { escopo, subsistema });
    const f = l.campos;
    // campos inválidos (já acusados na auditoria T8) não fazem ida e volta
    if (!f.local || !f.eixo || !f.trecho || (!f.pais.length && (!f.rds || !f.area))) { iguais++; continue; }
    if (d.ok && d.area === (f.pais.length ? '' : f.area) && d.rds === (f.pais.length ? null : f.rds) && d.trecho === f.trecho && d.eixo === f.eixo && d.elev === f.elev && d.local === f.local && JSON.stringify(d.pais.map(p => [p.tag, p.rds])) === JSON.stringify(f.pais.map(p => [p.tag, p.rds]))) iguais++;
  }
  ok(iguais === linhas.length, `${n}: ida e volta ${iguais}/${linhas.length}`);
  const vistos = new Set();
  resultado.amostras[n] = linhas.filter(l => { const k = l.pmib + l.campos.area; if (vistos.has(k)) return false; vistos.add(k); return true; }).slice(0, 12).map(l => ({ pmib: l.pmib, antigo: l.antigo, novo: { codigo: l.codigo, tag: l.tag } }));
}

// ── T6 Água Pura: Base da Tabela_Tags × Base reconstruída → mesma aplicação nova ──
console.log('\nT6  Água Pura: aplicação nova pela Tabela_Tags = aplicação nova pela reconstrução');
const catAP = new Map(status.agua_pura.catalogo.map(c => [c.pmib, c]));
const daTabela = tt.map(r => {
  const campos = {
    escopo: 'UG', subsistema: 'ÁGUA PURA', area: r[3], rds: r[4], pais: [], local: L.normalizaLocal(r[5]),
    elev: L.formataElevacao(r[6]).valor, eixo: L.normalizaEixo(r[7]), trecho: L.normalizaTrecho(r[8]),
  };
  return String(r[0]).replace(/^'/, '') + '|' + L.montaCodigo(campos);
});
const dif = difMultiset(multiset(daTabela), multiset(novas.agua_pura.map(l => l.pmib + '|' + l.codigo)));
ok(dif.length === 0, `CÓDIGO_LMR novo idêntico pelos dois caminhos (${daTabela.length} linhas; diferenças: ${dif.length})`);

// ── T7 Workflow C nível 1: Reg. Vel. Base reconstruída × Status PMIB ──
console.log('\nT7  Workflow C nível 1: Reg. Vel. (Base reconstruída × Status PMIB)');
const pmibsBase = [...new Set(recon.regvel.linhas.map(l => l.pmib))];
const descAntiga = new Map(recon.regvel.linhas.map(l => [l.pmib, l.tag.descricao]));
const sug = L.comparaStatusBase(status.regvel.catalogo, pmibsBase, descAntiga);
const curto = s => `${s.tipo} ${(s.pmibAtual || '').slice(-4)}${s.pmibNovo ? '→' + s.pmibNovo.slice(-4) : ''}`;
console.log('        ' + sug.map(curto).join(' | '));
const saem = sug.filter(s => s.pmibAtual).map(s => s.pmibAtual.slice(-4)).sort().join(',');
const entram = sug.filter(s => s.pmibNovo).map(s => s.pmibNovo.slice(-4)).sort().join(',');
ok(saem === '0795,1137,1141' && entram === '1640,1641', `saem ${saem}; entram ${entram}`);
resultado.workflowC = sug;

// ── T8 Auditoria das 5 aplicações no padrão v1.4 ──
console.log('\nT8  Auditoria (valida §6) das aplicações regeneradas');
resultado.auditoria = {};
const ref = L.indiceRef(ler('ref0013_funcao').linhas);
console.log(`  REF-0013: ${ref.size} códigos na forma genérica`);
ok(L.rdsNaRef('#ST50=M01MKF10UZ010-UZ001', ref) === true && L.rdsNaRef('#ST60=M14MKF10UZ010-UZ001', ref) === true, 'REF: skid da Água Pura em M01 e M14 → encontrado');
ok(!L.rdsNaRef('#ST50=M01MEU01UZ020-UZ001', ref), 'REF: MEU01 (dígito trocado) → não encontrado');
for (const [n, linhas] of Object.entries(novas)) {
  const v = L.valida(linhas, { catalogo: status[n].catalogo, relacoes: status[n].relacoes, trechosProjeto: L.TRECHOS, ref });
  const por = {};
  for (const x of v) { const k = `${x.regra} ${x.msg.replace(/\d{10}\.\d{4}|: .*$/g, '').trim()}`; por[k] = (por[k] || 0) + 1; }
  const bloq = new Set(v.filter(x => x.severidade === 'bloqueia').map(x => x.linha)).size;
  console.log(`  ${n}: ${linhas.length} linhas, ${bloq} bloqueadas`);
  for (const [k, c] of Object.entries(por).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`        ${String(c).padStart(5)}  ${k}`);
  resultado.auditoria[n] = { linhas: linhas.length, bloqueadas: bloq, porRegra: por, exemplos: v.slice(0, 40) };

  // saída por linha para a planilha (escreve_xlsx.py): novo × antigo + o que mudou + validação
  const porLinha = new Map();
  for (const x of v) if (x.linha) porLinha.set(x.linha, (porLinha.get(x.linha) || []).concat(`${x.regra} ${x.msg}`));
  const linhasRec = recon[n].linhas;
  const saida = linhas.map((l, i) => {
    const rec = linhasRec[i];
    return {
      pmib: l.pmib, codigo: l.codigo, tag: l.tag, antigoCodigo: l.antigo.codigo, antigoTag: l.antigo.tag,
      mudancas: mudancas(rec, l).join('; '), validacao: (porLinha.get(i + 1) || []).join(' | '),
      bloqueia: v.some(x => x.linha === i + 1 && x.severidade === 'bloqueia'),
    };
  });
  const gerais = v.filter(x => !x.linha).map(x => ({ regra: x.regra, severidade: x.severidade, pmib: x.pmib, msg: x.msg }));
  fs.writeFileSync(path.join(SAIDA, `linhas_${n}.json`), JSON.stringify({ linhas: saida, gerais, catalogo: status[n].catalogo, relacoes: status[n].relacoes }));
}

// O que mudou do estilo antigo para o padrão v1.4 (para a aba DIFERENÇAS)
function mudancas(rec, l) {
  const c = rec.cod, f = l.campos, out = [];
  const b = c.brutos || {};
  if (b.trecho && b.trecho !== f.trecho) out.push(`trecho ${b.trecho}→${f.trecho || '?'}`);
  if (b.eixo && b.eixo !== f.eixo) out.push(`eixo ${b.eixo}→${f.eixo || '?'}`);
  if (b.elev && b.elev !== f.elev) out.push(`elev. ${b.elev}→${f.elev || '?'}`);
  if (!/ - (CASA DE FORÇA|SALA GERADORES DIESEL) - ELEV/.test(rec.codigoBruto) || /UNIDADE GERADORA - ELEV/i.test(rec.codigoBruto)) out.push(`local→${f.local || '?'}`);
  if (!rec.codigoBruto.startsWith(`${f.escopo} - ${f.subsistema} - `)) out.push('escopo/subsistema do formulário');
  if (/RDS-PP:#|RDS-PP: {2,}/.test(rec.codigoBruto)) out.push('separador RDS-PP');
  if (/\)\s*$/.test(rec.tagBruta) && !/\)\s*$/.test(l.tag)) out.push('TAG sem (REF)');
  if (rec.tag.casoRds && !/RDS-PP: /.test(rec.tagBruta)) out.push('TAG com "RDS-PP: " e TAG concatenada');
  const descAntiga = rec.tag.descricao.replace(/\s*\([^()]*\)\s*$/, '').trim();
  if (f.descricao && descAntiga.toUpperCase() !== f.descricao.toUpperCase()) out.push('descrição do Status PMIB');
  if (!f.descricao) out.push('PMIB fora do Status: sem descrição');
  return out;
}

fs.writeFileSync(path.join(SAIDA, 'fase1_resultado.json'), JSON.stringify(resultado, null, 1));
console.log(`\n${falhas ? falhas + ' FALHA(S)' : 'TUDO OK'} — detalhes em saida/fase1_resultado.json`);
process.exitCode = falhas ? 1 : 0;

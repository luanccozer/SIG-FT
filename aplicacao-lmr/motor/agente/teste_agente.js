/*
 * Teste local da leitura com o agente (AG1 roteiro → 4 etapas no agente → AG2 Base), nos 4 sistemas com dados.
 *   "agente perfeito": as respostas das etapas montadas a partir da Base emitida (gabarito) → mede o roteiro, a
 *   conferência e a montagem, não o modelo. Casos ruins (Água Pura): controle errado, TAG e elevação inventadas,
 *   material faltando, etapa não enviada, QTD da lista de sobressalentes, JSON com cerca de código.
 *   Ida e volta pelo .xlsx do roteiro: Status e ÍNDICE lidos como texto dão o mesmo catálogo e o mesmo índice.
 * Uso: node agente/teste_agente.js     (MSG=agua_pura mostra as mensagens das etapas)
 */
const fs = require('fs');
const path = require('path');
const LMR = require('../lmr.js');
const INDICE = require('../indice/indice.js');
const LEITURA = require('../leitura/leitura.js');
const PLANILHA = require('../planilha.js');
const AGENTE = require('./agente.js');
const { agentePerfeito, textos } = require('./perfeito.js');
const D = path.join(__dirname, '..', 'dados');
const SAIDA = path.join(__dirname, '..', 'saida', 'teste_agente');
fs.mkdirSync(SAIDA, { recursive: true });

// mesmos sistemas e convenções do teste_a.js; teto = linhas iguais com a "IA perfeita" na leitura v3
const SIS = {
  agua_pura: { nome: 'Água Pura', escopo: 'UG', sub: 'ÁGUA PURA', kits: 'SEM TAG', pecas: 'TAG', eixo: 'CD', minimo: 3400 },
  regvel: { nome: 'Reg. Vel. e Pot. Hidráulica', escopo: 'RV', sub: 'PARTE MECÂNICA', kits: 'TAG', pecas: 'PAI', minimo: 3500 },
  aeracao: { nome: 'Aeração Axial', escopo: 'UG', sub: 'AERAÇÃO AXIAL DA TURBINA', freq: 'AMBAS', kits: 'TAG', pecas: 'TAG', minimo: 150 },
  sfc: { nome: 'SFC', escopo: 'UG', sub: 'SFC', trechos: 'LISTA', lista: ['AMD-03', 'AMC-02'], kits: 'TAG', pecas: 'TAG', minimoSemArea: 440 },
};

// O que o Extract from File do n8n devolve de uma aba: headerRow → objetos por coluna; sem cabeçalho → linhas. Tudo texto.
const comoTexto = v => (v == null ? '' : String(v));
const lidaComCabecalho = aba => aba.linhas.map(l => Object.fromEntries(aba.colunas.map(c => [c, comoTexto(l[c])])));
const lidaSemCabecalho = aba => aba.linhas.map(l => aba.colunas.map(c => comoTexto(l[c])));


let falhas = 0;
const ok = (cond, msg) => { if (!cond) { console.log(`   FALHA: ${msg}`); falhas++; } };
for (const [n, s] of Object.entries(SIS)) {
  if (!fs.existsSync(path.join(D, `textos_${n}.json`))) { console.log(`— ${s.nome}: sem textos`); continue; }
  const statusRows = JSON.parse(fs.readFileSync(path.join(D, `status_${n}.json`), 'utf8')).linhas;
  const st = LMR.lerStatusPmib(statusRows);
  const gab = JSON.parse(fs.readFileSync(path.join(D, `base_${n}.json`), 'utf8')).base;
  const indexados = JSON.parse(fs.readFileSync(path.join(D, `textos_${n}.json`), 'utf8')).map(d => INDICE.indexaDocumento(d.arquivo, d.paginas || [], st.catalogo));
  const cfg = { sistema: s.nome, escopo: s.escopo, subsistema: s.sub, trechos: s.trechos || 'TODAS', listaTrechos: (s.lista || []).join(', '), eixo: s.eixo || '',
    frequencia: s.freq || '', kits: s.kits, pecas: s.pecas, especificacao: '', etapaDocs: '' };

  // ── AG1: roteiro ──
  const r = AGENTE.roteiro(indexados, st, cfg);
  const abas = AGENTE.abasDoRoteiro(r, statusRows, indexados, cfg);
  fs.writeFileSync(path.join(SAIDA, `ROTEIRO LMR - ${s.nome}.xlsx`), PLANILHA.planilhaSimples(abas));
  if (process.env.MSG === n) for (const a of abas.filter(x => /^(ROTEIRO|ETAPA)/.test(x.nome))) console.log(`\n──── ${a.nome} ────\n${a.linhas.map(l => l.T).join('\n').slice(0, 5000)}`);
  // toda página com texto está em alguma etapa; lista de sobressalentes só na etapa 4
  for (const d of r.docs) {
    const em = new Set([1, 2, 3, 4].flatMap(k => d.porEtapa[k]));
    ok(em.size === d.paginas, `${d.arquivo}: páginas fora das etapas`);
    if (d.tipo === 'MPB') ok(d.porEtapa[4].length === d.paginas && [1, 2, 3].every(k => !d.porEtapa[k].length), `${d.arquivo}: lista de sobressalentes fora da etapa 4`);
  }
  // perguntas de controle: corretas escritas na página, falsas não; gabarito fora das mensagens
  const textoPag = new Map(indexados.flatMap(d => d.paginas.map(p => [`${d.doc.arquivo}|${p.pagina}`, p.texto.toUpperCase().replace(/\s+/g, '')])));
  for (const q of r.controle) {
    const tx = textoPag.get(`${q.arquivo}|${q.pagina}`);
    ok(q.corretas.length >= 2 && q.corretas.every(x => tx.includes(x)), `${q.id}: correta fora da página`);
    ok(q.opcoes.filter(x => !q.corretas.includes(x)).every(x => !tx.includes(x)), `${q.id}: falsa escrita na página`);
  }
  ok(!abas.filter(a => /^ETAPA/.test(a.nome)).some(a => a.linhas.some(l => /CORRETAS/.test(l.T))), 'gabarito do controle numa mensagem');
  ok(r.etapas[3].mensagens.reduce((k, m) => k + m.linhas.filter(l => /^- \S+ \| item /.test(l)).length, 0) === st.catalogo.length, 'materiais faltando na etapa 4');

  // ── ida e volta pelo .xlsx (como o AG2 lê) ──
  const aba = nome => abas.find(a => a.nome === nome);
  const rowsVolta = lidaSemCabecalho(aba('STATUS PMIB'));
  const stVolta = LMR.lerStatusPmib(rowsVolta);
  // reposição e o aviso de item gravado como número (4.1 × 4.10) não entram na Base
  const semRepo = c => JSON.stringify(c, (k, v) => (k === 'qtdReposicao' ? String(v) : k === 'numerico' ? undefined : v));
  ok(semRepo(stVolta.catalogo) === semRepo(st.catalogo) && JSON.stringify(stVolta.relacoes) === JSON.stringify(st.relacoes) && stVolta.lista === st.lista, 'Status PMIB diferente depois do .xlsx');
  const cfgVolta = AGENTE.configDoRoteiro(lidaComCabecalho(aba('CONFIG')));
  ok(cfgVolta.kits === cfg.kits && cfgVolta.subsistema === cfg.subsistema, 'CONFIG diferente depois do .xlsx');
  const indexVolta = AGENTE.indexadosDoRoteiro(lidaComCabecalho(aba('ÍNDICE')), stVolta.catalogo);
  const ind0 = LEITURA.indiceCompacto(indexados), ind1 = LEITURA.indiceCompacto(indexVolta);
  ok(ind0.paginas.length === ind1.paginas.length && JSON.stringify(ind0.sug) === JSON.stringify(ind1.sug) && ind0.elevs.join() === ind1.elevs.join(), 'ÍNDICE diferente depois do .xlsx');
  const controleVolta = lidaComCabecalho(aba('CONTROLE'));

  // ── agente perfeito → AG2 ──
  const projeto = LMR.trechosDoProjeto(cfg.trechos, s.lista || []).map(x => x.trecho);
  const resp = agentePerfeito(r, gab, projeto);
  const respTxt = textos(resp);
  respTxt[0].texto = 'Segue o arquivo:\n```json\n' + respTxt[0].texto + '\n```\nResumo: …'; // agente com texto em volta
  const e = { LMR, statusRows: rowsVolta, indexados: indexVolta, cfg: cfgVolta, controle: controleVolta, respostas: respTxt };
  const m = AGENTE.montaBaseDoAgente(e);
  const ap = LEITURA.comparaAplicacao(m.base, gab, LMR);
  const tipos = {};
  for (const p of m.pendencias) tipos[p.TIPO] = (tipos[p.TIPO] || 0) + 1;
  console.log(`${s.nome}: ${r.resumo.documentos} PDFs, ${r.resumo.paginas} páginas (${r.resumo.semTexto} sem texto); documentos por etapa ${JSON.stringify(r.resumo.porEtapa)}; `
    + `${r.resumo.perguntas} perguntas de controle; etapa 4 em ${r.etapas[3].mensagens.length} parte(s)`);
  console.log(`   agente perfeito → ${ap.iguais}/${ap.gabarito} linhas iguais (${ap.iguaisSemNomeDaArea} sem nome da área; geradas ${ap.gerada}); controle ${m.resumo.controleCertas}/${m.resumo.controlePerguntas}; pendências ${JSON.stringify(tipos)}`);
  ok(m.resumo.controleCertas === m.resumo.controlePerguntas, 'controle com erro no agente perfeito');
  ok(!tipos.CONTROLE && !tipos.ETAPA, 'pendência de controle/etapa no agente perfeito');
  if (s.minimo) ok(ap.iguais >= s.minimo, `${ap.iguais} linhas iguais (mínimo ${s.minimo})`);
  if (s.minimoSemArea) ok(ap.iguaisSemNomeDaArea >= s.minimoSemArea, `${ap.iguaisSemNomeDaArea} linhas iguais sem nome da área (mínimo ${s.minimoSemArea})`);
  fs.writeFileSync(path.join(SAIDA, `BASE LMR - ${s.nome} (agente perfeito).xlsx`), PLANILHA.planilhaDaBase({ colunasBase: LMR.COLUNAS_BASE, base: m.base, cabecalho: m.cabecalho, docs: m.docs, relacoes: m.relacoes, extras: m.extras }));

  if (n !== 'agua_pura') continue;
  // ── casos ruins (Água Pura) ──
  const ruim = mexe => { const rs = JSON.parse(JSON.stringify(resp)); mexe(rs); return AGENTE.montaBaseDoAgente({ ...e, respostas: textos(rs) }); };
  const tem = (x, tipo, re) => x.pendencias.some(p => p.TIPO === tipo && re.test(p.DETALHE));
  // controle errado na etapa 3
  const q3 = resp[2].json.controle[0];
  let x = ruim(rs => { rs[2].json.controle[0].presentes = q3.presentes.slice(1); });
  ok(x.controle.linhas.find(l => l.ID === q3.id).RESULTADO.startsWith('ERRO — não viu'), 'controle errado não marcado');
  ok(tem(x, 'CONTROLE', /^etapa 3: /), 'controle errado sem pendência');
  // TAG inventada, QTD da lista de sobressalentes, material faltando, encontrado = false
  const ms = resp.find(y => y.json.etapa === 4).json.materiais;
  const comTag = ms.find(y => y.tags.length), semTag = ms.find(y => !y.tags.length && y.qtd_instalada), falta = ms[ms.length - 1];
  x = ruim(rs => {
    const m4 = rs.find(y => y.json.etapa === 4).json.materiais;
    m4.find(y => y.pmib === comTag.pmib).tags.push({ tag: 'ZZ999', area: comTag.tags[0].area, rds_proprio: true });
    Object.assign(m4.find(y => y.pmib === semTag.pmib), { qtd_instalada: 7, evidencia: `${st.lista} p.2` });
    m4.splice(m4.findIndex(y => y.pmib === falta.pmib), 1);
    m4[0].encontrado = false;
  });
  ok(tem(x, 'LEITURA', /TAG ZZ999 não está nos documentos/), 'TAG inventada sem pendência');
  ok(x.base.every(l => l.TAG !== 'ZZ999') || tem(x, 'LEITURA', /ZZ999/), 'TAG inventada');
  ok(tem(x, 'LEITURA', /QTD 7 recusada/), 'QTD da lista de sobressalentes aceita');
  ok(x.pendencias.some(p => p.PMIB === falta.pmib && /sem resposta do agente/.test(p.DETALHE)), 'material faltando sem pendência');
  ok(x.pendencias.some(p => p.PMIB === ms[0].pmib && /não encontrou/.test(p.DETALHE)), 'encontrado=false sem pendência');
  // elevação inventada numa área; etapa 2 não enviada
  x = ruim(rs => { rs[0].json.areas[0].elevacao = '123,45'; rs.splice(1, 1); });
  ok(x.pendencias.some(p => p.TIPO === 'CONFERIR' && /elevação 123,45 — confira no documento/.test(p.DETALHE)), 'elevação fora do texto sem pendência CONFERIR');
  ok(tem(x, 'ETAPA', /^etapa 2 não enviada/), 'etapa não enviada sem pendência');
  ok(x.controle.linhas.filter(l => l.ETAPA === 2).every(l => l.RESULTADO === 'ETAPA NÃO ENVIADA'), 'controle da etapa não enviada');
  // JSON ilegível
  x = AGENTE.montaBaseDoAgente({ ...e, respostas: [...respTxt, { arquivo: 'lixo.json', texto: 'não consegui gerar' }] });
  ok(tem(x, 'LEITURA DO AGENTE', /lixo\.json: sem JSON válido/), 'arquivo sem JSON não avisado');
  console.log('   casos ruins conferidos');
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exit(falhas ? 1 : 0);

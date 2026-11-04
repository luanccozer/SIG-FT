/*
 * Função R fora do AMP: aplicação emitida + Status PMIB → Base da Aplicação (uma vez por sistema).
 * Confere que a Base, expandida em lotes como o Workflow B faz no AMP, dá exatamente as mesmas linhas
 * que o motor validado na Fase 1 (mesmo conjunto de linhas e mesmas linhas bloqueadas).
 * Saída: motor/dados/base_{sistema}.json (escreve_base.py grava o .xlsx).
 * Uso: node base/criar_bases.js
 */
const fs = require('fs');
const path = require('path');
const L = require('../lmr.js');

const D = path.join(__dirname, '..', 'dados');
const ler = n => JSON.parse(fs.readFileSync(path.join(D, n + '.json'), 'utf8'));
const NOVO = { agua_pura: ['UG', 'ÁGUA PURA'], aeracao: ['UG', 'AERAÇÃO AXIAL DA TURBINA'], ccar: ['RV', 'PARTE DIGITAL'], regvel: ['RV', 'PARTE MECÂNICA'], sfc: ['UG', 'SFC', 'LISTA', 'AMD-03, AMC-02'] };
const LOTE = 20;
// Cabeçalho da DOCS DE REFERÊNCIA do template, tirado da aplicação emitida (LISTA DE SOBRESSALENTE(S), ESPECIFICAÇÃO, SUBSISTEMA).
const cabecalho = rows => {
  const t = L.lerDocsAntigos(rows).topo;
  const ach = re => (Object.entries(t).find(([k]) => re.test(k)) || [, ''])[1];
  return { 'LISTA DE SOBRESSALENTE': ach(/^LISTA DE SOBRESSALENTES?$/), 'ESPECIFICAÇÃO TÉCNICA / CAPÍTULO': ach(/^ESPECIFICA/), SUBSISTEMA: ach(/^SUBSISTEMA$/) };
};

let falhas = 0;
const resumo = {};
for (const [n, [escopo, subsistema, trechos = 'TODAS', listaTrechos = '']] of Object.entries(NOVO)) {
  const app = ler('app_' + n).abas;
  const e = { statusRows: ler('status_' + n).linhas, appRows: app['APLICAÇÃO - LMR'], docsRows: app['DOCS DE REFERÊNCIA'], escopo, subsistema, trechos, listaTrechos };

  // referência: motor da Fase 1
  const ref = L.regeneraAplicacao(e);
  let somaRef = 0;
  for (const l of ref.aplicacao) somaRef = (somaRef + L.hashLinha(`${l.FICHA_PMIB}|${l['CÓDIGO_LMR']}|${l.TAG_LMR}`)) % 4294967296;
  const assinaturaRef = L.assinaturaSoma(ref.aplicacao.length, somaRef);

  // Base → linhas da aba BASE (texto, como sai do Excel) → lotes → linhas
  const b = L.baseDaAplicacao(e);
  const linhasBase = b.modelos.map(L.modeloParaLinha).map(r => JSON.parse(JSON.stringify(r)));
  const tags = new Set(linhasBase.map(r => L.txt(r.TAG)).filter(Boolean).flatMap(t => t.split('/')));
  const itens = [];
  for (let i = 0; i < linhasBase.length; i += LOTE) itens.push(...L.geraLote(linhasBase.slice(i, i + LOTE), tags));
  const nLinhas = itens.reduce((a, x) => a + x.n, 0);
  const soma = itens.reduce((a, x) => a + x.h, 0);
  const assinatura = L.assinaturaSoma(nLinhas, soma);
  const bloqueadas = itens.reduce((a, x) => a + x.bloqueadas, 0);

  const ok = assinatura === assinaturaRef && bloqueadas === ref.resumo.linhasBloqueadas;
  if (!ok) falhas++;
  resumo[n] = { linhasDaBase: linhasBase.length, linhas: nLinhas, assinatura, assinaturaRef, bloqueadas, bloqueadasRef: ref.resumo.linhasBloqueadas, naoLidas: b.naoLidas.length };
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${n}: Base ${linhasBase.length} linhas → ${nLinhas} linhas | assinatura ${assinatura} (motor ${assinaturaRef}) | bloqueadas ${bloqueadas} (motor ${ref.resumo.linhasBloqueadas}) | não lidas ${b.naoLidas.length}`);

  fs.writeFileSync(path.join(D, `base_${n}.json`), JSON.stringify({
    sistema: n, escopo, subsistema, colunas: L.COLUNAS_BASE, base: linhasBase, cabecalho: cabecalho(app['DOCS DE REFERÊNCIA']),
    docs: ref.docs, relacoes: ref.relacoes, naoLidas: b.naoLidas.map(l => ({ FICHA_PMIB: l.pmib, 'CÓDIGO_LMR EMITIDO': l.codigoBruto, 'TAG_LMR EMITIDA': l.tagBruta })),
    resumo: { assinatura, linhas: nLinhas, bloqueadas, lista: ref.resumo.lista, revisao: ref.resumo.revisao },
  }, null, 1));
}
fs.writeFileSync(path.join(D, 'bases_resumo.json'), JSON.stringify(resumo, null, 2));
process.exit(falhas ? 1 : 0);

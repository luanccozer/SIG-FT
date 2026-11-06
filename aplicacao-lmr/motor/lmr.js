/*
 * Motor de regras da Aplicação LMR (plano v1.4).
 *
 * Um arquivo só, sem dependências, para colar num nó Code do n8n.
 * Toda entrada de planilha é uma lista de linhas, e cada linha é uma lista
 * de valores (saída de Extract from File / extrair.py).
 *
 * Seções:
 *   1. Constantes (posição física das UGs, listas fechadas)
 *   2. Utilitários de texto e elevação
 *   3. status_pmib  — Status PMIB → CATÁLOGO + RELAÇÕES documentais   (§3.6, §3.7)
 *   4. trechos      — trechos do projeto ∩ frequência                  (§3.2)
 *   5. monta        — CÓDIGO_LMR e TAG_LMR no padrão único             (§3.3)
 *   6. gera         — Base → linhas da APLICAÇÃO LMR                   (§3.5)
 *   7. reconstroi   — aplicação emitida → linhas decompostas           (§4.4)
 *   8. valida       — regras V1–V15                                    (§6)
 *   9. compara      — Status PMIB × Base (Workflow C, nível 1)         (§4.4)
 */

// ───────────────────────── 1. Constantes ─────────────────────────

// Ordem física das UGs: U-09A é a 10ª, U-10 a 11ª, U-18A a 20ª.
const UGS = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n, i) => ({ pos: i + 1, trecho: `U-${pad2(n)}`, m: `M${pad2(n)}`, hz: 50 })),
  { pos: 10, trecho: 'U-09A', m: 'M19', hz: 50 },
  ...[10, 11, 12, 13, 14, 15, 16, 17, 18].map((n, i) => ({ pos: 11 + i, trecho: `U-${n}`, m: `M${n}`, hz: 60 })),
  { pos: 20, trecho: 'U-18A', m: 'M20', hz: 60 },
];
const AMD = [1, 2, 3, 4].map(n => ({ trecho: `AMD-${pad2(n)}`, m: null, hz: null }));
const AMC = [1, 2, 3].map(n => ({ trecho: `AMC-${pad2(n)}`, m: null, hz: null }));
const TRECHOS = [...UGS, ...AMD, ...AMC];
const TRECHO_POR_NOME = Object.fromEntries(TRECHOS.map(t => [t.trecho, t]));
const UG_POR_M = Object.fromEntries(UGS.map(t => [t.m, t]));

const EIXOS = ['AB', 'BC', 'CD', 'MB', 'JB', 'JD'];

// Lista fechada de locais (no AMP vem de Data Table). Chave = forma normalizada.
const LOCAIS = {
  'CASA DE FORÇA': 'CASA DE FORÇA',
  'CASA DE FORCA': 'CASA DE FORÇA',
  'CASA DE FORÇA - UNIDADE GERADORA': 'CASA DE FORÇA',
  'CASA DE FORCA - UNIDADE GERADORA': 'CASA DE FORÇA',
  'SALA GERADORES DIESEL': 'SALA GERADORES DIESEL',
};

// Unidades de material a granel: 1 linha por trecho (§3.5).
const UNID_GRANEL = new Set(['L', 'KG', 'M', 'M2', 'M²', 'M3', 'M³', 'ML', 'G', 'LT']);

const RE_PMIB = /^\d{10}\.\d{4}$/;

// ───────────────────────── 2. Utilitários ─────────────────────────

function pad2(n) { return String(n).padStart(2, '0'); }

function txt(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }

function semAcento(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }

// Limpeza mínima da descrição do Status (decisão 19).
function limpaDescricao(v) { return txt(v); }

/**
 * Elevação com 2 casas e vírgula. Aceita 98.5, "98,5", "98.500", "EL 104.200".
 * Devolve { valor, aviso }; valor null se não for número.
 */
function formataElevacao(v) {
  if (v == null || v === '') return { valor: null, aviso: null };
  const s = String(v).replace(/^EL\.?\s*/i, '').trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { valor: null, aviso: `elevação inválida: ${v}` };
  const x = Number(s);
  const r = Math.round((x + Number.EPSILON) * 100) / 100;
  const valor = r.toFixed(2).replace('.', ',');
  const aviso = Math.abs(r - x) > 1e-9 ? `elevação ${v} arredondada para ${valor}` : null;
  return { valor, aviso };
}

function normalizaTrecho(v) {
  const s = txt(v).toUpperCase().replace(/\s+/g, '');
  let m = s.match(/^U-?0*(\d{1,2})(A?)$/);
  if (m) {
    const n = Number(m[1]);
    const nome = m[2] ? `U-${pad2(n)}A` : `U-${pad2(n)}`;
    return TRECHO_POR_NOME[nome] ? nome : null;
  }
  m = s.match(/^(AMD|AMC)-?0*(\d)$/);
  if (m) { const nome = `${m[1]}-${pad2(m[2])}`; return TRECHO_POR_NOME[nome] ? nome : null; }
  return null;
}

function normalizaEixo(v) {
  const s = txt(v).toUpperCase().replace(/[-\s]/g, '');
  return EIXOS.includes(s) ? s : null;
}

function normalizaLocal(v) {
  const s = txt(v).toUpperCase();
  return LOCAIS[s] || null;
}

// ───────────────────────── 3. status_pmib ─────────────────────────

/**
 * Lê a aba "Lista de Materiais" de um Status PMIB.
 * Devolve { lista, revisao, catalogo[], relacoes[], agrupadores[], avisos[] }.
 * A QTD do Status é de reposição: fica como qtdReposicao e nunca é usada na aplicação.
 */
function lerStatusPmib(linhas) {
  const avisos = [];
  const hi = linhas.findIndex(r => r && r.some(c => txt(c) === 'ITEM'));
  if (hi < 0) throw new Error('Status PMIB: cabeçalho ITEM não encontrado');
  const hdr = linhas[hi].map(c => txt(c).toUpperCase());
  const col = nome => hdr.findIndex(h => h === nome);
  const colIni = prefixo => hdr.findIndex(h => h.startsWith(prefixo));
  const C = {
    item: col('ITEM'), qtd: col('QTD.'), unid: col('UNID.'), desc: col('DESCRIÇÃO'),
    codMat: col('CÓDIGO DO MATERIAL'), codCmi: hdr.findIndex(h => h === 'CÓDIGO CMI' || h === 'CÓDIGO GE'),
    marca: col('MARCA/MODELO'), pmib: col('CÓDIGO PMIB'), pdm: col('PDM USADO'), status: col('STATUS'),
    tipo: colIni('TIPO DE ENTREGA'),
  };
  // Coluna de seção à esquerda sem cabeçalho (ex.: INSTRUMENTAÇÃO na Reg. Vel.).
  const colSecao = C.item > 0 && !hdr[0] ? 0 : -1;

  const topo = linhas.slice(0, hi).map(r => (r || []).map(txt).filter(Boolean).join(' | '));
  const lista = (topo.join(' ').match(/#ST\d\d=[A-Z0-9]+&[A-Z]{3}\d{3}/) || [null])[0];
  const revisao = (topo.join(' ').match(/EM USO:\s*([^\s-]+)/) || [null, null])[1];

  let secao = '';
  const itens = [];
  for (const r of linhas.slice(hi + 1)) {
    if (!r || !r.some(c => c != null && txt(c) !== '')) continue;
    if (colSecao >= 0 && txt(r[colSecao])) secao = txt(r[colSecao]);
    const pmib = txt(r[C.pmib]);
    const valores = r.map(txt).filter(Boolean);
    if (!RE_PMIB.test(pmib) && valores.length === 1) { secao = valores[0]; continue; }
    const numerico = typeof r[C.item] === 'number' && !Number.isInteger(r[C.item]);
    const item = txt(r[C.item]);
    itens.push({
      numerico,
      secao, item, pmib: RE_PMIB.test(pmib) ? pmib : null,
      qtdReposicao: r[C.qtd], unid: txt(r[C.unid]), descricao: limpaDescricao(r[C.desc]),
      codigoMaterial: txt(r[C.codMat]), codigoCmi: C.codCmi >= 0 ? txt(r[C.codCmi]) : '',
      marcaModelo: txt(r[C.marca]), status: txt(r[C.status]).toUpperCase(),
      pdm: txt(r[C.pdm]), tipoEntrega: C.tipo >= 0 ? txt(r[C.tipo]) : '',
    });
  }

  // Pai de x.y = item x mais recente acima dele na mesma seção. A numeração pode
  // recomeçar dentro de uma seção (Reg. Vel., VÁLVULAS E BLOCOS), então não basta seção + item.
  const ultimo = new Map();
  const recomecos = new Set();
  for (const it of itens) {
    const i = it.item.lastIndexOf('.');
    if (i >= 0) it.pai = ultimo.get(`${it.secao}|${it.item.slice(0, i)}`) || null;
    const chave = `${it.secao}|${it.item}`;
    if (ultimo.has(chave) && !it.item.includes('.')) recomecos.add(it.secao);
    ultimo.set(chave, it);
  }
  for (const s of recomecos) avisos.push(`numeração recomeça dentro da seção "${s}": pai = item mais recente acima`);
  // Subitem gravado como número no Excel perde o zero à direita (4.10 → 4.1): só é ambíguo com 10+ irmãos.
  const irmaos = new Map();
  for (const it of itens) if (it.pai) irmaos.set(it.pai, (irmaos.get(it.pai) || []).concat(it));
  for (const [pai, fs] of irmaos) {
    if (fs.length >= 10 && fs.some(f => f.numerico)) avisos.push(`item ${pai.item} (${pai.secao}): subitens gravados como número com 10+ irmãos — conferir 4.1 × 4.10`);
  }

  const catalogo = [];
  const agrupadores = [];
  for (const it of itens) {
    if (!it.pmib) { agrupadores.push(it); continue; }
    if (it.status === 'DUPLICADO') continue;
    if (/DUPLICAD/i.test(it.pdm)) avisos.push(`${it.pmib}: PDM usado indica FICHA PMIB DUPLICADA`);
    catalogo.push({
      ...it, lista, revisao,
      granel: UNID_GRANEL.has(semAcento(it.unid).toUpperCase().replace('.', '')),
    });
  }
  const noCatalogo = new Set(catalogo.map(c => c.pmib));

  // Relações documentais (§3.7 R1–R2): x.y é filho de x na mesma seção.
  const relacoes = [];
  for (const it of itens) {
    if (!it.pmib || !noCatalogo.has(it.pmib)) continue;
    if (!it.item.includes('.')) continue;
    const pai = it.pai;
    if (!pai) { avisos.push(`${it.pmib} (item ${it.item}): item pai não encontrado acima`); continue; }
    if (!pai.pmib) continue; // agrupador: o filho segue as próprias regras
    if (!noCatalogo.has(pai.pmib)) { avisos.push(`${it.pmib}: pai ${pai.pmib} fora do catálogo (DUPLICADO)`); continue; }
    relacoes.push({
      pmibFilho: it.pmib, pmibPai: pai.pmib, categoria: 'documental',
      itemNoStatus: it.item, secao: it.secao, fonte: 'Status PMIB', confianca: 'texto',
    });
  }
  return { lista, revisao, catalogo, relacoes, agrupadores, avisos };
}

// ───────────────────────── 4. trechos ─────────────────────────

/**
 * Trechos do projeto (parâmetro do formulário, §3.2).
 * opcao: TODAS | IMPARES | PARES | LISTA | AMD | AMC; lista: nomes para LISTA (ou AMD/AMC parciais).
 */
function trechosDoProjeto(opcao, lista) {
  const o = semAcento(txt(opcao)).toUpperCase();
  const daLista = base => {
    if (!lista || !lista.length) return base;
    const nomes = new Set(lista.map(normalizaTrecho));
    if (nomes.has(null)) throw new Error(`trecho inválido na lista: ${lista.find(x => !normalizaTrecho(x))}`);
    return base.filter(t => nomes.has(t.trecho));
  };
  switch (o) {
    case 'TODAS': return UGS.slice();
    case 'IMPARES': return UGS.filter(t => t.pos % 2 === 1);
    case 'PARES': return UGS.filter(t => t.pos % 2 === 0);
    case 'LISTA': return daLista(TRECHOS);
    case 'AMD': return daLista(AMD);
    case 'AMC': return daLista(AMC);
    default: throw new Error(`opção de trechos desconhecida: ${opcao}`);
  }
}

/**
 * Trechos onde o material entra = trechos do projeto ∩ frequência.
 * hz: 50 | 60 | 'AMBAS' | null. Devolve { trechos, pergunta } — pergunta = true quando
 * o projeto mistura 50 e 60 Hz e a frequência do material não foi encontrada (A9b).
 */
function trechosDoMaterial(trechosProjeto, hz) {
  const freqs = new Set(trechosProjeto.filter(t => t.hz).map(t => t.hz));
  if (hz == null || hz === '') {
    return freqs.size > 1 ? { trechos: [], pergunta: true } : { trechos: trechosProjeto.slice(), pergunta: false };
  }
  if (String(hz).toUpperCase() === 'AMBAS') return { trechos: trechosProjeto.slice(), pergunta: false };
  if (!freqs.size) return { trechos: trechosProjeto.slice(), pergunta: false }; // trechos sem frequência (AMD, AMC): não há o que filtrar
  const h = Number(String(hz).replace(/\D/g, ''));
  return { trechos: trechosProjeto.filter(t => t.hz === h), pergunta: false };
}

/** Frequência pela descrição do Status (só conferência, decisão 21). */
function hzDaDescricao(desc) {
  if (/\b50\s*[\/-]\s*60\s*HZ\b/i.test(txt(desc))) return 'AMBAS';
  const m = txt(desc).match(/\b(50|60)\s*HZ\b/i);
  return m ? Number(m[1]) : null;
}

/** `#ST[XX]=M[XX]...` → RDS-PP do trecho. RDS já expandido ou fora de UG volta igual. */
function expandeRds(modelo, trecho) {
  const s = txt(modelo);
  if (!/\[XX\]/.test(s)) return s;
  const t = TRECHO_POR_NOME[trecho];
  if (!t || !t.m) return s; // placeholder fica e a V2 bloqueia
  return s.replace(/#ST\[XX\]/g, `#ST${t.hz}`).replace(/M\[XX\]/g, t.m);
}

/** M e #ST de um RDS-PP expandido: { st: '50', m: 'M01' } ou nulos. Pega também M inválido (M9A, M18A). */
function partesRds(rds) {
  const m = txt(rds).match(/#ST(\d\d)=(M[0-9A]{2,3})(?=[A-Z]{3}\d\d)/);
  return m ? { st: m[1], m: m[2] } : { st: null, m: null };
}

/** Forma genérica por UG: #ST50=M01MKF10... → #ST[XX]=M[XX]MKF10... (M00/M50/M60 ficam). */
function rdsGenerico(rds) {
  return txt(rds).replace(/^#ST(50|60)=M(0[1-9]|1\d|20)(?=[A-Z])/, '#ST[XX]=M[XX]');
}

/** REF-0013, aba AGRUPADO (Função) → Set de códigos na forma genérica (V3). */
function indiceRef(linhas) {
  const hdr = linhas[0].map(c => txt(c).toUpperCase());
  const iTag = hdr.indexOf('TAG');
  const s = new Set();
  for (const r of linhas.slice(1)) {
    if (!r || !r[iTag]) continue;
    const g = rdsGenerico(r[iTag]);
    s.add(g);
    // níveis acima também valem (a REF pode listar só …GQ010-GQ001 e não …GQ010)
    for (let k = g.indexOf('-'); k > 0; k = g.indexOf('-', k + 1)) s.add(g.slice(0, k));
    const m = g.match(/^(.*\d{3})[A-Z]{2}\d{3}[A-Z]?$/);
    if (m) s.add(m[1]);
  }
  return s;
}

/**
 * V3: RDS-PP existe na REF-0013 (forma genérica, ou nível acima de um código da REF).
 * Devolve true | 'documento' (&XXX — código de documento, decisão 4) | 'tag' (RDS+TAG do projeto) | false.
 * Códigos como UZ020-UZ003 (decisão 4) só se confirmam contra o inventário de documentos (Fase 4).
 */
function rdsNaRef(rds, ref) {
  const s = txt(rds);
  if (!s) return true;
  if (s.includes('&')) return 'documento';
  const g = rdsGenerico(s);
  if (ref.has(g)) return true;
  // RDS-PP + TAG do projeto (…UZ001BM101T / …UZ001-BM101T): confere a parte da REF
  const semTag = g.replace(/-?[A-Z]{1,3}\d{2,3}[A-Z]?$/, '');
  return semTag !== g && ref.has(semTag) ? 'tag' : false;
}

// ───────────────────────── 5. monta ─────────────────────────

/**
 * CÓDIGO_LMR (§3.3). l = { escopo, subsistema, area, rds, pais[{tag, rds}], local, elev, eixo, trecho }.
 * Filho de pai com TAG: a TAG do pai entra no lugar da ÁREA/PAINEL, com RDS-PP+TAG do pai (§3.2 caso 3, R7).
 */
// Campo faltante aparece como [?] no texto: a linha já está bloqueada pela V1 e fica visível na revisão.
const F = v => (v == null || v === '' ? '[?]' : v);

function montaCodigo(l) {
  const local = `${F(l.local)} - ELEV. ${F(l.elev)} - EIXO ${F(l.eixo)} - TRECHO ${F(l.trecho)}`;
  const ini = `${F(l.escopo)} - ${F(l.subsistema)}`;
  if (l.pais && l.pais.length) {
    const cit = l.pais.map(p => `${p.tag} - RDS-PP: ${F(p.rds)}${p.tag}`).join(' - ');
    return `${ini} - ${cit} - ${local}`;
  }
  return `${ini} - ${F(l.area)} - RDS-PP: ${F(l.rds)} - ${local}`;
}

/**
 * TAG_LMR (§3.3). casoRds 1/2 → TAG com RDS-PP+TAG; TAG sem RDS próprio → {ESC} - {TAG} - {DESC}
 * (estilo dos exemplos, a confirmar); sem TAG → {ESC} - {DESC}.
 */
function montaTag(l) {
  // PN entre parênteses no fim (revoga a decisão 14 em 06/11/2026); sem PN, a TAG sai sem parênteses
  const desc = `${F(l.descricao)}${txt(l.pn) ? ` (${txt(l.pn)})` : ''}`;
  if (l.tag && (l.casoRds === 1 || l.casoRds === 2)) return `${F(l.escopo)} - ${l.tag} - RDS-PP: ${F(l.rds)}${l.tag} - ${desc}`;
  if (l.tag) return `${F(l.escopo)} - ${l.tag} - ${desc}`;
  return `${F(l.escopo)} - ${desc}`;
}

// ───────────────────────── 6. gera ─────────────────────────

/**
 * Base → linhas da APLICAÇÃO LMR.
 * base.aplicacoes: linhas-modelo { pmib, area, rds (pode ter [XX]), tag, casoRds, pais[{tag, rds}],
 *   local, elev, eixo, hz, trechos? (nomes; senão vale trechosDoMaterial), qtd }.
 * ctx: { escopo, subsistema, trechosProjeto, catalogo }.
 * Devolve { linhas[{pmib, codigo, tag, origem}], pendencias[] }.
 */
function gera(base, ctx) {
  const cat = new Map(ctx.catalogo.map(c => [c.pmib, c]));
  const linhas = [];
  const pendencias = [];
  base.aplicacoes.forEach((a, idx) => {
    const c = cat.get(a.pmib);
    let trechos;
    if (a.trechos) {
      trechos = a.trechos.map(n => TRECHO_POR_NOME[normalizaTrecho(n)]).filter(Boolean);
    } else {
      const r = trechosDoMaterial(ctx.trechosProjeto, a.hz);
      if (r.pergunta) { pendencias.push({ idx, pmib: a.pmib, tag: a.tag, tipo: 'FREQUÊNCIA', msg: 'projeto mistura 50 e 60 Hz e a frequência não foi encontrada: perguntar ao usuário' }); return; }
      trechos = r.trechos;
      if (!trechos.length) { pendencias.push({ idx, pmib: a.pmib, tipo: 'TRECHO', msg: `nenhum trecho do projeto com ${a.hz} Hz` }); return; }
    }
    const granel = c && c.granel;
    const qtd = granel ? 1 : Number(a.qtd);
    if (!granel && !(qtd >= 1)) { pendencias.push({ idx, pmib: a.pmib, tag: a.tag, tipo: 'QTD', msg: 'QTD instalada sem fonte' }); return; }
    const elev = formataElevacao(a.elev);
    if (elev.aviso) pendencias.push({ idx, pmib: a.pmib, tipo: 'AVISO', msg: elev.aviso });
    for (const t of trechos) {
      const rds = expandeRds(a.rds, t.trecho);
      const pais = (a.pais || []).map(p => ({ tag: p.tag, rds: expandeRds(p.rds, t.trecho) }));
      const l = {
        escopo: ctx.escopo, subsistema: ctx.subsistema, area: a.area, rds, pais,
        local: normalizaLocal(a.local) || a.local, elev: elev.valor, eixo: normalizaEixo(a.eixo) || a.eixo, trecho: t.trecho,
        tag: a.tag, casoRds: a.casoRds, descricao: c ? c.descricao : a.descricao, pn: c ? c.codigoMaterial : a.pn,
      };
      const linha = { pmib: a.pmib, codigo: montaCodigo(l), tag: montaTag(l), origem: idx, campos: l };
      for (let k = 0; k < qtd; k++) linhas.push(linha);
    }
  });
  return { linhas, pendencias };
}

// ───────────────────────── 7. reconstroi ─────────────────────────

const RE_TAG = /^[A-Z]{1,3}\d{2,3}[A-Z]?(\/[A-Z]{1,3}\d{2,3}[A-Z]?)*$/;

/**
 * Decompõe um CÓDIGO_LMR emitido (estilos antigos variados).
 * cfg: { escopo, subsistema } da aplicação (os valores do estilo antigo).
 * Devolve campos + problemas[] (o que não se encaixou no padrão).
 */
function decompoeCodigo(s, cfg) {
  const problemas = [];
  const bruto = String(s);
  const m = bruto.match(/^(.*?)\s*-\s*ELEV\.?\s*([\d.,]+)\s*-\s*EIXO\s*(\S+)\s*-\s*TRECHO\s*(\S+)\s*$/);
  if (!m) return { ok: false, problemas: ['cauda ELEV/EIXO/TRECHO não reconhecida'], bruto };
  const [, cabeca, elevBruta, eixoBruto, trechoBruto] = m;
  const segs = cabeca.split(/\s+-\s+|-\s+(?=RDS-PP)|\s+-(?=\d)/).map(x => x.trim()).filter(Boolean);

  // local: último(s) segmento(s), se estiverem na lista fechada
  let local = null;
  for (const n of [2, 1]) {
    if (segs.length > n && normalizaLocal(segs.slice(-n).join(' - '))) { local = normalizaLocal(segs.splice(-n).join(' - ')); break; }
  }
  if (!local) problemas.push(`local ausente ou fora da lista: "${segs[segs.length - 1]}"`);

  const igual = (a, b) => b && semAcento(a).toUpperCase() === semAcento(b).toUpperCase();
  let escopo = null, subsistema = null;
  if (segs.length && igual(segs[0], cfg.escopo)) escopo = segs.shift();
  else problemas.push(`escopo diferente de "${cfg.escopo}": "${segs[0]}"`);
  if (cfg.subsistema && segs.length && igual(segs[0], cfg.subsistema)) subsistema = segs.shift();

  const area = [];
  const rdsLista = [];
  const pais = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const r = seg.match(/^RDS-PP:\s*(\S+)$/);
    if (r) { rdsLista.push(r[1]); continue; }
    const prox = segs[i + 1] && segs[i + 1].match(/^RDS-PP:\s*(\S+)$/);
    if (RE_TAG.test(seg) && prox) {
      const rdsPai = prox[1].endsWith(seg) ? prox[1].slice(0, -seg.length) : prox[1];
      pais.push({ tag: seg, rds: rdsPai, concatenado: prox[1].endsWith(seg) });
      i++;
      continue;
    }
    area.push(seg);
  }
  if (!pais.length && rdsLista.length !== 1) problemas.push(rdsLista.length ? 'mais de um RDS-PP sem TAG de pai' : 'sem RDS-PP');
  if (!pais.length && !area.length) problemas.push('sem ÁREA/PAINEL');
  if (!subsistema && cfg.subsistema) problemas.push('subsistema ausente');

  const trecho = normalizaTrecho(trechoBruto);
  const eixo = normalizaEixo(eixoBruto);
  const elev = formataElevacao(elevBruta);
  if (!trecho) problemas.push(`trecho fora da lista: ${trechoBruto}`);
  if (!eixo) problemas.push(`eixo fora da lista: ${eixoBruto}`);
  if (elev.aviso) problemas.push(elev.aviso);
  return {
    ok: true, bruto, escopo, subsistema, area: area.join(' - '), rds: rdsLista[0] || null, pais,
    local, elev: elev.valor, eixo, trecho,
    brutos: { elev: elevBruta, eixo: eixoBruto, trecho: trechoBruto }, problemas,
  };
}

/**
 * Decompõe uma TAG_LMR emitida: { escopo, tag, rdsTag, casoRds, descricao, ref }.
 * A descrição nova vem do Status; aqui interessa a TAG e se ela leva RDS-PP próprio.
 */
function decompoeTag(s, cfg) {
  let resto = String(s).trim();
  const ini = resto.match(/^(.+?)\s+-\s+/);
  let escopo = null;
  if (ini && semAcento(ini[1]).toUpperCase() === semAcento(cfg.escopo).toUpperCase()) { escopo = ini[1]; resto = resto.slice(ini[0].length); }
  if (cfg.subsistemaNaTag) {
    const sub = resto.match(/^(.+?)\s+-\s+/);
    if (sub && sub[1] === cfg.subsistemaNaTag) resto = resto.slice(sub[0].length);
  }
  let tag = null, rdsTag = null, casoRds = null;
  // {TAG} - RDS-PP: {RDS}{TAG} ...   ou   {TAG} - {RDS}-{TAG} - ... (Água Pura)
  let m = resto.match(/^(\S+)\s+-\s+(?:RDS-PP:\s*)?(#ST\S+)\s*(?:-\s+)?/);
  if (m) {
    tag = m[1];
    const rdsBruto = m[2];
    rdsTag = rdsBruto.endsWith(tag) ? rdsBruto.slice(0, -tag.length).replace(/-$/, '') : rdsBruto;
    casoRds = 1;
    resto = resto.slice(m[0].length);
  } else if ((m = resto.match(/^([A-Z0-9][A-Z0-9.()+\-/]{0,15}?)\s+-\s+(?=\S)/)) && /\d/.test(m[1]) && !/\s/.test(m[1])) {
    tag = m[1];
    resto = resto.slice(m[0].length);
  }
  const ref = (resto.match(/\(([^()]*)\)\s*$/) || [null, null])[1];
  return { escopo, tag, rdsTag, casoRds, descricao: resto.trim(), ref };
}

/**
 * Aplicação emitida → linhas decompostas (uma por linha da planilha).
 * Devolve { linhas[{pmib, cod, tag}], resumo }.
 */
function reconstroi(rowsAplicacao, cfg) {
  const linhas = [];
  const corpo = rowsAplicacao.slice(1).filter(r => r && r[0] != null);
  for (const r of corpo) {
    const pmib = txt(r[0]).replace(/^'/, '');
    linhas.push({ pmib, codigoBruto: r[1], tagBruta: r[2], cod: decompoeCodigo(r[1], cfg), tag: decompoeTag(r[2], cfg) });
  }
  const resumo = {
    linhas: linhas.length,
    semProblema: linhas.filter(l => l.cod.ok && !l.cod.problemas.length).length,
    problemas: contaProblemas(linhas),
  };
  return { linhas, resumo };
}

function contaProblemas(linhas) {
  const c = {};
  for (const l of linhas) for (const p of (l.cod.ok ? l.cod.problemas : l.cod.problemas)) {
    const k = p.replace(/"[^"]*"|: \S+$|\d+[,.]\d+/g, '…');
    c[k] = (c[k] || 0) + 1;
  }
  return c;
}

// ───────────────────────── 8. valida ─────────────────────────

/**
 * Valida linhas geradas (§6). ctx: { catalogo, relacoes, trechosProjeto }.
 * Devolve lista de { regra, severidade, pmib, linha, msg }.
 */
function valida(linhasGeradas, ctx) {
  const out = [];
  const cat = new Set(ctx.catalogo.map(c => c.pmib));
  const doProjeto = new Set((ctx.trechosProjeto || TRECHOS).map(t => t.trecho));
  const add = (regra, severidade, l, i, msg) => out.push({ regra, severidade, pmib: l.pmib, linha: i + 1, msg });
  linhasGeradas.forEach((l, i) => {
    const f = l.campos;
    for (const k of ['escopo', 'subsistema', 'local', 'elev', 'eixo', 'trecho', 'descricao']) {
      if (!f[k]) add('V1', 'bloqueia', l, i, `campo vazio: ${k}`);
    }
    if (!f.pais.length && (!f.area || !f.rds)) add('V1', 'bloqueia', l, i, 'ÁREA/PAINEL ou RDS-PP vazio');
    if (/\[XX\]/.test(l.codigo + l.tag)) add('V2', 'bloqueia', l, i, 'placeholder [XX] após expansão');
    const t = TRECHO_POR_NOME[f.trecho];
    for (const rds of [f.rds, ...f.pais.map(p => p.rds)]) {
      if (ctx.ref && rds && !rdsNaRef(rds, ctx.ref)) add('V3', 'aviso', l, i, `RDS-PP fora da REF-0013: ${rds}`);
      const p = partesRds(rds);
      if (p.m && !UG_POR_M[p.m] && !['M00', 'M50', 'M60'].includes(p.m)) add('V4', 'bloqueia', l, i, `M inválido no RDS-PP: ${p.m}`);
      if (p.m && t) {
        const ug = UG_POR_M[p.m];
        if (ug && t.m && ug.trecho !== t.trecho) add('V4', 'bloqueia', l, i, `${p.m} no RDS-PP com TRECHO ${t.trecho}`);
        if (ug && p.st && Number(p.st) !== ug.hz) add('V5', 'bloqueia', l, i, `#ST${p.st} com ${p.m}`);
        if (p.m === 'M50' && p.st !== '50' || p.m === 'M60' && p.st !== '60') add('V5', 'bloqueia', l, i, `#ST${p.st} com ${p.m}`);
      }
    }
    if (!cat.has(l.pmib)) add('V6', 'bloqueia', l, i, 'PMIB fora do catálogo (Status PMIB)');
    if (f.eixo && !EIXOS.includes(f.eixo)) add('V14', 'bloqueia', l, i, `eixo fora da lista: ${f.eixo}`);
    if (!TRECHO_POR_NOME[f.trecho]) add('V14', 'bloqueia', l, i, `trecho fora da lista: ${f.trecho}`);
    if (f.elev && !/^\d+,\d\d$/.test(f.elev)) add('V14', 'bloqueia', l, i, `elevação fora do formato: ${f.elev}`);
    if (f.local && !Object.values(LOCAIS).includes(f.local)) add('V14', 'bloqueia', l, i, `local fora da lista: ${f.local}`);
    if (TRECHO_POR_NOME[f.trecho] && !doProjeto.has(f.trecho)) add('V15', 'bloqueia', l, i, `trecho ${f.trecho} fora dos trechos do projeto`);
  });
  // V6: TAG de pai citada no CÓDIGO tem de existir como TAG de material na aplicação (pega QG001 × GQ001)
  const tags = ctx.tags || new Set(linhasGeradas.map(l => l.campos.tag).filter(Boolean).flatMap(t => t.split('/')));
  const avisados = new Set();
  linhasGeradas.forEach((l, i) => {
    for (const p of l.campos.pais) {
      if (!tags.has(p.tag) && !avisados.has(p.tag)) { avisados.add(p.tag); add('V6', 'aviso', l, i, `TAG do pai ${p.tag} não é TAG de nenhum material da aplicação`); }
    }
  });
  // V12: cobertura do catálogo
  const aplicados = new Set(linhasGeradas.map(l => l.pmib));
  for (const c of ctx.catalogo) if (!aplicados.has(c.pmib)) out.push({ regra: 'V12', severidade: 'aviso', pmib: c.pmib, linha: null, msg: `PMIB do Status sem aplicação: ${c.descricao}` });
  // V6 / R10: relações sem ciclo
  for (const ciclo of ciclos(ctx.relacoes || [])) out.push({ regra: 'V6', severidade: 'bloqueia', pmib: ciclo[0], linha: null, msg: `ciclo PAI/FILHO: ${ciclo.join(' → ')}` });
  return out;
}

function ciclos(relacoes) {
  const filhos = new Map();
  for (const r of relacoes) { if (!filhos.has(r.pmibPai)) filhos.set(r.pmibPai, []); filhos.get(r.pmibPai).push(r.pmibFilho); }
  const achados = [];
  const visita = (n, caminho) => {
    for (const f of filhos.get(n) || []) {
      if (caminho.includes(f)) { achados.push([...caminho, f]); continue; }
      if (caminho.length < 10) visita(f, [...caminho, f]);
    }
  };
  for (const p of filhos.keys()) visita(p, [p]);
  return achados;
}

// ───────────────────────── 9. compara ─────────────────────────

/**
 * Workflow C, nível 1: Status PMIB × PMIBs da Base.
 * Sugere EXCLUIR / INCLUIR / ALTERAR_CAMPO e pares de SUBSTITUIR_MATERIAL pela 1ª palavra da descrição.
 */
function comparaStatusBase(catalogo, pmibsBase, catalogoAnterior) {
  const novo = new Map(catalogo.map(c => [c.pmib, c]));
  const base = new Set(pmibsBase);
  const sai = [...base].filter(p => !novo.has(p)).map(p => ({ pmib: p, descricao: catalogoAnterior && catalogoAnterior.get(p) || '' }));
  const entra = catalogo.filter(c => !base.has(c.pmib)).map(c => ({ pmib: c.pmib, descricao: c.descricao }));
  const tipo = d => semAcento(txt(d)).toUpperCase().split(/[\s,]+/).slice(0, 2).join(' ');
  const sugestoes = [];
  const usados = new Set();
  for (const s of sai) {
    const par = entra.find(e => !usados.has(e.pmib) && s.descricao && tipo(e.descricao) === tipo(s.descricao));
    if (par) { usados.add(par.pmib); sugestoes.push({ tipo: 'SUBSTITUIR_MATERIAL', pmibAtual: s.pmib, pmibNovo: par.pmib, motivo: `mesmo tipo: ${tipo(par.descricao)}` }); }
    else sugestoes.push({ tipo: 'EXCLUIR', pmibAtual: s.pmib, motivo: 'PMIB saiu do Status PMIB' });
  }
  for (const e of entra) if (!usados.has(e.pmib)) sugestoes.push({ tipo: 'INCLUIR', pmibNovo: e.pmib, motivo: `novo no Status: ${e.descricao}` });
  return sugestoes;
}

/**
 * Assinatura de uma lista de linhas (FNV-1a 32 bits, em hexadecimal + nº de linhas).
 * Serve para conferir que o AMP gerou exatamente o mesmo que a máquina local, sem comparar linha a linha.
 */
function assinatura(linhas) {
  let h = 0x811c9dc5;
  for (const s of linhas) {
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= 10; h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${linhas.length}-${h.toString(16).padStart(8, '0').toUpperCase()}`;
}

// ───────────────────────── 10. regenera (Workflow B a partir de aplicação emitida) ─────────────────────────

/**
 * Descobre o escopo e o subsistema do estilo antigo pelo que mais se repete no início do CÓDIGO_LMR.
 * Subsistema só conta se estiver em 60%+ das linhas (a SFC não tem subsistema).
 */
function detectaEstiloAntigo(rowsAplicacao) {
  const corpo = rowsAplicacao.slice(1).filter(r => r && r[0] != null);
  const conta = arr => arr.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
  const maisComum = m => [...m.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const segs = corpo.map(r => String(r[1]).split(/\s+-\s+/).map(s => s.trim()));
  const [escopo] = maisComum(conta(segs.map(s => s[0])));
  const seg1 = segs.filter(s => s[0] === escopo).map(s => s[1]).filter(s => s && !/^RDS-PP/.test(s) && !RE_TAG.test(s));
  const [sub, n] = maisComum(conta(seg1));
  const subsistema = n >= 0.6 * corpo.length ? sub : null;
  const tags = corpo.map(r => String(r[2]).split(/\s+-\s+/));
  const naTag = subsistema && tags.filter(t => t[1] === subsistema).length >= 0.6 * corpo.length;
  return { escopo, subsistema, subsistemaNaTag: naTag ? subsistema : undefined };
}

/** DOCS DE REFERÊNCIA da aplicação emitida → { topo, porPmib: {pmib: {doc, qtd, obs}} }. */
function lerDocsAntigos(rows) {
  const topo = {}, porPmib = {};
  if (!rows || !rows.length) return { topo, porPmib };
  const hi = rows.findIndex(r => r && txt(r[0]) === 'CÓDIGO PMIB');
  for (const r of rows.slice(0, Math.max(hi, 0))) if (r && txt(r[0])) topo[txt(r[0]).replace(/:$/, '').toUpperCase()] = txt(r.slice(1).find(c => txt(c)));
  for (const r of rows.slice(hi + 1)) {
    const p = r && txt(r[0]).replace(/^'/, '');
    if (p && !porPmib[p]) porPmib[p] = { doc: txt(r[3]) || null, qtd: r[4] ?? null, obs: txt(r[5]) || null };
  }
  return { topo, porPmib };
}

/** O que mudou do estilo antigo para o padrão v1.4 (aba DIFERENÇAS). */
function mudancas(rec, l) {
  const c = rec.cod, f = l.campos, out = [];
  const b = c.brutos || {};
  if (b.trecho && b.trecho !== f.trecho) out.push(`trecho ${b.trecho}→${f.trecho || '?'}`);
  if (b.eixo && b.eixo !== f.eixo) out.push(`eixo ${b.eixo}→${f.eixo || '?'}`);
  if (b.elev && b.elev !== f.elev) out.push(`elev. ${b.elev}→${f.elev || '?'}`);
  if (!/ - (CASA DE FORÇA|SALA GERADORES DIESEL) - ELEV/.test(rec.codigoBruto) || /UNIDADE GERADORA - ELEV/i.test(rec.codigoBruto)) out.push(`local→${f.local || '?'}`);
  if (!String(rec.codigoBruto).startsWith(`${f.escopo} - ${f.subsistema} - `)) out.push('escopo/subsistema do formulário');
  if (/RDS-PP:#|RDS-PP: {2,}/.test(rec.codigoBruto)) out.push('separador RDS-PP');
  if (/\)\s*$/.test(rec.tagBruta) && !/\)\s*$/.test(l.tag)) out.push('TAG sem (REF)');
  if (rec.tag.casoRds && !/RDS-PP: /.test(rec.tagBruta)) out.push('TAG com "RDS-PP: " e TAG concatenada');
  const descAntiga = rec.tag.descricao.replace(/\s*\([^()]*\)\s*$/, '').trim();
  if (f.descricao && descAntiga.toUpperCase() !== f.descricao.toUpperCase()) out.push('descrição do Status PMIB');
  if (!f.descricao) out.push('PMIB fora do Status: sem descrição');
  return out;
}

/**
 * Aplicação emitida + Status PMIB → aplicação no padrão v1.4 com todas as abas de saída.
 * e = { statusRows, appRows, docsRows?, refRows?, escopo, subsistema, trechos, listaTrechos? }
 * Devolve { resumo, aplicacao[], validacao[], diferencas[], docs[], relacoes[], alteracoes[] } — cada aba = lista de objetos.
 */
function regeneraAplicacao(e) {
  const status = lerStatusPmib(e.statusRows);
  const cat = new Map(status.catalogo.map(c => [c.pmib, c]));
  const estilo = detectaEstiloAntigo(e.appRows);
  const rec = reconstroi(e.appRows, estilo);
  const lista = e.listaTrechos ? String(e.listaTrechos).split(/[,;\s]+/).filter(Boolean) : null;
  const trechosProjeto = trechosDoProjeto(e.trechos || 'TODAS', lista);
  const ref = e.refRows && e.refRows.length ? indiceRef(e.refRows) : null;

  const linhas = rec.linhas.filter(l => l.cod.ok).map(l => {
    const c = l.cod;
    const campos = {
      escopo: e.escopo, subsistema: e.subsistema, area: c.area, rds: c.rds, pais: c.pais.map(p => ({ tag: p.tag, rds: p.rds })),
      local: c.local, elev: c.elev, eixo: c.eixo, trecho: c.trecho,
      tag: l.tag.tag, casoRds: l.tag.casoRds, descricao: cat.has(l.pmib) ? cat.get(l.pmib).descricao : null,
      pn: cat.has(l.pmib) ? cat.get(l.pmib).codigoMaterial : null,
    };
    return { pmib: l.pmib, codigo: montaCodigo(campos), tag: montaTag(campos), campos, rec: l };
  });
  const naoLidas = rec.linhas.filter(l => !l.cod.ok);
  const v = valida(linhas, { catalogo: status.catalogo, relacoes: status.relacoes, trechosProjeto, ref });
  const bloqueadas = new Set(v.filter(x => x.severidade === 'bloqueia').map(x => x.linha));

  const tagsPorPmib = {};
  for (const l of linhas) if (l.campos.tag) (tagsPorPmib[l.pmib] = tagsPorPmib[l.pmib] || new Set()).add(l.campos.tag);
  const antigos = lerDocsAntigos(e.docsRows);
  const alteracoes = comparaStatusBase(status.catalogo, [...new Set(rec.linhas.map(l => l.pmib))], new Map(rec.linhas.map(l => [l.pmib, l.tag.descricao])));

  const porRegra = {};
  for (const x of v) porRegra[x.regra] = (porRegra[x.regra] || 0) + 1;
  return {
    resumo: {
      assinatura: assinatura(linhas.map(l => `${l.pmib}|${l.codigo}|${l.tag}`)),
      lista: status.lista, revisao: status.revisao, pmibsNoStatus: status.catalogo.length, relacoesDocumentais: status.relacoes.length,
      estiloAntigo: estilo, linhasEmitidas: rec.linhas.length, linhasNaoLidas: naoLidas.length, linhasGeradas: linhas.length,
      linhasBloqueadas: bloqueadas.size, achadosPorRegra: porRegra, ref0013: ref ? `${ref.size} códigos` : 'não enviada (V3 não roda)',
      trechosDoProjeto: trechosProjeto.map(t => t.trecho).join(', '), avisosDoStatus: status.avisos,
    },
    aplicacao: linhas.map(l => ({ FICHA_PMIB: l.pmib, 'CÓDIGO_LMR': l.codigo, TAG_LMR: l.tag })),
    validacao: [
      ...v.map(x => ({ LINHA: x.linha ? x.linha + 1 : '', PMIB: x.pmib, REGRA: x.regra, SEVERIDADE: x.severidade, MENSAGEM: x.msg })),
      ...naoLidas.map(l => ({ LINHA: '', PMIB: l.pmib, REGRA: 'LEITURA', SEVERIDADE: 'bloqueia', MENSAGEM: `não decomposta: ${l.codigoBruto}` })),
    ],
    diferencas: linhas.map((l, i) => ({
      LINHA: i + 2, PMIB: l.pmib, 'CÓDIGO_LMR ANTIGO': l.rec.codigoBruto, 'CÓDIGO_LMR v1.4': l.codigo,
      'TAG_LMR ANTIGA': l.rec.tagBruta, 'TAG_LMR v1.4': l.tag, 'O QUE MUDOU': mudancas(l.rec, l).join('; '),
    })),
    docs: status.catalogo.map(c => {
      const a = antigos.porPmib[c.pmib] || {};
      return {
        'CÓDIGO PMIB': c.pmib, 'PART NUMBER': c.codigoMaterial, 'DESCRIÇÃO DO MATERIAL': c.descricao,
        'RDS-PP DOCUMENTO - PRINCIPAL': a.doc || '', QTD: a.qtd ?? '', TAGS: [...(tagsPorPmib[c.pmib] || [])].sort().join(', '),
        'OBSERVAÇÕES': a.obs || (a.doc ? '' : 'documento principal não encontrado'),
      };
    }),
    relacoes: status.relacoes.map(r => ({ 'PMIB PAI': r.pmibPai, 'PMIB FILHO': r.pmibFilho, CATEGORIA: r.categoria, 'SEÇÃO': r.secao, 'ITEM NO STATUS': r.itemNoStatus, FONTE: r.fonte })),
    alteracoes: alteracoes.map(s => ({ TIPO: s.tipo, 'PMIB ATUAL': s.pmibAtual || '', 'PMIB NOVO': s.pmibNovo || '', MOTIVO: s.motivo })),
  };
}

// ───────────────────────── 11. base (uma linha por material/TAG; o AMP só expande) ─────────────────────────

/** Colunas da aba BASE do arquivo da Base. Cada linha vira QTD POR TRECHO × TRECHOS linhas da aplicação. */
const COLUNAS_BASE = ['LINHA', 'ESCOPO', 'SUBSISTEMA', 'FICHA_PMIB', 'DESCRIÇÃO', 'ÁREA/PAINEL', 'RDS-PP', 'TAG', 'TAG COM RDS-PP',
  'PAIS', 'LOCAL', 'ELEVAÇÃO', 'EIXO', 'TRECHOS', 'QTD POR TRECHO'];

/** RDS-PP do trecho → forma com [XX], só quando o M e o #ST batem com o trecho (senão fica literal e a V4/V5 aponta). */
function rdsDoModelo(rds, trecho) {
  const t = TRECHO_POR_NOME[trecho];
  const p = partesRds(rds);
  if (t && t.m && p.m === t.m && Number(p.st) === t.hz) return rdsGenerico(rds);
  return txt(rds) || null;
}

/**
 * Aplicação emitida + Status PMIB → Base (função R, roda uma vez por sistema, fora do AMP).
 * Agrupa as linhas iguais a menos do trecho; trechos com a mesma QTD ficam na mesma linha da Base.
 * Devolve { modelos[], naoLidas[], status, estilo }.
 */
function baseDaAplicacao(e) {
  const status = lerStatusPmib(e.statusRows);
  const cat = new Map(status.catalogo.map(c => [c.pmib, c]));
  const estilo = detectaEstiloAntigo(e.appRows);
  const rec = reconstroi(e.appRows, estilo);
  const grupos = new Map();
  const naoLidas = [];
  for (const l of rec.linhas) {
    if (!l.cod.ok) { naoLidas.push(l); continue; }
    const c = l.cod, tr = c.trecho || '[?]';
    const m = {
      pmib: l.pmib, descricao: cat.has(l.pmib) ? cat.get(l.pmib).descricao : null, area: c.area || null, rds: rdsDoModelo(c.rds, tr),
      tag: l.tag.tag || null, casoRds: l.tag.casoRds ? 1 : null, pais: c.pais.map(p => ({ tag: p.tag, rds: rdsDoModelo(p.rds, tr) })),
      local: c.local, elev: c.elev, eixo: c.eixo,
    };
    const k = JSON.stringify(m);
    if (!grupos.has(k)) grupos.set(k, { m, porTrecho: new Map() });
    const g = grupos.get(k);
    g.porTrecho.set(tr, (g.porTrecho.get(tr) || 0) + 1);
  }
  const ordem = n => (TRECHOS.indexOf(TRECHO_POR_NOME[n]) + 1) || 99;
  const modelos = [];
  for (const { m, porTrecho } of grupos.values()) {
    const porQtd = new Map();
    for (const [tr, q] of porTrecho) (porQtd.get(q) || porQtd.set(q, []).get(q)).push(tr);
    for (const [qtd, trs] of porQtd) {
      modelos.push({ ...m, escopo: e.escopo, subsistema: e.subsistema, trechos: trs.sort((a, b) => ordem(a) - ordem(b)), qtd, linha: modelos.length + 1 });
    }
  }
  return { modelos, naoLidas, status, estilo };
}

/** Modelo → linha da aba BASE. */
function modeloParaLinha(m) {
  return {
    LINHA: m.linha, ESCOPO: m.escopo, SUBSISTEMA: m.subsistema, FICHA_PMIB: m.pmib, 'DESCRIÇÃO': m.descricao || '',
    'ÁREA/PAINEL': m.area || '', 'RDS-PP': m.rds || '', TAG: m.tag || '', 'TAG COM RDS-PP': m.casoRds ? 'SIM' : 'NÃO',
    PAIS: (m.pais || []).map(p => `${p.tag} | ${p.rds || ''}`).join(' ; '), LOCAL: m.local || '', 'ELEVAÇÃO': m.elev || '',
    EIXO: m.eixo || '', TRECHOS: m.trechos.join(', '), 'QTD POR TRECHO': m.qtd,
  };
}

/** Linha da aba BASE (como o Extract from File entrega, com cabeçalho) → modelo. */
function linhaParaModelo(r) {
  const v = k => txt(r[k]) || null;
  return {
    linha: Number(r.LINHA) || null, escopo: v('ESCOPO'), subsistema: v('SUBSISTEMA'), pmib: txt(r.FICHA_PMIB).replace(/^'/, ''),
    descricao: v('DESCRIÇÃO'), area: v('ÁREA/PAINEL'), rds: v('RDS-PP'), tag: v('TAG'),
    casoRds: /^S/i.test(txt(r['TAG COM RDS-PP'])) ? 1 : null,
    pais: txt(r.PAIS) ? txt(r.PAIS).split(/\s*;\s*/).filter(Boolean).map(p => { const [tag, rds] = p.split(/\s*\|\s*/); return { tag: txt(tag), rds: txt(rds) || null }; }) : [],
    local: v('LOCAL'), elev: formataElevacao(r['ELEVAÇÃO']).valor || v('ELEVAÇÃO'), eixo: v('EIXO'),
    trechos: txt(r.TRECHOS).split(/[,;\s]+/).filter(Boolean),
    qtd: Number(r['QTD POR TRECHO']),
  };
}

/** Modelo → linhas da aplicação (QTD POR TRECHO linhas iguais em cada trecho, na ordem física). */
function geraModelo(m) {
  const out = [];
  for (const nome of m.trechos) {
    const t = TRECHO_POR_NOME[normalizaTrecho(nome)];
    const l = {
      escopo: m.escopo, subsistema: m.subsistema, area: m.area, rds: expandeRds(m.rds, t ? t.trecho : nome),
      pais: (m.pais || []).map(p => ({ tag: p.tag, rds: expandeRds(p.rds, t ? t.trecho : nome) })),
      local: m.local, elev: m.elev, eixo: m.eixo, trecho: t ? t.trecho : null, tag: m.tag, casoRds: m.casoRds, descricao: m.descricao, pn: m.pn,
    };
    const linha = { pmib: m.pmib, codigo: montaCodigo(l), tag: montaTag(l), campos: l, origem: m.linha };
    for (let k = 0; k < m.qtd; k++) out.push(linha);
  }
  return out;
}

/** FNV-1a de uma linha. A assinatura da Base soma os hashes: não depende da ordem nem do tamanho do lote. */
function hashLinha(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
function assinaturaSoma(n, soma) { return `${n}-${(soma % 4294967296).toString(16).padStart(8, '0').toUpperCase()}`; }

/**
 * Um lote de linhas da Base → um item por linha da Base, com as linhas da aplicação e os achados.
 * tagsDaBase: Set das TAGs de material da Base inteira (V6: TAG do pai tem de existir).
 * É o que o nó Code do Workflow B faz a cada volta do Loop.
 */
// pnPorPmib: Map PMIB → PART NUMBER (aba DOCS DE REFERÊNCIA da Base); opcional
function geraLote(linhasBase, tagsDaBase, pnPorPmib) {
  return linhasBase.map(r => {
    const m = linhaParaModelo(r);
    m.pn = pnPorPmib ? pnPorPmib.get(m.pmib) : null;
    const problemas = [];
    if (!(m.qtd >= 1)) problemas.push({ regra: 'V1', severidade: 'bloqueia', msg: 'QTD POR TRECHO vazia ou menor que 1' });
    if (!m.trechos.length) problemas.push({ regra: 'V1', severidade: 'bloqueia', msg: 'TRECHOS vazio' });
    const linhas = problemas.length ? [] : geraModelo(m);
    const v = valida(linhas, { catalogo: linhas.length ? [{ pmib: m.pmib }] : [], relacoes: [], tags: tagsDaBase });
    const bloq = new Set(v.filter(x => x.severidade === 'bloqueia').map(x => x.linha));
    let h = 0;
    for (const l of linhas) h = (h + hashLinha(`${l.pmib}|${l.codigo}|${l.tag}`)) % 4294967296;
    const vistos = new Set();
    const achados = [...problemas.map(p => ({ ...p, trecho: '' })), ...v.map(x => ({ ...x, trecho: x.linha ? linhas[x.linha - 1].campos.trecho || '' : '' }))]
      .filter(x => { const k = `${x.regra}|${x.trecho}|${x.msg}`; return !vistos.has(k) && vistos.add(k); })
      .map(x => ({ 'LINHA DA BASE': m.linha, FICHA_PMIB: m.pmib, TRECHO: x.trecho, REGRA: x.regra, SEVERIDADE: x.severidade, MENSAGEM: x.msg }));
    return {
      LINHA: m.linha, n: linhas.length, h, bloqueadas: bloq.size + (problemas.length ? 1 : 0),
      linhas: linhas.map(l => ({ FICHA_PMIB: l.pmib, 'CÓDIGO_LMR': l.codigo, TAG_LMR: l.tag })), achados,
    };
  });
}

// ───────────────────────── 12. alterações (Workflow C: comparar e aplicar sobre a Base) ─────────────────────────

const COLUNAS_ALTERACOES = ['Nº', 'TIPO', 'APLICAR', 'PMIB ATUAL', 'PMIB NOVO', 'DESCRIÇÃO NOVA', 'PART NUMBER NOVO',
  'TRECHOS', 'QTD POR TRECHO', 'COPIAR POSIÇÕES DE', 'ONDE NA BASE', 'MOTIVO'];
const TIPOS_ALTERACAO = ['SUBSTITUIR_MATERIAL', 'EXCLUIR', 'INCLUIR', 'ALTERAR_QTD', 'ATUALIZAR_DESCRICAO', 'ATUALIZAR_PART_NUMBER'];
const COLUNAS_HISTORICO = ['DATA', 'Nº', 'TIPO', 'PMIB ATUAL', 'PMIB NOVO', 'TRECHOS', 'LINHAS DA BASE', 'RESULTADO'];
const COLUNAS_DIFERENCAS = ['Nº', 'TIPO', 'PMIB ATUAL', 'PMIB NOVO', 'TRECHOS AFETADOS', 'LINHAS DA APLICAÇÃO ANTES', 'LINHAS DA APLICAÇÃO DEPOIS'];

const pmibDe = v => txt(v).replace(/^'/, '');
const trechosDaLinha = r => txt(r.TRECHOS).split(/[,;\s]+/).filter(Boolean);
const linhasDaAplicacao = r => trechosDaLinha(r).length * (Number(r['QTD POR TRECHO']) || 0);

/** "ÍMPARES", "PARES", "TODAS", "AMD", "AMC" ou lista de trechos → Set de nomes; vazio → null (todos). */
function filtroTrechos(v) {
  const s = semAcento(txt(v)).toUpperCase();
  if (!s) return null;
  if (['TODAS', 'IMPARES', 'PARES', 'AMD', 'AMC'].includes(s)) return new Set(trechosDoProjeto(s).map(t => t.trecho));
  const nomes = s.split(/[,;\s]+/).filter(Boolean).map(n => normalizaTrecho(n));
  if (nomes.includes(null)) throw new Error(`trecho inválido em TRECHOS: ${v}`);
  return new Set(nomes);
}

/** Onde um PMIB aparece na BASE: "linhas 12, 13 (TAGs GQ001, GQ002)". */
function ondeNaBase(base, pmib) {
  const rs = base.filter(r => pmibDe(r.FICHA_PMIB) === pmib);
  if (!rs.length) return 'não está na BASE';
  const tags = [...new Set(rs.map(r => txt(r.TAG)).filter(Boolean))];
  return `linhas ${rs.map(r => r.LINHA).join(', ')}${tags.length ? ` (TAGs ${tags.join(', ')})` : ''}`;
}

/**
 * C1: Status PMIB novo × Base → planilha ALTERAÇÕES (uma sugestão por linha, coluna APLICAR para decidir).
 * Descrição e part number seguem o Status (decisão 29): APLICAR = SIM. O resto fica em branco para confirmar.
 * e = { statusRows, base: linhas da aba BASE, docs: linhas da DOCS DE REFERÊNCIA, relacoes? }
 */
function comparaBaseStatus(e) {
  const st = lerStatusPmib(e.statusRows);
  const cat = new Map(st.catalogo.map(c => [c.pmib, c]));
  const base = e.base.filter(r => pmibDe(r.FICHA_PMIB));
  const docs = new Map((e.docs || []).map(d => [pmibDe(d['CÓDIGO PMIB']), d]));
  const naBase = [...new Set(base.map(r => pmibDe(r.FICHA_PMIB)))];
  const conhecidos = new Set([...naBase, ...docs.keys()]);
  const descAtual = new Map(base.map(r => [pmibDe(r.FICHA_PMIB), txt(r['DESCRIÇÃO'])]));
  for (const [p, d] of docs) if (!descAtual.get(p)) descAtual.set(p, txt(d['DESCRIÇÃO DO MATERIAL']));
  const out = [];
  const add = o => out.push({ 'Nº': out.length + 1, APLICAR: '', 'PMIB ATUAL': '', 'PMIB NOVO': '', 'DESCRIÇÃO NOVA': '', 'PART NUMBER NOVO': '',
    TRECHOS: '', 'QTD POR TRECHO': '', 'COPIAR POSIÇÕES DE': '', 'ONDE NA BASE': '', ...o });

  for (const p of conhecidos) {
    const c = cat.get(p);
    if (!c) continue;
    if (txt(c.descricao) && txt(c.descricao) !== descAtual.get(p)) {
      add({ TIPO: 'ATUALIZAR_DESCRICAO', APLICAR: 'SIM', 'PMIB ATUAL': p, 'DESCRIÇÃO NOVA': c.descricao, 'ONDE NA BASE': ondeNaBase(base, p), MOTIVO: `descrição no Status mudou (antes: ${descAtual.get(p) || 'vazia'})` });
    }
    const d = docs.get(p);
    if (d && txt(c.codigoMaterial) && txt(c.codigoMaterial) !== txt(d['PART NUMBER'])) {
      add({ TIPO: 'ATUALIZAR_PART_NUMBER', APLICAR: 'SIM', 'PMIB ATUAL': p, 'PART NUMBER NOVO': c.codigoMaterial, MOTIVO: `part number no Status mudou (antes: ${txt(d['PART NUMBER']) || 'vazio'})` });
    }
  }
  // sai = está na Base (BASE ou DOCS) e não no Status; entra = está no Status e não tem posição na BASE
  const sai = [...conhecidos].filter(p => !cat.has(p));
  const entra = st.catalogo.filter(c => !naBase.includes(c.pmib));
  const tipoDe = d => semAcento(txt(d)).toUpperCase().split(/[\s,]+/).slice(0, 2).join(' ');
  const pares = new Map();
  for (const p of sai) {
    const par = descAtual.get(p) && entra.find(c => ![...pares.values()].includes(c.pmib) && tipoDe(c.descricao) === tipoDe(descAtual.get(p)));
    if (par) pares.set(p, par.pmib);
  }
  for (const p of sai) {
    const n = pares.has(p) ? cat.get(pares.get(p)) : null;
    add(n
      ? { TIPO: 'SUBSTITUIR_MATERIAL', 'PMIB ATUAL': p, 'PMIB NOVO': n.pmib, 'DESCRIÇÃO NOVA': n.descricao, 'PART NUMBER NOVO': n.codigoMaterial, 'ONDE NA BASE': ondeNaBase(base, p), MOTIVO: `saiu do Status; ${n.pmib} entrou com o mesmo tipo (${tipoDe(n.descricao)})` }
      : { TIPO: 'EXCLUIR', 'PMIB ATUAL': p, 'ONDE NA BASE': ondeNaBase(base, p), MOTIVO: 'saiu do Status PMIB. Se foi trocado por um PMIB novo, mude TIPO para SUBSTITUIR_MATERIAL e preencha PMIB NOVO' });
  }
  for (const c of entra) {
    if ([...pares.values()].includes(c.pmib)) continue;
    add({ TIPO: 'INCLUIR', 'PMIB NOVO': c.pmib, 'DESCRIÇÃO NOVA': c.descricao, 'PART NUMBER NOVO': c.codigoMaterial,
      MOTIVO: `${docs.has(c.pmib) ? 'está no Status e na DOCS, sem posição na BASE' : 'novo no Status'}: ${c.descricao}. Para entrar na aplicação: COPIAR POSIÇÕES DE (PMIB) ou use SUBSTITUIR_MATERIAL a partir do PMIB que ele troca` });
  }
  // relações documentais novas (pai–filho) só informam: a BASE cita o pai pela TAG, e isso pede revisão
  const temRel = new Set((e.relacoes || []).map(r => `${pmibDe(r['PMIB PAI'])}>${pmibDe(r['PMIB FILHO'])}`));
  for (const r of st.relacoes) {
    if (temRel.has(`${r.pmibPai}>${r.pmibFilho}`) || !(e.relacoes || []).length) continue;
    add({ TIPO: 'REVISAR_RELACAO', APLICAR: 'NÃO', 'PMIB ATUAL': r.pmibFilho, 'PMIB NOVO': r.pmibPai, MOTIVO: `nova relação no Status: ${r.pmibFilho} é filho de ${r.pmibPai} (item ${r.itemNoStatus}). Ajuste PAIS na BASE à mão.` });
  }
  return { alteracoes: out, resumo: { lista: st.lista, revisao: st.revisao, pmibsNoStatus: st.catalogo.length, pmibsNaBase: naBase.length, avisos: st.avisos } };
}

/**
 * C2: Base + ALTERAÇÕES (com APLICAR = SIM) → Base nova + HISTÓRICO + DIFERENÇAS.
 * e = { base, docs, relacoes, historico, alteracoes, data: 'AAAA-MM-DD' }. Linhas com APLICAR ≠ SIM ficam de fora.
 * TRECHOS restringe a alteração (ÍMPARES, PARES, lista); a linha da BASE é dividida quando preciso.
 */
function aplicaAlteracoes(e) {
  let base = e.base.filter(r => pmibDe(r.FICHA_PMIB)).map(r => ({ ...r, FICHA_PMIB: pmibDe(r.FICHA_PMIB) }));
  let docs = (e.docs || []).filter(d => pmibDe(d['CÓDIGO PMIB'])).map(d => ({ ...d, 'CÓDIGO PMIB': pmibDe(d['CÓDIGO PMIB']) }));
  let relacoes = (e.relacoes || []).map(r => ({ ...r }));
  const historico = (e.historico || []).slice();
  const diferencas = [];
  const avisos = [];
  const hoje = e.data || new Date().toISOString().slice(0, 10);

  // divide as linhas da BASE do PMIB pelo filtro de trechos: devolve as partes que entram na alteração
  const separa = (pmib, filtro) => {
    const alvo = [];
    const nova = [];
    for (const r of base) {
      if (r.FICHA_PMIB !== pmib) { nova.push(r); continue; }
      const trs = trechosDaLinha(r);
      const dentro = filtro ? trs.filter(t => filtro.has(normalizaTrecho(t) || t)) : trs;
      const fora = trs.filter(t => !dentro.includes(t));
      if (!dentro.length) { nova.push(r); continue; }
      if (fora.length) nova.push({ ...r, TRECHOS: fora.join(', ') });
      const parte = { ...r, TRECHOS: dentro.join(', ') };
      nova.push(parte);
      alvo.push(parte);
    }
    base = nova;
    return alvo;
  };
  const doc = p => docs.find(d => d['CÓDIGO PMIB'] === p);
  const usado = p => base.some(r => r.FICHA_PMIB === p);
  const novaLinhaDocs = (p, a, modelo) => {
    if (doc(p)) return;
    docs.push({
      'CÓDIGO PMIB': p, 'PART NUMBER': txt(a['PART NUMBER NOVO']), 'DESCRIÇÃO DO MATERIAL': txt(a['DESCRIÇÃO NOVA']),
      'RDS-PP DOCUMENTO - PRINCIPAL': modelo ? modelo['RDS-PP DOCUMENTO - PRINCIPAL'] || '' : '', QTD: modelo ? modelo.QTD ?? '' : '',
      TAGS: '', 'OBSERVAÇÕES': modelo ? `herdou o documento de ${modelo['CÓDIGO PMIB']}` : 'documento principal a definir',
    });
  };

  for (const a of e.alteracoes) {
    const tipo = semAcento(txt(a.TIPO)).toUpperCase();
    if (!tipo) continue;
    const reg = (resultado, linhas = '', trechos = '') => historico.push({
      DATA: hoje, 'Nº': a['Nº'], TIPO: tipo, 'PMIB ATUAL': pmibDe(a['PMIB ATUAL']), 'PMIB NOVO': pmibDe(a['PMIB NOVO']), TRECHOS: trechos || txt(a.TRECHOS) || 'todos', 'LINHAS DA BASE': linhas, RESULTADO: resultado });
    if (semAcento(txt(a.APLICAR)).toUpperCase() !== 'SIM') { reg(`ignorada: APLICAR = ${txt(a.APLICAR) || 'vazio'}`); continue; }
    const atual = pmibDe(a['PMIB ATUAL']);
    const novo = pmibDe(a['PMIB NOVO']);
    let filtro;
    try { filtro = filtroTrechos(a.TRECHOS); } catch (err) { reg(`não aplicada: ${err.message}`); continue; }
    const dif = (antes, depois, partes) => diferencas.push({ 'Nº': a['Nº'], TIPO: tipo, 'PMIB ATUAL': atual, 'PMIB NOVO': novo,
      'TRECHOS AFETADOS': [...new Set(partes.flatMap(trechosDaLinha))].join(', '), 'LINHAS DA APLICAÇÃO ANTES': antes, 'LINHAS DA APLICAÇÃO DEPOIS': depois });

    if (tipo === 'SUBSTITUIR_MATERIAL') {
      if (!atual || !novo || !RE_PMIB.test(novo)) { reg('não aplicada: PMIB ATUAL e PMIB NOVO (formato 4500063671.0000) são obrigatórios'); continue; }
      if (!usado(atual)) { reg('não aplicada: PMIB ATUAL não está na BASE'); continue; }
      const modeloDocs = doc(atual);
      const partes = separa(atual, filtro);
      if (!partes.length) { reg('não aplicada: nenhum trecho do PMIB ATUAL dentro de TRECHOS'); continue; }
      const descNova = txt(a['DESCRIÇÃO NOVA']) || (doc(novo) || {})['DESCRIÇÃO DO MATERIAL'] || '';
      for (const r of partes) { r.FICHA_PMIB = novo; r['DESCRIÇÃO'] = descNova; }
      relacoes = relacoes.map(r => (filtro ? r : { ...r, 'PMIB PAI': pmibDe(r['PMIB PAI']) === atual ? novo : r['PMIB PAI'], 'PMIB FILHO': pmibDe(r['PMIB FILHO']) === atual ? novo : r['PMIB FILHO'] }));
      novaLinhaDocs(novo, { ...a, 'DESCRIÇÃO NOVA': descNova }, modeloDocs);
      if (!usado(atual)) docs = docs.filter(d => d['CÓDIGO PMIB'] !== atual);
      const n = partes.reduce((s, r) => s + linhasDaAplicacao(r), 0);
      dif(n, n, partes);
      reg(`aplicada: ${partes.length} linha(s) da BASE trocadas`, partes.map(r => r.LINHA).join(', '));
    } else if (tipo === 'EXCLUIR') {
      if (!usado(atual)) {
        if (doc(atual)) { docs = docs.filter(d => d['CÓDIGO PMIB'] !== atual); reg('aplicada: só estava na DOCS DE REFERÊNCIA'); } else reg('não aplicada: PMIB ATUAL não está na BASE');
        continue;
      }
      const partes = separa(atual, filtro);
      const tags = new Set(partes.map(r => txt(r.TAG)).filter(Boolean));
      base = base.filter(r => !partes.includes(r));
      const orfaos = base.filter(r => txt(r.PAIS).split(/\s*;\s*/).some(p => tags.has(txt(p.split('|')[0]))));
      if (orfaos.length && !usado(atual)) avisos.push(`Nº ${a['Nº']}: ${atual} era pai de ${orfaos.length} linha(s) da BASE (${[...new Set(orfaos.map(r => r.FICHA_PMIB))].join(', ')}): revisar PAIS`);
      if (!usado(atual)) { docs = docs.filter(d => d['CÓDIGO PMIB'] !== atual); relacoes = relacoes.filter(r => pmibDe(r['PMIB PAI']) !== atual && pmibDe(r['PMIB FILHO']) !== atual); }
      dif(partes.reduce((s, r) => s + linhasDaAplicacao(r), 0), 0, partes);
      reg(`aplicada: ${partes.length} linha(s) da BASE removidas${orfaos.length ? ' — ver aviso de PAIS' : ''}`, partes.map(r => r.LINHA).join(', '));
    } else if (tipo === 'INCLUIR') {
      if (!novo || !RE_PMIB.test(novo)) { reg('não aplicada: PMIB NOVO obrigatório'); continue; }
      const modelo = pmibDe(a['COPIAR POSIÇÕES DE']);
      if (!modelo) { novaLinhaDocs(novo, a, null); reg('aplicada só na DOCS DE REFERÊNCIA: sem COPIAR POSIÇÕES DE, o material não entra na aplicação (posição a definir)'); continue; }
      if (!usado(modelo)) { reg(`não aplicada: COPIAR POSIÇÕES DE ${modelo} não está na BASE`); continue; }
      const qtd = Number(txt(a['QTD POR TRECHO']).replace(',', '.'));
      const copias = [];
      const nova = [];
      for (const r of base) {
        nova.push(r);
        if (r.FICHA_PMIB !== modelo) continue;
        const trs = trechosDaLinha(r).filter(t => !filtro || filtro.has(normalizaTrecho(t) || t));
        if (!trs.length) continue;
        const c = { ...r, FICHA_PMIB: novo, 'DESCRIÇÃO': txt(a['DESCRIÇÃO NOVA']), TRECHOS: trs.join(', '), 'QTD POR TRECHO': qtd >= 1 ? qtd : r['QTD POR TRECHO'] };
        copias.push(c);
        nova.push(c);
      }
      base = nova;
      novaLinhaDocs(novo, a, doc(modelo));
      dif(0, copias.reduce((s, r) => s + linhasDaAplicacao(r), 0), copias);
      reg(`aplicada: ${copias.length} linha(s) da BASE novas, nas posições de ${modelo}`, copias.map(r => `após ${r.LINHA}`).join(', '));
    } else if (tipo === 'ALTERAR_QTD') {
      const qtd = Number(txt(a['QTD POR TRECHO']).replace(',', '.'));
      if (!(qtd >= 1) || !Number.isInteger(qtd)) { reg('não aplicada: QTD POR TRECHO tem de ser inteiro ≥ 1'); continue; }
      if (!usado(atual)) { reg('não aplicada: PMIB ATUAL não está na BASE'); continue; }
      const partes = separa(atual, filtro);
      const antes = partes.reduce((s, r) => s + linhasDaAplicacao(r), 0);
      for (const r of partes) r['QTD POR TRECHO'] = qtd;
      dif(antes, partes.reduce((s, r) => s + linhasDaAplicacao(r), 0), partes);
      reg(`aplicada: QTD ${qtd} em ${partes.length} linha(s) da BASE`, partes.map(r => r.LINHA).join(', '));
    } else if (tipo === 'ATUALIZAR_DESCRICAO') {
      const d = txt(a['DESCRIÇÃO NOVA']);
      if (!d) { reg('não aplicada: DESCRIÇÃO NOVA vazia'); continue; }
      const partes = base.filter(r => r.FICHA_PMIB === atual);
      for (const r of partes) r['DESCRIÇÃO'] = d;
      if (doc(atual)) doc(atual)['DESCRIÇÃO DO MATERIAL'] = d;
      if (partes.length) dif(partes.reduce((s, r) => s + linhasDaAplicacao(r), 0), partes.reduce((s, r) => s + linhasDaAplicacao(r), 0), partes);
      reg(`aplicada: ${partes.length} linha(s) da BASE${doc(atual) ? ' e DOCS' : ''}`, partes.map(r => r.LINHA).join(', '));
    } else if (tipo === 'ATUALIZAR_PART_NUMBER') {
      if (!doc(atual)) { reg('não aplicada: PMIB fora da DOCS DE REFERÊNCIA'); continue; }
      doc(atual)['PART NUMBER'] = txt(a['PART NUMBER NOVO']);
      reg('aplicada na DOCS DE REFERÊNCIA');
    } else {
      reg(`não aplicada: TIPO desconhecido (use ${TIPOS_ALTERACAO.join(', ')})`);
    }
  }
  base.forEach((r, i) => { r.LINHA = i + 1; });
  // DOCS: TAGS refeitas da BASE
  const tagsPor = {};
  for (const r of base) if (txt(r.TAG)) (tagsPor[r.FICHA_PMIB] = tagsPor[r.FICHA_PMIB] || new Set()).add(txt(r.TAG));
  for (const d of docs) d.TAGS = [...(tagsPor[d['CÓDIGO PMIB']] || [])].sort().join(', ');
  return { base, docs, relacoes, historico, diferencas, avisos };
}

const LMR = {
  UGS, AMD, AMC, TRECHOS, EIXOS, LOCAIS, COLUNAS_BASE, COLUNAS_ALTERACOES, COLUNAS_HISTORICO, COLUNAS_DIFERENCAS,
  comparaBaseStatus, aplicaAlteracoes, filtroTrechos,
  baseDaAplicacao, modeloParaLinha, linhaParaModelo, geraModelo, hashLinha, assinaturaSoma, geraLote,
  txt, formataElevacao, normalizaTrecho, normalizaEixo, normalizaLocal,
  lerStatusPmib, trechosDoProjeto, trechosDoMaterial, hzDaDescricao, expandeRds, partesRds,
  rdsGenerico, indiceRef, rdsNaRef,
  montaCodigo, montaTag, gera, decompoeCodigo, decompoeTag, reconstroi, valida, comparaStatusBase,
  detectaEstiloAntigo, lerDocsAntigos, mudancas, regeneraAplicacao, assinatura,
};
if (typeof module !== 'undefined') module.exports = LMR;

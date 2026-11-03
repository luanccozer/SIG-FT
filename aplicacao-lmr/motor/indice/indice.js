/*
 * Índice dos documentos — Workflow A, etapa A1 (sem IA).
 *
 * Entrada: o texto de cada página dos PDFs (como o Extract from File do n8n entrega, com joinPages = false)
 *          + o catálogo do Status PMIB (LMR.lerStatusPmib) + opcionalmente a BASE de um sistema já aplicado (gabarito).
 * Saída:   as abas do ÍNDICE (DOCUMENTOS, TAGS, MATERIAIS, RDS-PP, ELEVAÇÕES, SEM TEXTO, PÁGINAS e, com gabarito, CONFERÊNCIA).
 *
 * O texto do n8n (pdfjs) junta sem espaço os trechos que estão na mesma altura da página: duas TAGs lado a lado
 * num P&ID viram "BL315FL314S", e o rótulo do instrumento cola na TAG ("PITBP316T"). tagsDoTexto separa isso.
 * TAG fora do padrão KKS (borne, painel, item) não vira candidata: é conferida no texto da página (CONFERÊNCIA e A2).
 *
 * Sem dependências, para colar em nó Code junto com lmr.js. Exporta INDICE.
 */
const INDICE = (() => {
  const t = v => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

  // Código de documento (#ST00=M00MKF10UZ010-UZ901&MPA010) e RDS-PP em geral (com ou sem &tipo).
  const RE_DOC = /#?ST\d{2}=[A-Z]\d{2}[A-Z]{3}\d{2}(?:[A-Z]{2}\d{3}(?:-[A-Z]{2}\d{3})?)?&[A-Z]{3}\d{3}/g;
  const RE_RDS = /#ST\d{2}=[A-Z]\d{2}[A-Z]{3}\d{2}(?:[A-Z]{2}\d{3}(?:-[A-Z]{2}\d{3})?)?(?:&[A-Z]{3}\d{3})?/g;
  const RE_ELEV = /(?<![A-Z])EL(?:EV)?\.?\s*(\d{2,3})[.,](\d{1,3})(?!\d)/gi;
  const SEM_TEXTO = 20; // menos que isso de caracteres úteis = página escaneada (fila de leitura visual)
  const NAO_TAG = new Set(['DN', 'PN']); // diâmetro e pressão nominal têm o formato de TAG
  const TIPOS = {
    MPB: 'lista de sobressalentes', MFB: 'fluxograma / P&ID', MLU: 'layout', MPA: 'lista de material', APA: 'lista de material',
    ACC: 'workstatement', EFF: 'diagrama funcional', MFE: 'descrição de sistema', MDB: 'descritivo funcional', MDD: 'relatório',
  };

  // ── inventário pelo nome do arquivo: #ST00=M00MKF10&MPB020[R1A]_complemento.pdf ──
  function inventarioDoNome(nome) {
    const base = String(nome || '').replace(/\.pdf$/i, '');
    const m = base.match(/(#?ST\d{2}=[A-Z0-9]+(?:-[A-Z0-9]+)?&([A-Z]{3})\d{3})\.?\s*(?:\[([^\]]*)\])?(.*)$/i);
    if (!m) return { codigo: '', tipo: '', revisao: '', complemento: base, avisos: ['nome sem código de documento'] };
    const avisos = [];
    let codigo = m[1].toUpperCase();
    if (!codigo.startsWith('#')) { codigo = '#' + codigo; avisos.push('nome sem # no início do código'); }
    if (!m[3]) avisos.push('nome sem revisão entre [ ]');
    return { codigo, tipo: m[2].toUpperCase(), revisao: m[3] || '', complemento: t((m[4] || '').replace(/^[_\s.-]+/, '')), avisos };
  }

  // Código do carimbo = código de documento que aparece em mais páginas (o carimbo se repete em todas).
  // Empate (documento de 1 página cheio de referências): fica o do nome, se estiver entre os empatados.
  function codigoDoCarimbo(paginas, doNome) {
    const conta = new Map();
    for (const p of paginas) for (const c of new Set((p.match(RE_DOC) || []).map(x => (x.startsWith('#') ? x : '#' + x)))) conta.set(c, (conta.get(c) || 0) + 1);
    if (!conta.size) return { codigo: '', ambiguo: false };
    const max = Math.max(...conta.values());
    const topo = [...conta].filter(([, n]) => n === max).map(([c]) => c);
    if (topo.length === 1) return { codigo: topo[0], ambiguo: false };
    if (topo.includes(doNome)) return { codigo: doNome, ambiguo: false };
    return { codigo: '', ambiguo: true };
  }

  // ── TAGs no padrão KKS (QM104G, GP101, BS141T) ──
  // Cada sequência de letras e números é coberta por TAGs (2 letras + 3 números + letra opcional) e por rótulos de
  // 2 a 4 letras (PIT, LIT, FT). Se não der para cobrir tudo (modelo EJA530E, código SU7621), a sequência não tem TAG.
  function segmenta(s) {
    const n = s.length;
    const custo = new Array(n + 1).fill(Infinity);
    const de = new Array(n + 1);
    custo[0] = 0;
    for (let i = 0; i < n; i++) {
      if (custo[i] === Infinity) continue;
      const passa = (j, c, tag) => { if (j <= n && custo[i] + c < custo[j]) { custo[j] = custo[i] + c; de[j] = [i, tag]; } };
      if (/^[A-Z]{2}\d{3}/.test(s.slice(i, i + 5)) && !NAO_TAG.has(s.slice(i, i + 2))) {
        passa(i + 5, 0, s.slice(i, i + 5));
        if (/[A-Z]/.test(s[i + 5] || '')) passa(i + 6, 0, s.slice(i, i + 6));
      }
      // custo do rótulo: 100 por rótulo + 1 por letra (empate "TITBT158TPITBP159T": fica BT158T + PIT, não BT158 + TPIT)
      for (let L = 2; L <= 4; L++) if (/^[A-Z]+$/.test(s.slice(i, i + L)) && i + L <= n) passa(i + L, 100 + L, null);
    }
    if (custo[n] === Infinity) return [];
    const tags = [];
    for (let j = n; j > 0; j = de[j][0]) if (de[j][1]) tags.unshift(de[j][1]);
    return tags;
  }

  function tagsDoTexto(texto) {
    const s = String(texto || '')
      .replace(RE_RDS, ' ')                                   // componentes do RDS-PP não são TAG
      .replace(/(?<![A-Za-z0-9])([A-Z]{2})[ \t]*\n[ \t]*(\d{3}[A-Z]?)(?![A-Za-z0-9])/g, '$1$2'); // "BS\n160T" (quebra de linha numa lista)
    const tags = [];
    for (const m of s.matchAll(/[A-Za-z0-9]+/g)) if (m[0].length >= 5 && /\d/.test(m[0])) tags.push(...segmenta(m[0]));
    return tags;
  }

  function elevacoesDoTexto(texto) {
    const r = [];
    for (const m of String(texto || '').matchAll(RE_ELEV)) {
      const v = Number(`${m[1]}.${m[2]}`);
      r.push({ original: t(m[0]), valor: v.toFixed(2).replace('.', ',') });
    }
    return r;
  }

  // Busca de um código no texto sem colar em outra letra ou número.
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reCodigo = c => new RegExp(`(?<![A-Z0-9])${esc(c)}(?![A-Z0-9])`, 'g');

  // Chaves de busca de um material do Status: código do material, código CMI/GE e o modelo (parte após a "/").
  function chavesDoMaterial(c) {
    const ch = [];
    const add = (v, de) => { v = t(v).toUpperCase(); if (v.length >= 5 && /\d/.test(v) && !ch.some(x => x.valor === v)) ch.push({ valor: v, de }); };
    // uma célula do Status pode ter vários códigos ("1000111 / 1000222; 1000333"): cada um é uma chave
    for (const v of t(c.codigoMaterial).split(/[\s,;/|]+/)) add(v, 'código do material');
    for (const v of t(c.codigoCmi).split(/[\s,;/|]+/)) add(v, 'código CMI/GE');
    for (const parte of t(c.marcaModelo).split('/').slice(1)) for (const tok of parte.split(/\s+/)) add(tok, 'modelo');
    return ch;
  }

  // Ordem das colunas da lista de sobressalentes: no cabeçalho, há um "CÓDIGO" entre DESCRIÇÃO e TAG? → TAG depois.
  function ladoDaTag(paginas) {
    for (const p of paginas) {
      const T = p.toUpperCase();
      const tg = T.search(/REFER[ÊE]NCIA TAG|TAGS?/);
      if (tg < 0) continue;
      const d = T.lastIndexOf('DESCRI', tg);
      if (d < 0) continue;
      return /C[ÓO]DIGO/.test(T.slice(d, tg)) ? 'depois' : 'antes';
    }
    return 'antes';
  }

  // ── um documento: página por página ──
  // catalogo = LMR.lerStatusPmib(...).catalogo (pode ser []).
  function indexaDocumento(arquivo, paginasTexto, catalogo) {
    const inv = inventarioDoNome(arquivo);
    const paginas = Array.from(paginasTexto, p => String(p == null ? '' : p));
    const carimbo = codigoDoCarimbo(paginas, inv.codigo);
    const avisos = [...inv.avisos];
    if (carimbo.ambiguo) avisos.push('código do carimbo não identificado (vários códigos empatados)');
    else if (!carimbo.codigo) avisos.push('nenhum código de documento no texto');
    else if (inv.codigo && carimbo.codigo !== inv.codigo) avisos.push(`código do nome (${inv.codigo}) diferente do carimbo (${carimbo.codigo})`);
    const tipo = inv.tipo || ((carimbo.codigo.match(/&([A-Z]{3})/) || [])[1] || '');
    const codigo = carimbo.codigo || inv.codigo;
    const ehLista = tipo === 'MPB';
    const tagDepois = ehLista && ladoDaTag(paginas) === 'depois';
    if (ehLista) avisos.push(`lista de sobressalentes: TAG ${tagDepois ? 'depois' : 'antes'} do código do material`);

    const tags = [], rds = [], elev = [], materiais = [], sugestoes = [], semTexto = [];
    let hz50 = 0, hz60 = 0;
    const chaves = catalogo.map(c => ({ c, ch: chavesDoMaterial(c) }));
    const porPmib = new Map(catalogo.map(c => [c.pmib, c]));
    // Qual coluna do Status é a coluna de código da lista: a que tem mais códigos aparecendo uma vez só no documento
    // (Água Pura: CÓDIGO DO MATERIAL; Reg. Vel.: CÓDIGO GE, porque lá o CÓDIGO DO MATERIAL é o modelo e se repete).
    const TODO = paginas.join(' ').toUpperCase();
    const unicos = campo => catalogo.filter(c => { const v = t(c[campo]).toUpperCase(); return v.length >= 5 && (TODO.match(reCodigo(v)) || []).length === 1; }).length;
    const campoLista = ehLista && unicos('codigoCmi') > unicos('codigoMaterial') ? 'codigoCmi' : 'codigoMaterial';
    const deLista = campoLista === 'codigoCmi' ? 'código CMI/GE' : 'código do material';
    if (ehLista) avisos.push(`lista de sobressalentes: linhas marcadas pelo ${deLista} do Status`);
    const formatos = [...new Set(catalogo.map(c => t(c[campoLista]).toUpperCase()).filter(c => c.length >= 5)
      .map(c => esc(c).replace(/[0-9]/g, '\d').replace(/[A-Z]/g, '[A-Z]')))];
    const reFormato = formatos.length ? new RegExp(`(?<![A-Z0-9])(?:${formatos.join('|')})(?![A-Z0-9])`, 'g') : null;
    paginas.forEach((texto, i) => {
      const pagina = i + 1;
      if (texto.replace(/\s/g, '').length < SEM_TEXTO) { semTexto.push(pagina); return; }
      const T = texto.toUpperCase();
      for (const v of new Set(tagsDoTexto(texto))) tags.push({ valor: v, pagina });
      for (const v of new Set(texto.match(RE_RDS) || [])) rds.push({ valor: v, pagina });
      for (const e of elevacoesDoTexto(texto)) elev.push({ ...e, pagina });
      hz50 += (T.match(/50\s*HZ|#ST50/g) || []).length;
      hz60 += (T.match(/60\s*HZ|#ST60/g) || []).length;
      // materiais do Status citados na página (posição guardada para a sugestão de TAGs da lista)
      const naPagina = [];
      for (const { c, ch } of chaves) for (const k of ch) for (const m of T.matchAll(reCodigo(k.valor))) {
        naPagina.push({ pmib: c.pmib, chave: k.valor, de: k.de, ini: m.index, fim: m.index + k.valor.length });
      }
      const vistos = new Set();
      for (const m of naPagina) if (!vistos.has(m.pmib + m.chave)) { vistos.add(m.pmib + m.chave); materiais.push({ pmib: m.pmib, chave: m.chave, de: m.de, pagina }); }
      // Lista de sobressalentes: as TAGs de cada linha ficam entre dois códigos de material. Se a coluna TAG vem antes
      // do código (Água Pura), o trecho é do código anterior até este; se vem depois (Reg. Vel.), deste até o próximo.
      // É sugestão (a leitura do A2 confirma).
      if (ehLista) {
        // marcos = todo código com o formato de um código de material do Status, mesmo fora do catálogo:
        // a linha de um material que não está no Status não deixa as TAGs vazarem para o vizinho
        const doCatalogo = new Map(naPagina.filter(m => m.de === deLista).map(m => [m.ini, m]));
        const cods = [];
        if (reFormato) for (const x of T.matchAll(reFormato)) cods.push(doCatalogo.get(x.index) || { ini: x.index, fim: x.index + x[0].length });
        for (const m of doCatalogo.values()) if (!cods.some(c => c.ini === m.ini)) cods.push(m);
        cods.sort((a, b) => a.ini - b.ini);
        cods.forEach((m, k) => {
          const trecho = tagDepois ? texto.slice(m.fim, k + 1 < cods.length ? cods[k + 1].ini : texto.length)
            : texto.slice(k ? cods[k - 1].fim : 0, m.ini);
          // modelo com formato de TAG (VY150) não é TAG: sai o que estiver na marca/modelo ou na descrição do material
          // (e do vizinho cuja descrição cai no mesmo trecho)
          const viz = cods[tagDepois ? k + 1 : k - 1];
          const doMaterial = [m, viz].filter(Boolean).map(x => porPmib.get(x.pmib) || {})
            .map(c => `${c.marcaModelo || ''} ${c.descricao || ''}`).join(' ').toUpperCase().replace(/\s+/g, '');
          const ts = [...new Set(tagsDoTexto(trecho))].filter(x => !doMaterial.includes(x));
          if (m.pmib && ts.length) sugestoes.push({ pmib: m.pmib, tags: ts, pagina });
        });
      }
    });
    return {
      doc: {
        arquivo, codigo, codigoNome: inv.codigo, codigoCarimbo: carimbo.codigo, revisao: inv.revisao, tipo,
        tipoDescricao: TIPOS[tipo] || '', complemento: inv.complemento, paginas: paginas.length, semTexto, hz50, hz60, avisos,
      },
      paginas: paginas.map((texto, i) => ({ pagina: i + 1, texto })),
      tags, rds, elev, materiais, sugestoes,
    };
  }

  // ── junta os documentos e monta as abas ──
  const intervalos = ns => {
    const r = [];
    for (const n of ns) { const u = r[r.length - 1]; if (u && n === u[1] + 1) u[1] = n; else r.push([n, n]); }
    return r.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');
  };
  const LIMITE_ONDE = 8;
  const onde = lista => (lista.length > LIMITE_ONDE ? lista.slice(0, LIMITE_ONDE).join('; ') + `; … (+${lista.length - LIMITE_ONDE})` : lista.join('; '));
  const MAX_CELULA = 32000;

  /**
   * e = { indexados: [saída de indexaDocumento], catalogo, base?: linhas da aba BASE (gabarito), sistema?, hash? }
   * Devolve { abas (para PLANILHA.planilhaSimples), resumo }.
   */
  function montaIndice(e) {
    const docs = e.indexados;
    const rot = d => d.doc.codigo || d.doc.arquivo;
    const porValor = (campo, chave = x => x.valor) => {
      const m = new Map();
      for (const d of docs) for (const x of d[campo]) {
        const k = chave(x);
        const r = m.get(k) || { docs: new Set(), onde: [] };
        r.docs.add(rot(d)); r.onde.push(`${rot(d)} p.${x.pagina}`);
        m.set(k, r);
      }
      return m;
    };
    const tags = porValor('tags');
    const rds = porValor('rds');
    const elev = porValor('elev');
    const mats = new Map();
    for (const d of docs) for (const x of d.materiais) {
      const r = mats.get(x.pmib) || { chaves: new Set(), onde: [] };
      r.chaves.add(`${x.chave} (${x.de})`); r.onde.push(`${rot(d)} p.${x.pagina}`);
      mats.set(x.pmib, r);
    }
    const sug = new Map();
    for (const d of docs) for (const s of d.sugestoes) {
      const r = sug.get(s.pmib) || { tags: new Set(), onde: [] };
      s.tags.forEach(x => r.tags.add(x)); r.onde.push(`${rot(d)} p.${s.pagina}`);
      sug.set(s.pmib, r);
    }

    const abaDocs = docs.map(d => ({
      ARQUIVO: d.doc.arquivo, 'CÓDIGO': d.doc.codigo, 'CÓDIGO NO NOME': d.doc.codigoNome, 'CÓDIGO NO CARIMBO': d.doc.codigoCarimbo,
      'REVISÃO': d.doc.revisao, TIPO: d.doc.tipo, 'TIPO (DESCRIÇÃO)': d.doc.tipoDescricao, COMPLEMENTO: d.doc.complemento,
      'PÁGINAS': d.doc.paginas, 'SEM TEXTO': intervalos(d.doc.semTexto), 'TAGS': new Set(d.tags.map(x => x.valor)).size,
      'RDS-PP': new Set(d.rds.map(x => x.valor)).size, 'ELEVAÇÕES': [...new Set(d.elev.map(x => x.valor))].join(', '),
      'MENÇÕES 50 HZ': d.doc.hz50, 'MENÇÕES 60 HZ': d.doc.hz60, 'MATERIAIS DO STATUS': new Set(d.materiais.map(x => x.pmib)).size,
      AVISOS: d.doc.avisos.join(' | '),
    }));
    const abaTags = [...tags].sort(([a], [b]) => a.localeCompare(b))
      .map(([TAG, r]) => ({ TAG, DOCUMENTOS: r.docs.size, 'PÁGINAS': r.onde.length, ONDE: onde(r.onde) }));
    const abaRds = [...rds].sort(([a], [b]) => a.localeCompare(b))
      .map(([v, r]) => ({ 'RDS-PP': v, 'É DOCUMENTO': /&/.test(v) ? 'SIM' : '', DOCUMENTOS: r.docs.size, ONDE: onde(r.onde) }));
    const abaElev = [...elev].sort(([a], [b]) => parseFloat(a.replace(',', '.')) - parseFloat(b.replace(',', '.')))
      .map(([v, r]) => ({ 'ELEVAÇÃO': v, DOCUMENTOS: r.docs.size, ONDE: onde(r.onde) }));
    const abaMats = e.catalogo.map(c => {
      const m = mats.get(c.pmib), s = sug.get(c.pmib);
      return {
        SEÇÃO: c.secao, ITEM: c.item, PMIB: c.pmib, 'DESCRIÇÃO': c.descricao, 'CÓDIGO DO MATERIAL': c.codigoMaterial,
        'MARCA/MODELO': c.marcaModelo, UNID: c.unid, ACHADO: m ? 'SIM' : 'NÃO', 'ACHADO POR': m ? [...m.chaves].join(', ') : '',
        ONDE: m ? onde(m.onde) : '', 'TAGS DA LISTA (SUGESTÃO)': s ? [...s.tags].sort().join(', ') : '', 'ONDE (SUGESTÃO)': s ? onde(s.onde) : '',
      };
    });
    const abaSemTexto = docs.filter(d => d.doc.semTexto.length)
      .map(d => ({ ARQUIVO: d.doc.arquivo, 'CÓDIGO': d.doc.codigo, 'PÁGINAS SEM TEXTO': intervalos(d.doc.semTexto), TOTAL: d.doc.semTexto.length, 'DE': d.doc.paginas }));
    let cortadas = 0;
    const abaPaginas = [];
    for (const d of docs) for (const p of d.paginas) {
      let texto = p.texto;
      if (texto.length > MAX_CELULA) { texto = texto.slice(0, MAX_CELULA); cortadas++; }
      abaPaginas.push({ ARQUIVO: d.doc.arquivo, 'CÓDIGO': d.doc.codigo, 'PÁGINA': p.pagina, CARACTERES: p.texto.length, TEXTO: texto });
    }

    // ── conferência com uma BASE já aplicada (gabarito) ──
    const conf = { tags: 0, candidatas: 0, soTexto: 0, curtas: 0, pmibs: 0, iguais: 0 };
    const abaConfTags = [], abaConfMats = [];
    const base = (e.base || []).filter(r => t(r.FICHA_PMIB));
    if (base.length) {
      const compactas = [];
      for (const d of docs) for (const p of d.paginas) compactas.push({ rotulo: `${rot(d)} p.${p.pagina}`, s: p.texto.toUpperCase().replace(/\s+/g, '') });
      const tagsBase = new Map();
      for (const r of base) for (const tg of t(r.TAG).split('/').map(t).filter(Boolean)) (tagsBase.get(tg) || tagsBase.set(tg, new Set()).get(tg)).add(t(r.FICHA_PMIB));
      for (const [tg, pmibs] of [...tagsBase].sort(([a], [b]) => a.localeCompare(b))) {
        conf.tags++;
        let resultado, lugares;
        if (tags.has(tg)) { resultado = 'CANDIDATA'; lugares = tags.get(tg).onde; conf.candidatas++; }
        else if (tg.replace(/[^A-Z0-9]/gi, '').length < 4) { resultado = 'CURTA (conferir à mão)'; lugares = []; conf.curtas++; } // S1, KA2: aparecem em qualquer texto
        else {
          const k = tg.toUpperCase().replace(/\s+/g, '');
          lugares = compactas.filter(p => p.s.includes(k)).map(p => p.rotulo);
          resultado = lugares.length ? 'SÓ NO TEXTO' : 'NÃO ACHADA';
          if (lugares.length) conf.soTexto++;
        }
        abaConfTags.push({ TAG: tg, PMIB: [...pmibs].join(', '), RESULTADO: resultado, ONDE: onde(lugares) });
      }
      const porPmib = new Map();
      for (const r of base) { const p = t(r.FICHA_PMIB); const s = porPmib.get(p) || porPmib.set(p, new Set()).get(p); for (const tg of t(r.TAG).split('/').map(t).filter(Boolean)) s.add(tg); }
      for (const [pmib, tb] of porPmib) {
        conf.pmibs++;
        const s = sug.get(pmib);
        const ts = s ? s.tags : new Set();
        const faltam = [...tb].filter(x => !ts.has(x)), sobram = [...ts].filter(x => !tb.has(x));
        const resultado = !tb.size && !ts.size ? 'SEM TAG (IGUAL)' : !s ? 'SEM SUGESTÃO' : !faltam.length && !sobram.length ? 'IGUAL' : 'DIFERENTE';
        if (resultado === 'IGUAL' || resultado === 'SEM TAG (IGUAL)') conf.iguais++;
        abaConfMats.push({ PMIB: pmib, 'TAGS NA BASE': [...tb].sort().join(', '), 'TAGS SUGERIDAS': [...ts].sort().join(', '), RESULTADO: resultado, FALTAM: faltam.sort().join(', '), SOBRAM: sobram.sort().join(', '), ACHADO: mats.has(pmib) ? 'SIM' : 'NÃO' });
      }
    }

    const nPag = docs.reduce((a, d) => a + d.doc.paginas, 0);
    const nSem = docs.reduce((a, d) => a + d.doc.semTexto.length, 0);
    const achados = abaMats.filter(m => m.ACHADO === 'SIM').length;
    const assinatura = e.hash ? `${tags.size}-${([...tags.keys()].reduce((a, x) => a + e.hash(x), 0) % 4294967296).toString(16).toUpperCase().padStart(8, '0')}` : '';
    const resumo = {
      sistema: e.sistema || '', documentos: docs.length, paginas: nPag, semTexto: nSem, tags: tags.size, rds: rds.size,
      elevacoes: elev.size, materiais: e.catalogo.length, materiaisAchados: achados, comSugestao: sug.size, assinatura,
      paginasCortadas: cortadas, conferencia: base.length ? conf : null,
      avisos: docs.filter(d => d.doc.avisos.length).length,
    };
    const R = [
      ['Sistema', resumo.sistema], ['Documentos', docs.length], ['Páginas', nPag], ['Páginas sem texto (leitura visual)', nSem],
      ['TAGs candidatas (padrão KKS)', tags.size], ['Assinatura das TAGs', assinatura], ['RDS-PP distintos', rds.size], ['Elevações distintas', elev.size],
      ['Materiais no Status (válidos)', e.catalogo.length], ['Materiais achados nos documentos', achados],
      ['Materiais com TAGs sugeridas pela lista de sobressalentes', sug.size], ['Documentos com aviso', resumo.avisos],
      ['Páginas com texto cortado em 32.000 caracteres (aba PÁGINAS)', cortadas],
    ];
    if (base.length) R.push(['— Conferência com a BASE enviada —', ''],
      ['TAGs da BASE', conf.tags], ['… achadas como candidatas', conf.candidatas], ['… achadas só no texto (fora do padrão KKS ou quebradas)', conf.soTexto],
      ['… curtas demais para conferir no texto (conferir à mão)', conf.curtas], ['… não achadas', conf.tags - conf.candidatas - conf.soTexto - conf.curtas], ['PMIBs da BASE', conf.pmibs], ['… com TAGs sugeridas iguais às da BASE', conf.iguais]);

    const abas = [
      { nome: 'RESUMO', colunas: ['CAMPO', 'VALOR'], linhas: R.map(([CAMPO, VALOR]) => ({ CAMPO, VALOR })), larguras: { CAMPO: 60, VALOR: 40 }, numeros: ['VALOR'] },
      { nome: 'DOCUMENTOS', colunas: Object.keys(abaDocs[0] || { ARQUIVO: '' }), linhas: abaDocs, larguras: { ARQUIVO: 50, 'CÓDIGO': 36, 'CÓDIGO NO NOME': 36, 'CÓDIGO NO CARIMBO': 36, AVISOS: 60 }, numeros: ['PÁGINAS', 'TAGS', 'RDS-PP', 'MENÇÕES 50 HZ', 'MENÇÕES 60 HZ', 'MATERIAIS DO STATUS'] },
      { nome: 'MATERIAIS', colunas: Object.keys(abaMats[0] || { PMIB: '' }), linhas: abaMats, larguras: { 'DESCRIÇÃO': 45, ONDE: 60, 'TAGS DA LISTA (SUGESTÃO)': 40, 'ONDE (SUGESTÃO)': 40, 'ACHADO POR': 30 } },
      { nome: 'TAGS', colunas: ['TAG', 'DOCUMENTOS', 'PÁGINAS', 'ONDE'], linhas: abaTags, larguras: { ONDE: 100 }, numeros: ['DOCUMENTOS', 'PÁGINAS'] },
      { nome: 'RDS-PP', colunas: ['RDS-PP', 'É DOCUMENTO', 'DOCUMENTOS', 'ONDE'], linhas: abaRds, larguras: { 'RDS-PP': 40, ONDE: 100 }, numeros: ['DOCUMENTOS'] },
      { nome: 'ELEVAÇÕES', colunas: ['ELEVAÇÃO', 'DOCUMENTOS', 'ONDE'], linhas: abaElev, larguras: { ONDE: 100 }, numeros: ['DOCUMENTOS'] },
      { nome: 'SEM TEXTO', colunas: ['ARQUIVO', 'CÓDIGO', 'PÁGINAS SEM TEXTO', 'TOTAL', 'DE'], linhas: abaSemTexto, larguras: { ARQUIVO: 50, 'CÓDIGO': 36, 'PÁGINAS SEM TEXTO': 30 }, numeros: ['TOTAL', 'DE'] },
    ];
    if (base.length) abas.push(
      { nome: 'CONFERÊNCIA TAGS', colunas: ['TAG', 'PMIB', 'RESULTADO', 'ONDE'], linhas: abaConfTags, larguras: { PMIB: 40, ONDE: 100 } },
      { nome: 'CONFERÊNCIA MATERIAIS', colunas: ['PMIB', 'TAGS NA BASE', 'TAGS SUGERIDAS', 'RESULTADO', 'FALTAM', 'SOBRAM', 'ACHADO'], linhas: abaConfMats, larguras: { 'TAGS NA BASE': 50, 'TAGS SUGERIDAS': 50, FALTAM: 40, SOBRAM: 40 } });
    abas.push({ nome: 'PÁGINAS', colunas: ['ARQUIVO', 'CÓDIGO', 'PÁGINA', 'CARACTERES', 'TEXTO'], linhas: abaPaginas, larguras: { ARQUIVO: 40, 'CÓDIGO': 36, TEXTO: 120 }, numeros: ['PÁGINA', 'CARACTERES'] });
    return { abas, resumo };
  }

  return { TIPOS, inventarioDoNome, codigoDoCarimbo, segmenta, tagsDoTexto, elevacoesDoTexto, chavesDoMaterial, indexaDocumento, montaIndice, intervalos };
})();
if (typeof module !== 'undefined') module.exports = INDICE;

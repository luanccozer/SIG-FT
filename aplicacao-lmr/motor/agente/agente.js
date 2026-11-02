/*
 * Leitura com o agente do AMP — workflows AG1 (Preparar etapas) e AG2 (Montar Base), sem IA no n8n.
 *
 * O agente não pode ser chamado de um workflow: o usuário roda 4 etapas no chat do agente, um tipo de documento por vez.
 *   AG1: PDFs + Status → índice (A1) → páginas separadas por etapa → mensagens prontas e perguntas de controle
 *        → ROTEIRO LMR - {sistema}.xlsx (o usuário copia a mensagem de cada etapa; o gabarito do controle fica com ele).
 *   Agente: etapa 1 áreas · 2 conjuntos (listas de material, diagramas) · 3 equipamentos (P&ID, fluxogramas, resto)
 *        · 4 materiais (lista de sobressalentes + JSONs anteriores). Cada etapa devolve um JSON.
 *   AG2: roteiro + JSONs → conferência (controle, TAG no texto, elevação escrita, QTD sem fonte) → LEITURA.montaBase.
 * Etapa de cada página: pelo tipo do documento (código &XXX) e por sinais do texto, nada sob medida de um sistema.
 *
 * Sem dependências, para colar em nó Code junto com lmr.js, indice.js e leitura.js. Exporta AGENTE.
 */
const AGENTE = (() => {
  const L = typeof LEITURA !== 'undefined' ? LEITURA : require('../leitura/leitura.js');
  const I = typeof INDICE !== 'undefined' ? INDICE : require('../indice/indice.js');
  const t = v => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
  const up = v => t(v).toUpperCase();
  const compacto = v => String(v || '').toUpperCase().replace(/\s+/g, '');
  const lista = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);

  const ETAPAS = [
    { n: 1, nome: 'ÁREAS', json: 'etapa1_areas.json', docs: 'arranjos, layouts e desenhos de localização' },
    { n: 2, nome: 'CONJUNTOS', json: 'etapa2_conjuntos.json', docs: 'listas de material e diagramas de painel' },
    { n: 3, nome: 'EQUIPAMENTOS', json: 'etapa3_equipamentos.json', docs: 'P&ID, fluxogramas, descritivos e demais documentos' },
    { n: 4, nome: 'MATERIAIS', json: 'etapa4_materiais.json', docs: 'lista de sobressalentes' },
  ];
  const ETAPA_DO_TIPO = { MLU: 1, MPA: 2, APA: 2, MTB: 2, MTC: 2, EFF: 2, EPA: 2, MLD: 2, MPB: 4 };
  const RE_ELEV = /(?<![A-Z])EL(?:EV)?\.?\s*\d{2,3}[.,]\d{1,3}(?!\d)/i;
  const RE_DESENHO = /\b(PLANTA|CORTE|ARRANJO|LAYOUT|VISTA|DETALHE)\b/i;
  const RE_LISTA_MATERIAL = /LISTA\s+DE\s+MATERIA|BILL\s+OF\s+MATERIAL|PARTS\s+LIST/i;
  const SEM_TEXTO = 20;
  const MATERIAIS_POR_PARTE = 50, CELULA = 30000;

  const faixas = ns => {
    const r = [];
    for (const n of [...ns].sort((a, b) => a - b)) { const u = r[r.length - 1]; if (u && n === u[1] + 1) u[1] = n; else r.push([n, n]); }
    return r.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');
  };

  // "MLU010 = 1" / "arquivo; 3" (uma por linha): o documento inteiro vai para a etapa indicada
  function lerSobrepor(texto) {
    return String(texto || '').split(/[\r\n]+/).map(l => l.match(/^\s*(.+?)\s*[=;:]\s*([1-4])\s*$/)).filter(Boolean).map(m => ({ trecho: up(m[1]), etapa: Number(m[2]) }));
  }

  /** Etapas de cada página: o documento vai inteiro para a etapa do seu tipo; páginas com sinal claro vão também para outra. */
  function etapasDasPaginas(indexados, sobrepor = []) {
    return indexados.map(d => {
      const s = sobrepor.find(x => up(d.doc.arquivo).includes(x.trecho) || (d.doc.codigo && up(d.doc.codigo).includes(x.trecho)));
      const etapa = s ? s.etapa : ETAPA_DO_TIPO[d.doc.tipo] || 3;
      const porEtapa = { 1: [], 2: [], 3: [], 4: [] };
      const semTexto = [];
      for (const p of d.paginas) {
        const vazia = p.texto.replace(/\s/g, '').length < SEM_TEXTO;
        if (vazia) semTexto.push(p.pagina);
        porEtapa[etapa].push(p.pagina);
        if (s || etapa === 4 || vazia) continue;
        if (etapa !== 1 && RE_ELEV.test(p.texto) && RE_DESENHO.test(p.texto)) porEtapa[1].push(p.pagina);
        if (etapa !== 2 && RE_LISTA_MATERIAL.test(p.texto)) porEtapa[2].push(p.pagina);
      }
      return { arquivo: d.doc.arquivo, codigo: d.doc.codigo, tipo: d.doc.tipo, paginas: d.paginas.length, etapa, sobreposta: !!s, porEtapa, semTexto };
    });
  }

  // ── perguntas de controle: "quais destes códigos estão escritos na página N?" ──
  // Verdadeiras = TAGs que o índice achou na página; falsas = TAGs do mesmo documento que não estão nessa página.
  // Páginas no início, no meio e no fim (mais páginas em documento grande): mostra se o agente leu o documento todo.
  const espalha = (xs, n) => (xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.round(i * (xs.length - 1) / (n - 1 || 1))]));
  function controle(indexados, docs) {
    const out = [];
    const todas = [...new Set(indexados.flatMap(d => d.tags.map(x => x.valor)))].sort();
    for (const e of ETAPAS) {
      let k = 0;
      docs.forEach((de, i) => {
        const pags = new Set(de.porEtapa[e.n]);
        if (!pags.size) return;
        const d = indexados[i];
        const texto = new Map(d.paginas.map(p => [p.pagina, compacto(p.texto)]));
        const porPag = new Map();
        for (const x of d.tags) if (pags.has(x.pagina) && texto.get(x.pagina).includes(x.valor)) {
          const l = porPag.get(x.pagina) || porPag.set(x.pagina, []).get(x.pagina);
          if (!l.includes(x.valor)) l.push(x.valor);
        }
        const cand = [...porPag.keys()].filter(p => porPag.get(p).length >= 2).sort((a, b) => a - b);
        const quantas = Math.min(5, 2 + Math.floor(pags.size / 150));
        for (const p of espalha(cand, quantas)) {
          const verdadeiras = espalha([...porPag.get(p)].sort(), 3);
          const doDoc = [...new Set(d.tags.filter(x => x.pagina !== p).sort((a, b) => Math.abs(a.pagina - p) - Math.abs(b.pagina - p)).map(x => x.valor))];
          const falsas = [...doDoc, ...todas].filter(x => !texto.get(p).includes(x) && !verdadeiras.includes(x)).filter((x, j, a) => a.indexOf(x) === j).slice(0, 2);
          out.push({ id: `E${e.n}-${++k}`, etapa: e.n, arquivo: de.arquivo, pagina: p, opcoes: [...verdadeiras, ...falsas].sort(), corretas: verdadeiras });
        }
      });
    }
    return out;
  }

  // ── mensagens de cada etapa (o usuário cola no chat do agente) ──
  const RE_RDS = /#ST\d{2}=[A-Z]\d{2}[A-Z]{3}\d{2}(?:[A-Z]{2}\d{3}(?:-[A-Z]{2}\d{3})?)?(?:&[A-Z]{3}\d{3})?/g;
  function dadosDeAreas(ind, listaCod) {
    const sis = (t(listaCod).match(/=[A-Z]\d{2}([A-Z]{3}\d{2})/) || [])[1] || '';
    const n = new Map();
    for (const p of ind.paginas) for (const v of new Set(p.x.match(RE_RDS) || [])) if (!sis || v.includes(sis)) { const k = L.doSistema(v); n.set(k, (n.get(k) || 0) + 1); }
    const rds = [...n].sort((a, b) => (a[0].includes('&') - b[0].includes('&')) || b[1] - a[1]).slice(0, 40).map(([v]) => v);
    const titulos = [...L.titulosDeDocumentos(ind)].filter(([c]) => !sis || c.includes(sis)).slice(0, 40).map(([c, x]) => `${c} - ${x}`);
    return { rds, titulos, elevs: ind.elevs || [] };
  }

  function anexos(docs, n) {
    return docs.filter(d => d.porEtapa[n].length).map(d => {
      const todas = d.porEtapa[n].length === d.paginas;
      const sem = d.semTexto.filter(p => d.porEtapa[n].includes(p));
      return { arquivo: d.arquivo, codigo: d.codigo, total: d.paginas, ler: todas ? 'todas' : faixas(d.porEtapa[n]), semTexto: faixas(sem) };
    });
  }

  function mensagem(e, cx, parte) {
    const ls = [];
    const jsons = { 1: [], 2: ['etapa1_areas.json'], 3: ['etapa1_areas.json'], 4: ['etapa1_areas.json', 'etapa2_conjuntos.json', 'etapa3_equipamentos.json'] }[e.n];
    ls.push(`ETAPA ${e.n} de 4 — ${e.nome}${parte.rotulo ? ` (parte ${parte.rotulo} de ${parte.de})` : ''}`);
    ls.push(`Sistema: ${cx.cfg.sistema} | Subsistema: ${cx.cfg.subsistema} | Escopo: ${cx.cfg.escopo} | Lista de sobressalentes: ${cx.lista || '(não identificada)'}`);
    ls.push('');
    ls.push('ANEXOS DESTA ETAPA (faça o inventário antes de começar):');
    for (const a of cx.anexos) ls.push(`- ${a.arquivo} — ${a.total} página(s) — ler: ${a.ler === 'todas' ? 'todas as páginas' : `páginas ${a.ler}`}${a.semTexto ? ` — sem texto, leia como imagem: ${a.semTexto}` : ''}`);
    for (const j of jsons) ls.push(`- ${j} (resultado da etapa anterior; se a etapa foi pulada, siga sem ele)`);
    ls.push('');
    ls.push(`TAREFA: siga a "Etapa ${e.n} — ${e.nome}" das regras da Knowledge base (Regras LMR e Formatos JSON).`);
    if (e.n === 1) {
      ls.push('', 'DADOS ACHADOS PELO PROGRAMA NO TEXTO (use só o que o documento confirmar):');
      ls.push(`- RDS-PP: ${cx.areas.rds.join(' ; ') || '(nenhum)'}`);
      ls.push(`- Elevações escritas: ${cx.areas.elevs.join(' ; ') || '(nenhuma)'}`);
      if (cx.areas.titulos.length) { ls.push('- Documentos de conjuntos citados com título (cada conjunto costuma ser uma área):'); for (const x of cx.areas.titulos) ls.push(`  ${x}`); }
    }
    if (e.n === 4) {
      ls.push('', `MATERIAIS DO STATUS PMIB${parte.rotulo ? ` (parte ${parte.rotulo}: ${parte.materiais.length} de ${cx.catalogo.length})` : ` (${parte.materiais.length})`}. Responda TODOS, um objeto por material, na mesma ordem:`);
      for (const c of parte.materiais) {
        const sug = cx.ind.sug[c.pmib] || [];
        ls.push(`- ${c.pmib} | item ${c.item} | ${t(c.descricao)} | cód. ${t(c.codigoMaterial) || '-'}${t(c.codigoCmi) ? ` | GE/CMI ${t(c.codigoCmi)}` : ''} | ${t(c.marcaModelo) || '-'}${L.ehKit(c) ? ' | KIT' : ''}${sug.length ? ` | TAGs na linha da lista (programa): ${sug.join(', ')}` : ''}`);
      }
    }
    const perguntas = cx.controle.filter(x => x.etapa === e.n && (!parte.rotulo || parte.indice === 0));
    if (perguntas.length) {
      ls.push('', 'PERGUNTAS DE CONTROLE (abra a página indicada; responda no campo "controle" do JSON só com os códigos que estão escritos nela):');
      for (const q of perguntas) ls.push(`- ${q.id}: arquivo ${q.arquivo}, página ${q.pagina}: ${q.opcoes.join(', ')}`);
    }
    ls.push('', `ENTREGA: arquivo ${parte.rotulo ? e.json.replace('.json', `_parte${parte.rotulo}.json`) : e.json} no formato "Etapa ${e.n}" de Formatos JSON, com "etapa": ${e.n} e "parte": "${parte.rotulo || '1'}".`);
    ls.push('Depois do arquivo, um resumo de até 5 linhas: quantidades, páginas que não conseguiu ler e dúvidas.');
    return ls;
  }

  /**
   * cfg = { sistema, escopo, subsistema, trechos, listaTrechos, eixo, frequencia, kits, pecas, especificacao, etapaDocs }
   * Devolve { docs, controle, etapas: [{ n, nome, json, anexos, mensagens: [{ rotulo, linhas }] }], resumo }.
   */
  function roteiro(indexados, st, cfg) {
    const docs = etapasDasPaginas(indexados, lerSobrepor(cfg.etapaDocs));
    const ind = L.indiceCompacto(indexados);
    const ctrl = controle(indexados, docs);
    const cx = { cfg, lista: st.lista, catalogo: st.catalogo, ind, controle: ctrl, areas: dadosDeAreas(ind, st.lista) };
    const etapas = ETAPAS.map(e => {
      const ax = anexos(docs, e.n);
      const partes = [];
      if (e.n === 4 && st.catalogo.length > MATERIAIS_POR_PARTE) {
        const de = Math.ceil(st.catalogo.length / MATERIAIS_POR_PARTE);
        for (let i = 0; i < de; i++) partes.push({ rotulo: String.fromCharCode(65 + i), de, indice: i, materiais: st.catalogo.slice(i * MATERIAIS_POR_PARTE, (i + 1) * MATERIAIS_POR_PARTE) });
      } else partes.push({ rotulo: '', indice: 0, materiais: st.catalogo });
      return { ...e, anexos: ax, pular: !ax.length && e.n !== 4, mensagens: partes.map(p => ({ rotulo: p.rotulo, linhas: mensagem(e, { ...cx, anexos: ax }, p) })) };
    });
    return { docs, controle: ctrl, etapas, resumo: { documentos: docs.length, paginas: docs.reduce((s, d) => s + d.paginas, 0),
      semTexto: docs.reduce((s, d) => s + d.semTexto.length, 0), perguntas: ctrl.length, materiais: st.catalogo.length,
      porEtapa: Object.fromEntries(ETAPAS.map(e => [e.n, docs.filter(d => d.porEtapa[e.n].length).length])) } };
  }

  // ── o arquivo do roteiro (.xlsx): abas para o usuário e abas que o AG2 lê de volta ──
  const CAMPOS_CONFIG = ['sistema', 'escopo', 'subsistema', 'trechos', 'listaTrechos', 'eixo', 'frequencia', 'kits', 'pecas', 'especificacao', 'etapaDocs'];
  function abasDoRoteiro(r, statusRows, indexados, cfg) {
    const T = ls => ({ colunas: ['T'], linhas: ls.map(T => ({ T })), larguras: { T: 160 }, texto: true });
    const ro = [`ROTEIRO LMR — ${cfg.sistema}`, '',
      'COMO USAR',
      '1. No AMP, abra o agente LMR e comece um chat NOVO para cada etapa (o contexto não acumula PDFs de etapas diferentes).',
      '2. Em cada etapa: anexe os arquivos listados abaixo; abra a aba da etapa (ETAPA 1, ETAPA 2…); clique na letra A no topo da coluna, Ctrl+C, cole no chat e envie.',
      '3. Antes de seguir, confira as PERGUNTAS DE CONTROLE: compare a resposta do agente com a coluna CORRETAS da aba CONTROLE. Se ele errar uma página, peça para ler de novo aquele trecho; se errar de novo, divida o PDF e repita a etapa só com aquela parte.',
      '4. Salve o arquivo .json que o agente entregar (nome indicado no fim da mensagem). Ele vai anexado nas etapas seguintes.',
      '5. No fim, rode o workflow "LMR - AG2 Montar Base" com ESTE arquivo e todos os .json salvos.',
      'Não edite as abas CONFIG, CONTROLE, STATUS PMIB e ÍNDICE: o AG2 lê essas abas.', ''];
    for (const e of r.etapas) {
      ro.push(`ETAPA ${e.n} — ${e.nome} (${e.docs}) → ${e.mensagens.length > 1 ? e.mensagens.map(m => e.json.replace('.json', `_parte${m.rotulo}.json`)).join(', ') : e.json}`);
      if (e.pular) ro.push('   Nenhum documento deste tipo foi identificado: PULE esta etapa (ou indique documentos no campo "Etapa de documentos" do AG1).');
      for (const a of e.anexos) ro.push(`   anexar: ${a.arquivo} (${a.total} p.; ler ${a.ler === 'todas' ? 'todas' : `p. ${a.ler}`}${a.semTexto ? `; sem texto: ${a.semTexto}` : ''})`);
      if (e.n > 1) ro.push(`   anexar também: ${e.n === 4 ? 'os .json das etapas 1, 2 e 3' : 'etapa1_areas.json'}`);
      if (e.mensagens.length > 1) ro.push(`   mensagem em ${e.mensagens.length} partes (abas ${e.mensagens.map(m => `ETAPA ${e.n}${m.rotulo}`).join(', ')}): um chat por parte, com os mesmos anexos`);
      const q = r.controle.filter(x => x.etapa === e.n).length;
      ro.push(`   perguntas de controle: ${q || 'nenhuma (documentos sem TAG no texto): confira o inventário de páginas'}`, '');
    }
    const sem = r.docs.filter(d => d.semTexto.length);
    if (sem.length) { ro.push('PÁGINAS SEM TEXTO (escaneadas: o agente precisa ler como imagem; o programa não confere)'); for (const d of sem) ro.push(`   ${d.arquivo}: ${faixas(d.semTexto)}`); }
    const abas = [{ nome: 'ROTEIRO', ...T(ro) }];
    for (const e of r.etapas) for (const m of e.mensagens) abas.push({ nome: `ETAPA ${e.n}${m.rotulo}`, ...T(m.linhas) });
    abas.push({ nome: 'CONTROLE', colunas: ['ID', 'ETAPA', 'ARQUIVO', 'PÁGINA', 'OPÇÕES', 'CORRETAS'],
      linhas: r.controle.map(q => ({ ID: q.id, ETAPA: q.etapa, ARQUIVO: q.arquivo, 'PÁGINA': q.pagina, 'OPÇÕES': q.opcoes.join(', '), CORRETAS: q.corretas.join(', ') })),
      larguras: { ARQUIVO: 60, 'OPÇÕES': 50, CORRETAS: 40 } });
    abas.push({ nome: 'CONFIG', colunas: ['CAMPO', 'VALOR'], linhas: CAMPOS_CONFIG.map(k => ({ CAMPO: k, VALOR: cfg[k] == null ? '' : String(cfg[k]) })), larguras: { CAMPO: 20, VALOR: 80 } });
    const nc = Math.max(1, ...statusRows.map(x => (x || []).length));
    const cols = Array.from({ length: nc }, (_, i) => `C${i + 1}`);
    abas.push({ nome: 'STATUS PMIB', colunas: cols, linhas: statusRows.map(x => Object.fromEntries(cols.map((c, i) => [c, (x || [])[i] == null ? '' : String(x[i])]))), texto: true });
    const partes = Math.max(1, ...indexados.flatMap(d => d.paginas.map(p => Math.ceil(p.texto.length / CELULA))));
    const tcols = Array.from({ length: partes }, (_, i) => `TEXTO${i + 1}`);
    abas.push({ nome: 'ÍNDICE', colunas: ['ARQUIVO', 'PÁGINA', ...tcols], larguras: { ARQUIVO: 50, TEXTO1: 80 },
      linhas: indexados.flatMap(d => d.paginas.map(p => ({ ARQUIVO: d.doc.arquivo, 'PÁGINA': p.pagina, ...Object.fromEntries(tcols.map((c, i) => [c, p.texto.slice(i * CELULA, (i + 1) * CELULA)])) }))) });
    return abas;
  }

  // ── AG2: de volta do .xlsx ──
  const configDoRoteiro = linhas => Object.fromEntries(linhas.filter(x => t(x.CAMPO)).map(x => [t(x.CAMPO), x.VALOR == null ? '' : String(x.VALOR)]));
  function indexadosDoRoteiro(linhas, catalogo) {
    const docs = new Map();
    for (const x of linhas) {
      const a = t(x.ARQUIVO);
      if (!a) continue;
      const pags = docs.get(a) || docs.set(a, []).get(a);
      const texto = Object.keys(x).filter(k => /^TEXTO\d+$/.test(k)).sort((p, q) => Number(p.slice(5)) - Number(q.slice(5))).map(k => (x[k] == null ? '' : String(x[k]))).join('');
      pags.push({ p: Number(x['PÁGINA']) || pags.length + 1, texto });
    }
    return [...docs].map(([a, ps]) => I.indexaDocumento(a, ps.sort((p, q) => p.p - q.p).map(x => x.texto), catalogo));
  }

  /** Arquivos que o usuário salvou do agente → respostas juntas. respostas = [{ arquivo, texto }] */
  // Resposta do agente: o JSON pode vir num bloco ```json com texto em volta (e chaves no texto). Vale o maior bloco
  // que for JSON válido; sem bloco, a leitura tolerante de LEITURA.json.
  function jsonDaResposta(texto) {
    const s = String(texto == null ? '' : texto);
    const blocos = [...s.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(m => m[1]).sort((a, b) => b.length - a.length);
    for (const b of blocos) { try { const j = JSON.parse(b); if (j && typeof j === 'object') return j; } catch (e) { /* próximo */ } }
    return L.json(blocos[0] || s);
  }

  function leRespostas(respostas) {
    const R = { areas: [], tags: [], materiais: new Map(), controle: [], arquivos: [], observacoes: [], etapas: new Set(), avisos: [], brutas: [] };
    for (const { arquivo, texto } of respostas) {
      const j = jsonDaResposta(texto);
      if (!j) { R.avisos.push(`${arquivo}: sem JSON válido (arquivo ignorado)`); R.brutas.push({ arquivo, etapa: '', texto }); continue; }
      const etapa = Number(j.etapa) || (j.materiais ? 4 : j.tags ? 3 : j.areas ? 1 : 0);
      R.etapas.add(etapa);
      R.brutas.push({ arquivo, etapa, texto });
      if (j.recuperado) R.avisos.push(`${arquivo}: JSON quebrado, aproveitada a parte legível`);
      for (const a of lista(j.areas)) if (a && typeof a === 'object') R.areas.push({ ...a, etapa });
      for (const x of lista(j.tags)) if (x && typeof x === 'object') for (const tag of L.separaTags(x.tag)) R.tags.push({ ...x, tag, etapa });
      for (const m of lista(j.materiais)) {
        const p = t(m && m.pmib);
        if (!p) continue;
        if (R.materiais.has(p)) R.avisos.push(`${arquivo}: material ${p} respondido de novo (vale esta resposta)`);
        R.materiais.set(p, m);
      }
      for (const c of lista(j.controle)) if (c && c.id) R.controle.push({ id: up(c.id), presentes: lista(c.presentes).flatMap(v => up(v).split(/\s*[,;]\s*/)).filter(Boolean), etapa });
      for (const a of lista(j.arquivos)) if (a && typeof a === 'object') R.arquivos.push({ ...a, etapa });
      for (const o of lista(j.observacoes)) if (t(o)) R.observacoes.push(`etapa ${etapa}: ${t(typeof o === 'string' ? o : JSON.stringify(o))}`);
    }
    return R;
  }

  /** gabarito = linhas da aba CONTROLE; respostas = R.controle. */
  function conferirControle(gabarito, respostas, etapasEnviadas) {
    const linhas = [], porEtapa = {};
    for (const g of gabarito) {
      const id = up(g.ID);
      if (!id) continue;
      const etapa = Number(g.ETAPA);
      const certas = up(g.CORRETAS).split(/\s*,\s*/).filter(Boolean);
      const r = respostas.find(x => x.id === id);
      let resultado;
      if (!r) resultado = etapasEnviadas.has(etapa) ? 'SEM RESPOSTA' : 'ETAPA NÃO ENVIADA';
      else {
        const faltou = certas.filter(x => !r.presentes.includes(x)), sobrou = r.presentes.filter(x => !certas.includes(x));
        resultado = !faltou.length && !sobrou.length ? 'OK' : `ERRO${faltou.length ? ` — não viu: ${faltou.join(', ')}` : ''}${sobrou.length ? ` — disse que estão, mas não estão: ${sobrou.join(', ')}` : ''}`;
      }
      const x = porEtapa[etapa] || (porEtapa[etapa] = { ok: 0, total: 0, erros: [] });
      x.total++;
      if (resultado === 'OK') x.ok++; else if (resultado !== 'ETAPA NÃO ENVIADA') x.erros.push(`${t(g.ARQUIVO)} p.${g['PÁGINA']}`);
      linhas.push({ ID: id, ETAPA: etapa, ARQUIVO: t(g.ARQUIVO), 'PÁGINA': g['PÁGINA'], CORRETAS: certas.join(', '), RESPOSTA: r ? r.presentes.join(', ') : '', RESULTADO: resultado });
    }
    return { linhas, porEtapa };
  }

  const trechosDe = v => (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,;\s]+/)).map(up).filter(Boolean);
  function areasDoAgente(R, ind, subsistema, semTexto = true) {
    // etapa 1 primeiro: área repetida nas etapas 2 e 3 só completa o que faltou
    const ordem = [...R.areas].sort((a, b) => (a.etapa || 9) - (b.etapa || 9));
    const { areas, avisos } = L.leAreas({ areas: ordem }, ind, subsistema, { semTexto });
    for (const a of areas) {
      const fontes = ordem.filter(x => up(x.nome) === a.original);
      a.trechos = [...new Set(fontes.flatMap(x => trechosDe(x.trechos)))];
      for (const x of fontes.slice(1)) { const y = L.leAreas({ areas: [x] }, ind, subsistema, { semTexto }).areas[0] || {}; for (const k of ['rds', 'elev', 'local', 'eixo']) a[k] = a[k] || y[k] || ''; }
    }
    return { areas, avisos };
  }

  /** Decisões no formato de LEITURA.montaBase: etapa 4 + TAGs das etapas 2 e 3 (área, RDS próprio, elevação, frequência). */
  function decisoesDoAgente(R, catalogo, ind, areas, pecas, semTexto = true) {
    const porTag = new Map();
    for (const x of R.tags) (porTag.get(x.tag) || porTag.set(x.tag, []).get(x.tag)).push(x);
    const mats = [], extra = new Map();
    for (const c of catalogo) {
      const m = R.materiais.get(c.pmib);
      if (!m) continue;
      const regras = [], avisos = [], tags = [];
      for (const x of lista(m.tags)) {
        const o = x && typeof x === 'object' ? x : {};
        for (let tag of L.separaTags(typeof x === 'string' ? x : o.tag)) {
          const v = L.confereTagDaLista(ind, tag);
          if (v.troca) { regras.push(`TAG ${tag} só está na lista de sobressalentes; nos documentos está ${v.troca}`); tag = v.troca; }
          const info = (porTag.get(tag) || []).filter(i => t(i.area));
          if (t(o.area) || !info.length) tags.push({ ...o, tag });
          else for (const i of info) tags.push({ tag, area: i.area, rds_proprio: o.rds_proprio != null ? o.rds_proprio : i.rds_proprio, elevacao: o.elevacao != null ? o.elevacao : i.elevacao });
        }
      }
      for (const x of tags) if (x.rds_proprio == null) { const i = (porTag.get(x.tag) || []).find(y => y.rds_proprio != null); x.rds_proprio = i ? i.rds_proprio : true; }
      let frequencia = m.frequencia;
      if (!frequencia) { const fs = [...new Set(tags.flatMap(x => (porTag.get(x.tag) || []).map(i => up(i.frequencia))).filter(Boolean))]; if (fs.length === 1) frequencia = fs[0]; }
      mats.push({ ...m, pmib: c.pmib, tags, frequencia });
      extra.set(c.pmib, { regras, avisos, papel: up(m.papel), encontrado: !(m.encontrado === false || /^(FALSE|NÃO|NAO)$/i.test(t(m.encontrado))) });
    }
    const decisoes = L.confereMateriais({ materiais: mats }, { pmibs: catalogo.map(c => c.pmib) }, ind, areas, { semTexto });
    const porPmib = new Map(catalogo.map(c => [c.pmib, c]));
    for (const d of decisoes) {
      const c = porPmib.get(d.pmib), x = extra.get(d.pmib);
      d.origem = d.origem === 'IA' ? 'agente' : d.origem;
      d.avisos = d.avisos.map(a => a.replace('material sem resposta da IA', 'material sem resposta do agente (etapa 4)').replace(/da IA/g, 'do agente'));
      d.regras = x ? x.regras : [];
      if (!x) continue;
      d.avisos.push(...x.avisos);
      if (!x.encontrado) d.avisos.push('o agente não encontrou o material nos documentos');
      if (up(pecas) === 'PAI' && /^PE/.test(x.papel) && !d.kit && !L.ehKit(c) && d.tags.length) {
        d.pais = d.tags.map(y => y.tag); d.tagsDosPais = d.tags; d.area = d.area || (d.tags.find(y => y.area) || {}).area || '';
        d.regras.push(`peça montada no equipamento: ${d.pais.join(', ')} como PAI (convenção do formulário)`);
        d.tags = [];
      }
      const sug = ind.sug[d.pmib] || [];
      if (x.encontrado && !d.tags.length && !d.pais.length && sug.length) d.avisos.push(`a lista de sobressalentes cita ${sug.join(', ')} na linha do material, mas o agente não ligou TAG: confira`);
    }
    return decisoes;
  }

  /**
   * e = { LMR, statusRows, indexados, cfg, respostas: [{ arquivo, texto }], controle: linhas da aba CONTROLE,
   *       semTexto?: false = o agente só viu o texto (workflow): valor fora do texto sai, como na IA do n8n,
   *       areasConferidas?: áreas da página "Confira as áreas", etapasSemPaginas?: etapas sem documento (sem pendência) }
   * Devolve o resultado de LEITURA.montaBase + { areas, controle, R, extras (abas de revisão) }.
   */
  function montaBaseDoAgente(e) {
    const st = e.LMR.lerStatusPmib(e.statusRows);
    const ind = L.indiceCompacto(e.indexados);
    const R = leRespostas(e.respostas);
    const semTexto = e.semTexto !== false;
    let { areas, avisos: avisosAreas } = areasDoAgente(R, ind, e.cfg.subsistema, semTexto);
    // áreas conferidas na página do formulário (depois da etapa 1) valem; das etapas 2 e 3 entram só as novas
    if (e.areasConferidas) {
      const novas = areasDoAgente({ ...R, areas: R.areas.filter(a => a.etapa > 1) }, ind, e.cfg.subsistema, semTexto);
      const nomes = new Set(e.areasConferidas.flatMap(a => [a.nome, a.original].filter(Boolean)));
      areas = [...e.areasConferidas, ...novas.areas.filter(a => !nomes.has(a.nome) && !nomes.has(a.original))];
      avisosAreas = novas.avisos;
    }
    const decisoes = decisoesDoAgente(R, st.catalogo, ind, areas, e.cfg.pecas, e.semTexto !== false);
    const ctrl = conferirControle(e.controle || [], R.controle, R.etapas);
    const cfg = e.cfg;
    const r = L.montaBase({ LMR: e.LMR, catalogo: st.catalogo, relacoes: st.relacoes, lista: st.lista, statusRows: e.statusRows, areas, decisoes,
      escopo: up(cfg.escopo), subsistema: up(cfg.subsistema), trechos: cfg.trechos || 'TODAS', listaTrechos: trechosDe(cfg.listaTrechos),
      especificacao: cfg.especificacao, eixo: cfg.eixo, frequencia: cfg.frequencia, kits: cfg.kits, ind });
    const geral = (tipo, detalhe) => r.pendencias.unshift({ PMIB: '', ITEM: '', 'DESCRIÇÃO': 'AGENTE', TIPO: tipo, DETALHE: detalhe });
    for (const [n, x] of Object.entries(ctrl.porEtapa).reverse()) if (x.erros.length)
      geral('CONTROLE', `etapa ${n}: ${x.ok} de ${x.total} perguntas de controle certas; erros em ${x.erros.join('; ')}. O agente pode não ter lido essas páginas: repita a etapa para esse trecho.`);
    for (const a of R.arquivos) if (t(a.paginas_ilegiveis)) geral('LEITURA DO AGENTE', `etapa ${a.etapa}: ${t(a.arquivo)} — páginas que o agente não conseguiu ler: ${t(a.paginas_ilegiveis)}`);
    for (const n of [1, 2, 3, 4]) if (!R.etapas.has(n) && !(e.etapasSemPaginas || []).includes(n)) geral('ETAPA', `etapa ${n} não enviada${n === 4 ? ': nenhum material lido' : ' (se o sistema não tem esse tipo de documento, ignore)'}`);
    for (const a of [...R.avisos, ...avisosAreas]) geral(/confira no documento/.test(a) ? 'CONFERIR' : 'LEITURA DO AGENTE', a);
    r.resumo.pendencias = r.pendencias.length;
    const extras = [
      { nome: 'PENDÊNCIAS', colunas: ['PMIB', 'ITEM', 'DESCRIÇÃO', 'TIPO', 'DETALHE'], linhas: r.pendencias, larguras: { 'DESCRIÇÃO': 45, DETALHE: 80 } },
      { nome: 'LEITURA', colunas: Object.keys(r.leitura[0] || { PMIB: '' }), linhas: r.leitura, larguras: { 'DESCRIÇÃO': 45, TAGS: 50, 'EVIDÊNCIA': 40, REGRAS: 60, AVISOS: 60, 'FREQUÊNCIA': 30 } },
      { nome: 'ÁREAS', colunas: L.COLUNAS_AREAS, linhas: L.abaAreas(areas, r.base).concat(avisosAreas.map(x => ({ 'ÁREA/PAINEL': 'AVISO', 'EVIDÊNCIA': x }))),
        larguras: { 'ÁREA/PAINEL': 30, 'NOVO NOME': 22, 'RDS-PP': 40, 'RDS-PP LIDO': 40, 'EVIDÊNCIA': 60 } },
      { nome: 'CONTROLE DO AGENTE', colunas: ['ID', 'ETAPA', 'ARQUIVO', 'PÁGINA', 'CORRETAS', 'RESPOSTA', 'RESULTADO'], linhas: ctrl.linhas,
        larguras: { ARQUIVO: 50, CORRETAS: 30, RESPOSTA: 30, RESULTADO: 60 } },
      { nome: 'RESPOSTAS DO AGENTE', colunas: ['ARQUIVO', 'ETAPA', 'RESPOSTA'], larguras: { ARQUIVO: 40, RESPOSTA: 150 },
        linhas: R.brutas.map(b => ({ ARQUIVO: b.arquivo, ETAPA: b.etapa, RESPOSTA: String(b.texto).slice(0, CELULA) })).concat(R.observacoes.map(o => ({ ARQUIVO: 'OBSERVAÇÃO', RESPOSTA: o }))) },
    ];
    const certas = Object.values(ctrl.porEtapa).reduce((s, x) => s + x.ok, 0), perguntas = Object.values(ctrl.porEtapa).reduce((s, x) => s + x.total, 0);
    return { ...r, areas, controle: ctrl, R, extras,
      resumo: { ...r.resumo, lidosPeloAgente: decisoes.filter(d => d.origem === 'agente').length, etapas: [...R.etapas].filter(Boolean).sort().join(', '), controleCertas: certas, controlePerguntas: perguntas } };
  }

  // ── workflow: o nó AMP Agent recebe o TEXTO das páginas na mensagem (sonda 2: o PDF em Files não chega ao agente) ──
  // Cada etapa vira chamadas de até CHAMADA caracteres; só páginas úteis (com TAG, RDS-PP, elevação ou código de
  // material: workstatement e descritivo corrido ficam de fora). A etapa 4 vai em lotes de materiais, com as páginas da
  // lista de sobressalentes desses materiais, as áreas e a tabela de TAGs das etapas 2 e 3.
  const CHAMADA = 80000, MATERIAIS_POR_CHAMADA = 25, TABELA_TAGS = 40000;
  const textoDaPagina = s => String(s || '').replace(/[ \t ]+/g, ' ').replace(/ *\n\s*/g, '\n').trim();
  const paginasUteis = d => new Set([...d.tags, ...d.rds, ...d.elev, ...d.materiais].map(x => x.pagina));
  function lotesDePaginas(paginas, max) {
    const lotes = [];
    let atual = [], tam = 0;
    for (const p of paginas) {
      const n = p.texto.length + p.arquivo.length + 30;
      if (atual.length && tam + n > max) { lotes.push(atual); atual = []; tam = 0; }
      atual.push(p); tam += n;
    }
    if (atual.length) lotes.push(atual);
    return lotes;
  }
  const linhaArea = a => `- ${a.nome} | RDS-PP ${a.rds || '-'} | EL. ${a.elev || '-'} | ${a.local || '-'}`;
  const linhaMaterial = (c, ind) => {
    const sug = ind.sug[c.pmib] || [];
    return `- ${c.pmib} | item ${c.item} | ${t(c.descricao)} | cód. ${t(c.codigoMaterial) || '-'}${t(c.codigoCmi) ? ` | GE/CMI ${t(c.codigoCmi)}` : ''} | ${t(c.marcaModelo) || '-'}${L.ehKit(c) ? ' | KIT' : ''}${sug.length ? ` | TAGs na linha da lista (programa): ${sug.join(', ')}` : ''}`;
  };

  function mensagemWorkflow(e, cx, rotulo, de, paginas, extra, perguntas) {
    const ls = [`WORKFLOW LMR — ETAPA ${e.n} de 4 — ${e.nome}${de > 1 ? ` (parte ${rotulo} de ${de})` : ''}`,
      `Sistema: ${cx.cfg.sistema} | Subsistema: ${cx.cfg.subsistema} | Escopo: ${cx.cfg.escopo} | Lista de sobressalentes: ${cx.lista || '(não identificada)'}`, '',
      'Não há anexos: o texto das páginas, extraído dos PDFs, está no fim desta mensagem (um bloco por página). Leia TODAS as páginas da mensagem; no inventário, liste os arquivos e as páginas recebidas.',
      `TAREFA: siga a "Etapa ${e.n} — ${e.nome}" das regras da Knowledge base (Regras LMR e Formatos JSON). Use só o que está no texto abaixo e nos dados desta mensagem.`, ...extra];
    if (perguntas.length) {
      ls.push('', 'PERGUNTAS DE CONTROLE (procure a página indicada no texto abaixo; responda no campo "controle" só com os códigos escritos nela):');
      for (const q of perguntas) ls.push(`- ${q.id}: arquivo ${q.arquivo}, página ${q.pagina}: ${q.opcoes.join(', ')}`);
    }
    ls.push('', `RESPOSTA: só o JSON do formato "Etapa ${e.n}", num bloco \`\`\`json, com "etapa": ${e.n} e "parte": "${rotulo}". Não gere arquivo para baixar.`);
    if (paginas.length) { ls.push('', '=== TEXTO DAS PÁGINAS ==='); for (const p of paginas) ls.push(`### ${p.arquivo} — página ${p.pagina}`, p.texto); }
    return ls.join('\n');
  }

  // Áreas e TAGs já lidas (respostas das etapas anteriores) → contexto das próximas chamadas.
  function contextoDasRespostas(respostas, indexados, cfg) {
    const R = leRespostas(respostas);
    const ind = L.indiceCompacto(indexados);
    return { areas: areasDoAgente(R, ind, cfg.subsistema, false).areas, tags: R.tags.filter(x => x.tag) };
  }

  /**
   * Tarefas das etapas pedidas (cfg.sessao = prefixo da sessão; cfg.chamada = caracteres por chamada).
   * ctx = { areas, tags } das etapas anteriores. Devolve { tarefas: [{ etapa, parte, rotulo, sessionId, chatInput,
   * controle: [ids], pmibs, caracteres }], controle: perguntas enviadas }.
   */
  function tarefasWorkflow(indexados, st, cfg, etapas, ctx = {}) {
    const r = roteiro(indexados, st, cfg);
    const ind = L.indiceCompacto(indexados);
    const cx = { cfg, lista: st.lista, catalogo: st.catalogo, ind, areas: dadosDeAreas(ind, st.lista) };
    const max = Number(cfg.chamada) || CHAMADA;
    const areasTxt = (ctx.areas || []).map(linhaArea);
    const tarefas = [];
    for (const n of etapas) {
      const e = ETAPAS[n - 1];
      const pagina = (k, pg) => ({ arquivo: r.docs[k].arquivo, pagina: pg, texto: textoDaPagina(indexados[k].paginas[pg - 1].texto) });
      let grupos = [];
      if (n < 4) {
        const pags = [];
        r.docs.forEach((d, k) => { const util = paginasUteis(indexados[k]); for (const pg of d.porEtapa[n]) if (util.has(pg)) pags.push(pagina(k, pg)); });
        grupos = lotesDePaginas(pags, max).map(paginas => ({ paginas, materiais: [] }));
      } else {
        for (let i = 0; i < st.catalogo.length; i += MATERIAIS_POR_CHAMADA) {
          const materiais = st.catalogo.slice(i, i + MATERIAIS_POR_CHAMADA);
          const pm = new Set(materiais.map(c => c.pmib));
          const paginas = [];
          r.docs.forEach((d, k) => { if (d.porEtapa[4].length) for (const pg of [...new Set(indexados[k].materiais.filter(x => pm.has(x.pmib)).map(x => x.pagina))].sort((a, b) => a - b)) paginas.push(pagina(k, pg)); });
          grupos.push({ paginas, materiais });
        }
      }
      grupos.forEach((g, k) => {
        const rotulo = String(k + 1);
        let extra;
        if (n === 1) {
          extra = ['', 'DADOS ACHADOS PELO PROGRAMA NO TEXTO (use só o que o texto confirmar):', `- RDS-PP: ${cx.areas.rds.join(' ; ') || '(nenhum)'}`, `- Elevações escritas: ${cx.areas.elevs.join(' ; ') || '(nenhuma)'}`];
          if (cx.areas.titulos.length) extra.push('- Documentos de conjuntos citados com título (cada conjunto costuma ser uma área):', ...cx.areas.titulos.map(x => `  ${x}`));
        } else if (n < 4) {
          extra = ['', `ÁREAS DA ETAPA 1 (use estes nomes em "area"; conjunto que falta vai em "areas"):`, ...(areasTxt.length ? areasTxt : ['- (nenhuma área lida na etapa 1)'])];
        } else {
          // tabela de TAGs: todas, ou (se grande) só as das páginas onde estes materiais aparecem e as da lista
          const unicas = new Map();
          for (const x of ctx.tags || []) { const ch = `${x.tag}|${up(x.area)}`; if (!unicas.has(ch)) unicas.set(ch, x); }
          let linhas = [...unicas.values()].map(x => `- ${x.tag} | ${x.area || '-'} | ${t(x.descricao) || '-'} | RDS próprio: ${x.rds_proprio === false ? 'não' : 'sim'}${x.frequencia ? ` | ${x.frequencia} Hz` : ''}`);
          if (linhas.join('\n').length > TABELA_TAGS) {
            const pm = new Set(g.materiais.map(c => c.pmib));
            const rel = new Set(g.materiais.flatMap(c => ind.sug[c.pmib] || []));
            for (const D of indexados) { const ps = new Set(D.materiais.filter(x => pm.has(x.pmib)).map(x => x.pagina)); for (const x of D.tags) if (ps.has(x.pagina)) rel.add(x.valor); }
            linhas = linhas.filter(l => rel.has(l.slice(2).split(' | ')[0]));
            while (linhas.join('\n').length > TABELA_TAGS) linhas.pop();
          }
          extra = ['', 'ÁREAS (etapa 1):', ...(areasTxt.length ? areasTxt : ['- (nenhuma)']), '', 'TAGS LIDAS NAS ETAPAS 2 E 3 (TAG | área | descrição | RDS próprio | frequência):', ...(linhas.length ? linhas : ['- (nenhuma)']),
            '', `MATERIAIS DO STATUS PMIB (${g.materiais.length}). Responda TODOS, um objeto por material, na mesma ordem:`, ...g.materiais.map(c => linhaMaterial(c, ind))];
        }
        const ids = new Set(g.paginas.map(p => `${p.arquivo}|${p.pagina}`));
        const perguntas = r.controle.filter(q => q.etapa === n && ids.has(`${q.arquivo}|${q.pagina}`));
        const chatInput = mensagemWorkflow(e, cx, rotulo, grupos.length, g.paginas, extra, perguntas);
        tarefas.push({ etapa: n, parte: rotulo, rotulo: `etapa ${n} parte ${rotulo}`, sessionId: `${cfg.sessao || 'lmr'}-e${n}-p${rotulo}`, chatInput,
          controle: perguntas.map(q => q.id), pmibs: g.materiais.map(c => c.pmib), caracteres: chatInput.length });
      });
    }
    const enviadas = new Set(tarefas.flatMap(x => x.controle));
    return { tarefas, controle: r.controle.filter(q => enviadas.has(q.id)) };
  }
  // perguntas de controle → linhas no formato da aba CONTROLE (gabarito)
  const gabaritoDoControle = qs => qs.map(q => ({ ID: q.id, ETAPA: q.etapa, ARQUIVO: q.arquivo, 'PÁGINA': q.pagina, 'OPÇÕES': q.opcoes.join(', '), CORRETAS: q.corretas.join(', ') }));

  return { ETAPAS, faixas, lerSobrepor, etapasDasPaginas, controle, roteiro, abasDoRoteiro, configDoRoteiro, indexadosDoRoteiro,
    jsonDaResposta, tarefasWorkflow, contextoDasRespostas, gabaritoDoControle,
    leRespostas, conferirControle, areasDoAgente, decisoesDoAgente, montaBaseDoAgente };
})();
if (typeof module !== 'undefined') module.exports = AGENTE;

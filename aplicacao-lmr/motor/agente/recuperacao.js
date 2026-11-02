/*
 * Fluxo A enxuto: o Recuperador procura só o que faltou depois do Ligador, e o Validador trava a entrega.
 *   lacunas  : Base montada → o que falta e em que páginas procurar (índice A1, sem IA)
 *   tarefas  : lacunas → chamadas ao agente (10 lacunas, 10 chamadas, 80 mil caracteres)
 *
 * Sem dependências, para colar em nó Code junto com lmr.js, indice.js, leitura.js e agente.js. Exporta RECUPERACAO.
 */
const RECUPERACAO = (() => {
  const t = v => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
  const LEIT = () => (typeof LEITURA !== 'undefined' ? LEITURA : require('../leitura/leitura.js'));

  const LACUNAS_POR_CHAMADA = 10, CHAMADAS_POR_EXECUCAO = 10, PAGINAS_POR_LACUNA = 5, CHAMADA = 80000, CABECALHO = 2500;
  const RE_V8 = /^TAG (\S+) não está nos documentos \(V8\)/;
  const unicas = xs => { const vistos = new Set(); return xs.filter(p => { const k = `${p.k}|${p.pagina}`; return !vistos.has(k) && vistos.add(k); }); };

  // Páginas onde o índice achou o código. A quantidade nunca vem da lista de sobressalentes (é de reposição).
  function paginasDe(indexados, { pmib, tags = [], semLista = false }) {
    const doMaterial = [], daTag = [];
    indexados.forEach((d, k) => {
      if (semLista && d.doc.tipo === 'MPB') return;
      if (pmib) for (const x of d.materiais) if (x.pmib === pmib) doMaterial.push({ k, pagina: x.pagina });
      for (const x of d.tags) if (tags.includes(x.valor)) daTag.push({ k, pagina: x.pagina });
    });
    return unicas([...daTag, ...doMaterial]).slice(0, PAGINAS_POR_LACUNA);
  }

  /** m = saída de AGENTE.montaBaseDoAgente; devolve { enviar, semPagina }, com as lacunas em ordem de prioridade. */
  function lacunas({ m, st, indexados }) {
    const ind = LEIT().indiceCompacto(indexados);
    const porPmib = new Map(st.catalogo.map(c => [c.pmib, c]));
    const lidoDaTag = (pmib, tag, campo) => {
      const lido = m.R && m.R.materiais.get(pmib);
      return t(((lido && lido.tags) || []).map(x => (x && x.tag === tag ? x[campo] : '')).find(Boolean));
    };
    const achadas = [];
    const vistas = new Set();
    const add = (prioridade, pmib, campo, tag, paginas, valorLido = '') => {
      const c = porPmib.get(pmib);
      const k = `${pmib}|${campo}|${tag || ''}`;
      if (!c || vistas.has(k)) return;
      vistas.add(k);
      achadas.push({ pmib, item: c.item, descricao: c.descricao, codigo: t(c.codigoMaterial) || t(c.codigoCmi), campo, tag: tag || null, prioridade, valorLido, paginas });
    };
    // 1. material sem nenhuma posição
    const semPosicao = new Set();
    for (const x of m.leitura) if (!t(x.TAGS) && !t(x.PAIS) && !t(x['ÁREA'])) {
      semPosicao.add(x.PMIB);
      add(1, x.PMIB, 'tag', null, paginasDe(indexados, { pmib: x.PMIB, tags: ind.sug[x.PMIB] || [] }));
    }
    // 2. TAG sem área; TAG que não está nos documentos (procura no material, porque a TAG não aparece em lugar nenhum)
    for (const r of m.base) if (t(r.TAG) && !t(r['ÁREA/PAINEL']))
      add(2, r.FICHA_PMIB, 'area', r.TAG, paginasDe(indexados, { pmib: r.FICHA_PMIB, tags: [r.TAG] }), lidoDaTag(r.FICHA_PMIB, r.TAG, 'area'));
    for (const p of m.pendencias) {
      const v8 = p.TIPO === 'LEITURA' && t(p.DETALHE).match(RE_V8);
      if (v8) add(2, p.PMIB, 'tag', v8[1], paginasDe(indexados, { pmib: p.PMIB, tags: ind.sug[p.PMIB] || [] }));
    }
    // 3. elevação da TAG; quantidade de material sem TAG
    for (const r of m.base) if (t(r.TAG) && t(r['ÁREA/PAINEL']) && !t(r['ELEVAÇÃO']))
      add(3, r.FICHA_PMIB, 'elevacao', r.TAG, paginasDe(indexados, { tags: [r.TAG] }), lidoDaTag(r.FICHA_PMIB, r.TAG, 'elevacao'));
    for (const p of m.pendencias) if (p.TIPO === 'QTD' && !semPosicao.has(p.PMIB))
      add(3, p.PMIB, 'qtd_instalada', null, paginasDe(indexados, { pmib: p.PMIB, semLista: true }));

    const ordenadas = achadas.map((x, i) => [x, i]).sort((a, b) => a[0].prioridade - b[0].prioridade || a[1] - b[1]).map(([x]) => x);
    const comPagina = ordenadas.filter(x => x.paginas.length);
    return { enviar: comPagina.map((x, i) => ({ id: `L-${i + 1}`, ...x })), semPagina: ordenadas.filter(x => !x.paginas.length).map((x, i) => ({ id: `S-${i + 1}`, ...x })) };
  }

  const textoDaPagina = s => String(s || '').replace(/[ \t ]+/g, ' ').replace(/ *\n\s*/g, '\n').trim();
  const CAMPO = { tag: 'TAG onde o material está instalado', area: 'área da TAG', elevacao: 'elevação da TAG', qtd_instalada: 'quantidade instalada (nunca a de reposição)' };
  const linhaLacuna = (l, indexados) => `- ${l.id} | PMIB ${l.pmib} | item ${l.item} | ${t(l.descricao)} | cód. ${l.codigo || '-'} | procure: ${l.tag ? `${CAMPO[l.campo]} (TAG lida: ${l.tag})` : CAMPO[l.campo]} | campo: ${l.campo}${l.valorLido ? ` | valor recusado: ${l.valorLido}` : ''} | páginas: ${l.paginas.map(p => `${indexados[p.k].doc.arquivo} p.${p.pagina}`).join('; ')}`;

  function mensagem(escolhidas, paginas, cfg, parte, de) {
    const ls = [`WORKFLOW LMR — RECUPERADOR${de > 1 ? ` (parte ${parte} de ${de})` : ''}`,
      `Sistema: ${cfg.sistema} | Subsistema: ${cfg.subsistema} | Escopo: ${cfg.escopo}`, '',
      'Não há anexos: o texto das páginas está no fim desta mensagem. Procure só nas páginas indicadas em cada lacuna.', '',
      `LACUNAS (${escolhidas.length}). Responda TODAS, uma vez cada:`, ...escolhidas.map(l => l.linha), '',
      `RESPOSTA: só o JSON do formato "Recuperador", num bloco \`\`\`json, com "etapa": "R" e "parte": "${parte}". Não gere arquivo para baixar.`,
      '', '=== TEXTO DAS PÁGINAS ==='];
    for (const p of paginas) ls.push(`### ${p.arquivo} — página ${p.pagina}`, p.texto);
    return ls.join('\n');
  }

  /** Lacunas → chamadas. Lacuna que não coube fica em sobra e vira pendência no fim. */
  function tarefas(enviar, indexados, cfg) {
    const max = Number(cfg.chamada) || CHAMADA;
    let fila = enviar;
    const grupos = [];
    while (fila.length && grupos.length < CHAMADAS_POR_EXECUCAO) {
      const escolhidas = [], resto = [], paginas = new Map();
      let tam = CABECALHO;
      for (const l of fila) {
        if (escolhidas.length >= LACUNAS_POR_CHAMADA) { resto.push(l); continue; }
        const usadas = [];
        const novas = new Map();
        let tamL = 0;
        for (const p of l.paginas) {
          const k = `${p.k}|${p.pagina}`;
          if (paginas.has(k)) { usadas.push(p); continue; }
          const arquivo = indexados[p.k].doc.arquivo;
          let texto = textoDaPagina((indexados[p.k].paginas[p.pagina - 1] || {}).texto);
          const sobra = max - tam - tamL - arquivo.length - 40;
          // página maior que a chamada: vai cortada, só se a lacuna ainda não tem nenhuma página
          if (texto.length > sobra) { if (usadas.length || escolhidas.length || sobra < 1000) continue; texto = texto.slice(0, sobra); }
          novas.set(k, { arquivo, pagina: p.pagina, texto });
          tamL += texto.length + arquivo.length + 40;
          usadas.push(p);
        }
        if (!usadas.length) { resto.push(l); continue; }
        const x = { ...l, paginas: usadas };
        escolhidas.push({ lacuna: x, linha: linhaLacuna(x, indexados) });
        for (const [k, v] of novas) paginas.set(k, v);
        tam += tamL + 400;
      }
      if (!escolhidas.length) break;
      grupos.push({ escolhidas, paginas: [...paginas.values()] });
      fila = resto;
    }
    const lista = grupos.map((g, i) => {
      const parte = String(i + 1);
      const chatInput = mensagem(g.escolhidas, g.paginas, cfg, parte, grupos.length);
      return { etapa: 'R', parte, rotulo: `recuperador parte ${parte}`, sessionId: `${cfg.sessao || 'lmr'}-r-p${parte}`, chatInput,
        lacunas: g.escolhidas.map(x => x.lacuna.id), lacunasEnviadas: g.escolhidas.map(x => x.lacuna), controle: [], pmibs: [], caracteres: chatInput.length };
    });
    return { tarefas: lista, sobra: fila };
  }

  return { lacunas, tarefas };
})();
if (typeof module !== 'undefined') module.exports = RECUPERACAO;

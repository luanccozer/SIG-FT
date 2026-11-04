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
    const vistas = new Map();
    const add = (prioridade, pmib, campo, tag, paginas, valorLido = '') => {
      const c = porPmib.get(pmib);
      if (!c) return;
      // área e elevação são da TAG: uma pergunta só, aplicada a todos os materiais dela
      const k = campo === 'area' || campo === 'elevacao' ? `${campo}|${tag}` : `${pmib}|${campo}|${tag || ''}`;
      if (vistas.has(k)) { const a = vistas.get(k); if (!a.pmibs.includes(pmib)) a.pmibs.push(pmib); return; }
      const x = { pmib, pmibs: [pmib], item: c.item, descricao: c.descricao, codigo: t(c.codigoMaterial) || t(c.codigoCmi), campo, tag: tag || null, prioridade, valorLido, paginas };
      vistas.set(k, x);
      achadas.push(x);
    };
    // 1. material sem nenhuma posição (filho documental tem a posição do pai só na Base)
    const semPosicao = new Set();
    const comPai = new Set(m.base.filter(r => t(r.PAIS)).map(r => t(r.FICHA_PMIB)));
    for (const x of m.leitura) if (!t(x.TAGS) && !t(x.PAIS) && !t(x['ÁREA']) && !comPai.has(x.PMIB)) {
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
    // 3. quantidade de material sem TAG; elevação da TAG (depois: sem ela ainda sobra a pendência por área)
    for (const p of m.pendencias) if (p.TIPO === 'QTD' && !semPosicao.has(p.PMIB))
      add(3, p.PMIB, 'qtd_instalada', null, paginasDe(indexados, { pmib: p.PMIB, semLista: true }));
    for (const r of m.base) if (t(r.TAG) && t(r['ÁREA/PAINEL']) && !t(r['ELEVAÇÃO']))
      add(3, r.FICHA_PMIB, 'elevacao', r.TAG, paginasDe(indexados, { tags: [r.TAG] }), lidoDaTag(r.FICHA_PMIB, r.TAG, 'elevacao'));

    const ordenadas = achadas.map((x, i) => [x, i]).sort((a, b) => a[0].prioridade - b[0].prioridade || a[1] - b[1]).map(([x]) => x);
    const comPagina = ordenadas.filter(x => x.paginas.length);
    return { enviar: comPagina.map((x, i) => ({ id: `L-${i + 1}`, ...x })), semPagina: ordenadas.filter(x => !x.paginas.length).map((x, i) => ({ id: `S-${i + 1}`, ...x })) };
  }

  const textoDaPagina = s => String(s || '').replace(/[ \t ]+/g, ' ').replace(/ *\n\s*/g, '\n').trim();
  const CAMPO = { tag: 'TAG onde o material está instalado', area: 'área da TAG', elevacao: 'elevação da TAG', qtd_instalada: 'quantidade instalada (nunca a de reposição)' };
  const linhaLacuna = (l, indexados) => `- ${l.id} | PMIB ${l.pmib} | item ${l.item} | ${t(l.descricao)} | cód. ${l.codigo || '-'} | procure: ${l.tag ? `${CAMPO[l.campo]} (TAG lida: ${l.tag})` : CAMPO[l.campo]} | campo: ${l.campo}${l.valorLido ? ` | valor recusado: ${l.valorLido}` : ''} | páginas: ${l.paginas.map(p => `${indexados[p.k].doc.arquivo} p.${p.pagina}`).join('; ')}`;

  function mensagem(escolhidas, paginas, cfg, parte, de, areas) {
    const ls = [`WORKFLOW LMR — RECUPERADOR${de > 1 ? ` (parte ${parte} de ${de})` : ''}`,
      `Sistema: ${cfg.sistema} | Subsistema: ${cfg.subsistema} | Escopo: ${cfg.escopo}`, '',
      'Não há anexos: o texto das páginas está no fim desta mensagem. Procure só nas páginas indicadas em cada lacuna.', '',
      `LACUNAS (${escolhidas.length}). Responda TODAS, uma vez cada:`, ...escolhidas.map(l => l.linha), '',
      ...(areas.length && escolhidas.some(l => l.lacuna.campo === 'area') ? [`ÁREAS VÁLIDAS (responda com um destes nomes; se a página não permitir escolher um deles, responda "achou": false): ${areas.map(a => a.nome).join(' ; ')}`, ''] : []),
      `RESPOSTA: só o JSON do formato "Recuperador", num bloco \`\`\`json, com "etapa": "R" e "parte": "${parte}". Não gere arquivo para baixar.`,
      '', '=== TEXTO DAS PÁGINAS ==='];
    for (const p of paginas) ls.push(`### ${p.arquivo} — página ${p.pagina}`, p.texto);
    return ls.join('\n');
  }

  /** Lacunas → chamadas. Lacuna que não coube fica em sobra e vira pendência no fim. */
  function tarefas(enviar, indexados, cfg, areas = []) {
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
      const chatInput = mensagem(g.escolhidas, g.paginas, cfg, parte, grupos.length, areas);
      return { etapa: 'R', parte, rotulo: `recuperador parte ${parte}`, sessionId: `${cfg.sessao || 'lmr'}-r-p${parte}`, chatInput,
        lacunas: g.escolhidas.map(x => x.lacuna.id), lacunasEnviadas: g.escolhidas.map(x => x.lacuna), controle: [], pmibs: [], caracteres: chatInput.length };
    });
    return { tarefas: lista, sobra: fila };
  }

  const compacto = v => String(v == null ? '' : v).toUpperCase().replace(/\s+/g, '');
  const noTextoDasPaginas = (valor, paginas, indexados) => paginas.some(p => compacto((indexados[p.k].paginas[p.pagina - 1] || {}).texto).includes(compacto(valor)));
  const vazio = pmib => ({ pmib, encontrado: false, papel: null, kit: false, tags: [], pais: [], area: null, elevacao: null, qtd_instalada: null, frequencia: null, evidencia: '' });

  /**
   * Respostas do Recuperador → uma resposta da etapa 4 (R.materiais + o que foi achado), que entra por último em
   * montaBaseDoAgente e passa pelas mesmas conferências das outras. Só preenche o que estava vazio ou foi recusado.
   */
  function aplica({ respostasR, lacunas: enviadas, R, indexados }) {
    const A = typeof AGENTE !== 'undefined' ? AGENTE : require('./agente.js');
    const M = typeof LMR !== 'undefined' ? LMR : require('../lmr.js');
    const porId = new Map(enviadas.map(l => [l.id, l]));
    const respondidas = new Set(), pendencias = [], materiais = new Map();
    const pende = (l, detalhe) => pendencias.push({ PMIB: l ? l.pmib : '', ITEM: l ? l.item : '', 'DESCRIÇÃO': l ? l.descricao : 'RECUPERADOR', TIPO: 'RECUPERADOR', DETALHE: detalhe });
    const doMaterial = pmib => {
      if (!materiais.has(pmib)) { const m = R.materiais.get(pmib); materiais.set(pmib, m ? { ...m, tags: (m.tags || []).map(x => (x && typeof x === 'object' ? { ...x } : { tag: x })) } : vazio(pmib)); }
      return materiais.get(pmib);
    };
    const alterados = new Set();
    let resolvidas = 0;
    for (const { texto } of respostasR) {
      const j = A.jsonDaResposta(texto);
      for (const x of (j && Array.isArray(j.recuperacoes) ? j.recuperacoes : [])) {
        const id = t(x && x.lacuna), l = porId.get(id);
        if (!l) { pende(null, `resposta para a lacuna ${id || '(sem id)'}, que não foi pedida: ignorada`); continue; }
        if (t(x.campo) !== l.campo) { pende(l, `${id}: respondeu o campo ${t(x.campo) || '(vazio)'}, mas o pedido era ${l.campo}: ignorada`); respondidas.add(id); continue; }
        respondidas.add(id);
        if (x.achou !== true) { pende(l, `${id} (${l.campo}${l.tag ? ` da TAG ${l.tag}` : ''}): não achou${t(x.procurou) ? `; procurou em ${t(x.procurou)}` : ''}`); continue; }
        const fonte = t(x.evidencia);
        const mantem = atual => pende(l, `${id}: ${l.campo} já preenchido com ${atual}; mantido o valor (sugestão ignorada: ${t(x.valor)})`);
        const anotaFonte = m => { m.evidencia = [t(m.evidencia), `recuperador: ${fonte}`].filter(Boolean).join('; '); };
        if (l.campo === 'tag') {
          const novas = (Array.isArray(x.valor) ? x.valor : [x.valor]).map(t).filter(Boolean);
          if (!/^(proprio|peca)$/i.test(t(x.papel))) { pende(l, `${id}: TAG ${novas.join(', ')} sem papel (proprio ou peca): não entra`); continue; }
          const fora = novas.filter(v => !noTextoDasPaginas(v, l.paginas, indexados));
          if (!novas.length || fora.length) { pende(l, `${id}: TAG ${fora.join(', ') || '(vazia)'} não está no texto das páginas citadas: não entra`); continue; }
          const m = doMaterial(l.pmib);
          if (!l.tag && m.tags.length) { mantem(m.tags.map(y => y.tag).join(', ')); continue; }
          m.tags = [...m.tags.filter(y => y.tag !== l.tag), ...novas.map(tag => ({ tag, area: null, rds_proprio: null, elevacao: null }))];
          m.encontrado = true; m.papel = t(x.papel).toLowerCase();
          anotaFonte(m);
        } else if (l.campo === 'area' || l.campo === 'elevacao') {
          const valor = l.campo === 'elevacao' ? M.formataElevacao(x.valor).valor : t(x.valor);
          if (!valor) { pende(l, `${id}: ${l.campo} inválido (${t(x.valor)}): não entra`); continue; }
          const alvos = (l.pmibs || [l.pmib]).map(pmib => ({ pmib, m: doMaterial(pmib), alvo: doMaterial(pmib).tags.find(y => y.tag === l.tag) })).filter(a => a.alvo);
          if (!alvos.length) { pende(l, `${id}: a TAG ${l.tag} não está mais no material: não entra`); continue; }
          const aceitos = alvos.filter(a => !t(a.alvo[l.campo]) || l.valorLido);
          if (!aceitos.length) { mantem(t(alvos[0].alvo[l.campo])); continue; }
          for (const a of aceitos) { a.alvo[l.campo] = valor; anotaFonte(a.m); alterados.add(a.pmib); }
          resolvidas++;
          continue;
        } else {
          const q = Number(String(x.valor == null ? '' : x.valor).replace(',', '.'));
          if (!(q > 0)) { pende(l, `${id}: quantidade inválida (${t(x.valor)}): não entra`); continue; }
          if (/&MPB/i.test(fonte) && !/&(MPA|APA|EPA|MLU|MTB|MTC|MLD|MFB|EFF)|LISTA DE MATERIA/i.test(fonte)) { pende(l, `${id}: quantidade ${q} recusada: a fonte é a lista de sobressalentes (reposição)`); continue; }
          // a lacuna só existe quando o motor não aceitou nenhum valor; a evidência antiga sai porque pode ser a que ele recusou (&MPB)
          const m = doMaterial(l.pmib);
          m.qtd_instalada = q;
          m.evidencia = `recuperador: ${fonte}`;
        }
        alterados.add(l.pmib);
        resolvidas++;
      }
    }
    for (const l of enviadas) if (!respondidas.has(l.id)) pende(l, `${l.id} (${l.campo}${l.tag ? ` da TAG ${l.tag}` : ''}): sem resposta do Recuperador`);
    const lista = [...alterados].map(p => materiais.get(p));
    return { resposta: lista.length ? { arquivo: 'recuperador', texto: JSON.stringify({ etapa: 4, parte: 'R', arquivos: [], controle: [], observacoes: [], materiais: lista }) } : null,
      pendencias, enviadas: enviadas.length, resolvidas };
  }

  // ── Validador: trava a entrega ──
  const OBRIGATORIOS = ['ÁREA/PAINEL', 'RDS-PP', 'LOCAL', 'ELEVAÇÃO', 'EIXO', 'TRECHOS', 'QTD POR TRECHO'];
  const DA_AREA = ['RDS-PP', 'LOCAL', 'EIXO'];
  const REGRAS_DE_FORMATO = new Set(['V2', 'V4', 'V5', 'V14', 'V15']);
  const RE_FORMA_RDS = /^#ST(\d\d|\[XX\])=[A-Z](\[XX\]|[0-9A]{2,3})[A-Z]{3}\d\d/;

  /** Campo da área vazio: já passou pela pessoa em "Confira as áreas"; uma pendência por área, como a de ELEVAÇÃO. */
  function pendenciasDeArea(base, pendencias) {
    const ja = new Set(pendencias.filter(p => p.TIPO === 'ÁREA').map(p => t(p['DESCRIÇÃO'])));
    const vazios = new Map();
    for (const r of base) {
      const a = t(r['ÁREA/PAINEL']);
      if (!a || ja.has(`ÁREA ${a}`)) continue;
      for (const k of DA_AREA) if (!t(r[k]) && !(k === 'RDS-PP' && t(r.PAIS))) (vazios.get(a) || vazios.set(a, new Set()).get(a)).add(k);
    }
    return [...vazios].map(([a, ks]) => ({ PMIB: '', ITEM: '', 'DESCRIÇÃO': `ÁREA ${a}`, TIPO: 'ÁREA', DETALHE: `a área ${a} ficou sem ${[...ks].join(', ')}: preencha nas linhas da BASE com ÁREA/PAINEL = ${a}` }));
  }

  /** Fora de UG o RDS-PP é o do documento (PLANO, frequência): [XX] volta a 00, e a linha com UG e AMD/AMC se divide. */
  function rdsForaDeUg(base) {
    const literal = s => t(s).replace(/#ST\[XX\]=M\[XX\]/g, '#ST00=M00');
    const out = [];
    for (const r of base) {
      const trs = t(r.TRECHOS).split(/\s*,\s*/).filter(Boolean);
      const fora = trs.filter(x => /^AM[DC]-/.test(x));
      if (!fora.length || !/\[XX\]/.test(`${r['RDS-PP']} ${r.PAIS}`)) { out.push(r); continue; }
      const ug = trs.filter(x => !fora.includes(x));
      if (ug.length) out.push({ ...r, TRECHOS: ug.join(', ') });
      out.push({ ...r, 'RDS-PP': literal(r['RDS-PP']), PAIS: literal(r.PAIS), TRECHOS: fora.join(', ') });
    }
    return out.map((r, i) => ({ ...r, LINHA: i + 1 }));
  }

  /** Valor sem a forma #STnn=… não é RDS-PP: sai da linha e vira pendência da área. M inválido tem a forma e continua travando (V4). */
  function limpaRdsSemForma(base) {
    const achados = new Map();
    // shortcut: o mesmo valor em PAIS fica na linha e só a pendência avisa; limpar também se aparecer no Workflow B
    for (const r of base) {
      const v = t(r['RDS-PP']);
      if (v && !RE_FORMA_RDS.test(v)) { r['RDS-PP'] = ''; achados.set(t(r['ÁREA/PAINEL']), v); }
    }
    return [...achados].map(([a, v]) => ({ PMIB: '', ITEM: '', 'DESCRIÇÃO': `ÁREA ${a}`, TIPO: 'ÁREA', DETALHE: `o RDS-PP ${v} da área ${a} está fora do formato (#STnn=...) e foi retirado: preencha RDS-PP nas linhas da BASE com ÁREA/PAINEL = ${a}` }));
  }

  /** Vazios que o motor produz sem pendência: linha sem área (pai sem área), sem trecho na frequência, ou PMIB sem linha por RDS-PP de frequência. */
  function pendenciasDeLinha({ base, pendencias, catalogo, areas }) {
    const porPmib = new Map(catalogo.map(c => [c.pmib, c]));
    const ja = new Set(pendencias.map(p => t(p.PMIB)).filter(Boolean));
    const out = [];
    const pende = (pmib, TIPO, DETALHE) => {
      if (ja.has(pmib)) return;
      ja.add(pmib);
      const c = porPmib.get(pmib) || {};
      out.push({ PMIB: pmib, ITEM: c.item || '', 'DESCRIÇÃO': c.descricao || '', TIPO, DETALHE });
    };
    for (const r of base) {
      const pmib = t(r.FICHA_PMIB);
      if (!t(r['ÁREA/PAINEL'])) pende(pmib, 'ÁREA', `linha ${r.LINHA} sem área${t(r.PAIS) ? ` (montado em ${t(r.PAIS).split('|')[0].trim()}, que também não tem área)` : ''}: preencha ÁREA/PAINEL, LOCAL, ELEVAÇÃO e EIXO`);
      if (!t(r.TRECHOS)) pende(pmib, 'FREQUÊNCIA', `linha ${r.LINHA}: nenhum trecho do projeto na frequência do material: confira a frequência ou preencha TRECHOS`);
    }
    if (areas.some(a => /\[F\]/.test(t(a.rds)))) {
      const comLinha = new Set(base.map(r => t(r.FICHA_PMIB)));
      for (const c of catalogo) if (!comLinha.has(c.pmib)) pende(c.pmib, 'FREQUÊNCIA', 'área com RDS-PP por frequência (#ST50 ou #ST60) e nenhum trecho do material nesse grupo: o material ficou sem linha');
    }
    return out;
  }

  /** Base → violações. Corrige na linha o que é certo (elevação 98.5 → 98,50). Vazia = pode entregar. */
  function valida({ base, pendencias, catalogo, LMR: M }) {
    const comPmib = new Set(pendencias.map(p => t(p.PMIB)).filter(Boolean));
    const comArea = new Set(pendencias.map(p => t(p['DESCRIÇÃO'])).filter(x => x.startsWith('ÁREA ')));
    const out = [];
    const viola = (REGRA, r, DETALHE) => out.push({ REGRA, 'LINHA DA BASE': r.LINHA, FICHA_PMIB: r.FICHA_PMIB, DETALHE });
    const comLinha = new Set(base.map(r => t(r.FICHA_PMIB)));
    for (const c of catalogo) if (!comLinha.has(c.pmib) && !comPmib.has(c.pmib))
      out.push({ REGRA: 'PMIB', 'LINHA DA BASE': '', FICHA_PMIB: c.pmib, DETALHE: 'material do Status sem linha na Base e sem pendência com motivo' });
    for (const r of base) {
      const elev = t(r['ELEVAÇÃO']);
      if (elev) { const x = M.formataElevacao(elev).valor; if (x) r['ELEVAÇÃO'] = x; }
      // shortcut: qualquer pendência do material ou da área dispensa o campo; separar por tipo se aparecer vazio sem explicação
      const explicado = comPmib.has(t(r.FICHA_PMIB)) || comArea.has(`ÁREA ${t(r['ÁREA/PAINEL'])}`);
      if (!explicado) for (const k of OBRIGATORIOS) {
        if (t(r[k])) continue;
        if (t(r.PAIS) && (k === 'ÁREA/PAINEL' || k === 'RDS-PP')) continue;
        viola('CAMPO', r, `${k} vazio, sem pendência`);
      }
      // formato: gera a aplicação da linha como o Workflow B; TRECHOS e QTD vazios não impedem de conferir o resto
      const copia = { ...r, TRECHOS: t(r.TRECHOS) || 'U-01', 'QTD POR TRECHO': 1 };
      if (t(r['RDS-PP']) && !RE_FORMA_RDS.test(t(r['RDS-PP']))) viola('FORMATO', r, `RDS-PP fora do formato: ${t(r['RDS-PP'])}`);
      const vistos = new Set();
      for (const a of M.geraLote([copia], new Set())[0].achados) {
        // local fora da lista não trava: a lista fechada de locais ainda é pendência da equipe (HANDOFF §10)
        if (a.SEVERIDADE !== 'bloqueia' || !REGRAS_DE_FORMATO.has(a.REGRA) || /^local fora/.test(a.MENSAGEM) || vistos.has(a.MENSAGEM)) continue;
        vistos.add(a.MENSAGEM);
        viola('FORMATO', r, `${a.REGRA}: ${a.MENSAGEM}`);
      }
    }
    return out;
  }

  const abasDoBloqueio = (violacoes, chamadas) => [
    { nome: 'VIOLAÇÕES', colunas: ['REGRA', 'LINHA DA BASE', 'FICHA_PMIB', 'DETALHE'], linhas: violacoes, larguras: { DETALHE: 90 } },
    { nome: 'CHAMADAS DO AGENTE', colunas: ['CHAMADA', 'CARACTERES ENVIADOS', 'CARACTERES RECEBIDOS', 'ERRO'], linhas: chamadas, larguras: { CHAMADA: 24, ERRO: 80 } },
  ];

  /** Saída do nó AMP Agent: JSON cortado ou inválido vira erro temporário, para usar as mesmas tentativas do erro do nó. */
  function checaResposta(j) {
    if (j.error) return j;
    if (j.output && typeof j.output === 'object') return j;
    const s = String(j.output == null ? '' : j.output);
    const blocos = [...s.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(m => m[1]);
    const ini = s.indexOf('{'), fim = s.lastIndexOf('}');
    const candidatos = [...blocos, ...(ini >= 0 && fim > ini ? [s.slice(ini, fim + 1)] : [])];
    for (const c of candidatos) { try { const x = JSON.parse(c); if (x && typeof x === 'object') return j; } catch (e) { /* próximo */ } }
    return { ...j, error: { message: 'resposta temporariamente inválida: JSON cortado ou inválido' } };
  }

  return { lacunas, tarefas, aplica, pendenciasDeArea, rdsForaDeUg, limpaRdsSemForma, pendenciasDeLinha, valida, abasDoBloqueio, checaResposta };
})();
if (typeof module !== 'undefined') module.exports = RECUPERACAO;

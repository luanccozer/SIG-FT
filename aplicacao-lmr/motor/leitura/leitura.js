/*
 * Leitura com IA e montagem da Base — Workflow A, etapas A2 e A3.
 *
 * A1 (indice.js) entrega o texto de cada página e as sugestões de TAG da lista de sobressalentes.
 * A2 faz duas leituras, com JSON curto de esquema fixo:
 *   1. ÁREAS (1 chamada): os conjuntos físicos do sistema (skid, painel, tanque…) com RDS-PP, local, elevação e eixo.
 *   2. MATERIAIS (1 chamada por lote de até 8 materiais, limitado pelo tamanho do pedido): TAGs, área de cada TAG, RDS-PP próprio, pai, QTD instalada, frequência.
 *   Toda TAG devolvida é conferida no texto dos documentos (V8); o que não se confirma vai para PENDÊNCIAS.
 * A3 monta a Base (abas BASE, CABEÇALHO, DOCS DE REFERÊNCIA, RELAÇÕES) no formato que o Workflow B lê.
 * Nada é preenchido por suposição: sem fonte → PENDÊNCIAS.
 *
 * Sem dependências, para colar em nó Code junto com lmr.js. Exporta LEITURA.
 */
const LEITURA = (() => {
  const t = v => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
  const up = v => t(v).toUpperCase();
  const compacto = v => String(v || '').toUpperCase().replace(/\s+/g, '');
  const EIXOS = ['AB', 'BC', 'CD', 'MB', 'JB', 'JD'];
  const LOCAIS = ['CASA DE FORÇA', 'SALA GERADORES DIESEL'];
  const RE_RDS = /#ST\d{2}=[A-Z]\d{2}[A-Z]{3}\d{2}(?:[A-Z]{2}\d{3}(?:-[A-Z]{2}\d{3})?)?(?:&[A-Z]{3}\d{3})?/g;

  // RDS-PP de uma UG (#ST50=M01…, #ST60=M18A…) → forma do sistema (#ST00=M00…); M00, M50, M60 e fora de UG ficam.
  const RE_UG = /^#ST(?:50|60)=M(?:0[1-9]|1\d|20|9A|18A)(?=[A-Z]{3}\d{2})/;
  // RDS-PP do grupo de frequência (#ST50=M50…, #ST60=M60…) → #ST[F]=M[F]…: a Base ganha uma linha por frequência.
  const doSistema = rds => rds.replace(RE_UG, '#ST00=M00').replace(/^#ST(50|60)=M\1(?=[A-Z]{3}\d{2})/, '#ST[F]=M[F]');
  const semPrefixo = rds => rds.replace(/^#?ST\d\d=[A-Z][0-9A]{2,3}(?=[A-Z]{3}\d{2})/, '');
  const trecho = (texto, i, antes, depois) => t(texto.slice(Math.max(0, i - antes), i + depois));

  // ── índice compacto: o que as leituras e a conferência precisam do A1 ──
  function indiceCompacto(indexados) {
    const paginas = [];
    const sug = {};
    for (const d of indexados) {
      const rot = d.doc.codigo || d.doc.arquivo;
      for (const p of d.paginas) if (p.texto.replace(/\s/g, '').length >= 20) paginas.push({ d: rot, tipo: d.doc.tipo, p: p.pagina, x: p.texto });
      for (const s of d.sugestoes) (sug[s.pmib] = sug[s.pmib] || []).push(...s.tags.filter(x => !(sug[s.pmib] || []).includes(x)));
    }
    const docs = indexados.map(d => ({ d: d.doc.codigo || d.doc.arquivo, tipo: d.doc.tipo, desc: d.doc.tipoDescricao,
      inicio: t((d.paginas.find(p => p.texto.trim()) || { texto: '' }).texto).slice(0, 4000) }));
    const elevs = [...new Set(indexados.flatMap(d => d.elev.map(x => x.valor)))].sort();
    return { paginas, sug, docs, elevs };
  }

  const ondeAparece = (ind, valor, max, antes = 150, depois = 150) => {
    const r = [];
    for (const p of ind.paginas) {
      const i = p.x.indexOf(valor);
      if (i >= 0) r.push({ d: p.d, tipo: p.tipo, p: p.p, s: trecho(p.x, i, antes, depois) });
      if (r.length >= max) break;
    }
    return r;
  };
  const noTexto = (ind, valor) => { const k = compacto(valor); return !!k && ind.paginas.some(p => compacto(p.x).includes(k)); };
  const sistemaDaLista = lista => (t(lista).match(/=[A-Z]\d{2}([A-Z]{3}\d{2})/) || [])[1] || '';

  // ── evidências sem IA ──
  // Equipamento de um RDS-PP ou código de documento: #ST00=M00MKF10CN010-CN001&MTB010 → CN010 (liga documento e área).
  const chaveEquip = v => (up(v).replace(/^#?ST(?:\d\d|\[XX\])=[A-Z0-9[\]]{3,5}?(?=[A-Z]{3}\d{2})/, '').replace(/^[A-Z]{3}\d{2}/, '').match(/^[A-Z]{2}\d{3}/) || [''])[0];
  // Ordem de confiança dos documentos para dizer onde uma TAG está instalada (lista de material e diagrama primeiro).
  const PRIORIDADE = ['MPA', 'APA', 'MTC', 'MTB', 'EFF', 'EPA', 'MLD', 'MFB', 'MLU', 'MFE', 'MDB', 'MDC', 'MDD', 'ACC'];
  const prioridade = tipo => { const i = PRIORIDADE.indexOf(tipo); return i < 0 ? PRIORIDADE.length : i; };

  // Kit de manutenção (vai para um equipamento): a convenção do formulário decide se leva a TAG do equipamento.
  const ehKit = c => /\bKITS?\b/i.test(c.descricao || '') || /^(JOGO|CONJUNTO)\s+DE\s+(REPARO|VEDA|MANUTEN)/i.test(t(c.descricao));

  // TAGs de painel numa célula: "52.1;72.1...72.24", "KA1...KA3", "S2; S4". Range com prefixo colado ao modelo
  // ("SPAKA1...KA3", de 58.34.9.024.0050SPA) fica com o prefixo do fim. Qualquer pedaço fora do formato → null.
  const TAG_PAINEL = /^(?:[A-Z]{1,3}\d{1,3}|\d{1,3}\.\d{1,3})$/;
  const NAO_TAG_PAINEL = /^(PN|CL|DN|SCH|IP|NPT|UN)\d/;
  function tagsDaCelula(celula) {
    const out = [];
    for (const tok of String(celula).replace(/\s+/g, '').split(/[;,]/).filter(Boolean)) {
      const r = tok.match(/^([A-Z]*)(\d+(?:\.\d+)?)(?:\.{2,}|…)([A-Z]*)(\d+(?:\.\d+)?)$/);
      if (r) {
        let [, p1, a, p2, z] = r;
        if (p2 && p1 !== p2) { if (p1.endsWith(p2)) p1 = p2; else return null; }
        if (a.includes('.') !== z.includes('.')) return null;
        const [x, i] = a.includes('.') ? a.split('.') : ['', a], [y, j] = z.includes('.') ? z.split('.') : ['', z];
        if (x !== y || +j <= +i || +j - +i > 60) return null;
        for (let k = +i; k <= +j; k++) out.push(`${p1}${x ? `${x}.` : ''}${k}`);
      } else if (TAG_PAINEL.test(tok) && !NAO_TAG_PAINEL.test(tok)) out.push(tok);
      else return null;
    }
    return out.length ? out : null;
  }
  const modelosDoMaterial = c => [...new Set([...(t(c.descricao).match(/\(([^()]+)\)\s*$/) || []).slice(1), ...t(c.marcaModelo).split('/').slice(1)]
    .map(s => up(s)).filter(s => s.length >= 4 && /\d/.test(s)))];

  // Lista de materiais do painel (diagrama EFF, "Lista de materiais PWB"): o modelo vem colado às TAGs instaladas
  // ("5ST301252.1;72.1...72.24 Contato auxiliar…"). Vale mais que a lista de sobressalentes (que é de reposição).
  // Uma só leitura possível e toda TAG confirmada em outra página (diagrama) → { tags, d, docs }; leituras diferentes
  // → { variantes }; nada ou TAG sem confirmação → null (fica com a IA). Formato de outro fornecedor: não acha, não atrapalha.
  function tagsDoPainel(ind, c) {
    const achou = new Map();
    for (const p of ind.paginas) {
      if (p.tipo === 'MPB') continue;
      const T = p.x.toUpperCase();
      for (const m of modelosDoMaterial(c)) for (let i = T.indexOf(m); i >= 0; i = T.indexOf(m, i + 1)) {
        const resto = p.x.slice(i + m.length, i + m.length + 200);
        const fim = resto.search(/[a-zà-ú]/);
        const ts = tagsDaCelula((fim < 0 ? resto : resto.slice(0, fim)).replace(/[A-ZÀ-Ú]+$/, ''));
        if (ts) { const k = ts.join(';'); const x = achou.get(k) || { docs: new Set(), pags: new Set() }; x.docs.add(p.d); x.pags.add(`${p.d}|${p.p}`); achou.set(k, x); }
      }
    }
    if (!achou.size) return null;
    if (achou.size > 1) return { variantes: [...achou.keys()] };
    const [[k, x]] = [...achou];
    const tags = k.split(';');
    const confirmada = tg => ind.paginas.some(q => !x.pags.has(`${q.d}|${q.p}`) && q.x.includes(tg));
    if (!tags.every(confirmada)) return null;
    const docs = [...x.docs];
    return { tags, d: docs.find(chaveEquip) || docs[0], docs };
  }

  // Área de um documento pelo equipamento do código, se uma única área tiver esse equipamento no RDS-PP.
  function areaDoDoc(areas, docs) {
    const cand = new Set();
    for (const d of docs) { const k = chaveEquip(d); if (k) for (const a of areas) if (a.rds && chaveEquip(a.rds) === k) cand.add(a.nome); }
    return cand.size === 1 ? [...cand][0] : '';
  }

  // Títulos de documentos citados no texto ("#ST00=…CN010-CN001&MTB010 - SISTEMA DE PRESSURIZAÇÃO POR NITROGÊNIO …"):
  // dizem o que é cada conjunto e ligam um item de lista de material à área (pela chave do equipamento).
  function titulosDeDocumentos(ind) {
    const r = new Map();
    for (const p of ind.paginas) for (const m of p.x.matchAll(/(#?ST\d{2}=[A-Z0-9]+(?:-[A-Z0-9]+)?&[A-Z]{3}\d{3})\s*-\s*([^\n]{8,140})/g)) {
      const cod = up(m[1]).replace(/^(?!#)/, '#');
      if (!r.has(cod)) r.set(cod, t(m[2]).replace(/\s*\|.*$/, ''));
    }
    return r;
  }

  // ── leitura 1: ÁREAS ──
  // Título do documento: trecho da 1ª página em volta do nome do subsistema (o começo é o carimbo de aprovação).
  const semAcento = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function titulo(inicio, subsistema) {
    const T = semAcento(inicio.toUpperCase()), k = semAcento(up(subsistema));
    const i = k ? T.indexOf(k) : -1;
    return i >= 0 ? trecho(inicio, i, 120, k.length + 160) : inicio.replace(/^.*?APTO PARA ASSINATURA/i, '').slice(0, 280);
  }

  function promptAreas(ind, e) {
    const sis = sistemaDaLista(e.lista);
    const rds = new Map();
    for (const p of ind.paginas) for (const v0 of new Set(p.x.match(RE_RDS) || [])) {
      if (sis && !v0.includes(sis)) continue;
      const v = doSistema(v0);
      const r = rds.get(v) || { n: 0, docs: new Set(), s: trecho(p.x, p.x.indexOf(v0), 120, v0.length + 120) };
      r.n++; r.docs.add(p.d); rds.set(v, r);
    }
    const listaRds = [...rds].sort((a, b) => (a[0].includes('&') - b[0].includes('&')) || b[1].n - a[1].n).slice(0, 60)
      .map(([v, r]) => `- ${v} | ${r.n} pág. | contexto: "${r.s.slice(0, 260)}"`);
    const elev = [], eixos = [];
    for (const p of ind.paginas) {
      for (const m of p.x.matchAll(/(?<![A-Z])EL(?:EV)?\.?\s*\d{2,3}[.,]\d{1,3}(?!\d)/gi)) if (elev.length < 25) elev.push(`- [${p.d} p.${p.p}] "${trecho(p.x, m.index, 120, 120)}"`);
      for (const m of p.x.matchAll(/EIXOS?\b/gi)) if (eixos.length < 15) eixos.push(`- [${p.d} p.${p.p}] "${trecho(p.x, m.index, 80, 120)}"`);
    }
    const titulos = [...titulosDeDocumentos(ind)].filter(([c]) => chaveEquip(c) && (!sis || c.includes(sis))).slice(0, 40)
      .map(([c, x]) => `- ${c} - ${x}`);
    return `PAPEL: Você organiza dados de documentos técnicos de um sistema de usina hidrelétrica (Itaipu). Use só o que está escrito. Não invente.

TAREFA: liste as ÁREAS/PAINÉIS do sistema "${e.subsistema}" (lista de sobressalentes ${e.lista}). Área é o CONJUNTO físico onde os materiais ficam instalados e que tem RDS-PP próprio: skid, painel/quadro, tanque, central ou sistema (ex.: pressurização por nitrogênio), unidade hidráulica, tubulação, válvula principal. NÃO crie uma área para cada bomba, válvula ou instrumento: o que está montado num conjunto pertence ao conjunto. Um conjunto que tem documento próprio (lista de material, desenho, layout) costuma ser uma área. Para cada área: nome curto (a sigla, se o documento usar uma; sem repetir o nome do sistema: "PAINEL" e não "PAINEL DO SISTEMA X"), RDS-PP, local, elevação e eixo.

REGRAS:
- "rds": copie exatamente um RDS-PP da lista abaixo, o do conjunto. Use um RDS-PP SEM "&" sempre que existir: o que tem "&" é código de documento (só serve se o conjunto não tiver outro). Nunca use o código do P&ID, da lista de sobressalentes ou do workstatement. Se nenhum servir, null.
- "local": um destes: ${LOCAIS.join(' | ')}. Se o texto não disser, null.
- "elevacao": número com vírgula e 2 casas (EL 98.500 → "98,50"). Se o texto não disser, null. Se a área ocupa várias elevações (ex.: tubulação que passa por vários pisos), null: a elevação vai por material.
- "eixo": um destes: ${EIXOS.join(', ')} ("eixo B/C" → "BC"). Se o texto não disser, null.
- "evidencia": documento e página de onde tirou a informação.
- Responda SÓ com o JSON, sem comentários.

FORMATO:
{"areas":[{"nome":"NOME CURTO","rds":"#ST00=M00XXX00XX010-XX001","local":"CASA DE FORÇA","elevacao":"00,00","eixo":"XX","evidencia":"#ST00=...&XXX000 p.1"}]}

DOCUMENTOS (código | tipo | título na 1ª página):
${ind.docs.map(d => `- ${d.d} | ${d.desc || d.tipo || '?'} | "${titulo(d.inicio, e.subsistema)}"`).join('\n')}

RDS-PP ENCONTRADOS (equipamentos primeiro, depois códigos de documento; mais citados primeiro):
${listaRds.join('\n') || '(nenhum)'}

DOCUMENTOS DE CONJUNTOS CITADOS COM TÍTULO (o título diz o que é o conjunto; cada um costuma ser uma área):
${titulos.join('\n') || '(nenhum)'}

ELEVAÇÕES CITADAS:
${elev.join('\n') || '(nenhuma)'}

EIXOS CITADOS:
${eixos.join('\n') || '(nenhum)'}`;
  }

  // Resposta da IA → objeto (tolera ```json e texto em volta). JSON quebrado (resposta cortada, vírgula sobrando):
  // recupera um a um os objetos de material que estiverem inteiros ({"pmib": …}), para não perder o lote todo.
  function json(resposta) {
    let s = typeof resposta === 'string' ? resposta : JSON.stringify(resposta || {});
    s = s.replace(/```(?:json)?/gi, '');
    const i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i < 0 || j < i) return null;
    try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { /* recupera abaixo */ }
    const objetos = { pmib: [], tag: [] };
    for (let k = s.search(/\{\s*"(pmib|tag)"/); k >= 0; k = (x => (x < 0 ? -1 : k + 1 + x))(s.slice(k + 1).search(/\{\s*"(pmib|tag)"/))) {
      const qual = /^\{\s*"pmib"/.test(s.slice(k)) ? 'pmib' : 'tag';
      let nivel = 0, aspas = false;
      for (let x = k; x < s.length; x++) {
        const ch = s[x];
        if (aspas) { if (ch === '\\') x++; else if (ch === '"') aspas = false; continue; }
        if (ch === '"') aspas = true;
        else if (ch === '{') nivel++;
        else if (ch === '}' && --nivel === 0) { try { objetos[qual].push(JSON.parse(s.slice(k, x + 1))); } catch (e) { /* objeto quebrado */ } break; }
      }
    }
    return objetos.pmib.length || objetos.tag.length ? { materiais: objetos.pmib, tags: objetos.tag, recuperado: true } : null;
  }

  const eixoDe = v => { const x = up(v).replace(/^EIXO\s*/, '').replace(/[\s/-]/g, ''); return EIXOS.includes(x) ? x : ''; };
  const elevacao = v => { const m = t(v).match(/(\d{2,3})[.,]?(\d{0,3})/); return m ? Number(`${m[1]}.${m[2] || 0}`).toFixed(2).replace('.', ',') : ''; };

  // "PAINEL DE CONTROLE (PWB)" → "PWB"; "SKID DE ÁGUA PURA" → "SKID" (o nome do sistema já está no CÓDIGO LMR)
  function nomeCurto(nome, subsistema) {
    const sigla = nome.match(/\(([A-Z0-9]{2,8})\)\s*$/);
    if (sigla) return sigla[1];
    const sub = up(subsistema);
    const sem = sub ? nome.replace(new RegExp(`\\s+(DO|DA|DE)\\s+(SISTEMA\\s+DE\\s+)?${sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '') : nome;
    return sem || nome;
  }

  // opc.semTexto: valor que não está no texto extraído fica, com aviso "confira" (o agente lê o PDF como imagem:
  // desenho e página escaneada não têm texto). Sem a opção (IA do n8n, que só vê o texto), o valor sai.
  const CONFIRA = 'confira no documento: lido pelo agente, não achado no texto extraído';
  function leAreas(resposta, ind, subsistema, opc = {}) {
    const r = json(resposta);
    const avisos = [];
    if (!r || !Array.isArray(r.areas)) return { areas: [], avisos: ['leitura de áreas sem JSON válido'] };
    const areas = [];
    for (const a of r.areas) {
      const original = up(a.nome);
      const nome = nomeCurto(original, subsistema);
      if (!nome || areas.some(x => x.nome === nome)) continue;
      const rds = up(a.rds).replace(/^ST/, '#ST');
      const ev = elevacao(a.elevacao);
      const evNoTexto = ev && (ind.elevs || []).includes(ev);
      if (ev && !evNoTexto) avisos.push(opc.semTexto ? `área ${nome}: elevação ${ev} — ${CONFIRA} (${t(a.evidencia) || 'sem evidência'})` : `área ${nome}: elevação ${ev} não está escrita nos documentos`);
      const x = { nome, original, rds: '', local: '', elev: evNoTexto || (ev && opc.semTexto) ? ev : '', eixo: eixoDe(a.eixo), evidencia: t(a.evidencia) + (original !== nome ? ` (nome no documento: ${original})` : '') };
      // conferido sem o prefixo #STxx=Mxx: a forma do sistema (M00) pode não estar escrita, só a de cada UG
      if (rds) {
        if (noTexto(ind, semPrefixo(rds))) x.rds = doSistema(rds);
        else if (opc.semTexto && /^#ST\d{2}=[A-Z0-9]{3,4}[A-Z]{3}\d{2}/.test(rds)) { x.rds = doSistema(rds); avisos.push(`área ${nome}: RDS-PP ${rds} — ${CONFIRA} (${t(a.evidencia) || 'sem evidência'})`); }
        else avisos.push(`área ${nome}: RDS-PP ${rds} não está nos documentos`);
      }
      const local = LOCAIS.find(l => up(a.local).replace('FORCA', 'FORÇA').startsWith(l));
      x.local = local || '';
      areas.push(x);
    }
    return { areas, avisos };
  }

  // ── página do formulário "Confira as áreas" (no meio da execução, antes da leitura dos materiais) ──
  // Um campo por dado de cada área; em branco = fica o valor lido (que aparece como exemplo no campo).
  const rotulo = (i, a, campo) => `${i + 1}. ${a.nome} — ${campo}`;
  const listaDeTrechos = v => up(v).split(/[,;\s]+/).filter(Boolean);
  const NOVAS = 'Áreas que faltam (uma por linha: NOME; RDS-PP; ELEVAÇÃO)';
  function formAreas(areas, avisos) {
    const campos = [];
    areas.forEach((a, i) => {
      campos.push({ fieldLabel: rotulo(i, a, 'nome (REMOVER tira a área)'), placeholder: a.nome, requiredField: false });
      campos.push({ fieldLabel: rotulo(i, a, 'RDS-PP'), placeholder: a.rds || 'não lido', requiredField: false });
      campos.push({ fieldLabel: rotulo(i, a, 'elevação'), placeholder: a.elev || 'não lida: preencha', requiredField: false });
      campos.push({ fieldLabel: rotulo(i, a, 'trechos (só se a área não estiver em todos)'), placeholder: (a.trechos || []).join(', ') || 'os do formulário', requiredField: false });
    });
    campos.push({ fieldLabel: NOVAS, fieldType: 'textarea', placeholder: 'SCP; #ST00=M00MKF10CM050; 104,20', requiredField: false });
    const linhas = areas.map((a, i) => `${i + 1}. ${a.nome}: RDS-PP ${a.rds || '(não lido)'} · elevação ${a.elev || '(não lida)'} · ${a.local || 'local não lido'}${a.evidencia ? ` · fonte: ${a.evidencia}` : ''}`);
    const descricao = `A IA leu ${areas.length} área(s). Confira antes da leitura dos materiais: a área de cada material é escolhida desta lista.\n`
      + `Campo em branco = fica o valor lido (mostrado em cinza). Mesmo nome em duas áreas = viram uma só. Trechos: só para área que fica em parte dos trechos (ex.: um cubículo por margem).\n\n${linhas.join('\n')}`
      + (avisos.length ? `\n\nAvisos: ${avisos.join(' | ')}` : '');
    return { campos, descricao };
  }
  // Respostas da página → áreas conferidas. O que o usuário escreve vale (é a fonte), só o formato é ajustado.
  function aplicaFormAreas(areas, resp) {
    const r = resp || {};
    const v = k => t(r[k]);
    const out = [];
    const junta = x => { const a = out.find(y => y.nome === x.nome); if (!a) out.push(x); else for (const k of ['rds', 'elev', 'local', 'eixo']) a[k] = a[k] || x[k];
      if (a && (x.trechos || []).length) a.trechos = [...new Set([...(a.trechos || []), ...x.trechos])]; };
    areas.forEach((a, i) => {
      const nome = v(rotulo(i, a, 'nome (REMOVER tira a área)')) || a.nome; // como o usuário escreveu (nome é convenção da equipe)
      if (up(nome) === 'REMOVER') return;
      const rds = up(v(rotulo(i, a, 'RDS-PP'))).replace(/^(?=ST\d)/, '#');
      const elev = elevacao(v(rotulo(i, a, 'elevação')));
      const trechos = listaDeTrechos(v(rotulo(i, a, 'trechos (só se a área não estiver em todos)')));
      const conferida = nome !== a.nome || rds || elev || trechos.length;
      junta({ ...a, nome, rds: rds ? doSistema(rds) : a.rds, elev: elev || a.elev, trechos: trechos.length ? trechos : a.trechos || [], evidencia: conferida ? `${a.evidencia || ''} (conferida no formulário)`.trim() : a.evidencia });
    });
    for (const l of String(r[NOVAS] == null ? '' : r[NOVAS]).split(/[\r\n]+/).map(t).filter(Boolean)) { // t() juntaria as linhas
      const [nome, rds, elev] = l.split(/\s*;\s*/);
      if (!up(nome)) continue;
      const rd = up(rds).replace(/^(?=ST\d)/, '#');
      junta({ nome: t(nome), original: up(nome), rds: rd ? doSistema(rd) : '', local: LOCAIS[0], elev: elevacao(elev), eixo: '', evidencia: 'informada no formulário' });
    }
    return out;
  }

  // Documentos (fora a lista de sobressalentes) onde as TAGs aparecem: o código do documento indica o equipamento.
  const docsDasTags = (ind, tags) => {
    const n = new Map();
    for (const p of ind.paginas) if (p.tipo !== 'MPB' && tags.some(tg => p.x.includes(tg))) n.set(p.d, (n.get(p.d) || 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([d, k]) => `${d} (${k} pág.)`).join('; ');
  };

  // ── leitura 2: MATERIAIS, em lotes ──
  // Trechos onde um valor aparece, dos documentos mais confiáveis para dizer onde a peça está (lista de material,
  // diagrama) aos menos; a lista de sobressalentes fica de fora (ela entra pela linha do material).
  const janelas = (ind, valor, max, raio) => ondeAparece(ind, valor, 40, raio, raio).filter(x => x.tipo !== 'MPB')
    .sort((a, b) => prioridade(a.tipo) - prioridade(b.tipo)).slice(0, max);
  const LOTE_MAX = 8, LOTE_CARACTERES = 32000, MATERIAL_CARACTERES = 4200;
  const REGRA_AREA = `- Área de cada TAG: veja em qual conjunto ela aparece. Numa lista de material, o item que cita o documento de um conjunto (ex.: "1 … #ST00=…XX010-XX001&MTB010 - <TÍTULO DO CONJUNTO>") e os seus subitens (1.1, 1.2…) pertencem à área desse conjunto, mesmo dentro da lista de outro conjunto. Use os "documentos do conjunto" listados nas áreas. Componente que aparece no diagrama ou na lista de materiais de um painel é do painel.`;

  // Áreas com o que identifica cada uma: RDS-PP, elevação e os documentos do conjunto citados com título.
  function areasDoPrompt(ind, areas) {
    const titulos = [...titulosDeDocumentos(ind)];
    return areas.map((a, i) => {
      const k = chaveEquip(a.rds);
      const docs = k ? titulos.filter(([c]) => chaveEquip(c) === k).slice(0, 3).map(([c, x]) => `${c} - ${x}`) : [];
      return `${i + 1}. "${a.nome}"${a.rds ? ` — RDS-PP ${a.rds}` : ''}${a.elev ? ` — EL. ${a.elev}` : ''}${docs.length ? `\n   documentos do conjunto: ${docs.join(' ; ')}` : ''}`;
    }).join('\n');
  }

  function blocoMaterial(ind, c) {
    const sug = ind.sug[c.pmib] || [];
    const painel = tagsDoPainel(ind, c);
    const conhecidas = painel && painel.tags ? painel.tags : sug;
    const trechos = [];
    const chaves = [c.codigoCmi, c.codigoMaterial].map(up).filter(v => v.length >= 5);
    for (const ch of chaves) {
      const o = ondeAparece(ind, ch, 40, 450, 450);
      if (o.length) { trechos.push(...o.filter(x => x.tipo === 'MPB').slice(0, 1), ...janelas(ind, ch, 2, 450)); break; }
    }
    for (const m of modelosDoMaterial(c).slice(0, 2)) trechos.push(...janelas(ind, m, 1, 400));
    for (const tg of conhecidas.slice(0, 4)) trechos.push(...janelas(ind, tg, 2, 400));
    const vistos = new Set();
    const txt = trechos.filter(x => { const q = `${x.d}|${x.p}|${x.s.slice(0, 40)}`; if (vistos.has(q)) return false; vistos.add(q); return true; })
      .map(x => `  [${x.d} p.${x.p}] "${x.s}"`).join('\n').slice(0, MATERIAL_CARACTERES);
    return `- pmib: ${c.pmib} | item ${c.item}${c.secao ? ` (seção ${c.secao})` : ''} | unidade: ${c.unid || '?'}${ehKit(c) ? ' | KIT' : ''}
- descrição: ${c.descricao}
- código: ${c.codigoMaterial}${c.codigoCmi ? ` | código GE/CMI: ${c.codigoCmi}` : ''} | marca/modelo: ${c.marcaModelo}
- TAGs na linha deste material na lista de sobressalentes: ${sug.join(', ') || '(nenhuma)'}${painel && painel.tags ? `\n- TAGs instaladas na lista de materiais do painel (${painel.d}): ${painel.tags.join(', ')}` : ''}
- documentos onde as TAGs aparecem: ${docsDasTags(ind, conhecidas) || '(nenhum)'}
- trechos dos documentos:
${txt || '  (o código do material não aparece nos documentos)'}`;
  }

  function tarefasMateriais(ind, catalogo, areas, e, lim = {}) {
    const LOTE_MAX_ = lim.max || LOTE_MAX, LOTE_CAR_ = lim.car || LOTE_CARACTERES;
    const cabeca = `PAPEL: Você estrutura dados de documentos técnicos de uma usina hidrelétrica (Itaipu). Use só o que está escrito. Não invente.

ELEVAÇÕES ESCRITAS NOS DOCUMENTOS: ${(ind.elevs || []).join('; ') || '(nenhuma)'}

ÁREAS DO SISTEMA "${e.subsistema}". No campo "area", escreva SÓ o nome, exatamente como está entre aspas (sem o número e sem o RDS-PP):
${areasDoPrompt(ind, areas) || '- (nenhuma área definida)'}

TAREFA: para cada material abaixo, diga onde ele está instalado.
- "tags": TAGs ligadas a ESTE material instalado (copie exatamente do texto): a TAG do próprio material ou, em KIT, peça de reposição ou consumível sem TAG própria, a TAG do equipamento onde ele é montado. Para cada uma: "area" (nome de uma área acima), "rds_proprio" (true se a TAG é um equipamento ou instrumento com identificação própria no P&ID/fluxograma ou no diagrama do painel; false se não) e "elevacao" (só se o texto ligar essa TAG a uma elevação diferente da elevação da área; senão null). Uma TAG por item: nunca junte várias num texto nem abrevie ("72.1...72.23" é proibido; liste 72.1, 72.2, …). Se a mesma TAG existe em mais de uma área (conjuntos iguais), repita a TAG, uma vez para cada área.
- Qual TAG vale: a lista de materiais do painel ou do skid e o desenho mostram o que está INSTALADO e valem mais que a lista de sobressalentes. Se divergirem, use a lista de materiais / desenho e diga isso na evidência.
${REGRA_AREA}
- "kit": true se o material é kit de manutenção ou conjunto de peças de reposição de um equipamento; senão false.
- "pais": só para peça montada ENTRE equipamentos (ex.: acoplamento motor-bomba): TAGs desses equipamentos. Senão [].
- "area": área do material quando nenhuma TAG se aplica.
- "elevacao": elevação do material sem TAG, só se o texto disser e for diferente da elevação da área; senão null.
- "qtd_instalada": quantidade instalada por unidade (UG), só se uma lista de materiais ou desenho disser. NUNCA use a quantidade de reposição da lista de sobressalentes. Sem fonte: null.
- "frequencia": "50", "60" ou "AMBAS", só se o texto disser para qual frequência o material serve; senão null.
- "evidencia": documento e página.
- Responda SÓ com o JSON, um objeto por material, na mesma ordem, sem texto antes ou depois.

FORMATO:
{"materiais":[{"pmib":"4500000000.0001","tags":[{"tag":"XX101","area":"NOME DA ÁREA","rds_proprio":true,"elevacao":null}],"kit":false,"pais":[],"area":null,"elevacao":null,"qtd_instalada":null,"frequencia":null,"evidencia":"#ST00=...&MPA010 p.5"}]}
`;
    // lotes pelo tamanho do pedido (até LOTE_MAX materiais e LOTE_CARACTERES): material com muito texto vai em lote menor
    const tarefas = [];
    let atual = [];
    const fecha = () => {
      if (!atual.length) return;
      tarefas.push({ lote: tarefas.length + 1, tipo: 'material', pmibs: atual.map(x => x.c.pmib), prompt: `${cabeca}\n${atual.map((x, k) => `MATERIAL ${k + 1}\n${x.bloco}`).join('\n\n')}` });
      atual = [];
    };
    for (const c of catalogo) {
      const bloco = blocoMaterial(ind, c), tam = bloco.length + 14;
      if (atual.length >= LOTE_MAX_ || (atual.length && cabeca.length + atual.reduce((s, x) => s + x.tam, 0) + tam > LOTE_CAR_)) fecha();
      atual.push({ c, bloco, tam });
    }
    fecha();
    return tarefas;
  }

  // ── leitura em etapas pequenas (modelos fracos erram menos com uma pergunta por chamada) ──
  // 1. ÁREAS (promptAreas). 2. "Em qual área está cada TAG?" só para TAGs que o código já achou (lista de
  // sobressalentes, lista de materiais do painel): a IA vê as páginas onde as TAGs aparecem e responde o NÚMERO da área.
  // 3. Leitura completa (tarefasMateriais) só dos materiais sem TAG achada pelo código, em lotes pequenos.
  const AREA_CARACTERES = 14000, AREA_TAGS = 40, PAGINA_CARACTERES = 5000, MAT_LOTE = 5, MAT_CARACTERES = 18000, CONFIRMA_LOTE = 20;
  const contem = (x, tg) => x.includes(tg);

  // "Confirmação das TAGs da lista": o código acha as TAGs na linha de cada material da lista de sobressalentes, mas o
  // texto do PDF é uma tabela achatada e TAGs da linha vizinha podem vazar. A IA vê o trecho da lista em volta do código
  // do material e as TAGs candidatas e responde (1) quais são DESTE material e (2) o papel delas: do próprio material ou
  // do equipamento onde ele é montado. Só escolhe entre as candidatas: nada é inventado.
  function linhaDaLista(ind, c) {
    for (const ch of [c.codigoCmi, c.codigoMaterial].map(up).filter(v => v.length >= 5)) {
      const o = ondeAparece(ind, ch, 40, 260, 260).filter(x => x.tipo === 'MPB');
      if (o.length) return o[0].s.replace(new RegExp(ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `[[${ch}]]`);
    }
    return '';
  }
  function promptConfirma(ind, materiais) {
    return `PAPEL: Você confere uma lista de peças sobressalentes de uma usina hidrelétrica (Itaipu). Use só o que está escrito.

TAREFA: para cada material abaixo há o trecho da lista de sobressalentes em volta do CÓDIGO do material (marcado [[assim]]) e as TAGs candidatas que o programa achou perto dele. A lista é uma tabela achatada em texto: a TAG de um material fica na mesma linha que a descrição e o código dele; TAGs da linha de cima ou de baixo são de OUTRO material.
- "tags": as candidatas que são deste material (copie só da lista de candidatas; [] se nenhuma for).
- "papel": "proprio" se o material É o equipamento ou instrumento da TAG (ex.: bomba com a TAG da bomba; transmissor com a TAG do transmissor; válvula com a TAG da válvula); "peca" se o material é peça, acessório, consumível ou kit MONTADO no equipamento da TAG (ex.: selo, rolamento, elemento filtrante, acoplamento, junta, kit de reparo).
- Responda SÓ com o JSON, um objeto por material, sem texto antes ou depois.

FORMATO:
{"materiais":[{"pmib":"4500000000.0001","tags":["XX101"],"papel":"proprio"}]}

MATERIAIS:
${materiais.map(x => `- pmib: ${x.c.pmib} | ${x.c.descricao} | código ${up(x.c.codigoCmi) || up(x.c.codigoMaterial)}
  candidatas: ${x.tags.join(', ')}
  lista: "${linhaDaLista(ind, x.c) || '(trecho não encontrado)'}"`).join('\n')}`;
  }
  function confereConfirma(resposta, tarefa) {
    const r = json(resposta);
    const confirmacoes = {};
    for (const m of (r && r.materiais) || []) {
      const p = t(m && m.pmib);
      const cand = (tarefa.candidatas || {})[p];
      if (!cand) continue;
      const tags = (Array.isArray(m.tags) ? m.tags : []).flatMap(x => separaTags(typeof x === 'string' ? x : x && x.tag)).filter(x => cand.includes(x));
      const v = up(m.papel);
      confirmacoes[p] = { tags: [...new Set(tags)], papel: /^PE/.test(v) ? 'peca' : 'proprio' };
    }
    return { confirmacoes, avisos: tarefa.pmibs.filter(p => !confirmacoes[p]).map(p => `${p}: TAGs da lista sem confirmação da IA (ficam todas)`) };
  }

  function promptAreasDasTags(ind, areas, e, tags, paginas) {
    return `PAPEL: Você classifica equipamentos de documentos técnicos de uma usina hidrelétrica (Itaipu). Use só o que está escrito. Não invente.

ÁREAS DO SISTEMA "${e.subsistema}" (responda com o NÚMERO da área):
${areasDoPrompt(ind, areas)}
0. nenhuma destas / o texto não mostra

TAREFA: para cada TAG da lista, diga em qual área ela está instalada, pelo que as páginas abaixo mostram.
${REGRA_AREA}
- "area": o número da área (0 se o texto não mostrar). Se a mesma TAG existe em mais de uma área (conjuntos iguais, ex.: um painel ou cubículo por margem), uma lista de números: [1,2].
- "rds_proprio": true se a TAG é um equipamento ou instrumento com identificação própria no P&ID/fluxograma ou no diagrama; false se não.
- "elevacao": só se o texto ligar a TAG a uma elevação diferente da elevação da área; senão null.
- Responda SÓ com o JSON, um objeto por TAG, todas as TAGs da lista, sem texto antes ou depois.

FORMATO:
{"tags":[{"tag":"XX101","area":1,"rds_proprio":true,"elevacao":null},{"tag":"XX102","area":[1,2],"rds_proprio":true,"elevacao":null}]}

TAGS: ${tags.join(', ')}

PÁGINAS:
${paginas.map(p => `[${p.d} p.${p.p}] "${t(p.x).slice(0, PAGINA_CARACTERES)}"`).join('\n\n')}`;
  }

  /**
   * Plano da leitura, depois das áreas conferidas. Devolve { conhecidos, tarefas }:
   *   conhecidos[pmib] = { tags, fonte, kit, area? } — TAGs achadas pelo código (área fixa quando vem do documento do painel);
   *   tarefas = [{ lote, tipo: 'area', tags, prompt } | { lote, tipo: 'material', pmibs, prompt }].
   */
  // TAG da lista de sobressalentes que nenhum outro documento cita é suspeita. Se os documentos têm uma única TAG com o
  // mesmo código e outra letra final (QM408G na lista, QM408V no P&ID e na lista de material), vale a dos documentos.
  function confereTagDaLista(ind, tg) {
    const fora = ind.paginas.filter(p => p.tipo !== 'MPB');
    if (fora.some(p => p.x.includes(tg))) return {};
    const m = tg.match(/^([A-Z]{2}\d{3})[A-Z]$/);
    if (!m) return { sozinha: true };
    const re = new RegExp(`(?<![A-Z0-9])${m[1]}[A-Z](?![A-Z0-9])`, 'g');
    const outras = new Set();
    for (const p of fora) for (const x of p.x.match(re) || []) if (x !== tg) outras.add(x);
    return outras.size === 1 ? { troca: [...outras][0] } : { sozinha: true };
  }

  function planoDeLeitura(ind, catalogo, areas, e) {
    const conhecidos = {};
    const semTag = [];
    const pedidas = new Set();
    for (const c of catalogo) {
      const kit = ehKit(c);
      const painel = kit ? null : tagsDoPainel(ind, c);
      const sug = ind.sug[c.pmib] || [];
      if (painel && painel.tags) {
        const area = areaDoDoc(areas, painel.docs);
        conhecidos[c.pmib] = { tags: painel.tags, fonte: `lista de materiais do painel (${painel.d})`, kit, area };
        if (!area) painel.tags.forEach(x => pedidas.add(x));
      } else if (sug.length) {
        const k = { tags: [], fonte: `lista de sobressalentes${kit ? ' (equipamento do kit)' : ''}`, kit, regras: [], avisos: [] };
        for (const tg of sug) {
          const v = confereTagDaLista(ind, tg);
          if (v.troca) k.regras.push(`TAG ${tg} da lista de sobressalentes não aparece em outro documento; nos documentos está ${v.troca}`);
          else if (v.sozinha) k.avisos.push(`TAG ${tg} só aparece na lista de sobressalentes: confira`);
          if (!k.tags.includes(v.troca || tg)) k.tags.push(v.troca || tg);
        }
        conhecidos[c.pmib] = k;
        k.tags.forEach(x => pedidas.add(x));
      } else semTag.push(c);
    }
    const tarefas = [];
    // etapa 2: cada TAG vai com a página do documento mais confiável onde aparece (empate: a que tem mais TAGs pedidas)
    if (areas.length && pedidas.size) {
      const lista = [...pedidas];
      const pags = ind.paginas.map(p => ({ p, tags: lista.filter(tg => contem(p.x, tg)) })).filter(x => x.tags.length);
      const ordem = (a, b) => (a.p.tipo === 'MPB') - (b.p.tipo === 'MPB') || prioridade(a.p.tipo) - prioridade(b.p.tipo) || b.tags.length - a.tags.length;
      const daPagina = new Map();
      for (const tg of lista) {
        const melhor = pags.filter(x => x.tags.includes(tg)).sort(ordem)[0];
        const k = melhor ? `${melhor.p.d}|${melhor.p.p}` : '';
        if (!daPagina.has(k)) daPagina.set(k, { p: melhor && melhor.p, tags: [] });
        daPagina.get(k).tags.push(tg);
      }
      let atual = { tags: [], paginas: [], car: 0 };
      const fecha = () => { if (atual.tags.length) tarefas.push({ tipo: 'area', tags: atual.tags, prompt: promptAreasDasTags(ind, areas, e, atual.tags, atual.paginas) }); atual = { tags: [], paginas: [], car: 0 }; };
      for (const { p, tags } of daPagina.values()) {
        for (let i = 0; i < tags.length; i += AREA_TAGS) {
          const parte = tags.slice(i, i + AREA_TAGS);
          const car = p ? Math.min(p.x.length, PAGINA_CARACTERES) : 0;
          if (atual.tags.length && (atual.car + car > AREA_CARACTERES || atual.tags.length + parte.length > AREA_TAGS)) fecha();
          atual.tags.push(...parte);
          if (p && !atual.paginas.includes(p)) { atual.paginas.push(p); atual.car += car; }
        }
      }
      fecha();
    }
    // confirmação das TAGs da lista (quais são deste material e o papel delas), em lotes de descrições curtas
    const daLista = catalogo.filter(c => conhecidos[c.pmib] && /sobressalentes/.test(conhecidos[c.pmib].fonte)).map(c => ({ c, tags: conhecidos[c.pmib].tags }));
    for (let i = 0; i < daLista.length; i += CONFIRMA_LOTE) {
      const parte = daLista.slice(i, i + CONFIRMA_LOTE);
      tarefas.push({ tipo: 'confirma', pmibs: parte.map(x => x.c.pmib), candidatas: Object.fromEntries(parte.map(x => [x.c.pmib, x.tags])), prompt: promptConfirma(ind, parte) });
    }
    // etapa 3: leitura completa só do que o código não achou
    tarefas.push(...tarefasMateriais(ind, semTag, areas, e, { max: MAT_LOTE, car: MAT_CARACTERES }));
    // o Loop do n8n precisa de pelo menos um item para chegar ao fim
    if (!tarefas.length) tarefas.push({ tipo: 'nada', prompt: 'Responda somente {}' });
    tarefas.forEach((x, i) => { x.lote = i + 1; });
    return { conhecidos, tarefas };
  }

  // Resposta de "em qual área está cada TAG" → [{ tag, area, rdsProprio, elev }]; só TAGs pedidas, área pelo número.
  function confereAreasDasTags(resposta, tarefa, ind, areas) {
    const r = json(resposta);
    const avisos = [];
    const lidas = new Map();
    const daResposta = v => { const n = Number(String(v == null ? '' : v).replace(/\D/g, '')); return n >= 1 && n <= areas.length ? areas[n - 1] : areas.find(y => normArea(y.nome) === normArea(v)); };
    for (const x of (r && r.tags) || []) {
      for (const tag of separaTags(x && x.tag)) {
        if (!tarefa.tags.includes(tag)) { avisos.push(`TAG ${tag} respondida sem ter sido pedida`); continue; }
        const lista = [...new Set((Array.isArray(x.area) ? x.area : String(x.area == null ? '' : x.area).split(/\s*[,;]\s*/)).map(daResposta).filter(Boolean))];
        for (const a of lista.length ? lista : [undefined]) {
        const ev = elevacao(x.elevacao);
        const elev = ev && ev !== (a && a.elev) && (ind.elevs || []).includes(ev) ? ev : '';
        const avisoTag = ev && !elev && ev !== (a && a.elev) ? [`elevação ${ev} (TAG ${tag}) não está escrita nos documentos`] : [];
        lidas.set(`${tag}|${a ? a.nome : ''}`, { tag, avisos: avisoTag, area: a ? a.nome : '', rdsProprio: x.rds_proprio == null ? null : x.rds_proprio === true || /^(SIM|TRUE)$/i.test(t(x.rds_proprio)), elev });
        }
      }
    }
    if (!r) avisos.push('resposta da IA sem JSON válido');
    for (const tg of tarefa.tags) if (![...lidas.values()].some(x => x.tag === tg)) avisos.push(`TAG ${tg} sem área na resposta da IA`);
    return { classif: [...lidas.values()], avisos: r && r.recuperado ? avisos.concat('resposta com JSON quebrado: aproveitada a parte legível') : avisos };
  }

  // Junta o que o código achou, a área de cada TAG (etapa 2) e as leituras completas (etapa 3) em decisões por material.
  // confirmacoes[pmib] = { tags, papel } (etapa de confirmação); pecas = convenção do formulário (TAG | PAI).
  function decisoesDaLeitura(conhecidos, classif, decisoesMateriais, confirmacoes = {}, pecas = 'TAG') {
    const daTag = new Map();
    for (const x of classif) (daTag.get(x.tag) || daTag.set(x.tag, []).get(x.tag)).push(x);
    const out = [...decisoesMateriais];
    for (let [pmib, k] of Object.entries(conhecidos || {})) {
      const avisos = [...(k.avisos || [])];
      const conf = confirmacoes[pmib];
      const candidatas = k.tags;
      if (conf && conf.tags.length < candidatas.length) k = { ...k, tags: conf.tags, regras: [...(k.regras || []), `TAGs da lista confirmadas: ${conf.tags.join(', ') || 'nenhuma'} (descartadas: ${candidatas.filter(x => !conf.tags.includes(x)).join(', ')})`] };
      else if (!conf && /sobressalentes/.test(k.fonte)) avisos.push('TAGs da lista sem confirmação da IA: confira');
      const tags = k.tags.flatMap(tag => {
        const xs = k.area ? [{}] : (daTag.get(tag) || []).filter(x => x.area);
        if (!xs.length) { avisos.push(`TAG ${tag}: área não identificada`); xs.push({}); }
        for (const x of daTag.get(tag) || []) avisos.push(...(x.avisos || []));
        return xs.map(x => ({ tag, area: k.area || x.area || '', rdsProprio: x.rdsProprio == null ? true : x.rdsProprio, elev: x.elev || '' }));
      });
      const comIA = k.tags.some(tg => daTag.has(tg));
      const peca = !k.kit && up(pecas) === 'PAI' && conf && conf.papel === 'peca' && tags.length > 0;
      // nenhuma candidata confirmada: o material fica sem TAG, na área das candidatas (QTD vai para PENDÊNCIAS)
      const areaSemTag = !k.tags.length ? (candidatas.flatMap(tg => (daTag.get(tg) || []).map(x => x.area)).find(Boolean) || '') : '';
      out.push({ pmib, origem: comIA || conf ? 'código + IA' : k.area ? 'código' : 'código (sem área)', tags: peca ? [] : tags, pais: peca ? k.tags : [],
        area: peca ? (tags.find(x => x.area) || {}).area || '' : areaSemTag, elev: '', qtd: null, frequencia: null, kit: k.kit, evidencia: `TAGs: ${k.fonte}`, avisos,
        regras: [...(k.regras || []), ...(peca ? [`peça montada no equipamento: ${k.tags.join(', ')} como PAI (convenção do formulário)`] : [])], tagsDosPais: peca ? tags : [] });
    }
    return out;
  }

  // "72.1; 72.2" → 2 TAGs; "72.1...72.23" / "72.1 a 72.23" → 72.1, 72.2, …, 72.23 (mesmo prefixo, até 60). "GP231/MA231" fica.
  function separaTags(v) {
    const r = [];
    for (const p of up(v).split(/\s*[,;]\s*|\s+E\s+/).filter(Boolean)) {
      const m = p.match(/^([A-Z]*)(\d+)\.(\d+)\s*(?:\.{2,}|…|\bA\b|\bATÉ\b|-)\s*\1?(\d+)\.(\d+)$/);
      if (m && m[2] === m[4] && Number(m[5]) > Number(m[3]) && Number(m[5]) - Number(m[3]) <= 60) {
        for (let k = Number(m[3]); k <= Number(m[5]); k++) r.push(`${m[1]}${m[2]}.${k}`);
      } else r.push(p);
    }
    return r;
  }
  const normArea = v => up(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^\d+[.)]\s*/, '').replace(/["“”']/g, '').replace(/\s+/g, ' ').trim();

  // Confere uma resposta de lote: TAGs no texto (V8), área conhecida, pmib do lote.
  function confereMateriais(resposta, tarefa, ind, areas, opc = {}) {
    const r = json(resposta);
    const nomes = new Set(areas.map(a => a.nome));
    // aceita o nome curto e o nome como está no documento ("SKID DE ÁGUA PURA" → SKID)
    const porNome = new Map();
    for (const a of areas) for (const k of [a.nome, a.original].filter(Boolean)) porNome.set(normArea(k), a.nome);
    const out = [];
    const lidos = new Map(((r && r.materiais) || []).map((m, i) => [t(m.pmib) || tarefa.pmibs[i], m]));
    for (const pmib of tarefa.pmibs) {
      const m = lidos.get(pmib);
      const d = { pmib, origem: m ? 'IA' : 'sem leitura', tags: [], pais: [], area: '', elev: '', qtd: null, frequencia: null, evidencia: '', avisos: [] };
      const elevDaArea = new Map(areas.map(a => [a.nome, a.elev]));
      const elevConferida = (v, onde, a) => {
        const x = elevacao(v);
        if (!x || x === elevDaArea.get(a)) return '';
        if ((ind.elevs || []).includes(x)) return x;
        if (opc.semTexto) { d.avisos.push(`elevação ${x} (${onde}) — ${CONFIRA}`); return x; }
        d.avisos.push(`elevação ${x} (${onde}) não está escrita nos documentos`);
        return '';
      };
      if (!m) { d.avisos.push(r ? 'material sem resposta da IA' : 'resposta da IA sem JSON válido'); out.push(d); continue; }
      const area = v => {
        const n = up(v);
        if (!n) return '';
        if (nomes.has(n)) return n;
        // nome copiado com o RDS-PP, o número ou aspas: "PWB (#ST00=…)", "2. SKID", "\"SKID\""
        const k = normArea(n.replace(/\s*[(—-]\s*(RDS-PP\s*)?#?ST\d.*$/, ''));
        if (porNome.has(k)) return porNome.get(k);
        const prefixo = [...new Set([...porNome].filter(([x]) => k.startsWith(x) || x.startsWith(k)).map(([, v]) => v))];
        if (k && prefixo.length === 1) return prefixo[0];
        d.avisos.push(`área "${n}" fora da lista de áreas`);
        return '';
      };
      for (const x of Array.isArray(m.tags) ? m.tags : []) for (const tag of separaTags(typeof x === 'string' ? x : x.tag)) {
        if (!noTexto(ind, tag)) d.avisos.push(`TAG ${tag} não está nos documentos (V8)`);
        const ar = area(x.area);
        d.tags.push({ tag, area: ar, rdsProprio: x.rds_proprio === true || /^(SIM|TRUE)$/i.test(t(x.rds_proprio)), elev: elevConferida(x.elevacao, `TAG ${tag}`, ar) });
      }
      for (const p of Array.isArray(m.pais) ? m.pais : []) for (const tag of separaTags(typeof p === 'string' ? p : p.tag)) {
        if (!noTexto(ind, tag)) d.avisos.push(`pai ${tag} não está nos documentos (V8)`);
        d.pais.push(tag);
      }
      d.area = area(m.area);
      d.elev = elevConferida(m.elevacao, 'material', d.area);
      const q = Number(String(m.qtd_instalada == null ? '' : m.qtd_instalada).replace(',', '.'));
      d.qtd = q > 0 && !d.tags.length ? q : null; // com TAG a QTD é 1 por TAG
      const ev = up(m.evidencia);
      if (d.qtd && /&MPB/.test(ev) && !/&(MPA|APA|EPA|MLU|MTB|MTC|MLD|MFB|EFF)|LISTA DE MATERIA/.test(ev)) {
        d.avisos.push(`QTD ${d.qtd} recusada: a fonte citada é a lista de sobressalentes (quantidade de reposição)`);
        d.qtd = null;
      }
      const f = up(m.frequencia).replace(/\s*HZ$/, '');
      d.frequencia = ['50', '60', 'AMBAS'].includes(f) ? f : null;
      d.kit = m.kit === true || /^(SIM|TRUE)$/i.test(t(m.kit));
      d.evidencia = t(m.evidencia);
      if (r.recuperado) d.avisos.push('resposta da IA com JSON quebrado: material recuperado da parte legível');
      out.push(d);
    }
    return out;
  }

  // ── A3: monta a Base ──
  const rdsDaArea = rds => { let s = up(rds); if (!s) return ''; if (!s.startsWith('#')) s = '#' + s; return doSistema(s).replace(/^#ST00=M00(?=[A-Z]{3}\d{2})/, '#ST[XX]=M[XX]'); };
  const caminhoDoStatus = rows => {
    for (const r of rows.slice(0, 6)) for (const c of r || []) { const v = t(c); if (/\|\s*#ST/.test(v)) return t(v.split('|')[0]); }
    return '';
  };

  /**
   * e = { LMR, catalogo, relacoes, lista, revisao, statusRows, areas, decisoes[], escopo, subsistema, trechos, listaTrechos, especificacao, eixo?, frequencia? (AMBAS | 50 HZ | 60 HZ | outro = pendência), ind }
   * Devolve { base, cabecalho, docs, relacoes, pendencias, leitura, resumo }.
   */
  function montaBase(e) {
    const L = e.LMR;
    const proj = L.trechosDoProjeto(e.trechos || 'TODAS', e.listaTrechos || []);
    // eixo do formulário vale para todas as áreas (os documentos não trazem o eixo); elevação padrão só preenche o que faltou
    // eixo: o do documento (área); o do formulário preenche o que faltou. Elevação: TAG → material → área → PENDÊNCIA.
    const eixoForm = eixoDe(e.eixo);
    const areas = new Map(e.areas.map(a => [a.nome, { ...a, eixo: a.eixo || eixoForm }]));
    const pend = [];
    const pende = (c, tipo, detalhe) => pend.push({ PMIB: c.pmib, ITEM: c.item, 'DESCRIÇÃO': c.descricao, TIPO: tipo, DETALHE: detalhe });
    // área pelo documento: a TAG aparece num documento cujo código começa pelo RDS-PP de uma única área
    // (ex.: 72.9 no diagrama #ST00=M00MKF10UH010-UH001&EFF010 → área com RDS-PP …UH010-UH001)
    const equip = r => up(r).split('&')[0];
    const areasComRds = e.areas.filter(a => a.rds && !a.rds.includes('&'));
    const pelaDoc = new Map();
    const areaPeloDocumento = tag => {
      if (pelaDoc.has(tag)) return pelaDoc.get(tag);
      const cand = new Set();
      for (const p of e.ind.paginas) {
        if (!p.x.includes(tag)) continue;
        const k = equip(p.d);
        for (const a of areasComRds) { const ka = equip(a.rds); if (k === ka || k.split('-')[0] === ka.split('-')[0]) cand.add(a.nome); }
      }
      const r = cand.size === 1 ? [...cand][0] : '';
      pelaDoc.set(tag, r);
      return r;
    };

    // ── regras sobre a leitura (sem IA) ──
    // 1. TAGs da lista de materiais do painel (o que está instalado) valem mais que as lidas pela IA.
    // 2. Kit de manutenção: convenção do formulário — TAG do equipamento | sem TAG, 1 por trecho, na área do
    //    equipamento | equipamento como PAI. As aplicações emitidas usam as duas primeiras (nenhuma usa PAI para kit).
    const KITS = ['TAG', 'SEM TAG', 'PAI'].includes(up(e.kits)) ? up(e.kits) : 'TAG';
    const catalogo = new Map(e.catalogo.map(c => [c.pmib, c]));
    const lidaArea = new Map();
    for (const d of e.decisoes) for (const x of [...d.tags, ...(d.tagsDosPais || [])]) if (x.area && !lidaArea.has(x.tag)) lidaArea.set(x.tag, x.area);
    const decisoes = e.decisoes.map(d0 => {
      const c = catalogo.get(d0.pmib);
      if (!c) return d0;
      const d = { ...d0, tags: d0.tags.map(x => ({ ...x })), pais: [...d0.pais], avisos: [...d0.avisos], regras: [...(d0.regras || [])] };
      const areaDaTag = tag => (d0.tags.find(y => y.tag === tag) || {}).area || lidaArea.get(tag) || areaPeloDocumento(tag) || '';
      const comTag = (tag, ref) => { const x = d0.tags.find(y => y.tag === tag) || {};
        return { tag, area: x.area || areaDaTag(tag) || (ref || {}).area || d.area, rdsProprio: x.rdsProprio != null ? x.rdsProprio : (ref || {}).rdsProprio != null ? ref.rdsProprio : true, elev: x.elev || '' }; };
      const kit = ehKit(c) || d.kit;
      const painel = kit ? null : tagsDoPainel(e.ind, c);
      if (painel && painel.tags) {
        const lidas = d.tags.map(x => x.tag);
        if ([...new Set(lidas)].sort().join(';') !== [...painel.tags].sort().join(';')) {
          d.tags = painel.tags.map(tag => comTag(tag, d0.tags[0]));
          d.regras.push(`TAGs da lista de materiais do painel (${painel.d})${lidas.length ? `, no lugar das lidas (${lidas.join(', ')})` : ''}`);
        }
        // a área é a do painel, pelo código do documento (ex.: …UH010-UH001&EFF010 → área com RDS-PP …UH010…)
        const doPainel = areaDoDoc(e.areas, painel.docs);
        if (doPainel && d.tags.some(x => x.area !== doPainel)) {
          d.regras.push(`área ${doPainel}, a do documento do painel (a leitura dizia ${[...new Set(d.tags.map(x => x.area || '—'))].join(', ')})`);
          for (const x of d.tags) x.area = doPainel;
        }
      }
      if (kit) {
        const lidas = [...d.tags.map(x => x.tag), ...d.pais];
        const equip = [...new Set(lidas.length ? lidas : (e.ind.sug[c.pmib] || []))];
        if (equip.length) {
          if (KITS === 'TAG') { d.tags = equip.map(tag => comTag(tag, d0.tags[0])); d.pais = []; }
          else if (KITS === 'SEM TAG') { d.area = d.area || equip.map(areaDaTag).find(Boolean) || ''; d.tags = []; d.pais = []; if (!d.qtd) { d.qtd = 1; d.qtdConvencao = true; } }
          else { d.pais = equip; d.tags = []; }
          d.regras.push(`kit: ${{ TAG: 'leva a TAG do equipamento', 'SEM TAG': 'sem TAG, 1 por trecho, na área do equipamento', PAI: 'equipamento como PAI' }[KITS]} (${equip.join(', ')}${lidas.length ? '' : ', da lista de sobressalentes'})`);
        }
      }
      return d;
    });
    const dec = new Map(decisoes.map(d => [d.pmib, d]));
    const tagArea = new Map();
    for (const d of decisoes) for (const x of [...d.tags, ...(d.tagsDosPais || [])]) if (x.area && !tagArea.has(x.tag)) tagArea.set(x.tag, x.area);
    const notaArea = new Map();
    const areaDe = (c, tag, ...reservas) => {
      const a = tagArea.get(tag) || reservas.find(Boolean) || '';
      if (a) return a;
      const doc = areaPeloDocumento(tag);
      if (doc) notaArea.set(c.pmib, `${doc} (pelo documento)`);
      return doc;
    };
    const paisDoc = new Map();
    for (const r of e.relacoes) (paisDoc.get(r.pmibFilho) || paisDoc.set(r.pmibFilho, []).get(r.pmibFilho)).push(r.pmibPai);

    const base = [];
    const semElev = new Map();
    // trechos de uma área (conferidos pelo usuário): validados uma vez; trecho inválido → PENDÊNCIA da área
    const trechosDaArea = new Map();
    for (const [nome, a] of areas) if ((a.trechos || []).length) {
      try { trechosDaArea.set(nome, L.trechosDoProjeto('LISTA', a.trechos).map(x => x.trecho).join(', ')); }
      catch (err) { pend.push({ PMIB: '', ITEM: '', 'DESCRIÇÃO': `ÁREA ${nome}`, TIPO: 'TRECHOS', DETALHE: `trechos da área ${nome}: ${err.message}` }); }
    }
    const linha = (c, a, extra) => {
      const ar = areas.get(a) || {};
      if (trechosDaArea.has(a)) extra = { ...extra, TRECHOS: trechosDaArea.get(a) };
      base.push({ LINHA: base.length + 1, ESCOPO: e.escopo, SUBSISTEMA: e.subsistema, FICHA_PMIB: c.pmib, 'DESCRIÇÃO': c.descricao,
        'ÁREA/PAINEL': a || '', 'RDS-PP': rdsDaArea(ar.rds), TAG: '', 'TAG COM RDS-PP': 'NÃO', PAIS: '', LOCAL: ar.local || '',
        'ELEVAÇÃO': ar.elev || '', EIXO: ar.eixo || '', TRECHOS: '', 'QTD POR TRECHO': '', ...extra });
      const r = base[base.length - 1];
      // RDS-PP por grupo de frequência (#ST50=M50… nas UGs de 50 Hz, #ST60=M60… nas de 60 Hz): uma linha por frequência
      if (/\[F\]/.test(`${r['RDS-PP']} ${r.PAIS}`)) {
        base.pop();
        const hzDe = new Map(L.UGS.map(u => [u.trecho, u.hz]));
        for (const hz of [50, 60]) {
          const trs = t(r.TRECHOS).split(/\s*,\s*/).filter(x => x && hzDe.get(x) === hz);
          if (trs.length) base.push({ ...r, LINHA: base.length + 1, 'RDS-PP': r['RDS-PP'].replace(/\[F\]/g, hz), PAIS: r.PAIS.replace(/\[F\]/g, hz), TRECHOS: trs.join(', ') });
        }
      }
      if (!r['ELEVAÇÃO'] && a) semElev.set(a, (semElev.get(a) || 0) + 1); // sem área já é pendência de ÁREA
    };
    const pai = (tag, reserva) => `${tag} | ${rdsDaArea((areas.get(tagArea.get(tag) || areaPeloDocumento(tag) || reserva) || {}).rds)}`;
    // frequência do sistema pela lista de sobressalentes (título "… 50 HZ E 60 HZ")
    const textoLista = e.ind.paginas.filter(p => p.tipo === 'MPB').map(p => p.x).join(' ').toUpperCase();
    const hzSistema = /50\s*HZ/.test(textoLista) && /60\s*HZ/.test(textoLista) ? 'AMBAS' : /50\s*HZ/.test(textoLista) ? '50' : /60\s*HZ/.test(textoLista) ? '60' : null;
    const hzForm = { AMBAS: 'AMBAS', '50 HZ': '50', '60 HZ': '60' }[up(e.frequencia).replace(/\s*\(.*$/, '')] || null;
    const hzDaArea = a => { const m = up((areas.get(a) || {}).rds).match(/^#ST(50|60)=/); return m ? m[1] : null; };
    // frequência pelo modelo citado: "Kit … bomba F1015V-717" herda a de "Bomba … 50Hz F1015V-717" do mesmo Status
    const modelos = desc => up(desc).match(/\b(?=[A-Z0-9]*[A-Z])[A-Z0-9]*\d[A-Z0-9]*-[A-Z0-9]+\b/g) || [];
    const hzModelo = new Map();
    for (const c of e.catalogo) {
      const hz = L.hzDaDescricao(c.descricao);
      if (hz) for (const m of modelos(c.descricao)) hzModelo.set(m, hzModelo.has(m) && hzModelo.get(m) !== hz ? null : hz);
    }
    const hzDoModelo = desc => { const s = [...new Set(modelos(desc).map(m => hzModelo.get(m)).filter(Boolean))]; return s.length === 1 ? s[0] : null; };
    const docs = [];
    const fonteHz = new Map();
    for (const c of e.catalogo) {
      const d = dec.get(c.pmib) || { tags: [], pais: [], area: '', qtd: null, frequencia: null, avisos: ['sem leitura'], origem: 'sem leitura' };
      for (const a of d.avisos) pende(c, 'LEITURA', a);
      const areasDoMaterial = [...d.tags.map(x => x.area), d.area, ...d.pais.map(tp => tagArea.get(tp))].filter(Boolean);
      const hzArea = [...new Set(areasDoMaterial.map(hzDaArea))];
      const hzStatus = L.hzDaDescricao(c.descricao) ? [L.hzDaDescricao(c.descricao), 'descrição do Status']
        : hzDoModelo(c.descricao) ? [hzDoModelo(c.descricao), 'modelo citado na descrição do Status'] : null;
      // "AMBAS" na leitura é fraco (a IA responde assim quando o texto é do sistema todo): 50 ou 60 do Status vale mais
      const ambasFraco = d.frequencia === 'AMBAS' && hzStatus && String(hzStatus[0]) !== 'AMBAS';
      if (d.frequencia && hzStatus && String(hzStatus[0]) !== String(d.frequencia) && !ambasFraco)
        pende(c, 'FREQUÊNCIA', `a leitura diz ${d.frequencia}, mas pelo Status (${hzStatus[1]}) é ${hzStatus[0]}: confira TRECHOS`);
      const [hz, fonte] = ambasFraco ? [hzStatus[0], `${hzStatus[1]} (a leitura dizia AMBAS)`]
        : d.frequencia ? [d.frequencia, 'documento (leitura)']
        : hzStatus ? hzStatus
          : hzArea.length === 1 && hzArea[0] ? [hzArea[0], 'RDS-PP da área']
            : hzSistema ? [hzSistema, 'lista de sobressalentes do sistema']
              : hzForm ? [hzForm, 'formulário'] : [null, ''];
      fonteHz.set(c.pmib, hz ? `${hz} (${fonte})` : '');
      const tm = L.trechosDoMaterial(proj, hz);
      const trechos = tm.trechos.map(x => x.trecho).join(', ');
      if (tm.pergunta && !(areasDoMaterial.length && areasDoMaterial.every(a => trechosDaArea.has(a)))) pende(c, 'FREQUÊNCIA', 'o projeto mistura 50 e 60 Hz e a frequência do material não foi achada: preencha TRECHOS');
      const qtdSemTag = c.granel ? 1 : d.qtd;
      const ini = base.length;
      // filho documental (Status x.y): uma linha por TAG do pai; pai sem TAG → mesma área do pai
      const paisD = (paisDoc.get(c.pmib) || []).map(p => dec.get(p)).filter(Boolean);
      const tagsPaiD = paisD.flatMap(p => p.tags.map(x => x.tag));
      if (!d.tags.length && tagsPaiD.length) {
        for (const tp of tagsPaiD) { const a = areaDe(c, tp, d.area); linha(c, a, { PAIS: pai(tp, a), TRECHOS: trechos, 'QTD POR TRECHO': qtdSemTag || '' }); }
      } else if (d.tags.length) {
        for (const x of d.tags) {
          const a = x.area || areaDe(c, x.tag, d.area);
          if (!a) pende(c, 'ÁREA', `TAG ${x.tag} sem área`);
          linha(c, a, { TAG: x.tag, 'TAG COM RDS-PP': x.rdsProprio ? 'SIM' : 'NÃO', TRECHOS: trechos, 'QTD POR TRECHO': 1, ...(x.elev || d.elev ? { 'ELEVAÇÃO': x.elev || d.elev } : {}) });
        }
      } else if (d.pais.length) {
        for (const tp of d.pais) { const a = areaDe(c, tp, d.area); if (!a) pende(c, 'ÁREA', `montado em ${tp}: área não identificada`); linha(c, a, { PAIS: pai(tp, a), TRECHOS: trechos, 'QTD POR TRECHO': qtdSemTag || '', ...(d.elev ? { 'ELEVAÇÃO': d.elev } : {}) }); }
      } else {
        const a = d.area || (paisD[0] && paisD[0].area) || '';
        if (!a) pende(c, 'ÁREA', 'material sem TAG, sem pai e sem área');
        linha(c, a, { TRECHOS: trechos, 'QTD POR TRECHO': qtdSemTag || '', ...(d.elev ? { 'ELEVAÇÃO': d.elev } : {}) });
      }
      if (!d.tags.length && !qtdSemTag) pende(c, 'QTD', 'material sem TAG: QTD instalada sem fonte (nunca a de reposição); preencha QTD POR TRECHO');
      const tags = d.tags.map(x => x.tag);
      const mfb = tags.length ? (e.ind.paginas.find(p => p.tipo === 'MFB' && tags.some(tg => p.x.includes(tg))) || {}).d : '';
      docs.push({ 'CÓDIGO PMIB': c.pmib, 'PART NUMBER': c.codigoMaterial, 'DESCRIÇÃO DO MATERIAL': c.descricao,
        'RDS-PP DOCUMENTO - PRINCIPAL': mfb || e.lista || '', QTD: tags.length || d.qtd || '', TAGS: tags.join(', '),
        'OBSERVAÇÕES': [...new Set(base.slice(ini).map(r => r['RDS-PP']).filter(Boolean))].join(', ') });
    }
    // uma pendência por área (não por linha): a elevação que os documentos não trazem é preenchida uma vez
    for (const [a, n] of semElev) pend.push({ PMIB: '', ITEM: '', 'DESCRIÇÃO': `ÁREA ${a}`, TIPO: 'ELEVAÇÃO',
      DETALHE: `a área ${a} não tem elevação escrita nos documentos: preencha ELEVAÇÃO nas ${n} linhas da BASE com ÁREA/PAINEL = ${a}` });
    const relacoes = e.relacoes.map(r => ({ 'PMIB PAI': r.pmibPai, 'PMIB FILHO': r.pmibFilho, CATEGORIA: 'documental', 'SEÇÃO': r.secao, 'ITEM NO STATUS': r.itemNoStatus, FONTE: 'Status PMIB' }));
    for (const d of decisoes) for (const p of d.pais) relacoes.push({ 'PMIB PAI': `TAG ${p}`, 'PMIB FILHO': d.pmib, CATEGORIA: 'física (interpretada)', 'SEÇÃO': '', 'ITEM NO STATUS': '', FONTE: d.evidencia || 'IA' });
    const caminho = caminhoDoStatus(e.statusRows || []);
    const cabecalho = { 'LISTA DE SOBRESSALENTE': e.lista || '', 'ESPECIFICAÇÃO TÉCNICA / CAPÍTULO': t(e.especificacao) || caminho.split('/').slice(0, -1).map(t).join(' / '), SUBSISTEMA: e.subsistema };
    const leitura = e.catalogo.map(c => {
      const d = dec.get(c.pmib) || { tags: [], pais: [], avisos: [] };
      return { PMIB: c.pmib, ITEM: c.item, 'DESCRIÇÃO': c.descricao, ORIGEM: d.origem || '', TAGS: d.tags.map(x => `${x.tag} (${x.area || '?'}${x.rdsProprio ? ', RDS próprio' : ''})`).join('; '),
        PAIS: d.pais.join(', '), 'ÁREA': d.area || notaArea.get(c.pmib) || '', QTD: d.qtd ? `${d.qtd}${d.qtdConvencao ? ' (convenção de kits)' : ''}` : '', FREQUÊNCIA: fonteHz.get(c.pmib) || '',
        'EVIDÊNCIA': d.evidencia || '', REGRAS: (d.regras || []).join(' | '), AVISOS: (d.avisos || []).join(' | ') };
    });
    return { base, cabecalho, docs, relacoes, pendencias: pend, leitura,
      resumo: { linhasBase: base.length, materiais: e.catalogo.length, lidosPelaIA: decisoes.filter(d => /IA/.test(d.origem || '')).length, pelaCodigo: decisoes.filter(d => /^código/.test(d.origem || '')).length, areas: e.areas.length, pendencias: pend.length,
        regras: decisoes.filter(d => (d.regras || []).length).length } };
  }

  // ── revisão das áreas (Workflow A — Revisar áreas, sem IA) ──
  const COLUNAS_AREAS = ['ÁREA/PAINEL', 'NOVO NOME', 'RDS-PP', 'LOCAL', 'ELEVAÇÃO', 'EIXO', 'TRECHOS', 'LINHAS NA BASE', 'RDS-PP LIDO', 'ELEVAÇÃO LIDA', 'EIXO LIDO', 'EVIDÊNCIA'];
  function abaAreas(areas, base) {
    const n = new Map();
    for (const r of base) if (r['ÁREA/PAINEL']) n.set(r['ÁREA/PAINEL'], (n.get(r['ÁREA/PAINEL']) || 0) + 1);
    return areas.map(a => {
      const r = base.find(x => x['ÁREA/PAINEL'] === a.nome) || {};
      return { 'ÁREA/PAINEL': a.nome, 'NOVO NOME': '', 'RDS-PP': a.rds, LOCAL: a.local, 'ELEVAÇÃO': a.elev, EIXO: r.EIXO || a.eixo,
        TRECHOS: (a.trechos || []).join(', '), 'LINHAS NA BASE': n.get(a.nome) || 0, 'RDS-PP LIDO': a.rds, 'ELEVAÇÃO LIDA': a.elev, 'EIXO LIDO': r.EIXO || a.eixo, 'EVIDÊNCIA': a.evidencia };
    });
  }

  /**
   * Aplica na BASE a aba ÁREAS revisada pelo usuário: nome (NOVO NOME), RDS-PP, LOCAL, ELEVAÇÃO e EIXO de cada área.
   * Só troca o valor da linha que veio da área (igual ao LIDO, ou vazio): elevação lida por TAG nos documentos fica.
   * PAIS que citam o RDS-PP antigo da área passam a citar o novo. Devolve { base, areas, pendencias, resumo }.
   */
  function revisaAreas(e) {
    const linhas = e.base.map(r => ({ ...r }));
    const revisadas = [];
    let alteradas = 0;
    const rdsTroca = new Map();
    for (const a of e.areas) {
      const velho = t(a['ÁREA/PAINEL']);
      if (!velho || velho === 'AVISO') continue;
      const novo = t(a['NOVO NOME']) || velho; // como o usuário escreveu
      const rdsLido = rdsDaArea(a['RDS-PP LIDO']), rds = rdsDaArea(a['RDS-PP']);
      const elevLida = elevacao(a['ELEVAÇÃO LIDA']), elev = elevacao(a['ELEVAÇÃO']);
      const eixoLido = eixoDe(a['EIXO LIDO']), eixo = eixoDe(a.EIXO);
      if (rdsLido && rds && rdsLido !== rds) rdsTroca.set(rdsLido, rds);
      for (const r of linhas) {
        if (t(r['ÁREA/PAINEL']) !== velho) continue;
        const antes = JSON.stringify(r);
        r['ÁREA/PAINEL'] = novo;
        if (!t(r['RDS-PP']) || rdsDaArea(r['RDS-PP']) === rdsLido) r['RDS-PP'] = rds;
        if (t(a.LOCAL)) r.LOCAL = up(a.LOCAL);
        if (!t(r['ELEVAÇÃO']) || elevacao(r['ELEVAÇÃO']) === elevLida) r['ELEVAÇÃO'] = elev;
        if (!t(r.EIXO) || eixoDe(r.EIXO) === eixoLido) r.EIXO = eixo;
        if (t(a.TRECHOS)) r.TRECHOS = listaDeTrechos(a.TRECHOS).join(', ');
        if (JSON.stringify(r) !== antes) alteradas++;
      }
      revisadas.push({ ...a, 'ÁREA/PAINEL': novo, 'NOVO NOME': '', 'RDS-PP': rds ? rds.replace('#ST[XX]=M[XX]', '#ST00=M00') : '', 'ELEVAÇÃO': elev, EIXO: eixo,
        'RDS-PP LIDO': rds ? rds.replace('#ST[XX]=M[XX]', '#ST00=M00') : '', 'ELEVAÇÃO LIDA': elev, 'EIXO LIDO': eixo, 'LINHAS NA BASE': linhas.filter(r => r['ÁREA/PAINEL'] === novo).length });
    }
    for (const r of linhas) if (t(r.PAIS)) {
      r.PAIS = t(r.PAIS).split(/\s*;\s*/).map(p => { const [tg, rd] = p.split(/\s*\|\s*/); const k = rdsDaArea(rd); return `${t(tg)} | ${rdsTroca.get(k) || t(rd)}`; }).join(' ; ');
    }
    // pendências de elevação refeitas a partir da BASE revisada (uma por área); as outras ficam
    const pend = (e.pendencias || []).filter(p => t(p.TIPO) !== 'ELEVAÇÃO');
    const semElev = new Map();
    for (const r of linhas) if (t(r['ÁREA/PAINEL']) && !t(r['ELEVAÇÃO'])) semElev.set(r['ÁREA/PAINEL'], (semElev.get(r['ÁREA/PAINEL']) || 0) + 1);
    for (const [a, n] of semElev) pend.push({ PMIB: '', ITEM: '', 'DESCRIÇÃO': `ÁREA ${a}`, TIPO: 'ELEVAÇÃO',
      DETALHE: `a área ${a} continua sem elevação: preencha ELEVAÇÃO na aba ÁREAS (ou nas ${n} linhas da BASE com ÁREA/PAINEL = ${a})` });
    return { base: linhas, areas: revisadas, pendencias: pend, resumo: { areas: revisadas.length, linhasAlteradas: alteradas, pendencias: pend.length, semElevacao: [...semElev.values()].reduce((x, y) => x + y, 0) } };
  }

  // ── conferência com uma Base já aplicada (gabarito), por material ──
  const tagNoRds = rds => (t(rds).match(/(?:[A-Z]{2}\d{3}-[A-Z]{2}\d{3}|[A-Z]{3}\d{2}[A-Z]{2}\d{3})([A-Z]{2}\d{3}[A-Z]?)$/) || [])[1] || '';
  const semTag = rds => { const tg = tagNoRds(rds); return tg ? t(rds).slice(0, -tg.length) : t(rds); };
  function perfil(linhas) {
    const m = new Map();
    for (const r of linhas) {
      const p = t(r.FICHA_PMIB).replace(/^'/, '');
      const x = m.get(p) || { tags: new Set(), pais: new Set(), rds: new Set(), elev: new Set(), eixo: new Set(), trechos: new Set(), linhas: 0 };
      if (t(r.TAG)) x.tags.add(up(r.TAG));
      for (const q of t(r.PAIS).split(';').map(s => up(s.split('|')[0])).filter(Boolean)) x.pais.add(q);
      if (tagNoRds(r['RDS-PP'])) x.pais.add(tagNoRds(r['RDS-PP']));
      if (t(r['RDS-PP'])) x.rds.add(semTag(r['RDS-PP']));
      x.elev.add(t(r['ELEVAÇÃO'])); x.eixo.add(t(r.EIXO));
      for (const tr of t(r.TRECHOS).split(/[,;\s]+/).filter(Boolean)) x.trechos.add(tr);
      x.linhas += Number(r['QTD POR TRECHO']) || 0;
      m.set(p, x);
    }
    return m;
  }
  const igual = (a, b) => a.size === b.size && [...a].every(v => b.has(v));
  function comparaComGabarito(base, gabarito) {
    const A = perfil(base), G = perfil(gabarito);
    const campos = ['tags', 'pais', 'rds', 'elev', 'eixo', 'trechos'];
    const total = Object.fromEntries(campos.map(c => [c, 0]));
    const linhas = [];
    for (const [p, g] of G) {
      const a = A.get(p);
      const r = { PMIB: p };
      for (const c of campos) {
        const ok = a ? igual(a[c], g[c]) : false;
        if (ok) total[c]++;
        r[c.toUpperCase()] = ok ? 'OK' : `BASE: ${[...g[c]].join(', ')} | GERADA: ${a ? [...a[c]].join(', ') : '(falta)'}`;
      }
      linhas.push(r);
    }
    return { pmibs: G.size, total, linhas };
  }

  // Linhas da aplicação (como o B gera) iguais nas duas Bases: multiconjunto de PMIB|CÓDIGO|TAG.
  function comparaAplicacao(base, gabarito, L) {
    const linhas = (b, semArea) => b.map(L.linhaParaModelo).filter(m => m.qtd > 0).map(m => (semArea ? { ...m, area: 'ÁREA' } : m))
      .flatMap(L.geraModelo).map(l => `${l.pmib}|${l.codigo}|${l.tag}`);
    const conta = semArea => {
      const g = new Map();
      for (const k of linhas(gabarito, semArea)) g.set(k, (g.get(k) || 0) + 1);
      const nG = [...g.values()].reduce((a, b) => a + b, 0);
      let iguais = 0, nA = 0;
      for (const k of linhas(base, semArea)) { nA++; if (g.get(k) > 0) { iguais++; g.set(k, g.get(k) - 1); } }
      return { nG, nA, iguais };
    };
    const a = conta(false), b = conta(true);
    return { gabarito: a.nG, gerada: a.nA, iguais: a.iguais, iguaisSemNomeDaArea: b.iguais };
  }

  return { separaTags, EIXOS, LOCAIS, indiceCompacto, promptAreas, leAreas, formAreas, aplicaFormAreas, tagsDoPainel, ehKit,
    planoDeLeitura, confereAreasDasTags, confereConfirma, decisoesDaLeitura, tarefasMateriais, confereMateriais, json, rdsDaArea, montaBase, comparaComGabarito, comparaAplicacao, tagNoRds, COLUNAS_AREAS, abaAreas, revisaAreas,
    titulosDeDocumentos, confereTagDaLista, normArea, doSistema };
})();
if (typeof module !== 'undefined') module.exports = LEITURA;

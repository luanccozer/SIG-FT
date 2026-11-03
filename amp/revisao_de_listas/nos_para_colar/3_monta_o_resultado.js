// Cole todo este conteúdo no nó de código "Monta o resultado" (JavaScript) do workflow montado à mão:
// amp/revisao_de_listas/passo_a_passo_workflow_n8n.md. Gerado por gerar_workflow.py a partir
// de js/monta_resultado.js; para mudar, mude o js/ e rode o gerador.
const VERSAO_WORKFLOW = "2026-11-02";

// ── comum: as funções que os nós de código deste workflow dividem ──
// gerar_workflow.py copia este arquivo no começo de cada nó de código.

// Texto sem acento, em maiúsculas e com os espaços juntados: a comparação ignora o que não é mudança.
function semAcento(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function normal(s) {
  return semAcento(s).toUpperCase().replace(/\s+/g, ' ').trim();
}
function compacto(s) {
  return semAcento(s).toUpperCase().replace(/\s+/g, '');
}

// Uma célula como o Excel cola: sem tabulação nem quebra de linha dentro.
function celula(v) {
  return v === null || v === undefined ? '' : String(v).replace(/[\t\r\n]+/g, ' ').trim();
}
function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// O SIG-FT marca o começo de cada página do PDF com "--- página N ---".
function paginasDoTexto(texto) {
  const paginas = new Map();
  const partes = String(texto ?? '').split(/^--- página (\d+) ---[ \t]*$/m);
  for (let i = 1; i < partes.length; i += 2) paginas.set(Number(partes[i]), partes[i + 1] || '');
  return paginas;
}

// O _STATUS_PMIB chega em tabulação: o cabeçalho na primeira linha e as linhas de dados depois. A
// LINHA que os agentes citam é a posição da linha de dados, a partir de 1.
function lerTsv(tsv) {
  const linhas = String(tsv ?? '').split(/\r?\n/);
  while (linhas.length && !linhas[linhas.length - 1].trim()) linhas.pop();
  const cabecalho = (linhas.shift() ?? '').split('\t');
  const dados = linhas.map(l => {
    const c = l.split('\t');
    while (c.length < cabecalho.length) c.push('');
    return c.slice(0, cabecalho.length);
  });
  return { cabecalho, dados };
}

// As colunas que vêm da lista são as que ficam à esquerda de CÓDIGO PMIB; dali para a direita é o
// andamento da equipe, que nenhuma ação muda.
const NOMES_DA_LISTA = new Set(['ITEM', 'QTD.', 'QTD', 'QUANTIDADE', 'UNID.', 'UNID', 'UNIDADE', 'DESCRICAO',
  'CODIGO DO MATERIAL', 'CODIGO CMI', 'MARCA/MODELO', 'FABRICANTE', 'CODIGO DO FORNECEDOR', 'CODIGO GE']);
function colunasDaLista(cabecalho) {
  const nomes = cabecalho.map(normal);
  const pmib = nomes.findIndex(n => n.startsWith('CODIGO PMIB'));
  return nomes.map((n, i) => [n, i])
    .filter(([n, i]) => n && (pmib >= 0 ? i < pmib : NOMES_DA_LISTA.has(n)))
    .map(([, i]) => i);
}
function indiceDaColuna(cabecalho, nome) {
  const alvo = normal(nome);
  return cabecalho.findIndex(c => normal(c) === alvo);
}

// A resposta do nó AMP Agent vem em `output`; o erro (com "continuar na saída normal"), em `error`.
// A mensagem de erro é cortada: ela vai para o diagnóstico do SIG-FT.
function saidaDoAgente(j) {
  if (j && j.error !== undefined && j.error !== null && j.error !== '') {
    const e = j.error;
    const mensagem = typeof e === 'string' ? e : (e.message || e.description || JSON.stringify(e));
    return { erro: String(mensagem).slice(0, 300) };
  }
  const o = j ? j.output : undefined;
  const texto = typeof o === 'string' ? o : (o !== undefined && o !== null ? JSON.stringify(o) : '');
  return texto.trim() ? { texto } : { erro: 'o agente não devolveu resposta' };
}

// Os agentes do AMP costumam escrever uma frase antes do JSON e pôr o JSON numa cerca de código.
function extrairJson(texto) {
  const s = String(texto ?? '').trim();
  const tentativas = [];
  const cerca = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cerca) tentativas.push(cerca[1]);
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) tentativas.push(s.slice(a, b + 1));
  tentativas.push(s);
  for (const t of tentativas) {
    try {
      const v = JSON.parse(t);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch (e) { /* a próxima tentativa */ }
  }
  return null;
}

function idsUnicos(lista, prefixo) {
  const vistos = new Set();
  return lista.map((item, k) => {
    let id = celula(item.id);
    if (!id || vistos.has(id)) {
      let n = k + 1;
      while (vistos.has(`${prefixo}${n}`)) n++;
      id = `${prefixo}${n}`;
    }
    vistos.add(id);
    return { ...item, id };
  });
}
function objetos(lista) {
  return (Array.isArray(lista) ? lista : []).filter(x => x && typeof x === 'object' && !Array.isArray(x));
}
function valoresDe(v) {
  const valores = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const [coluna, valor] of Object.entries(v)) valores[coluna] = celula(valor);
  return valores;
}

function normalizarAcoes(lista, prefixo) {
  return idsUnicos(objetos(lista), prefixo).map(a => ({
    id: a.id,
    acao: celula(a.acao).toLowerCase(),
    linha: numero(a.linha),
    inserir_apos: numero(a.inserir_apos),
    valores: valoresDe(a.valores),
    pagina: numero(a.pagina),
    trecho: String(a.trecho ?? ''),
    motivo: celula(a.motivo),
    mudanca: a.mudanca ? celula(a.mudanca) : null,
    a_conferir: a.a_conferir === true,
    duvida: celula(a.duvida),
  }));
}

function normalizarMudancas(lista) {
  return idsUnicos(objetos(lista), 'M').map(m => ({
    id: m.id,
    tipo: celula(m.tipo).toLowerCase(),
    item_em_uso: m.item_em_uso === null || m.item_em_uso === undefined ? null : celula(m.item_em_uso),
    item_atual: m.item_atual === null || m.item_atual === undefined ? null : celula(m.item_atual),
    descricao: celula(m.descricao),
    codigo_material: celula(m.codigo_material),
    campos: objetos(m.campos).map(c => ({ campo: celula(c.campo), antes: celula(c.antes), depois: celula(c.depois) })),
    pagina_em_uso: numero(m.pagina_em_uso),
    pagina_atual: numero(m.pagina_atual),
    trecho: String(m.trecho ?? ''),
    explicacao: celula(m.explicacao),
    a_conferir: m.a_conferir === true,
    duvida: celula(m.duvida),
  }));
}

// A mensagem do Revisor a partir do pedido no formato do SIG-FT ({lista, revisao_em_uso, revisao_atual,
// status_pmib}). O _STATUS_PMIB ganha a coluna LINHA, que os dois agentes citam.
function mensagemDoRevisor(corpo) {
  const lista = corpo.lista || {};
  const emUso = corpo.revisao_em_uso;
  const atual = corpo.revisao_atual || {};
  const status = corpo.status_pmib || {};
  const { cabecalho, dados } = lerTsv(status.tsv);
  const tabela = [['LINHA', ...cabecalho], ...dados.map((linha, k) => [String(k + 1), ...linha])]
    .map(linha => linha.join('\t')).join('\n');
  const documentos = [
    '## LISTA',
    `Código da lista: ${lista.codigo || ''}`,
    `Revisão em uso (a que a _STATUS_PMIB reflete hoje): ${lista.revisao_em_uso || '(nenhuma)'}`,
    `Revisão atual (a última emitida): ${lista.revisao_atual || ''}`,
    `STATUS REAL da revisão atual: ${lista.status_real || '(vazio)'}`,
    `Data de hoje: ${lista.data_de_hoje || ''}`,
    '',
    emUso ? `## REVISÃO EM USO — ${emUso.arquivo || ''} (${emUso.paginas || '?'} páginas)` : '## REVISÃO EM USO',
    emUso ? String(emUso.texto || '')
      : 'Não há: a lista ainda não tem revisão em uso. Compare só a revisão atual com a _STATUS_PMIB.',
    '',
    `## REVISÃO ATUAL — ${atual.arquivo || ''} (${atual.paginas || '?'} páginas)`,
    String(atual.texto || ''),
    '',
    `## _STATUS_PMIB — ${status.arquivo || ''}, aba ${status.aba || ''}, ${dados.length} linhas`,
    `Linha de revisão: ${status.linha_de_revisao || '(não encontrada)'}`,
    tabela,
  ].join('\n');
  return { documentos, chatInput: 'Revise a lista abaixo e responda só com o JSON combinado.\n\n' + documentos };
}

function mensagemDoConferente(documentos, revisor) {
  return 'Confira o resultado do Revisor contra os documentos e responda só com o JSON combinado.\n\n'
    + documentos + '\n\n## RESULTADO DO REVISOR\n' + JSON.stringify(revisor, null, 1);
}

function normalizarRevisor(r) {
  const lista = v => (Array.isArray(v) ? v : []);
  return {
    resumo: celula(r.resumo),
    itens_revisao_em_uso: numero(r.itens_revisao_em_uso),
    itens_revisao_atual: numero(r.itens_revisao_atual),
    mudancas: normalizarMudancas(r.mudancas),
    acoes: normalizarAcoes(r.acoes, 'A'),
    linhas_documentais_mantidas: lista(r.linhas_documentais_mantidas).map(numero).filter(n => n !== null),
    observacoes: lista(r.observacoes).map(celula).filter(Boolean),
  };
}

// ── Monta o resultado: junta o Revisor e o Conferente, confere a prova no PDF e remonta a _STATUS_PMIB ──
// Só entra na tabela a ação que o Conferente confirmou (ou corrigiu) e cuja prova o código achou no
// texto da revisão atual. O resto fica em "A conferir", fora da tabela, para a pessoa decidir. As
// colunas da equipe (CÓDIGO PMIB e as que ficam à direita dele) nunca mudam.

// A página onde o trecho está (a citada primeiro), ou null.
function acharTrecho(paginas, trecho, pagina) {
  const alvoNormal = normal(trecho), alvoCompacto = compacto(trecho);
  if (!alvoCompacto) return null;
  const ordem = [...paginas.keys()].sort((a, b) => (a === pagina ? -1 : b === pagina ? 1 : a - b));
  for (const p of ordem) {
    const texto = paginas.get(p);
    if (normal(texto).includes(alvoNormal) || compacto(texto).includes(alvoCompacto)) return p;
  }
  return null;
}

// A página onde o código aparece como palavra inteira (VE-100 não casa com VE-1000), ou null.
function acharCodigo(paginas, codigo) {
  const alvo = normal(codigo);
  if (!alvo) return null;
  const re = new RegExp('(^|[^A-Z0-9])' + alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^A-Z0-9])');
  for (const [p, texto] of paginas) if (re.test(normal(texto))) return p;
  return null;
}

// "corrigido": vale o que o Conferente diz, e a prova passa a ser o trecho dele.
function aplicarCorrecao(acao, v) {
  if (v.trecho) { acao.trecho = String(v.trecho); acao.pagina = numero(v.pagina); }
  const c = v.correcao;
  if (!c || typeof c !== 'object') return;
  if (c.acao) acao.acao = celula(c.acao).toLowerCase();
  if ('linha' in c) acao.linha = numero(c.linha);
  if ('inserir_apos' in c) acao.inserir_apos = numero(c.inserir_apos);
  if ('pagina' in c) acao.pagina = numero(c.pagina);
  if (c.trecho) acao.trecho = String(c.trecho);
  Object.assign(acao.valores, valoresDe(c.valores));
}

function revisarResultado(corpo, revisor, conferente, aviso) {
  const lista = corpo.lista || {};
  const { cabecalho, dados } = lerTsv((corpo.status_pmib || {}).tsv);
  const daLista = new Map(colunasDaLista(cabecalho).map(i => [normal(cabecalho[i]), i]));
  const iCodigo = indiceDaColuna(cabecalho, 'CODIGO DO MATERIAL');
  const iDescricao = indiceDaColuna(cabecalho, 'DESCRICAO');
  const iObs = indiceDaColuna(cabecalho, 'OBSERVACOES');
  const atual = paginasDoTexto((corpo.revisao_atual || {}).texto);
  const todoAtual = compacto([...atual.values()].join(' '));
  const vereditos = new Map(objetos(conferente && conferente.vereditos).map(v => [celula(v.id), v]));
  const existe = n => Number.isInteger(n) && n >= 1 && n <= dados.length;

  // O que o código confere sozinho. Bloqueio: a ação não entra na tabela. Nota: entra, com aviso.
  function prova(acao) {
    const bloqueios = [], notas = [];
    acao.colunas = {};
    for (const [coluna, valor] of Object.entries(acao.valores)) {
      const i = daLista.get(normal(coluna));
      if (i === undefined) notas.push(`a coluna "${coluna}" não é da lista e foi ignorada`);
      else acao.colunas[i] = valor;
    }
    const codigo = iCodigo >= 0 ? acao.colunas[iCodigo] : undefined;
    if (!['atualizar', 'remover', 'inserir'].includes(acao.acao)) bloqueios.push(`ação desconhecida: "${acao.acao}"`);
    if ((acao.acao === 'atualizar' || acao.acao === 'remover') && !existe(acao.linha)) {
      bloqueios.push(`a LINHA ${acao.linha ?? '(vazia)'} não existe na _STATUS_PMIB`);
    }
    if (acao.acao === 'inserir' && acao.inserir_apos !== null && acao.inserir_apos !== 0 && !existe(acao.inserir_apos)) {
      bloqueios.push(`não há LINHA ${acao.inserir_apos} para inserir depois dela`);
    }
    if (acao.acao === 'atualizar' && !Object.keys(acao.colunas).length) bloqueios.push('nada a mudar nas colunas da lista');
    if (acao.acao === 'inserir' && !Object.values(acao.colunas).some(Boolean)) bloqueios.push('o item novo veio sem valores');
    if (acao.acao === 'atualizar' || acao.acao === 'inserir') {
      const p = compacto(acao.trecho) ? acharTrecho(atual, acao.trecho, acao.pagina) : null;
      if (!compacto(acao.trecho)) bloqueios.push('sem trecho do PDF');
      else if (p === null) bloqueios.push('o trecho citado não está no texto da revisão atual');
      else {
        if (acao.pagina !== null && p !== acao.pagina) notas.push(`o trecho está na página ${p}, e não na ${acao.pagina}`);
        acao.pagina = p;
      }
      if (codigo && acharCodigo(atual, codigo) === null && !todoAtual.includes(compacto(codigo))) {
        bloqueios.push(`o código ${codigo} não aparece na revisão atual`);
      }
    }
    if (acao.acao === 'inserir' && codigo) {
      const k = dados.findIndex(l => compacto(l[iCodigo]) === compacto(codigo));
      if (k >= 0) bloqueios.push(`o código ${codigo} já está na LINHA ${k + 1}`);
    }
    if (acao.acao === 'remover' && existe(acao.linha) && iCodigo >= 0) {
      // Aqui vale também o código grudado no texto vizinho (a extração do PDF pode juntar as células):
      // na dúvida, a remoção fica a conferir.
      const antigo = celula(dados[acao.linha - 1][iCodigo]);
      if (compacto(antigo).length >= 4) {
        const p = acharCodigo(atual, antigo);
        if (p !== null) bloqueios.push(`o código ${antigo} ainda aparece na revisão atual (página ${p})`);
        else if (todoAtual.includes(compacto(antigo))) bloqueios.push(`o código ${antigo} ainda aparece na revisão atual`);
      }
    }
    return { bloqueios, notas };
  }

  function oQueMuda(acao) {
    const linha = existe(acao.linha) ? dados[acao.linha - 1] : null;
    if (acao.acao === 'remover') {
      return 'sai' + (linha ? ': ' + [linha[iCodigo], linha[iDescricao]].filter(Boolean).join(' · ') : '');
    }
    const pares = Object.entries(acao.valores);
    if (acao.acao === 'inserir') return 'entra: ' + pares.filter(([, v]) => v).map(([c, v]) => `${c} ${v}`).join(' · ');
    return pares.map(([c, v]) => {
      const i = daLista.get(normal(c));
      const antes = linha && i !== undefined ? linha[i] : '?';
      return `${c}: ${antes || '(vazio)'} → ${v || '(vazio)'}`;
    }).join(' · ');
  }

  const decisoes = [];
  for (const original of revisor.acoes) {
    const acao = JSON.parse(JSON.stringify(original));
    const v = vereditos.get(acao.id);
    const veredito = v ? celula(v.veredito).toLowerCase() : '';
    const d = { id: acao.id, origem: 'Revisor', acao, veredito, motivo_conferente: v ? celula(v.motivo) : '',
      situacao: 'a_conferir', notas: [] };
    if (conferente && (veredito === 'confirmado' || veredito === 'corrigido')) {
      if (veredito === 'corrigido') aplicarCorrecao(acao, v);
      const { bloqueios, notas } = prova(acao);
      d.notas.push(...notas, ...bloqueios);
      if (!bloqueios.length) d.situacao = 'aplicada';
    } else {
      if (!conferente) d.notas.push(aviso || 'a conferência não foi feita');
      else if (!v) d.notas.push('o Conferente não deu veredito');
      else if (veredito === 'rejeitado') d.situacao = 'rejeitada';
      else d.notas.push('o Conferente não conseguiu decidir');
      const { bloqueios } = prova(acao);
      if (d.situacao !== 'rejeitada') d.notas.push(...bloqueios);
    }
    d.texto = oQueMuda(acao);
    decisoes.push(d);
  }

  const usados = new Set(decisoes.map(d => d.id));
  normalizarAcoes(conferente && conferente.faltou, 'F').forEach((acao, k) => {
    if (usados.has(acao.id)) { let n = k + 1; while (usados.has(`F${n}`)) n++; acao.id = `F${n}`; }
    usados.add(acao.id);
    const { bloqueios, notas } = prova(acao);
    decisoes.push({ id: acao.id, origem: 'Conferente', acao, veredito: '', motivo_conferente: acao.motivo,
      situacao: 'a_conferir', notas: ['achado só pelo Conferente', ...notas, ...bloqueios], texto: oQueMuda(acao) });
  });

  // Conflitos entre o que vai ser aplicado: a LINHA removida não é atualizada, a célula não recebe dois
  // valores e o mesmo código não entra duas vezes.
  const aplicadas = tipo => decisoes.filter(d => d.situacao === 'aplicada' && d.acao.acao === tipo);
  const removidas = new Set(aplicadas('remover').map(d => d.acao.linha));
  const celulas = new Map();
  for (const d of aplicadas('atualizar')) {
    if (removidas.has(d.acao.linha)) { d.situacao = 'a_conferir'; d.notas.push('outra ação remove a mesma LINHA'); continue; }
    const conflito = Object.entries(d.acao.colunas)
      .find(([i, v]) => celulas.has(`${d.acao.linha}:${i}`) && celulas.get(`${d.acao.linha}:${i}`) !== v);
    if (conflito) {
      d.situacao = 'a_conferir';
      d.notas.push(`outra ação já muda ${cabecalho[conflito[0]]} da LINHA ${d.acao.linha}`);
      continue;
    }
    for (const [i, v] of Object.entries(d.acao.colunas)) celulas.set(`${d.acao.linha}:${i}`, v);
  }
  const codigosNovos = new Set();
  for (const d of aplicadas('inserir')) {
    const c = iCodigo >= 0 ? compacto(d.acao.colunas[iCodigo]) : '';
    if (c && codigosNovos.has(c)) { d.situacao = 'a_conferir'; d.notas.push('outra ação já insere o mesmo código'); }
    else if (c) codigosNovos.add(c);
  }

  // A tabela remontada: a ordem da _STATUS_PMIB, sem as removidas, com as novas no lugar pedido.
  const linhas = dados.map((cels, k) => ({ linha: k + 1, cels: cels.slice(), mudou: new Set(), nova: false }));
  for (const d of aplicadas('atualizar')) {
    const l = linhas[d.acao.linha - 1];
    for (const [i, v] of Object.entries(d.acao.colunas)) if (l.cels[i] !== v) { l.cels[i] = v; l.mudou.add(Number(i)); }
  }
  const depois = new Map();
  for (const d of aplicadas('inserir')) {
    const cels = cabecalho.map(() => '');
    for (const [i, v] of Object.entries(d.acao.colunas)) cels[i] = v;
    const chave = d.acao.inserir_apos === null ? -1 : d.acao.inserir_apos;
    if (!depois.has(chave)) depois.set(chave, []);
    depois.get(chave).push({ linha: null, cels, mudou: new Set(), nova: true });
  }
  const remontada = [...(depois.get(0) || [])];
  for (const l of linhas) {
    if (!removidas.has(l.linha)) remontada.push(l);
    remontada.push(...(depois.get(l.linha) || []));
  }
  remontada.push(...(depois.get(-1) || []));

  // O que sai vai para a SEM_LISTA_STATUS_PMIB com o andamento e a origem em OBSERVAÇÕES.
  const nota = `Saiu da lista ${lista.codigo || ''} na revisão ${lista.revisao_atual || ''} `
    + `(estava na revisão ${lista.revisao_em_uso || 'em uso'}), em ${lista.data_de_hoje || ''}.`;
  const cabecalhoSemLista = iObs >= 0 ? cabecalho : [...cabecalho, 'OBSERVAÇÕES'];
  const k = iObs >= 0 ? iObs : cabecalho.length;
  const semLista = linhas.filter(l => removidas.has(l.linha)).map(l => {
    const cels = iObs >= 0 ? l.cels.slice() : [...l.cels, ''];
    cels[k] = cels[k] ? `${cels[k]} | ${nota}` : nota;
    return cels;
  });

  const mudancas = revisor.mudancas.map(m => {
    const v = vereditos.get(m.id);
    return { ...m, veredito: v ? celula(v.veredito).toLowerCase() : '', motivo_conferente: v ? celula(v.motivo) : '' };
  });
  const conta = s => decisoes.filter(d => d.situacao === s).length;
  const lidas = v => (Array.isArray(v) ? v : []).map(celula).filter(Boolean);
  return {
    lista, cabecalho, remontada, cabecalhoSemLista, semLista, decisoes, mudancas, aviso,
    resumo: revisor.resumo,
    linhaDeRevisao: `REVISÃO DA LISTA DE SOBRESSALENTES ATUAL EM USO: ${lista.revisao_atual || ''} - `
      + `DATA DE ALTERAÇÃO: ${lista.data_de_hoje || ''}`,
    observacoes: [...revisor.observacoes.map(o => ['Revisor', o]),
      ...lidas(conferente && conferente.observacoes).map(o => ['Conferente', o])],
    contagem: {
      mudancas: mudancas.length, aplicadas: conta('aplicada'), a_conferir: conta('a_conferir'),
      rejeitadas: conta('rejeitada'), sem_lista: semLista.length, linhas_antes: dados.length,
      linhas_depois: remontada.length, itens_revisao_em_uso: revisor.itens_revisao_em_uso,
      itens_revisao_atual: revisor.itens_revisao_atual,
      itens_revisao_atual_conferente: conferente ? numero(conferente.itens_revisao_atual) : null,
    },
  };
}

const CSS = `body{font:14px/1.45 "Segoe UI",system-ui,Arial,sans-serif;margin:24px;color:#1b1f24;background:#fff}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;border-bottom:1px solid #d0d7de;padding-bottom:4px}
.sub{font-size:15px;margin:0}.meta{color:#57606a;font-size:12px}
table{border-collapse:collapse;margin:8px 0;font-size:12.5px}th,td{border:1px solid #d0d7de;padding:4px 6px;vertical-align:top;text-align:left}
th{background:#f6f8fa}.numeros th{font-weight:normal;background:#fff}.numeros td{text-align:right;font-weight:600}
q{font-family:Consolas,monospace;font-size:12px}q::before,q::after{content:""}
.aviso{background:#ffebe9;border:1px solid #ff8182;padding:8px 12px}.atencao{background:#fff8c5;border:1px solid #d4a72c;padding:8px 12px}
tr.nova td{background:#dafbe1}td.mudou{background:#fff8c5;font-weight:600}
.rola{overflow:auto;max-height:70vh}button{margin:6px 0;padding:6px 14px;cursor:pointer}
code{font-family:Consolas,monospace;background:#f6f8fa;padding:2px 4px}
@media print{.rola{max-height:none;overflow:visible}button{display:none}}`;

// O botão copia o texto separado por tabulação, que o Excel cola em colunas.
const COPIA = `document.querySelectorAll('button[data-alvo]').forEach(function (b) {
  var rotulo = b.textContent;
  b.addEventListener('click', function () {
    var texto = document.getElementById(b.getAttribute('data-alvo')).value;
    var feito = function () { b.textContent = 'Copiado'; setTimeout(function () { b.textContent = rotulo; }, 2000); };
    var antigo = function () {
      var a = document.createElement('textarea');
      a.value = texto; a.style.position = 'fixed'; a.style.opacity = '0';
      document.body.appendChild(a); a.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(a);
      if (ok) feito(); else b.textContent = 'Não copiou: selecione a tabela e copie à mão';
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(texto).then(feito, antigo);
    else antigo();
  });
});`;

function paginaHtml(r, meta) {
  const L = r.lista, c = r.contagem;
  const tsv = linhas => linhas.map(l => l.join('\t')).join('\n');
  const tabela = (cabecalho, corpo) => `<table><thead><tr>${cabecalho.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead>`
    + `<tbody>${corpo.join('')}</tbody></table>`;
  const linha = (...cels) => `<tr>${cels.map(x => `<td>${x}</td>`).join('')}</tr>`;   // as células já vêm escapadas
  const trecho = t => (t ? `<q>${esc(t)}</q>` : '');
  const copiar = (id, rotulo, texto) => `<button type="button" data-alvo="${id}">${esc(rotulo)}</button>`
    + `<textarea id="${id}" hidden>${esc(texto)}</textarea>`;
  const onde = a => (a.acao !== 'inserir' ? a.linha ?? '' : a.inserir_apos === null ? 'no fim'
    : a.inserir_apos === 0 ? 'no começo' : `depois da ${a.inserir_apos}`);
  const grupo = s => r.decisoes.filter(d => d.situacao === s);
  const tabelaDecisoes = lista => tabela(
    ['Id', 'Quem achou', 'Ação', 'LINHA', 'O que muda', 'Página', 'Trecho do PDF', 'Conferente', 'Notas'],
    lista.map(d => linha(esc(d.id), esc(d.origem), esc(d.acao.acao), esc(onde(d.acao)), esc(d.texto),
      esc(d.acao.pagina ?? ''), trecho(d.acao.trecho), esc([d.veredito, d.motivo_conferente].filter(Boolean).join(': ')),
      esc(d.notas.join(' · ')))));

  const avisos = [];
  if (r.aviso) {
    avisos.push(`<p class="aviso"><b>A conferência não foi feita</b> (${esc(r.aviso)}). Nada foi aplicado na tabela: `
      + 'todas as ações estão em "A conferir".</p>');
  }
  if (c.a_conferir) {
    avisos.push(`<p class="atencao"><b>${c.a_conferir} ação(ões) a conferir</b>: elas não estão na tabela remontada. `
      + 'Decida cada uma antes de colar.</p>');
  }
  if (c.itens_revisao_atual !== null && c.itens_revisao_atual_conferente !== null
      && c.itens_revisao_atual !== c.itens_revisao_atual_conferente) {
    avisos.push(`<p class="atencao">O Revisor contou ${esc(c.itens_revisao_atual)} materiais na revisão atual, e o `
      + `Conferente, ${esc(c.itens_revisao_atual_conferente)}.</p>`);
  }

  const mudancas = r.mudancas.length ? tabela(
    ['Id', 'Tipo', 'Item (em uso → atual)', 'Material', 'O que mudou', 'Página (em uso → atual)', 'Trecho do PDF', 'Conferente'],
    r.mudancas.map(m => linha(esc(m.id), esc(m.tipo), esc(`${m.item_em_uso ?? '—'} → ${m.item_atual ?? '—'}`),
      esc([m.codigo_material, m.descricao].filter(Boolean).join(' · ')),
      esc(m.campos.map(x => `${x.campo}: ${x.antes || '(vazio)'} → ${x.depois || '(vazio)'}`).join(' · ') || m.explicacao)
        + (m.a_conferir ? `<br><i>dúvida do Revisor: ${esc(m.duvida)}</i>` : ''),
      esc(`${m.pagina_em_uso ?? '—'} → ${m.pagina_atual ?? '—'}`), trecho(m.trecho),
      esc([m.veredito || 'sem veredito', m.motivo_conferente].filter(Boolean).join(': ')))))
    : '<p>Nenhuma mudança nos itens.</p>';

  const status = tabela(r.cabecalho, r.remontada.map(l => `<tr${l.nova ? ' class="nova"' : ''}>`
    + l.cels.map((x, i) => `<td${l.mudou.has(i) ? ' class="mudou"' : ''}>${esc(x)}</td>`).join('') + '</tr>'));
  const semLista = r.semLista.length
    ? '<p>Linhas inteiras, com o andamento da equipe e a origem em OBSERVAÇÕES. O botão copia só as linhas, sem o '
      + 'cabeçalho.</p>' + copiar('tsv-sem-lista', 'Copiar as linhas', tsv(r.semLista))
      + `<div class="rola">${tabela(r.cabecalhoSemLista, r.semLista.map(l => linha(...l.map(esc))))}</div>`
    : '<p>Nenhuma linha sai da planilha.</p>';
  const observacoes = r.observacoes.length
    ? `<section><h2>Observações dos agentes</h2><ul>${r.observacoes.map(([quem, o]) => `<li><b>${esc(quem)}:</b> ${esc(o)}</li>`).join('')}</ul></section>`
    : '';
  const rejeitadas = grupo('rejeitada');
  const dados = {
    versao_workflow: meta.versao, execucao: meta.execucao, lista: L, contagem: c, linha_de_revisao: r.linhaDeRevisao,
    mudancas: r.mudancas,
    decisoes: r.decisoes.map(d => ({ id: d.id, origem: d.origem, situacao: d.situacao, veredito: d.veredito,
      motivo_conferente: d.motivo_conferente, notas: d.notas, acao: d.acao.acao, linha: d.acao.linha,
      inserir_apos: d.acao.inserir_apos, valores: d.acao.valores, pagina: d.acao.pagina, trecho: d.acao.trecho,
      motivo: d.acao.motivo, mudanca: d.acao.mudanca })),
  };
  const dadosJson = JSON.stringify(dados).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`Revisão ${L.codigo || ''} ${L.revisao_em_uso || '—'} → ${L.revisao_atual || ''}`)}</title>
<style>${CSS}</style>
</head>
<body>
<header>
<h1>Revisão da lista ${esc(L.codigo || '')}</h1>
<p class="sub">${esc(L.revisao_em_uso || 'sem revisão em uso')} → ${esc(L.revisao_atual || '')} · STATUS REAL: ${esc(L.status_real || '—')} · ${esc(L.data_de_hoje || '')}</p>
<p class="meta">Feito pelo workflow do n8n (versão ${esc(meta.versao)}, execução ${esc(meta.execucao)}) com os agentes Revisor de Listas e Conferente de Listas do AMP. Confira antes de colar.</p>
</header>
${avisos.join('\n')}
<section><h2>Resumo</h2>
<p>${esc(r.resumo || '(o Revisor não escreveu resumo)')}</p>
<table class="numeros"><tbody>
<tr><th>Mudanças entre as revisões</th><td>${c.mudancas}</td></tr>
<tr><th>Ações aplicadas na tabela</th><td>${c.aplicadas}</td></tr>
<tr><th>A conferir (fora da tabela)</th><td>${c.a_conferir}</td></tr>
<tr><th>Rejeitadas pelo Conferente</th><td>${c.rejeitadas}</td></tr>
<tr><th>Linhas para a SEM_LISTA_STATUS_PMIB</th><td>${c.sem_lista}</td></tr>
<tr><th>Linhas da _STATUS_PMIB (antes → depois)</th><td>${c.linhas_antes} → ${c.linhas_depois}</td></tr>
<tr><th>Materiais na revisão em uso / atual (Revisor)</th><td>${esc(c.itens_revisao_em_uso ?? '—')} / ${esc(c.itens_revisao_atual ?? '—')}</td></tr>
</tbody></table>
</section>
<section><h2>O que mudou entre as revisões</h2>
${mudancas}
</section>
<section><h2>A conferir (fora da tabela)</h2>
${grupo('a_conferir').length ? tabelaDecisoes(grupo('a_conferir')) : '<p>Nada a conferir.</p>'}
</section>
<section><h2>Aplicado na tabela</h2>
${grupo('aplicada').length ? tabelaDecisoes(grupo('aplicada')) : '<p>Nenhuma ação aplicada.</p>'}
</section>
${rejeitadas.length ? `<section><h2>Rejeitadas pelo Conferente</h2>\n${tabelaDecisoes(rejeitadas)}\n</section>` : ''}
<section><h2>_STATUS_PMIB remontado</h2>
<p>As mesmas colunas, na mesma ordem. Só estão aplicadas as ações que o Conferente confirmou e cuja prova está no PDF, e as colunas da equipe não mudam. Linhas novas em verde, células mudadas em amarelo. O botão copia a tabela com o cabeçalho: cole na célula ITEM do cabeçalho de uma cópia do _STATUS_PMIB.</p>
${copiar('tsv-status', 'Copiar a tabela', tsv([r.cabecalho, ...r.remontada.map(l => l.cels)]))}
<div class="rola">${status}</div>
</section>
<section><h2>Para a SEM_LISTA_STATUS_PMIB</h2>
${semLista}
</section>
<section><h2>Linha de revisão nova</h2>
<p><code>${esc(r.linhaDeRevisao)}</code></p>
${copiar('linha-revisao', 'Copiar a linha', r.linhaDeRevisao)}
<p class="meta">Troque a linha de revisão só depois de resolver o que está a conferir.</p>
</section>
${observacoes}
<script type="application/json" id="sigft-revisao">${dadosJson}</script>
<script>${COPIA}</script>
</body>
</html>
`;
}

const corpo = $('Monta o pedido').first().json.corpo || {};
const revisor = $('Prepara a conferência').first().json.revisor;
const execucao = String($execution.id);
const item = { json: {} };
try {
  const saida = saidaDoAgente($input.first().json);
  let conferente = null, aviso = '';
  if (saida.erro) aviso = `o Conferente de Listas falhou: ${saida.erro}`;
  else {
    conferente = extrairJson(saida.texto);
    if (!conferente) aviso = `o Conferente de Listas não devolveu o JSON combinado (${saida.texto.length} caracteres)`;
  }
  const r = revisarResultado(corpo, revisor, conferente, aviso);
  const html = paginaHtml(r, { versao: VERSAO_WORKFLOW, execucao });
  const resposta = { ok: true, modo: 'revisar', html, versao_workflow: VERSAO_WORKFLOW, execucao, contagem: r.contagem };
  if (aviso) resposta.aviso = aviso;
  item.json = { rota: 'ok', resposta };
  try {
    // O HTML também sai como arquivo, no campo binário `data`: a página final do formulário o entrega, e na
    // execução ele fica na aba Binary → Download.
    const lista = corpo.lista || {};
    const nome = `${lista.codigo || 'lista'}[${lista.revisao_em_uso || ''}-${lista.revisao_atual || ''}] revisao AMP`
      .replace(/[<>:"/\\|?*]/g, '_') + '.html';
    item.binary = { data: { data: Buffer.from(html, 'utf8').toString('base64'), mimeType: 'text/html',
      fileName: nome, fileExtension: 'html' } };
  } catch (e) { /* sem Buffer: fica só o JSON */ }
} catch (erro) {
  item.json = { rota: 'erro', resposta: { ok: false, modo: 'revisar', etapa: 'montar',
    erro: `falha ao montar o resultado: ${String((erro && erro.message) || erro).slice(0, 300)}`,
    versao_workflow: VERSAO_WORKFLOW, execucao } };
}
return [item];

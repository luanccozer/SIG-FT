// Cole todo este conteúdo no nó de código "Monta o pedido" (JavaScript) do workflow montado à mão:
// amp/revisao_de_listas/passo_a_passo_workflow_n8n.md. Gerado por gerar_workflow.py a partir
// de js/form_monta_pedido.js; para mudar, mude o js/ e rode o gerador.
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

// ── Monta o pedido (workflow com formulário): lê o formulário e os dois PDFs e monta a mensagem do Revisor ──
// Este código procura os nós pelo nome: "Formulário", "Lê a revisão em uso" e "Lê a revisão atual".
const form = $('Formulário').first().json;
const execucao = String($execution.id);

// Os campos do formulário, achados pelo rótulo, sem depender de acento ou maiúscula.
function campo(...palavras) {
  for (const [chave, valor] of Object.entries(form)) {
    const n = normal(chave);
    if (typeof valor === 'string' && !n.includes('PDF') && palavras.every(p => n.includes(p))) return valor;
  }
  return '';
}

// O texto que o Extract from File leu, uma página por item da lista (opção "Join Pages" desligada).
function paginasDoPdf(nome) {
  const t = $(nome).first().json.text;
  const paginas = Array.isArray(t) ? t.map(p => String(p ?? '')) : [String(t ?? '')];
  if (!paginas.some(p => p.trim())) throw new Error(`o nó "${nome}" não leu texto do PDF (PDF só de imagem?)`);
  return paginas;
}
const marcar = paginas => paginas.map((p, k) => `--- página ${k + 1} ---\n${p.trim()}`).join('\n');

// A colagem do Excel: colunas separadas por tabulação; a célula com quebra de linha vem entre aspas.
function lerColagem(texto) {
  const linhas = [];
  let linha = [], atual = '', aspas = false;
  const s = String(texto ?? '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (aspas) {
      if (ch === '"' && s[i + 1] === '"') { atual += '"'; i++; }
      else if (ch === '"') aspas = false;
      else atual += ch;
    } else if (ch === '"' && atual === '') aspas = true;
    else if (ch === '\t') { linha.push(atual); atual = ''; }
    else if (ch === '\n') { linha.push(atual); linhas.push(linha); linha = []; atual = ''; }
    else atual += ch;
  }
  if (atual !== '' || linha.length) { linha.push(atual); linhas.push(linha); }
  return linhas.map(l => l.map(celula));
}

const colagem = lerColagem(campo('STATUS'));
const iCabecalho = colagem.findIndex(l => l.some(c => normal(c) === 'CODIGO DO MATERIAL'));
if (iCabecalho < 0) {
  throw new Error('a colagem do _STATUS_PMIB não tem o cabeçalho (CÓDIGO DO MATERIAL): copie do Excel a partir da célula ITEM');
}
const linhaDeRevisao = colagem.slice(0, iCabecalho).flat().find(c => normal(c).includes('REVISAO DA LISTA')) || '';
let tabela = colagem.slice(iCabecalho);
while (tabela.length > 1 && tabela[tabela.length - 1].every(c => !c)) tabela.pop();
const largura = Math.max(...tabela.map(l => { let k = l.length; while (k > 0 && !l[k - 1]) k--; return k; }));
tabela = tabela.map(l => { const r = l.slice(0, largura); while (r.length < largura) r.push(''); return r; });

const d = new Date();
const hoje = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const revisaoEmUso = campo('REVISAO', 'EM USO').trim();
const revisaoAtual = campo('REVISAO', 'ATUAL').trim();
const paginasAtual = paginasDoPdf('Lê a revisão atual');
const paginasEmUso = revisaoEmUso ? paginasDoPdf('Lê a revisão em uso') : null;   // sem revisão em uso, o PDF é ignorado

const corpo = {
  modo: 'revisar',
  lista: { codigo: campo('CODIGO').trim(), revisao_em_uso: revisaoEmUso, revisao_atual: revisaoAtual, status_real: '',
    data_de_hoje: hoje },
  revisao_em_uso: paginasEmUso
    ? { arquivo: `revisão ${revisaoEmUso}`, paginas: paginasEmUso.length, texto: marcar(paginasEmUso) } : null,
  revisao_atual: { arquivo: `revisão ${revisaoAtual}`, paginas: paginasAtual.length, texto: marcar(paginasAtual) },
  status_pmib: { arquivo: '_STATUS_PMIB colado do Excel', aba: 'Lista de Materiais', linha_de_revisao: linhaDeRevisao,
    linhas: tabela.length - 1, tsv: tabela.map(l => l.join('\t')).join('\n') },
};
const { documentos, chatInput } = mensagemDoRevisor(corpo);
return [{ json: { modo: 'revisar', chatInput, sessionId: `sigft-revisor-${execucao}`, documentos, corpo } }];

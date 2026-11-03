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

/*
 * A0 — conferência dos materiais do Status PMIB nos documentos (sem IA).
 * A busca é a do índice (INDICE.indexaDocumento: chaves de INDICE.chavesDoMaterial, código inteiro no texto);
 * aqui só se guarda o que a conferência precisa e se montam as abas e a mensagem.
 * Cola num nó Code do n8n depois de indice.js (usa o INDICE global) ou roda no Node (require).
 */
const CONFERENCIA = (() => {
  const IND = typeof INDICE !== 'undefined' ? INDICE : require('../indice/indice.js');
  const MAX_ONDE = 10;
  const MAX_LISTA = 20;
  const lista = (xs, max = MAX_LISTA) => xs.slice(0, max).join(', ') + (xs.length > max ? ` (+ ${xs.length - max})` : '');

  /** Um PDF → { arquivo, paginas, semTexto, avisos, materiais: [{ pmib, de, pagina }] }. erro = mensagem do Extract. */
  function confereDocumento(arquivo, paginasTexto, catalogo, erro) {
    if (erro) return { arquivo, paginas: 0, semTexto: [], avisos: ['PDF não lido: ' + erro], materiais: [] };
    const d = IND.indexaDocumento(arquivo, paginasTexto || [], catalogo);
    const vistos = new Set();
    const materiais = [];
    for (const m of d.materiais) {
      const k = `${m.pmib}|${m.de}|${m.pagina}`;
      if (!vistos.has(k)) { vistos.add(k); materiais.push({ pmib: m.pmib, de: m.de, pagina: m.pagina }); }
    }
    const n = d.doc.paginas;
    const avisos = !n ? ['nenhuma página lida'] : d.doc.semTexto.length === n ? ['sem texto: escaneado?'] : [];
    return { arquivo, paginas: n, semTexto: d.doc.semTexto, avisos, materiais };
  }

  /** e = { documentos: [saída de confereDocumento], catalogo, sistema, ignorados?: [nomes] } → { abas, resumo } */
  function montaConferencia(e) {
    const docs = e.documentos;
    const sistema = e.sistema || 'Sistema';
    const onde = new Map(), por = new Map();
    for (const d of docs) for (const m of d.materiais) {
      onde.set(m.pmib, [...(onde.get(m.pmib) || []), `${d.arquivo} p.${m.pagina}`]);
      por.set(m.pmib, new Set([...(por.get(m.pmib) || []), m.de]));
    }
    const linhas = e.catalogo.map(c => {
      const lugares = [...new Set(onde.get(c.pmib) || [])];
      const achado = lugares.length ? 'SIM' : IND.chavesDoMaterial(c).length ? 'NÃO' : 'SEM CHAVE';
      return {
        'SEÇÃO': c.secao, ITEM: c.item, PMIB: c.pmib, 'DESCRIÇÃO': c.descricao, 'CÓDIGO DO MATERIAL': c.codigoMaterial,
        'MARCA/MODELO': c.marcaModelo, ACHADO: achado, 'ACHADO POR': [...(por.get(c.pmib) || [])].join(', '),
        ONDE: lugares.slice(0, MAX_ONDE).join('; ') + (lugares.length > MAX_ONDE ? ` (+ ${lugares.length - MAX_ONDE})` : ''),
      };
    });
    const abaDocs = docs.map(d => ({
      ARQUIVO: d.arquivo, 'PÁGINAS': d.paginas, 'PÁGINAS SEM TEXTO': IND.intervalos(d.semTexto),
      'MATERIAIS ACHADOS': new Set(d.materiais.map(m => m.pmib)).size, AVISO: d.avisos.join('; '),
    }));
    const abas = [];
    if (linhas.length) abas.push({ nome: 'MATERIAIS', colunas: Object.keys(linhas[0]), linhas,
      larguras: { 'DESCRIÇÃO': 45, 'MARCA/MODELO': 30, 'ACHADO POR': 30, ONDE: 90 } });
    abas.push({ nome: 'DOCUMENTOS', colunas: ['ARQUIVO', 'PÁGINAS', 'PÁGINAS SEM TEXTO', 'MATERIAIS ACHADOS', 'AVISO'], linhas: abaDocs,
      larguras: { ARQUIVO: 60, 'PÁGINAS SEM TEXTO': 30, AVISO: 50 }, numeros: ['PÁGINAS', 'MATERIAIS ACHADOS'] });

    const pmibsCom = a => linhas.filter(l => l.ACHADO === a).map(l => l.PMIB);
    const naoAchados = pmibsCom('NÃO'), semChave = pmibsCom('SEM CHAVE');
    const comAviso = docs.filter(d => d.avisos.length).map(d => d.arquivo);
    const ignorados = e.ignorados || [];
    const resumo = {
      sistema, arquivo: `CONFERÊNCIA MATERIAIS - ${sistema}.xlsx`, materiais: linhas.length, achados: pmibsCom('SIM').length,
      naoAchados, semChave: semChave.length, documentos: docs.length,
      paginas: docs.reduce((s, d) => s + d.paginas, 0), semTexto: docs.reduce((s, d) => s + d.semTexto.length, 0),
      comAviso: comAviso.length,
    };
    const partes = [linhas.length
      ? `${resumo.achados} de ${resumo.materiais} materiais achados nos documentos`
      : 'O Status PMIB não tem materiais válidos (confira a aba Lista de Materiais e a coluna CÓDIGO PMIB)'];
    partes.push(`${resumo.documentos} documentos, ${resumo.paginas} páginas (${resumo.semTexto} sem texto)`);
    if (naoAchados.length) partes.push(`Não achados (${naoAchados.length}): ${lista(naoAchados)}`);
    if (semChave.length) partes.push(`Sem código no Status para procurar (${semChave.length}): ${lista(semChave)}`);
    if (comAviso.length) partes.push(`Documentos com aviso (${comAviso.length}): ${lista(comAviso)}`);
    if (ignorados.length) partes.push(`Arquivos ignorados (não são PDF): ${lista(ignorados)}`);
    resumo.mensagem = partes.join(' · ');
    return { abas, resumo };
  }

  return { confereDocumento, montaConferencia };
})();
if (typeof module !== 'undefined') module.exports = CONFERENCIA;

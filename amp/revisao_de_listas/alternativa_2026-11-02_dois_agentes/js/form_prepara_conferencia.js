// ── Prepara a conferência (workflow com formulário): lê o JSON do Revisor e monta a mensagem do Conferente ──
// Se o Revisor falhou ou não devolveu o JSON, a execução para aqui, com o motivo.
const pedido = $('Monta o pedido').first().json;
const saida = saidaDoAgente($input.first().json);
if (saida.erro) throw new Error(`o agente Revisor de Listas falhou: ${saida.erro}`);
const lido = extrairJson(saida.texto);
if (!lido) {
  throw new Error('o Revisor de Listas não devolveu o JSON combinado: veja a saída do nó "Revisor de Listas" e confira '
    + 'se o system prompt do agente foi colado inteiro');
}
const revisor = normalizarRevisor(lido);
return [{ json: { chatInput: mensagemDoConferente(pedido.documentos, revisor),
  sessionId: `sigft-conferente-${$execution.id}`, revisor } }];

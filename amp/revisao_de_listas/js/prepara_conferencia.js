// ── Prepara a conferência: os mesmos conteúdos do Revisor e, no fim, o resultado dele ──
// O resultado vai já normalizado (ids M1..., A1...), o mesmo que o "Monta o resultado" vai usar.
const pedido = $('Monta o pedido').first().json;
const revisor = $input.first().json.revisor;
return [{ json: { chatInput: mensagemDoConferente(pedido.documentos, revisor),
  sessionId: `sigft-conferente-${$execution.id}`, revisor } }];

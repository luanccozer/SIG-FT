// ── Monta o pedido: a mensagem do Revisor de Listas (ou a do eco) a partir do que o SIG-FT mandou ──
const corpo = $input.first().json.body || {};
const execucao = String($execution.id);

if (corpo.modo === 'eco') {
  const codigos = (corpo.codigos || []).map(String);
  const chatInput = 'MODO ECO\nRepita exatamente, um por linha e na mesma ordem, os códigos abaixo. '
    + 'Não comente, não corrija e não acrescente nada.\n\n' + codigos.join('\n');
  return [{ json: { modo: 'eco', chatInput, sessionId: `sigft-eco-${execucao}` } }];
}

const { documentos, chatInput } = mensagemDoRevisor(corpo);
return [{ json: { modo: 'revisar', chatInput, sessionId: `sigft-revisor-${execucao}`, documentos, corpo } }];

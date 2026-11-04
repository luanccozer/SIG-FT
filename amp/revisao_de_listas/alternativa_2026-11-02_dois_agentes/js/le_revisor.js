// ── Lê o Revisor: o eco volta direto; a revisão segue para a conferência; a falha vira erro 502 ──
// O erro nunca repete a resposta do agente: ela pode trazer texto do documento, e o erro vai para o
// diagnóstico do SIG-FT.
const pedido = $('Monta o pedido').first().json;
const execucao = String($execution.id);
const saida = saidaDoAgente($input.first().json);
const falha = erro => [{ json: { rota: 'erro', resposta: {
  ok: false, modo: pedido.modo, etapa: 'revisor', erro, versao_workflow: VERSAO_WORKFLOW, execucao } } }];

if (saida.erro) return falha(`o agente Revisor de Listas falhou: ${saida.erro}`);
if (pedido.modo === 'eco') {
  return [{ json: { rota: 'ok', resposta: {
    ok: true, modo: 'eco', texto: saida.texto, versao_workflow: VERSAO_WORKFLOW, execucao } } }];
}
const revisor = extrairJson(saida.texto);
if (!revisor) return falha(`o Revisor de Listas não devolveu o JSON combinado (${saida.texto.length} caracteres)`);
return [{ json: { rota: 'conferir', revisor: normalizarRevisor(revisor) } }];

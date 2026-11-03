"""Gera o workflow do n8n da revisão das listas a partir do código dos nós em `js/`.

    python amp/revisao_de_listas/gerar_workflow.py

Grava, ao lado:
- `workflow_revisao_de_listas.json`, o workflow ligado ao SIG-FT por webhook, para importar no n8n da GE;
- `nos_para_colar/`, o código dos três nós de código do workflow montado à mão, com formulário
  (`passo_a_passo_workflow_n8n.md`).

Cada nó de código recebe a versão, o `js/comum.js` e o arquivo do próprio nó.
`tests/test_amp_workflow.py` trava que o que está versionado é o que este gerador produz e roda o
código dos nós no Node.

Os dois agentes (Revisor de Listas e Conferente de Listas) são criados no AMP com os system prompts
de `agentes/`. O `.json` só aponta para eles pelo nome: a credencial do AMP e a escolha do agente
são feitas à mão no n8n, como diz a nota do canvas. Os ids são fixos para o arquivo só mudar quando
o conteúdo muda. Desenho: `docs/superpowers/specs/2026-11-02-amp-agentes-revisao-design.md`.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

PASTA = Path(__file__).resolve().parent
ARQUIVO = PASTA / "workflow_revisao_de_listas.json"
PASTA_PARA_COLAR = PASTA / "nos_para_colar"
VERSAO_WORKFLOW = "2026-11-02"
CAMINHO_WEBHOOK = "sigft-revisao-listas"

WEBHOOK = "Webhook do SIG-FT"
MONTA = "Monta o pedido"
REVISOR = "Revisor de Listas"
LE = "Lê o Revisor"
VAI = "Vai à conferência?"
ESPERA = "Espera 10 s"
PREPARA = "Prepara a conferência"
CONFERENTE = "Conferente de Listas"
RESULTADO = "Monta o resultado"
DEU_CERTO = "Deu certo?"

# O valor que o nó do AMP guarda quando se escolhe o agente na lista. O modelo é o do agente criado no
# AMP; se o nome ou o modelo não baterem, basta escolher o agente de novo no nó.
AGENTES = {
    REVISOR: "bedrock-claude-sonnet-5.5",
    CONFERENTE: "gemini-3.5-flash-lite",
}

NOTA = """## Para ligar (uma vez)
1. **Agentes:** crie no AMP o **Revisor de Listas** e o **Conferente de Listas**, com os system prompts de `amp/revisao_de_listas/agentes/` (o LEIA-ME tem o modelo de cada um).
2. **Credencial do webhook:** no nó **Webhook do SIG-FT**, crie uma *Header Auth* com o nome `X-SIGFT-Chave` e um valor longo e aleatório. O mesmo valor vai no SIG-FT: Configuração → Chaves de API → "AMP Webhook (chave)".
3. **Nós dos agentes:** abra **Revisor de Listas** e **Conferente de Listas**; em cada um, escolha a credencial do AMP e o agente de mesmo nome na lista.
4. **Salve e publique** o workflow. Copie a **Production URL** do webhook para o SIG-FT: "AMP Webhook (URL)".
5. No SIG-FT, PMIB Manager, aba Revisão no AMP: **Testar conexão com o AMP**. O ping e o eco devem passar.

Ver `amp/revisao_de_listas/LEIA-ME.md` no repositório do SIG-FT."""


# O workflow montado à mão: o arquivo que vai em cada nó de código, o nó e o código de origem.
NOS_PARA_COLAR = (
    ("1_monta_o_pedido.js", MONTA, "form_monta_pedido.js"),
    ("2_prepara_a_conferencia.js", PREPARA, "form_prepara_conferencia.js"),
    ("3_monta_o_resultado.js", RESULTADO, "monta_resultado.js"),
)


def _codigo(arquivo: str, versao: str, cabecalho: str = "") -> str:
    """O jsCode de um nó: a versão, as funções comuns e o código do nó."""
    comum = (PASTA / "js" / "comum.js").read_text(encoding="utf-8").strip()
    proprio = (PASTA / "js" / arquivo).read_text(encoding="utf-8").strip()
    cabecalho = cabecalho or f"// Gerado por amp/revisao_de_listas/gerar_workflow.py a partir de js/{arquivo}. Nao edite aqui.\n"
    return f"{cabecalho}const VERSAO_WORKFLOW = {json.dumps(versao)};\n\n{comum}\n\n{proprio}\n"


def nos_para_colar(versao: str) -> dict[str, str]:
    """O código de cada nó de código do workflow montado à mão, pronto para colar no n8n."""
    return {destino: _codigo(origem, versao,
                             f'// Cole todo este conteúdo no nó de código "{no}" (JavaScript) do workflow montado à mão:\n'
                             "// amp/revisao_de_listas/passo_a_passo_workflow_n8n.md. Gerado por gerar_workflow.py a partir\n"
                             f"// de js/{origem}; para mudar, mude o js/ e rode o gerador.\n")
            for destino, no, origem in NOS_PARA_COLAR}


def _no_de_codigo(nome: str, id_: str, arquivo: str, versao: str, posicao: list[int]) -> dict:
    return {"parameters": {"jsCode": _codigo(arquivo, versao)}, "id": id_, "name": nome,
            "type": "n8n-nodes-base.code", "typeVersion": 2, "position": posicao}


def _agente(nome: str, id_: str, posicao: list[int]) -> dict:
    """O nó do AMP lê a mensagem de `chatInput` e devolve a resposta em `output`. Com
    "continuar na saída normal", a falha (depois das 3 tentativas) chega ao nó seguinte em `error`."""
    valor = json.dumps({"agentName": nome, "model": AGENTES[nome]}, ensure_ascii=False, separators=(",", ":"))
    return {
        "parameters": {"agentId": {"__rl": True, "value": valor, "mode": "list", "cachedResultName": nome},
                       "sessionId": "={{ $json.sessionId }}", "options": {}},
        "id": id_, "name": nome, "type": "CUSTOM.amp", "typeVersion": 1, "position": posicao,
        "retryOnFail": True, "maxTries": 3, "waitBetweenTries": 5000, "onError": "continueRegularOutput",
    }


def _se(nome: str, id_: str, id_condicao: str, valor: str, posicao: list[int]) -> dict:
    """If v2: `$json.rota` igual a `valor` sai pela saída 0 (verdadeiro)."""
    return {
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
                "conditions": [{"id": id_condicao, "leftValue": "={{ $json.rota }}", "rightValue": valor,
                                "operator": {"type": "string", "operation": "equals"}}],
                "combinator": "and",
            },
            "options": {},
        },
        "id": id_, "name": nome, "type": "n8n-nodes-base.if", "typeVersion": 2, "position": posicao,
    }


def _responde(nome: str, id_: str, corpo: str, posicao: list[int], codigo: int = 200) -> dict:
    return {
        "parameters": {"respondWith": "json", "responseBody": corpo, "options": {"responseCode": codigo}},
        "id": id_, "name": nome, "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1,
        "position": posicao,
    }


def _liga(*destinos: str) -> dict:
    return {"main": [[{"node": d, "type": "main", "index": 0}] if d else [] for d in destinos]}


def montar_workflow(versao: str) -> dict:
    """O workflow pronto para importar: webhook → ping, ou pedido → Revisor → conferência → resultado."""
    versao_js = json.dumps(versao)
    nos = [
        {
            "parameters": {"httpMethod": "POST", "path": CAMINHO_WEBHOOK, "authentication": "headerAuth",
                           "responseMode": "responseNode", "options": {}},
            "id": "6f2b1d0e-1c43-4a7e-9a51-1b0c2f6a7e01", "name": WEBHOOK,
            "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0, 300],
            "webhookId": "9b6f3e2a-5d71-4c0b-8f12-3a9d4e6b7c02",
        },
        {
            "parameters": {
                "conditions": {
                    "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
                    "conditions": [{"id": "1d9c7b4e-2f60-4e8a-b3c5-6a7d8e9f0a03",
                                    "leftValue": "={{ $json.body.modo }}", "rightValue": "ping",
                                    "operator": {"type": "string", "operation": "equals"}}],
                    "combinator": "and",
                },
                "options": {},
            },
            "id": "2e8a6c5d-3b74-4f9b-a4d6-7b8e9f0a1b04", "name": "É ping?",
            "type": "n8n-nodes-base.if", "typeVersion": 2, "position": [220, 300],
        },
        _responde("Responde ping", "3f9b7d6e-4c85-4a0c-b5e7-8c9f0a1b2c05",
                  "={{ JSON.stringify({ ok: true, modo: 'ping', versao_workflow: %s, execucao: $execution.id }) }}"
                  % versao_js, [440, 140]),
        _no_de_codigo(MONTA, "4a0c8e7f-5d96-4b1d-86f8-9d0a1b2c3d06", "monta_pedido.js", versao, [440, 420]),
        _agente(REVISOR, "5b1d9f8a-6ea7-4c2e-97a9-ae1b2c3d4e07", [660, 420]),
        _no_de_codigo(LE, "a1c3e5f7-0b2d-4f61-8a3c-5e7f9b1d3f12", "le_revisor.js", versao, [880, 420]),
        _se(VAI, "b2d4f6a8-1c3e-4a72-9b4d-6f8a0c2e4a13", "c3e5a7b9-2d4f-4b83-8c5e-7a9b1d3f5b14", "conferir",
            [1100, 420]),
        {
            "parameters": {"amount": 10, "unit": "seconds"},
            "id": "d4f6b8c0-3e5a-4c94-9d6f-8b0c2e4a6c15", "name": ESPERA,
            "type": "n8n-nodes-base.wait", "typeVersion": 1.1, "position": [1320, 300],
            "webhookId": "e5a7c9d1-4f6b-4da5-8e7a-9c1d3f5b7d16",
        },
        _no_de_codigo(PREPARA, "f6b8d0e2-5a7c-4eb6-9f8b-0d2e4a6c8e17", "prepara_conferencia.js", versao, [1540, 300]),
        _agente(CONFERENTE, "07c9e1f3-6b8d-4fc7-8a9c-1e3f5b7d9f18", [1760, 300]),
        _no_de_codigo(RESULTADO, "18d0f2a4-7c9e-40d8-9bad-2f4a6c8e0a19", "monta_resultado.js", versao, [1980, 300]),
        _se(DEU_CERTO, "29e1a3b5-8d0f-41e9-8cbe-3a5b7d9f1b20", "3af2b4c6-9e1a-42fa-9dcf-4b6c8e0a2c21", "ok",
            [2200, 420]),
        _responde("Responde", "7d3fb0ac-80c9-4e40-b9cb-c03d4e5f6a09", "={{ JSON.stringify($json.resposta) }}",
                  [2420, 340]),
        _responde("Responde erro", "8e40c1bd-91da-4f51-8adc-d14e5f6a7b10", "={{ JSON.stringify($json.resposta) }}",
                  [2420, 520], codigo=502),
        {
            "parameters": {"content": NOTA, "height": 380, "width": 620},
            "id": "9f51d2ce-a2eb-4062-9bed-e25f6a7b8c11", "name": "Como ligar",
            "type": "n8n-nodes-base.stickyNote", "typeVersion": 1, "position": [0, -160],
        },
    ]
    conexoes = {
        WEBHOOK: _liga("É ping?"),
        "É ping?": _liga("Responde ping", MONTA),
        MONTA: _liga(REVISOR),
        REVISOR: _liga(LE),
        LE: _liga(VAI),
        VAI: _liga(ESPERA, DEU_CERTO),
        ESPERA: _liga(PREPARA),
        PREPARA: _liga(CONFERENTE),
        CONFERENTE: _liga(RESULTADO),
        RESULTADO: _liga(DEU_CERTO),
        DEU_CERTO: _liga("Responde", "Responde erro"),
    }
    return {"name": "SIG-FT · Revisão das listas (AMP)", "nodes": nos, "connections": conexoes,
            "settings": {"executionOrder": "v1", "saveManualExecutions": True, "saveDataSuccessExecution": "all",
                         "saveDataErrorExecution": "all"}}


def main(argv: list[str] | None = None) -> int:
    ARQUIVO.write_text(json.dumps(montar_workflow(VERSAO_WORKFLOW), indent=2, ensure_ascii=False) + "\n",
                       encoding="utf-8")
    print(f"Gravado: {ARQUIVO}")
    PASTA_PARA_COLAR.mkdir(exist_ok=True)
    for nome, codigo in nos_para_colar(VERSAO_WORKFLOW).items():
        (PASTA_PARA_COLAR / nome).write_text(codigo, encoding="utf-8", newline="\n")
        print(f"Gravado: {PASTA_PARA_COLAR / nome}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

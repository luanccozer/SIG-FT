"""Gera o workflow do n8n da Aplicação LMR.

    python amp/aplicacao_lmr/gerar_workflow.py

Grava `workflow_aplicacao_lmr.json` ao lado, para importar (ou colar) no n8n da GE. O SIG-FT manda um POST
multipart (campos `modo`, `escopo`, `subsistema`, `trechos`, `lotes`; arquivos `indice`, `status_pmib` e
`lote_01`…`lote_NN`); o workflow percorre os lotes um a um, chama o agente "Spare Parts LMR Extractor" e
devolve um CSV só. As regras de domínio moram no agente (`agente.md` é a cópia). `tests/test_amp_workflow_
aplicacao_lmr.py` trava que o `.json` versionado é o que este gerador produz. Os ids são derivados do nome
do nó, para o arquivo só mudar quando o conteúdo muda. Desenho: `docs/superpowers/specs/2026-11-11-gerar-
aplicacao-lmr-design.md`, §4.1.

`juntar_respostas` é a versão em Python do nó "Junta o CSV" (`JS_JUNTA`): o teste roda as duas.
"""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

PASTA = Path(__file__).resolve().parent
ARQUIVO = PASTA / "workflow_aplicacao_lmr.json"
VERSAO_WORKFLOW = "2026-11-11"
CAMINHO_WEBHOOK = "sigft-aplicacao-lmr"
NOME_DO_AGENTE = "Spare Parts LMR Extractor"
MODELO_DO_AGENTE = "bedrock-claude-sonnet-5.5"
CREDENCIAL_DO_AMP = {"id": "2GcgH0WxCkNN6bg4", "name": "AMP account 1859"}
CABECALHO_CSV = ("FICHA_PMIB;AREA_PAINEL;RDS_PP;TAG;TAG_COM_RDS_PP;PAIS;LOCAL;ELEVACAO;EIXO;TRECHOS;"
                 "QTD_POR_TRECHO;DOCUMENTO;PAGINA")
TENTATIVAS = 3
ESPERA_SEGUNDOS = 60

WEBHOOK = "Webhook do SIG-FT"
E_PING = "É ping?"
PASSA = "Passa os arquivos"
CHEGARAM = "Chegaram os arquivos?"
SEPARA = "Separa os arquivos"
LE_TEXTO = "Lê o texto"
MONTA = "Monta a mensagem"
LACO = "Um lote por volta"
MARCA = "Marca a tentativa"
AGENTE = "AMP Agent"
GUARDA = "Guarda o lote"
PODE = "Pode tentar de novo?"
ESPERA = "Espera 60 s"
GUARDA_ERRO = "Guarda o lote com erro"
JUNTA = "Junta o CSV"

NOTA = """## SIG-FT · Aplicação LMR (AMP)
**Ligar (uma vez):**
1. **Webhook do SIG-FT** → *Credential for Header Auth* → *Create new*: Name `X-SIGFT-Chave`, Value um valor longo e aleatório. O mesmo valor vai no SIG-FT (Gerar Aplicação LMR → aba Análise no AMP).
2. **AMP Agent** → escolha o agente *Spare Parts LMR Extractor* → *Add option* → **Timeout**: o máximo.
3. Ative *Save manual executions*, salve e **publique**. Copie a **Production URL** do webhook para o SIG-FT.

O SIG-FT manda `modo`, `escopo`, `subsistema`, `trechos`, `lotes` e os arquivos `indice`, `status_pmib`, `lote_01`…`lote_NN`. O ping responde sem chamar o agente.
Cada lote é uma volta: o agente é chamado com sessão nova; se falhar, espera 60 s e tenta de novo (até 3 vezes). Lote que falha nas 3 entra em `lotes_com_erro`.
As regras de domínio moram no agente: melhore o agente no AMP, não aqui."""

# O prompt do agente já tem as regras; aqui vão só o formato, o pedido, o índice, o catálogo e o lote.
JS_MONTA = r"""// Uma mensagem por lote: regras de formato, pedido, indice, catalogo e o texto do lote.
const CAB = '__CABECALHO__';
const pedido = $('__WEBHOOK__').first().json.body || {};
const textos = $input.all().map(i => String(i.json.data ?? ''));
const [indice, catalogo, ...lotes] = textos;
return lotes.map((lote, i) => ({ json: { numero: i + 1, total: lotes.length, chatInput: [
  'Responda SOMENTE com o CSV (cabecalho e linhas), separador ";", sem texto antes ou depois.',
  'Cabecalho: ' + CAB,
  '',
  '## PEDIDO',
  'Escopo: ' + (pedido.escopo || '') + ' | Subsistema: ' + (pedido.subsistema || '') + ' | Trechos: ' + (pedido.trechos || ''),
  '',
  '## ÍNDICE DOS DOCUMENTOS',
  indice,
  '',
  '## CATÁLOGO DE MATERIAIS (_STATUS_PMIB)',
  catalogo,
  '',
  '## LOTE ' + (i + 1) + ' DE ' + lotes.length,
  lote,
].join('\n') } }));
"""

JS_SEPARA = r"""// Um item por arquivo de texto, na ordem: indice, status_pmib, lote_01…lote_NN.
const entrada = $input.first();
const b = entrada.binary || {};
const n = Number(entrada.json.lotes);
const chaves = ['indice', 'status_pmib'];
for (let i = 1; i <= n; i++) chaves.push('lote_' + String(i).padStart(2, '0'));
return chaves.map(k => ({ json: { arquivo: k }, binary: { data: b[k] } }));
"""

# O nó guarda só o texto de cada lote (um item por lote): o Code do AMP trava com milhares de itens.
JS_JUNTA = r"""// Junta as respostas dos lotes: um cabecalho so; lote com erro ou vazio vai em lotes_com_erro.
const CAB = '__CABECALHO__';
const ehCab = x => x.trim().toUpperCase().startsWith('FICHA_PMIB');
const itens = $input.all().map(i => i.json).sort((a, b) => a.numero - b.numero);
const linhas = [];
const comErro = [];
for (const it of itens) {
  const bruto = String(it.csv ?? '').replace(/^﻿/, '');
  if (it.erro || !bruto.trim()) { comErro.push(it.numero); continue; }
  let l = bruto.split(/\r?\n/).map(x => x.trimEnd()).filter(x => x.trim() && !x.trim().startsWith('```'));
  const h = l.findIndex(ehCab);
  if (h >= 0) l = l.slice(h + 1);
  for (const x of l) if (!ehCab(x)) linhas.push(x);
}
const ok = itens.length > 0 && comErro.length < itens.length;
const resposta = { ok, modo: 'aplicacao_lmr', csv: [CAB, ...linhas].join('\n') + '\n', lotes_recebidos: itens.length,
  lotes_com_erro: comErro, execucao: $execution.id, versao_workflow: '__VERSAO__' };
if (!ok) { resposta.etapa = 'agente'; resposta.erro = 'nenhum lote foi lido pelo agente'; }
return [{ json: { resposta } }];
"""


def codigo_junta(versao: str = VERSAO_WORKFLOW) -> str:
    return JS_JUNTA.replace("__CABECALHO__", CABECALHO_CSV).replace("__VERSAO__", versao)


def _eh_cabecalho(linha: str) -> bool:
    return linha.strip().upper().startswith("FICHA_PMIB")


def juntar_respostas(itens: list[dict], execucao: str, versao: str = VERSAO_WORKFLOW) -> dict:
    """Espelho em Python do nó "Junta o CSV" (`JS_JUNTA`): `itens` são `{numero, csv, erro}` por lote."""
    itens = sorted(itens, key=lambda i: i["numero"])
    linhas: list[str] = []
    com_erro: list[int] = []
    for it in itens:
        bruto = str(it.get("csv") or "").lstrip("﻿")
        if it.get("erro") or not bruto.strip():
            com_erro.append(it["numero"])
            continue
        lote = [x.rstrip() for x in bruto.splitlines()]
        lote = [x for x in lote if x.strip() and not x.strip().startswith("```")]
        achado = next((i for i, x in enumerate(lote) if _eh_cabecalho(x)), -1)
        if achado >= 0:
            lote = lote[achado + 1:]
        linhas += [x for x in lote if not _eh_cabecalho(x)]
    ok = bool(itens) and len(com_erro) < len(itens)
    resposta = {"ok": ok, "modo": "aplicacao_lmr", "csv": "\n".join([CABECALHO_CSV, *linhas]) + "\n",
                "lotes_recebidos": len(itens), "lotes_com_erro": com_erro, "execucao": execucao,
                "versao_workflow": versao}
    if not ok:
        resposta["etapa"] = "agente"
        resposta["erro"] = "nenhum lote foi lido pelo agente"
    return resposta


def _id(nome: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "sigft/aplicacao_lmr/" + nome))


def _responde(nome: str, corpo: str, posicao: list[int], codigo: int | None = None) -> dict:
    return {"parameters": {"respondWith": "json", "responseBody": corpo,
                           "options": {"responseCode": codigo} if codigo else {}},
            "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": posicao, "id": _id(nome),
            "name": nome}


def _se(nome: str, esquerda: str, operador: dict, direita, posicao: list[int]) -> dict:
    return {"parameters": {"conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
                "conditions": [{"id": _id(nome + "/condicao"), "leftValue": esquerda, "rightValue": direita,
                                "operator": operador}],
                "combinator": "and"},
            "options": {"looseTypeValidation": True}},
            "type": "n8n-nodes-base.if", "typeVersion": 2, "position": posicao, "id": _id(nome), "name": nome}


def _define(nome: str, campos: list[tuple[str, str, str]], posicao: list[int], *, demais: bool = False) -> dict:
    atribuicoes = [{"id": _id(f"{nome}/{campo}"), "name": campo, "value": valor, "type": tipo}
                   for campo, valor, tipo in campos]
    return {"parameters": {"assignments": {"assignments": atribuicoes}, "includeOtherFields": demais,
                           "options": {}},
            "type": "n8n-nodes-base.set", "typeVersion": 3.4, "position": posicao, "id": _id(nome), "name": nome}


def _codigo(nome: str, js: str, posicao: list[int]) -> dict:
    return {"parameters": {"jsCode": js}, "type": "n8n-nodes-base.code", "typeVersion": 2, "position": posicao,
            "id": _id(nome), "name": nome}


def _liga(*destinos: str) -> dict:
    return {"main": [[{"node": d, "type": "main", "index": 0}] for d in destinos]}


# Todos os arquivos esperados chegaram? indice, status_pmib e lote_01…lote_NN (NN = campo `lotes`).
CONFERE_ARQUIVOS = ("={{ (() => { const b = Object.keys($binary || {}); const n = Number($json.body.lotes); "
                    "return n >= 1 && b.includes('indice') && b.includes('status_pmib') && "
                    "Array.from({ length: n }, (_, i) => 'lote_' + String(i + 1).padStart(2, '0'))"
                    ".every(k => b.includes(k)) ? 'sim' : 'nao'; })() }}")


def montar_workflow(versao: str) -> dict:
    """O workflow pronto para importar: webhook → ping, ou arquivos? → texto → laço (um lote por volta,
    agente com novas tentativas) → junta o CSV → responde. Linear: sem Merge."""
    v = f"'{versao}'"
    nos = [
        {"parameters": {"content": NOTA, "height": 330, "width": 640}, "type": "n8n-nodes-base.stickyNote",
         "typeVersion": 1, "position": [-40, -300], "id": _id("Como ligar"), "name": "Como ligar"},
        {"parameters": {"httpMethod": "POST", "path": CAMINHO_WEBHOOK, "authentication": "headerAuth",
                        "responseMode": "responseNode", "options": {}},
         "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0, 200], "id": _id(WEBHOOK),
         "name": WEBHOOK, "webhookId": _id(WEBHOOK + "/webhookId")},
        _se(E_PING, "={{ $json.body.modo }}", {"type": "string", "operation": "equals"}, "ping", [220, 200]),
        _responde("Responde ping",
                  "={{ JSON.stringify({ ok: true, modo: 'ping', versao_workflow: %s, execucao: $execution.id }) }}" % v,
                  [460, 40]),
        # Os arquivos só passam adiante por um Edit Fields com "Include Other Input Fields".
        _define(PASSA, [("lotes", "={{ Number($json.body.lotes) }}", "number")], [460, 300], demais=True),
        _se(CHEGARAM, CONFERE_ARQUIVOS, {"type": "string", "operation": "equals"}, "sim", [700, 300]),
        _responde("Responde sem arquivos",
                  "={{ JSON.stringify({ ok: false, modo: 'aplicacao_lmr', etapa: 'arquivos', erro: 'os arquivos não "
                  "chegaram ao workflow: faltam o índice, o catálogo ou algum lote (recebidos: ' + "
                  "Object.keys($binary || {}).length + ', lotes anunciados: ' + $json.body.lotes + ')', "
                  "versao_workflow: %s, execucao: $execution.id }) }}" % v, [700, 480], 400),
        _codigo(SEPARA, JS_SEPARA, [940, 200]),
        {"parameters": {"operation": "text", "binaryPropertyName": "data", "options": {}},
         "type": "n8n-nodes-base.extractFromFile", "typeVersion": 1, "position": [1160, 200], "id": _id(LE_TEXTO),
         "name": LE_TEXTO},
        _codigo(MONTA, JS_MONTA.replace("__CABECALHO__", CABECALHO_CSV).replace("__WEBHOOK__", WEBHOOK),
                [1380, 200]),
        {"parameters": {"batchSize": 1, "options": {}}, "type": "n8n-nodes-base.splitInBatches", "typeVersion": 3,
         "position": [1600, 200], "id": _id(LACO), "name": LACO},
        _define(MARCA, [("tentativa", "={{ ($json.tentativa ?? 0) + 1 }}", "number")], [1840, 300], demais=True),
        {"parameters": {"agentId": {"__rl": True,
                                    "value": json.dumps({"agentName": NOME_DO_AGENTE, "model": MODELO_DO_AGENTE},
                                                        separators=(",", ":")),
                                    "mode": "list", "cachedResultName": NOME_DO_AGENTE},
                        "sessionId": "={{ 'lmr-' + $execution.id + '-' + $json.numero + '-' + $json.tentativa }}",
                        "options": {}},
         "type": "CUSTOM.amp", "typeVersion": 1, "position": [2080, 300], "id": _id(AGENTE), "name": AGENTE,
         "credentials": {"ampOAuth2Api": dict(CREDENCIAL_DO_AMP)}, "onError": "continueErrorOutput"},
        _define(GUARDA, [("numero", f"={{{{ $('{MARCA}').first().json.numero }}}}", "number"),
                         ("csv", "={{ $json.output }}", "string"), ("erro", "", "string")], [2340, 220]),
        _se(PODE, f"={{{{ $json.tentativa ?? $('{MARCA}').first().json.tentativa }}}}",
            {"type": "number", "operation": "lt"}, TENTATIVAS, [2340, 420]),
        {"parameters": {"resume": "timeInterval", "amount": ESPERA_SEGUNDOS, "unit": "seconds"},
         "type": "n8n-nodes-base.wait", "typeVersion": 1.1, "position": [2580, 380], "id": _id(ESPERA),
         "name": ESPERA, "webhookId": _id(ESPERA + "/webhookId")},
        _define(GUARDA_ERRO,
                [("numero", f"={{{{ $('{MARCA}').first().json.numero }}}}", "number"), ("csv", "", "string"),
                 ("erro", "={{ String(($json.error && ($json.error.message || $json.error)) || 'erro sem mensagem') }}",
                  "string")], [2580, 520]),
        _codigo(JUNTA, codigo_junta(versao), [1840, 100]),
        _responde("Responde", "={{ JSON.stringify($json.resposta) }}", [2080, 100]),
    ]
    conexoes = {
        WEBHOOK: _liga(E_PING),
        E_PING: _liga("Responde ping", PASSA),
        PASSA: _liga(CHEGARAM),
        CHEGARAM: _liga(SEPARA, "Responde sem arquivos"),
        SEPARA: _liga(LE_TEXTO),
        LE_TEXTO: _liga(MONTA),
        MONTA: _liga(LACO),
        LACO: _liga(JUNTA, MARCA),
        MARCA: _liga(AGENTE),
        AGENTE: _liga(GUARDA, PODE),
        GUARDA: _liga(LACO),
        PODE: _liga(ESPERA, GUARDA_ERRO),
        ESPERA: _liga(MARCA),
        GUARDA_ERRO: _liga(LACO),
        JUNTA: _liga("Responde"),
    }
    return {"name": "SIG-FT · Aplicação LMR (AMP)", "nodes": nos, "connections": conexoes,
            "settings": {"executionOrder": "v1", "saveManualExecutions": True}}


def main(argv: list[str] | None = None) -> int:
    ARQUIVO.write_text(json.dumps(montar_workflow(VERSAO_WORKFLOW), indent=2, ensure_ascii=False) + "\n",
                       encoding="utf-8")
    print(f"Gravado: {ARQUIVO}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

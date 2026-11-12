"""O workflow do n8n da Aplicação LMR (`amp/aplicacao_lmr/`).

O `.json` que se importa no n8n da GE é gerado pelo `gerar_workflow.py`. Este teste trava que os dois
não se desencontram e que o contrato com o SIG-FT está lá: webhook com chave, ping sem o agente,
arquivos conferidos antes (400), laço de um lote por volta, novas tentativas e a resposta do contrato.
O nó que junta as respostas tem uma versão em Python (testável) e o JavaScript do nó; os dois rodam
os mesmos casos. Desenho: `docs/superpowers/specs/2026-11-11-gerar-aplicacao-lmr-design.md`, §4.1.
"""
from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent / "amp"
PASTA = RAIZ / "aplicacao_lmr"
CABECALHO = ("FICHA_PMIB;AREA_PAINEL;RDS_PP;TAG;TAG_COM_RDS_PP;PAIS;LOCAL;ELEVACAO;EIXO;TRECHOS;"
             "QTD_POR_TRECHO;DOCUMENTO;PAGINA")


def _gerador():
    spec = importlib.util.spec_from_file_location("gerar_workflow_lmr", PASTA / "gerar_workflow.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _workflow(caminho: Path = PASTA / "workflow_aplicacao_lmr.json"):
    return json.loads(caminho.read_text(encoding="utf-8"))


def _no(workflow, nome):
    return next(n for n in workflow["nodes"] if n["name"] == nome)


def _destinos(workflow, nome, saida=0):
    saidas = workflow["connections"].get(nome, {}).get("main", [])
    return [c["node"] for c in (saidas[saida] if len(saidas) > saida else [])]


def test_o_json_versionado_e_o_que_o_gerador_produz():
    gerador = _gerador()
    assert _workflow() == gerador.montar_workflow(gerador.VERSAO_WORKFLOW)
    assert gerador.VERSAO_WORKFLOW == "2026-11-11"


def test_ids_dos_nos_nao_se_repetem_nem_colidem_com_os_outros_workflows():
    ids = [n["id"] for n in _workflow()["nodes"]]
    assert len(ids) == len(set(ids))
    outros = {n["id"] for caminho in (RAIZ / "revisao_de_listas" / "workflow_revisao_de_listas.json",
                                      RAIZ / "criacao_status_pmib" / "workflow_criacao_status_pmib.json")
              for n in _workflow(caminho)["nodes"]}
    assert outros.isdisjoint(ids)
    nomes = [n["name"] for n in _workflow()["nodes"]]
    assert len(nomes) == len(set(nomes))


def test_webhook_com_header_auth_e_caminho_proprio():
    workflow = _workflow()
    p = _no(workflow, "Webhook do SIG-FT")["parameters"]
    assert (p["httpMethod"], p["path"], p["authentication"], p["responseMode"]) == (
        "POST", "sigft-aplicacao-lmr", "headerAuth", "responseNode")
    revisao = _workflow(RAIZ / "revisao_de_listas" / "workflow_revisao_de_listas.json")
    assert _no(workflow, "Webhook do SIG-FT")["webhookId"] != _no(revisao, "Webhook do SIG-FT")["webhookId"]


def _alcanca(workflow, origem):
    visto, pilha = set(), [origem]
    while pilha:
        no = pilha.pop()
        if no in visto:
            continue
        visto.add(no)
        for saida in workflow["connections"].get(no, {}).get("main", []):
            pilha += [c["node"] for c in saida]
    return visto


def test_ping_nao_passa_pelo_agente():
    workflow = _workflow()
    assert _destinos(workflow, "Webhook do SIG-FT") == ["É ping?"]
    assert _destinos(workflow, "É ping?", 0) == ["Responde ping"]
    assert "'ping'" in _no(workflow, "Responde ping")["parameters"]["responseBody"]
    assert "AMP Agent" not in _alcanca(workflow, "Responde ping")
    assert "AMP Agent" in _alcanca(workflow, _destinos(workflow, "É ping?", 1)[0])


def test_arquivos_conferidos_antes_do_agente_com_400_e_etapa_arquivos():
    workflow = _workflow()
    se = _no(workflow, "Chegaram os arquivos?")["parameters"]["conditions"]["conditions"][0]["leftValue"]
    assert "lote_" in se and "body.lotes" in se and "status_pmib" in se and "indice" in se
    erro = _no(workflow, "Responde sem arquivos")
    assert erro["parameters"]["options"]["responseCode"] == 400
    assert "etapa: 'arquivos'" in erro["parameters"]["responseBody"]
    assert _destinos(workflow, "Chegaram os arquivos?", 1) == ["Responde sem arquivos"]
    assert "AMP Agent" not in _alcanca(workflow, "Responde sem arquivos")


def test_fluxo_linear_um_lote_por_volta_e_agente_com_sessao_nova():
    workflow = _workflow()
    assert not [n for n in workflow["nodes"] if n["type"] == "n8n-nodes-base.merge"]
    laco = _no(workflow, "Um lote por volta")
    assert laco["type"] == "n8n-nodes-base.splitInBatches" and laco["parameters"]["batchSize"] == 1
    assert _destinos(workflow, "Um lote por volta", 0) == ["Junta o CSV"]
    assert _destinos(workflow, "Um lote por volta", 1) == ["Marca a tentativa"]
    assert _destinos(workflow, "Marca a tentativa") == ["AMP Agent"]
    assert "$execution.id" in _no(workflow, "AMP Agent")["parameters"]["sessionId"]
    assert "tentativa" in _no(workflow, "AMP Agent")["parameters"]["sessionId"]
    assert _destinos(workflow, "Guarda o lote") == ["Um lote por volta"]
    assert _destinos(workflow, "Guarda o lote com erro") == ["Um lote por volta"]


def test_novas_tentativas_esperam_60s_e_param_na_terceira():
    workflow = _workflow()
    agente = _no(workflow, "AMP Agent")
    assert agente["onError"] == "continueErrorOutput"
    assert agente["parameters"]["agentId"]["cachedResultName"] == "Spare Parts LMR Extractor"
    assert _destinos(workflow, "AMP Agent", 0) == ["Guarda o lote"]
    assert _destinos(workflow, "AMP Agent", 1) == ["Pode tentar de novo?"]
    assert _destinos(workflow, "Pode tentar de novo?", 0) == ["Espera 60 s"]
    assert _destinos(workflow, "Pode tentar de novo?", 1) == ["Guarda o lote com erro"]
    assert _destinos(workflow, "Espera 60 s") == ["Marca a tentativa"]
    espera = _no(workflow, "Espera 60 s")["parameters"]
    assert (espera["amount"], espera["unit"]) == (60, "seconds")
    cond = _no(workflow, "Pode tentar de novo?")["parameters"]["conditions"]["conditions"][0]
    assert (cond["rightValue"], cond["operator"]["operation"]) == (3, "lt")


def test_fim_do_fluxo_junta_e_responde_com_o_contrato():
    workflow = _workflow()
    assert _destinos(workflow, "Junta o CSV") == ["Responde"]
    junta = _no(workflow, "Junta o CSV")["parameters"]["jsCode"]
    for campo in ("ok", "modo: 'aplicacao_lmr'", "csv", "lotes_recebidos", "lotes_com_erro", "execucao",
                  "versao_workflow"):
        assert campo in junta
    assert "'2026-11-11'" in junta and CABECALHO in junta
    assert _no(workflow, "Responde")["parameters"]["responseBody"] == "={{ JSON.stringify($json.resposta) }}"


def test_a_mensagem_leva_regras_indice_catalogo_e_lote():
    codigo = _no(_workflow(), "Monta a mensagem")["parameters"]["jsCode"]
    assert CABECALHO in codigo
    assert "ÍNDICE" in codigo and "CATÁLOGO" in codigo and "chatInput" in codigo


def test_o_agente_se_chama_spare_parts_lmr_extractor():
    assert _gerador().NOME_DO_AGENTE == "Spare Parts LMR Extractor"


# --- simulação do nó que junta ---------------------------------------------------------------------

def _resposta_lote(*linhas, cercas=False, cabecalho=True):
    texto = "\n".join(([CABECALHO] if cabecalho else []) + list(linhas))
    return f"```csv\n{texto}\n```" if cercas else texto


def _itens():
    return [
        {"numero": 1, "csv": _resposta_lote("1;P1;;T-1;NAO;;;;;TODAS;2;DOC-A;3"), "erro": ""},
        {"numero": 2, "csv": "", "erro": "429 too many requests"},
        {"numero": 3, "csv": "Aqui está o resultado:\n" + _resposta_lote("2;P1;;T-2;NAO;;;;;60HZ;1;DOC-B;7",
                                                                       cercas=True), "erro": ""},
    ]


def test_junta_tres_lotes_um_com_erro_python():
    resposta = _gerador().juntar_respostas(_itens(), "99")
    linhas = resposta["csv"].splitlines()
    assert linhas[0] == CABECALHO
    assert sum(1 for linha in linhas if linha.startswith("FICHA_PMIB")) == 1
    assert linhas[1:] == ["1;P1;;T-1;NAO;;;;;TODAS;2;DOC-A;3", "2;P1;;T-2;NAO;;;;;60HZ;1;DOC-B;7"]
    assert resposta["ok"] is True and resposta["modo"] == "aplicacao_lmr"
    assert resposta["lotes_recebidos"] == 3 and resposta["lotes_com_erro"] == [2]
    assert resposta["execucao"] == "99" and resposta["versao_workflow"] == "2026-11-11"


def test_junta_tudo_com_erro_nao_e_ok():
    resposta = _gerador().juntar_respostas([{"numero": 1, "csv": "", "erro": "x"}], "7")
    assert resposta["ok"] is False and resposta["lotes_com_erro"] == [1] and resposta["erro"]


def test_junta_cabecalho_repetido_e_lote_so_com_cabecalho():
    itens = [{"numero": 2, "csv": CABECALHO + "\n", "erro": ""},
             {"numero": 1, "csv": _resposta_lote("a;b") + "\n" + CABECALHO + "\nc;d", "erro": ""}]
    resposta = _gerador().juntar_respostas(itens, "1")
    assert resposta["csv"].splitlines() == [CABECALHO, "a;b", "c;d"]
    assert resposta["lotes_com_erro"] == []


@pytest.mark.skipif(shutil.which("node") is None, reason="sem node")
def test_o_javascript_do_no_faz_o_mesmo_que_o_python():
    gerador = _gerador()
    casos = [_itens(), [{"numero": 1, "csv": "", "erro": "x"}],
             [{"numero": 2, "csv": CABECALHO + "\n", "erro": ""},
              {"numero": 1, "csv": _resposta_lote("a;b") + "\n" + CABECALHO + "\nc;d", "erro": ""}]]
    script = ("const itens = JSON.parse(require('fs').readFileSync(0, 'utf8'));\n"
              "const $input = { all: () => itens.map(json => ({ json })) };\n"
              "const $execution = { id: '99' };\n"
              "const r = (function () {\n" + gerador.codigo_junta() + "\n})();\n"
              "console.log(JSON.stringify(r[0].json.resposta));\n")
    for itens in casos:
        saida = subprocess.run(["node", "-e", script], input=json.dumps(itens), capture_output=True,
                               text=True, encoding="utf-8", check=True).stdout
        assert json.loads(saida) == gerador.juntar_respostas(itens, "99")


def test_o_codigo_do_no_que_junta_e_o_do_json():
    gerador = _gerador()
    assert _no(_workflow(), "Junta o CSV")["parameters"]["jsCode"] == gerador.codigo_junta()

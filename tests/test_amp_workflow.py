"""O workflow do n8n da revisão das listas (`amp/revisao_de_listas/`).

O `.json` que se importa no n8n da GE é gerado por `gerar_workflow.py` a partir dos nós de código em
`js/`. Os system prompts dos dois agentes do AMP ficam em `agentes/`: são colados no AMP e não vão no
`.json`. Este teste trava que o `.json` versionado é o que o gerador produz e que o contrato com o
SIG-FT continua lá. Com o Node instalado, ele também roda o código de cada nó contra uma lista
inventada. Desenho: `docs/superpowers/specs/2026-11-02-amp-agentes-revisao-design.md`.
"""
from __future__ import annotations

import copy
import html
import importlib.util
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

PASTA = Path(__file__).resolve().parent.parent / "amp" / "revisao_de_listas"
precisa_de_node = pytest.mark.skipif(shutil.which("node") is None, reason="sem Node: o código dos nós não roda aqui")

# O n8n entrega ao nó de código `$input`, `$('nó')` e `$execution`; o `return` do topo vale.
RODADOR = r"""
const fs = require('fs');
const [codigoArq, contextoArq] = process.argv.slice(2);
const codigo = fs.readFileSync(codigoArq, 'utf8');
const ctx = JSON.parse(fs.readFileSync(contextoArq, 'utf8'));
const itens = lista => ({ first: () => lista[0], all: () => lista });
const $input = itens(ctx.entrada);
const $ = nome => { if (!ctx.nos[nome]) throw new Error('nó sem dado no teste: ' + nome); return itens(ctx.nos[nome]); };
const $execution = { id: ctx.execucao };
process.stdout.write(JSON.stringify(new Function('$input', '$', '$execution', codigo)($input, $, $execution)));
"""

CABECALHO = ["ITEM", "QTD.", "UNID.", "DESCRIÇÃO", "CÓDIGO DO MATERIAL", "CÓDIGO CMI", "MARCA/MODELO",
             "CÓDIGO PMIB", "STATUS", "TIPO DE ENTREGA", "OBSERVAÇÕES"]
LINHAS = [
    ["1", "2", "PÇ", 'VÁLVULA ESFERA 1/2"', "VE-100", "", "ACME", "4500063671.0001", "APROVADO", "FÍSICA E DOCUMENTAL", ""],
    ["2", "1", "PÇ", "FILTRO DE ÓLEO", "FT-200", "", "FILTRA", "4500063671.0002", "EM ELABORAÇÃO", "FÍSICA E DOCUMENTAL",
     "ver <b>x</b>"],
    ["2.1", "4", "PÇ", "ELEMENTO FILTRANTE", "EF-210", "", "FILTRA", "4500063671.0003", "EM ELABORAÇÃO", "DOCUMENTAL", ""],
    ["3", "1", "PÇ", "SENSOR DE NÍVEL", "SN-300", "", "MEDE", "4500063671.0004", "APROVADO", "FÍSICA E DOCUMENTAL",
     "obs antiga"],
]
EM_USO = ("--- página 1 ---\nLISTA DE SOBRESSALENTES\n1 2 PÇ VÁLVULA ESFERA 1/2\" VE-100 ACME\n"
          "2 1 PÇ FILTRO DE ÓLEO FT-200 FILTRA\n3 1 PÇ SENSOR DE NÍVEL SN-300 MEDE")
ATUAL = ("--- página 1 ---\nLISTA DE SOBRESSALENTES\n1\n4\nPÇ\nVÁLVULA ESFERA 1/2\"\nVE-100\nACME\n"
         "2\n1\nPÇ\nFILTRO DE ÓLEO\nFT-200\nFILTRA\n"
         "--- página 2 ---\nLISTA DE SOBRESSALENTES\n4\n1\nPÇ\nMANÔMETRO 0-10 BAR\nMN-400\nWIKA")
CODIGO = "#ITA0=Y99XX001&BPB020"
CORPO = {
    "modo": "revisar",
    "lista": {"codigo": CODIGO, "revisao_em_uso": "0A", "revisao_atual": "0B", "status_real": "Aprovado",
              "status_da_revisao": "Aprovado", "categoria": "aprovada", "data_de_hoje": "02/11/2026"},
    "revisao_em_uso": {"arquivo": f"{CODIGO}[0A].pdf", "paginas": 1, "texto": EM_USO},
    "revisao_atual": {"arquivo": f"{CODIGO}[0B].pdf", "paginas": 2, "texto": ATUAL},
    "status_pmib": {"arquivo": f"{CODIGO}_STATUS_PMIB.xlsx", "aba": "Lista de Materiais",
                    "linha_de_revisao": "REVISÃO DA LISTA DE SOBRESSALENTES ATUAL EM USO: 0A - DATA DE ALTERAÇÃO: 01/09/2026",
                    "linhas": 4, "tsv": "\n".join("\t".join(linha) for linha in [CABECALHO, *LINHAS])},
    "origem": {"sigft": "1.3.2"},
}


def _acao(id_, acao, linha, valores, pagina, trecho, mudanca=None, inserir_apos=None):
    return {"id": id_, "acao": acao, "linha": linha, "inserir_apos": inserir_apos, "valores": valores, "pagina": pagina,
            "trecho": trecho, "motivo": "teste", "mudanca": mudanca, "a_conferir": False, "duvida": ""}


REVISOR = {
    "resumo": "A revisão 0B dobra a válvula, tira o sensor e acrescenta o manômetro.",
    "itens_revisao_em_uso": 3,
    "itens_revisao_atual": 3,
    "mudancas": [
        {"id": "M1", "tipo": "mudou", "item_em_uso": "1", "item_atual": "1", "descricao": 'VÁLVULA ESFERA 1/2"',
         "codigo_material": "VE-100", "campos": [{"campo": "QTD.", "antes": "2", "depois": "4"}], "pagina_em_uso": 1,
         "pagina_atual": 1, "trecho": 'VÁLVULA ESFERA 1/2"\nVE-100', "explicacao": "A quantidade dobrou.",
         "a_conferir": False, "duvida": ""},
        {"id": "M2", "tipo": "saiu", "item_em_uso": "3", "item_atual": None, "descricao": "SENSOR DE NÍVEL",
         "codigo_material": "SN-300", "campos": [], "pagina_em_uso": 1, "pagina_atual": None,
         "trecho": "3 1 PÇ SENSOR DE NÍVEL SN-300 MEDE", "explicacao": "Não está na 0B.", "a_conferir": False,
         "duvida": ""},
        {"id": "M3", "tipo": "entrou", "item_em_uso": None, "item_atual": "4", "descricao": "MANÔMETRO 0-10 BAR",
         "codigo_material": "MN-400", "campos": [], "pagina_em_uso": None, "pagina_atual": 2,
         "trecho": "MANÔMETRO 0-10 BAR\nMN-400", "explicacao": "Item novo.", "a_conferir": False, "duvida": ""},
    ],
    "acoes": [
        _acao("A1", "atualizar", 1, {"QTD.": "4"}, 1, 'VÁLVULA ESFERA 1/2"\nVE-100', "M1"),
        _acao("A2", "remover", 4, {}, 1, "3 1 PÇ SENSOR DE NÍVEL SN-300 MEDE", "M2"),
        _acao("A3", "inserir", None, {"ITEM": "4", "QTD.": "1", "UNID.": "PÇ", "DESCRIÇÃO": "MANÔMETRO 0-10 BAR",
                                      "CÓDIGO DO MATERIAL": "MN-400", "CÓDIGO CMI": "", "MARCA/MODELO": "WIKA"},
              2, "MANÔMETRO 0-10 BAR\nMN-400", "M3", inserir_apos=3),
        _acao("A4", "atualizar", 2, {"CÓDIGO PMIB": "999"}, 1, "FILTRO DE ÓLEO"),            # coluna da equipe
        _acao("A5", "atualizar", 2, {"DESCRIÇÃO": "FILTRO DE AR"}, 1, "FILTRO DE AR COMPRIMIDO"),  # trecho inventado
    ],
    "linhas_documentais_mantidas": [3],
    "observacoes": [],
}


def _confirmado(id_):
    return {"id": id_, "veredito": "confirmado", "motivo": "o documento sustenta", "pagina": 1, "trecho": "",
            "correcao": None}


CONFERENTE = {
    "vereditos": [_confirmado(i) for i in ("M1", "M2", "M3", "A1", "A2", "A3", "A4", "A5")],
    "faltou": [_acao("F1", "atualizar", 2, {"MARCA/MODELO": "FILTRA"}, 1, "FILTRA")],
    "itens_revisao_atual": 3,
    "observacoes": ["nada a acrescentar"],
}


def _gerador():
    spec = importlib.util.spec_from_file_location("gerar_workflow", PASTA / "gerar_workflow.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _workflow():
    return json.loads((PASTA / "workflow_revisao_de_listas.json").read_text(encoding="utf-8"))


def _nos(workflow, tipo):
    return [n for n in workflow["nodes"] if n["type"] == tipo]


def _no(workflow, nome):
    return next(n for n in workflow["nodes"] if n["name"] == nome)


def _destinos(workflow, nome, saida=0):
    saidas = workflow["connections"].get(nome, {}).get("main", [])
    return [c["node"] for c in (saidas[saida] if len(saidas) > saida else [])]


@pytest.fixture(scope="module")
def rodar(tmp_path_factory):
    pasta = tmp_path_factory.mktemp("nos_do_n8n")
    rodador = pasta / "rodador.js"
    rodador.write_text(RODADOR, encoding="utf-8")
    workflow = _workflow()

    def _rodar(nome, entrada, nos=None, *, js=None):
        """O nó `nome` do workflow do webhook, ou o código `js` (o de um nó para colar)."""
        codigo, contexto = pasta / f"{len(list(pasta.iterdir()))}.js", pasta / f"{len(list(pasta.iterdir()))}c.json"
        codigo.write_text(js if js is not None else _no(workflow, nome)["parameters"]["jsCode"], encoding="utf-8")
        contexto.write_text(json.dumps({"entrada": entrada, "nos": nos or {}, "execucao": "42"}, ensure_ascii=False),
                            encoding="utf-8")
        saida = subprocess.run(["node", str(rodador), str(codigo), str(contexto)], capture_output=True, text=True,
                               encoding="utf-8", check=False)
        assert saida.returncode == 0, saida.stderr
        return json.loads(saida.stdout)

    return _rodar


def _saida(dados):
    return f"Segue o resultado.\n```json\n{json.dumps(dados, ensure_ascii=False)}\n```\nQualquer dúvida, pergunte."


def _cadeia(rodar, *, corpo=CORPO, revisor=REVISOR, conferente=CONFERENTE, item_do_conferente=None):
    """Monta o pedido → Revisor (dublado) → Lê o Revisor → Prepara a conferência → Conferente (dublado) →
    Monta o resultado, como o n8n encadeia os nós."""
    webhook = [{"json": {"body": corpo}}]
    pedido = rodar("Monta o pedido", webhook)
    lido = rodar("Lê o Revisor", [{"json": {"sessionId": "s1", "output": _saida(revisor), "files": []}}],
                 {"Monta o pedido": pedido})
    assert lido[0]["json"]["rota"] == "conferir", lido
    preparo = rodar("Prepara a conferência", lido, {"Monta o pedido": pedido})
    item = item_do_conferente or {"json": {"sessionId": "s2", "output": json.dumps(conferente, ensure_ascii=False)}}
    [resultado] = rodar("Monta o resultado", [item],
                        {"Webhook do SIG-FT": webhook, "Monta o pedido": pedido, "Prepara a conferência": preparo})
    return resultado["json"]


def _area(pagina, id_):
    achado = re.search(rf'<textarea id="{id_}"[^>]*>(.*?)</textarea>', pagina, re.S)
    return html.unescape(achado.group(1)) if achado else None


def _dados(pagina):
    achado = re.search(r'<script type="application/json" id="sigft-revisao">(.*?)</script>', pagina, re.S)
    return json.loads(achado.group(1))


def _linhas_da_tabela(pagina):
    return [linha.split("\t") for linha in _area(pagina, "tsv-status").split("\n")]


# ── o arquivo e o contrato com o SIG-FT ─────────────────────────────────────────────────────────


def test_o_json_versionado_e_o_que_o_gerador_produz():
    gerador = _gerador()
    assert _workflow() == gerador.montar_workflow(gerador.VERSAO_WORKFLOW)


def test_webhook_com_header_auth_e_resposta_por_no():
    [webhook] = _nos(_workflow(), "n8n-nodes-base.webhook")
    p = webhook["parameters"]
    assert (p["httpMethod"], p["path"], p["authentication"], p["responseMode"]) == (
        "POST", "sigft-revisao-listas", "headerAuth", "responseNode")


def test_ping_nao_passa_pelos_agentes():
    workflow = _workflow()
    [destino] = _destinos(workflow, "É ping?", 0)
    assert _no(workflow, destino)["type"] == "n8n-nodes-base.respondToWebhook"


def test_os_dois_agentes_do_amp():
    nos = {n["name"]: n for n in _nos(_workflow(), "CUSTOM.amp")}
    assert set(nos) == {"Revisor de Listas", "Conferente de Listas"}
    for nome, no in nos.items():
        assert json.loads(no["parameters"]["agentId"]["value"])["agentName"] == nome
        assert no["parameters"]["sessionId"] == "={{ $json.sessionId }}"
        assert (no["retryOnFail"], no["maxTries"], no["onError"]) == (True, 3, "continueRegularOutput")
        assert "credentials" not in no   # a credencial do AMP é escolhida no n8n de quem importa


def test_o_caminho_da_revisao():
    w = _workflow()
    assert _destinos(w, "É ping?", 1) == ["Monta o pedido"]
    assert _destinos(w, "Monta o pedido") == ["Revisor de Listas"]
    assert _destinos(w, "Revisor de Listas") == ["Lê o Revisor"]
    assert _destinos(w, "Lê o Revisor") == ["Vai à conferência?"]
    assert _destinos(w, "Vai à conferência?", 0) == ["Espera 10 s"]
    assert _destinos(w, "Vai à conferência?", 1) == ["Deu certo?"]
    assert _destinos(w, "Espera 10 s") == ["Prepara a conferência"]
    assert _destinos(w, "Prepara a conferência") == ["Conferente de Listas"]
    assert _destinos(w, "Conferente de Listas") == ["Monta o resultado"]
    assert _destinos(w, "Monta o resultado") == ["Deu certo?"]
    assert _destinos(w, "Deu certo?", 0) == ["Responde"]
    assert _destinos(w, "Deu certo?", 1) == ["Responde erro"]
    assert _no(w, "Responde erro")["parameters"]["options"]["responseCode"] == 502


def test_a_espera_fica_na_memoria():
    # Acima de 65 s o n8n tira a execução da memória, e a resposta ao webhook se perde.
    [espera] = _nos(_workflow(), "n8n-nodes-base.wait")
    assert espera["parameters"]["unit"] == "seconds" and espera["parameters"]["amount"] < 65


def test_toda_conexao_aponta_para_no_que_existe():
    workflow = _workflow()
    nomes = {n["name"] for n in workflow["nodes"]}
    for origem, saidas in workflow["connections"].items():
        assert origem in nomes
        for saida in saidas["main"]:
            assert all(c["node"] in nomes for c in saida)


def test_cada_no_de_codigo_leva_o_comum_e_a_versao():
    gerador = _gerador()
    comum = (PASTA / "js" / "comum.js").read_text(encoding="utf-8").strip()
    for no in _nos(_workflow(), "n8n-nodes-base.code"):
        codigo = no["parameters"]["jsCode"]
        assert f"const VERSAO_WORKFLOW = {json.dumps(gerador.VERSAO_WORKFLOW)};" in codigo
        assert comum in codigo


def test_os_nos_para_colar_sao_os_que_o_gerador_produz():
    gerador = _gerador()
    produzidos = gerador.nos_para_colar(gerador.VERSAO_WORKFLOW)
    versionados = {p.name: p.read_text(encoding="utf-8") for p in (PASTA / "nos_para_colar").glob("*.js")}
    assert versionados == produzidos


def test_os_system_prompts_trazem_o_contrato_que_o_workflow_le():
    revisor = (PASTA / "agentes" / "revisor_de_listas.md").read_text(encoding="utf-8")
    conferente = (PASTA / "agentes" / "conferente_de_listas.md").read_text(encoding="utf-8")
    for termo in ('"mudancas"', '"acoes"', '"linha"', '"inserir_apos"', '"valores"', '"pagina"', '"trecho"',
                  '"a_conferir"', "MODO ECO", "LINHA", "SEM_LISTA_STATUS_PMIB", "DOCUMENTAL", "DUPLICADO"):
        assert termo in revisor
    for termo in ('"vereditos"', '"faltou"', '"correcao"', '"confirmado"', '"corrigido"', '"rejeitado"',
                  '"a_conferir"', "LINHA"):
        assert termo in conferente


# ── o código dos nós, rodado no Node ────────────────────────────────────────────────────────────


@precisa_de_node
def test_o_pedido_numera_as_linhas_e_leva_os_tres_conteudos(rodar):
    [item] = rodar("Monta o pedido", [{"json": {"body": CORPO}}])
    j = item["json"]
    assert (j["modo"], j["sessionId"]) == ("revisar", "sigft-revisor-42")
    for trecho in ("## LISTA", "Data de hoje: 02/11/2026", "## REVISÃO EM USO", "## REVISÃO ATUAL", "--- página 2 ---",
                   "## _STATUS_PMIB", "LINHA\tITEM\tQTD.", "4\t3\t1\tPÇ\tSENSOR DE NÍVEL"):
        assert trecho in j["chatInput"]
    assert j["documentos"] in j["chatInput"]


@precisa_de_node
def test_sem_revisao_em_uso_o_pedido_diz_que_nao_ha(rodar):
    corpo = {**CORPO, "revisao_em_uso": None, "lista": {**CORPO["lista"], "revisao_em_uso": ""}}
    [item] = rodar("Monta o pedido", [{"json": {"body": corpo}}])
    assert "a lista ainda não tem revisão em uso" in item["json"]["chatInput"]


@precisa_de_node
def test_o_eco_vai_ao_revisor_e_volta_o_texto(rodar):
    [pedido] = rodar("Monta o pedido", [{"json": {"body": {"modo": "eco", "codigos": [CODIGO, "VE-100"]}}}])
    assert pedido["json"]["chatInput"].startswith("MODO ECO") and "VE-100" in pedido["json"]["chatInput"]
    [lido] = rodar("Lê o Revisor", [{"json": {"output": f"{CODIGO}\nVE-100"}}], {"Monta o pedido": [pedido]})
    assert lido["json"]["rota"] == "ok"
    assert lido["json"]["resposta"] == {"ok": True, "modo": "eco", "texto": f"{CODIGO}\nVE-100",
                                        "versao_workflow": _gerador().VERSAO_WORKFLOW, "execucao": "42"}


@precisa_de_node
def test_o_revisor_com_texto_em_volta_do_json_segue_para_a_conferencia(rodar):
    [pedido] = rodar("Monta o pedido", [{"json": {"body": CORPO}}])
    [lido] = rodar("Lê o Revisor", [{"json": {"output": _saida(REVISOR)}}], {"Monta o pedido": [pedido]})
    assert lido["json"]["rota"] == "conferir"
    assert [a["id"] for a in lido["json"]["revisor"]["acoes"]] == ["A1", "A2", "A3", "A4", "A5"]
    [preparo] = rodar("Prepara a conferência", [lido], {"Monta o pedido": [pedido]})
    assert preparo["json"]["sessionId"] == "sigft-conferente-42"
    assert "## RESULTADO DO REVISOR" in preparo["json"]["chatInput"] and pedido["json"]["documentos"] in preparo["json"]["chatInput"]


@precisa_de_node
def test_a_falha_do_revisor_vira_erro_da_etapa(rodar):
    [pedido] = rodar("Monta o pedido", [{"json": {"body": CORPO}}])
    erro = {"json": {"error": {"message": '424 - {"message":"Received error (500) from runtime."}'}}}
    [lido] = rodar("Lê o Revisor", [erro], {"Monta o pedido": [pedido]})
    resposta = lido["json"]["resposta"]
    assert lido["json"]["rota"] == "erro"
    assert (resposta["ok"], resposta["etapa"]) == (False, "revisor") and "424" in resposta["erro"]


@precisa_de_node
def test_o_revisor_sem_json_nao_repete_o_texto_no_erro(rodar):
    # O diagnóstico vai para o Claude na web: texto de documento não pode ir junto.
    [pedido] = rodar("Monta o pedido", [{"json": {"body": CORPO}}])
    segredo = "TRECHO DO PDF QUE NAO PODE SAIR"
    [lido] = rodar("Lê o Revisor", [{"json": {"output": f"Não consegui montar. {segredo}"}}], {"Monta o pedido": [pedido]})
    assert lido["json"]["rota"] == "erro"
    assert segredo not in json.dumps(lido, ensure_ascii=False)


@precisa_de_node
def test_o_resultado_aplica_so_o_confirmado_e_provado(rodar):
    j = _cadeia(rodar)
    resposta = j["resposta"]
    assert (j["rota"], resposta["ok"], resposta["modo"]) == ("ok", True, "revisar") and "<html" in resposta["html"]
    cabecalho, *linhas = _linhas_da_tabela(resposta["html"])
    assert cabecalho == CABECALHO
    assert [linha[4] for linha in linhas] == ["VE-100", "FT-200", "EF-210", "MN-400"]  # saiu SN-300; MN-400 após a LINHA 3
    assert linhas[0][1] == "4"                               # A1: QTD. 2 → 4
    assert linhas[1][7] == "4500063671.0002"                 # A4: a coluna da equipe não muda
    assert linhas[1][3] == "FILTRO DE ÓLEO"                  # A5: trecho que não está no PDF
    assert linhas[3][7:] == [""] * (len(CABECALHO) - 7)      # o item novo entra sem andamento
    situacao = {d["id"]: d["situacao"] for d in _dados(resposta["html"])["decisoes"]}
    assert situacao == {"A1": "aplicada", "A2": "aplicada", "A3": "aplicada", "A4": "a_conferir", "A5": "a_conferir",
                        "F1": "a_conferir"}
    assert (resposta["contagem"]["aplicadas"], resposta["contagem"]["a_conferir"]) == (3, 3)


@precisa_de_node
def test_o_item_que_sai_vai_para_a_sem_lista_com_a_origem(rodar):
    pagina = _cadeia(rodar)["resposta"]["html"]
    sem_lista = _area(pagina, "tsv-sem-lista").split("\t")
    assert sem_lista[4] == "SN-300" and sem_lista[7] == "4500063671.0004"
    assert sem_lista[-1].startswith(f"obs antiga | Saiu da lista {CODIGO} na revisão 0B")


@precisa_de_node
def test_a_linha_de_revisao_nova(rodar):
    pagina = _cadeia(rodar)["resposta"]["html"]
    assert _area(pagina, "linha-revisao") == "REVISÃO DA LISTA DE SOBRESSALENTES ATUAL EM USO: 0B - DATA DE ALTERAÇÃO: 02/11/2026"


@precisa_de_node
def test_remover_item_que_continua_na_lista_fica_a_conferir(rodar):
    revisor = {**REVISOR, "acoes": [_acao("A1", "remover", 1, {}, 1, "VE-100")]}
    conferente = {"vereditos": [_confirmado("A1")], "faltou": []}
    pagina = _cadeia(rodar, revisor=revisor, conferente=conferente)["resposta"]["html"]
    [decisao] = _dados(pagina)["decisoes"]
    assert decisao["situacao"] == "a_conferir" and any("ainda aparece" in nota for nota in decisao["notas"])
    assert _linhas_da_tabela(pagina)[1][4] == "VE-100"


@precisa_de_node
def test_sem_conferencia_nada_e_aplicado(rodar):
    j = _cadeia(rodar, item_do_conferente={"json": {"error": {"message": "424 - runtime"}}})
    resposta = j["resposta"]
    assert resposta["ok"] is True and "Conferente" in resposta["aviso"]
    assert _linhas_da_tabela(resposta["html"])[1:] == LINHAS
    assert {d["situacao"] for d in _dados(resposta["html"])["decisoes"]} == {"a_conferir"}
    assert resposta["contagem"]["aplicadas"] == 0


@precisa_de_node
def test_o_rejeitado_pelo_conferente_nao_entra(rodar):
    conferente = copy.deepcopy(CONFERENTE)
    conferente["vereditos"][3]["veredito"] = "rejeitado"   # A1
    pagina = _cadeia(rodar, conferente=conferente)["resposta"]["html"]
    assert {d["id"]: d["situacao"] for d in _dados(pagina)["decisoes"]}["A1"] == "rejeitada"
    assert _linhas_da_tabela(pagina)[1][1] == "2"


@precisa_de_node
def test_a_correcao_do_conferente_vale(rodar):
    revisor = {**REVISOR, "acoes": [_acao("A1", "atualizar", 1, {"QTD.": "3"}, 1, 'VÁLVULA ESFERA 1/2"\nVE-100')]}
    conferente = {"vereditos": [{"id": "A1", "veredito": "corrigido", "motivo": "a lista diz 4", "pagina": 1,
                                 "trecho": "1\n4\nPÇ\nVÁLVULA ESFERA", "correcao": {"valores": {"QTD.": "4"}}}],
                  "faltou": []}
    pagina = _cadeia(rodar, revisor=revisor, conferente=conferente)["resposta"]["html"]
    assert _linhas_da_tabela(pagina)[1][1] == "4"


@precisa_de_node
def test_o_html_escapa_o_que_vem_da_planilha(rodar):
    pagina = _cadeia(rodar)["resposta"]["html"]
    assert "<b>x</b>" not in pagina and "ver &lt;b&gt;x&lt;/b&gt;" in pagina
    assert _linhas_da_tabela(pagina)[2][10] == "ver <b>x</b>"   # na colagem, o dado vai como está


# ── o workflow montado à mão, com formulário (nos_para_colar/) ───────────────────────────────────


@precisa_de_node
def test_o_workflow_com_formulario_vai_da_colagem_ao_html(rodar):
    """Os três nós para colar em sequência. A extração de PDF do n8n gruda as células da mesma linha, e a
    célula do Excel com quebra de linha vem entre aspas na colagem."""
    para_colar = {p.name: p.read_text(encoding="utf-8") for p in (PASTA / "nos_para_colar").glob("*.js")}
    colagem = ("REVISÃO DA LISTA DE SOBRESSALENTES ATUAL EM USO: 0A - DATA DE ALTERAÇÃO: 01/09/2026\t\t\r\n"
               + "\r\n".join(["\t".join(CABECALHO),
                              '1\t2\tPÇ\t"VÁLVULA ESFERA\n1/2"""\tVE-100\t\tACME\t4500063671.0001\tAPROVADO\tFÍSICA E DOCUMENTAL\t',
                              "\t".join(LINHAS[1]), "\t".join(LINHAS[3])]) + "\r\n")
    nos = {
        "Formulário": [{"json": {"Código da lista": CODIGO, "Revisão em uso": "0A", "Revisão atual": "0B",
                                 "PDF da revisão em uso": {"filename": "a.pdf"}, "STATUS_PMIB colado do Excel": colagem}}],
        "Lê a revisão em uso": [{"json": {"text": ['1 2PÇVÁLVULA ESFERA 1/2"VE-100ACME\n31PÇSENSOR DE NÍVELSN-300MEDE']}}],
        "Lê a revisão atual": [{"json": {"text": ['14PÇVÁLVULA ESFERA 1/2"VE-100ACME\n21PÇFILTRO DE ÓLEOFT-200FILTRA',
                                                  "41PÇMANÔMETRO 0-10 BARMN-400WIKA"]}}],
    }
    [pedido] = rodar("", [{"json": {}}], nos, js=para_colar["1_monta_o_pedido.js"])
    texto = pedido["json"]["chatInput"]
    assert "--- página 2 ---" in texto and 'LINHA\tITEM' in texto and '1\t1\t2\tPÇ\tVÁLVULA ESFERA 1/2"' in texto
    assert pedido["json"]["corpo"]["status_pmib"]["linha_de_revisao"].startswith("REVISÃO DA LISTA")
    nos["Monta o pedido"] = [pedido]
    revisor = {**REVISOR, "acoes": [
        _acao("A1", "atualizar", 1, {"QTD.": "4"}, 1, '14PÇVÁLVULA ESFERA 1/2"VE-100'),
        _acao("A2", "remover", 3, {}, 1, "SENSOR DE NÍVEL"),
        _acao("A3", "remover", 1, {}, 1, "VE-100")]}   # VE-100 continua, grudado em ACME
    [preparo] = rodar("", [{"json": {"output": _saida(revisor)}}], nos, js=para_colar["2_prepara_a_conferencia.js"])
    nos["Prepara a conferência"] = [preparo]
    conferente = {"vereditos": [_confirmado(i) for i in ("A1", "A2", "A3")], "faltou": []}
    [resultado] = rodar("", [{"json": {"output": json.dumps(conferente, ensure_ascii=False)}}], nos,
                        js=para_colar["3_monta_o_resultado.js"])
    pagina = resultado["json"]["resposta"]["html"]
    assert resultado["binary"]["data"]["fileName"] == f"{CODIGO}[0A-0B] revisao AMP.html"
    assert {d["id"]: d["situacao"] for d in _dados(pagina)["decisoes"]} == {
        "A1": "aplicada", "A2": "aplicada", "A3": "a_conferir"}
    assert [linha[:5] for linha in _linhas_da_tabela(pagina)[1:]] == [
        ["1", "4", "PÇ", 'VÁLVULA ESFERA 1/2"', "VE-100"], ["2", "1", "PÇ", "FILTRO DE ÓLEO", "FT-200"]]


@precisa_de_node
def test_o_workflow_com_formulario_para_quando_o_revisor_nao_devolve_json(rodar):
    para_colar = {p.name: p.read_text(encoding="utf-8") for p in (PASTA / "nos_para_colar").glob("*.js")}
    nos = {"Monta o pedido": [{"json": {"documentos": "## LISTA"}}]}
    with pytest.raises(AssertionError, match="não devolveu o JSON combinado"):
        rodar("", [{"json": {"output": "Desculpe, não consegui."}}], nos, js=para_colar["2_prepara_a_conferencia.js"])

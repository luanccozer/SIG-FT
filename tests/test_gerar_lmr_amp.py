"""O envio da extração ao AMP (Gerar Aplicação LMR, aba 2): cliente falso, nenhuma chamada de rede."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

from sigft.core import dados_usuario
from sigft.core.amp import cliente as am
from sigft.services import gerar_lmr_amp as svc

RAIZ = Path(__file__).resolve().parent.parent
CAB = ("FICHA_PMIB;AREA_PAINEL;RDS_PP;TAG;TAG_COM_RDS_PP;PAIS;LOCAL;ELEVACAO;EIXO;TRECHOS;QTD_POR_TRECHO;"
       "DOCUMENTO;PAGINA")
LINHA1 = "4500000000.0001;SKID;#ST00=M00ABC10UZ010;GP101;SIM;;CASA DE FORÇA;98,50;CD;50HZ;1;DOC-1;5"
LINHA2 = "4500000000.0002;SKID;#ST00=M00ABC10UZ010;GP102;SIM;;CASA DE FORÇA;98,50;CD;50HZ;1;DOC-1;6"
CSV = "\n".join([CAB, LINHA1, LINHA2]) + "\n"
CHAVE = "SEGREDO-123"


def _resposta(csv=CSV, lotes=2, com_erro=(), ok=True, **mais):
    dados = {"ok": ok, "modo": "aplicacao_lmr", "csv": csv, "lotes_recebidos": lotes,
             "lotes_com_erro": list(com_erro), "execucao": "77", "versao_workflow": "2026-11-11"}
    dados.update(mais)
    return am.RespostaAmp(ok, "aplicacao_lmr", 200, 1.0, json.dumps(dados), dados,
                          "" if ok else str(dados.get("erro") or "falhou"))


class ClienteFalso:
    def __init__(self, resposta):
        self.resposta = resposta
        self.enviado = None

    def enviar(self, campos, arquivos):
        self.enviado = (dict(campos), dict(arquivos))
        return self.resposta


@pytest.fixture(autouse=True)
def logs_na_pasta_de_teste(tmp_path, monkeypatch):
    monkeypatch.setattr(dados_usuario, "pasta_logs", lambda: tmp_path / "logs")


@pytest.fixture
def sistema(tmp_path):
    extracao = tmp_path / "Água Pura" / "LMR" / "EXTRACAO"
    (extracao / "LOTES").mkdir(parents=True)
    (extracao / "INDICE.md").write_text("indice", encoding="utf-8")
    (extracao / "STATUS_PMIB.csv").write_text("status", encoding="utf-8")
    for n in (1, 2):
        (extracao / "LOTES" / f"lote_{n:02d}.md").write_text(f"lote {n}", encoding="utf-8")
    return tmp_path / "Água Pura"


def enviar(sistema, cliente, **kw):
    log = []
    resposta = svc.enviar_ao_amp(sistema, cliente, escopo="RV", subsistema="HIDRÁULICA", trechos="TODAS",
                                 log_cb=lambda msg, nivel="info", contexto=None: log.append((nivel, msg)),
                                 batimento=0, **kw)
    return resposta, log


def test_manda_os_campos_e_os_arquivos_da_spec(sistema):
    cliente = ClienteFalso(_resposta())
    resposta, _ = enviar(sistema, cliente)
    campos, arquivos = cliente.enviado
    assert campos == {"modo": "aplicacao_lmr", "escopo": "RV", "subsistema": "HIDRÁULICA", "trechos": "TODAS",
                      "lotes": "2"}
    extracao = sistema / "LMR" / "EXTRACAO"
    assert arquivos == {"indice": extracao / "INDICE.md", "status_pmib": extracao / "STATUS_PMIB.csv",
                        "lote_01": extracao / "LOTES" / "lote_01.md", "lote_02": extracao / "LOTES" / "lote_02.md"}
    assert resposta.ok and resposta.linhas == 2 and resposta.execucao == "77" and resposta.lotes_com_erro == []


def test_grava_o_csv_e_guarda_o_anterior(sistema):
    extracao = sistema / "LMR" / "EXTRACAO"
    (extracao / "RESPOSTA_AMP.csv").write_text("antigo", encoding="utf-8")
    resposta, _ = enviar(sistema, ClienteFalso(_resposta()))
    assert resposta.csv == extracao / "RESPOSTA_AMP.csv"
    assert resposta.csv.read_bytes().startswith(b"\xef\xbb\xbf") and LINHA1 in resposta.csv.read_text("utf-8-sig")
    assert (extracao / "RESPOSTA_AMP (anterior).csv").read_text(encoding="utf-8") == "antigo"


def test_contagem_de_lotes_errada_grava_o_que_veio_e_avisa(sistema):
    # o que o agente leu custou minutos: fica gravado, com o aviso de que está incompleto
    resposta, log = enviar(sistema, ClienteFalso(_resposta(lotes=1)))
    assert resposta.ok and resposta.linhas == 2
    assert (sistema / "LMR" / "EXTRACAO" / "RESPOSTA_AMP.csv").exists()
    assert any(nivel == "warn" and "incompleto" in msg for nivel, msg in log)


def test_lote_com_erro_grava_o_parcial_e_avisa(sistema):
    resposta, log = enviar(sistema, ClienteFalso(_resposta(com_erro=[2])))
    assert resposta.ok and resposta.lotes_com_erro == [2] and resposta.csv.exists()
    assert any(nivel == "warn" and "2" in msg for nivel, msg in log)


def test_resposta_sem_csv_valido_vai_para_o_diagnostico(sistema, tmp_path):
    resposta, _ = enviar(sistema, ClienteFalso(_resposta(csv="o agente respondeu só com uma frase")))
    assert not resposta.ok and "CSV" in resposta.erro and resposta.csv is None
    assert not (sistema / "LMR" / "EXTRACAO" / "RESPOSTA_AMP.csv").exists()
    diagnosticos = list((tmp_path / "logs" / "amp").glob("*.txt"))
    assert len(diagnosticos) == 1 and "uma frase" in diagnosticos[0].read_text(encoding="utf-8")


def test_erro_do_workflow_vira_erro_legivel(sistema):
    resposta, _ = enviar(sistema, ClienteFalso(_resposta(ok=False, etapa="arquivos", erro="os arquivos não chegaram")))
    assert not resposta.ok and "arquivos" in resposta.erro and "não chegaram" in resposta.erro


def test_sem_extracao_nao_chama_o_cliente(tmp_path):
    cliente = ClienteFalso(_resposta())
    resposta, _ = enviar(tmp_path / "vazia", cliente)
    assert not resposta.ok and "extra" in resposta.erro.lower() and cliente.enviado is None


def test_a_chave_nunca_aparece_em_log_nem_diagnostico(sistema, tmp_path):
    """Cliente de verdade, com sessão falsa que devolve a chave no corpo: o cliente a mascara, e o serviço não a repete."""
    class _R:
        status_code = 200

        def __init__(self, texto):
            self.text = texto

        def json(self):
            return {"ok": True, "csv": "frase sem cabecalho " + CHAVE, "lotes_recebidos": 2, "lotes_com_erro": [],
                    "execucao": "9"}

    class Sessao:
        def request(self, metodo, url, **kw):
            assert kw["headers"][am.CABECALHO_CHAVE] == CHAVE
            return _R(f"erro com {CHAVE} dentro")

    cliente = am.ClienteAmp("https://amp.exemplo/webhook/x", CHAVE, abrir=lambda *a, **k: (Sessao(), _R("{}")))
    resposta, log = enviar(sistema, cliente)
    tudo = [resposta.erro, *(m for _, m in log)]
    tudo += [p.read_text(encoding="utf-8") for p in (tmp_path / "logs").rglob("*") if p.is_file()]
    assert not resposta.ok and not any(CHAVE in texto for texto in tudo)


# --- o contrato com o gerador do workflow (amp/aplicacao_lmr/gerar_workflow.py) --------------------

def _gerador():
    caminho = RAIZ / "amp" / "aplicacao_lmr" / "gerar_workflow.py"
    spec = importlib.util.spec_from_file_location("gerar_workflow_lmr_t14", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_os_nomes_enviados_sao_os_que_o_workflow_le(sistema):
    gerador = _gerador()
    texto = json.dumps(gerador.montar_workflow(gerador.VERSAO_WORKFLOW), ensure_ascii=False)
    cliente = ClienteFalso(_resposta())
    enviar(sistema, cliente)
    campos, arquivos = cliente.enviado
    # o workflow lê `body.modo` e `body.lotes`; o resto (escopo, subsistema, trechos) vai para o agente
    assert campos["modo"] == "aplicacao_lmr" and "body.modo" in texto and "body.lotes" in texto
    assert "'indice'" in texto and "'status_pmib'" in texto and "padStart(2" in texto
    assert set(arquivos) - {"indice", "status_pmib"} == {f"lote_{i:02d}" for i in range(1, int(campos["lotes"]) + 1)}
    assert gerador.CABECALHO_CSV == CAB  # o cabeçalho que o gerador monta é o que o leitor espera


def test_a_resposta_do_gerador_passa_pelo_servico(sistema):
    gerador = _gerador()
    dados = gerador.juntar_respostas(
        [{"numero": 1, "csv": f"{CAB}\n{LINHA1}\n"}, {"numero": 2, "csv": "", "erro": "falhou 3 vezes"}], "88")
    parcial = am.RespostaAmp(True, "aplicacao_lmr", 200, 1.0, json.dumps(dados), dados)
    resposta, _ = enviar(sistema, ClienteFalso(parcial))
    assert resposta.ok and resposta.linhas == 1 and resposta.lotes_com_erro == [2] and resposta.execucao == "88"
    erro = gerador.juntar_respostas([{"numero": 1, "csv": "", "erro": "x"}], "89")
    falha = am.RespostaAmp(False, "aplicacao_lmr", 200, 1.0, json.dumps(erro), erro, erro["erro"])
    resposta, _ = enviar(sistema, ClienteFalso(falha))
    assert not resposta.ok and "agente" in resposta.erro  # a etapa do workflow aparece no erro

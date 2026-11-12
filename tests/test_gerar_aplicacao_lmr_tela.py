"""A tela "Gerar Aplicação LMR" (Qt): abas 1 e 3, com os serviços dublados (a regra tem os testes dela em
`test_gerar_lmr_extracao.py`, `test_gerar_lmr_csv.py` e `test_gerar_lmr_planilha.py`)."""
from __future__ import annotations

import sys
import types
from pathlib import Path

import pytest
from PySide6.QtCore import Qt

from sigft.app_qt import catalogo
from sigft.app_qt import main as qmain
from sigft.app_qt.views import gerar_aplicacao_lmr as tela_mod
from sigft.services.gerar_lmr_amp import RespostaLmr
from sigft.services.gerar_lmr_csv import CsvInvalido
from sigft.services.gerar_lmr_extracao import Extracao, ExtracaoInterrompida
from sigft.services.gerar_lmr_planilha import NaoDaParaGravar, Saida

ABAS = ("1. Extração", "2. Análise no AMP", "3. Realizar a Aplicação LMR")


@pytest.fixture
def servicos(monkeypatch):
    estado = {"dlc": True, "extrair": None, "gerar": None, "erro": None, "amp": None}
    monkeypatch.setattr(tela_mod.ext_svc, "dlc_instalada", lambda: estado["dlc"])

    def extrair(pdfs, status, pasta_sistema, *, log_cb, progresso_cb, parar=lambda: False, **_):
        estado["extrair"] = ([Path(p).name for p in pdfs], Path(status), Path(pasta_sistema))
        if estado["erro"]:
            raise estado["erro"]
        progresso_cb(1, len(pdfs), item="x")
        return Extracao(Path(pasta_sistema) / "LMR" / "EXTRACAO", len(pdfs), [], 3, 1, 1)

    def realizar(csv, status, pasta_sistema, *, nome, escopo, subsistema, opcao_trechos, lista_trechos,
                 log_cb, retry_lock=None):
        estado["gerar"] = dict(csv=Path(csv), status=Path(status), pasta=Path(pasta_sistema), nome=nome,
                               escopo=escopo, subsistema=subsistema, opcao=opcao_trechos, lista=lista_trechos)
        if estado["erro"]:
            raise estado["erro"]
        pasta = Path(pasta_sistema) / "LMR" / "SAIDA ATUAL"
        return Saida(pasta / "a.xlsx", pasta / "v.xlsx", 5, 1, 2, "5-abc")

    def enviar_ao_amp(pasta_sistema, cliente, *, escopo, subsistema, trechos, log_cb, **_):
        estado["amp"] = dict(pasta=Path(pasta_sistema), escopo=escopo, subsistema=subsistema, trechos=trechos,
                             cliente=cliente)
        if estado["erro"]:
            return RespostaLmr(False, None, 0, [], "", str(estado["erro"]))
        csv = Path(pasta_sistema) / "LMR" / "EXTRACAO" / "RESPOSTA_AMP.csv"
        return RespostaLmr(True, csv, 4, [2], "77", "")

    class ClienteFalso:
        def __init__(self, url, chave, **_):
            self.url, self.chave = url, chave

    monkeypatch.setattr(tela_mod.amp_svc, "enviar_ao_amp", enviar_ao_amp)
    monkeypatch.setattr(tela_mod.amp_svc, "testar_conexao", lambda cliente: ["OK      Ping: workflow 2026-11-11"])
    monkeypatch.setattr(tela_mod, "ClienteAmp", ClienteFalso)
    monkeypatch.setattr(tela_mod.ext_svc, "extrair", extrair)
    monkeypatch.setattr(tela_mod.plan_svc, "realizar_aplicacao", realizar)
    return estado


def _nova(qtbot, monkeypatch):
    t_ = tela_mod.ModuloGerarAplicacaoLMR()
    qtbot.addWidget(t_)
    qtbot.waitUntil(lambda: not t_.rodando(), timeout=5000)  # a checagem da DLC roda numa tarefa
    t_.avisos = []
    monkeypatch.setattr(t_, "_webhook", lambda: ("https://amp.exemplo/webhook/lmr", "chave-x"))
    monkeypatch.setattr(t_, "avisar", lambda titulo, msg, tipo="info", **k: t_.avisos.append((tipo, msg)))
    return t_


@pytest.fixture
def tela(qt_interface, qtbot, servicos, tmp_path, monkeypatch):
    sistema = tmp_path / "Água Pura"
    sistema.mkdir()
    for nome in ("A [R0].pdf", "B [R1].PDF", "nota.txt"):
        (sistema / nome).write_bytes(b"x")
    (tmp_path / "status.xlsx").write_bytes(b"x")
    t_ = _nova(qtbot, monkeypatch)
    t_.definir_pasta(str(sistema))
    t_.definir_status(str(tmp_path / "status.xlsx"))
    return t_


def _esperar(qtbot, t_):
    qtbot.waitUntil(lambda: not t_.rodando(), timeout=5000)
    qtbot.wait(300)  # o console descarrega o log aos poucos (INTERVALO_MS)


def _log(t_):
    return t_.console.toPlainText()


def test_monta_com_as_tres_abas(tela):
    for nome in ABAS:
        assert tela.abas.tab(nome) is not None
    assert tela.abas.get() == ABAS[0]
    assert "devolve o CSV" in tela.rotulo_analise.text()


def test_sem_a_dlc_o_botao_de_extrair_fica_desligado(qt_interface, qtbot, servicos, monkeypatch):
    servicos["dlc"] = False
    t_ = _nova(qtbot, monkeypatch)
    assert not t_.btn_extrair.isEnabled()
    assert not t_.aviso_dlc.isHidden() and not t_.btn_instalar.isHidden()


def test_com_a_dlc_o_botao_liga_e_o_aviso_some(tela):
    assert tela.btn_extrair.isEnabled()
    assert tela.aviso_dlc.isHidden() and tela.btn_instalar.isHidden()


def _dlc_falsa(monkeypatch, *, erro=None):
    chamadas = []

    def instalar_dlc(*, log_cb, progresso_cb):
        chamadas.append("instalar")
        progresso_cb(1, 2)
        if erro:
            raise erro
        return Path("C:/dlc")

    modulo = types.ModuleType("sigft.services.gerar_lmr_dlc")
    modulo.instalar_dlc = instalar_dlc
    monkeypatch.setitem(sys.modules, "sigft.services.gerar_lmr_dlc", modulo)
    import sigft.services
    monkeypatch.setattr(sigft.services, "gerar_lmr_dlc", modulo, raising=False)  # `from pacote import modulo` lê o atributo
    return chamadas


def test_instalar_componente_chama_o_servico_e_refaz_a_checagem(qt_interface, qtbot, servicos, monkeypatch):
    servicos["dlc"] = False
    chamadas = _dlc_falsa(monkeypatch)
    t_ = _nova(qtbot, monkeypatch)
    assert not t_.btn_extrair.isEnabled()
    servicos["dlc"] = True  # a instalação o deixa pronto
    t_.btn_instalar.click()
    qtbot.waitUntil(lambda: not t_.rodando(), timeout=5000)
    assert chamadas == ["instalar"] and t_.btn_extrair.isEnabled() and t_.btn_instalar.isHidden()


def test_erro_da_instalacao_vira_linha_clara(qt_interface, qtbot, servicos, monkeypatch, capsys):
    servicos["dlc"] = False
    _dlc_falsa(monkeypatch, erro=RuntimeError("sem espaço em disco"))
    t_ = _nova(qtbot, monkeypatch)
    t_.btn_instalar.click()
    _esperar(qtbot, t_)
    assert "sem espaço em disco" in _log(t_) and "Traceback" not in capsys.readouterr().err
    assert not t_.btn_extrair.isEnabled()


def test_lista_os_pdfs_da_pasta_todos_marcados(tela):
    assert [p.name for p in tela.pdfs_marcados()] == ["A [R0].pdf", "B [R1].PDF"]
    tela.lista_pdfs.item(0).setCheckState(Qt.CheckState.Unchecked)
    assert [p.name for p in tela.pdfs_marcados()] == ["B [R1].PDF"]


def test_extrair_chama_o_servico_com_os_marcados(tela, servicos, qtbot, tmp_path):
    tela.lista_pdfs.item(0).setCheckState(Qt.CheckState.Unchecked)
    tela.btn_extrair.click()
    _esperar(qtbot, tela)
    nomes, status, pasta = servicos["extrair"]
    assert nomes == ["B [R1].PDF"] and status == tmp_path / "status.xlsx" and pasta == tmp_path / "Água Pura"
    assert "1 documento" in _log(tela)


def test_extrair_sem_status_ou_sem_pdf_avisa_e_nao_chama(tela, servicos):
    tela.definir_status("")
    tela.btn_extrair.click()
    assert servicos["extrair"] is None and len(tela.avisos) == 1
    tela.definir_status("status.xlsx")
    for i in range(tela.lista_pdfs.count()):
        tela.lista_pdfs.item(i).setCheckState(Qt.CheckState.Unchecked)
    tela.btn_extrair.click()
    assert servicos["extrair"] is None and len(tela.avisos) == 2


def test_extracao_interrompida_vira_mensagem_sem_traceback(tela, servicos, qtbot, capsys):
    servicos["erro"] = ExtracaoInterrompida("Extração interrompida.")
    tela.btn_extrair.click()
    _esperar(qtbot, tela)
    assert "interrompida" in _log(tela).lower() and "Traceback" not in capsys.readouterr().err


def test_parar_pede_a_parada(tela):
    assert not tela._parar.is_set()
    tela.btn_parar.click()
    assert tela._parar.is_set()


def test_gerar_chama_o_servico_com_os_campos_da_tela(tela, servicos, qtbot, tmp_path):
    csv = tmp_path / "resposta.csv"
    csv.write_text("x", encoding="utf-8")
    tela.definir_csv(str(csv))
    tela.campo_nome.setText("SISTEMA X")
    tela.campo_escopo.setText("RV")
    tela.campo_subsistema.setText("HIDRÁULICA")
    tela.combo_trechos.setCurrentText("LISTA")
    tela.campo_lista.setText("U-01, U-03")
    tela.btn_gerar.click()
    _esperar(qtbot, tela)
    g = servicos["gerar"]
    assert (g["csv"], g["status"], g["pasta"]) == (csv, tmp_path / "status.xlsx", tmp_path / "Água Pura")
    assert (g["nome"], g["escopo"], g["subsistema"], g["opcao"], g["lista"]) == (
        "SISTEMA X", "RV", "HIDRÁULICA", "LISTA", ["U-01", "U-03"])
    assert "5 linhas" in _log(tela) and tela.btn_abrir.isEnabled()


def test_usa_a_resposta_do_amp_se_existir(qt_interface, qtbot, servicos, tmp_path, monkeypatch):
    sistema = tmp_path / "S"
    (sistema / "LMR" / "EXTRACAO").mkdir(parents=True)
    (sistema / "LMR" / "EXTRACAO" / "RESPOSTA_AMP.csv").write_text("x", encoding="utf-8")
    t_ = _nova(qtbot, monkeypatch)
    t_.definir_pasta(str(sistema))
    assert t_.csv == str(sistema / "LMR" / "EXTRACAO" / "RESPOSTA_AMP.csv")
    assert t_.campo_nome.text() == "S"


@pytest.mark.parametrize("erro", [CsvInvalido("cabeçalho não encontrado"), NaoDaParaGravar("Feche o Excel"),
                                  ValueError("trecho inválido na lista: X-99")])
def test_erros_do_servico_viram_mensagem_clara(tela, servicos, qtbot, tmp_path, capsys, erro):
    csv = tmp_path / "r.csv"
    csv.write_text("x", encoding="utf-8")
    tela.definir_csv(str(csv))
    servicos["erro"] = erro
    tela.btn_gerar.click()
    _esperar(qtbot, tela)
    assert str(erro) in _log(tela) and "Traceback" not in capsys.readouterr().err
    assert tela.btn_gerar.isEnabled()


def test_gerar_sem_csv_avisa(tela, servicos):
    tela.btn_gerar.click()
    assert servicos["gerar"] is None and len(tela.avisos) == 1


def test_lista_de_trechos_so_vale_com_lista(tela):
    tela.combo_trechos.setCurrentText("TODAS")
    assert not tela.campo_lista.isEnabled()
    tela.combo_trechos.setCurrentText("LISTA")
    assert tela.campo_lista.isEnabled()


def test_o_modulo_esta_registrado():
    assert "GerarLMR" in qmain.TELAS
    botoes = [i[2] for i in catalogo.MENU if i[0] == "botao"]
    assert botoes[botoes.index("LMR") + 1] == "GerarLMR"
    chaves = [m[0] for m in catalogo.MODULOS]
    assert chaves[chaves.index("LMR") + 1] == "GerarLMR" and "GerarLMR" in catalogo.ICONE_DA_TELA


# --- aba 2: o envio ao AMP ----------------------------------------------------------------------

def _com_extracao(tela, tmp_path):
    pasta = tmp_path / "Água Pura" / "LMR" / "EXTRACAO"
    pasta.mkdir(parents=True)
    (pasta / "INDICE.md").write_text("i", encoding="utf-8")
    tela.definir_pasta(str(tmp_path / "Água Pura"))


def test_a_aba_2_tem_os_botoes_e_nao_diz_mais_que_chega_depois(tela):
    assert tela.abas.tab(ABAS[1]) is not None
    assert "depois" not in tela.rotulo_analise.text()
    for nome in ("btn_testar_amp", "btn_enviar_amp"):
        assert getattr(tela, nome) is not None
    assert tela.botao_configurar_ia is not None


def test_sem_extracao_o_envio_fica_desligado_com_o_motivo(tela, tmp_path):
    tela.definir_pasta(str(tmp_path / "Água Pura"))
    assert not tela.btn_enviar_amp.isEnabled() and not tela.lbl_motivo_amp.isHidden()
    _com_extracao(tela, tmp_path)
    assert tela.btn_enviar_amp.isEnabled() and tela.lbl_motivo_amp.isHidden()


def test_enviar_chama_o_servico_com_os_campos_da_tela(tela, servicos, qtbot, tmp_path):
    _com_extracao(tela, tmp_path)
    tela.campo_escopo.setText("RV")
    tela.campo_subsistema.setText("HIDRÁULICA")
    tela.combo_trechos.setCurrentText("LISTA")
    tela.campo_lista.setText("U-01, U-03")
    tela.btn_enviar_amp.click()
    _esperar(qtbot, tela)
    amp = servicos["amp"]
    assert (amp["pasta"], amp["escopo"], amp["subsistema"], amp["trechos"]) == (
        tmp_path / "Água Pura", "RV", "HIDRÁULICA", "U-01;U-03")
    assert (amp["cliente"].url, amp["cliente"].chave) == ("https://amp.exemplo/webhook/lmr", "chave-x")
    assert "4 linha" in _log(tela) and "2" in _log(tela)  # o lote com erro é avisado
    assert tela.csv.endswith("RESPOSTA_AMP.csv")  # a aba 3 já sai preenchida


def test_enviar_com_erro_do_amp_vira_linha_clara(tela, servicos, qtbot, tmp_path, capsys):
    _com_extracao(tela, tmp_path)
    servicos["erro"] = "o AMP recusou a chave (HTTP 401)"
    tela.btn_enviar_amp.click()
    _esperar(qtbot, tela)
    assert "recusou a chave" in _log(tela) and "Traceback" not in capsys.readouterr().err


def test_enviar_sem_webhook_avisa_e_nao_chama(tela, servicos, tmp_path, monkeypatch):
    _com_extracao(tela, tmp_path)
    monkeypatch.setattr(tela, "_webhook", lambda: ("", ""))
    tela.btn_enviar_amp.click()
    assert servicos["amp"] is None and len(tela.avisos) == 1


def test_testar_conexao_mostra_as_linhas_do_ping(tela, qtbot):
    tela.btn_testar_amp.click()
    _esperar(qtbot, tela)
    assert "Ping: workflow 2026-11-11" in _log(tela)

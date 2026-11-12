"""A janela "Atenção: Intervenção Necessária" do robô da ficha duplicada.

O worker espera num `threading.Event`; a regra que não pode quebrar é que ele
NUNCA fica preso: botão, contagem a zero, "X" e Esc, em qualquer das duas fases,
soltam o evento.
"""
import threading

from PySide6.QtWidgets import QApplication, QWidget

from sigft.app_qt.widgets import dialogs as qd
from sigft.app_qt.widgets.espera import DialogosDeEspera
from sigft.services import duplicadas_robo as robo


class Tela(DialogosDeEspera, QWidget):
    pass


def _abertos():
    return [w for w in QApplication.topLevelWidgets()
            if isinstance(w, qd.IntervencaoDialog) and w.isVisible()]


def _pedir(tela, qtbot, segundos=60, motivos=("seção pdm: falhou", "[Aviso] x")):
    respostas = []
    worker = threading.Thread(
        target=lambda: respostas.append(tela.pedir_intervencao("4500.0001", list(motivos), segundos)),
        daemon=True)
    worker.start()
    qtbot.waitUntil(lambda: len(_abertos()) == 1, timeout=2000)
    return worker, respostas, _abertos()[0]


def test_as_respostas_da_janela_sao_as_do_servico():
    assert qd.IntervencaoDialog.EDITAR == robo.RESPOSTA_EDITAR
    assert qd.IntervencaoDialog.CONTINUAR == robo.RESPOSTA_CONTINUAR
    assert qd.IntervencaoDialog.SEM_RESPOSTA == robo.RESPOSTA_SEM_RESPOSTA


def test_mostra_a_ficha_os_motivos_e_a_contagem(qt_interface, qtbot):
    tela = Tela()
    qtbot.addWidget(tela)
    worker, _respostas, dialogo = _pedir(tela, qtbot, segundos=60)

    assert "4500.0001" in dialogo.rotulo.text()
    assert dialogo.caixa_motivos.isReadOnly()
    assert "seção pdm: falhou" in dialogo.caixa_motivos.toPlainText()
    assert "[Aviso] x" in dialogo.caixa_motivos.toPlainText()
    assert "60 s" in dialogo.rotulo_contagem.text()
    assert (dialogo.botao_editar.text(), dialogo.botao_continuar.text()) == ("Editar", "Continuar")
    dialogo.botao_continuar.click()
    worker.join(3)


def test_continuar_devolve_continuar(qt_interface, qtbot):
    tela = Tela()
    qtbot.addWidget(tela)
    worker, respostas, dialogo = _pedir(tela, qtbot)

    dialogo.botao_continuar.click()
    worker.join(3)

    assert respostas == ["continuar"]


def test_editar_nao_solta_o_worker_e_o_continuar_seguinte_devolve_editar(qt_interface, qtbot):
    tela = Tela()
    qtbot.addWidget(tela)
    worker, respostas, dialogo = _pedir(tela, qtbot)

    dialogo.botao_editar.click()

    assert respostas == [] and worker.is_alive() and dialogo.isVisible()
    assert dialogo.botao_editar.isHidden() and dialogo.rotulo_contagem.isHidden()
    assert "navegador" in dialogo.rotulo.text()
    assert not dialogo._timer.isActive()
    dialogo.botao_continuar.click()
    worker.join(3)
    assert respostas == ["editar"]


def test_na_fase_de_edicao_nao_ha_limite_de_tempo(qt_interface, qtbot):
    tela = Tela()
    qtbot.addWidget(tela)
    worker, respostas, dialogo = _pedir(tela, qtbot, segundos=2)
    dialogo.botao_editar.click()

    for _ in range(5):
        dialogo._tique()

    assert respostas == [] and dialogo.isVisible()
    dialogo.botao_continuar.click()
    worker.join(3)


def test_contagem_esgotada_devolve_sem_resposta(qt_interface, qtbot):
    tela = Tela()
    qtbot.addWidget(tela)
    worker, respostas, dialogo = _pedir(tela, qtbot, segundos=3)

    dialogo._tique()
    assert "2 s" in dialogo.rotulo_contagem.text() and respostas == []
    dialogo._tique()
    dialogo._tique()
    worker.join(3)

    assert respostas == ["sem_resposta"]
    assert not dialogo._timer.isActive()


def test_o_timer_de_verdade_tambem_esgota_a_contagem(qt_interface, qtbot):
    tela = Tela()
    qtbot.addWidget(tela)
    worker, respostas, _dialogo = _pedir(tela, qtbot, segundos=1)

    # Sem `join`: bloquear a thread da interface pararia o timer.
    qtbot.waitUntil(lambda: bool(respostas), timeout=4000)
    worker.join(3)

    assert respostas == ["sem_resposta"]


def test_fechar_no_x_na_fase_1_devolve_continuar(qt_interface, qtbot):
    tela = Tela()
    qtbot.addWidget(tela)
    worker, respostas, dialogo = _pedir(tela, qtbot)

    dialogo.close()
    worker.join(3)

    assert respostas == ["continuar"]
    assert not dialogo._timer.isActive()


def test_fechar_no_x_na_fase_2_devolve_editar(qt_interface, qtbot):
    tela = Tela()
    qtbot.addWidget(tela)
    worker, respostas, dialogo = _pedir(tela, qtbot)

    dialogo.botao_editar.click()
    dialogo.close()
    worker.join(3)

    assert respostas == ["editar"]


def test_esc_tambem_solta_o_worker(qt_interface, qtbot):
    tela = Tela()
    qtbot.addWidget(tela)
    worker, respostas, dialogo = _pedir(tela, qtbot)

    dialogo.reject()
    worker.join(3)

    assert respostas == ["continuar"]


def test_janela_que_falha_ao_abrir_devolve_sem_resposta(qt_interface, qtbot, monkeypatch):
    tela = Tela()
    qtbot.addWidget(tela)

    def quebrada(*_a, **_k):
        raise RuntimeError("não abriu")

    monkeypatch.setattr(qd, "IntervencaoDialog", quebrada)
    respostas = []
    worker = threading.Thread(target=lambda: respostas.append(tela.pedir_intervencao("A", ["m"], 60)),
                              daemon=True)
    worker.start()
    qtbot.waitUntil(lambda: bool(respostas), timeout=3000)   # a abertura roda na thread da interface
    worker.join(3)

    assert respostas == ["sem_resposta"]

"""A aba "Revisão no AMP" do PMIB Manager (Qt): as listas marcáveis (todas marcadas; a que tem
falta, sem caixa), o webhook dentro da aba e o log em arquivo. O serviço e o cliente são dublês:
a rodada tem os testes dela em `test_revisao_amp_rodada.py`. Desenho:
`docs/superpowers/specs/2026-11-03-amp-revisao-com-arquivos-design.md`, §5.
"""
from __future__ import annotations

import dataclasses
from datetime import datetime
from types import SimpleNamespace

import pytest
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QApplication, QMessageBox

from sigft.app_qt.views import revisao_amp as tela_mod
from sigft.app_qt.views.conferencia_revisoes import UltimaConferencia
from sigft.core import dados_usuario
from sigft.services import conferencia_revisoes as cr
from sigft.services import revisao_amp as ra

URL = "https://ampworkflow.gevernova.net/webhook/sigft-revisao-listas"
CHAVE = "segredo-do-webhook"
CODIGO = "#ITA0=Y01TF001&BPB020"
OUTRO = "#ST00=X01MPB020&MPB020"
TERCEIRO = "#ST00=Z01MPB020&MPB020"
TITULO = "Revisão no AMP"
AVISO_SEM_CHAVE = "Configure o endereço e a chave do webhook em Configurar IA, no alto da Conferência de Listas."
AVISO_TABELA_REFEITA = ("A conferência mudou: a tabela foi refeita com as listas dela. Confira as marcas e "
                        "clique em Revisar no AMP de novo.")


class _Controller:
    def __init__(self, url=URL, chave=CHAVE, **outras):
        self.chaves = {"AMP_REVISAO_LISTAS_URL": url, "AMP_REVISAO_LISTAS_CHAVE": chave, **outras}
        self.gravadas = []

    def get_key(self, nome):
        return self.chaves.get(nome) or ""

    def save_keys(self, novas):
        self.gravadas.append(dict(novas))
        self.chaves.update(novas)


class _ClienteAmp:
    def __init__(self, url, chave, **_kw):
        self.url, self.chave = url, chave


def _lista(tmp_path, codigo, falta=""):
    """A falta de um PDF é o PDF que não está (`None`), como no serviço."""
    pasta = tmp_path / codigo[-6:]
    pasta.mkdir(parents=True, exist_ok=True)
    dados = cr.ListaNaMapeadora(codigo, "0B", "Em Processo", "Aprovado", "0A", "x")
    em_uso = None if "em uso" in falta else pasta / "a.pdf"
    atual = None if "atual" in falta else pasta / "b.pdf"
    return ra.ListaParaAmp(cr.ItemConferencia(dados, "aprovada", pasta), pasta / "s.xlsx", em_uso, atual, "0B",
                           falta)


@pytest.fixture
def ultima(tmp_path):
    mapeadora = cr.Mapeadora(tmp_path / "mapa" / "Mapeamento.xlsx", datetime.now(), [])
    return UltimaConferencia(mapeadora, cr.Conferencia([], em_dia=0, sem_status_pmib=0), [], tmp_path / "raiz")


@pytest.fixture
def servico(monkeypatch, tmp_path):
    """Dublê do serviço: as listas, a rodada e o teste. Guarda o que a tela pediu."""
    falso = SimpleNamespace(listas=[_lista(tmp_path, CODIGO), _lista(tmp_path, OUTRO, "falta: PDF da revisão atual"),
                                    _lista(tmp_path, TERCEIRO)],
                            resultados=None, chamadas=[], testes=[], cancelado=None, rodada=None, downloads=[])

    def listas_para_amp(conferencia, downloads, pasta_mapeadora, pasta_raiz):
        falso.chamadas.append(("listas", pasta_mapeadora, pasta_raiz))
        falso.downloads.append(list(downloads))
        return falso.listas

    def revisar_listas(listas, cliente, *, versao_sigft, url, chave_posta, log_cb, progress_cb=None,
                       cancelado_cb=None, resultado_cb=None, desmarcadas=(), com_falta=(), **_kw):
        falso.rodada = SimpleNamespace(listas=list(listas), desmarcadas=list(desmarcadas),
                                       com_falta=list(com_falta), url=cliente.url, chave=cliente.chave,
                                       chave_posta=chave_posta)
        falso.cancelado = cancelado_cb
        log_cb("linha da rodada")
        resultados = falso.resultados if falso.resultados is not None else [
            ra.ResultadoAmp(lista, "pronto", lista.item.pasta / "x.html", "x.html") for lista in listas]
        for resultado in resultados:
            resultado_cb(resultado)
        return list(resultados)

    def testar_conexao(cliente):
        falso.testes.append((cliente.url, cliente.chave))
        return ["OK      Ping: workflow 2026-11-03 (HTTP 200, 0,3 s, execução 4)"]

    monkeypatch.setattr(tela_mod.revisao_amp_svc, "listas_para_amp", listas_para_amp)
    monkeypatch.setattr(tela_mod.revisao_amp_svc, "revisar_listas", revisar_listas)
    monkeypatch.setattr(tela_mod.revisao_amp_svc, "testar_conexao", testar_conexao)
    monkeypatch.setattr(tela_mod, "ClienteAmp", _ClienteAmp)
    return falso


@pytest.fixture
def avisos(monkeypatch):
    """Os QMessageBox.warning do clique (thread da interface)."""
    lista = []
    monkeypatch.setattr(QMessageBox, "warning", staticmethod(lambda *a: lista.append(a[1:])))
    return lista


def _tela(qtbot, *, controller=None, ultima=None, rodando=False):
    fonte = SimpleNamespace(ultima=ultima, rodando=lambda: rodando)
    tela = tela_mod.ModuloRevisaoAmp(controller=controller or _Controller(), fonte=fonte)
    qtbot.addWidget(tela)
    return tela


def _carregada(tela, qtbot):
    tela.atualizar_listas()
    qtbot.waitUntil(lambda: tela.tabela.topLevelItemCount() > 0 and not tela.rodando(), timeout=5000)
    return tela


def _caixas(tela):
    """O estado da caixa de cada linha: True ou False, ou None quando a linha não tem caixa (sem
    estado de marca, o Qt não desenha a caixa)."""
    estados = []
    for i in range(tela.tabela.topLevelItemCount()):
        item = tela.tabela.topLevelItem(i)
        tem_caixa = item.data(0, Qt.ItemDataRole.CheckStateRole) is not None
        estados.append(item.checkState(0) == Qt.CheckState.Checked if tem_caixa else None)
    return estados


def _marcavel(tela, linha):
    return bool(tela.tabela.topLevelItem(linha).flags() & Qt.ItemFlag.ItemIsUserCheckable)


def _coluna_amp(tela):
    return [tela.tabela.topLevelItem(i).text(4) for i in range(tela.tabela.topLevelItemCount())]


def _revisar(tela, qtbot, n):
    tela.btn_amp.click()
    qtbot.waitUntil(lambda: tela.btn_amp.isEnabled() and len(tela.resultados_amp) == n and not tela.rodando(),
                    timeout=5000)


def _no_console(tela, qtbot, texto):
    qtbot.waitUntil(lambda: texto in tela.console.toPlainText(), timeout=5000)


# ------------------------------------------------------------------ as listas

def test_listas_aparecem_todas_marcadas_e_a_com_falta_sem_caixa(qt_interface, qtbot, servico, ultima):
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    assert _caixas(tela) == [True, None, True]
    assert [_marcavel(tela, i) for i in range(3)] == [True, False, True]
    assert _coluna_amp(tela)[1] == "falta: PDF da revisão atual"
    assert servico.chamadas == [("listas", ultima.mapeadora.caminho.parent, ultima.pasta_raiz)]
    _no_console(tela, qtbot, "3 lista(s) na conferência; 2 podem ir ao AMP, 1 com falta")


def test_marcar_e_desmarcar_todas(qt_interface, qtbot, servico, ultima):
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    tela.btn_desmarcar.click()
    assert _caixas(tela) == [False, None, False]
    tela.btn_marcar.click()
    assert _caixas(tela) == [True, None, True]


def test_a_tabela_nao_enche_com_a_conferencia_rodando(qt_interface, qtbot, servico, ultima):
    tela = _tela(qtbot, ultima=ultima, rodando=True)
    tela.atualizar_listas()
    assert servico.chamadas == [] and tela.tabela.topLevelItemCount() == 0


# ------------------------------------------------------------------ a rodada

def test_so_as_marcadas_vao(qt_interface, qtbot, servico, ultima):
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    tela.tabela.topLevelItem(2).setCheckState(0, Qt.CheckState.Unchecked)
    _revisar(tela, qtbot, 1)
    assert [lista.item.lista.codigo for lista in servico.rodada.listas] == [CODIGO]
    assert (servico.rodada.desmarcadas, servico.rodada.com_falta) == ([TERCEIRO], [OUTRO])
    assert (servico.rodada.url, servico.rodada.chave, servico.rodada.chave_posta) == (URL, CHAVE, True)


def test_as_caixas_travam_durante_a_rodada(qt_interface, qtbot, servico, ultima):
    # A tabela diz o que foi mandado: no meio da rodada, nada se marca nem se desmarca. O fim da
    # rodada (`_terminar`) só roda quando o laço da interface anda, depois destas linhas.
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    tela.btn_amp.click()
    assert not tela.btn_marcar.isEnabled() and not tela.btn_desmarcar.isEnabled()
    assert not _marcavel(tela, 0) and not _marcavel(tela, 2)
    qtbot.waitUntil(lambda: tela.btn_amp.isEnabled() and len(tela.resultados_amp) == 2 and not tela.rodando(),
                    timeout=5000)
    assert tela.btn_marcar.isEnabled() and _marcavel(tela, 0) and not _marcavel(tela, 1)


def test_nenhuma_marcada_avisa_e_nao_chama(qt_interface, qtbot, servico, avisos, ultima):
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    tela.btn_desmarcar.click()
    tela.btn_amp.click()
    assert avisos == [(TITULO, "Marque ao menos uma lista para mandar ao AMP.")]
    assert servico.rodada is None


def test_a_pronta_e_desmarcada_ao_fim(qt_interface, qtbot, servico, ultima):
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    _revisar(tela, qtbot, 2)
    assert _caixas(tela) == [False, None, False]
    assert _coluna_amp(tela) == ["HTML pronto: x.html", "falta: PDF da revisão atual", "HTML pronto: x.html"]
    assert not tela.btn_copiar_diag.isEnabled()


def test_a_sem_diferencas_e_desmarcada_e_nao_tem_html(qt_interface, qtbot, servico, ultima, monkeypatch):
    # 2026-11-11: sem diferença, o agente responde curto e nenhum arquivo é gravado.
    a, _b, c = servico.listas
    servico.resultados = [ra.ResultadoAmp(a, "sem_diferencas", None, ""),
                          ra.ResultadoAmp(c, "pronto", c.item.pasta / "x.html", "x.html",
                                          classificacao=ra.SIGNIFICATIVA)]
    abertos = []
    monkeypatch.setattr(tela_mod.plataforma, "abrir_no_sistema", abertos.append)
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    _revisar(tela, qtbot, 2)
    assert _caixas(tela) == [False, None, False]
    assert _coluna_amp(tela) == ["sem diferenças", "falta: PDF da revisão atual",
                                 "HTML pronto (mudança significativa): x.html"]
    tela.tabela.itemDoubleClicked.emit(tela.tabela.topLevelItem(0), 0)
    assert abertos == []


def test_a_coluna_diz_quando_e_so_correcao_de_texto(tmp_path):
    lista = _lista(tmp_path, CODIGO)
    resultado = ra.ResultadoAmp(lista, "pronto", lista.item.pasta / "x.html", "x.html", classificacao=ra.SO_TEXTO)
    assert tela_mod._texto_amp(resultado) == "HTML pronto (só correção de texto): x.html"


def test_a_que_falhou_continua_marcada_e_liga_o_copiar(qt_interface, qtbot, servico, ultima):
    a, _b, c = servico.listas
    servico.resultados = [ra.ResultadoAmp(a, "falhou", None, "model timeout (etapa agente)", "DIAGNOSTICO-A\n"),
                          ra.ResultadoAmp(c, "pronto", c.item.pasta / "x.html", "x.html")]
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    _revisar(tela, qtbot, 2)
    assert _caixas(tela) == [True, None, False]
    assert _coluna_amp(tela)[0] == "falhou: model timeout (etapa agente)"
    assert tela.btn_copiar_diag.isEnabled()
    tela.btn_copiar_diag.click()
    texto = QApplication.clipboard().text()
    assert texto == ra.diagnosticos_para_copiar(tela.resultados_amp) and "DIAGNOSTICO-A" in texto


def test_conferencia_nova_refaz_a_tabela_e_nao_manda(qt_interface, qtbot, servico, avisos, ultima, tmp_path):
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    tela.fonte.ultima = UltimaConferencia(ultima.mapeadora, ultima.conferencia, [], tmp_path / "outra")
    tela.btn_amp.click()
    assert avisos == [(TITULO, AVISO_TABELA_REFEITA)]
    assert servico.rodada is None
    qtbot.waitUntil(lambda: len(servico.chamadas) == 2 and not tela.rodando(), timeout=5000)
    assert _caixas(tela) == [True, None, True]


def test_parar_vale_para_a_rodada(qt_interface, qtbot, servico, ultima):
    servico.resultados = [ra.ResultadoAmp(servico.listas[0], "parado", None, "parado antes de ir ao AMP")]
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    _revisar(tela, qtbot, 1)
    assert servico.cancelado() is False
    tela.btn_parar.click()
    assert servico.cancelado() is True
    assert _coluna_amp(tela)[0] == "parado"


def test_dois_cliques_abrem_o_html(qt_interface, qtbot, servico, ultima, monkeypatch):
    abertos = []
    monkeypatch.setattr(tela_mod.plataforma, "abrir_no_sistema", abertos.append)
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    _revisar(tela, qtbot, 2)
    tela.tabela.itemDoubleClicked.emit(tela.tabela.topLevelItem(0), 0)
    tela.tabela.itemDoubleClicked.emit(tela.tabela.topLevelItem(1), 0)
    assert abertos == [servico.listas[0].item.pasta / "x.html"]


def test_o_botao_da_pasta_abre_a_pasta_da_lista(qt_interface, qtbot, servico, ultima, monkeypatch):
    abertos = []
    monkeypatch.setattr(tela_mod.plataforma, "abrir_no_sistema", abertos.append)
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    botoes = [tela.tabela.itemWidget(tela.tabela.topLevelItem(i), tela_mod.COLUNA_PASTA) for i in range(3)]
    assert all(b is not None and b.text() == "Abrir Pasta" for b in botoes)
    botoes[2].click()
    assert abertos == [servico.listas[2].item.pasta]


def test_conferencia_rodando_avisa_e_nao_chama(qt_interface, qtbot, servico, avisos, ultima):
    tela = _tela(qtbot, ultima=ultima, rodando=True)
    tela.btn_amp.click()
    assert avisos == [(TITULO, "A conferência ainda está rodando: espere ela terminar.")]
    assert servico.rodada is None


def test_sem_conferencia_avisa(qt_interface, qtbot, servico, avisos):
    tela = _tela(qtbot, ultima=None)
    tela.btn_amp.click()
    assert avisos == [(TITULO, "Confira as revisões antes.")]
    assert servico.rodada is None


def test_rodada_grava_o_log_em_arquivo(qt_interface, qtbot, servico, ultima):
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    _revisar(tela, qtbot, 2)
    [arquivo] = list((dados_usuario.pasta_logs() / "amp").glob("amp_revisao_*.log"))
    texto = arquivo.read_text(encoding="utf-8")
    assert "linha da rodada" in texto and URL in texto and CHAVE not in texto
    _no_console(tela, qtbot, f"Log em arquivo: {arquivo}")
    assert CHAVE not in tela.console.toPlainText()


# ------------------------------------------------------------------ o webhook

@pytest.mark.parametrize("url, chave", [("", "segredo"), (URL, ""), ("", "")])
def test_sem_webhook_avisa_e_nao_chama(qt_interface, qtbot, servico, avisos, ultima, url, chave):
    tela = _tela(qtbot, controller=_Controller(url, chave), ultima=ultima)
    tela.btn_amp.click()
    tela.btn_testar_amp.click()
    assert avisos == [(TITULO, AVISO_SEM_CHAVE)] * 2
    assert servico.rodada is None and servico.testes == []


def test_mostra_o_estado_e_nunca_a_chave(qt_interface, qtbot, ultima):
    tela = _tela(qtbot, ultima=ultima)
    assert tela.lbl_webhook.text() == "Workflow AMP configurado (em Configurar IA)."
    assert CHAVE not in tela.lbl_webhook.text()
    assert not hasattr(tela, "btn_webhook")   # 2026-11-05: o webhook mora no "Configurar IA"
    sem = _tela(qtbot, controller=_Controller("", ""), ultima=ultima)
    assert sem.lbl_webhook.text() == ("Workflow AMP sem configurar: use Configurar IA, no alto da "
                                      "Conferência de Listas.")


def test_adota_o_webhook_de_antes(qt_interface, qtbot, ultima):
    controller = _Controller("", "", AMP_WEBHOOK_URL=URL, AMP_WEBHOOK_CHAVE=CHAVE)
    tela = _tela(qtbot, controller=controller, ultima=ultima)
    assert tela.lbl_webhook.text() == "Workflow AMP configurado (em Configurar IA)."
    assert controller.gravadas == [{"AMP_REVISAO_LISTAS_URL": URL, "AMP_REVISAO_LISTAS_CHAVE": CHAVE}]


def test_o_configurar_ia_grava_o_webhook_da_aba_e_a_linha_acompanha(qt_interface, qtbot, ultima):
    """[2026-11-05] O webhook se configura no "Configurar IA" da seção, com os MESMOS
    nomes que a aba usava; a linha de estado da aba acompanha na hora."""
    from sigft.app_qt.widgets.ia_do_modulo import PainelIaDoModulo

    controller = _Controller("", "")
    tela = _tela(qtbot, controller=controller, ultima=ultima)
    assert "sem configurar" in tela.lbl_webhook.text()
    painel = PainelIaDoModulo(controller, ("revisao_amp",))
    qtbot.addWidget(painel)
    painel.campo_url.setText("https://ampworkflow.gevernova.net/webhook/outro")
    painel.campo_chave.setText("nova-chave")
    assert painel.salvar()
    assert controller.gravadas[-1] == {"AMP_REVISAO_LISTAS_URL": "https://ampworkflow.gevernova.net/webhook/outro",
                                       "AMP_REVISAO_LISTAS_CHAVE": "nova-chave"}
    assert tela.lbl_webhook.text() == "Workflow AMP configurado (em Configurar IA)."


# ------------------------------------------------------------------ o teste de conexão

def test_testar_conexao_escreve_e_grava(qt_interface, qtbot, servico):
    tela = _tela(qtbot, ultima=None)
    tela.btn_testar_amp.click()
    _no_console(tela, qtbot, "OK      Ping: workflow 2026-11-03")
    assert f"Testando o AMP: {URL} · chave posta" in tela.console.toPlainText()
    assert servico.testes == [(URL, CHAVE)]
    qtbot.waitUntil(lambda: not tela.rodando(), timeout=5000)
    [arquivo] = list((dados_usuario.pasta_logs() / "amp").glob("amp_teste_*.log"))
    texto = arquivo.read_text(encoding="utf-8")
    assert "OK      Ping" in texto and CHAVE not in texto


# ------------------------------------------------------------------ reler as pastas e baixar o que falta
# [2026-11-12] O Luan: a lista sem o PDF da revisão em uso não tinha botão para baixá-lo, e o PDF
# posto à mão na pasta não destravava a lista ("ainda tá travado").

AVISO_OCUPADA = "Espere a tarefa em andamento terminar."
AVISO_NADA_A_BAIXAR = "Não falta PDF em nenhuma lista da tabela."
AVISO_TABELA_REFEITA_BAIXAR = ("A conferência mudou: a tabela foi refeita com as listas dela. Clique de novo "
                               "para baixar o que falta.")
SEM_PERFIL = "Nenhum perfil do Aconex neste Windows: cadastre-o no DocManager."


@pytest.fixture
def informacoes(monkeypatch):
    """Os QMessageBox.information do clique (thread da interface)."""
    lista = []
    monkeypatch.setattr(QMessageBox, "information", staticmethod(lambda *a: lista.append(a[1:])))
    return lista


@pytest.fixture
def aconex(monkeypatch, servico, tmp_path):
    """Dublê do perfil, do login e do download. O download "traz" o PDF que faltava: a lista do
    meio volta sem falta na releitura."""
    falso = SimpleNamespace(perfil=SimpleNamespace(nome="Luan Cozer"), cliente=object(), pedidos=[], logins=[],
                            baixado=cr.Download(OUTRO, "0B", tmp_path / "b.pdf", "baixado"))

    def conectar_aconex(perfil, log):
        falso.logins.append(perfil)
        return falso.cliente

    def baixar_o_que_falta(listas, cliente, *, log_cb, progress_cb=None, cancelado_cb=None):
        falso.pedidos.append(([lista.item.lista.codigo for lista in listas], cliente))
        log_cb("linha do download")
        servico.listas = [servico.listas[0], _lista(tmp_path, OUTRO), servico.listas[2]]
        return [falso.baixado]

    monkeypatch.setattr(tela_mod, "perfil_do_aconex", lambda _pai: falso.perfil)
    monkeypatch.setattr(tela_mod, "conectar_aconex", conectar_aconex)
    monkeypatch.setattr(tela_mod.revisao_amp_svc, "baixar_o_que_falta", baixar_o_que_falta)
    return falso


def _relida(tela, qtbot, servico, chamadas=2):
    qtbot.waitUntil(lambda: len(servico.chamadas) == chamadas and not tela.rodando(), timeout=5000)


def test_reler_as_pastas_da_caixa_a_lista_que_ganhou_o_pdf_e_mantem_as_marcas(qt_interface, qtbot, servico,
                                                                               ultima, tmp_path):
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    tela.tabela.topLevelItem(2).setCheckState(0, Qt.CheckState.Unchecked)   # a escolha fica
    servico.listas = [servico.listas[0], _lista(tmp_path, OUTRO), servico.listas[2]]   # o PDF posto à mão
    tela.btn_reler.click()
    _relida(tela, qtbot, servico)
    assert _caixas(tela) == [True, True, False]
    assert _coluna_amp(tela)[1] == ""
    _no_console(tela, qtbot, "Pastas relidas: 3 de 3 lista(s) podem ir ao AMP, 0 com falta.")
    _no_console(tela, qtbot, f"✓ {OUTRO}: não falta mais nada, e a lista ficou marcada")


def test_reler_mantem_o_que_o_amp_devolveu(qt_interface, qtbot, servico, ultima, monkeypatch):
    abertos = []
    monkeypatch.setattr(tela_mod.plataforma, "abrir_no_sistema", abertos.append)
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    _revisar(tela, qtbot, 2)
    tela.btn_reler.click()
    _relida(tela, qtbot, servico)
    assert _caixas(tela) == [False, None, False]
    assert _coluna_amp(tela) == ["HTML pronto: x.html", "falta: PDF da revisão atual", "HTML pronto: x.html"]
    tela.tabela.itemDoubleClicked.emit(tela.tabela.topLevelItem(0), 0)
    assert abertos == [servico.listas[0].item.pasta / "x.html"]


def test_reler_sem_conferencia_avisa(qt_interface, qtbot, servico, avisos):
    tela = _tela(qtbot, ultima=None)
    tela.btn_reler.click()
    assert avisos == [(TITULO, "Confira as revisões antes.")]
    assert servico.chamadas == []


def test_baixar_do_aconex_so_o_que_falta_e_reler(qt_interface, qtbot, servico, ultima, aconex):
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    tela.btn_baixar.click()
    _relida(tela, qtbot, servico)
    assert aconex.pedidos == [([OUTRO], aconex.cliente)]    # só a lista sem o PDF
    assert aconex.logins == [aconex.perfil]
    assert servico.downloads[-1] == [aconex.baixado]        # a releitura leva o que veio
    assert _caixas(tela) == [True, True, True]
    _no_console(tela, qtbot, "linha do download")


def test_baixar_sem_falta_avisa_e_nao_chama_o_aconex(qt_interface, qtbot, servico, ultima, aconex, informacoes):
    servico.listas = [servico.listas[0], servico.listas[2]]
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    tela.btn_baixar.click()
    assert informacoes == [(TITULO, AVISO_NADA_A_BAIXAR)]
    assert aconex.pedidos == [] and aconex.logins == []


def test_baixar_sem_perfil_do_aconex_avisa_no_console(qt_interface, qtbot, servico, ultima, aconex, monkeypatch):
    monkeypatch.setattr(tela_mod, "perfil_do_aconex", lambda _pai: None)
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    tela.btn_baixar.click()
    _no_console(tela, qtbot, "[AVISO] " + SEM_PERFIL)
    assert aconex.pedidos == [] and aconex.logins == []


def test_baixar_com_conferencia_nova_refaz_a_tabela_e_nao_baixa(qt_interface, qtbot, servico, avisos, ultima,
                                                                aconex, tmp_path):
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    tela.fonte.ultima = UltimaConferencia(ultima.mapeadora, ultima.conferencia, [], tmp_path / "outra")
    tela.btn_baixar.click()
    assert avisos == [(TITULO, AVISO_TABELA_REFEITA_BAIXAR)]
    _relida(tela, qtbot, servico)
    assert aconex.pedidos == []


def test_baixar_e_reler_com_a_conferencia_rodando_avisam(qt_interface, qtbot, servico, avisos, ultima, aconex):
    tela = _tela(qtbot, ultima=ultima, rodando=True)
    tela.btn_reler.click()
    tela.btn_baixar.click()
    assert avisos == [(TITULO, "A conferência ainda está rodando: espere ela terminar.")] * 2
    assert servico.chamadas == [] and aconex.pedidos == []


def test_uma_tarefa_por_vez_na_aba(qt_interface, qtbot, servico, avisos, ultima, aconex, monkeypatch):
    # Baixar e reler refazem a tabela, e a rodada escreve nela: nada começa com outra tarefa rodando.
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    monkeypatch.setattr(tela, "rodando", lambda: True)
    tela.btn_reler.click()
    tela.btn_baixar.click()
    tela.btn_amp.click()
    assert avisos == [(TITULO, AVISO_OCUPADA)] * 3
    assert servico.rodada is None and len(servico.chamadas) == 1 and aconex.pedidos == []


def test_pdf_com_outro_codigo_aparece_no_console(qt_interface, qtbot, servico, ultima):
    lista = servico.listas[0]
    antigo = lista.item.pasta / cr.nome_do_pdf("#ST00=B01MSE10&EPB020", "0A")
    servico.listas[0] = dataclasses.replace(lista, pdf_em_uso=antigo)
    tela = _carregada(_tela(qtbot, ultima=ultima), qtbot)
    _no_console(tela, qtbot, f"{CODIGO}: {antigo.name} tem outro código no nome")
    assert _caixas(tela) == [True, None, True]

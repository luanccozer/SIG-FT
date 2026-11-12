"""Módulo "Gerar Aplicação LMR": do PDF do sistema até a planilha da Aplicação LMR.

Três abas num console só, sobre os MESMOS campos (pasta do sistema, `_STATUS_PMIB`, escopo, subsistema e
trechos ficam num cartão acima das abas: um estado só):

* **1. Extração**: roda a DLC do Docling nos PDFs marcados e monta `LMR\\EXTRACAO\\`.
* **2. Análise no AMP**: chega depois (Tarefa 14 do plano).
* **3. Realizar a Aplicação LMR**: lê o CSV e grava a Aplicação e a Validação em `LMR\\SAIDA ATUAL\\`.

A tela é fina: a regra está em `services/gerar_lmr_extracao.py`, `gerar_lmr_csv.py` e `gerar_lmr_planilha.py`.
"""
from __future__ import annotations

import re
import threading
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QComboBox, QHBoxLayout, QLineEdit, QListWidget, QListWidgetItem

from sigft.app import theme
from sigft.app.idioma import marcar, t
from sigft.app_qt import file_dialogs, interface
from sigft.app_qt.widgets import blocos
from sigft.app_qt.widgets.abas import Abas
from sigft.app_qt.widgets.como_funciona import instalar_como_funciona
from sigft.app_qt.widgets.module_frame import ModuleFrame
from sigft.core import plataforma
from sigft.services import gerar_lmr_extracao as ext_svc
from sigft.services import gerar_lmr_planilha as plan_svc
from sigft.services.gerar_lmr_csv import CsvInvalido

TITULO = marcar("Gerar Aplicação LMR")
ABA_EXTRACAO = marcar("1. Extração")
ABA_ANALISE = marcar("2. Análise no AMP")
ABA_APLICACAO = marcar("3. Realizar a Aplicação LMR")
CHAVE_PASTA = "gerarlmr.pasta"
CHAVE_STATUS = "gerarlmr.status"
CHAVE_CSV = "gerarlmr.csv"
OPCOES_DE_TRECHOS = ("TODAS", "ÍMPARES", "PARES", "LISTA", "AMD", "AMC")  # nao-e-interface: o serviço lê estes valores
RESPOSTA_DO_AMP = "RESPOSTA_AMP.csv"

AVISO_SEM_PASTA = marcar("Selecione a pasta do sistema antes.")
AVISO_SEM_STATUS = marcar("Selecione o _STATUS_PMIB antes.")
AVISO_SEM_PDF = marcar("Marque pelo menos um PDF da pasta.")
AVISO_SEM_CSV = marcar("Selecione o CSV da aplicação antes.")
AVISO_SEM_NOME = marcar("Escreva o nome curto do sistema antes.")
AVISO_INSTALAR = marcar("A instalação do componente chega numa versão próxima. Por enquanto, a pasta do "
                        "componente precisa ser copiada à mão.")
AVISO_SEM_DLC = marcar("O componente de leitura dos PDFs (Docling) não está instalado.")
TEXTO_ANALISE = marcar("A análise no AMP chega depois. Por enquanto, gere o CSV pelo agente e escolha-o "
                       "na aba 3.")


def _linha(*widgets) -> QHBoxLayout:
    linha_ = QHBoxLayout()
    linha_.setSpacing(10)
    for widget in widgets:
        linha_.addWidget(widget)
    linha_.addStretch()
    return linha_


class ModuloGerarAplicacaoLMR(ModuleFrame):
    def __init__(self, parent=None, controller=None) -> None:
        self.pasta = ""
        self.status = ""
        self.csv = ""
        self.pasta_de_saida: Path | None = None
        self._parar = threading.Event()
        super().__init__(parent, controller, titulo=t(TITULO), com_progresso=True, peso_conteudo=3,
                         altura_console=theme.ALTURA_CONSOLE)
        # `dlc_instalada` roda `--versao` da DLC (um executável grande): fora da thread da interface.
        self.iniciar_tarefa(self._worker_verificar_dlc)

    # -- montagem -----------------------------------------------------------------
    def _build_ui(self) -> None:
        lay = self.content_layout
        self._campos_comuns(lay)
        self.abas = Abas()
        lay.addWidget(self.abas, 1)
        self._aba_extracao(self.abas.add(t(ABA_EXTRACAO)).layout())
        self.rotulo_analise = blocos.rotulo(t(TEXTO_ANALISE), alinhar="esquerda")
        self.abas.add(t(ABA_ANALISE)).layout().addWidget(self.rotulo_analise)
        self._aba_aplicacao(self.abas.add(t(ABA_APLICACAO)).layout())
        self.abas.set(t(ABA_EXTRACAO))
        instalar_como_funciona(self, {
            t(ABA_EXTRACAO): "GerarLMR.extracao",  # nao-e-interface
            t(ABA_ANALISE): "GerarLMR.analise",  # nao-e-interface
            t(ABA_APLICACAO): "GerarLMR.aplicacao",  # nao-e-interface
        }, abas=self.abas)

    def _campos_comuns(self, lay) -> None:
        cartao = blocos.cartao(lay)
        self.btn_pasta = blocos.botao(t("Pasta do sistema..."), variante="cinza", largura_minima=170)
        self.btn_pasta.clicked.connect(self._sel_pasta)
        self.lbl_pasta = blocos.rotulo(t("Não selecionada"), alinhar="esquerda", elidir=True, papel="legenda")
        self.btn_status = blocos.botao(t("_STATUS_PMIB..."), variante="cinza", largura_minima=150)
        self.btn_status.clicked.connect(self._sel_status)
        self.lbl_status = blocos.rotulo(t("Não selecionado"), alinhar="esquerda", elidir=True, papel="legenda")
        for botao, rotulo in ((self.btn_pasta, self.lbl_pasta), (self.btn_status, self.lbl_status)):
            linha_ = QHBoxLayout()
            linha_.setSpacing(10)
            linha_.addWidget(botao)
            linha_.addWidget(rotulo, 1)
            cartao.addLayout(linha_)

        self.campo_escopo = QLineEdit()
        self.campo_escopo.setPlaceholderText(t("Escopo"))
        self.campo_subsistema = QLineEdit()
        self.campo_subsistema.setPlaceholderText(t("Subsistema"))
        self.combo_trechos = QComboBox()
        self.combo_trechos.addItems(OPCOES_DE_TRECHOS)
        self.combo_trechos.currentTextChanged.connect(self._trechos_mudou)
        self.campo_lista = QLineEdit()
        self.campo_lista.setPlaceholderText(t("Trechos da lista, separados por vírgula"))
        self.campo_lista.setEnabled(False)
        # Numa linha só: a tela precisa caber no notebook de 1366x768 (tests/test_qt_tela_1366.py).
        cartao.addLayout(_linha(blocos.rotulo(t("Escopo"), alinhar="esquerda"), self.campo_escopo,
                                blocos.rotulo(t("Subsistema"), alinhar="esquerda"), self.campo_subsistema,
                                blocos.rotulo(t("Trechos"), alinhar="esquerda"), self.combo_trechos,
                                self.campo_lista))

    def _aba_extracao(self, lay) -> None:
        self.aviso_dlc = blocos.rotulo(t(AVISO_SEM_DLC), alinhar="esquerda", papel="aviso")
        self.btn_instalar = blocos.botao(t("Instalar componente"), variante="cinza", largura_minima=170)
        self.btn_instalar.clicked.connect(lambda: self.avisar(t(TITULO), t(AVISO_INSTALAR), "info"))
        self.aviso_dlc.hide()
        self.btn_instalar.hide()
        lay.addLayout(_linha(self.aviso_dlc, self.btn_instalar))

        self.lista_pdfs = QListWidget()
        self.lista_pdfs.setMinimumHeight(40)  # cabe no notebook de 1366x768 (tests/test_qt_tela_1366.py)
        lay.addWidget(self.lista_pdfs, 1)
        self.btn_extrair = blocos.botao(t("Extrair documentos"), variante="primario", largura_minima=190,
                                        negrito=True)
        self.btn_extrair.clicked.connect(self._extrair)
        self.btn_extrair.setEnabled(False)  # liga quando a checagem da DLC confirma
        self.btn_parar = blocos.botao(t("Parar"), variante="perigo", largura_minima=90)
        self.btn_parar.clicked.connect(self._parar.set)
        lay.addLayout(_linha(self.btn_extrair, self.btn_parar))

    def _aba_aplicacao(self, lay) -> None:
        cartao = blocos.cartao(lay)
        self.btn_csv = blocos.botao(t("CSV da aplicação..."), variante="cinza", largura_minima=170)
        self.btn_csv.clicked.connect(self._sel_csv)
        self.lbl_csv = blocos.rotulo(t("Não selecionado"), alinhar="esquerda", elidir=True, papel="legenda")
        linha_ = QHBoxLayout()
        linha_.setSpacing(10)
        linha_.addWidget(self.btn_csv)
        linha_.addWidget(self.lbl_csv, 1)
        cartao.addLayout(linha_)
        self.campo_nome = QLineEdit()
        self.campo_nome.setPlaceholderText(t("Nome curto do sistema"))
        cartao.addLayout(_linha(blocos.rotulo(t("Nome"), alinhar="esquerda"), self.campo_nome))
        self.btn_gerar = blocos.botao(t("Gerar aplicação"), variante="primario", largura_minima=170, negrito=True)
        self.btn_gerar.clicked.connect(self._gerar)
        self.btn_abrir = blocos.botao(t("Abrir a pasta"), variante="cinza", largura_minima=130)
        self.btn_abrir.clicked.connect(self._abrir_pasta)
        self.btn_abrir.setEnabled(False)
        cartao.addLayout(_linha(self.btn_gerar, self.btn_abrir))
        lay.addStretch()

    # -- campos -------------------------------------------------------------------
    def _trechos_mudou(self, opcao: str) -> None:
        self.campo_lista.setEnabled(opcao in ("LISTA", "AMD", "AMC"))

    def _sel_pasta(self) -> None:
        pasta = file_dialogs.ask_directory(CHAVE_PASTA, "pasta", titulo=t("Selecione a pasta do sistema"))
        if pasta:
            self.definir_pasta(pasta)

    def definir_pasta(self, pasta: str) -> None:
        self.pasta = pasta
        blocos.marcar_arquivo_escolhido(self.btn_pasta, self.lbl_pasta, pasta)
        raiz = Path(pasta)
        self.campo_nome.setText(raiz.name)
        self.lista_pdfs.clear()
        pdfs = sorted(p for p in raiz.iterdir() if p.is_file() and p.suffix.lower() == ".pdf") if raiz.is_dir() else []
        for pdf in pdfs:
            item = QListWidgetItem(pdf.name)
            item.setFlags(item.flags() | Qt.ItemFlag.ItemIsUserCheckable)
            item.setCheckState(Qt.CheckState.Checked)
            item.setData(Qt.ItemDataRole.UserRole, str(pdf))
            self.lista_pdfs.addItem(item)
        resposta = raiz / "LMR" / "EXTRACAO" / RESPOSTA_DO_AMP
        if resposta.is_file():
            self.definir_csv(str(resposta))
        if not self.status:
            achados = sorted(p for p in raiz.glob("_STATUS_PMIB*.xlsx") if not p.name.startswith("~$"))
            if achados:
                self.definir_status(str(achados[0]))

    def _sel_status(self) -> None:
        caminho = file_dialogs.ask_open_file(CHAVE_STATUS, "excel", titulo=t("Selecione o _STATUS_PMIB"),
                                             filetypes=[("Excel", "*.xlsx *.xlsm")])
        if caminho:
            self.definir_status(caminho)

    def definir_status(self, caminho: str) -> None:
        self.status = caminho
        if caminho:
            blocos.marcar_arquivo_escolhido(self.btn_status, self.lbl_status, caminho)

    def _sel_csv(self) -> None:
        caminho = file_dialogs.ask_open_file(CHAVE_CSV, "excel", titulo=t("Selecione o CSV da aplicação"),
                                             filetypes=[("CSV", "*.csv *.txt")])
        if caminho:
            self.definir_csv(caminho)

    def definir_csv(self, caminho: str) -> None:
        self.csv = caminho
        blocos.marcar_arquivo_escolhido(self.btn_csv, self.lbl_csv, caminho)

    def pdfs_marcados(self) -> list[Path]:
        return [Path(self.lista_pdfs.item(i).data(Qt.ItemDataRole.UserRole))
                for i in range(self.lista_pdfs.count())
                if self.lista_pdfs.item(i).checkState() == Qt.CheckState.Checked]

    # -- a DLC --------------------------------------------------------------------
    def _worker_verificar_dlc(self) -> None:
        interface.na_interface(self._mostrar_dlc, ext_svc.dlc_instalada())

    def _mostrar_dlc(self, instalada: bool) -> None:
        self.btn_extrair.setEnabled(bool(instalada))
        self.aviso_dlc.setVisible(not instalada)
        self.btn_instalar.setVisible(not instalada)

    # -- extração -----------------------------------------------------------------
    def _extrair(self) -> None:
        if not self.pasta:
            self.avisar(t(TITULO), t(AVISO_SEM_PASTA), "aviso")
            return
        if not self.status:
            self.avisar(t(TITULO), t(AVISO_SEM_STATUS), "aviso")
            return
        pdfs = self.pdfs_marcados()
        if not pdfs:
            self.avisar(t(TITULO), t(AVISO_SEM_PDF), "aviso")
            return
        self._parar.clear()
        self.iniciar_tarefa(self._worker_extrair, pdfs, self.status, self.pasta, botao=self.btn_extrair)

    def _worker_extrair(self, pdfs, status: str, pasta: str) -> None:
        self.log(f"Extraindo {len(pdfs)} documento(s) de {pasta}...")
        try:
            extracao = ext_svc.extrair(pdfs, Path(status), Path(pasta), log_cb=self.log,
                                       progresso_cb=self._progresso, parar=self._parar.is_set)
        except ext_svc.ExtracaoInterrompida:
            self.log("Extração interrompida: os arquivos já lidos ficam na pasta LMR\\EXTRACAO.", "warn")
            return
        except (CsvInvalido, OSError, ValueError) as erro:
            self._erro(erro)
            return
        self.log(f"Extração pronta: {extracao.documentos} documento(s), {extracao.paginas} página(s) "
                 f"({extracao.paginas_ocr} por OCR), {extracao.lotes} lote(s) em {extracao.pasta}.")
        if extracao.nao_lidos:
            self.log(f"  ⚠️ Não lidos: {', '.join(extracao.nao_lidos)}", "warn")

    def _progresso(self, atual: int, total: int, *, item=None) -> None:
        if self.progress_bar is not None and total:
            interface.na_interface(blocos.definir_progresso, self.progress_bar, atual / total)

    def _erro(self, erro: Exception) -> None:
        """Erro esperado do serviço: mensagem clara no console, sem traceback."""
        self.log(f"❌ {erro}", "error")
        self._tarefa_falhou = True

    # -- aplicação ----------------------------------------------------------------
    def _lista_de_trechos(self) -> list[str] | None:
        nomes = [x for x in re.split(r"[,;\s]+", self.campo_lista.text()) if x]
        return nomes or None

    def _gerar(self) -> None:
        for vazio, aviso in ((not self.pasta, AVISO_SEM_PASTA), (not self.status, AVISO_SEM_STATUS),
                             (not self.csv, AVISO_SEM_CSV), (not self.campo_nome.text().strip(), AVISO_SEM_NOME)):
            if vazio:
                self.avisar(t(TITULO), t(aviso), "aviso")
                return
        argumentos = (Path(self.csv), Path(self.status), Path(self.pasta), self.campo_nome.text().strip(),
                      self.campo_escopo.text().strip(), self.campo_subsistema.text().strip(),
                      self.combo_trechos.currentText(), self._lista_de_trechos())
        self.iniciar_tarefa(self._worker_gerar, *argumentos, botao=self.btn_gerar)

    def _worker_gerar(self, csv, status, pasta, nome, escopo, subsistema, opcao, lista) -> None:
        try:
            saida = plan_svc.realizar_aplicacao(
                csv, status, pasta, nome=nome, escopo=escopo, subsistema=subsistema, opcao_trechos=opcao,
                lista_trechos=lista, log_cb=self.log, retry_lock=self.perguntar_retry_excel)
        except (CsvInvalido, plan_svc.NaoDaParaGravar, ValueError) as erro:
            self._erro(erro)
            return
        self.log(f"Aplicação em {saida.aplicacao.parent}: {saida.linhas} linhas, {saida.bloqueadas} "
                 f"bloqueadas, {saida.avisos} avisos.")
        self.pasta_de_saida = saida.aplicacao.parent
        interface.na_interface(self.btn_abrir.setEnabled, True)

    def _abrir_pasta(self) -> None:
        alvo = self.pasta_de_saida or (Path(self.pasta) if self.pasta else None)
        if alvo is None:
            return
        try:
            plataforma.abrir_no_sistema(alvo)
        except Exception as erro:  # noqa: BLE001 -- vira log
            self.log(f"Não foi possível abrir a pasta: {erro}")

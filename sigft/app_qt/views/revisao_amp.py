"""Aba "Revisão no AMP" do PMIB Manager: manda ao AMP (o n8n da GE) as listas marcadas da
última conferência, uma por vez, e mostra o que voltou de cada uma.

A tela é fina: a rodada, o pedido e o diagnóstico estão em `services/revisao_amp.py`, e a
chamada em `core/amp/cliente.py`. As listas saem da última conferência da aba ao lado
(`fonte.ultima`, a `UltimaConferencia` da Conferência de Revisões) e aparecem assim que a aba
abre, todas marcadas: o Luan desmarca as que não quer. O endereço e a chave do webhook moram
no "Configurar IA" da Conferência de Listas (desde 2026-11-05; antes, o botão Webhook… desta aba), com nomes deste workflow; a chave nunca
aparece na tela nem no log. Cada rodada e cada teste de conexão gravam as linhas do console em
`logs\\amp\\` (`core/log_execucao.py`).
Desenho: `docs/superpowers/specs/2026-11-03-amp-revisao-com-arquivos-design.md`, §5.

[2026-11-12] A lista com falta de PDF não tinha saída na aba (o Luan: "não tenho nenhum botão pra
baixar do Aconex" e, com o PDF posto à mão, "ainda tá travado"). "Baixar do Aconex o que falta"
baixa a revisão em uso e a atual das listas sem PDF (a da lista que mudou de código sai pelo
Tracking ID) e relê; "Reler as pastas" vê o que foi posto à mão, até com o código antigo da lista.
Nos dois, a tabela fica como estava (marcas e o que o AMP devolveu), e a lista que deixou de ter
falta ganha a caixa, marcada.
"""
from __future__ import annotations

import threading

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QApplication, QHBoxLayout

from sigft import __version__
from sigft.app.idioma import marcar, t
from sigft.app_qt import interface
from sigft.app_qt.views.conferencia_revisoes import conectar_aconex, perfil_do_aconex
from sigft.app_qt.widgets.ia_do_modulo import avisos as avisos_da_ia, chaves_do_webhook_so
from sigft.app_qt.widgets import blocos, dialogos_selecao, webhook_amp
from sigft.app_qt.widgets.module_frame import ModuleFrame
from sigft.core import dados_usuario, log_execucao, plataforma
from sigft.core.amp.cliente import ClienteAmp
from sigft.services import revisao_amp as revisao_amp_svc

# Os nomes deste workflow no `api_config.json`. Os antigos (Configuração → Chaves de API, até
# 2026-11-03) são adotados uma vez.
# [2026-11-05] Os nomes vêm do "Configurar IA" (`ia_por_modulo.SO_WORKFLOW`): é lá que o
# webhook se configura agora, e não mais num botão desta aba.
CHAVES_DO_WEBHOOK = chaves_do_webhook_so("revisao_amp")

TITULO = marcar("Revisão no AMP")
AVISO_SEM_CONFERENCIA = marcar("Confira as revisões antes.")
AVISO_CONFERENCIA_RODANDO = marcar("A conferência ainda está rodando: espere ela terminar.")
AVISO_SEM_CHAVE = marcar("Configure o endereço e a chave do webhook em Configurar IA, no alto da Conferência de Listas.")
AVISO_NENHUMA_MARCADA = marcar("Marque ao menos uma lista para mandar ao AMP.")
AVISO_TABELA_REFEITA = marcar("A conferência mudou: a tabela foi refeita com as listas dela. Confira as "
                              "marcas e clique em Revisar no AMP de novo.")
AVISO_TABELA_REFEITA_BAIXAR = marcar("A conferência mudou: a tabela foi refeita com as listas dela. Clique de "
                                     "novo para baixar o que falta.")
AVISO_OCUPADA = marcar("Espere a tarefa em andamento terminar.")
AVISO_NADA_A_BAIXAR = marcar("Não falta PDF em nenhuma lista da tabela.")
SEM_PERFIL_DO_ACONEX = marcar("Nenhum perfil do Aconex neste Windows: cadastre-o no DocManager.")
WEBHOOK_NAO_CONFIGURADO = marcar("Workflow AMP sem configurar: use Configurar IA, no alto da Conferência de Listas.")
WEBHOOK_CONFIGURADO = marcar("Workflow AMP configurado (em Configurar IA).")
EXPLICACAO = marcar("Manda ao AMP, uma por vez, as listas marcadas da última conferência (aba Conferência "
                    "de Revisões). A lista com diferença volta como um HTML na pasta do _STATUS_PMIB, com o que "
                    "mudou e as linhas a colar no controle; a sem diferença não gera arquivo. Nada é aplicado no "
                    "Excel. Dois cliques numa lista abrem o HTML.")

# O que a coluna "AMP" diz de cada lista. A falta vem pronta do serviço ("falta: ...").
# [2026-11-11] O HTML diz no título se a mudança é significativa ou só de texto; sem o título
# combinado (o agente de antes), fica o "HTML pronto" de sempre.
NA_FILA = marcar("na fila")
PRONTO = marcar("HTML pronto: {nome}")
PRONTO_SIGNIFICATIVA = marcar("HTML pronto (mudança significativa): {nome}")
PRONTO_SO_TEXTO = marcar("HTML pronto (só correção de texto): {nome}")
SEM_DIFERENCAS = marcar("sem diferenças")
FALHOU = marcar("falhou: {erro}")
PARADO = marcar("parado")
_PRONTO_POR_CLASSIFICACAO = {revisao_amp_svc.SIGNIFICATIVA: PRONTO_SIGNIFICATIVA,
                             revisao_amp_svc.SO_TEXTO: PRONTO_SO_TEXTO}

# Os nomes vão em `marcar` e são traduzidos onde a tabela é montada (`t(c)`). As larguras
# somam 850: cabem na aba a 1280x850 (as colunas esticam, mas não encolhem).
COLUNAS = (
    (marcar("Código"), 180),
    (marcar("Revisão em uso"), 100),
    (marcar("Revisão atual"), 100),
    (marcar("STATUS REAL"), 110),
    (marcar("AMP"), 270),
    (marcar("Pasta"), 90),
)
COLUNA_AMP = 4
COLUNA_PASTA = 5


def _linha(*widgets) -> QHBoxLayout:
    linha_ = QHBoxLayout()
    linha_.setSpacing(15)
    for widget in widgets:
        linha_.addWidget(widget)
    linha_.addStretch()
    return linha_


def _texto_amp(resultado) -> str:
    if resultado.situacao == "pronto":
        return t(_PRONTO_POR_CLASSIFICACAO.get(resultado.classificacao, PRONTO), nome=resultado.html.name)
    if resultado.situacao == "sem_diferencas":
        return t(SEM_DIFERENCAS)
    if resultado.situacao == "falhou":
        return t(FALHOU, erro=resultado.detalhe)
    if resultado.situacao == "parado":
        return t(PARADO)
    return resultado.detalhe


def _chave(chave: str) -> str:
    return "posta" if chave else "não posta"  # nao-e-interface: vai só para o log


class ModuloRevisaoAmp(ModuleFrame):
    def __init__(self, parent=None, controller=None, *, fonte=None, embutida=False, console_externo=None,
                 progresso_externo=None) -> None:
        self.fonte = fonte                          # a aba Conferência de Revisões (`fonte.ultima`)
        self.resultados_amp: list[revisao_amp_svc.ResultadoAmp] = []
        self._listas_na_tabela: list = []           # uma ListaParaAmp por linha, na ordem da tabela
        self._conferencia_na_tabela = None          # a `UltimaConferencia` que a tabela mostra
        self._downloads_da_aba: list = []           # o que o "Baixar do Aconex" trouxe para ela
        self._carregando = False
        self._linha_da_lista: dict[int, int] = {}   # id(ListaParaAmp) -> linha da tabela
        self._resultado_na_linha: list = []
        self._cancelado = threading.Event()
        super().__init__(parent, controller, titulo=t(TITULO), com_progresso=True, embutida=embutida,
                         console_externo=console_externo, progresso_externo=progresso_externo)

    # -- montagem ----------------------------------------------------------
    def _build_ui(self) -> None:
        lay = self.content_layout
        cartao = blocos.cartao(lay)
        self.lbl_explicacao = blocos.rotulo(t(EXPLICACAO), alinhar="esquerda", papel="legenda")
        cartao.addWidget(self.lbl_explicacao)
        self.lbl_webhook = blocos.rotulo("", alinhar="esquerda", elidir=True)
        cartao.addWidget(self.lbl_webhook)

        self.btn_amp = blocos.botao(t("Revisar no AMP"), variante="primario", largura_minima=180, negrito=True)
        self.btn_amp.clicked.connect(self._revisar)
        self.btn_testar_amp = blocos.botao(t("Testar conexão com o AMP"), variante="cinza", largura_minima=200)
        self.btn_testar_amp.clicked.connect(self._testar_conexao)
        self.btn_copiar_diag = blocos.botao(t("Copiar diagnóstico"), variante="cinza", largura_minima=160)
        self.btn_copiar_diag.clicked.connect(self._copiar_diagnostico)
        self.btn_copiar_diag.setEnabled(False)      # só com alguma falha na rodada
        self.btn_parar = blocos.botao(t("Parar"), variante="perigo", largura_minima=90)
        self.btn_parar.clicked.connect(self._parar)
        cartao.addLayout(_linha(self.btn_amp, self.btn_testar_amp, self.btn_copiar_diag,
                                self.btn_parar))

        self.btn_marcar = blocos.botao(t("Marcar todas"), variante="cinza", largura_minima=140)
        self.btn_marcar.clicked.connect(lambda _marcado=False: self._marcar_todas(True))
        self.btn_desmarcar = blocos.botao(t("Desmarcar todas"), variante="cinza", largura_minima=140)
        self.btn_desmarcar.clicked.connect(lambda _marcado=False: self._marcar_todas(False))
        self.btn_reler = blocos.botao(t("Reler as pastas"), variante="cinza", largura_minima=140)
        self.btn_reler.clicked.connect(self._reler)
        self.btn_baixar = blocos.botao(t("Baixar do Aconex o que falta"), variante="cinza", largura_minima=220)
        self.btn_baixar.clicked.connect(self._baixar)
        lay.addLayout(_linha(self.btn_marcar, self.btn_desmarcar, self.btn_reler, self.btn_baixar))

        # Sem barra de lado: as colunas esticam até a largura da tela (`EsticaColunas`), e as
        # larguras somam 850, que cabem a 1280x850 (nenhuma tela rola de lado).
        self.tabela = dialogos_selecao.tabela_ttk([(t(c), largura, "w") for c, largura in COLUNAS],
                                                  barra_horizontal=False)
        self.tabela.itemDoubleClicked.connect(self._abrir_html)
        lay.addWidget(self.tabela, 1)
        self._mostrar_webhook()
        # O "Configurar IA" grava o webhook: a linha de estado acompanha na hora.
        avisos_da_ia().mudou.connect(self._ia_mudou)

    def _ia_mudou(self, _tarefa: str) -> None:
        self._mostrar_webhook()

    def showEvent(self, evento) -> None:  # noqa: N802 -- nome do Qt
        # O webhook pode ter mudado, e a Conferência pode ter rodado de novo, com a aba já montada.
        self._mostrar_webhook()
        self.atualizar_listas()
        super().showEvent(evento)

    # -- o webhook ---------------------------------------------------------
    def _webhook(self) -> tuple[str, str]:
        """(endereço, chave) deste workflow (`CHAVES_DO_WEBHOOK`)."""
        return webhook_amp.ler(self.controller, CHAVES_DO_WEBHOOK)

    def _mostrar_webhook(self) -> None:
        url, chave = self._webhook()
        self.lbl_webhook.setText(t(WEBHOOK_CONFIGURADO) if url and chave else t(WEBHOOK_NAO_CONFIGURADO))

    def _webhook_ou_aviso(self) -> tuple[str, str] | None:
        """O endereço e a chave; faltando um deles, o aviso, e nada é chamado."""
        url, chave = self._webhook()
        if not url or not chave:
            self.avisar(t(TITULO), t(AVISO_SEM_CHAVE), "aviso")
            return None
        return url, chave


    def _log_em_arquivo(self, nome: str, url: str, chave: str):
        """O log em `logs\\amp\\` (as linhas do console, com a hora) e o callback que escreve nos
        dois. A chave não vai: só se ela está posta."""
        arquivo = log_execucao.LogDeExecucao(nome, pasta=str(dados_usuario.pasta_logs() / "amp"),
                                             contexto={"SIG-FT": __version__, "webhook": url,
                                                       "chave": _chave(chave)})
        log = arquivo.envolver(self.log)
        log(f"Log em arquivo: {arquivo.caminho}")
        return arquivo, log

    # -- as listas ---------------------------------------------------------
    def _listas(self, ultima, extras=()) -> list:
        """As listas da conferência, com os arquivos de cada uma como estão nas pastas agora. Na
        thread do worker: o levantamento da pasta raiz pode demorar. `extras` são os downloads
        desta aba ("Baixar do Aconex o que falta")."""
        if ultima is None:
            return []
        return revisao_amp_svc.listas_para_amp(ultima.conferencia, [*ultima.downloads, *extras],
                                               ultima.mapeadora.caminho.parent, ultima.pasta_raiz)

    def atualizar_listas(self) -> None:
        """Enche a tabela com as listas da última conferência, se ela ainda não as mostra. Não
        mexe com a Conferência rodando nem no meio de uma rodada."""
        ultima = getattr(self.fonte, "ultima", None)
        if ultima is None or ultima is self._conferencia_na_tabela or self._carregando or self.rodando():
            return
        if getattr(self.fonte, "rodando", lambda: False)():
            return
        self._carregar(ultima)

    def _carregar(self, ultima, botao=None) -> None:
        """Lê as listas numa tarefa. Com a conferência que a tabela já mostra, é a releitura das
        pastas: leva os downloads da aba e o que faltava em cada lista, para o console dizer o que
        mudou."""
        releitura = ultima is self._conferencia_na_tabela
        extras = list(self._downloads_da_aba) if releitura else []
        faltava = {lista.item.lista.codigo: lista.falta for lista in self._listas_na_tabela} if releitura else None
        self._carregando = True
        self.iniciar_tarefa(self._worker_carregar, ultima, extras, faltava, botao=botao)

    def _worker_carregar(self, ultima, extras=(), faltava=None) -> None:
        listas = None
        try:
            listas = self._listas(ultima, extras)
            podem = sum(1 for lista in listas if not lista.falta)
            if faltava is None:
                self.log(f"Revisão no AMP: {len(listas)} lista(s) na conferência; {podem} podem ir ao AMP, "
                         f"{len(listas) - podem} com falta.")
            else:
                self.log(f"Pastas relidas: {podem} de {len(listas)} lista(s) podem ir ao AMP, "
                         f"{len(listas) - podem} com falta.")
            for lista in listas:
                codigo = lista.item.lista.codigo
                if faltava is not None and faltava.get(codigo) and not lista.falta:
                    self.log(f"  ✓ {codigo}: não falta mais nada, e a lista ficou marcada")
                for pdf in revisao_amp_svc.com_outro_codigo(lista):
                    self.log(f"  ! {codigo}: {pdf.name} tem outro código no nome (a lista mudou de código no "
                             "Aconex); vai ao AMP assim")
        finally:
            interface.na_interface(self._mostrar_listas, listas, ultima)

    def _estado_das_linhas(self) -> dict:
        """Por código: a marca (`None` na lista com falta, que não tem caixa) e o que o AMP devolveu."""
        estado = {}
        for i, lista in enumerate(self._listas_na_tabela):
            marcada = None if lista.falta else self.tabela.topLevelItem(i).checkState(0) == Qt.CheckState.Checked
            estado[lista.item.lista.codigo] = (marcada, self._resultado_na_linha[i])
        return estado

    def _mostrar_listas(self, listas, ultima) -> None:
        self._carregando = False
        if listas is None:          # o erro já foi para o console (`iniciar_tarefa`)
            return
        # Na releitura, cada lista fica como estava: a marca e o que o AMP devolveu. A que tinha
        # falta e não tem mais entra marcada, como as listas de uma conferência nova.
        releitura = ultima is self._conferencia_na_tabela
        antes = self._estado_das_linhas() if releitura else {}
        if not releitura:
            self._downloads_da_aba = []
        self.tabela.clear()
        self._listas_na_tabela = list(listas)
        self._conferencia_na_tabela = ultima
        self._linha_da_lista = {id(lista): i for i, lista in enumerate(listas)}
        self._resultado_na_linha = [None] * len(listas)
        for i, lista in enumerate(listas):
            dados = lista.item.lista
            marcada, resultado = antes.get(dados.codigo, (None, None))
            if lista.falta:
                resultado = None
            amp = lista.falta or (_texto_amp(resultado) if resultado is not None else "")
            item = dialogos_selecao.linha_ttk(self.tabela, (dados.codigo, dados.revisao_em_uso, lista.revisao_atual,
                                                            dados.status_real, amp, ""))
            dialogos_selecao.botao_de_pasta(self.tabela, item, COLUNA_PASTA, lista.item.pasta, self._abrir_pasta)
            self._resultado_na_linha[i] = resultado
            # O QTreeWidgetItem já nasce marcável: a lista com falta perde isso e fica sem caixa.
            if lista.falta:
                item.setFlags(item.flags() & ~Qt.ItemFlag.ItemIsUserCheckable)
            else:
                item.setFlags(item.flags() | Qt.ItemFlag.ItemIsUserCheckable)
                item.setCheckState(0, Qt.CheckState.Unchecked if marcada is False else Qt.CheckState.Checked)

    # -- reler as pastas e baixar o que falta (2026-11-12) -----------------
    def _ocupada(self) -> bool:
        """Uma coisa por vez: a rodada escreve na tabela, e baixar ou reler a refaz. Com a
        Conferência rodando, a última conferência ainda está sem os downloads."""
        if getattr(self.fonte, "rodando", lambda: False)():
            self.avisar(t(TITULO), t(AVISO_CONFERENCIA_RODANDO), "aviso")
            return True
        if self.rodando():
            self.avisar(t(TITULO), t(AVISO_OCUPADA), "aviso")
            return True
        return False

    def _reler(self) -> None:
        """Relê as pastas das listas: o PDF posto à mão, mesmo com o código antigo da lista, passa
        a valer, e a lista que deixou de ter falta ganha a caixa, marcada."""
        if self._ocupada():
            return
        ultima = getattr(self.fonte, "ultima", None)
        if ultima is None:
            self.avisar(t(TITULO), t(AVISO_SEM_CONFERENCIA), "aviso")
            return
        self._carregar(ultima, botao=self.btn_reler)

    def _baixar(self) -> None:
        """Baixa do Aconex os PDFs que faltam nas listas da tabela (a revisão em uso e a atual) e
        relê as pastas. O perfil é o do cofre do DocManager, como na Conferência de Revisões."""
        if self._ocupada():
            return
        ultima = getattr(self.fonte, "ultima", None)
        if ultima is None:
            self.avisar(t(TITULO), t(AVISO_SEM_CONFERENCIA), "aviso")
            return
        if ultima is not self._conferencia_na_tabela:
            self.atualizar_listas()
            self.avisar(t(TITULO), t(AVISO_TABELA_REFEITA_BAIXAR), "aviso")
            return
        faltam = [lista for lista in self._listas_na_tabela if revisao_amp_svc.faltam_pdfs(lista)]
        if not faltam:
            self.avisar(t(TITULO), t(AVISO_NADA_A_BAIXAR), "info")
            return
        perfil = perfil_do_aconex(self)
        if perfil is None:
            self.log("[AVISO] " + t(SEM_PERFIL_DO_ACONEX))
            return
        self._cancelado.clear()
        self.iniciar_tarefa(self._worker_baixar, ultima, faltam, perfil, botao=self.btn_baixar)

    def _worker_baixar(self, ultima, faltam, perfil) -> None:
        self.log(f"Baixar do Aconex o que falta: {len(faltam)} lista(s) sem um dos PDFs "
                 f"({', '.join(lista.item.lista.codigo for lista in faltam)}).")
        cliente = conectar_aconex(perfil, self.log)
        if cliente is None:
            return
        downloads = revisao_amp_svc.baixar_o_que_falta(faltam, cliente, log_cb=self.log, progress_cb=self._progresso,
                                                       cancelado_cb=self._cancelado.is_set)
        interface.na_interface(self._depois_de_baixar, ultima, downloads)

    def _depois_de_baixar(self, ultima, downloads) -> None:
        """Guarda o que veio e relê as pastas, se a tabela ainda é a desta conferência."""
        if ultima is not self._conferencia_na_tabela:
            return
        self._downloads_da_aba.extend(downloads)
        self._carregar(ultima)

    def _itens_com_caixa(self):
        for i, lista in enumerate(self._listas_na_tabela):
            if not lista.falta:
                yield lista, self.tabela.topLevelItem(i)

    def _marcar_todas(self, marcada: bool) -> None:
        estado = Qt.CheckState.Checked if marcada else Qt.CheckState.Unchecked
        for _lista, item in self._itens_com_caixa():
            item.setCheckState(0, estado)

    def marcadas(self) -> list:
        return [lista for lista, item in self._itens_com_caixa() if item.checkState(0) == Qt.CheckState.Checked]

    def _travar_caixas(self, travar: bool) -> None:
        """Durante a rodada as caixas não mudam: a tabela diz o que foi mandado."""
        for _lista, item in self._itens_com_caixa():
            flags = item.flags()
            item.setFlags(flags & ~Qt.ItemFlag.ItemIsUserCheckable if travar
                          else flags | Qt.ItemFlag.ItemIsUserCheckable)
        self.btn_marcar.setEnabled(not travar)
        self.btn_desmarcar.setEnabled(not travar)

    # -- a revisão ---------------------------------------------------------
    def _revisar(self) -> None:
        # Com a Conferência ainda baixando, a última conferência está sem os downloads, e
        # um PDF pode estar pela metade; com o download da aba ou a releitura, a tabela vai mudar.
        if self._ocupada():
            return
        ultima = getattr(self.fonte, "ultima", None)
        if ultima is None:
            self.avisar(t(TITULO), t(AVISO_SEM_CONFERENCIA), "aviso")
            return
        webhook = self._webhook_ou_aviso()
        if webhook is None:
            return
        if ultima is not self._conferencia_na_tabela:
            self.atualizar_listas()
            self.avisar(t(TITULO), t(AVISO_TABELA_REFEITA), "aviso")
            return
        listas = self.marcadas()
        if not listas:
            self.avisar(t(TITULO), t(AVISO_NENHUMA_MARCADA), "aviso")
            return
        vao = {id(lista) for lista in listas}
        desmarcadas = [lista.item.lista.codigo for lista, _item in self._itens_com_caixa() if id(lista) not in vao]
        com_falta = [lista.item.lista.codigo for lista in self._listas_na_tabela if lista.falta]
        self._cancelado.clear()
        self.resultados_amp = []
        self.btn_copiar_diag.setEnabled(False)
        self._travar_caixas(True)
        for lista in listas:
            self.tabela.topLevelItem(self._linha_da_lista[id(lista)]).setText(COLUNA_AMP, t(NA_FILA))
        self.iniciar_tarefa(self._worker_revisar, listas, desmarcadas, com_falta, *webhook, botao=self.btn_amp)

    def _worker_revisar(self, listas, desmarcadas, com_falta, url: str, chave: str) -> None:
        resultados: list = []
        arquivo, log = self._log_em_arquivo("amp_revisao", url, chave)
        try:
            resultados = revisao_amp_svc.revisar_listas(
                listas, ClienteAmp(url, chave, log_cb=log), versao_sigft=__version__, url=url,
                chave_posta=bool(chave), log_cb=log, progress_cb=self._progresso,
                cancelado_cb=self._cancelado.is_set, desmarcadas=desmarcadas, com_falta=com_falta,
                resultado_cb=lambda resultado: interface.na_interface(self._mostrar_resultado, resultado))
        finally:
            arquivo.fechar()
            interface.na_interface(self._terminar, resultados)

    def _mostrar_resultado(self, resultado) -> None:
        indice = self._linha_da_lista.get(id(resultado.lista))
        if indice is None:
            return
        self._resultado_na_linha[indice] = resultado
        self.tabela.topLevelItem(indice).setText(COLUNA_AMP, _texto_amp(resultado))

    def _terminar(self, resultados) -> None:
        self.resultados_amp = list(resultados)
        self._travar_caixas(False)
        # A lista que voltou, com HTML ou sem diferenças, se desmarca: um segundo clique manda só as
        # que faltaram.
        for resultado in self.resultados_amp:
            indice = self._linha_da_lista.get(id(resultado.lista))
            if resultado.situacao in ("pronto", "sem_diferencas") and indice is not None:
                self.tabela.topLevelItem(indice).setCheckState(0, Qt.CheckState.Unchecked)
        falhas = sum(1 for r in self.resultados_amp if r.situacao == "falhou")
        self.btn_copiar_diag.setEnabled(any(r.diagnostico for r in self.resultados_amp))
        if falhas:
            self.log(f"[AVISO] {falhas} lista(s) falharam. \"Copiar diagnóstico\" copia o texto de cada uma, "
                     "sem conteúdo de documento e sem a chave, para colar numa conversa nova com o Claude.")

    def _progresso(self, fracao: float) -> None:
        if self.progress_bar is not None:
            interface.na_interface(blocos.definir_progresso, self.progress_bar, fracao)

    def _parar(self) -> None:
        self._cancelado.set()
        self.log("Parada pedida: termino a lista que está no AMP e paro.")

    def _copiar_diagnostico(self) -> None:
        texto = revisao_amp_svc.diagnosticos_para_copiar(self.resultados_amp)
        if not texto:
            return
        QApplication.clipboard().setText(texto)
        self.log("Diagnóstico copiado. Cole numa conversa nova com o Claude, com o repositório do SIG-FT.")

    def _abrir_pasta(self, pasta) -> None:
        try:
            plataforma.abrir_no_sistema(pasta)
        except OSError as erro:
            self.log(f"[AVISO] Não consegui abrir a pasta {pasta}: {erro}")

    def _abrir_html(self, item, _coluna=0) -> None:
        indice = self.tabela.indexOfTopLevelItem(item)
        resultado = self._resultado_na_linha[indice] if 0 <= indice < len(self._resultado_na_linha) else None
        if resultado is None or resultado.html is None:
            return
        try:
            plataforma.abrir_no_sistema(resultado.html)
        except OSError as erro:
            self.log(f"[AVISO] Não consegui abrir {resultado.html.name}: {erro}")

    # -- o teste de conexão ------------------------------------------------
    def _testar_conexao(self) -> None:
        webhook = self._webhook_ou_aviso()
        if webhook is None:
            return
        self.iniciar_tarefa(self._worker_testar, *webhook, botao=self.btn_testar_amp)

    def _worker_testar(self, url: str, chave: str) -> None:
        arquivo, log = self._log_em_arquivo("amp_teste", url, chave)
        try:
            log(f"Testando o AMP: {url} · chave {_chave(chave)}")
            for linha in revisao_amp_svc.testar_conexao(ClienteAmp(url, chave, log_cb=log)):
                log(linha)
        finally:
            arquivo.fechar()

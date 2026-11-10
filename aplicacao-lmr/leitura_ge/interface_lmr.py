"""Interface (PyQt6) do gerador da Base LMR / Aplicação LMR dos sistemas SAE.

Abrir: duplo clique em 'Abrir Interface LMR.bat' ou  py -X utf8 interface_lmr.py
Autoteste (sem janela): py -X utf8 interface_lmr.py --autoteste

Ela só chama os scripts que já existem (gerar_base_auto.py, gerar_base_lmr.py, rodar_workflow_b.py, autotestes)
e mostra o que eles gravam em <sistema>/LMR/SAIDA ATUAL e o STATUS.md de cada sistema.
"""
import glob
import json
import os
import sys

import openpyxl
from PyQt6.QtCore import QProcess, QProcessEnvironment, Qt, QUrl
from PyQt6.QtGui import QDesktopServices, QFont
from PyQt6.QtWidgets import (QApplication, QComboBox, QFormLayout, QGroupBox, QHBoxLayout, QHeaderView, QLabel,
                             QLineEdit, QListWidget, QMainWindow, QMessageBox, QPlainTextEdit, QPushButton, QSplitter,
                             QTableWidget, QTableWidgetItem, QTabWidget, QTextBrowser, QVBoxLayout, QWidget)

from gerar_base_lmr import AJUSTES, AQUI, SAE, SAIDA, arquivo_raiz
from rodar_workflow_b import nomes_saida

TABELA = 'TABELA DE LOCALIZAÇÃO - LMR.xlsx'


def configs_por_pasta():
    """Nome da pasta do sistema -> (caminho do config, config). O auto_*.json perde para o config escrito à mão."""
    out = {}
    for f in sorted(glob.glob(os.path.join(AQUI, 'configs', '*.json')), key=lambda f: not os.path.basename(f).startswith('auto_')):
        with open(f, encoding='utf-8') as fh:
            c = json.load(fh)
        out[os.path.basename(os.path.normpath(c['pasta']))] = (f, c)
    return out


def resumo_validacao(path):
    """RESUMO da VALIDAÇÃO gravada por rodar_workflow_b.py: {Assinatura, Linhas na aplicação, Linhas bloqueadas}."""
    wb = openpyxl.load_workbook(path, read_only=True)
    try:
        return {r[0]: r[1] for r in wb['RESUMO'].iter_rows(max_row=3, values_only=True) if r and r[0]}
    finally:
        wb.close()


def saidas(pasta_sistema):
    """Linhas da tabela de saídas: (BASE, APLICAÇÃO existe?, assinatura, linhas, bloqueadas)."""
    d = os.path.join(pasta_sistema, *SAIDA.split('/'))
    linhas = []
    for base in sorted(glob.glob(os.path.join(d, 'BASE LMR*.xlsx'))):
        apl, val = nomes_saida(base)  # Windows não diferencia maiúsculas: 'Aplicação LMR - X' também conta
        r = resumo_validacao(val) if os.path.exists(val) else {}
        linhas.append((base, os.path.exists(apl), r.get('Assinatura', '-'), r.get('Linhas na aplicação', '-'), r.get('Linhas bloqueadas', '-')))
    return linhas


class Janela(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('Gerador LMR - Serviços Auxiliares Essenciais')
        self.resize(1200, 760)
        self.cfgs = configs_por_pasta()
        self.fila, self.proc = [], None

        self.lista = QListWidget()
        self.lista.addItems(sorted(n for n in os.listdir(SAE) if os.path.isdir(os.path.join(SAE, n, 'LMR'))))
        self.lista.currentTextChanged.connect(self.mostrar)

        # --- ações
        self.escopo, self.subsistema, self.nome = QLineEdit('CC'), QLineEdit(), QLineEdit()
        self.nome.setToolTip('Nome do sistema nos arquivos gerados. Curto: o caminho no Box não pode passar de 259 caracteres.')
        self.base = QComboBox()
        form = QFormLayout()
        form.addRow('Escopo', self.escopo)
        form.addRow('Subsistema', self.subsistema)
        form.addRow('Nome curto', self.nome)
        form.addRow('BASE', self.base)
        self.botoes = []

        def botao(txt, fn, dica):
            b = QPushButton(txt); b.clicked.connect(fn); b.setToolTip(dica); self.botoes.append(b); return b

        acoes = QGroupBox('Gerar')
        la = QVBoxLayout(acoes); la.addLayout(form)
        la.addWidget(botao('1. Gerar BASE automática (da pasta)', self.gerar_auto,
                           'gerar_base_auto.py: lê Status PMIB, cadernos #ST e REF-0013 e grava a BASE LMR AUTO'))
        la.addWidget(botao('1b. Gerar BASE pelo config', self.gerar_config,
                           'gerar_base_lmr.py com o configs/*.json deste sistema'))
        la.addWidget(botao('2. Gerar APLICAÇÃO (Workflow B)', self.gerar_aplicacao,
                           'rodar_workflow_b.py na BASE escolhida: grava APLICAÇÃO e VALIDAÇÃO ao lado dela'))
        la.addWidget(botao('Rodar autotestes', self.autotestes, 'lmr_core.py e localizacao.py --autoteste'))
        abrir = QHBoxLayout()
        for txt, fn in (('Abrir pasta LMR', self.abrir_pasta), ('Abrir tabela de localização', self.abrir_tabela),
                        ('Abrir ajustes', lambda: self.abrir_arquivo(arquivo_raiz(AJUSTES))),
                        ('Abrir BASE', lambda: self.abrir_arquivo(self.base.currentData()))):
            b = QPushButton(txt); b.clicked.connect(fn); abrir.addWidget(b)
        la.addLayout(abrir)

        # --- visualização
        self.tabela = QTableWidget(0, 5)
        self.tabela.setHorizontalHeaderLabels(['BASE', 'Aplicação', 'Assinatura', 'Linhas', 'Bloqueadas'])
        self.tabela.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.tabela.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.tabela.cellDoubleClicked.connect(lambda r, _c: self.abrir_arquivo(self.tabela.item(r, 0).data(Qt.ItemDataRole.UserRole)))
        self.status = QTextBrowser(); self.status.setOpenExternalLinks(True)
        self.log = QPlainTextEdit(); self.log.setReadOnly(True); self.log.setFont(QFont('Consolas', 9))
        abas = QTabWidget()
        abas.addTab(self.status, 'STATUS (o que é novo e testes)')
        abas.addTab(self.log, 'Log da execução')
        self.abas = abas

        direita = QWidget(); ld = QVBoxLayout(direita)
        self.titulo = QLabel(); self.titulo.setStyleSheet('font-size: 15px; font-weight: 600')
        ld.addWidget(self.titulo); ld.addWidget(QLabel('Saídas em LMR/SAIDA ATUAL (duplo clique abre a BASE):'))
        ld.addWidget(self.tabela, 1); ld.addWidget(abas, 2)
        esquerda = QWidget(); le = QVBoxLayout(esquerda)
        le.addWidget(QLabel('Sistemas')); le.addWidget(self.lista, 1); le.addWidget(acoes)
        sp = QSplitter(); sp.addWidget(esquerda); sp.addWidget(direita); sp.setSizes([380, 820])
        self.setCentralWidget(sp)
        self.statusBar().showMessage(f'Dados: {SAE}')
        if self.lista.count(): self.lista.setCurrentRow(0)

    # ------------------------------------------------------------ visualização
    def pasta(self):
        return os.path.join(SAE, self.lista.currentItem().text()) if self.lista.currentItem() else ''

    def mostrar(self, nome):
        if not nome: return
        self.titulo.setText(nome)
        cfg = self.cfgs.get(nome, (None, {}))[1]
        self.escopo.setText(cfg.get('escopo', 'CC')); self.subsistema.setText(cfg.get('subsistema', nome))
        self.nome.setText(cfg.get('sistema', nome.title()))
        self.atualizar()

    def atualizar(self):
        p = self.pasta()
        if not p: return
        try:
            linhas = saidas(p)
        except Exception as e:  # planilha aberta/corrompida: mostra, não derruba a janela
            linhas = []; self.escrever(f'Erro lendo saídas: {e}')
        self.tabela.setRowCount(len(linhas)); self.base.clear()
        for i, (base, apl, ass, n, bloq) in enumerate(linhas):
            item = QTableWidgetItem(os.path.basename(base)); item.setData(Qt.ItemDataRole.UserRole, base)
            vals = [item] + [QTableWidgetItem(str(v)) for v in ('sim' if apl else 'NÃO', ass, n, bloq)]
            for j, v in enumerate(vals): self.tabela.setItem(i, j, v)
            if bloq not in ('-', 0): self.tabela.item(i, 4).setForeground(Qt.GlobalColor.red)
            self.base.addItem(os.path.basename(base), base)
        st = os.path.join(p, 'LMR', 'STATUS.md')
        if os.path.exists(st):
            with open(st, encoding='utf-8') as fh:
                self.status.setMarkdown(fh.read())
        else:
            self.status.setMarkdown('_Sem STATUS.md nesta pasta LMR._')

    # ------------------------------------------------------------ execução
    def executar(self, *comandos):
        """Roda os scripts em sequência (QProcess, sem travar a janela) e mostra a saída no log."""
        if self.proc: return QMessageBox.information(self, 'Aguarde', 'Já há uma execução em andamento.')
        self.fila = list(comandos); self.log.clear(); self.abas.setCurrentWidget(self.log)
        for b in self.botoes: b.setEnabled(False)
        self.proximo()

    def proximo(self):
        if not self.fila:
            self.proc = None
            for b in self.botoes: b.setEnabled(True)
            self.escrever('\n=== concluído ==='); self.atualizar(); return
        args = self.fila.pop(0)
        self.escrever(f'\n> py {" ".join(args)}')
        self.proc = QProcess(self); self.proc.setWorkingDirectory(AQUI)
        env = QProcessEnvironment.systemEnvironment(); env.insert('PYTHONIOENCODING', 'utf-8'); self.proc.setProcessEnvironment(env)
        self.proc.setProcessChannelMode(QProcess.ProcessChannelMode.MergedChannels)
        self.proc.readyReadStandardOutput.connect(lambda: self.escrever(bytes(self.proc.readAllStandardOutput()).decode('utf-8', 'replace').rstrip()))
        self.proc.finished.connect(self.terminou)
        self.proc.start(sys.executable, ['-X', 'utf8', *args])

    def terminou(self, codigo, _status):
        if codigo:
            self.escrever(f'*** ERRO (código {codigo}): a sequência parou aqui. ***'); self.fila = []
        self.proximo()

    def escrever(self, txt):
        if txt: self.log.appendPlainText(txt)

    def gerar_auto(self):
        if not self.subsistema.text().strip(): return QMessageBox.warning(self, 'Falta subsistema', 'Informe o subsistema.')
        args = ['gerar_base_auto.py', self.pasta(), '--escopo', self.escopo.text().strip(), '--subsistema', self.subsistema.text().strip()]
        self.executar(args + (['--nome', self.nome.text().strip()] if self.nome.text().strip() else []))

    def gerar_config(self):
        nome = self.lista.currentItem().text()
        if nome not in self.cfgs: return QMessageBox.warning(self, 'Sem config', f'Não há configs/*.json para {nome}.')
        self.executar(['gerar_base_lmr.py', self.cfgs[nome][0]])

    def gerar_aplicacao(self):
        if not self.base.currentData(): return QMessageBox.warning(self, 'Sem BASE', 'Gere a BASE primeiro.')
        self.executar(['rodar_workflow_b.py', self.base.currentData()])

    def autotestes(self):
        self.executar(['lmr_core.py'], ['localizacao.py', '--autoteste'])

    def abrir_arquivo(self, p):
        if p: QDesktopServices.openUrl(QUrl.fromLocalFile(p))

    def abrir_pasta(self):
        self.abrir_arquivo(os.path.join(self.pasta(), 'LMR'))

    def abrir_tabela(self):
        self.abrir_arquivo(arquivo_raiz(TABELA))


def autoteste():
    os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
    app = QApplication(sys.argv[:1])
    j = Janela()
    assert j.lista.count() == 5, f'esperava 5 sistemas, achei {j.lista.count()}'
    for i in range(j.lista.count()):
        j.lista.setCurrentRow(i)
        assert j.tabela.rowCount() >= 1, f'{j.lista.item(i).text()}: nenhuma BASE em {SAIDA}'
        assert j.tabela.item(0, 2).text() != '-', f'{j.lista.item(i).text()}: sem VALIDAÇÃO'
        assert 'STATUS LMR' in j.status.toPlainText(), f'{j.lista.item(i).text()}: STATUS.md não carregou'
        assert j.subsistema.text(), 'subsistema vazio'
    app.quit()
    print('interface_lmr: autoteste OK')


if __name__ == '__main__':
    if '--autoteste' in sys.argv:
        autoteste()
    else:
        app = QApplication(sys.argv)
        Janela().show()
        sys.exit(app.exec())

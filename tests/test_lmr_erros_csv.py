"""O `erros_lmr.csv` vai para `Documentos\\SIG-FT\\logs\\`, nunca para o cwd
(2026-10-30, PENDENCIAS de 2026-10-28).

Era `to_csv("erros_lmr.csv")`: no app instalado o cwd pode ser `Program
Files`, onde usuário comum não grava, e o `except` engolia o erro calado."""
from pathlib import Path

from sigft.core import dados_usuario
from sigft.services import lmr


class _Callbacks:
    def __init__(self):
        self.linhas = []

    def log(self, texto):
        self.linhas.append(str(texto))


def test_o_relatorio_de_erros_mora_na_pasta_de_logs():
    assert lmr.caminho_do_relatorio_de_erros() == dados_usuario.pasta_logs() / "erros_lmr.csv"


def test_grava_na_pasta_de_logs_qualquer_que_seja_o_cwd(monkeypatch, tmp_path):
    outro_cwd = tmp_path / "program_files"
    outro_cwd.mkdir()
    monkeypatch.chdir(outro_cwd)
    gravados = []

    class _Tabela:
        def __init__(self, linhas):
            self.linhas = linhas

        def to_csv(self, destino, index):
            gravados.append((Path(destino), index))

    monkeypatch.setattr(lmr.pd, "DataFrame", _Tabela)
    cb = _Callbacks()

    destino = lmr.salvar_relatorio_de_erros([{"PMIB": "X", "Erro": "falhou"}], cb)

    assert destino == dados_usuario.pasta_logs() / "erros_lmr.csv"
    assert gravados == [(destino, False)]
    assert not (outro_cwd / "erros_lmr.csv").exists()
    # O console diz ONDE ficou: é o que o texto da tela não podia prometer.
    assert any(str(destino) in linha for linha in cb.linhas)


def test_falha_ao_gravar_e_dita_no_console_e_nao_levanta(monkeypatch):
    class _Tabela:
        def __init__(self, linhas):
            pass

        def to_csv(self, destino, index):
            raise PermissionError("sem permissao")

    monkeypatch.setattr(lmr.pd, "DataFrame", _Tabela)
    cb = _Callbacks()

    assert lmr.salvar_relatorio_de_erros([{"PMIB": "X"}], cb) is None
    assert any("sem permissao" in linha for linha in cb.linhas)


def test_csv_aberto_no_excel_grava_ao_lado_com_carimbo(monkeypatch):
    """[2026-11-04] O `erros_lmr.csv` do lote anterior aberto no Excel (é
    onde a pessoa o lê) prende o arquivo: o Windows recusa a escrita com
    PermissionError, e os erros do lote novo se perdiam. Vai um arquivo ao
    lado, com data e hora, e o console diz qual."""
    tentativas = []

    class _Tabela:
        def __init__(self, linhas):
            pass

        def to_csv(self, destino, index):
            tentativas.append(Path(destino))
            if len(tentativas) == 1:
                raise PermissionError("[Errno 13] Permission denied")

    monkeypatch.setattr(lmr.pd, "DataFrame", _Tabela)
    cb = _Callbacks()

    destino = lmr.salvar_relatorio_de_erros([{"PMIB": "X"}], cb)

    assert tentativas[0] == dados_usuario.pasta_logs() / "erros_lmr.csv"
    assert destino == tentativas[1]
    assert destino.parent == dados_usuario.pasta_logs()
    assert destino.name.startswith("erros_lmr_") and destino.suffix == ".csv"
    assert any(str(destino) in linha for linha in cb.linhas)

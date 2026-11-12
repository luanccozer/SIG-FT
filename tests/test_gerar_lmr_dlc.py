"""Instalação da DLC do Docling (Gerar Aplicação LMR, Tarefa 11). Sem rede: `baixar` é falso."""
import zipfile
from pathlib import Path

import pytest

from sigft.services import gerar_lmr_dlc as dlc
from sigft.services import updater


def _zip(caminho: Path, arquivos: dict[str, bytes]) -> Path:
    with zipfile.ZipFile(caminho, "w") as z:
        for nome, conteudo in arquivos.items():
            z.writestr(nome, conteudo)
    return caminho


def _pacote(tmp_path: Path, versao_do_exe: bytes = b"novo") -> Path:
    # O .bat gera o zip com a pasta docling_sigft\ dentro.
    return _zip(tmp_path / "pacote.zip", {
        "docling_sigft/docling_sigft.exe": versao_do_exe,
        "docling_sigft/_internal/lib.dll": b"dll",
        "docling_sigft/modelos/layout/modelo.bin": b"m" * 50,
    })


@pytest.fixture
def pasta(tmp_path, monkeypatch):
    alvo = tmp_path / "SIG-FT" / "docling"
    monkeypatch.setattr(dlc, "PASTA_DA_DLC", alvo)
    return alvo


def _sobras(pasta: Path) -> list[str]:
    return sorted(p.name for p in pasta.parent.iterdir() if p.name != pasta.name) if pasta.parent.exists() else []


def _instalar(baixar, avisos=None):
    return dlc.instalar_dlc(log_cb=(avisos if avisos is not None else []).append,
                            progresso_cb=lambda _f: None, baixar=baixar)


def test_instalacao_nova_devolve_a_pasta_com_o_exe(tmp_path, pasta):
    zip_ = _pacote(tmp_path)
    progresso = []

    resultado = dlc.instalar_dlc(log_cb=lambda _m: None, progresso_cb=progresso.append,
                                 baixar=lambda progresso_cb, log_cb: zip_)

    assert resultado == pasta
    assert (pasta / "docling_sigft.exe").read_bytes() == b"novo"
    assert (pasta / "modelos" / "layout" / "modelo.bin").is_file()
    assert _sobras(pasta) == []
    assert progresso[-1] == 1.0 and progresso == sorted(progresso)


def test_digest_errado_erro_e_pasta_antiga_intacta(tmp_path, pasta):
    pasta.mkdir(parents=True)
    (pasta / "docling_sigft.exe").write_bytes(b"antigo")

    def baixar_com_digest_errado(progresso_cb, log_cb):
        raise updater.ArquivoInvalido("O arquivo baixado nao confere com o publicado.")

    with pytest.raises(updater.ArquivoInvalido):
        _instalar(baixar_com_digest_errado)

    assert (pasta / "docling_sigft.exe").read_bytes() == b"antigo"
    assert _sobras(pasta) == []


def test_instalacao_por_cima_de_versao_antiga_troca_tudo(tmp_path, pasta):
    pasta.mkdir(parents=True)
    (pasta / "docling_sigft.exe").write_bytes(b"antigo")
    (pasta / "so_da_versao_velha.txt").write_text("velho")
    zip_ = _pacote(tmp_path)

    _instalar(lambda progresso_cb, log_cb: zip_)

    assert (pasta / "docling_sigft.exe").read_bytes() == b"novo"
    assert not (pasta / "so_da_versao_velha.txt").exists()
    assert _sobras(pasta) == []


@pytest.mark.parametrize("havia_antiga", [True, False])
def test_interrupcao_no_meio_nao_deixa_pasta_parcial(tmp_path, pasta, havia_antiga):
    if havia_antiga:
        pasta.mkdir(parents=True)
        (pasta / "docling_sigft.exe").write_bytes(b"antigo")
    zip_ = _pacote(tmp_path)

    def cai_no_meio(fracao):
        if fracao > 0.8:  # já no meio da extração
            raise KeyboardInterrupt("usuario cancelou")

    with pytest.raises(KeyboardInterrupt):
        dlc.instalar_dlc(log_cb=lambda _m: None, progresso_cb=cai_no_meio,
                         baixar=lambda progresso_cb, log_cb: zip_)

    if havia_antiga:
        assert (pasta / "docling_sigft.exe").read_bytes() == b"antigo"
    else:
        assert not pasta.exists()
    assert _sobras(pasta) == []


def test_zip_com_caminho_fora_da_pasta_e_recusado(tmp_path, pasta):
    pasta.mkdir(parents=True)
    (pasta / "docling_sigft.exe").write_bytes(b"antigo")
    zip_ = _zip(tmp_path / "mau.zip", {"docling_sigft/docling_sigft.exe": b"x", "../fora.txt": b"x"})

    with pytest.raises(dlc.PacoteDaDlcInvalido):
        _instalar(lambda progresso_cb, log_cb: zip_)

    assert (pasta / "docling_sigft.exe").read_bytes() == b"antigo"
    assert not (tmp_path / "SIG-FT" / "fora.txt").exists()
    assert _sobras(pasta) == []


def test_zip_sem_o_executavel_e_recusado(tmp_path, pasta):
    zip_ = _zip(tmp_path / "vazio.zip", {"docling_sigft/leiame.txt": b"x"})

    with pytest.raises(dlc.PacoteDaDlcInvalido):
        _instalar(lambda progresso_cb, log_cb: zip_)

    assert not pasta.exists() and _sobras(pasta) == []


def _release(versao="1", **asset):
    ativo = {"name": dlc.NOME_DO_PACOTE.format(versao=versao), "url": "https://api/asset/9",
             "size": 123456, "digest": "sha256:" + "AB" * 32}
    ativo.update(asset)
    return {"tag_name": f"docling-v{versao}", "html_url": "https://github/x", "assets": [ativo]}


def test_o_release_da_dlc_vira_um_download_com_o_sha256_do_asset():
    info = dlc.pacote_do_release(_release("1"), "1")

    assert info.nome_arquivo == "SIG-FT-Docling-1.zip"
    assert info.url_asset == "https://api/asset/9" and info.tamanho == 123456
    assert info.sha256 == "ab" * 32


def test_release_sem_o_zip_ou_sem_sha256_e_recusado():
    sem_zip = {"tag_name": "docling-v1", "assets": [{"name": "outro.zip"}]}
    with pytest.raises(dlc.PacoteDaDlcInvalido):
        dlc.pacote_do_release(sem_zip, "1")
    with pytest.raises(dlc.PacoteDaDlcInvalido):
        dlc.pacote_do_release(_release("1", digest=""), "1")

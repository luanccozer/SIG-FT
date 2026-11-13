"""Gerar Aplicação LMR: baixa e instala a DLC do Docling (o pacote que o instalador do SIG-FT não leva).

O pacote é um asset `SIG-FT-Docling-<versao>.zip` de um release próprio, com a tag `docling-v<versao>`
(job `dlc` do `.github/workflows/release.yml`), para não ser baixado de novo a cada versão do SIG-FT.
Rede, token, cabeçalhos e conferência do SHA-256 são os do `updater` (uma implementação só).
Não importa Qt, `docling` nem `torch`.
"""

from __future__ import annotations

import shutil
import zipfile
from pathlib import Path
from typing import Callable

from sigft.core import rede
from sigft.services import updater
from sigft.services.gerar_lmr_extracao import PASTA_DA_DLC, VERSAO_DA_DLC

NOME_DO_PACOTE = "SIG-FT-Docling-{versao}.zip"
TAG_DO_PACOTE = "docling-v{versao}"
_EXE = "docling_sigft.exe"
# Quanto da barra é o download; o resto é extrair e trocar a pasta.
_PARTE_DO_DOWNLOAD = 0.7

# shortcut: o pacote vai num zip só, e o GitHub limita cada asset a 2 GiB. O job `dlc` do release.yml
# reprova se o zip passar disso. Quando passar (o tamanho real só se sabe depois do primeiro build),
# trocar por partes (`.zip.001`...) no job e juntá-las aqui antes de extrair.

Baixar = Callable[[Callable[[float], None], Callable[[str], None]], Path]


class PacoteDaDlcInvalido(RuntimeError):
    """O release ou o zip da DLC não é o esperado (falta o asset, o SHA-256 ou o executável)."""


def pacote_do_release(release: dict, versao: str) -> updater.Atualizacao:
    """O asset do zip da DLC dentro do JSON do release, pronto para o download do `updater`. Função pura."""
    nome = NOME_DO_PACOTE.format(versao=versao)
    asset = updater._asset(release, nome)
    if asset is None:
        raise PacoteDaDlcInvalido(
            f"O release {TAG_DO_PACOTE.format(versao=versao)} nao tem o arquivo {nome}. "
            "Avise quem publica o pacote.")
    sha256 = updater._digest_sha256(asset)
    if not sha256:  # o updater só avisa; para um executável baixado a parte, sem hash não instala
        raise PacoteDaDlcInvalido(f"O GitHub nao publicou o SHA-256 de {nome}: nao da para conferir o download.")
    return updater.Atualizacao(
        versao=versao, notas="", nome_arquivo=nome, url_asset=str(asset.get("url", "")),
        tamanho=int(asset.get("size") or 0), sha256=sha256, url_pagina=str(release.get("html_url", "")))


def _localizar_pacote(log_cb: Callable[[str], None]) -> updater.Atualizacao:
    if not updater.token():
        raise updater.SemToken("Este build nao tem token de atualizacao embutido: nao da para baixar a DLC. "
                               "Instale pela versao publicada do SIG-FT.")
    tag = TAG_DO_PACOTE.format(versao=VERSAO_DA_DLC)
    log_cb(f"Procurando o pacote da DLC ({tag})...")
    sessao, resp = rede.abrir(f"{updater.API}/releases/tags/{tag}", headers=updater._cabecalhos(),
                              timeout=20, log_cb=log_cb, status_ok=(200, 401, 403, 404))
    try:
        if resp.status_code in (401, 403):
            raise updater.SemToken(f"O GitHub recusou o token (HTTP {resp.status_code}): nao da para baixar a DLC.")
        if resp.status_code == 404:
            raise PacoteDaDlcInvalido(f"O pacote da DLC ({tag}) ainda nao foi publicado.")
        release = resp.json()
    finally:
        resp.close()
        sessao.close()
    return pacote_do_release(release, VERSAO_DA_DLC)


def _baixar_do_github(progresso_cb: Callable[[float], None], log_cb: Callable[[str], None]) -> Path:
    info = _localizar_pacote(log_cb)
    return updater._baixar_arquivo(info, progresso_cb=progresso_cb, log_cb=log_cb)  # confere o SHA-256


def _extrair(zip_: Path, destino: Path, progresso: Callable[[float], None]) -> Path:
    """Extrai em `destino` e devolve a pasta que tem o executável (o zip traz `docling_sigft\\` dentro)."""
    destino.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_) as z:
        nomes = z.namelist()
        for nome in nomes:
            partes = Path(nome).parts
            if Path(nome).is_absolute() or ".." in partes or ":" in nome:
                raise PacoteDaDlcInvalido(f"O zip da DLC tem um caminho fora da pasta ({nome}).")
        for i, nome in enumerate(nomes, 1):
            z.extract(nome, destino)
            progresso(i / len(nomes))
    for candidata in (destino, *(p for p in destino.iterdir() if p.is_dir())):
        if (candidata / _EXE).is_file():
            return candidata
    raise PacoteDaDlcInvalido(f"O zip da DLC nao tem o {_EXE}.")


def _trocar(novo: Path, destino: Path) -> None:
    antiga = destino.with_name(destino.name + ".antiga")
    shutil.rmtree(antiga, ignore_errors=True)
    if destino.exists():
        destino.rename(antiga)
    try:
        novo.rename(destino)
    except OSError:  # p.ex. o executavel da DLC aberto: volta a pasta antiga
        if antiga.exists():
            antiga.rename(destino)
        raise
    shutil.rmtree(antiga, ignore_errors=True)


def instalar_dlc(*, log_cb: Callable[[str], None], progresso_cb: Callable[[float], None],
                 baixar: Baixar | None = None) -> Path:
    """Baixa, confere o SHA-256, extrai ao lado e troca `PASTA_DA_DLC`; devolve essa pasta.

    Qualquer falha (digest errado, zip ruim, interrupção) deixa a pasta antiga como estava.
    `baixar(progresso_cb, log_cb)` devolve o zip já conferido; é a costura do teste.
    """
    destino = Path(PASTA_DA_DLC)
    destino.parent.mkdir(parents=True, exist_ok=True)
    antiga = destino.with_name(destino.name + ".antiga")
    if not destino.exists() and antiga.exists():  # uma troca anterior morreu entre os dois renames
        antiga.rename(destino)
    temporaria = destino.with_name(destino.name + ".novo")
    shutil.rmtree(temporaria, ignore_errors=True)

    zip_ = (baixar or _baixar_do_github)(lambda f: progresso_cb(f * _PARTE_DO_DOWNLOAD), log_cb)
    try:
        log_cb("Extraindo a DLC...")
        raiz = _extrair(zip_, temporaria,
                        lambda f: progresso_cb(_PARTE_DO_DOWNLOAD + f * (0.95 - _PARTE_DO_DOWNLOAD)))
        _trocar(raiz, destino)
    finally:
        shutil.rmtree(temporaria, ignore_errors=True)
        zip_.unlink(missing_ok=True)
    progresso_cb(1.0)
    log_cb(f"DLC instalada em {destino}.")
    return destino

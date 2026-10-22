# -*- coding: utf-8 -*-
"""
Entrega o Power BI gerado (montar_pbip.py --saida DIR) numa pasta do Box SEM apagar e recriar pastas.

Por que (22/10/2026): o Box Drive nao sincroniza arquivo que comeca com ponto (.platform, .pbi/, .gitignore). Cada
maquina tem os seus, locais. Quando uma entrega apagava e recriava as pastas do projeto, a maquina da GE nao
conseguia apagar a pasta antiga (sobrava o .platform local) e ficava so com ele: "sumiam" os demais arquivos.

O que faz:
  - copia so o que e novo ou mudou (comparando o conteudo);
  - apaga os arquivos que sairam do projeto (ex.: um visual removido), nunca os que comecam com ponto;
  - apaga pasta so se ficou vazia; nunca mexe em .pbi/ nem .platform de quem abriu o arquivo;
  - com --simular, so lista.

    python entregar_no_box.py <pasta gerada> "<...\\SOBRESSALENTES - PMIB\\Sobressalentes (Power BI)>" [--simular]

Com os identificadores fixos do gerador (desde 22/10/2026), uma mudanca pequena no painel muda poucos arquivos.
"""
from __future__ import annotations

import argparse
import filecmp
import os
import pathlib
import shutil


def com_ponto(rel: pathlib.PurePath) -> bool:
    return any(p.startswith(".") for p in rel.parts)


def arquivos(raiz: pathlib.Path) -> dict[str, pathlib.Path]:
    return {p.relative_to(raiz).as_posix(): p for p in raiz.rglob("*") if p.is_file()}


def entregar(origem: pathlib.Path, destino: pathlib.Path, simular: bool = False) -> dict[str, list[str]]:
    novo, atual = arquivos(origem), arquivos(destino) if destino.exists() else {}
    copiar = sorted(r for r in novo if r not in atual or not filecmp.cmp(novo[r], atual[r], shallow=False))
    apagar = sorted(r for r in atual if r not in novo and not com_ponto(pathlib.PurePosixPath(r)))
    if not simular:
        for r in copiar:
            alvo = destino / r
            alvo.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(novo[r], alvo)
        for r in apagar:
            (destino / r).unlink()
        # pastas que ficaram vazias (de baixo para cima); pasta com arquivo de ponto local fica
        for d in sorted((p for p in destino.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
            if not any(d.iterdir()) and not com_ponto(d.relative_to(destino)):
                d.rmdir()
    return {"copiados": copiar, "apagados": apagar}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("origem", type=pathlib.Path)
    ap.add_argument("destino", type=pathlib.Path)
    ap.add_argument("--simular", action="store_true")
    a = ap.parse_args()
    r = entregar(a.origem, a.destino, a.simular)
    print(f"{'SIMULACAO: ' if a.simular else ''}{len(r['copiados'])} copiados, {len(r['apagados'])} apagados")
    for k in ("copiados", "apagados"):
        for x in r[k][:30]:
            print(f"  {k[:-1]}: {x}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

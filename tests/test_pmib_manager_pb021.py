r"""
Gestão PMIB: código final PB021 é lista de preços  [2026-10-15]

Regra do Luan: "tudo o que for final PB021 será lista de preços". Antes, só o
título ("PREÇO" + "SOBRESSALENTES") decidia: uma PB021 com outro título não
chegava à aba "Lista de preços Follow-up" e, se tivesse SOBRESSALENTES no
título, ainda era oferecida como lista NOVA de sobressalentes.

Roda o fluxo inteiro sobre uma cópia do kit do cofre, com uma PB021 a mais no
histórico do DocManager. Precisa do pandas e do openpyxl de verdade.
"""
from __future__ import annotations

import datetime as dt
import shutil
import warnings
from pathlib import Path

import pytest

from _openpyxl_de_verdade import openpyxl_de_verdade
from _pandas_de_verdade import pandas_de_verdade

from sigft.services import pmib_manager

RAIZ = Path(__file__).resolve().parent.parent
KIT = RAIZ / "gestao-sobressalentes" / "_gestao_v2" / "fixtures" / "kit_gestao_pmib"
HOJE = dt.date(2026, 10, 10)
PB021 = "#ST00=TESTE01&MPB021"

precisa_do_kit = pytest.mark.skipif(not (KIT / "esperado.json").is_file(),
                                    reason="kit de teste do cofre ausente (gestao-sobressalentes/)")


def _coluna_a(ws, desde):
    return [ws.cell(row=r, column=1).value for r in range(desde, ws.max_row + 1)]


@precisa_do_kit
def test_pb021_vai_para_o_follow_up_e_nao_vira_lista_de_sobressalentes(tmp_path, monkeypatch):
    pytest.importorskip("lxml")
    kit = tmp_path / "kit"
    shutil.copytree(KIT, kit)
    oferecidas = []

    def _confirmar(df):
        oferecidas.extend(df["No. do Documento"])
        return df

    with openpyxl_de_verdade(pmib_manager) as openpyxl_real, pandas_de_verdade(pmib_manager):
        monkeypatch.setattr(pmib_manager, "openpyxl", openpyxl_real)
        from openpyxl import load_workbook

        api = kit / "docmanager_sintetico.xlsx"
        wb = load_workbook(api)
        # Título com SOBRESSALENTES e SEM "PREÇO": o caso que escapava das duas regras.
        wb.active.append([PB021, "TRK-901", "True", "TEXTO DE TESTE - LISTA DE SOBRESSALENTES 1 - VALORES",
                          "TESTE-CMI-01P", "0", "Emitido", "05/10/2026", "TEXTO DE TESTE", "TEXTO DE TESTE"])
        wb.save(api)

        for _ in pmib_manager.PMIBManager().executar_fluxo(
                str(api), str(kit / "status"), str(kit / "mapeadora_sintetica.xlsx"),
                callback_confirm=_confirmar, hoje=HOJE):
            pass

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            mapa = load_workbook(kit / "mapeadora_sintetica.xlsx")
        principal = _coluna_a(mapa["Acompanhamento Sobressalente"], 3)
        fu = mapa["Lista de preços Follow-up"]
        linhas_fu = {fu.cell(row=r, column=1).value: r for r in range(2, fu.max_row + 1)}
        cab = {fu.cell(row=1, column=c).value: c for c in range(1, fu.max_column + 1)}

    assert PB021 not in oferecidas
    assert PB021 not in principal
    assert PB021 in linhas_fu
    assert fu.cell(row=linhas_fu[PB021], column=cab["LISTA DE SOBRESSALENTES"]).value == "#ST00=TESTE01&MPB020"

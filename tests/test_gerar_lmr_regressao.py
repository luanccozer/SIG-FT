"""Regressão por assinatura contra o `lmr.js` do Box (spec §2.1) e o conversor BASE antiga → CSV.

Duas partes:
- o conversor `tools/lmr_base_para_csv.py`, testado com uma BASE FICTÍCIA criada aqui (openpyxl REAL, ver
  `tests/_openpyxl_de_verdade.py`): nenhum dado real entra no teste;
- a regressão: com `LMR_BASES` apontando para a pasta das BASEs e dos Status reais, converte cada sistema
  de `fixtures/lmr/assinaturas.json`, roda `gerar` e compara a assinatura e as bloqueadas com as do `lmr.js`.
  Sem `LMR_BASES` (o CI) é pulado. Só os hashes ficam no Git.
"""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path

import pytest
from _openpyxl_de_verdade import openpyxl_de_verdade

from sigft.services.gerar_lmr_csv import COLUNAS, ler_csv

RAIZ = Path(__file__).resolve().parent.parent
ASSINATURAS = RAIZ / "tests" / "fixtures" / "lmr" / "assinaturas.json"
_spec = importlib.util.spec_from_file_location("lmr_base_para_csv", RAIZ / "tools" / "lmr_base_para_csv.py")
conversor = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(conversor)

CAB_BASE = ["LINHA", "ESCOPO", "SUBSISTEMA", "FICHA_PMIB", "DESCRIÇÃO", "ÁREA/PAINEL", "RDS-PP", "TAG",
            "TAG COM RDS-PP", "PAIS", "LOCAL", "ELEVAÇÃO", "EIXO", "TRECHOS", "QTD POR TRECHO"]
F1, F2 = "'0000000001", "0000000002"


@pytest.fixture
def xl():
    with openpyxl_de_verdade() as real:
        yield real


def _base(xl, caminho: Path, linhas: list[list], aba: str = "BASE") -> Path:
    wb = xl.Workbook()
    ws = wb.active
    ws.title = aba
    ws.append(CAB_BASE)
    for linha in linhas:
        ws.append(linha)
    wb.save(caminho)
    return caminho


LINHAS = [
    [1, "RV", "HIDRÁULICA", F1, "VALVULA ESFERA", "SKID", "#ST[XX]=M[XX]MKF10UZ001", "XV101", "SIM", "",
     "CASA DE FORÇA", 98.5, "BC", "U-01, U-02", 2],
    [2, "RV", "HIDRÁULICA", F2, "ÓLEO", "SKID", "", "", "NÃO", "GP151 | #ST[XX]=M[XX]MKF10AP001 ; GP152 | ",
     "CASA DE FORÇA", "98,50", "BC", "U-01", 1],
]


def test_converte_a_base_para_o_csv_da_tarefa_6(xl, tmp_path):
    base = _base(xl, tmp_path / "BASE.xlsx", LINHAS)
    saida = tmp_path / "saida.csv"
    conversor.converter(base, saida)
    texto = saida.read_text(encoding="utf-8-sig")
    assert texto.splitlines()[0] == ";".join(COLUNAS)
    lidas, achados = ler_csv(texto)
    assert not achados and len(lidas) == 2
    a, b = lidas
    assert (a.ficha, a.area, a.rds, a.tag, a.tag_com_rds) == ("0000000001", "SKID", "#ST[XX]=M[XX]MKF10UZ001",
                                                            "XV101", True)
    assert (a.local, a.eixo, a.trechos, a.qtd) == ("CASA DE FORÇA", "BC", "U-01;U-02", 2)
    assert a.elevacao in ("98.5", "98,5", "98,50")
    assert b.tag_com_rds is False and b.qtd == 1
    assert b.pais == [{"tag": "GP151", "rds": "#ST[XX]=M[XX]MKF10AP001"}, {"tag": "GP152", "rds": ""}]


def test_a_base_da_escopo_subsistema_e_os_trechos_usados(xl, tmp_path):
    base = _base(xl, tmp_path / "BASE.xlsx", LINHAS)
    _, escopo, subsistema, trechos = conversor.ler_base(base)
    assert (escopo, subsistema) == ("RV", "HIDRÁULICA")
    assert trechos == ["U-01", "U-02"]


def test_escopo_diferente_entre_linhas_e_erro(xl, tmp_path):
    outras = [list(LINHAS[0]), list(LINHAS[1])]
    outras[1][1] = "UG"
    base = _base(xl, tmp_path / "BASE.xlsx", outras)
    with pytest.raises(ValueError, match="ESCOPO"):
        conversor.ler_base(base)


def test_sem_aba_base_ou_sem_coluna_e_erro_claro(xl, tmp_path):
    sem_aba = _base(xl, tmp_path / "a.xlsx", LINHAS, aba="OUTRA")
    with pytest.raises(ValueError, match="BASE"):
        conversor.ler_base(sem_aba)
    wb = xl.Workbook()
    wb.active.title = "BASE"
    wb.active.append(["LINHA", "ESCOPO"])
    wb.save(tmp_path / "b.xlsx")
    with pytest.raises(ValueError, match="FICHA_PMIB"):
        conversor.ler_base(tmp_path / "b.xlsx")


def test_a_base_convertida_passa_pelo_motor(xl, tmp_path):
    base = _base(xl, tmp_path / "BASE.xlsx", LINHAS)
    status = tmp_path / "STATUS.xlsx"
    wb = xl.Workbook()
    wb.active.append(["CÓDIGO PMIB", "DESCRIÇÃO", "CÓDIGO DO MATERIAL", "UNIDADE", "STATUS"])
    wb.active.append(["0000000001", "VALVULA ESFERA", "PN-1", "UN", None])
    wb.active.append(["0000000002", "OLEO", "PN-2", "UN", None])
    wb.save(status)
    res = conversor.gerar_da_base(base, status)
    assert res.bloqueadas == 0
    assert len(res.linhas) == 2 * 2 + 1  # F1: 2 trechos × qtd 2; F2: 1 trecho × 1
    assert res.assinatura.startswith("5-")


def test_assinaturas_so_tem_hashes():
    dados = json.loads(ASSINATURAS.read_text(encoding="utf-8"))
    assert isinstance(dados, dict)
    for sistema, d in dados.items():
        assert {"assinatura", "bloqueadas"} <= set(d), sistema


def test_regressao_contra_o_lmr_js(xl):
    pasta = os.environ.get("LMR_BASES")
    if not pasta:
        pytest.skip("LMR_BASES não definida: os dados reais não estão no CI")
    esperado = json.loads(ASSINATURAS.read_text(encoding="utf-8"))
    if not esperado:
        pytest.skip("assinaturas.json vazio: preencha com o lmr.js do Box (ver o relatório da Tarefa 8)")
    pasta = Path(pasta)
    diferentes = []
    for sistema, d in esperado.items():
        base = pasta / d.get("base", f"BASE LMR - {sistema}.xlsx")
        assert d.get("status"), f"{sistema}: informe 'status' (o Status PMIB do sistema) no assinaturas.json"
        res = conversor.gerar_da_base(base, pasta / d["status"], opcao_trechos=d.get("opcao_trechos"),
                                      lista_trechos=d.get("lista_trechos"))
        obtido = (res.assinatura, res.bloqueadas)
        if obtido != (d["assinatura"], d["bloqueadas"]):
            diferentes.append(f"{sistema}: esperado {(d['assinatura'], d['bloqueadas'])}, obtido {obtido}")
    assert not diferentes, "\n".join(diferentes)

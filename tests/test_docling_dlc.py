"""Testes do programa da DLC do Docling (empacotamento/docling_dlc/docling_sigft.py).

O conversor é injetado: os testes não instalam o Docling nem o torch.
"""
import importlib.util
import json
from pathlib import Path

_CAMINHO = Path(__file__).resolve().parents[1] / "empacotamento" / "docling_dlc" / "docling_sigft.py"
_spec = importlib.util.spec_from_file_location("docling_sigft", _CAMINHO)
dlc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dlc)


def _conversor_ok(pdf):
    return [dlc.Pagina(1, False, "texto da página 1"), dlc.Pagina(2, True, "| a | b |\n|---|---|")]


def test_gera_paginas_e_progresso(tmp_path, capsys):
    pdf = tmp_path / "doc.pdf"
    pdf.write_bytes(b"%PDF")
    saida = tmp_path / "saida"
    assert dlc.main([str(saida), str(pdf)], converter=_conversor_ok) == 0
    out = capsys.readouterr().out
    assert "PROGRESSO 1/1 doc.pdf" in out
    assert "OK doc.pdf 2 1" in out
    dados = json.loads((saida / "docling" / "doc.paginas.json").read_text(encoding="utf-8"))
    assert dados["arquivo"] == "doc.pdf"
    assert [p["n"] for p in dados["paginas"]] == [1, 2]
    assert dados["paginas"][1]["ocr"] is True


def test_pdf_que_falha_nao_para_o_lote(tmp_path, capsys):
    a, b = tmp_path / "a.pdf", tmp_path / "b.pdf"
    a.write_bytes(b"%PDF")
    b.write_bytes(b"%PDF")

    def conversor(pdf):
        if pdf.name == "a.pdf":
            raise RuntimeError("arquivo corrompido")
        return _conversor_ok(pdf)

    assert dlc.main([str(tmp_path / "s"), str(a), str(b)], converter=conversor) == 0
    out = capsys.readouterr().out
    assert "FALHA a.pdf arquivo corrompido" in out
    assert "OK b.pdf 2 1" in out


def test_caminho_com_acento_e_espaco(tmp_path, capsys):
    saida = tmp_path / "Água Pura" / "LMR EXTRAÇÃO"
    pdf = tmp_path / "Água Pura" / "relação 01.pdf"
    pdf.parent.mkdir()
    pdf.write_bytes(b"%PDF")
    assert dlc.main([str(saida), str(pdf)], converter=_conversor_ok) == 0
    assert (saida / "docling" / "relação 01.paginas.json").exists()
    assert (saida / "docling" / "relação 01.json").exists()


def test_nenhum_lido_sai_com_erro(tmp_path, capsys):
    def falha(pdf):
        raise OSError("só na nuvem")

    assert dlc.main([str(tmp_path / "s"), str(tmp_path / "x.pdf")], converter=falha) == 1
    assert "FALHA x.pdf só na nuvem" in capsys.readouterr().out

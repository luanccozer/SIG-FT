"""Leitura, gravação e conferência do CSV da Aplicação LMR (dados fictícios)."""

import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from sigft.services import gerar_lmr_csv as c
from sigft.services import gerar_lmr_extracao as extracao
from sigft.services.gerar_lmr_motor import LinhaCsv, Material

CAB = ";".join(c.COLUNAS)
F1, F2 = "4500000000.0001", "4500000000.0002"
RAIZ = Path(__file__).resolve().parents[1]


def linha(ficha=F1, area="SKID", rds="#ST00=M00ABC10UZ010-UZ001", tag="GP101", com_rds="SIM", pais="",
          local="CASA DE FORÇA", elev="98,50", eixo="CD", trechos="50HZ", qtd="1", doc="#ST00=M00ABC10UZ010&MPA010",
          pag="5", sep=";"):
    campos = [ficha, area, rds, tag, com_rds, pais, local, elev, eixo, trechos, qtd, doc, pag]
    # como o agente faz: campo com o separador vai entre aspas
    return sep.join(f'"{x}"' if sep in x and not x.startswith('"') else x for x in campos)


def ler(*linhas, cab=CAB):
    return c.ler_csv("\n".join([cab, *linhas]))


# --- Foco 1: o que o agente pode devolver -------------------------------------------------------

def test_le_csv_simples():
    linhas, achados = ler(linha(), linha(ficha=F2, tag="", com_rds="NÃO", qtd="4", trechos="U-03;U-11"))
    assert achados == [] and len(linhas) == 2
    a, b = linhas
    assert isinstance(a, LinhaCsv)
    assert (a.ficha, a.area, a.tag, a.tag_com_rds, a.pais, a.eixo, a.trechos, a.qtd, a.documento, a.pagina) == (
        F1, "SKID", "GP101", True, [], "CD", "50HZ", 1, "#ST00=M00ABC10UZ010&MPA010", "5")
    assert (b.tag_com_rds, b.qtd, b.trechos, b.n) == (False, 4, "U-03;U-11", 3)


def test_frase_antes_cerca_e_frase_depois():
    texto = f"Aqui está o CSV pedido:\n\n```csv\n{CAB}\n{linha()}\n```\nEspero ter ajudado."
    linhas, _ = c.ler_csv(texto)
    assert [lc.ficha for lc in linhas] == [F1]


def test_separador_virgula():
    linhas, _ = c.ler_csv("\n".join([CAB.replace(";", ","), linha(sep=",", trechos="U-03,U-11")]))
    assert linhas[0].trechos == "U-03,U-11" and linhas[0].qtd == 1


def test_cabecalho_repetido_a_cada_lote_e_ignorado():
    linhas, achados = ler(linha(), CAB, linha(ficha=F2), CAB)
    assert [lc.ficha for lc in linhas] == [F1, F2] and achados == []


def test_sem_cabecalho_ou_coluna_faltando():
    with pytest.raises(c.CsvInvalido, match="cabeçalho"):
        c.ler_csv("só uma frase do agente")
    with pytest.raises(c.CsvInvalido, match="QTD_POR_TRECHO"):
        c.ler_csv(CAB.replace(";QTD_POR_TRECHO", "") + "\n")


def test_ficha_com_apostrofo_e_espaco_no_fim():
    linhas, _ = ler(linha(ficha=f"'{F1} "), linha(ficha="4500000000,0002"))
    assert [lc.ficha for lc in linhas] == [F1, F2]


def test_pais_com_dois_pais():
    pais = '"MA101 | #ST00=M00ABC10UZ010-UZ001 ; GP101 | #ST00=M00ABC10UZ010-UZ001"'
    linhas, _ = ler(linha(tag="", com_rds="NÃO", pais=pais))
    assert linhas[0].pais == [{"tag": "MA101", "rds": "#ST00=M00ABC10UZ010-UZ001"},
                              {"tag": "GP101", "rds": "#ST00=M00ABC10UZ010-UZ001"}]


def test_linha_com_colunas_a_menos_vira_aviso():
    linhas, achados = ler(linha(), "4500000000.0009;SKID;só isso")
    assert len(linhas) == 1
    assert achados[0].regra == "CSV" and achados[0].severidade == "aviso" and achados[0].linha_csv == 3


def test_quantidade_ilegivel_vira_vazia_com_aviso():
    linhas, achados = ler(linha(qtd="duas"), linha(ficha=F2, qtd=""))
    assert [lc.qtd for lc in linhas] == [None, None]
    assert len(achados) == 1 and "duas" in achados[0].mensagem


# --- Foco 2: o mesmo material em dois lotes -----------------------------------------------------

def test_linhas_iguais_sao_unidas_e_trechos_somados():
    linhas, achados = ler(linha(trechos="U-03;U-05"), linha(trechos="U-05;U-07", doc="OUTRO", pag="9"))
    assert achados == [] and len(linhas) == 1
    assert linhas[0].trechos == "U-03;U-05;U-07" and linhas[0].documento == "#ST00=M00ABC10UZ010&MPA010"


def test_uniao_com_todas_e_quantidade_diferente():
    linhas, achados = ler(linha(trechos="TODAS", qtd="2"), linha(trechos="U-03", qtd="3"), linha(tag="GP102"))
    assert len(linhas) == 2 and linhas[0].trechos == "TODAS" and linhas[0].qtd == 2
    assert len(achados) == 1 and achados[0].regra == "CSV" and achados[0].severidade == "aviso"
    assert "2" in achados[0].mensagem and "3" in achados[0].mensagem


def test_chaves_diferentes_nao_se_unem():
    linhas, _ = ler(linha(), linha(eixo="BC"), linha(pais="MA101 | #ST00=M00ABC10UZ010-UZ001"))
    assert len(linhas) == 3


# --- gravar_csv ---------------------------------------------------------------------------------

def test_gravar_e_ler_de_volta(tmp_path):
    original, _ = ler(linha(), linha(ficha=F2, tag="", com_rds="NÃO", qtd="4", trechos="U-03;U-11",
                                 pais='"MA101 | #ST00=M00X ; GP101 | #ST00=M00X"'))
    destino = tmp_path / "Água Pura" / "APLICACAO.csv"
    destino.parent.mkdir()
    c.gravar_csv(destino, original)
    texto = destino.read_text(encoding="utf-8-sig")
    assert texto.splitlines()[0] == CAB
    lidas, achados = c.ler_csv(texto)
    assert achados == [] and lidas == original


# --- os exemplos do agente do AMP ---------------------------------------------------------------

def _exemplos_do_agente():
    texto = (RAIZ / "amp" / "aplicacao_lmr" / "agente.md").read_text(encoding="utf-8")
    exemplos = []
    for secao in texto.split("## Exemplo")[1:]:
        csv_linhas, dentro = [], False
        for ln in secao.splitlines():
            if ln.startswith("FICHA_PMIB;"):
                dentro = True
            elif dentro and (not ln.strip() or ln.startswith("```")):
                break
            if dentro:
                csv_linhas.append(ln)
        exemplos.append("\n".join(csv_linhas))
    return exemplos


def test_exemplos_do_agente_passam_pelo_leitor():
    exemplos = _exemplos_do_agente()
    assert len(exemplos) == 2
    assert all(e.splitlines()[0] == CAB for e in exemplos)  # o cabeçalho do agente é o COLUNAS daqui
    (l1, a1), (l2, a2) = (c.ler_csv(e) for e in exemplos)
    assert (len(l1), len(l2)) == (2, 2) and a1 == [] and a2 == []
    assert [len(x.pais) for x in l1] == [0, 2]


# --- conferir_com_extracao ----------------------------------------------------------------------

def paginas_json(pasta, nome, paginas):
    pasta.mkdir(parents=True, exist_ok=True)
    corpo = [{"n": n, "ocr": ocr, "texto": t} for n, (t, ocr) in enumerate(paginas, 1)]
    (pasta / f"{nome}.paginas.json").write_text(json.dumps({"arquivo": nome, "paginas": corpo}), encoding="utf-8")


def test_conferencia_acha_tag_e_rds_sem_a_parte_variavel(tmp_path):
    paginas_json(tmp_path, "#ST00=M00ABC10UZ010&MPA010[R1A]", [
        ("Bomba GP101 no skid #ST50=M01ABC10UZ010-UZ001", False)])
    lc, _ = ler(linha(rds="#ST[XX]=M[XX]ABC10UZ010-UZ001"))
    assert c.conferir_com_extracao(lc, tmp_path) == []


def test_conferencia_tag_ou_rds_nao_encontrado(tmp_path):
    paginas_json(tmp_path, "#ST00=M00ABC10UZ010&MPA010[R1A]", [("Nada de útil aqui", False)])
    lc, _ = ler(linha())
    achados = c.conferir_com_extracao(lc, tmp_path)
    assert {a.regra for a in achados} == {"EVIDENCIA"} and {a.severidade for a in achados} == {"aviso"}
    assert len(achados) == 2 and all("não encontrado no documento" in a.mensagem for a in achados)
    assert any("GP101" in a.mensagem for a in achados)


def test_conferencia_pagina_lida_por_ocr(tmp_path):
    paginas_json(tmp_path, "#ST00=M00ABC10UZ010&MPA010", [("GP101 #ST00=M00ABC10UZ010-UZ001", True)])
    lc, _ = ler(linha(pag="1"))
    achados = c.conferir_com_extracao(lc, tmp_path)
    assert len(achados) == 1 and "lida por OCR" in achados[0].mensagem


def test_conferencia_documento_inexistente(tmp_path):
    lc, _ = ler(linha(), linha(tag="GP102"))
    achados = c.conferir_com_extracao(lc, tmp_path)
    assert len(achados) == 1 and "#ST00=M00ABC10UZ010&MPA010" in achados[0].mensagem


# --- catalogo_do_status -------------------------------------------------------------------------

LINHAS_STATUS = [
    ["Planilha do projeto fictício", None, None, None, None, None, None],
    ["CÓDIGO PMIB", "ITEM", "DESCRIÇÃO", "CÓDIGO DO MATERIAL", "MARCA/MODELO", "UNIDADE", "STATUS"],
    [4500000000.0001, 1, "VALVULA ESFERA", "PN-777", "ACME / V1", "UN", "COMPLETO"],
    ["'4500000000.0002 ", 2, "MANGUEIRA", "PN-888", "ACME / M2", "M", None],
    ["4500000000.0003", 3, "FICHA REPETIDA", "PN-999", "ACME", "UN", "DUPLICADO"],
    [None, None, "linha sem ficha", "PN-000", None, "UN", None],
    ["4500000000.0004", 4, "OLEO", None, None, "l.", ""],  # com ponto e minúscula, como o lmr.js aceita
]


class _Aba:
    def __init__(self, linhas):
        self.linhas = linhas

    def iter_rows(self, values_only=False):
        return iter([tuple(x) for x in self.linhas])


class _Livro:
    def __init__(self, abas):
        self.worksheets = abas

    def close(self):
        pass


def _com_livro(monkeypatch, *abas):
    # openpyxl é dublê no conftest: o livro vem de um falso com o mesmo contrato (worksheets/iter_rows).
    livro = _Livro([_Aba(a) for a in abas])
    monkeypatch.setitem(sys.modules, "openpyxl", SimpleNamespace(load_workbook=lambda caminho, **kw: livro))


def test_catalogo_do_status(monkeypatch, tmp_path):
    _com_livro(monkeypatch, [["capa"]], LINHAS_STATUS)
    cat = c.catalogo_do_status(tmp_path / "_STATUS_PMIB.xlsx")
    assert set(cat) == {"4500000000.0001", "4500000000.0002", "4500000000.0004"}  # DUPLICADO e sem ficha ficam fora
    assert cat["4500000000.0001"] == Material("4500000000.0001", "VALVULA ESFERA", "PN-777", False)
    assert cat["4500000000.0002"].granel is True and cat["4500000000.0004"].granel is True
    assert cat["4500000000.0004"].pn == ""


def test_catalogo_sem_cabecalho(monkeypatch, tmp_path):
    _com_livro(monkeypatch, [["a", "b"]])
    with pytest.raises(c.CsvInvalido):
        c.catalogo_do_status(tmp_path / "x.xlsx")


def test_involucro_da_extracao_devolve_o_mesmo_catalogo(monkeypatch, tmp_path):
    _com_livro(monkeypatch, LINHAS_STATUS)
    caminho = tmp_path / "_STATUS_PMIB.xlsx"
    assert extracao.catalogo_do_status(caminho) == c.catalogo_do_status(caminho)

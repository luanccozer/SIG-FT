"""Gravação da Aplicação LMR no template e serviço da aba 3. openpyxl REAL (ver tests/_openpyxl_de_verdade.py)."""

import json

import pytest
from _openpyxl_de_verdade import openpyxl_de_verdade

from sigft.services import gerar_lmr_planilha as p

F1, F2 = "4500000000.0001", "4500000000.0002"
CAB = ";".join(("FICHA_PMIB", "AREA_PAINEL", "RDS_PP", "TAG", "TAG_COM_RDS_PP", "PAIS", "LOCAL", "ELEVACAO",
                "EIXO", "TRECHOS", "QTD_POR_TRECHO", "DOCUMENTO", "PAGINA"))
RDS = "#ST50=M01MKF10UZ001"
DOC1, DOC2 = "DOC-1&MPB010", "DOC-2&MPB020"


def csv_linha(ficha, tag, rds=RDS, qtd="1", doc=DOC1, com_rds="SIM"):
    return ";".join([ficha, "SKID", rds, tag, com_rds, "", "CASA DE FORÇA", "98,50", "BC", "U-01", qtd, doc, "1"])


@pytest.fixture
def xl():
    with openpyxl_de_verdade() as real:
        yield real


@pytest.fixture
def entradas(tmp_path, xl):
    status = tmp_path / "_STATUS_PMIB.xlsx"
    wb = xl.Workbook()
    ws = wb.active
    ws.append(["CÓDIGO PMIB", "DESCRIÇÃO", "CÓDIGO DO MATERIAL", "UNIDADE", "STATUS"])
    ws.append([F1, "VALVULA ESFERA", "PN-1", "UN", None])
    ws.append([F2, "OLEO LUBRIFICANTE", "PN-2", "L", None])
    wb.save(status)
    csv = tmp_path / "aplicacao.csv"
    csv.write_text("\n".join([CAB, csv_linha(F1, "XV101"), csv_linha(F1, "XV102", doc=DOC2),
                              csv_linha(F2, "", qtd="50", com_rds="NÃO")]), encoding="utf-8")
    return csv, status


def rodar(csv, status, sistema, **kw):
    log = []
    kw.setdefault("nome", "SISTEMA TESTE")
    saida = p.realizar_aplicacao(
        csv, status, sistema, escopo="RV", subsistema="HIDRÁULICA", opcao_trechos="LISTA",
        lista_trechos=["U-01"], log_cb=lambda msg, nivel="info", contexto=None: log.append((nivel, msg)), **kw)
    return saida, log


def valores(ws, colunas, a, b):
    return [[ws.cell(row=r, column=c).value for c in colunas] for r in range(a, b + 1)]


def test_ponta_a_ponta(tmp_path, entradas, xl):
    sistema = tmp_path / "Água Pura"
    saida, log = rodar(*entradas, sistema)

    pasta = sistema / "LMR" / "SAIDA ATUAL"
    assert saida.aplicacao == pasta / "APLICAÇÃO LMR - SISTEMA TESTE.xlsx"
    assert saida.validacao == pasta / "VALIDAÇÃO - SISTEMA TESTE.xlsx"
    assert (saida.linhas, saida.bloqueadas) == (3, 0) and saida.assinatura.startswith("3-")

    wb = xl.load_workbook(saida.aplicacao)
    assert wb.sheetnames == ["DOCS DE REFERÊNCIA", "DESCRIÇÃO DOCUMENTOS", "APLICAÇÃO - LMR"]
    ap = wb["APLICAÇÃO - LMR"]
    assert valores(ap, (1, 2, 3), 1, 1) == [["FICHA_PMIB", "CÓDIGO_LMR", "TAG_LMR"]]  # cabeçalho do template
    corpo = valores(ap, (1, 2, 3), 2, 4)
    assert [x[0] for x in corpo] == [F1, F1, F2] and all(x[1] and x[2] for x in corpo)
    assert ap.cell(row=5, column=1).value is None
    assert ap.auto_filter.ref == "A1:C4"

    docs = wb["DOCS DE REFERÊNCIA"]
    assert docs["C2"].value == "SISTEMA TESTE" and docs["C4"].value == "HIDRÁULICA"
    assert valores(docs, (1, 2, 3, 4), 7, 8) == [
        [F1, "PN-1", "VALVULA ESFERA", DOC1], [F2, "PN-2", "OLEO LUBRIFICANTE", DOC1]]
    assert wb["DESCRIÇÃO DOCUMENTOS"]["A1"].value == "CÓDIGO ITAIPU"  # como está no template

    val = xl.load_workbook(saida.validacao).active
    assert valores(val, range(1, 7), 1, 1) == [
        ["LINHA DO CSV", "FICHA_PMIB", "TRECHO", "REGRA", "SEVERIDADE", "MENSAGEM"]]
    assert val.max_row == 1 + saida.avisos
    assert any("extração" in msg and nivel == "warn" for nivel, msg in log)  # sem pasta docling: conferência pulada
    assert any(saida.assinatura in msg for _, msg in log)


def test_linha_bloqueada_vai_para_a_validacao_e_nao_para_a_aplicacao(tmp_path, entradas, xl):
    csv, status = entradas
    csv.write_text("\n".join([CAB, csv_linha(F1, "XV101"), csv_linha(F1, "XV102", rds="")]), encoding="utf-8")
    saida, _ = rodar(csv, status, tmp_path)

    assert saida.linhas == 1 and saida.bloqueadas == 1
    assert xl.load_workbook(saida.aplicacao)["APLICAÇÃO - LMR"].max_row == 2
    val = xl.load_workbook(saida.validacao).active
    linhas = valores(val, range(1, 7), 2, val.max_row)
    assert any(x[4] == "bloqueia" and x[0] == 3 for x in linhas)  # linha 3 do CSV (cabeçalho é a 1)


def test_conferencia_roda_quando_existe_a_pasta_docling(tmp_path, entradas, xl):
    docling = tmp_path / "LMR" / "EXTRACAO" / "docling"
    docling.mkdir(parents=True)
    (docling / f"{DOC1}[R0].paginas.json").write_text(
        json.dumps({"arquivo": "x.pdf", "paginas": [{"n": 1, "ocr": True, "texto": "XV101"}]}), encoding="utf-8")
    saida, log = rodar(*entradas, tmp_path)
    val = xl.load_workbook(saida.validacao).active
    mensagens = [val.cell(row=r, column=6).value for r in range(2, val.max_row + 1)]
    assert any("lida por OCR" in m for m in mensagens) and any("não existe na extração" in m for m in mensagens)
    assert not any("pulada" in msg for _, msg in log)


# --- Foco 5: erro claro antes de gravar qualquer arquivo ---------------------------------------

def test_caminho_longo_demais(tmp_path, entradas):
    sistema = tmp_path / ("pasta muito comprida " * 6)
    with pytest.raises(p.NaoDaParaGravar, match=r"\d{3} caracteres"):
        rodar(*entradas, sistema, nome="X" * 40)
    assert not sistema.exists() and not (tmp_path / "LMR").exists()


def test_arquivo_aberto_no_excel(tmp_path, entradas, monkeypatch):
    pasta = tmp_path / "LMR" / "SAIDA ATUAL"
    pasta.mkdir(parents=True)
    aberto = pasta / "APLICAÇÃO LMR - SISTEMA TESTE.xlsx"
    aberto.write_bytes(b"original")

    def abrir(caminho, *a, **k):
        raise PermissionError(13, "Permission denied", str(caminho))

    monkeypatch.setattr(p, "open", abrir, raising=False)
    with pytest.raises(p.NaoDaParaGravar, match="Excel"):
        rodar(*entradas, tmp_path)
    assert aberto.read_bytes() == b"original"
    assert not (pasta / "VALIDAÇÃO - SISTEMA TESTE.xlsx").exists()


def test_texto_que_comeca_com_igual_nao_vira_formula(tmp_path, entradas, xl):
    csv, status = entradas
    csv.write_text("\n".join([CAB, csv_linha(F1, "XV101", doc="=M00MKF10&MPB020")]), encoding="utf-8")
    saida, _ = rodar(csv, status, tmp_path / "S")
    celula = xl.load_workbook(saida.aplicacao)["DOCS DE REFERÊNCIA"].cell(row=7, column=4)
    assert (celula.value, celula.data_type) == ("=M00MKF10&MPB020", "s")

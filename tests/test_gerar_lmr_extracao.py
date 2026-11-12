"""Serviço da extração do Gerar Aplicação LMR: chama a DLC (falsa aqui), monta INDICE.md, STATUS_PMIB.csv e lotes."""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from sigft.services import gerar_lmr_extracao as ex

PDF1 = "#ST00=M00MKF10&MPB020[R1A].pdf"
PDF2 = "#ST00=M00MKF10&MFB001[R0].pdf"
SEM_CODIGO = "desenho solto.pdf"
COM_TAG = "Válvula XV101 instalada em EL. 98,50 no eixo BC."
SEM_NADA = "Texto corrido sem identificação alguma."
COM_MATERIAL = "Peça com referência PN-777 no fabricante."


class ProcFalso:
    def __init__(self, linhas):
        self.stdout = iter(linhas)
        self.terminado = False
        self.returncode = 0

    def terminate(self):
        self.terminado = True

    def kill(self):
        self.terminado = True

    def wait(self, timeout=None):
        return self.returncode


def dlc_falsa(documentos, falhas=None, chamadas=None, procs=None):
    """`documentos`: nome do PDF -> lista de (texto, ocr). `falhas`: nome -> motivo."""
    falhas = falhas or {}

    def executar(args, **kw):
        if chamadas is not None:
            chamadas.append(args)
        pasta = Path(args[1]) / "docling"
        pasta.mkdir(parents=True, exist_ok=True)
        pdfs = [Path(a) for a in args[2:]]
        linhas = []
        for i, pdf in enumerate(pdfs, 1):
            linhas.append(f"PROGRESSO {i}/{len(pdfs)} {pdf.name}\n")
            if pdf.name in falhas:
                linhas.append(f"FALHA {pdf.name} {falhas[pdf.name]}\n")
                continue
            paginas = [{"n": n, "ocr": ocr, "texto": t} for n, (t, ocr) in enumerate(documentos[pdf.name], 1)]
            (pasta / f"{pdf.stem}.paginas.json").write_text(
                json.dumps({"arquivo": pdf.name, "paginas": paginas}, ensure_ascii=False), encoding="utf-8")
            linhas.append(f"OK {pdf.name} {len(paginas)} {sum(p['ocr'] for p in paginas)}\n")
        proc = ProcFalso(linhas)
        if procs is not None:
            procs.append(proc)
        return proc

    return executar


@pytest.fixture(autouse=True)
def status_falso(monkeypatch):
    catalogo = {"PN-777": SimpleNamespace(ficha="F1", descricao="VALVULA ESFERA", pn="PN-777", granel=False)}
    monkeypatch.setattr(ex, "catalogo_do_status", lambda caminho: catalogo)


def rodar(tmp_path, pdfs, executar, **kw):
    log, prog = [], []
    kw.setdefault("log_cb", lambda msg, nivel="info", contexto=None: log.append((nivel, msg)))
    kw.setdefault("progresso_cb", lambda atual, total, *, item=None: prog.append((atual, total, item)))
    extracao = ex.extrair([Path(p) for p in pdfs], tmp_path / "status.xlsx", tmp_path, executar=executar, **kw)
    return extracao, log, prog


def test_extrai_conta_e_grava(tmp_path):
    docs = {PDF1: [(COM_TAG, False), (SEM_NADA, True)], PDF2: [(COM_MATERIAL, False)]}
    extracao, log, prog = rodar(tmp_path, [PDF1, PDF2], dlc_falsa(docs))

    assert extracao.pasta == tmp_path / "LMR" / "EXTRACAO"
    assert (extracao.documentos, extracao.nao_lidos, extracao.paginas, extracao.paginas_ocr) == (2, [], 3, 1)
    assert extracao.lotes == 1
    assert prog == [(1, 2, PDF1), (2, 2, PDF2)]
    assert any(PDF1 in msg for _, msg in log)

    pasta = extracao.pasta
    md = (pasta / "#ST00=M00MKF10&MPB020[R1A].md").read_text(encoding="utf-8")
    assert "## Página 1" in md and COM_TAG in md and "## Página 2" in md
    indice = (pasta / "INDICE.md").read_text(encoding="utf-8")
    assert "#ST00=M00MKF10&MPB020" in indice and "R1A" in indice and "&MPB" in indice
    assert "EL. 98,50" in indice  # resumo de localização da 1ª página
    status = (pasta / "STATUS_PMIB.csv").read_text(encoding="utf-8")
    assert "PN-777" in status and "VALVULA ESFERA" in status
    lote = (pasta / "LOTES" / "lote_01.md").read_text(encoding="utf-8")
    assert "### #ST00=M00MKF10&MPB020 · página 1" in lote
    assert "### #ST00=M00MKF10&MFB001 · página 1" in lote  # entrou pelo código de material do Status
    assert SEM_NADA not in lote


def test_pdf_que_falha_aparece_em_nao_lidos_e_no_indice(tmp_path):
    docs = {PDF2: [(COM_TAG, False)]}
    extracao, log, _ = rodar(tmp_path, [PDF1, PDF2], dlc_falsa(docs, falhas={PDF1: "arquivo corrompido: x y"}))

    assert extracao.documentos == 1 and extracao.nao_lidos == [PDF1]
    indice = (extracao.pasta / "INDICE.md").read_text(encoding="utf-8")
    assert PDF1 in indice and "arquivo corrompido: x y" in indice


def test_nome_com_espaco_em_ok_e_falha(tmp_path):
    nome_ok, nome_falha = "Lista de Válvulas [R2].pdf", "Outro arquivo ruim.pdf"
    docs = {nome_ok: [(COM_TAG, False)]}
    extracao, _, _ = rodar(tmp_path, [nome_ok, nome_falha], dlc_falsa(docs, falhas={nome_falha: "sem texto"}))
    assert extracao.documentos == 1 and extracao.paginas == 1 and extracao.nao_lidos == [nome_falha]
    assert "sem texto" in (extracao.pasta / "INDICE.md").read_text(encoding="utf-8")


def test_argumentos_preservam_acento_e_espaco(tmp_path):
    chamadas = []
    sistema = tmp_path / "Água Pura" / "LMR EXTRAÇÃO"
    pdf = tmp_path / "pasta com espaço" / "Válvula 01 [R0].pdf"
    docs = {pdf.name: [(COM_TAG, False)]}
    extracao = ex.extrair([pdf], tmp_path / "s.xlsx", sistema, log_cb=lambda *a, **k: None,
                          progresso_cb=lambda *a, **k: None, executar=dlc_falsa(docs, chamadas=chamadas))
    args = chamadas[0]
    assert isinstance(args, list) and args[0].endswith("docling_sigft.exe")
    assert args[1:] == [str(sistema / "LMR" / "EXTRACAO"), str(pdf)]
    assert (sistema / "LMR" / "EXTRACAO" / "docling" / "Válvula 01 [R0].paginas.json").exists()
    assert extracao.documentos == 1


def test_nome_sem_codigo_entra_com_o_nome_e_aviso(tmp_path):
    docs = {SEM_CODIGO: [(COM_TAG, False)]}
    extracao, log, _ = rodar(tmp_path, [SEM_CODIGO], dlc_falsa(docs))
    assert extracao.documentos == 1
    assert any(nivel == "warn" and SEM_CODIGO in msg for nivel, msg in log)
    assert "desenho solto" in (extracao.pasta / "INDICE.md").read_text(encoding="utf-8")
    assert "### desenho solto · página 1" in (extracao.pasta / "LOTES" / "lote_01.md").read_text(encoding="utf-8")


def test_parar_encerra_a_dlc(tmp_path):
    procs = []
    docs = {PDF1: [(COM_TAG, False)]}
    with pytest.raises(ex.ExtracaoInterrompida):
        rodar(tmp_path, [PDF1], dlc_falsa(docs, procs=procs), parar=lambda: True)
    assert procs[0].terminado


def pag(n, texto):
    return {"n": n, "ocr": False, "texto": texto}


def doc(codigo, *textos):
    return {"codigo": codigo, "paginas": [pag(i, t) for i, t in enumerate(textos, 1)]}


def test_lotes_respeitam_limite_e_nao_cortam_pagina(monkeypatch):
    monkeypatch.setattr(ex, "TAMANHO_DO_LOTE", 300)
    paginas = [f"XV{i:03d} " + "a" * 60 for i in range(1, 11)]
    lotes = ex.montar_lotes([doc("D1", *paginas)], set())
    assert len(lotes) > 1 and all(len(lote) <= 300 for lote in lotes)
    assert sum(lote.count("### D1 · página") for lote in lotes) == 10
    juntos = "".join(lotes)
    assert all(p in juntos for p in paginas)  # nenhuma página cortada


def test_pagina_sem_tag_nem_codigo_fica_fora():
    lotes = ex.montar_lotes([doc("D1", SEM_NADA, "peça ABC-9 aqui", "tem #ST50=M01 no texto", "EL 12 m")], {"ABC-9"})
    assert len(lotes) == 1
    assert "página 1" not in lotes[0]
    assert all(f"página {n}" in lotes[0] for n in (2, 3, 4))


def test_pagina_gigante_vai_sozinha(monkeypatch):
    monkeypatch.setattr(ex, "TAMANHO_DO_LOTE", 200)
    gigante = "XV101 " + "b" * 500
    lotes = ex.montar_lotes([doc("D1", "XV102 curta", gigante, "XV103 curta")], set())
    assert len(lotes) == 3
    assert gigante in lotes[1] and "XV102" not in lotes[1] and "XV103" not in lotes[1]


def test_indice_lista_nao_lidos():
    texto = ex.montar_indice(
        [{"codigo": "D1", "revisao": "R0", "tipo": "&MPB", "arquivo": "D1[R0].pdf", "paginas": [pag(1, "EL. 3,20")]}],
        [("ruim.pdf", "corrompido")],
    )
    assert "ruim.pdf" in texto and "corrompido" in texto and "D1" in texto


def test_dlc_instalada(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "PASTA_DA_DLC", tmp_path)
    assert ex.dlc_instalada() is False  # sem executável
    (tmp_path / "docling_sigft.exe").write_bytes(b"")
    for saida, esperado in (("1\n", True), ("0\n", False)):
        monkeypatch.setattr(ex.subprocess, "run", lambda *a, _s=saida, **k: SimpleNamespace(stdout=_s, returncode=0))
        assert ex.dlc_instalada() is esperado

    def quebra(*a, **k):
        raise OSError("não executa")

    monkeypatch.setattr(ex.subprocess, "run", quebra)
    assert ex.dlc_instalada() is False

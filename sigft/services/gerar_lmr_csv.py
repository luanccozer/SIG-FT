"""Gerar Aplicação LMR: leitura do CSV do agente, gravação, catálogo do Status e conferência com a extração.

Não importa Qt. O cabeçalho `COLUNAS` é o contrato com o agente do AMP (`amp/aplicacao_lmr/agente.md`).
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

from sigft.core.excel.headers import find_header_row
from sigft.core.excel.pmib_codes import normalize_pmib
from sigft.services.gerar_lmr_motor import Achado, LinhaCsv, Material

COLUNAS = ("FICHA_PMIB", "AREA_PAINEL", "RDS_PP", "TAG", "TAG_COM_RDS_PP", "PAIS", "LOCAL", "ELEVACAO",
           "EIXO", "TRECHOS", "QTD_POR_TRECHO", "DOCUMENTO", "PAGINA")

_UNIDADES_GRANEL = {"L", "KG", "M", "M2", "M²", "M3", "M³", "ML", "G", "LT"}
_NOMES_DA_UNIDADE = ("UNIDADE", "UNID.", "UNID", "UND", "UN")
_PALAVRAS_DE_TRECHO = {"TODAS", "50HZ", "60HZ"}
_RDS_VARIAVEL = re.compile(r"#ST(?:\[XX\]|\d\d)=M(?:\[XX\]|\d\d)")


class CsvInvalido(ValueError):
    pass


def _achado(n, ficha, msg) -> Achado:
    return Achado(n, ficha, "", "CSV", "aviso", msg)


def _pais(texto: str) -> list[dict]:
    saida = []
    for parte in texto.split(";"):
        tag, _, rds = parte.partition("|")
        if tag.strip():
            saida.append({"tag": tag.strip(), "rds": rds.strip()})
    return saida


def ler_csv(texto: str) -> tuple[list[LinhaCsv], list[Achado]]:
    linhas = [ln for ln in texto.lstrip("﻿").splitlines()]
    inicio = next((i for i, ln in enumerate(linhas) if ln.strip().lstrip("﻿").startswith(COLUNAS[0])), None)
    if inicio is None:
        raise CsvInvalido(f"cabeçalho não encontrado (a primeira coluna deve ser {COLUNAS[0]})")
    sep = ";" if ";" in linhas[inicio] else ","
    leitor = csv.reader((ln for ln in linhas[inicio:] if not ln.strip().startswith("```")), delimiter=sep)
    cabecalho = [h.strip() for h in next(leitor)]
    faltam = [col for col in COLUNAS if col not in cabecalho]
    if faltam:
        raise CsvInvalido(f"coluna faltando no cabeçalho: {', '.join(faltam)}")
    pos = {col: cabecalho.index(col) for col in COLUNAS}

    achados: list[Achado] = []
    lidas: list[LinhaCsv] = []
    for campos in leitor:
        n = inicio + leitor.line_num
        if not any(x.strip() for x in campos) or campos[0].strip() == COLUNAS[0]:
            continue  # linha vazia ou cabeçalho repetido a cada lote
        if len(campos) < len(cabecalho):
            achados.append(_achado(n, "", f"linha ignorada: {len(campos)} colunas em vez de {len(cabecalho)}"))
            continue
        v = {col: campos[i].strip() for col, i in pos.items()}
        ficha = normalize_pmib(v["FICHA_PMIB"])
        if not ficha:
            achados.append(_achado(n, "", "linha ignorada: sem FICHA_PMIB"))
            continue
        qtd = None
        if v["QTD_POR_TRECHO"]:
            try:
                qtd = int(v["QTD_POR_TRECHO"])
            except ValueError:
                achados.append(_achado(n, ficha, f"QTD_POR_TRECHO ilegível: {v['QTD_POR_TRECHO']!r}"))
        lidas.append(LinhaCsv(
            n=n, ficha=ficha, area=v["AREA_PAINEL"], rds=v["RDS_PP"], tag=v["TAG"],
            tag_com_rds=v["TAG_COM_RDS_PP"].upper() in ("SIM", "S"), pais=_pais(v["PAIS"]), local=v["LOCAL"],
            elevacao=v["ELEVACAO"], eixo=v["EIXO"], trechos=v["TRECHOS"], qtd=qtd,
            documento=v["DOCUMENTO"], pagina=v["PAGINA"]))
    return _unir(lidas, achados)


def _lista(trechos: str) -> list[str]:
    return [x for x in re.split(r"[,;\s]+", trechos) if x]


def _unir(lidas: list[LinhaCsv], achados: list[Achado]) -> tuple[list[LinhaCsv], list[Achado]]:
    """Linhas com a mesma chave (tudo menos trechos, quantidade, documento e página) viram uma."""
    unidas: dict[tuple, LinhaCsv] = {}
    for lc in lidas:
        chave = (lc.ficha, lc.area, lc.rds, lc.tag, lc.tag_com_rds, tuple((p["tag"], p["rds"]) for p in lc.pais),
                 lc.local, lc.elevacao, lc.eixo)
        base = unidas.get(chave)
        if base is None:
            unidas[chave] = lc
            continue
        a, b = base.trechos.upper(), lc.trechos.upper()
        if "TODAS" in (a, b):
            base.trechos = "TODAS"
        elif a in _PALAVRAS_DE_TRECHO or b in _PALAVRAS_DE_TRECHO:
            if a != b:
                achados.append(_achado(lc.n, lc.ficha, f"trechos incompatíveis ({base.trechos} e {lc.trechos}); "
                                                       f"ficou {base.trechos}"))
        else:
            base.trechos = ";".join(dict.fromkeys(_lista(base.trechos) + _lista(lc.trechos)))
        if base.qtd != lc.qtd:
            achados.append(_achado(lc.n, lc.ficha, f"quantidades diferentes para a mesma posição "
                                                   f"({base.qtd} e {lc.qtd}); ficou {base.qtd}"))
    return list(unidas.values()), achados


def gravar_csv(caminho: Path, linhas: list[LinhaCsv]) -> None:
    with open(caminho, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(COLUNAS)
        for lc in linhas:
            w.writerow([
                lc.ficha, lc.area, lc.rds, lc.tag, "SIM" if lc.tag_com_rds else "NÃO",
                " ; ".join(f"{p['tag']} | {p['rds']}" for p in lc.pais), lc.local, lc.elevacao, lc.eixo,
                lc.trechos, "" if lc.qtd is None else lc.qtd, lc.documento, lc.pagina])


def catalogo_do_status(caminho_xlsx: Path) -> dict[str, Material]:
    import openpyxl  # tardio: o dublê do conftest troca o módulo nos testes

    livro = openpyxl.load_workbook(caminho_xlsx, read_only=True, data_only=True)
    try:
        for aba in livro.worksheets:
            linhas = [list(r) for r in aba.iter_rows(values_only=True)]
            topo = find_header_row(linhas, ["CÓDIGO PMIB", "CÓDIGO DO MATERIAL", "DESCRIÇÃO"])
            if topo is not None:
                break
        else:
            raise CsvInvalido("Status sem cabeçalho com CÓDIGO PMIB, CÓDIGO DO MATERIAL e DESCRIÇÃO")
    finally:
        livro.close()

    def col(*nomes):
        cab = [str(x or "").strip().upper() for x in linhas[topo]]
        return next((cab.index(n) for n in nomes if n in cab), None)

    i_ficha, i_desc, i_pn = col("CÓDIGO PMIB"), col("DESCRIÇÃO"), col("CÓDIGO DO MATERIAL")
    i_status, i_un = col("STATUS"), col(*_NOMES_DA_UNIDADE)

    def cel(linha, i):
        return "" if i is None or i >= len(linha) or linha[i] is None else str(linha[i]).strip()

    catalogo: dict[str, Material] = {}
    for linha in linhas[topo + 1:]:
        ficha = normalize_pmib(linha[i_ficha]) if i_ficha < len(linha) else ""
        if not ficha or cel(linha, i_status).upper() == "DUPLICADO":
            continue
        catalogo[ficha] = Material(ficha, cel(linha, i_desc), cel(linha, i_pn),
                                   # o lmr.js tira o ponto: "KG." também é granel
                                   cel(linha, i_un).upper().replace(".", "") in _UNIDADES_GRANEL)
    return catalogo


def _compacto(s: str) -> str:
    return re.sub(r"\s+", "", s)


def _documentos_da_extracao(pasta: Path) -> dict[str, Path]:
    """código do documento (com ou sem a revisão `[R1A]`) → `<stem>.paginas.json`."""
    indice: dict[str, Path] = {}
    for arq in sorted(pasta.glob("*.paginas.json")):
        stem = arq.name[: -len(".paginas.json")]
        indice.setdefault(stem, arq)
        indice.setdefault(re.sub(r"\[[^\]]*\]$", "", stem), arq)
    return indice


def conferir_com_extracao(linhas: list[LinhaCsv], pasta_docling: Path) -> list[Achado]:
    achados: list[Achado] = []
    arquivos = _documentos_da_extracao(Path(pasta_docling))
    cache: dict[str, tuple[str, dict[str, bool]] | None] = {}
    ausentes: set[str] = set()

    def doc(nome):
        if nome not in cache:
            arq = arquivos.get(nome)
            cache[nome] = None
            if arq:
                paginas = json.loads(arq.read_text(encoding="utf-8"))["paginas"]
                cache[nome] = (_compacto(" ".join(p["texto"] for p in paginas)),
                               {str(p["n"]): bool(p.get("ocr")) for p in paginas})
        return cache[nome]

    for lc in linhas:
        dados = doc(lc.documento)
        if dados is None:
            if lc.documento not in ausentes:
                ausentes.add(lc.documento)
                achados.append(Achado(lc.n, lc.ficha, "", "EVIDENCIA", "aviso",
                                      f"documento '{lc.documento}' não existe na extração"))
            continue
        texto, ocr_por_pagina = dados
        procurados = [("TAG", t) for t in lc.tag.split("/") if t.strip()]
        sem_variavel = _RDS_VARIAVEL.sub("", lc.rds)
        procurados += [("RDS_PP", s) for s in sem_variavel.split("[XX]") if s.strip()] if lc.rds else []
        for rotulo, valor in procurados:
            if _compacto(valor) not in texto:
                achados.append(Achado(lc.n, lc.ficha, "", "EVIDENCIA", "aviso",
                                      f"{rotulo} {valor.strip()} não encontrado no documento {lc.documento}"))
        if ocr_por_pagina.get(lc.pagina):
            achados.append(Achado(lc.n, lc.ficha, "", "EVIDENCIA", "aviso",
                                  f"página {lc.pagina} de {lc.documento} lida por OCR"))
    return achados

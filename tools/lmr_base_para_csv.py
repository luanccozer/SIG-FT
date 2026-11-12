"""Converte a aba BASE do formato antigo (Box, `lmr.js`) para o CSV da Aplicação LMR do SIG-FT.

    python tools/lmr_base_para_csv.py "BASE LMR - Sistema.xlsx" saida.csv

Serve à regressão por assinatura (`tests/test_gerar_lmr_regressao.py`): a mesma BASE passa pelo `lmr.js` e,
convertida, pelo motor Python, e as assinaturas têm de ser iguais. `TRECHOS` e `PAIS` já estão no formato
do CSV; o que muda é o nome das colunas (as de `lmr.js`, `COLUNAS_BASE`) e a ficha, que às vezes vem com
apóstrofo. Só lê a BASE; nunca grava nela.
"""
from __future__ import annotations

import re
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
if str(RAIZ) not in sys.path:  # rodado como script, `sigft` não está no caminho
    sys.path.insert(0, str(RAIZ))

from sigft.services.gerar_lmr_csv import catalogo_do_status, gravar_csv, ler_csv  # noqa: E402
from sigft.services.gerar_lmr_motor import LinhaCsv, Resultado, gerar  # noqa: E402
from sigft.services.gerar_lmr_regras import normaliza_trecho, trechos_do_projeto  # noqa: E402

# colunas da aba BASE do lmr.js (COLUNAS_BASE)
_OBRIGATORIAS = ("ESCOPO", "SUBSISTEMA", "FICHA_PMIB", "ÁREA/PAINEL", "RDS-PP", "TAG", "TAG COM RDS-PP", "PAIS",
                 "LOCAL", "ELEVAÇÃO", "EIXO", "TRECHOS", "QTD POR TRECHO")


def _txt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def _pais(texto: str) -> list[dict]:
    """`TAG | RDS ; TAG | RDS` (o mesmo parse do `linhaParaModelo` do lmr.js)."""
    saida = []
    for parte in [p for p in re.split(r"\s*;\s*", texto) if p]:
        tag, _, rds = parte.partition("|")
        saida.append({"tag": tag.strip(), "rds": rds.strip()})
    return saida


def ler_base(caminho: Path) -> tuple[list[LinhaCsv], str, str, list[str]]:
    """(linhas, escopo, subsistema, trechos usados). Escopo e subsistema são os da BASE: têm de ser um só."""
    import openpyxl  # tardio: o conftest troca o módulo nos testes

    livro = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
    try:
        if "BASE" not in livro.sheetnames:
            raise ValueError(f"{Path(caminho).name}: não tem a aba BASE")
        linhas_xlsx = [list(r) for r in livro["BASE"].iter_rows(values_only=True)]
    finally:
        livro.close()
    if not linhas_xlsx:
        raise ValueError(f"{Path(caminho).name}: aba BASE vazia")
    cab = [_txt(c).upper() for c in linhas_xlsx[0]]
    faltam = [c for c in _OBRIGATORIAS if c not in cab]
    if faltam:
        raise ValueError(f"aba BASE sem a coluna {', '.join(faltam)}")
    col = {c: cab.index(c) for c in _OBRIGATORIAS}

    def campo(linha, nome) -> str:
        i = col[nome]
        return _txt(linha[i]) if i < len(linha) else ""

    linhas: list[LinhaCsv] = []
    escopos: dict[str, None] = {}
    subsistemas: dict[str, None] = {}
    usados: dict[str, None] = {}
    for n, linha in enumerate(linhas_xlsx[1:], start=2):
        ficha = campo(linha, "FICHA_PMIB").lstrip("'")
        if not ficha:
            continue
        escopos[campo(linha, "ESCOPO")] = None
        subsistemas[campo(linha, "SUBSISTEMA")] = None
        trechos = [t for t in re.split(r"[,;\s]+", campo(linha, "TRECHOS")) if t]
        for t in trechos:
            if normaliza_trecho(t):
                usados[normaliza_trecho(t)] = None
        qtd = campo(linha, "QTD POR TRECHO")
        linhas.append(LinhaCsv(
            n=n, ficha=ficha, area=campo(linha, "ÁREA/PAINEL"), rds=campo(linha, "RDS-PP"), tag=campo(linha, "TAG"),
            tag_com_rds=campo(linha, "TAG COM RDS-PP").upper().startswith("S"), pais=_pais(campo(linha, "PAIS")),
            local=campo(linha, "LOCAL"), elevacao=campo(linha, "ELEVAÇÃO"), eixo=campo(linha, "EIXO"),
            trechos=";".join(trechos), qtd=int(float(qtd)) if qtd else None, documento="", pagina=""))
    for nome, valores in (("ESCOPO", escopos), ("SUBSISTEMA", subsistemas)):
        if len(valores) > 1:
            raise ValueError(f"a BASE tem mais de um {nome}: {', '.join(repr(v) for v in valores)}")
    return linhas, next(iter(escopos), ""), next(iter(subsistemas), ""), list(usados)


def converter(base: Path, saida: Path) -> None:
    """Grava o CSV (`;`, UTF-8 com BOM) da BASE."""
    gravar_csv(Path(saida), ler_base(Path(base))[0])


def gerar_da_base(base: Path, status: Path, saida_csv: Path | None = None, *, opcao_trechos: str | None = None,
                  lista_trechos: list[str] | None = None) -> Resultado:
    """BASE antiga → CSV → `ler_csv` → `gerar`, o mesmo caminho da Aplicação. O projeto é `opcao_trechos`
    (como no formulário do `lmr.js`) ou, sem ela, os trechos que a BASE cita."""
    _, escopo, subsistema, usados = ler_base(Path(base))
    with tempfile.TemporaryDirectory() as pasta:
        csv = Path(saida_csv) if saida_csv else Path(pasta) / "base.csv"
        converter(Path(base), csv)
        linhas, _ = ler_csv(csv.read_text(encoding="utf-8-sig"))
    projeto = (trechos_do_projeto(opcao_trechos, lista_trechos) if opcao_trechos
               else trechos_do_projeto("LISTA", usados))
    return gerar(linhas, catalogo_do_status(Path(status)), escopo=escopo, subsistema=subsistema, projeto=projeto)


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 2:
        print("uso: python tools/lmr_base_para_csv.py <BASE LMR.xlsx> <saida.csv>", file=sys.stderr)
        return 2
    converter(Path(argv[0]), Path(argv[1]))
    print(f"Gravado: {argv[1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

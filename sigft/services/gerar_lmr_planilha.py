"""Gerar Aplicação LMR, aba 3: roda o motor sobre o CSV e grava a Aplicação (no template) e a Validação.

Não importa Qt. Saídas em `<pasta do sistema>\\LMR\\SAIDA ATUAL\\`.
"""

from __future__ import annotations

import time
from copy import copy
from dataclasses import dataclass
from pathlib import Path

from sigft.services.gerar_lmr_csv import catalogo_do_status, conferir_com_extracao, ler_csv
from sigft.services.gerar_lmr_motor import Achado, gerar
from sigft.services.gerar_lmr_regras import trechos_do_projeto

TEMPLATE = Path(__file__).resolve().parents[1] / "dados" / "lmr" / "Template_Aplicação_LMR.xlsx"
LIMITE_DO_CAMINHO = 259  # MAX_PATH do Windows
_PRIMEIRA_LINHA_DOCS = 7  # as linhas 1 a 6 do template são o cabeçalho da aba DOCS DE REFERÊNCIA
_COLUNAS_VALIDACAO = ("LINHA DO CSV", "FICHA_PMIB", "TRECHO", "REGRA", "SEVERIDADE", "MENSAGEM")


@dataclass(frozen=True)
class Saida:
    aplicacao: Path
    validacao: Path
    linhas: int
    bloqueadas: int
    avisos: int
    assinatura: str


class NaoDaParaGravar(RuntimeError):
    pass


def _conferir_antes_de_gravar(destinos: list[Path]) -> None:
    for d in destinos:
        if len(str(d)) > LIMITE_DO_CAMINHO:
            raise NaoDaParaGravar(
                f"O caminho tem {len(str(d))} caracteres (o limite do Windows é {LIMITE_DO_CAMINHO}): {d}. "
                "Use uma pasta mais curta ou um nome menor.")
    for d in destinos:
        if not d.exists():
            continue  # abrir para gravar criaria o arquivo; só testa o que já existe
        try:
            with open(d, "r+b"):
                pass
        except PermissionError as exc:
            raise NaoDaParaGravar(f"Feche o arquivo no Excel e tente de novo: {d.name}") from exc


def _gravar_aplicacao(openpyxl, destino: Path, nome: str, subsistema: str, resultado, linhas_csv, catalogo) -> None:
    wb = openpyxl.load_workbook(TEMPLATE)
    docs = wb["DOCS DE REFERÊNCIA"]
    docs["C2"] = nome
    docs["C4"] = subsistema or "-"
    documento_da_ficha: dict[str, str] = {}
    for lc in linhas_csv:
        documento_da_ficha.setdefault(lc.ficha, lc.documento)
    fichas = list(dict.fromkeys(ficha for ficha, _, _ in resultado.linhas))
    for i, ficha in enumerate(fichas):
        r = _PRIMEIRA_LINHA_DOCS + i
        m = catalogo[ficha]
        for col, valor in enumerate((ficha, m.pn, m.descricao, documento_da_ficha.get(ficha, "")), 1):
            docs.cell(row=r, column=col, value=valor)
        for col in range(1, 8):  # as linhas novas herdam o estilo da primeira
            docs.cell(row=r, column=col)._style = copy(docs.cell(row=_PRIMEIRA_LINHA_DOCS, column=col)._style)

    ap = wb["APLICAÇÃO - LMR"]
    for i, (ficha, codigo, tag) in enumerate(resultado.linhas, 2):
        for col, valor in enumerate((ficha, codigo, tag), 1):
            ap.cell(row=i, column=col, value=valor)
    ap.auto_filter.ref = f"A1:C{len(resultado.linhas) + 1}"
    wb.save(destino)


def _gravar_validacao(openpyxl, destino: Path, achados: list[Achado]) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "VALIDAÇÃO"
    ws.append(_COLUNAS_VALIDACAO)
    for a in achados:
        ws.append((a.linha_csv, a.ficha, a.trecho, a.regra, a.severidade, a.mensagem))
    ws.auto_filter.ref = f"A1:F{len(achados) + 1}"
    wb.save(destino)


def realizar_aplicacao(csv: Path, status: Path, pasta_sistema: Path, *, nome: str, escopo: str, subsistema: str,
                       opcao_trechos: str, lista_trechos: list[str] | None, log_cb) -> Saida:
    import openpyxl  # tardio: o conftest troca o módulo por um dublê nos testes que não usam planilha

    inicio = time.monotonic()
    log_cb(f"Gerando a Aplicação LMR de {nome}...")
    pasta = Path(pasta_sistema) / "LMR"
    aplicacao = pasta / "SAIDA ATUAL" / f"APLICAÇÃO LMR - {nome}.xlsx"
    validacao = pasta / "SAIDA ATUAL" / f"VALIDAÇÃO - {nome}.xlsx"
    _conferir_antes_de_gravar([aplicacao, validacao])

    linhas_csv, achados = ler_csv(Path(csv).read_text(encoding="utf-8-sig"))
    catalogo = catalogo_do_status(Path(status))
    resultado = gerar(linhas_csv, catalogo, escopo=escopo, subsistema=subsistema,
                      projeto=trechos_do_projeto(opcao_trechos, lista_trechos))
    achados = achados + resultado.achados

    pasta_docling = pasta / "EXTRACAO" / "docling"
    if pasta_docling.is_dir():
        achados += conferir_com_extracao(linhas_csv, pasta_docling)
    else:
        log_cb("Sem a pasta de extração (LMR\\EXTRACAO\\docling): a conferência com os documentos foi pulada.", "warn")

    aplicacao.parent.mkdir(parents=True, exist_ok=True)
    _gravar_aplicacao(openpyxl, aplicacao, nome, subsistema, resultado, linhas_csv, catalogo)
    _gravar_validacao(openpyxl, validacao, achados)

    avisos = sum(a.severidade == "aviso" for a in achados)
    saida = Saida(aplicacao, validacao, len(resultado.linhas), resultado.bloqueadas, avisos, resultado.assinatura)
    log_cb(f"Aplicação gerada: {saida.linhas} linhas, {saida.bloqueadas} bloqueadas, {avisos} avisos, "
           f"assinatura {saida.assinatura} ({time.monotonic() - inicio:.1f} s).")
    return saida

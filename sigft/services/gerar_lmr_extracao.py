"""Gerar Aplicação LMR, estágio 1: chama a DLC do Docling e monta a pasta LMR\\EXTRACAO\\.

Não importa Qt, `docling` nem `torch`: a DLC é um executável à parte (empacotamento/docling_dlc).
Contrato de saída da DLC: linhas `PROGRESSO i/n nome`, `OK nome paginas paginas_ocr`, `FALHA nome motivo`,
e `<stem>.paginas.json` em `<pasta_saida>\\docling\\`.
"""

from __future__ import annotations

import csv
import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from sigft.services.gerar_lmr_csv import catalogo_do_status

TAMANHO_DO_LOTE = 80_000
PASTA_DA_DLC = Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "SIG-FT" / "docling"
VERSAO_DA_DLC = "1"
LIMITE_DA_LINHA = 30_000  # o CreateProcess do Windows aceita 32.767 caracteres; sobra margem
_EXE = "docling_sigft.exe"

_TAG = re.compile(r"\b[A-Z]{1,3}\d{2,3}[A-Z]?\b")
_RDS = re.compile(r"#ST|=M\d\d")
_ELEVACAO = re.compile(r"EL\.?\s*\d")
_LOCALIZACAO = re.compile(r"EL\.?\s*\d|(?i:\beixo\b)")
_NOME = re.compile(r"^(?P<codigo>.*?)(?:\[(?P<revisao>[^\]]*)\])?$")
_TIPO = re.compile(r"&[A-Z]{3}")


@dataclass(frozen=True)
class Extracao:
    pasta: Path
    documentos: int
    nao_lidos: list[str]
    paginas: int
    paginas_ocr: int
    lotes: int


class ExtracaoInterrompida(RuntimeError):
    pass


def dlc_instalada() -> bool:
    exe = PASTA_DA_DLC / _EXE
    if not exe.is_file():
        return False
    try:
        r = subprocess.run([str(exe), "--versao"], capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return False
    return r.stdout.strip() == VERSAO_DA_DLC


def _identificar(arquivo: str) -> tuple[str, str, str, bool]:
    """(código, revisão, tipo, reconhecido) pelo nome do arquivo."""
    m = _NOME.match(Path(arquivo).stem)
    codigo, revisao = m["codigo"].strip(), (m["revisao"] or "").strip()
    tipo = _TIPO.search(codigo)
    return codigo, revisao, tipo.group() if tipo else "", bool(tipo)


def _nome_da_falha(resto: str, nomes: list[str]) -> tuple[str, str] | None:
    # O nome do PDF pode ter espaço: casa pelos nomes conhecidos, do maior para o menor.
    for nome in sorted(nomes, key=len, reverse=True):
        if resto == nome or resto.startswith(nome + " "):
            return nome, resto[len(nome):].strip()
    return None


def _encerrar(proc) -> None:
    proc.terminate()
    proc.wait()
    raise ExtracaoInterrompida("Extração interrompida.")


def _em_chamadas(pdfs: list[Path], fixo: int):
    """Divide os PDFs em grupos que cabem numa linha de comando do Windows (limite de 32.767 caracteres)."""
    grupo: list[Path] = []
    tamanho = fixo
    for pdf in pdfs:
        n = len(str(pdf)) + 3  # espaço e aspas
        if grupo and tamanho + n > LIMITE_DA_LINHA:
            yield grupo
            grupo, tamanho = [], fixo
        grupo.append(pdf)
        tamanho += n
    if grupo:
        yield grupo


def _ler_saida(proc, pdfs: list[Path], log_cb, progresso_cb, parar, feitos: int = 0,
               total_geral: int | None = None) -> tuple[set[str], dict[str, str]]:
    total_geral = total_geral or len(pdfs)
    nomes = [p.name for p in pdfs]
    lidos: set[str] = set()
    falhas: dict[str, str] = {}
    for linha in proc.stdout:
        if parar():
            _encerrar(proc)
        linha = linha.rstrip("\r\n")
        if not linha:
            continue
        log_cb(linha)
        if linha.startswith("PROGRESSO "):
            contagem, _, nome = linha[10:].partition(" ")
            atual, _, total = contagem.partition("/")
            if atual.isdigit() and total.isdigit():
                progresso_cb(feitos + int(atual), total_geral, item=nome)
        elif linha.startswith("OK "):
            # os dois últimos campos são os números; o resto é o nome (que pode ter espaços)
            partes = linha[3:].rsplit(" ", 2)
            if len(partes) == 3 and partes[0] in nomes:
                lidos.add(partes[0])
        elif linha.startswith("FALHA "):
            achado = _nome_da_falha(linha[6:], nomes)
            if achado:
                falhas[achado[0]] = achado[1] or "sem motivo"
    if parar():  # pedido depois da última linha
        _encerrar(proc)
    proc.wait()
    return lidos, falhas


def extrair(pdfs, status, pasta_sistema, *, log_cb, progresso_cb, parar=lambda: False,
            executar=subprocess.Popen) -> Extracao:
    pasta = Path(pasta_sistema) / "LMR" / "EXTRACAO"
    pasta.mkdir(parents=True, exist_ok=True)
    pdfs = [Path(p) for p in pdfs]
    catalogo = catalogo_do_status(Path(status))

    exe = str(PASTA_DA_DLC / _EXE)
    lidos: set[str] = set()
    falhas: dict[str, str] = {}
    feitos = 0
    for grupo in _em_chamadas(pdfs, len(exe) + len(str(pasta)) + 6):
        proc = executar([exe, str(pasta), *map(str, grupo)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                        text=True, encoding="utf-8", errors="replace",
                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        ok, falha = _ler_saida(proc, grupo, log_cb, progresso_cb, parar, feitos, len(pdfs))
        lidos |= ok
        falhas.update(falha)
        feitos += len(grupo)

    documentos: list[dict] = []
    nao_lidos: list[tuple[str, str]] = []
    for pdf in pdfs:
        if pdf.name in falhas:
            nao_lidos.append((pdf.name, falhas[pdf.name]))
            continue
        try:
            if pdf.name not in lidos:
                raise ValueError("a DLC não respondeu sobre este arquivo")
            dados = json.loads((pasta / "docling" / f"{pdf.stem}.paginas.json").read_text(encoding="utf-8"))
            paginas = dados["paginas"]
        except (OSError, ValueError, KeyError) as exc:
            nao_lidos.append((pdf.name, str(exc) or type(exc).__name__))
            continue
        codigo, revisao, tipo, reconhecido = _identificar(pdf.name)
        if not reconhecido:
            log_cb(f"{pdf.name}: nome sem código de documento reconhecido; usando o nome do arquivo.", "warn")
        documentos.append({"arquivo": pdf.name, "stem": pdf.stem, "codigo": codigo, "revisao": revisao,
                           "tipo": tipo, "paginas": paginas})

    for d in documentos:
        corpo = "".join(f"## Página {p['n']}\n\n{p['texto']}\n\n" for p in d["paginas"])
        (pasta / f"{d['stem']}.md").write_text(f"# {d['codigo']}\n\n{corpo}", encoding="utf-8")
    (pasta / "INDICE.md").write_text(montar_indice(documentos, nao_lidos), encoding="utf-8")
    with open(pasta / "STATUS_PMIB.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(("FICHA", "DESCRICAO", "CODIGO_DO_MATERIAL"))
        w.writerows((m.ficha, m.descricao, m.pn) for m in catalogo.values())

    lotes = montar_lotes(documentos, {m.pn for m in catalogo.values() if m.pn})
    pasta_lotes = pasta / "LOTES"
    shutil.rmtree(pasta_lotes, ignore_errors=True)  # lotes de uma extração anterior não ficam sobrando
    pasta_lotes.mkdir()
    for i, lote in enumerate(lotes, 1):
        (pasta_lotes / f"lote_{i:02d}.md").write_text(lote, encoding="utf-8")

    return Extracao(
        pasta=pasta,
        documentos=len(documentos),
        nao_lidos=[nome for nome, _ in nao_lidos],
        paginas=sum(len(d["paginas"]) for d in documentos),
        paginas_ocr=sum(bool(p.get("ocr")) for d in documentos for p in d["paginas"]),
        lotes=len(lotes),
    )


def _vale_para_o_lote(texto: str, codigos_do_status: set[str]) -> bool:
    return bool(_TAG.search(texto) or _RDS.search(texto) or _ELEVACAO.search(texto)
                or any(c in texto for c in codigos_do_status))


def montar_lotes(documentos: list[dict], codigos_do_status: set[str]) -> list[str]:
    lotes: list[str] = []
    atual, tamanho = [], 0
    for d in documentos:
        for p in d["paginas"]:
            if not _vale_para_o_lote(p["texto"], codigos_do_status):
                continue
            bloco = f"### {d['codigo']} · página {p['n']}\n\n{p['texto']}\n\n"
            if atual and tamanho + len(bloco) > TAMANHO_DO_LOTE:
                lotes.append("".join(atual))
                atual, tamanho = [], 0
            atual.append(bloco)
            tamanho += len(bloco)
    if atual:
        lotes.append("".join(atual))
    return lotes


def _celula(valor) -> str:
    return str(valor).replace("|", "\\|").replace("\n", " ")


def montar_indice(documentos: list[dict], nao_lidos: list[tuple[str, str]]) -> str:
    linhas = ["# Índice da extração", "", "| Código | Revisão | Tipo | Páginas | Páginas por OCR | Arquivo |",
              "|---|---|---|---|---|---|"]
    for d in documentos:
        ocr = sum(bool(p.get("ocr")) for p in d["paginas"])
        linhas.append("| " + " | ".join(_celula(v) for v in (
            d["codigo"], d.get("revisao", ""), d.get("tipo", ""), len(d["paginas"]), ocr, d["arquivo"])) + " |")
    linhas += ["", "## Não lidos", ""]
    linhas += [f"- {nome}: {motivo}" for nome, motivo in nao_lidos] or ["Nenhum."]
    linhas += ["", "## Localização (carimbo, 1ª página)", ""]
    for d in documentos:
        if not d["paginas"]:
            continue
        achadas = [ln.strip() for ln in d["paginas"][0]["texto"].splitlines() if _LOCALIZACAO.search(ln)]
        if achadas:
            linhas += [f"### {d['codigo']}", *(f"- {ln[:160]}" for ln in achadas[:8]), ""]
    return "\n".join(linhas) + "\n"

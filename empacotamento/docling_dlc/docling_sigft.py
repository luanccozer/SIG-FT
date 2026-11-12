"""Programa da DLC do Docling: extrai texto por página de PDFs para o SIG-FT.

Roda como executável à parte (fora do instalador do SIG-FT, que nunca importa docling nem torch).

Uso:  docling_sigft <pasta_saida> <pdf> [<pdf> ...]
      docling_sigft --versao

Saída padrão, uma linha por evento:
    PROGRESSO <i>/<n> <nome>
    OK <nome> <paginas> <paginas_ocr>
    FALHA <nome> <motivo>
Grava em <pasta_saida>/docling/: <stem>.json (exportação completa do Docling) e
<stem>.paginas.json = {"arquivo", "paginas": [{"n", "ocr", "texto"}]}.
Código de saída 0 se ao menos um PDF foi lido.
"""
import json
import os
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

VERSAO = "1"
# Página com menos que isso na camada de texto do PDF conta como OCR.
MIN_CARACTERES_TEXTO = 20


@dataclass
class Pagina:
    n: int
    ocr: bool
    texto: str


class Paginas(list):
    """Lista de Pagina que leva junto a exportação completa do Docling (`documento`)."""

    documento: dict | None = None


def _pasta_modelos() -> Path:
    # Os modelos vão dentro do pacote; DOCLING_ARTIFACTS_PATH permite apontar outra pasta.
    base = Path(sys.executable if getattr(sys, "frozen", False) else __file__).resolve().parent
    return Path(os.environ.get("DOCLING_ARTIFACTS_PATH") or base / "modelos")


_conversor_docling = None


def converter(pdf: Path) -> list[Pagina]:
    """Conversão real pelo Docling (importado só aqui)."""
    global _conversor_docling
    import pypdfium2
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    if _conversor_docling is None:
        opcoes = PdfPipelineOptions(artifacts_path=str(_pasta_modelos()))
        _conversor_docling = DocumentConverter(
            format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opcoes)}
        )
    doc = _conversor_docling.convert(str(pdf)).document

    pdfium = pypdfium2.PdfDocument(str(pdf))
    try:
        camada = [len(pdfium[i].get_textpage().get_text_range().strip()) for i in range(len(pdfium))]
    finally:
        pdfium.close()

    paginas = Paginas()
    for n in sorted(doc.pages):
        ocr = n > len(camada) or camada[n - 1] < MIN_CARACTERES_TEXTO
        paginas.append(Pagina(n, ocr, doc.export_to_markdown(page_no=n)))
    paginas.documento = doc.export_to_dict()
    return paginas


def main(argv: list[str] | None = None, converter=converter) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] == ["--versao"]:
        print(VERSAO, flush=True)
        return 0
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2

    pasta = Path(argv[0]) / "docling"
    pasta.mkdir(parents=True, exist_ok=True)
    pdfs = [Path(p) for p in argv[1:]]
    lidos = 0
    for i, pdf in enumerate(pdfs, 1):
        print(f"PROGRESSO {i}/{len(pdfs)} {pdf.name}", flush=True)
        try:
            paginas = converter(pdf)
            documento = getattr(paginas, "documento", None) or {"arquivo": pdf.name}
            (pasta / f"{pdf.stem}.json").write_text(
                json.dumps(documento, ensure_ascii=False), encoding="utf-8"
            )
            (pasta / f"{pdf.stem}.paginas.json").write_text(
                json.dumps({"arquivo": pdf.name, "paginas": [asdict(p) for p in paginas]},
                           ensure_ascii=False, indent=1),
                encoding="utf-8",
            )
        except Exception as exc:  # PDF ilegível não para o lote
            motivo = " ".join(str(exc).split()) or type(exc).__name__
            print(f"FALHA {pdf.name} {motivo}", flush=True)
            continue
        lidos += 1
        print(f"OK {pdf.name} {len(paginas)} {sum(p.ocr for p in paginas)}", flush=True)
    return 0 if lidos else 1


if __name__ == "__main__":
    # O SIG-FT lê a saída em UTF-8, qualquer que seja a página de código do Windows.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())

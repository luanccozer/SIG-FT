"""Comprime PDFs grandes para o formulário do AMP sem perder o texto (é dele que o A0/A1 tiram as TAGs).

Só as imagens são reduzidas (acima do limite viram o dpi alvo, em JPEG); o texto e o desenho vetorial ficam iguais.
No fim, confere página por página que o texto extraído é o mesmo de antes.

Uso:   python -X utf8 comprime_pdf.py "C:\\pasta\\com\\pdfs"          (comprime todos os .pdf da pasta)
       python -X utf8 comprime_pdf.py arquivo1.pdf arquivo2.pdf
       ou a janela: dois cliques em comprime_pdf_janela.pyw
Saída: ao lado de cada PDF, "{nome} - menor.pdf". O original não é alterado.
Requer: pip install pymupdf   (versão 1.26 ou mais nova)
"""
import sys
from pathlib import Path

import pymupdf

NIVEIS = {"Normal": (150, 70), "Forte": (100, 50)}  # (dpi alvo, qualidade JPEG)


class TextoMudou(Exception):
    pass


def mb(f: Path) -> float:
    return f.stat().st_size / 2**20


def comprime(origem: Path, dpi_alvo: int = 150, qualidade: int = 70) -> dict:
    """Grava "{nome} - menor.pdf" e devolve {destino, antes, depois (MB), paginas}. TextoMudou se o texto não bater."""
    origem = Path(origem)
    destino = origem.with_name(f"{origem.stem} - menor.pdf")
    doc = pymupdf.open(origem)
    antes = [p.get_text() for p in doc]
    doc.rewrite_images(dpi_threshold=dpi_alvo + 50, dpi_target=dpi_alvo, quality=qualidade)
    doc.save(destino, garbage=4, deflate=True, use_objstms=1)
    doc.close()
    with pymupdf.open(destino) as novo:
        depois = [p.get_text() for p in novo]
    if depois != antes:  # nunca entregar um PDF que perdeu texto
        destino.unlink()
        raise TextoMudou(f"{origem.name}: o texto mudou na compressão; arquivo não gerado")
    return {"destino": destino, "antes": mb(origem), "depois": mb(destino), "paginas": len(antes)}


def pdfs_de(caminhos) -> list:
    """Arquivos e pastas → lista de PDFs (sem os já comprimidos)."""
    arquivos = []
    for a in map(Path, caminhos):
        arquivos += sorted(a.glob("*.pdf")) if a.is_dir() else [a]
    return [f for f in arquivos if f.suffix.lower() == ".pdf" and not f.stem.endswith(" - menor")]


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    for f in pdfs_de(sys.argv[1:]):
        try:
            r = comprime(f)
            print(f"ok  {f.name}: {r['antes']:.1f} MB -> {r['depois']:.1f} MB  ({r['paginas']} páginas, texto igual)")
        except TextoMudou as e:
            print(f"ERRO: {e}")

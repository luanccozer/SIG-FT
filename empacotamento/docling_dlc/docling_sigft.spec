# -*- mode: python ; coding: utf-8 -*-
"""Spec do PyInstaller da DLC do Docling (`--onedir`).

Não chame o `pyinstaller` direto: o `Gerar-DLC.bat` cria o ambiente, baixa os modelos e
roda este spec. Gera `dist\\docling_sigft\\docling_sigft.exe` mais a pasta `_internal`.

Os modelos NÃO entram por aqui: o programa os procura em `modelos\\` AO LADO do executável
(`docling_sigft.py::_pasta_modelos`), e o PyInstaller 6 põe os `datas` dentro de `_internal`.
Por isso o `.bat` copia `modelos\\` para `dist\\docling_sigft\\modelos\\` depois do build.

Por que `collect_all` nos pacotes do Docling: o `pyinstaller-hooks-contrib` (2026.10) não traz
hook para `docling`, `docling_core`, `docling_ibm_models`, `docling_parse` nem `rapidocr`.
Os hooks de `torch`, `torchvision`, `transformers`, `onnxruntime`, `pypdfium2` e `rtree`
existem e rodam sozinhos. O `docling` carrega os seus modelos como plugins pelos
`entry_points` (`[docling] docling_defaults`): sem `copy_metadata` o PyInstaller não leva o
`.dist-info` e o Docling abre sem nenhum modelo registrado.
"""
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, copy_metadata

if not (Path(SPECPATH) / "modelos").is_dir():
    raise SystemExit("Falta a pasta modelos\\ ao lado deste spec. Rode o Gerar-DLC.bat.")

datas, binaries, hiddenimports = [], [], []

for pacote in ("docling", "docling_core", "docling_ibm_models", "docling_parse", "rapidocr"):
    d, b, h = collect_all(pacote)
    datas += d
    binaries += b
    hiddenimports += h

# Metadados: entry_points do Docling e as versões que `transformers`/`huggingface_hub` conferem.
for dist in ("docling", "docling-slim", "docling-core", "docling-ibm-models", "docling-parse",
             "rapidocr", "huggingface-hub", "tokenizers", "safetensors", "tqdm", "regex",
             "requests", "packaging", "filelock", "numpy", "pyyaml"):
    try:
        datas += copy_metadata(dist)
    except Exception:
        print(f"AVISO: sem metadados de {dist}; seguindo sem eles.")

a = Analysis(
    ["docling_sigft.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    # O programa só lê PDF e nunca abre janela: nada de interface gráfica.
    excludes=["tkinter", "matplotlib", "IPython", "notebook", "PyQt5", "PyQt6", "PySide2",
              "PySide6", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="docling_sigft",
    debug=False,
    strip=False,
    upx=False,  # UPX em DLL do torch costuma quebrar e dispara antivírus
    console=True,  # o SIG-FT lê o progresso pela saída padrão
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="docling_sigft",
)

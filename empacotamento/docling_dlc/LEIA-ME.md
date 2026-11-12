# DLC do Docling — pacote e sonda

Programa que o SIG-FT chama como processo para ler PDFs (texto por página, OCR onde não há
camada de texto). Fica fora do instalador do SIG-FT: o SIG-FT nunca importa `docling` nem `torch`.
Desenho: spec `docs/superpowers/specs/2026-11-11-gerar-aplicacao-lmr-design.md`, §2 e §3.1.

Arquivos desta pasta:

| Arquivo | Para quê |
|---|---|
| `docling_sigft.py` | o programa |
| `requirements.txt` | `docling==2.150.0` e `torch==2.9.1+cpu` (índice de CPU do PyTorch) |
| `docling_sigft.spec` | receita do PyInstaller `--onedir` |
| `Gerar-DLC.bat` | monta tudo |

## 1. Gerar o pacote (máquina com rede)

Precisa do **Python 3.12 de 64 bits** (lançador `py`) e acesso a PyPI, `download.pytorch.org` e
Hugging Face. No Windows, na pasta desta, duplo clique ou:

```bash
Gerar-DLC.bat
```

O `.bat` cria o ambiente `.venv-dlc` (próprio, não é o do SIG-FT), instala o `requirements.txt` e o
PyInstaller, baixa os modelos `layout`, `tableformer` e `rapidocr` para `modelos\` com
`docling-tools models download`, monta o pacote, copia `modelos\` para ao lado do `.exe`, testa
`docling_sigft.exe --versao`, faz `dist\docling_sigft.zip` e mostra os tamanhos. Para no primeiro erro.

- Atrás do Zscaler: **não** use `--trusted-host`. Se o `pip` reclamar de certificado, aponte-o para o
  certificado da empresa (`pip config set global.cert <arquivo.pem>`) ou gere em rede aberta.
- Não versione `.venv-dlc\`, `modelos\`, `dist\` e `build\`. `dist\` e `build\` já são ignorados pelo
  `.gitignore`; `.venv-dlc\` e `modelos\` ainda **não**: não dê `git add` na pasta inteira.
- Se faltar algo no pacote (`ModuleNotFoundError`, "nenhum modelo"), a correção é no
  `docling_sigft.spec`: veja a seção 4.

## 2. A sonda, sem rede, na máquina da empresa

1. Copie `docling_sigft.zip` para a máquina da empresa e extraia (ex.: `C:\DLC\`).
2. Desligue a rede (Wi-Fi e cabo) e, no PowerShell, force o modo offline:
   ```powershell
   $env:HF_HUB_OFFLINE = "1"
   ```
3. Rode com os PDFs reais da Água Pura e da SFC, anotando o tempo de cada um:
   ```powershell
   $dlc = "C:\DLC\docling_sigft\docling_sigft.exe"
   $saida = "C:\DLC\saida_agua_pura"
   foreach ($pdf in Get-ChildItem "<pasta dos PDFs da Água Pura>" -Filter *.pdf) {
       $t = Measure-Command { & $dlc $saida $pdf.FullName }
       "{0}: {1:N0} s" -f $pdf.Name, $t.TotalSeconds
   }
   ```
   Repita com `$saida = "C:\DLC\saida_sfc"` e os PDFs da SFC.
4. Cada documento gera, em `<saida>\docling\`, `<nome>.json` e `<nome>.paginas.json`. A saída padrão
   traz `PROGRESSO`, `OK <nome> <páginas> <páginas OCR>` ou `FALHA <nome> <motivo>`.
   Se aparecer tentativa de baixar modelo ou erro de rede, o pacote **não** é autossuficiente: pare e
   registre o erro.

## 3. O portão (spec §2.2)

Passa quando **as duas** condições valem:

1. Toda TAG da aplicação emitida da Água Pura com **4 ou mais caracteres** aparece em algum
   `paginas.json`, **sem TAG colada** (a TAG não pode estar grudada em letra ou número vizinho).
2. As páginas escaneadas dos **HF-01** e **HF-02** da SFC saem com texto (`"ocr": true` e `texto` não
   vazio).

Script descartável da contagem (salve fora do repositório, ex.: `contagem.py`, e rode com o Python do
SIG-FT; não grava nada). Suposição: a aplicação emitida tem a coluna `TAG LMR` (cabeçalho da spec §2.1)
e, em cada célula, uma TAG ou várias separadas por `;`, `,` ou quebra de linha. Ajuste se for diferente.

```python
"""Uso: python contagem.py <aplicacao_emitida.xlsx> <pasta_saida_agua_pura\\docling> <pasta_saida_sfc\\docling>"""
import json, re, sys
from pathlib import Path
import openpyxl

xlsx, pasta_agua, pasta_sfc = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])

# TAGs emitidas (4+ caracteres), da coluna "TAG LMR" de qualquer aba
tags = set()
for ws in openpyxl.load_workbook(xlsx, read_only=True, data_only=True):
    linhas = ws.iter_rows(values_only=True)
    col = None
    for cab in linhas:
        nomes = [str(c).strip().upper() if c is not None else "" for c in cab]
        if "TAG LMR" in nomes:
            col = nomes.index("TAG LMR")
            break
    if col is None:
        continue
    for linha in linhas:
        if col < len(linha) and linha[col]:
            for t in re.split(r"[;,\n]", str(linha[col])):
                if len(t.strip()) >= 4:
                    tags.add(t.strip())

texto = " ".join(p["texto"] for f in pasta_agua.glob("*.paginas.json")
                 for p in json.loads(f.read_text(encoding="utf-8"))["paginas"]).upper()
soltas = {t for t in tags if re.search(r"(?<![A-Z0-9])" + re.escape(t.upper()) + r"(?![A-Z0-9])", texto)}
coladas = {t for t in tags if t.upper() in texto} - soltas
ausentes = tags - soltas - coladas
print(f"TAGs 4+ caracteres: {len(tags)} | soltas: {len(soltas)} | só coladas: {len(coladas)} | ausentes: {len(ausentes)}")
for nome, grupo in (("COLADAS", coladas), ("AUSENTES", ausentes)):
    print(nome, sorted(grupo)[:50])

for f in sorted(pasta_sfc.glob("*.paginas.json")):
    if re.search(r"HF-0[12]", f.name.upper()):
        pgs = json.loads(f.read_text(encoding="utf-8"))["paginas"]
        ocr = [p for p in pgs if p["ocr"]]
        vazias = [p["n"] for p in ocr if not p["texto"].strip()]
        print(f"{f.name}: {len(pgs)} páginas, {len(ocr)} por OCR, OCR sem texto: {vazias}")
```

Se não passar: **pare**, não siga para o motor; volte ao desenho com os números abaixo.

## 4. Se o pacote não abrir

Rode o `docling_sigft.exe` num terminal para ver o erro. Causas prováveis, na ordem:

- `ModuleNotFoundError: X`: adicione `X` em `hiddenimports` no `docling_sigft.spec` (ou o pacote ao laço
  `collect_all`) e rode o `.bat` de novo (reaproveita o ambiente e os modelos).
- Erro de entry point ou "nenhum modelo": falta o metadado do pacote na lista `copy_metadata`.
- Pede modelo ou rede: a pasta `modelos\` não está ao lado do `.exe`, ou o conjunto baixado não cobre o
  OCR; confira `dist\docling_sigft\modelos\`.

## 5. Resultados (preencher)

| Campo | Valor |
|---|---|
| Data da geração / versão do Python | |
| Tamanho da pasta `dist\docling_sigft` | |
| Tamanho do `docling_sigft.zip` | |
| Máquina da sonda (CPU, RAM) | |
| Tempo por documento — Água Pura (cada PDF) | |
| Tempo por documento — SFC (cada PDF) | |
| TAGs 4+ da Água Pura: total / soltas / só coladas / ausentes | |
| HF-01: páginas / por OCR / OCR sem texto | |
| HF-02: páginas / por OCR / OCR sem texto | |
| **Portão (spec §2.2)** | passou / não passou |

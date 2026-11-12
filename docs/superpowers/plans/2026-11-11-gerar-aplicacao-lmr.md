# Gerar Aplicação LMR — plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development` (recomendada)
> ou `superpowers:executing-plans`, tarefa a tarefa. Os passos usam caixas (`- [ ]`).

**Objetivo:** um módulo do SIG-FT que leva os PDFs de um sistema e o `_STATUS_PMIB` até a Aplicação LMR
no template: Docling (DLC) → pasta de extração → agente do AMP pelo n8n → CSV → aplicação.

**Arquitetura:** serviços sem Qt (`gerar_lmr_extracao`, `gerar_lmr_amp`, e o motor em `gerar_lmr_regras`,
`gerar_lmr_motor`, `gerar_lmr_csv`, `gerar_lmr_planilha`) e uma tela de três abas. O Docling roda fora do
SIG-FT, num executável próprio (DLC). O motor é o `lmr.js` portado para Python, conferido por assinatura.

**Tecnologias:** Python 3.10+, PySide6, openpyxl, requests (já no SIG-FT); Docling + torch de CPU só na
DLC; n8n e agente do AMP.

**Spec:** `docs/superpowers/specs/2026-11-11-gerar-aplicacao-lmr-design.md` (leia antes de cada tarefa).

## Modelos por tarefa

| Modelo | Para quê | Tarefas |
|---|---|---|
| **Fable 5.2** | onde a qualidade do resultado é decidida por julgamento: o texto do agente e a análise das diferenças contra as aplicações emitidas | 12, 16 (análise) |
| **Opus 5.5** | código que tem de ser exato ou que depende de plataforma difícil: o port do motor, a DLC, o workflow do n8n, a revisão final | 2, 3, 4, 5, 11, 13, 17 |
| **Sonnet 5.5** | código com interface e teste já definidos aqui: serviços, tela, testes | 1, 6, 7, 8, 9, 10, 14 |
| **Haiku 5.5** | texto e registro mecânico: documentação, CHANGELOG | 15 |
| **Você** | o que só roda na máquina da empresa, no Box ou no AMP | partes das 3, 8, 11, 16 |

A escolha é por risco, não foi medida. Se uma tarefa do Sonnet falhar duas vezes na revisão, suba-a
para o Opus em vez de insistir.

## Restrições globais

- Repositório `luanccozer/SIG-FT`, a partir da branch `claude/checkpoint-01-refactor-executor-5lawtu`;
  branch nova `joao/gerar-aplicacao-lmr`. **Push, PR e qualquer mudança no AMP só com aprovação do usuário.**
- Código, comentários, docs e commits em português; mensagem de commit sem acento.
- Serviço nunca importa Qt; a tela não tem regra de negócio; comunicação por callbacks (`log_cb`, `progresso_cb`).
- O SIG-FT nunca importa `docling` nem `torch`. O `torch` continua nos `excludes` do `SIG-FT.spec`.
- Zonas do Luan (`SIG-FT.spec`, `.github/workflows/release.yml`, `sigft/config.py`, `sigft/app/ia_por_modulo.py`):
  commit isolado, mensagem explícita, combinado com ele antes do PR.
- Dados reais (Status, PDFs, aplicações, CSVs) nunca entram no Git nem em conversa com IA. Os testes do
  repositório usam dados fictícios.
- O envio ao AMP vai uma vez só, sem repetição automática.
- Verde antes de cada commit: `bash scripts/check.sh`. Mexeu em tela: `QT_QPA_PLATFORM=offscreen python frontend.py --smoke`.
- CSV: separador `;`, UTF-8 com BOM. Lotes: até 80.000 caracteres. Limite da TAG LMR: 150 caracteres.
- A referência do motor é o `lmr.js` do Box (`DocManager Itaipu\Docs Aconex\LMR\motor\lmr.js`), não o do GitHub.

## Foco da revisão

O que a spec implica e nenhum teste comum pega; cada linha tem o teste na tarefa indicada:

1. O agente devolve o CSV com frase antes, cerca ```` ```csv ````, separador `,` ou cabeçalho repetido a cada lote → o leitor recorta e aceita, ou recusa com motivo claro (Tarefa 6).
2. O mesmo material aparece em dois lotes e vira linha duplicada → linhas com a mesma chave são unidas (trechos somados); quantidade diferente vira aviso (Tarefa 6).
3. `TRECHOS` vazio, `TODAS` num projeto AMD, ou `60HZ` num projeto só de 50 Hz → linha bloqueada com o motivo, nunca aplicação vazia sem aviso (Tarefa 5).
4. Pasta com acento, espaço ou arquivo do Box só na nuvem passada à DLC → o processo recebe o caminho inteiro e o PDF ilegível entra como "não lido" (Tarefas 2 e 9).
5. Aplicação aberta no Excel ou caminho com mais de 259 caracteres → erro claro antes de gravar qualquer arquivo (Tarefa 7).

---

## Fase 0 — Preparação

### Tarefa 1: clone e branch — **Sonnet 5.5**

**Arquivos:** nenhum do projeto.

- [ ] Clonar em `SIG-FT\` dentro desta pasta, com `git config core.longpaths true` (o clone falha sem isso no Windows).
- [ ] `git switch -c joao/gerar-aplicacao-lmr origin/claude/checkpoint-01-refactor-executor-5lawtu`.
- [ ] Criar o venv e rodar `bash scripts/check.sh`. Esperado: verde. Vermelho antes de qualquer mudança: parar e avisar.
- [ ] Copiar a spec e este plano para `docs/superpowers/specs/` e `docs/superpowers/plans/` do clone e commitar: `Gerar Aplicacao LMR: spec e plano`.

---

## Fase 1 — Sonda da DLC (portão: se falhar, o projeto volta ao desenho)

### Tarefa 2: o programa da DLC — **Opus 5.5**

**Arquivos:**
- Criar: `empacotamento/docling_dlc/docling_sigft.py`, `empacotamento/docling_dlc/requirements.txt`
- Teste: `tests/test_docling_dlc.py`

**Interfaces — produz** (contrato de arquivos que a Tarefa 9 consome):
- Linha de comando: `docling_sigft <pasta_saida> <pdf> [<pdf> ...]`; código de saída 0 se ao menos um PDF foi lido.
- Saída padrão, uma linha por evento: `PROGRESSO <i>/<n> <nome>`, `OK <nome> <paginas> <paginas_ocr>`, `FALHA <nome> <motivo>`.
- Em `<pasta_saida>\docling\`: `<nome>.json` (exportação completa do Docling) e `<nome>.paginas.json` = `{"arquivo": str, "paginas": [{"n": int, "ocr": bool, "texto": str}]}`, com as tabelas do `texto` em Markdown.
- `VERSAO = "1"` no módulo, impressa com `--versao`.

Decisões:
- Página conta como OCR quando a camada de texto do PDF (lida pelo `pypdfium2`, que o Docling já traz) tem menos de 20 caracteres.
- A conversão fica atrás de `converter(pdf: Path) -> list[Pagina]`, injetável: os testes não instalam o Docling.
- Antes de codar, confirmar na documentação atual do Docling: a exportação em Markdown por página e a opção que aponta os modelos para uma pasta local (`artifacts_path`).
- `requirements.txt`: `docling` e o `torch` do índice de CPU do PyTorch, com versões fixadas.

- [ ] Teste `test_gera_paginas_e_progresso`: com um conversor falso que devolve 2 páginas (a 2ª com `ocr=True`), a saída padrão tem `OK doc.pdf 2 1` e o `doc.paginas.json` tem as duas páginas.
- [ ] Teste `test_pdf_que_falha_nao_para_o_lote`: conversor que levanta no 1º de 2 PDFs → `FALHA` para o 1º, `OK` para o 2º, saída 0.
- [ ] Teste `test_caminho_com_acento_e_espaco`: pasta `Água Pura\LMR EXTRAÇÃO` como saída → arquivos gravados nela.
- [ ] Rodar os testes (falham), implementar, rodar de novo (passam), commit: `DLC do Docling: programa de extracao`.

### Tarefa 3: o pacote e a sonda na máquina da empresa — **Opus 5.5 + Você**

**Arquivos:**
- Criar: `empacotamento/docling_dlc/docling_sigft.spec`, `empacotamento/docling_dlc/Gerar-DLC.bat`, `empacotamento/docling_dlc/LEIA-ME.md`

- [ ] `Gerar-DLC.bat`: cria um venv próprio, instala o `requirements.txt`, baixa os modelos para `modelos\` e roda o PyInstaller em `--onedir`, com `modelos\` dentro do pacote. O programa usa essa pasta quando ela existe ao lado do executável.
- [ ] Gerar o pacote e anotar no LEIA-ME o tamanho da pasta e do zip.
- [ ] **Você:** rodar o pacote na máquina da empresa, **sem rede**, com os PDFs da Água Pura e da SFC. Anotar o tempo por documento.
- [ ] **Portão (spec §2.2):** toda TAG da aplicação emitida da Água Pura com 4+ caracteres aparece em algum `paginas.json`, sem TAG colada; as páginas escaneadas do HF-01 e do HF-02 saem com texto. Um script descartável faz a contagem; os números vão para o LEIA-ME.
- [ ] Passou: commit `DLC do Docling: pacote e resultado da sonda`. Não passou: parar e voltar ao desenho com os números.

---

## Fase 2 — Motor e aba "Realizar a Aplicação LMR"

O motor fica em quatro arquivos pequenos, em vez de um só como na spec §7.

### Tarefa 4: regras do motor — **Opus 5.5**

**Arquivos:**
- Criar: `sigft/services/gerar_lmr_regras.py`
- Teste: `tests/test_gerar_lmr_regras.py`

**Interfaces — produz** (port das seções 1, 2, 4 e 5 do `lmr.js` do Box, mesmos resultados):

```python
@dataclass(frozen=True)
class Trecho: nome: str; m: str | None; hz: int | None; pos: int | None

UGS: tuple[Trecho, ...]; TRECHOS: tuple[Trecho, ...]; TRECHO_POR_NOME: dict[str, Trecho]
EIXOS = ("AB", "BC", "CD", "MB", "JB", "JD", "BP", "VT")   # 8, como o lmr.js do Box
LIMITE_TAG = 150

def normaliza_trecho(v) -> str | None
def normaliza_eixo(v) -> str | None
def normaliza_local(v) -> str | None
def formata_elevacao(v) -> tuple[str | None, str | None]        # (valor "98,50", aviso)
def trechos_do_projeto(opcao: str, lista: list[str] | None = None) -> list[Trecho]
def trechos_do_material(projeto: list[Trecho], hz) -> list[Trecho]   # hz: 50 | 60 | "AMBAS"
def expande_rds(modelo: str, trecho: str) -> str
def monta_codigo(campos: dict) -> str
def monta_tag(campos: dict) -> str                              # com o limite de 150 do lmr.js do Box
def hash_linha(s: str) -> int                                   # FNV-1a 32 bits sobre as unidades UTF-16
def assinatura_soma(n: int, soma: int) -> str                   # "3580-4B02203E"
```

`campos` tem as chaves do `l` do `lmr.js`: `escopo, subsistema, area, rds, pais, local, elev, eixo, trecho, tag, caso_rds, descricao, pn`; `pais` é lista de `{"tag", "rds"}`.

- [ ] Testes com estes valores:
  - `trechos_do_projeto("ÍMPARES")` → `U-01, U-03, U-05, U-07, U-09, U-10, U-12, U-14, U-16, U-18`;
  - `trechos_do_projeto("PARES")` contém `U-09A` e `U-18A`;
  - `expande_rds("#ST[XX]=M[XX]MKF10UZ001", "U-09A")` → `#ST50=M19MKF10UZ001`; com `"U-10"` → `#ST60=M10MKF10UZ001`; com `"AMD-03"` o `[XX]` fica;
  - `formata_elevacao("106,105")` → `("106,11", aviso)`; `"98.5"` → `("98,50", None)`;
  - `normaliza_local("CASA DE FORCA")` → `"CASA DE FORÇA"`; `normaliza_eixo("B-C")` → `"BC"`;
  - `monta_codigo` sem pais → `RV - HIDRÁULICA - SKID - RDS-PP: #ST50=M01MKF10UZ001 - CASA DE FORÇA - ELEV. 98,50 - EIXO BC - TRECHO U-01`;
  - `monta_codigo` com um pai `GP151` → `... - GP151 - RDS-PP: {rds}GP151 - CASA DE FORÇA - ...`, sem a área;
  - `monta_tag` nos três casos (TAG com RDS, TAG sem RDS, sem TAG), com e sem PN;
  - `monta_tag` com descrição longa → no máximo 150 caracteres, a TAG, o RDS-PP e o `(PN)` inteiros, a descrição cortada na última palavra inteira;
  - `hash_linha("a")` → `0xE40C292C`; `assinatura_soma(3, 0x1FFFFFFFF)` → `"3-FFFFFFFF"`;
  - campo vazio em `monta_codigo` aparece como `[?]`.
- [ ] Ler no `lmr.js` do Box a regra exata do corte de 150 e portar igual (o caso do conector solto no fim fica como o motor faz hoje).
- [ ] Falham, implementar, passam, commit: `Gerar Aplicacao LMR: regras do motor em Python`.

### Tarefa 5: geração e validação — **Opus 5.5**

**Arquivos:**
- Criar: `sigft/services/gerar_lmr_motor.py`
- Teste: `tests/test_gerar_lmr_motor.py`

**Interfaces — consome:** tudo da Tarefa 4. **Produz:**

```python
@dataclass
class LinhaCsv:
    n: int; ficha: str; area: str; rds: str; tag: str; tag_com_rds: bool
    pais: list[dict]; local: str; elevacao: str; eixo: str
    trechos: str            # como veio: lista, "TODAS", "50HZ" ou "60HZ"
    qtd: int | None; documento: str; pagina: str

@dataclass(frozen=True)
class Material: ficha: str; descricao: str; pn: str; granel: bool

@dataclass(frozen=True)
class Achado: linha_csv: int | None; ficha: str; trecho: str; regra: str; severidade: str; mensagem: str
    # severidade: "bloqueia" | "aviso"

@dataclass
class Resultado:
    linhas: list[tuple[str, str, str]]     # (FICHA PMIB, CÓDIGO LMR, TAG LMR), só as não bloqueadas
    achados: list[Achado]; bloqueadas: int; assinatura: str

def gerar(linhas: list[LinhaCsv], catalogo: dict[str, Material], *, escopo: str, subsistema: str,
          projeto: list[Trecho]) -> Resultado
```

Regras (as do `gera`, `geraLote` e `valida` do `lmr.js`: V1, V2, V4, V5, V6, V12, V14, V15):
- `trechos`: lista → esses nomes; `TODAS` → as UGs do `projeto`; `50HZ`/`60HZ` → `trechos_do_material(projeto, hz)`.
  Nome de trecho inválido na lista → `V14` bloqueia. O RDS-PP chega como o documento escreve: vira `[XX]` só
  quando o M e o `#ST` batem com um trecho da linha (`rds_generico`); `M00/M50/M60` ficam literais.
  Resultado vazio → achado `V15` que bloqueia: `nenhum trecho do projeto para <valor>`.
- Material `granel` → 1 linha por trecho, qualquer que seja a `qtd`. Não granel com `qtd` vazia ou < 1 → `V1` bloqueia.
- Descrição e PN vêm do `catalogo`. Ficha fora do catálogo → `V6` bloqueia.
- Ficha do catálogo sem nenhuma linha → `V12` aviso.
- TAG de pai que não é TAG de nenhum material do CSV → `V6` aviso, uma vez por TAG.
- A assinatura soma `hash_linha(f"{ficha}|{codigo}|{tag}")` de todas as linhas geradas, bloqueadas ou não, como o Workflow B.

- [ ] Testes: `TODAS` com `qtd=2` num projeto de 20 UGs → 40 linhas; `60HZ` em projeto `ÍMPARES` → 5 trechos (`U-10, U-12, U-14, U-16, U-18`); granel com `qtd=50` → 1 por trecho; `M01` com trecho `U-02` → `V4` bloqueia; `#ST60` com `M01` → `V5`; eixo `XXXX` → `V14`; elevação `98,5` é normalizada para `98,50`; local fora da lista → `V14`; os três casos do Foco 3; ficha fora do catálogo; cobertura `V12`.
- [ ] Falham, implementar, passam, commit: `Gerar Aplicacao LMR: geracao e validacao`.

### Tarefa 6: leitura e conferência do CSV — **Sonnet 5.5**

**Arquivos:**
- Criar: `sigft/services/gerar_lmr_csv.py`
- Teste: `tests/test_gerar_lmr_csv.py`

**Interfaces — consome:** `LinhaCsv`, `Achado`, `Material` (Tarefa 5). **Produz:**

```python
COLUNAS = ("FICHA_PMIB", "AREA_PAINEL", "RDS_PP", "TAG", "TAG_COM_RDS_PP", "PAIS", "LOCAL", "ELEVACAO",
           "EIXO", "TRECHOS", "QTD_POR_TRECHO", "DOCUMENTO", "PAGINA")

class CsvInvalido(ValueError): ...
def ler_csv(texto: str) -> tuple[list[LinhaCsv], list[Achado]]
def gravar_csv(caminho: Path, linhas: list[LinhaCsv]) -> None
def catalogo_do_status(caminho_xlsx: Path) -> dict[str, Material]
def conferir_com_extracao(linhas: list[LinhaCsv], pasta_docling: Path) -> list[Achado]
```

Decisões:
- `ler_csv` joga fora o que vem antes da linha do cabeçalho e as cercas ```` ``` ````; aceita `,` como separador quando o cabeçalho vier com `,`; ignora cabeçalhos repetidos. Sem cabeçalho ou com coluna faltando → `CsvInvalido` dizendo qual.
- Ficha normalizada com `normalize_pmib` (`sigft/core/excel/pmib_codes.py`).
- `PAIS`: `TAG | RDS ; TAG | RDS`.
- Linhas com a mesma chave (tudo menos `TRECHOS`, `QTD_POR_TRECHO`, `DOCUMENTO`, `PAGINA`) são unidas: trechos somados sem repetir. Quantidades diferentes → fica a primeira e sai um achado `CSV` de aviso.
- `catalogo_do_status`: cabeçalho achado com `find_header_row`; `STATUS = DUPLICADO` fica fora; `granel` pela unidade (`L, KG, M, M2, M², M3, M³, ML, G, LT`); `pn` = `CÓDIGO DO MATERIAL`.
- `conferir_com_extracao`: `TAG` e `RDS_PP` (este sem a parte `[XX]`/`Mnn`) procurados no texto do `<DOCUMENTO>.paginas.json`. Não achou → achado `EVIDENCIA` de aviso, `não encontrado no documento`. Página citada com `ocr=true` → aviso `lida por OCR`. Documento citado que não existe → aviso.

- [ ] Testes: os casos do Foco 1; a união do Foco 2; ficha com apóstrofo e espaço no fim; coluna faltando; `PAIS` com dois pais; os três avisos da conferência com um `paginas.json` fictício; Status fictício com linha `DUPLICADO` e material a granel.
- [ ] Falham, implementar, passam, commit: `Gerar Aplicacao LMR: leitura e conferencia do CSV`.

### Tarefa 7: gravação no template e serviço da aba 3 — **Sonnet 5.5**

**Arquivos:**
- Criar: `sigft/services/gerar_lmr_planilha.py`, `sigft/dados/lmr/Template_Aplicação_LMR.xlsx` (copiado da branch `AUTOMACAO_LMR`, `aplicacao-lmr/templates/`; cabeçalho `FICHA_PMIB | CÓDIGO_LMR | TAG_LMR | Status`, idêntico ao do Box; a coluna Status fica vazia)
- Modificar: `SIG-FT.spec` (o template nas `datas`; commit isolado)
- Teste: `tests/test_gerar_lmr_planilha.py`

**Interfaces — consome:** `Resultado`, `Material`, `ler_csv`, `catalogo_do_status`, `conferir_com_extracao`, `gerar`, `trechos_do_projeto`. **Produz:**

```python
@dataclass(frozen=True)
class Saida: aplicacao: Path; validacao: Path; linhas: int; bloqueadas: int; avisos: int; assinatura: str

class NaoDaParaGravar(RuntimeError): ...
def realizar_aplicacao(csv: Path, status: Path, pasta_sistema: Path, *, nome: str, escopo: str, subsistema: str,
                       opcao_trechos: str, lista_trechos: list[str] | None, log_cb) -> Saida
```

Decisões:
- Saídas em `<pasta_sistema>\LMR\SAIDA ATUAL\`: `APLICAÇÃO LMR - <nome>.xlsx` e `VALIDAÇÃO - <nome>.xlsx`.
- Aba `APLICAÇÃO - LMR`: as linhas geradas. Aba `DOCS DE REFERÊNCIA`: uma linha por ficha com `CÓDIGO PMIB`, `PART NUMBER`, `DESCRIÇÃO DO MATERIAL` e o `DOCUMENTO` da primeira linha do CSV daquela ficha. Aba `DESCRIÇÃO DOCUMENTOS`: como está no template.
- `VALIDAÇÃO`: colunas `LINHA DO CSV, FICHA_PMIB, TRECHO, REGRA, SEVERIDADE, MENSAGEM`.
- A conferência com a extração só roda se existir `<pasta_sistema>\LMR\EXTRACAO\docling\`; senão o log avisa que foi pulada.
- Antes de gravar qualquer coisa: caminho com mais de 259 caracteres → `NaoDaParaGravar` com o tamanho; arquivo de saída aberto (`PermissionError`) → `NaoDaParaGravar` pedindo para fechar o Excel.
- Log no padrão do SIG-FT: início, resumo (linhas, bloqueadas, avisos, assinatura, tempo).

- [ ] Testes: ponta a ponta com CSV e Status fictícios → as três abas com o conteúdo esperado, relidas com openpyxl; os dois casos do Foco 5 (nenhum arquivo criado); extração ausente → log de aviso e aplicação gerada.
- [ ] Falham, implementar, passam, commit: `Gerar Aplicacao LMR: gravacao no template` e, separado, `SIG-FT.spec: template da Aplicacao LMR nos dados`.

### Tarefa 8: regressão por assinatura contra o `lmr.js` — **Sonnet 5.5 + Você**

**Arquivos:**
- Criar: `tools/lmr_base_para_csv.py`, `tests/test_gerar_lmr_regressao.py`, `tests/fixtures/lmr/assinaturas.json`

- [ ] `lmr_base_para_csv.py <BASE LMR.xlsx> <saida.csv>`: converte a aba BASE do formato antigo para o CSV da Tarefa 6 (`TRECHOS` e `PAIS` já estão no mesmo formato).
- [ ] **Você, na máquina com o Box:** rodar o `lmr.js` do Box nas BASEs da Água Pura, Aeração, CCAR, Reg. Vel., SFC e Banco AUTO e gravar em `assinaturas.json`: `{sistema: {"assinatura": "...", "bloqueadas": n}}`. Só os hashes entram no Git.
- [ ] O teste lê a pasta das BASEs da variável `LMR_BASES`; sem ela, é pulado (o CI não tem os dados). Com ela, converte cada BASE, roda `gerar` e compara assinatura e bloqueadas.
- [ ] **Portão (spec §2.1):** as seis iguais. Diferença: comparar linha a linha e corrigir o port (volta à Tarefa 4 ou 5), nunca a referência.
- [ ] Commit: `Gerar Aplicacao LMR: regressao por assinatura contra o lmr.js`.

### Tarefa 9: serviço da extração — **Sonnet 5.5**

*(fica nesta fase porque a tela da Tarefa 10 já nasce com as abas 1 e 3)*

**Arquivos:**
- Criar: `sigft/services/gerar_lmr_extracao.py`
- Teste: `tests/test_gerar_lmr_extracao.py`

**Interfaces — consome:** o contrato da Tarefa 2; `catalogo_do_status`. **Produz:**

```python
TAMANHO_DO_LOTE = 80_000
PASTA_DA_DLC = Path(os.environ["LOCALAPPDATA"]) / "SIG-FT" / "docling"
VERSAO_DA_DLC = "1"

@dataclass(frozen=True)
class Extracao: pasta: Path; documentos: int; nao_lidos: list[str]; paginas: int; paginas_ocr: int; lotes: int

class ExtracaoInterrompida(RuntimeError): ...
def dlc_instalada() -> bool                                   # executável presente e `--versao` == VERSAO_DA_DLC
def extrair(pdfs: list[Path], status: Path, pasta_sistema: Path, *, log_cb, progresso_cb, parar=lambda: False,
            executar=subprocess.Popen) -> Extracao
def montar_lotes(documentos: list[dict], codigos_do_status: set[str]) -> list[str]
def montar_indice(documentos: list[dict], nao_lidos: list[tuple[str, str]]) -> str
```

Decisões:
- A DLC é chamada com a lista de argumentos (sem `shell=True`), e a saída é lida linha a linha para o `log_cb` e o `progresso_cb`.
- Grava em `<pasta_sistema>\LMR\EXTRACAO\`: `INDICE.md`, `STATUS_PMIB.csv`, `<documento>.md`, `LOTES\lote_NN.md`.
- Código, revisão e tipo do documento: do nome do arquivo (`#ST00=M00MKF10&MPB020[R1A].pdf` → código `#ST00=M00MKF10&MPB020`, revisão `R1A`, tipo `&MPB`).
- Página entra num lote se tiver TAG (`[A-Z]{1,3}\d{2,3}[A-Z]?`), RDS-PP (`#ST` ou `=M\d\d`), elevação (`EL\.?\s*\d`) ou algum código de material do Status. Cada página leva o cabeçalho `### <código do documento> · página N`. Página nunca é cortada; página maior que o lote vai sozinha.
- O resumo de localização do `INDICE.md` vem da primeira página de cada documento (o carimbo): as linhas com elevação ou eixo.
- `parar()` verdadeiro → encerra o processo da DLC e levanta `ExtracaoInterrompida`.

- [ ] Testes com `executar` falso e `paginas.json` fictícios: `Extracao` com as contagens; lotes ≤ 80.000 e sem página cortada; página sem TAG nem código fica fora; página gigante sozinha; documento `FALHA` aparece em `nao_lidos` e no índice; os argumentos passados à DLC preservam acento e espaço (Foco 4); nome de arquivo sem código → documento entra com o nome e um aviso.
- [ ] Falham, implementar, passam, commit: `Gerar Aplicacao LMR: servico da extracao`.

### Tarefa 10: a tela (abas 1 e 3) e o registro do módulo — **Sonnet 5.5**

**Arquivos:**
- Criar: `sigft/app_qt/views/gerar_aplicacao_lmr.py`
- Modificar: `sigft/app_qt/main.py` (`TELAS`, chave `"GerarLMR"`), `sigft/app_qt/catalogo.py` (`MENU` e `MODULOS`, logo depois de "Aplicação LMR"), `sigft/app/conferencia.py` (`MODULOS_ESSENCIAIS`)
- Teste: `tests/test_gerar_aplicacao_lmr_tela.py`

**Interfaces — consome:** `extrair`, `dlc_instalada`, `realizar_aplicacao`. **Produz:** `class ModuloGerarAplicacaoLMR(ModuleFrame)` com `self.abas` e as abas `"1. Extração"`, `"2. Análise no AMP"` (vazia até a Tarefa 14) e `"3. Realizar a Aplicação LMR"`.

Decisões:
- Copiar a estrutura de `views/aplicacao_lmr.py` (um console, `Abas`) e os campos de arquivo de uma tela existente; diálogos pelos wrappers de `sigft/app_qt/file_dialogs.py`, chaves `gerarlmr.pasta`, `gerarlmr.status`, `gerarlmr.csv`.
- Trabalho pesado só por `self.iniciar_tarefa(...)`.
- Aba 1: pasta do sistema, `_STATUS_PMIB`, lista dos PDFs da pasta com caixas (todos marcados), **Extrair documentos**, **Parar**. Sem a DLC, o botão de extrair fica desligado e aparece o aviso com **Instalar componente** (ligado na Tarefa 11).
- Aba 3: CSV (preenchido com `LMR\EXTRACAO\RESPOSTA_AMP.csv` se existir), nome curto, escopo, subsistema, trechos do projeto (`TODAS`, `ÍMPARES`, `PARES`, `LISTA`, `AMD`, `AMC` + campo da lista), **Gerar aplicação**, **Abrir pasta**.
- Pasta, Status, escopo, subsistema e trechos são os mesmos campos nas três abas (um estado só na tela).

- [ ] Testes (pytest-qt, offscreen): a tela monta e tem as três abas; sem DLC o botão de extrair está desligado; **Gerar aplicação** com CSV fictício chama `realizar_aplicacao` com os campos da tela (serviço dublado); os testes de registro que já existem (`TELAS`, `MENU`, `MODULOS`, essenciais) passam com o módulo novo.
- [ ] `python -m pyflakes frontend.py` e `QT_QPA_PLATFORM=offscreen python frontend.py --smoke`: sem erro.
- [ ] Commit: `Novo modulo: Gerar Aplicacao LMR -- extracao e geracao pelo CSV`.

---

## Fase 3 — Instalação da DLC

### Tarefa 11: baixar e publicar a DLC — **Opus 5.5 + Você**

**Arquivos:**
- Criar: `sigft/services/gerar_lmr_dlc.py`
- Modificar: `.github/workflows/release.yml` (job da DLC; commit isolado, combinado com o Luan), `sigft/app_qt/views/gerar_aplicacao_lmr.py` (ligar o botão)
- Teste: `tests/test_gerar_lmr_dlc.py`

**Interfaces — produz:**

```python
NOME_DO_PACOTE = "SIG-FT-Docling-{versao}.zip"
def instalar_dlc(*, log_cb, progresso_cb, baixar=None) -> Path     # baixa, confere o SHA-256, extrai em PASTA_DA_DLC
```

Decisões:
- O pacote é um asset de um release próprio, com a tag `docling-v<versao>`, para não ser baixado de novo a cada versão do SIG-FT.
- Download e conferência reaproveitam o que o `sigft/services/updater.py` já faz (token, cabeçalhos, digest SHA-256 do asset); não duplicar a lógica de rede.
- Extrai numa pasta temporária ao lado e troca no fim: instalação interrompida não deixa a DLC pela metade.
- Se o zip passar de 2 GB (limite de asset do GitHub), o job o divide em partes e `instalar_dlc` as junta. Decidir com o número da Tarefa 3.

- [ ] Testes com `baixar` falso: digest errado → erro e pasta antiga intacta; instalação por cima de uma versão antiga; interrupção no meio não deixa pasta parcial.
- [ ] **Você:** publicar o primeiro pacote (o da Tarefa 3) e instalar pela tela, na máquina da empresa.
- [ ] Commits: `Gerar Aplicacao LMR: instalacao da DLC` e, separado, `Release: job do pacote da DLC do Docling`.

---

## Fase 4 — AMP

### Tarefa 12: o agente — **Fable 5.2**

**Arquivos:**
- Criar: `amp/aplicacao_lmr/agente.md`, `amp/aplicacao_lmr/kb/regras_lmr.md`

Conteúdo: nome (`Spare Parts LMR Extractor`), descrição, goal, tom `professional`, modelo `bedrock-claude-sonnet-5.5`, system prompt e a Knowledge base. Parte de `aplicacao-lmr/motor/agente/regras_lmr.md` e `system_prompt.md` da branch `AUTOMACAO_LMR`, reescritos para a saída em CSV.

O system prompt tem de fixar:
- a saída é só o CSV com o cabeçalho da Tarefa 6, separador `;`, sem texto antes ou depois;
- uma linha por material numa posição; a ficha é copiada do catálogo recebido; material que não está no catálogo não entra;
- quantidade instalada, nunca a de reposição da lista de sobressalentes;
- valor que não está escrito no texto recebido fica vazio; nada de busca na internet, nada de dedução de local;
- `TRECHOS`: `TODAS`, `50HZ`, `60HZ` ou a lista; frequência pela ordem documento → RDS-PP → descrição do Status;
- `PAIS` só com evidência no texto; `TAG_COM_RDS_PP = SIM` só para TAG de equipamento;
- `DOCUMENTO` e `PAGINA` em toda linha, tirados do cabeçalho `### <código> · página N` do lote;
- dois exemplos fictícios: um completo e um com campo vazio.

- [ ] Escrever, conferir cada regra contra a spec §4.2 e o PLANO §3.2/§3.5/§3.7 da branch `AUTOMACAO_LMR`, commit: `AMP Aplicacao LMR: agente e regras`.

### Tarefa 13: o workflow do n8n — **Opus 5.5**

**Arquivos:**
- Criar: `amp/aplicacao_lmr/gerar_workflow.py`, `amp/aplicacao_lmr/workflow_aplicacao_lmr.json` (gerado)
- Teste: `tests/test_amp_workflow_aplicacao_lmr.py`

Decisões:
- Molde: `amp/revisao_de_listas/gerar_workflow.py` (webhook com Header Auth `X-SIGFT-Chave`, ramo do ping, nó `AMP Agent`, nó de resposta). Webhook: `sigft-aplicacao-lmr`. `VERSAO_WORKFLOW = "2026-11-11"`.
- Fluxo **linear** (o Merge do n8n do AMP trava com ramo vazio): Webhook → É ping? → Chegaram os arquivos? (conta `lote_NN` contra o campo `lotes`; faltou → HTTP 400, etapa `arquivos`) → Extract from File (texto) dos lotes → Loop Over Items, um lote por volta → Monta a mensagem (`chatInput` = índice + catálogo + lote) → AMP Agent (Session ID novo a cada volta; erro → espera 60 s, até 3 tentativas) → Junta o CSV → Responde.
- Resposta: `{"ok": true, "modo": "aplicacao_lmr", "csv": str, "lotes_recebidos": int, "lotes_com_erro": [int], "execucao": str, "versao_workflow": str}`.
- O nó que junta só guarda o texto de cada lote (um item por lote): o Code do AMP trava com milhares de itens.

- [ ] Testes: o `.json` no disco é igual ao que o gerador produz; ids dos nós sem repetição; o caminho do webhook; o ramo do ping não passa pelo agente; simulação em Python do nó que junta: 3 respostas de lote, uma com erro → `csv` com um cabeçalho só e `lotes_com_erro == [2]`.
- [ ] Commit: `AMP Aplicacao LMR: workflow do n8n`.

### Tarefa 14: serviço do envio e aba 2 — **Sonnet 5.5**

**Arquivos:**
- Criar: `sigft/services/gerar_lmr_amp.py`
- Modificar: `sigft/app/ia_por_modulo.py` (tarefa `aplicacao_lmr`: `AMP_APLICACAO_LMR_URL`, `AMP_APLICACAO_LMR_CHAVE`; `TAREFAS_DA_TELA["ModuloGerarAplicacaoLMR"]`; commit isolado), `sigft/app_qt/views/gerar_aplicacao_lmr.py`
- Teste: `tests/test_gerar_lmr_amp.py`

**Interfaces — consome:** `ClienteAmp.ping/enviar` (`sigft/core/amp/cliente.py`, sem mudança), `ler_csv`. **Produz:**

```python
@dataclass(frozen=True)
class RespostaLmr: ok: bool; csv: Path | None; linhas: int; lotes_com_erro: list[int]; execucao: str; erro: str

def enviar_ao_amp(pasta_sistema: Path, cliente, *, escopo: str, subsistema: str, trechos: str, log_cb) -> RespostaLmr
def testar_conexao(cliente) -> list[str]
```

Decisões:
- Manda os campos e os arquivos da spec §4.1. Grava `LMR\EXTRACAO\RESPOSTA_AMP.csv`; se já existir, o antigo vira `RESPOSTA_AMP (anterior).csv`.
- `lotes_recebidos` diferente do enviado → `ok=False`, nada gravado. `lotes_com_erro` não vazio → grava o CSV parcial e avisa quais lotes faltaram.
- O `csv` da resposta passa por `ler_csv` antes de gravar: `CsvInvalido` → `ok=False`, e a resposta crua vai para o diagnóstico em `Documentos\SIG-FT\logs\amp\`, sem a chave.
- Linha de espera no console a cada 30 s, como na Revisão no AMP (reaproveitar `_com_batimento` se der para importar; senão, copiar o comportamento).
- Aba 2: escopo, subsistema, trechos, **Configurar IA** (`instalar_configurar_ia`), **Testar conexão com o AMP**, **Enviar ao AMP**. Sem pasta de extração, o envio fica desligado com o motivo.

- [ ] Testes com cliente falso: os campos e os nomes dos arquivos enviados; CSV gravado e o anterior preservado; contagem de lotes errada; lote com erro (parcial + aviso); resposta sem CSV válido; a chave nunca aparece em log nem diagnóstico.
- [ ] Smoke da tela e commit: `Gerar Aplicacao LMR: envio ao AMP e aba de analise`; separado: `IA por modulo: tarefa aplicacao_lmr`.

### Tarefa 15: documentação — **Haiku 5.5**

**Arquivos:**
- Criar: `amp/aplicacao_lmr/LEIA-ME.md`, `docs/base-conhecimento/17-gerar-aplicacao-lmr.md`
- Modificar: `docs/README.md` (tabela), `CHANGELOG.md` (bloco `## 1.4.1`), os textos do "Como funciona" (`GerarLMR.extracao`, `GerarLMR.amp`, `GerarLMR.aplicacao`), `CLAUDE.md` (uma linha no mural)

- [ ] LEIA-ME no molde de `amp/revisao_de_listas/LEIA-ME.md`: criar o agente, importar o workflow, credencial, Timeout no máximo, publicar, Production URL, testar pelo PowerShell com `curl.exe`, resgatar o CSV de uma execução que não voltou, tabela "Se der errado".
- [ ] Doc da base de conhecimento: o que cada aba lê e grava, o formato do CSV, as regras de validação, a DLC.
- [ ] `bash scripts/check.sh` (a conferência do CHANGELOG roda nele) e commit: `Gerar Aplicacao LMR: documentacao`.

### Tarefa 16: teste ponta a ponta no AMP — **Você + Fable 5.2**

- [ ] **Você:** criar o agente e o workflow no AMP pelo LEIA-ME (precisa da sua aprovação: é mudança no AMP).
- [ ] **Você:** rodar a Água Pura pelas três abas; depois a SFC. Guardar o CSV, a aplicação, a VALIDAÇÃO e o tempo.
- [ ] **Fable 5.2:** comparar cada aplicação com a emitida, ficha a ficha, e classificar toda diferença: erro de extração, erro do agente, erro da emitida ou decisão de engenharia (spec §2.3). Os dados reais ficam na máquina; para a conversa vão só contagens e exemplos anonimizados.
- [ ] Erro de extração → corrigir a Tarefa 2 ou 9. Erro do agente → ajustar o `agente.md` no AMP e depois a cópia, em commit que diga o porquê. Registrar o resultado em `docs/revisoes/2026-11-gerar-aplicacao-lmr.md`.

### Tarefa 17: revisão final da branch — **Opus 5.5**

- [ ] Revisar a branch inteira contra a spec e o Foco da revisão; `bash scripts/check.sh`; abrir o app de verdade e passar pelas três abas.
- [ ] Com a sua aprovação: push e PR para a branch oficial, com a lista do que é zona do Luan.

---

## Cobertura da spec

| Spec | Tarefa |
|---|---|
| §2.1 motor igual ao `lmr.js` | 4, 5, 8 |
| §2.2 extração | 2, 3 |
| §2.3 ponta a ponta | 16 |
| §2.4 base sem torch | restrição global; 17 |
| §3.1 DLC | 2, 3, 11 |
| §3.2–3.3 extração e pasta | 2, 9 |
| §4.1 webhook | 13, 14 |
| §4.2 CSV | 6, 12 |
| §5 aplicação | 5, 6, 7 |
| §6 tela | 10, 14 |
| §8 erros | 6, 7, 9, 14 |
| §9 testes | em cada tarefa |

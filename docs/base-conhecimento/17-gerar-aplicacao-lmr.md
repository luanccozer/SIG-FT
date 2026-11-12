# Gerar Aplicação LMR: do PDF à planilha da Aplicação LMR

Módulo 7.1 do menu (Dados Técnicos & Upload), logo depois da "7. Aplicação LMR", desde a 1.4.1.
Leva os PDFs de um sistema e o `_STATUS_PMIB` até a planilha da Aplicação LMR, em três abas e com um
console só. Ele **não** sobe nada ao portal: a planilha pronta é entregue à equipe, como antes.

Desenho: `docs/superpowers/specs/2026-11-11-gerar-aplicacao-lmr-design.md`. Plano e relatórios de cada
tarefa: `docs/superpowers/plans/2026-11-11-gerar-aplicacao-lmr.md` e `.superpowers/sdd/tarefa-*-relatorio.md`.

> **Estado: nada disto foi provado numa rodada real.** O que passou foi o código e os testes com dados
> fictícios. Ainda **não testado**: o pacote da DLC (nunca foi gerado), o workflow do n8n (nunca rodou
> no AMP), o agente (nunca rodou), e a regressão por assinatura contra o `lmr.js` (o arquivo de
> referências está vazio). A Tarefa 16 do plano é o primeiro teste ponta a ponta.

| Onde | O quê |
|---|---|
| `sigft/services/gerar_lmr_extracao.py` | chama a DLC, monta `INDICE.md`, `STATUS_PMIB.csv`, os `.md` e os lotes (sem Qt) |
| `sigft/services/gerar_lmr_amp.py` | manda a extração ao AMP e grava `RESPOSTA_AMP.csv` |
| `sigft/services/gerar_lmr_csv.py` | lê e grava o CSV, lê o catálogo do Status, confere o CSV com a extração |
| `sigft/services/gerar_lmr_regras.py` | as regras e as listas do projeto, portadas do `lmr.js` do Box (trechos, RDS-PP, CÓDIGO LMR, TAG LMR, corte de 150) |
| `sigft/services/gerar_lmr_motor.py` | `gerar`: expande cada linha do CSV, valida e dá a assinatura |
| `sigft/services/gerar_lmr_planilha.py` | grava a Aplicação e a Validação no template |
| `sigft/services/gerar_lmr_dlc.py` | baixa e instala a DLC |
| `sigft/dados/lmr/Template_Aplicação_LMR.xlsx` | o template (cópia do da branch `AUTOMACAO_LMR`) |
| `sigft/app_qt/views/gerar_aplicacao_lmr.py` | `ModuloGerarAplicacaoLMR`: a tela, sem regra de negócio |
| `sigft/app/como_funciona.py` | `GerarLMR.extracao`, `GerarLMR.analise` e `GerarLMR.aplicacao` |
| `empacotamento/docling_dlc/` | o programa da DLC e o pacote |
| `amp/aplicacao_lmr/` | o agente, a base de regras, o workflow e o LEIA-ME do AMP |
| `tools/lmr_base_para_csv.py` | converte uma BASE do motor antigo em CSV (para a regressão) |

O SIG-FT nunca importa `docling` nem `torch`.

## A tela

Em cima das abas ficam os campos que valem para as três: a **pasta do sistema**, o **`_STATUS_PMIB`**,
o **escopo**, o **subsistema** e os **trechos do projeto** (`TODAS`, `ÍMPARES`, `PARES`, `LISTA`, `AMD`,
`AMC`, mais o campo da lista). Ao escolher a pasta, a tela lista os PDFs dela (só o nível da pasta, todos
marcados), sugere o nome curto (o nome da pasta), acha o `_STATUS_PMIB*.xlsx` se houver e, se existir
`LMR\EXTRACAO\RESPOSTA_AMP.csv`, já o põe na aba 3. O botão **Configurar IA** no alto guarda o endereço
e a chave do workflow (tarefa `aplicacao_lmr`, os nomes `AMP_APLICACAO_LMR_URL` e
`AMP_APLICACAO_LMR_CHAVE` no `api_config.json`).

Erro esperado do serviço (CSV inválido, caminho longo, arquivo aberto, trecho inválido, extração
interrompida, falha da instalação) vira uma linha `❌` no console, sem traceback.

## Aba 1: Extração

- Lê: os PDFs marcados e o `_STATUS_PMIB`.
- Grava, em `<pasta do sistema>\LMR\EXTRACAO\`:

| Arquivo | O quê |
|---|---|
| `INDICE.md` | os documentos (código, revisão, tipo, páginas, páginas por OCR), os não lidos com o motivo, e o resumo de localização (linhas com elevação ou eixo da 1ª página de cada documento) |
| `STATUS_PMIB.csv` | `FICHA, DESCRICAO, CODIGO_DO_MATERIAL` do Status, sem a linha `STATUS = DUPLICADO` (UTF-8 com BOM) |
| `<documento>.md` | um por PDF, com `## Página N` |
| `LOTES\lote_NN.md` | as páginas que interessam, em blocos de até 80.000 caracteres |
| `docling\<documento>.json` e `.paginas.json` | a saída da DLC, que a aba 3 usa para conferir TAG e RDS-PP |

- Código, revisão e tipo do documento vêm do nome do arquivo: `#ST00=M00MKF10&MPB020[R1A].pdf` é o
  código `#ST00=M00MKF10&MPB020`, a revisão `R1A` e o tipo `&MPB`. Nome sem `&` e três letras entra com
  o nome do arquivo e um aviso.
- Uma página entra num lote se tiver TAG (`[A-Z]{1,3}\d{2,3}[A-Z]?`), RDS-PP (`#ST` ou `=M` e dois
  dígitos), elevação (`EL` e um número) ou algum código de material do Status. A página nunca é cortada;
  a que é maior que o lote vai sozinha. Cada página leva o cabeçalho `### <código> · página N`.
- O filtro de TAG é largo de propósito: páginas com "NBR 10" ou parecidos também entram.
- A DLC é chamada com a lista de argumentos (sem shell). Se a lista de PDFs passa de 30.000 caracteres,
  `extrair` divide em várias chamadas (o limite do Windows é 32.767); o progresso segue contínuo.
- O botão **Parar** encerra a DLC (`ExtracaoInterrompida`). PDF que falha entra em "não lidos" e o lote
  segue. O botão **Extrair documentos** só liga se a DLC está instalada (a checagem roda numa tarefa).

### A DLC

Programa à parte (`empacotamento/docling_dlc/docling_sigft.py`), que roda o Docling. Linha de comando:
`docling_sigft <pasta_saida> <pdf> [<pdf> ...]`. Imprime, em UTF-8, `PROGRESSO i/n nome`,
`OK nome paginas paginas_ocr` e `FALHA nome motivo`, e grava os dois arquivos por PDF em
`<pasta_saida>\docling\`. A página conta como OCR quando a camada de texto tem menos de 20 caracteres.
`docling_sigft --versao` imprime `1`, e o SIG-FT só aceita a DLC se a versão for a de `VERSAO_DA_DLC`.

- Fica em `%LOCALAPPDATA%\SIG-FT\docling`, fora do instalador.
- **Gerar o pacote:** `empacotamento\docling_dlc\Gerar-DLC.bat` (Python 3.12 de 64 bits, rede; leva de
  10 a 40 minutos e vários GB). O passo a passo da sonda (sem rede, com a contagem de TAGs) está no
  `LEIA-ME.md` da pasta. **Ainda não foi gerado nem sondado.**
- **Publicar:** a tag `docling-v<n>` dispara o job `dlc` do `release.yml`, que monta o zip
  `SIG-FT-Docling-<n>.zip` num pré-lançamento. O job nunca rodou.
- **Instalar:** o botão **Instalar componente** chama `instalar_dlc`: baixa o zip do pré-lançamento,
  exige o hash SHA-256, extrai ao lado, troca a pasta e refaz a checagem. Zip de 2 GiB ou mais não é
  tratado. O download real nunca foi exercitado.

## Aba 2: Análise no AMP

- Lê: `INDICE.md`, `STATUS_PMIB.csv` e os `lote_NN.md` da extração. Sem eles, o envio fica desligado,
  com o motivo ao lado do botão.
- **Testar conexão com o AMP** faz só o `ping` (rede, chave e workflow publicado; não chama o agente).
- **Enviar ao AMP** (`enviar_ao_amp`): um POST multipart, uma vez só, sem repetição, com os campos
  `modo=aplicacao_lmr`, `escopo`, `subsistema`, `trechos` (a opção, ou a lista separada por `;`) e `lotes`,
  e os arquivos `indice`, `status_pmib`, `lote_01`...`lote_NN`. A linha de espera sai a cada 30 s.
- Grava `RESPOSTA_AMP.csv` em UTF-8 com BOM; o anterior vira `RESPOSTA_AMP (anterior).csv`.
  - `lotes_recebidos` diferente do enviado: erro, nada gravado.
  - `lotes_com_erro` não vazio: grava o CSV parcial e avisa quais lotes faltaram.
  - O `csv` passa por `ler_csv` antes de gravar. Se for inválido, o erro aparece e o corpo da resposta vai
    para `Documentos\SIG-FT\logs\amp\<data> aplicacao_lmr.txt`.
- A chave fica só no `ClienteAmp` (cabeçalho `X-SIGFT-Chave`): nunca vai para log nem diagnóstico.
- Depois do envio, a aba 3 já sai com o CSV escolhido.
- O lado do AMP está em `amp/aplicacao_lmr/LEIA-ME.md`. **Ainda não testado.**

## O CSV (`RESPOSTA_AMP.csv`)

Separador `;`, UTF-8 com BOM, uma linha por material numa posição. O cabeçalho é `COLUNAS` de
`gerar_lmr_csv.py` e o mesmo do `agente.md`.

| Coluna | Regra |
|---|---|
| `FICHA_PMIB` | copiada do `STATUS_PMIB.csv` (normalizada: sem apóstrofo, 4 casas) |
| `AREA_PAINEL` | área, painel ou equipamento |
| `RDS_PP` | do sistema; para UG, na forma `#ST[XX]=M[XX]...` |
| `TAG` | vazia se o material não tem |
| `TAG_COM_RDS_PP` | `SIM` ou `NÃO` |
| `PAIS` | vazio, ou `TAG \| RDS-PP` de cada pai, separados por ` ; ` |
| `LOCAL`, `ELEVACAO`, `EIXO` | de listas fechadas do motor; vazios se o documento não diz |
| `TRECHOS` | lista (com `;`, entre aspas), ou `TODAS`, `50HZ`, `60HZ` |
| `QTD_POR_TRECHO` | quantidade instalada, nunca a de reposição |
| `DOCUMENTO`, `PAGINA` | de onde saiu a linha |

`ler_csv` aceita frase antes do cabeçalho, cerca de código, separador `,` e cabeçalho repetido. Sem
cabeçalho ou com coluna faltando, levanta `CsvInvalido` dizendo qual. Linha com colunas a menos ou sem
ficha é descartada com aviso. Linhas com a mesma chave (tudo menos trechos, quantidade, documento e
página) são unidas, com os trechos somados; quantidade diferente fica com a primeira e avisa.

## Aba 3: Realizar a Aplicação LMR

- Lê: o CSV, o `_STATUS_PMIB` e, se existir `LMR\EXTRACAO\docling\`, os `.paginas.json`.
- Campos: CSV, nome curto, e os comuns (escopo, subsistema, trechos).
- Grava, em `<pasta do sistema>\LMR\SAIDA ATUAL\`:
  - `APLICAÇÃO LMR - <nome>.xlsx`, no template: a aba `APLICAÇÃO - LMR` (as linhas geradas, com o
    cabeçalho do template: `FICHA_PMIB`, `CÓDIGO_LMR`, `TAG_LMR`), a `DOCS DE REFERÊNCIA` (uma linha por
    ficha com CÓDIGO PMIB, PART NUMBER, DESCRIÇÃO DO MATERIAL e o documento da primeira linha do CSV;
    o nome do sistema em C2 e o subsistema em C4) e a `DESCRIÇÃO DOCUMENTOS`, como está no template;
  - `VALIDAÇÃO - <nome>.xlsx`: `LINHA DO CSV, FICHA_PMIB, TRECHO, REGRA, SEVERIDADE, MENSAGEM`.
- O catálogo vem do Status: o `CÓDIGO PMIB` é a ficha; o `CÓDIGO DO MATERIAL`, o PART NUMBER; a unidade
  `L`, `KG`, `M`, `M2`, `M3`, `ML`, `G` ou `LT` marca o material como **a granel** (uma linha por trecho,
  qualquer que seja a quantidade). Linha `STATUS = DUPLICADO` fica fora. O nome da coluna de unidade não
  está documentado: o código aceita `UNIDADE`, `UNID.`, `UNID`, `UND` e `UN`. Com um Status real, vale
  conferir.

### O motor e as regras de validação

`gerar` expande cada linha do CSV pelos trechos do projeto, monta o CÓDIGO LMR e a TAG LMR (a TAG é
cortada em 150 caracteres, encurtando só a descrição) e valida. Uma linha bloqueada não entra na
aplicação e fica só na Validação.

| Regra | Quando |
|---|---|
| V1 | quantidade vazia ou menor que 1 (menos a granel); campo obrigatório vazio |
| V2 | sobrou `[XX]` depois de expandir |
| V4 | o M do RDS-PP não bate com o trecho |
| V5 | o `#ST` do RDS-PP não bate com a frequência da UG |
| V6 | ficha fora do catálogo (bloqueia); TAG de pai que não é TAG de nenhum material (aviso) |
| V12 | ficha do Status sem nenhuma linha na aplicação (aviso) |
| V14 | eixo, local, elevação ou trecho fora da lista |
| V15 | nenhum trecho do projeto para a linha (por exemplo `TODAS` num projeto AMD) |
| AVISO | elevação arredondada para duas casas |
| EVIDENCIA | TAG ou RDS-PP não achado no texto do documento citado, página lida por OCR, documento que não existe na extração (avisos) |
| CSV | linha descartada, quantidade ilegível ou diferente na união (avisos) |

A assinatura (`N-HHHHHHHH`) é a soma dos hashes de `FICHA|CÓDIGO|TAG` de todas as linhas geradas,
bloqueadas ou não, igual à do `lmr.js` do Box. A conferência com a extração só roda se a pasta
`LMR\EXTRACAO\docling\` existe; senão o console avisa que foi pulada. O `DOCUMENTO` do CSV é o código sem
a revisão, e o arquivo da DLC leva a revisão: a conferência casa pelos dois.

### Antes de gravar

- Caminho com mais de 259 caracteres: erro com o tamanho, sem gravar nada.
- Saída aberta no Excel: erro pedindo para fechar, sem gravar nada. A gravação passa por
  `salvar_perguntando`, que pergunta se quer tentar de novo.
- A pasta `LMR\SAIDA ATUAL` só é criada depois dessas conferências.
- A gravação das duas planilhas não é atômica: se a segunda falhar, a primeira fica.

## O que ainda não foi testado

- O pacote da DLC e a sonda de OCR nos PDFs reais (portão da §2.2 da spec).
- O job `dlc` do release e o download real do pacote.
- O workflow no n8n (as 11 suposições estão no LEIA-ME do AMP) e o agente.
- A regressão por assinatura contra o `lmr.js`: `tests/test_gerar_lmr_regressao.py` precisa de
  `LMR_BASES` e de `tests/fixtures/lmr/assinaturas.json` preenchido; hoje está vazio e o teste é pulado.
- A abertura das planilhas geradas no Excel (o `openpyxl` regrava o template e pode perder o que não conhece).
- A tela numa janela de verdade, com dados reais.

## Testes

`tests/test_gerar_lmr_*.py`, `tests/test_docling_dlc.py`, `tests/test_gerar_aplicacao_lmr_tela.py` e
`tests/test_amp_workflow_aplicacao_lmr.py`. A suíte do projeto também guarda o módulo em
`test_excel_travado_pergunta.py` (nada grava Excel sem `salvar_perguntando`), `test_qt_tela_1366.py` (a
tela cabe em 1366x768), `test_como_funciona.py` e `test_textos_da_interface.py` (textos e traduções).

## Fronteiras

Mexem em arquivos compartilhados: `SIG-FT.spec` (o template nos dados), `sigft/app/ia_por_modulo.py` (a
tarefa `aplicacao_lmr`) e `.github/workflows/release.yml` (o job da DLC). Cada uma foi em commit isolado.

---

O que falta para concluir o módulo (pendências, decisões em aberto e armadilhas): [`docs/GERAR_APLICACAO_LMR.md`](../GERAR_APLICACAO_LMR.md).

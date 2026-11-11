# Módulo "Gerar Aplicação LMR" no SIG-FT — desenho

Data: 11/11/2026 · Situação: **aguardando revisão do usuário**

## 1. Objetivo

Um módulo novo do SIG-FT que gera a Aplicação LMR de um sistema a partir do `_STATUS_PMIB` e dos PDFs
do sistema:

```
PDFs + _STATUS_PMIB
   │ 1. Extração (Docling, na máquina do usuário)
   ▼
pasta LMR\EXTRACAO\ (texto por página, tabelas, lotes)
   │ 2. Análise no AMP (webhook do n8n → agente do AMP)
   ▼
RESPOSTA_AMP.csv (uma linha por material numa posição)
   │ 3. Realizar a Aplicação LMR (só código, no SIG-FT)
   ▼
APLICAÇÃO LMR - <sistema>.xlsx (template) + VALIDAÇÃO - <sistema>.xlsx
```

**Decisões do usuário (11/11/2026):**
- Os agentes do AMP fazem a extração inteira, não só as lacunas (muda a decisão 36).
- O CSV gera a aplicação direto. Não existe mais o arquivo `BASE LMR.xlsx`.
- As regras e o código podem ser remodelados; o que não muda é o template da aplicação.
- O Docling e o `torch` são uma DLC: só quem usa este módulo instala.

**Fora do escopo:** o Upload e a Exclusão no portal (seção "Aplicação LMR" de hoje, sem mudança); o
Workflow C (alterações); os leitores sem IA de `_AUTOMACAO_LMR`; mexer nos workflows do AMP já
publicados.

## 2. Critério de aceite

1. **Motor em Python igual ao `lmr.js`.** Com as BASEs dos sistemas já emitidos convertidas para o CSV
   do §4, o motor em Python gera as mesmas linhas que o `lmr.js` (mesma assinatura: nº de linhas +
   soma dos hashes FNV-1a). Sistemas: Água Pura, Aeração, CCAR, Reg. Vel., SFC e Banco de Baterias.
   A referência é o `lmr.js` do Box (`DocManager Itaipu\Docs Aconex\LMR\motor`), que é mais novo que o
   do GitHub: tem o limite de 150 caracteres na TAG LMR e o cabeçalho `FICHA PMIB | CÓDIGO LMR | TAG LMR`.
2. **Extração.** Na Água Pura, toda TAG da aplicação emitida com 4 ou mais caracteres aparece no texto
   extraído, sem TAGs coladas. Na SFC, as páginas escaneadas dos HF-01/HF-02 saem com texto (OCR).
3. **Ponta a ponta.** Água Pura e SFC rodam do PDF à aplicação pelo módulo. O resultado é comparado
   ficha a ficha com a emitida, e toda diferença fica classificada: erro de extração, erro do agente,
   erro da emitida ou decisão de engenharia. Não há meta de 100%: a medida do agente só existe no AMP.
4. O SIG-FT base continua sem `torch`: o instalador não cresce, e `scripts/check.sh` fica verde.

## 3. Estágio 1 — Extração (Docling)

### 3.1 A DLC

- Pacote fechado (Docling + `torch` de CPU + OCR + modelos), montado no workflow de release e publicado
  nos Releases do GitHub, com versão própria. O usuário do instalador não tem Python, então não é `pip`.
- Os modelos vão dentro do pacote: a máquina do usuário não precisa alcançar o site dos modelos.
- A tela oferece **Instalar componente** quando a DLC falta ou está desatualizada. Destino:
  `%LOCALAPPDATA%\SIG-FT\docling`, fora da pasta do programa.
- O SIG-FT chama a DLC como processo separado: `docling_sigft.exe <pasta de entrada> <pasta de saída>`.
  Ela escreve uma linha de progresso por documento na saída padrão, que a tela mostra no console.
  O SIG-FT nunca importa `docling` nem `torch`.
- O `SIG-FT.spec` não muda (o `torch` continua nos `excludes`).

### 3.2 O que a extração faz por PDF

- Texto página por página, na ordem de leitura; tabelas como tabela.
- OCR só nas páginas sem camada de texto, marcadas como `OCR`.
- Código do documento, revisão e tipo (`&MPB`, `&MFB`, `&MLU`…) pelo nome do arquivo e pelo carimbo;
  o nome do arquivo prevalece.
- PDF que falha não para o lote: entra no `INDICE.md` como "não lido" com o motivo.

### 3.3 A pasta `LMR\EXTRACAO\`

| Arquivo | Conteúdo | Vai ao AMP |
|---|---|---|
| `INDICE.md` | documentos: código, revisão, tipo, páginas, páginas por OCR, não lidos; e o resumo de localização dos carimbos (área, elevação, eixo por documento) | sim, em toda chamada ao agente |
| `STATUS_PMIB.csv` | catálogo lido por código: ficha, item, seção, descrição, código do material, marca/modelo. `STATUS = DUPLICADO` fica fora | sim, em toda chamada |
| `<documento>.md` | um por PDF, com `## Página N` e tabelas em Markdown | não (vai pelos lotes) |
| `LOTES\lote_NN.md` | os textos divididos em blocos de até 80 mil caracteres, sem cortar página; só páginas com TAG, RDS-PP, elevação ou código de material do Status | sim |
| `docling\<documento>.json` | saída completa do Docling | não; serve à conferência do §5.1 |

O Status é lido com as funções que o SIG-FT já tem (`core/excel`: cabeçalho dinâmico, código PMIB
normalizado).

## 4. Estágio 2 — Análise no AMP

### 4.1 Contrato do webhook

Segue o padrão de `amp/revisao_de_listas` e usa o `sigft/core/amp/cliente.py` sem mudança:

- `ping` antes; depois **um** POST multipart, sem repetição: campos `modo=aplicacao_lmr`, `escopo`,
  `subsistema`, `trechos`, `lotes` (quantos são); arquivos `indice`, `status_pmib`, `lote_01`…`lote_NN`.
- O workflow confere que todos os arquivos chegaram, percorre os lotes um a um (Loop Over Items),
  monta o `chatInput` com as regras de formato, o índice, o catálogo e o texto do lote, chama o agente
  e junta as linhas.
- Resposta: `{"ok": true, "csv": "...", "lotes_recebidos": N, "lotes_com_erro": [...], "execucao": ...}`.
  Lote que falha depois de 3 tentativas entra em `lotes_com_erro`; o SIG-FT avisa e grava o CSV parcial.
- Uma chamada por sistema = uma execução do n8n.

Arquivos novos no repositório, em `amp/aplicacao_lmr/`: `agente.md` (cópia do agente), `gerar_workflow.py`,
`workflow_aplicacao_lmr.json` (gerado) e `LEIA-ME.md`. As regras de domínio ficam no system prompt e na
Knowledge base do agente, partindo de `motor/agente/regras_lmr.md` da branch `AUTOMACAO_LMR`.

### 4.2 O CSV (`RESPOSTA_AMP.csv`)

Separador `;`, UTF-8 com BOM, uma linha por material numa posição:

| Coluna | Regra |
|---|---|
| `FICHA_PMIB` | copiada do `STATUS_PMIB.csv` |
| `AREA_PAINEL` | área, painel ou equipamento |
| `RDS_PP` | do sistema; típico de UG na forma `#ST[XX]=M[XX]…` |
| `TAG` | vazia se o material não tem |
| `TAG_COM_RDS_PP` | `SIM` / `NÃO` |
| `PAIS` | vazio, ou `TAG \| RDS-PP` de cada equipamento pai, separados por ` ; ` (o formato da aba BASE do motor) |
| `LOCAL` | lista fechada do motor |
| `ELEVACAO` | vírgula decimal, 2 casas |
| `EIXO` | lista fechada do motor |
| `TRECHOS` | lista com `;` dentro de aspas, ou `TODAS` / `50HZ` / `60HZ` |
| `QTD_POR_TRECHO` | quantidade instalada, nunca a de reposição |
| `DOCUMENTO`, `PAGINA` | evidência de onde saiu a linha |

Descrição e PART NUMBER não entram: o código copia os dois do Status. Campo que o agente não achou
fica vazio; ele não inventa valor.

## 5. Estágio 3 — Realizar a Aplicação LMR

Só código, em Python, dentro do SIG-FT. Entradas: o CSV, o `_STATUS_PMIB`, e escopo, subsistema e
trechos do projeto da tela.

### 5.1 Conferência do CSV

- Colunas e formatos; ficha existe no catálogo; toda ficha válida do Status tem linha (senão, aviso).
- Toda `TAG` e todo `RDS_PP` aparecem no texto extraído do `DOCUMENTO` citado (`docling\*.json`).
  O que não aparece é marcado "não encontrado no documento" na VALIDAÇÃO.
- Linha cuja evidência é página de OCR é marcada "lida por OCR".
- Sem a pasta de extração (CSV escolhido à mão), essas duas conferências são puladas, e o console avisa.

### 5.2 Motor

Port das partes do `lmr.js` que o fluxo usa: expandir (trechos do projeto ∩ trechos da linha, `[XX]`
pela unidade, repetição pela quantidade, granel = 1 linha), montar o `CÓDIGO LMR` e a `TAG LMR` no
padrão único (PN no fim, limite de 150 na TAG), validar (V1–V15) e gravar. Linha que falha é bloqueada:
fica fora da aplicação e entra na VALIDAÇÃO com o motivo.

### 5.3 Saídas

Na pasta do sistema, em `LMR\SAIDA ATUAL\`:
- `APLICAÇÃO LMR - <sistema>.xlsx`, no `Template_Aplicação_LMR.xlsx` (abas DOCS DE REFERÊNCIA,
  DESCRIÇÃO DOCUMENTOS, APLICAÇÃO - LMR), gravado com `openpyxl`;
- `VALIDAÇÃO - <sistema>.xlsx`: bloqueadas, avisos e as marcações do §5.1.

Antes de gravar: trava do caminho com mais de 259 caracteres e erro claro se o arquivo estiver aberto
no Excel.

## 6. A tela

Módulo **Gerar Aplicação LMR**, com três abas e um console (o padrão de `views/aplicacao_lmr.py`):

| Aba | Campos e botões |
|---|---|
| 1. Extração | pasta do sistema, `_STATUS_PMIB`, PDFs; **Instalar componente** (se faltar a DLC); **Extrair documentos** |
| 2. Análise no AMP | escopo, subsistema, trechos do projeto; **Configurar IA** (endereço e chave); **Testar conexão**; **Enviar ao AMP** |
| 3. Realizar a Aplicação LMR | CSV (o da aba 2 ou outro); **Gerar aplicação** |

Cada aba funciona sozinha a partir do que a anterior gravou: corrigir o CSV à mão e refazer só a aba 3
não gasta execução do AMP.

## 7. Arquivos no SIG-FT

| Arquivo | Papel |
|---|---|
| `sigft/services/gerar_lmr_extracao.py` | chama a DLC, lê o Status, monta índice e lotes |
| `sigft/services/gerar_lmr_amp.py` | monta o envio, grava o CSV e o diagnóstico |
| `sigft/services/gerar_lmr_motor.py` | conferência do CSV, expansão, montagem, validação, gravação |
| `sigft/app_qt/views/gerar_aplicacao_lmr.py` | a tela (sem regra de negócio) |
| `empacotamento/docling_dlc/` | o programa da DLC e a receita do pacote |
| `amp/aplicacao_lmr/` | agente, gerador do workflow, LEIA-ME |
| `tests/test_gerar_lmr_*.py` | os testes do §9 |

Registro do módulo como manda a skill `sigft-novo-modulo`: `TELAS`, `catalogo.MENU`, `catalogo.MODULOS`,
`conferencia.MODULOS_ESSENCIAIS`; doc em `docs/base-conhecimento/`. Serviço não importa Qt; comunicação
por callbacks.

## 8. Erros

- Nada some: PDF não lido, lote com erro, linha bloqueada e valor não encontrado aparecem no console e
  na VALIDAÇÃO.
- O envio ao AMP vai uma vez só. Se o SIG-FT desistir (45 min), o LEIA-ME ensina a resgatar o CSV da
  execução no n8n e a usá-lo na aba 3.
- DLC ausente, corrompida ou de versão errada: a aba 1 explica e oferece instalar.

## 9. Testes

- **Motor:** unidade (expansão por trechos e frequência, `[XX]`, granel, PAI, limite de 150) e regressão
  por assinatura contra o `lmr.js` (§2.1), com dados fictícios no repositório; a regressão com dados
  reais roda na máquina com o Box.
- **Extração:** com a DLC dublada (uma saída JSON fictícia), testa índice, catálogo e lotes (tamanho,
  página nunca cortada).
- **AMP:** o `.json` igual ao gerador, o contrato do webhook e a leitura da resposta, com o cliente
  dublado.
- **Tela:** pytest-qt offscreen e o `--smoke`.

## 10. Ordem de entrega

1. **Sonda da DLC:** montar o pacote, medir o tamanho e rodar na máquina da empresa com a Água Pura e
   a SFC (critério §2.2). Se o pacote não instalar ou não rodar na rede da empresa, o projeto para aqui
   e volta ao desenho.
2. **Motor em Python** + aba 3 (critério §2.1). Já é útil sozinho: gera a aplicação de um CSV feito à mão.
3. **Extração** + aba 1.
4. **Workflow e agente do AMP** + aba 2; teste com a Água Pura, depois a SFC (critério §2.3).

## 11. Riscos conhecidos

- Tamanho da DLC e tempo do Docling em CPU não foram medidos (passo 1).
- Sistema com muitos lotes pode passar dos 45 min numa chamada; se acontecer, o envio passa a ser
  dividido em mais de uma chamada.
- O limite de 50 execuções publicadas por mês no n8n do AMP (anotado em 02/11) não foi reconfirmado.
- Informação espalhada entre lotes (material numa lista, local num desenho): o resumo de localização do
  `INDICE.md` reduz, não elimina; o que faltar sai vazio e bloqueia a linha.
- O resultado do agente varia entre rodadas; por isso o CSV fica salvo e é ele, não a rodada, o registro.
- O `SIG-FT.spec`, o workflow de release e as zonas compartilhadas são do Luan: as mudanças neles
  precisam ser combinadas com ele.

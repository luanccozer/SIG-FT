# Plano de automação da Aplicação LMR no AMP (n8n) — v1.6

**Data:** 23/10/2026
**Status:** proposta para discussão. Pontos **[hipótese]** dependem dos testes da Fase 0; pontos **[decisão]** dependem de você.

**Histórico deste plano**
- v1.0: arquitetura inicial (IA lê, código monta).
- v1.1: análise dos 4 exemplos, TABELA_TAGS, templates e ITAIPU-REF-0013 rev. 27; revisão no fim; fluxo de alteração.
- v1.2: suas respostas às 6 pendências (§12) + análise dos documentos de entrada em `Exemplo de Documentos Aplicação LMR/` (§3.5). Principais mudanças: padrão único de formato (§3.3), regra de TAG LMR para PAI/FILHO (§3.2), RDS-PP de documento como válido (§6), detecção automática de alterações por revisão de lista no Aconex (§4.4), leitura pela camada de texto dos PDFs (§4.2).
- v1.3: **Status PMIB** como fonte do catálogo (§3.6) + padrão único aprovado (§3.3) + regra de RDS-PP+TAG em 3 casos (§3.2) + 5º exemplo (SFC). Status PMIB também passa a detectar alterações (§4.4) e entra na validação (V12–V14).
- v1.4: formato final do CÓDIGO LMR e da TAG LMR, sem `(REF)` (§3.3). Trechos do projeto como parâmetro do formulário (todas, ímpares, pares, lista, AMD/AMC), com a frequência do material filtrando dentro deles (§3.2). QTD instalada define a repetição por trecho e granel gera 1 linha (§3.5). Local em lista fechada. Escopo e subsistema vêm do formulário. Coluna `Status` sai. Abas DOCS DE REFERÊNCIA e DESCRIÇÃO DOCUMENTOS definidas (§4.3). Pastas do Box por escopo. Fase 0 em workflows `.json`. Decisões 14–27 (§12).
- v1.5: **roteiro de validação e construção (§9A)**, com o que entra no fluxo completo e as etapas. Cada etapa tem critério de aceite e assinatura de conferência AMP × local. A Base da Aplicação passa a ser o arquivo que liga os workflows R, A, B e C.
- v1.6: **arquitetura simplificada (§9B)**. O AMP só expande a Base: a R sai do AMP e roda uma vez por sistema, fora dele; o B lê só a Base, em lotes de 20 linhas, e as linhas em massa ficam com nós nativos. A §9B manda sobre a §9A onde as duas divergem.

---

## 1. Resumo

**Problema:** o AMP gera resultados diferentes a cada execução e, na última aplicação, devolvia HTML vazio/errado na etapa Tabela_Tags → Aplicação LMR sem perceber o erro.

**O que a análise provou:**
- O `CÓDIGO LMR` da Água Pura é **100% reproduzível por regra fixa** (3.580 de 3.580 linhas idênticas, geradas por código a partir da `Tags individuais`).
- Os exemplos emitidos têm **inconsistências que código impede**: unidade trocada (M16 com TRECHO U18), dígito trocado (`MEU01` por `MEU10`, 54 linhas), `CASA DE FORCA` sem cedilha (120 linhas), formatos diferentes de trecho/eixo entre e dentro das aplicações.
- **Quase todos os PDFs de entrada têm camada de texto** (§3.5): TAGs, códigos e elevações podem ser lidos sem a IA "olhar" a imagem. A IA fica só com a interpretação.

**Solução:** fluxo no **n8n dentro do AMP**, três workflows:

```
A — NOVA APLICAÇÃO (IA + código)  →  BASE DA APLICAÇÃO  →  B — GERAÇÃO (só código)  →  APLICAÇÃO LMR + VALIDAÇÃO
                                                                                          ↓ revisão humana no fim
C — ALTERAÇÃO (só código) ← correções da revisão / nova revisão de lista no Aconex
    altera a BASE → B regenera → aba DIFERENÇAS
```

**Ordem de construção:** B → C → A.

---

## 2. Diagnóstico — por que o desempenho varia

| # | Causa | Evidência | Como o novo fluxo trata |
|---|---|---|---|
| 1 | Montagem de códigos feita pelo modelo | Regra 100% determinística (§3.2) | Montagem só em código (B) |
| 2 | Saídas longas demais | HTML vazio; aplicações de 760 a 6.030 linhas | IA nunca escreve a planilha; respostas curtas |
| 3 | Modelo avaliando o próprio trabalho | "Sem noção" de que errou | Checagem é código; resultado vira relatório |
| 4 | Tarefa ampla demais por chamada | Ler + interpretar + estruturar + formatar | Uma chamada = um trecho + uma pergunta + formato fixo |
| 5 | Formato não padronizado | Cada aplicação com um estilo (§3.3) | Padrão único aplicado por código |
| 6 | IA lendo o que código lê melhor | PDFs com texto, planilhas, REF-0013 | Extract from File + busca por padrão |
| 7 | Nenhuma validação contra a REF-0013 | Erros de unidade/código nos exemplos | Validação automática de todo RDS-PP |
| 8 | Mascaramento do AMP **[hipótese]** | Relato do usuário | Teste S6 na Fase 0 |

---

## 3. Base das regras (o que os arquivos mostram)

### 3.1 Arquivos analisados

| Arquivo | Linhas APLICAÇÃO - LMR | PMIBs |
|---|---|---|
| REG. VEL E POT - HIDRÁULICA | 6.030 | 142 |
| RV PARTE DIGITAL TGC E CCAR | 4.620 | 57 |
| Aeração Axial da Turbina | 760 | 14 |
| Água Pura | 3.580 | 87 |
| SFC HF-01 e HF-02 R2 | 452 | 41 |
| TABELA_TAGS_EXEMPLO (Água Pura) | 3.580 individuais / 87 gerais | 87 |
| `Exemplo - PMIB/` — 5 planilhas STATUS_PMIB (uma por lista de sobressalentes) | — | 41 / 14 / 57 / 141 / 87 válidos |
| Template_Aplicação_LMR | abas DOCS DE REFERÊNCIA, DESCRIÇÃO DOCUMENTOS, APLICAÇÃO - LMR (`FICHA_PMIB`, `CÓDIGO_LMR`, `TAG_LMR`, `Status`) | — |
| ITAIPU-REF-0013 rev. 27 | Função: 6.469 códigos; Localização: 1.363; tabelas BL0–BL3 | — |

### 3.2 Regras de montagem

**Unidade geradora ↔ RDS-PP ↔ trecho** (REF-0013, confirmado nos exemplos):

| Designação | M | Trecho |
|---|---|---|
| #ST50 | M01…M09, M19 | U-01…U-09, U-09A |
| #ST60 | M10…M18, M20 | U-10…U-18, U-18A |
| #ST50 / #ST60 | M50 / M60 | comum ao setor |
| #ST00 | M00 | comum a todas |

**Onde o material é aplicado = TRECHOS DO PROJETO ∩ FREQUÊNCIA DO MATERIAL.**

**1. Trechos do projeto (parâmetro do formulário, §5.1).** Cada projeto define o seu conjunto, e nem todos usam as 20 UGs:

| Opção | Trechos |
|---|---|
| `TODAS` | U-01…U-18, U-09A, U-18A |
| `ÍMPARES` / `PARES` | pela **posição física** da UG (tabela abaixo). `ÍMPARES` = U-01, U-03, U-05, U-07, U-09, U-10, U-12, U-14, U-16, U-18. `PARES` = U-02, U-04, U-06, U-08, U-09A, U-11, U-13, U-15, U-17, U-18A |
| `LISTA` | UGs específicas (ex.: `U-03, U-11, U-18A`) |
| `AMD` / `AMC` | AMD-01…04 / AMC-01…03, ou uma lista deles |

**Posição física** (Data Table fixa, usada por `ÍMPARES`/`PARES`):

| Posição | 1–9 | 10 | 11–19 | 20 |
|---|---|---|---|---|
| Trecho | U-01…U-09 | U-09A | U-10…U-18 | U-18A |
| M | M01…M09 | M19 | M10…M18 | M20 |

O formulário mostra a lista final expandida para conferência antes de rodar. Os trechos ficam gravados na Base, e todo o resto (B, C, V4/V5) usa essa lista.

**2. Frequência do material (50 Hz / 60 Hz)**, procurada nesta ordem e usada só para filtrar dentro dos trechos do projeto:

| Passo | Fonte | Resultado |
|---|---|---|
| 1 | Documento de projeto: título, carimbo, desenho ou WS indica 50 ou 60 Hz | `#ST50` → M01–M09, M19; `#ST60` → M10–M18, M20 |
| 2 | RDS-PP onde a TAG aparece (`#ST50` / `#ST60`) | idem |
| 3 | Busca nos demais documentos da pasta do escopo: código no índice de texto (A4), IA só para interpretar (A6c) | idem, com evidência |
| 4 | **Não encontrada** | se os trechos do projeto forem todos da mesma frequência, ou se o projeto for AMD/AMC, não há o que perguntar. Se o projeto misturar 50 e 60 Hz, **o fluxo pergunta ao usuário** qual frequência aplicar: 50 Hz, 60 Hz ou ambas. A resposta é gravada com `FONTE = manual` |

Material de 60 Hz num projeto de UGs ímpares, por exemplo, entra em U-10, U-12, U-14, U-16 e U-18. Se a interseção ficar vazia (frequência sem nenhum trecho no projeto), a linha vai para a VALIDAÇÃO. A descrição do Status PMIB (ex.: "60 Hz") serve só de conferência e, se divergir, gera aviso.

Fora de UG (AMD, AMC, M50, M60, M00), o RDS-PP é o do documento, sem expansão de M.

**Quando o RDS-PP leva a TAG concatenada (`{RDS-PP}{TAG}`, sem hífen) — respostas 4 e v1.3:**

| Caso | Situação | CÓDIGO LMR (localização) | TAG LMR |
|---|---|---|---|
| 1 | Material **com RDS-PP individual** (ex.: bomba GP151) | `... - RDS-PP: {RDS-PP área/painel} - ...` | `{ESC} - {TAG} - RDS-PP: {RDS-PP área/painel}{TAG} - {DESCRIÇÃO}` |
| 2 | **Documento instrui** relacionar o material ao RDS-PP da área/painel + TAG | idem caso 1 | idem caso 1 |
| 3 | **FILHO (documental ou físico, §3.7) de PAI que tem RDS-PP+TAG** (ex.: acoplamento do motor/bomba, vedações do conjunto) | cita o pai no lugar da ÁREA/PAINEL: `{ESC} - {SUB} - {TAG pai} - RDS-PP: {RDS-PP}{TAG pai} - ...` | `{ESC} - {DESCRIÇÃO}`, sem RDS-PP, salvo se o FILHO também cair no caso 1 |
| — | Demais (materiais sem TAG e sem pai) | `... - RDS-PP: {RDS-PP área/painel} - ...` | `{ESC} - {DESCRIÇÃO}` |

Conferido nos exemplos: caso 3 aparece na Reg. Vel (1.480 linhas, ex.: acoplamento com `...UZ001MA151 - GP151 - ...UZ001GP151`). Na Água Pura, 120 linhas de FILHO com TAG própria (ex.: `BS141T`) caem no caso 1. Os 100 kits FILHO da Água Pura citavam a área (SKID), uma vez por UG, para reduzir erros manuais. No padrão novo eles citam o pai e entram uma vez por TAG do pai (§3.7, R5–R6). Isso aparece como mudança de conteúdo na DIFERENÇAS.

**RDS-PP de documento (sua resposta 4):** códigos com sufixo `&XXX000` (ex.: `UH010-UH901&ELU010`) e códigos como `UZ020-UZ003` são **especificações de documento**, intencionais. Eles também aparecem no nome do arquivo, no título e no carimbo dos documentos, então dá para validar por código (§6, V3).

**`{DESCRIÇÃO}`** é uma por PMIB e é **copiada da coluna `DESCRIÇÃO` do Status PMIB**, com limpeza mínima: `trim`, espaços duplos e quebras de linha. A IA não redige a descrição. O `(REF)` dos exemplos sai do padrão. O código do material continua no CATÁLOGO e na aba DOCS DE REFERÊNCIA (`PART NUMBER`).

### 3.3 Padrão único (sua resposta 2)

Todas as aplicações seguem o mesmo modelo. **Aprovado em 22/10/2026** (trecho, eixo, RDS-PP+TAG); demais pontos são o padrão adotado até decisão contrária:

**Formato final (aprovado em 23/10/2026):**

```
CÓDIGO_LMR = {ESCOPO} - {SUBSISTEMA} - {ÁREA/PAINEL} - RDS-PP: {RDS-PP} - {LOCAL} - ELEV. {xx,xx} - EIXO {..} - TRECHO {..}
TAG_LMR    = {ESCOPO} - {TAG} - RDS-PP: {RDS-PP}{TAG} - {DESCRIÇÃO}     (material com TAG, casos 1–2 do §3.2)
TAG_LMR    = {ESCOPO} - {DESCRIÇÃO}                                     (material sem TAG e filho do caso 3)
FICHA_PMIB = PMIB do Status
```

- `{ESCOPO}` e `{SUBSISTEMA}` vêm do formulário de entrada (§5.1). `{ÁREA/PAINEL}` vem dos documentos.
- A coluna `Status` do template sai da saída (vazia nos 5 exemplos).
- O filho se distingue pela TAG do pai no lugar de `{ÁREA/PAINEL}` (§3.7 R4).

| Elemento | Padrão | Hoje nos exemplos |
|---|---|---|
| Separador | `RDS-PP: ` (com espaço) | `RDS-PP:` / `RDS-PP: ` / ausente (Água Pura) |
| RDS-PP + TAG | **aprovado:** concatenado sem hífen, `...UZ001GP151`, só nos 3 casos do §3.2 | Água Pura usa `...UZ001-GP101` sem `RDS-PP: ` |
| Trecho (UG) | **aprovado:** `U-{nn}`: `U-01`…`U-18`, `U-09A`, `U-18A` | `U-1`, `U01`, `U-10`, `U9A` |
| Trecho (fora de UG) | **aprovado, lista fechada:** `AMD-01`…`AMD-04`, `AMC-01`…`AMC-03` | SFC: `AMD-03` |
| Eixo | **aprovado, lista fechada:** `AB`, `BC`, `CD`, `MB`, `JB`, `JD` | `B-C`, `C-D`, `CD`, `JD`, `XXXX` |
| Elevação | **aprovado:** vírgula decimal, **sempre 2 casas**: `98,50`, `107,61`, `127,00`. Valor com 3 casas no documento é arredondado (`106,105` → `106,11`, arredondamento comercial) e gera aviso | `98,5`, `107,61`, `106,105`, `127` |
| Descrição do local | **aprovado, lista fechada** (Data Table no n8n), maiúsculas e acentuada: `CASA DE FORÇA`. `CASA DE FORÇA - UNIDADE GERADORA` = `CASA DE FORÇA`. A lista começa com os locais dos exemplos e vocês completam. Local fora da lista bloqueia a linha | `CASA DE FORÇA`, `CASA DE FORCA`, `Sala Geradores Diesel` |
| Eixo desconhecido | campo vazio bloqueia a linha (vai para VALIDAÇÃO) | Aeração: `XXXX` em 760 linhas |

**Consequência:** ao corrigir uma aplicação antiga pelo Workflow C, ela sai **no padrão novo**. A aba DIFERENÇAS separa "mudança de padrão" de "mudança de conteúdo" para não esconder alterações reais.

### 3.4 Localização — de onde vem (sua resposta 3)

Elevação, eixo e trecho vêm do **workstatement, do título/carimbo dos documentos** (fluxogramas, arranjos gerais, P&IDs, layouts, projetos) e **do próprio desenho**. Não dependem da aba Localização da REF (que não tem as combinações usadas). Consequências:
- No Workflow A a localização é um **atributo do documento/área**: extraída do título/carimbo/desenho e herdada pelos materiais daquele documento/área, com a evidência registrada.
- A validação contra a aba Localização da REF sai do plano.

### 3.5 Documentos de entrada (sua resposta 6)

Pasta `Exemplo de Documentos Aplicação LMR/`, 3 conjuntos:

| Conjunto | PDFs | Páginas | Observação |
|---|---|---|---|
| Água Pura | 13 | 1–103 por documento | todos com texto |
| Aeração Axial | 5 | 2–46 | todos com texto |
| SFC | 11 | 2–119 | **Diagramas funcionais HF-01 e HF-02 (119 p. cada) sem texto — escaneados**; `6224-60-T0201P` tem 25 de 74 páginas sem texto; dois PDFs de 67–78 MB |

**Quantidade = quantidade instalada na usina, nunca a de reposição.** A `QTD` da lista de sobressalentes e do Status PMIB é a quantidade de reposição e **não entra** na aplicação. A quantidade instalada vem dos documentos de projeto:
- material com TAG própria → 1 por TAG (o número de TAGs já é a quantidade);
- material sem TAG → lista de materiais do skid/equipamento, desenho ou WS (ex.: resina HP201: 50 e 100 na Tabela_Tags da Água Pura);
- não encontrada → pendência na VALIDAÇÃO, nunca valor preenchido por suposição.

**Como a QTD vira linhas (aprovado em 23/10/2026):**
- A QTD instalada define **quantas vezes a linha se repete em cada trecho**. As linhas repetidas são idênticas, e isso é intencional (V9 não acusa).
- Material a granel (unidade `L`, `kg`, `m` e similares) gera **1 linha por trecho**. A QTD fica só na Base.

**O que a camada de texto entrega (verificado na Água Pura):**
- **Lista de sobressalentes** (`&MPB020`): por material, descrição, **TAGs**, fabricante, modelo, **código do material**, unidade. É a fonte principal da relação material ↔ TAG. A quantidade dela é de reposição e é ignorada.
- **P&ID** (`&MFB030`): todas as TAGs (`QM104G`, `BP159T`, `GP101`...), nomes de subsistemas, elevações (`EL 98.500`, `EL 104.200`) e os RDS-PP dos subsistemas.
- **Lista de materiais do skid** (`&MLU010`): ID, quantidade, descrição, TAG.
- **Carimbos:** código Itaipu (RDS-PP do documento), revisão, título.
- **Nome do arquivo** = código do documento + revisão (ex.: `#ST00=M00MKF10&MPB020[R1A]`).

**Não aparece em nenhum PDF: o código PMIB.** Ele vem do Status PMIB (§3.6).

### 3.6 Status PMIB — fonte do catálogo

Uma planilha por lista de sobressalentes: `{código da lista}_STATUS_PMIB - {sistema}.xlsx`, aba `Lista de Materiais`.

**Estrutura (igual nas 5):**
- Linha 2: caminho do sistema | **código da lista** (`#ST00=M00MKF10&MPB020`) | código do fornecedor | eventos de pagamento.
- Linha 3: `REVISÃO DA LISTA DE SOBRESSALENTES ATUAL EM USO: 1A - DATA DE ALTERAÇÃO: 13/10/2026`.
- Cabeçalho: `ITEM`, `QTD.`, `UNID.`, `DESCRIÇÃO`, `CÓDIGO DO MATERIAL`, `CÓDIGO CMI` (Reg. Vel: `CÓDIGO GE`), `MARCA/MODELO`, `CÓDIGO PMIB`, `PDM usado`, `STATUS`, colunas de completude (… `APLICAÇÃO - LMR`), `TIPO DE ENTREGA`, `FORNECEDOR`, `PROCUREMENT`, `OBSERVAÇÕES`.

**Cruzamento com as aplicações emitidas** (excluindo `STATUS = DUPLICADO`):

| Sistema | Válidos no Status | PMIBs na aplicação | Em ambos | `(REF)` da TAG LMR = código/modelo do Status |
|---|---|---|---|---|
| Água Pura | 87 | 87 | 87 | 83/87 |
| Aeração Axial | 14 | 14 | 14 | 14/14 |
| RV Digital (CCAR) | 57 | 57 | 57 | 54/57 |
| Reg. Vel. Hidráulica | 141 | 142 | 139 | 127/139 |
| SFC | 41 | 41 | — | — |

**Regras de leitura (código, sem IA):**
- Cabeçalho localizado pela célula `ITEM` (não por número de linha).
- PMIB válido: padrão `\d{10}\.\d{4}`, com `trim` (CCAR tem espaço no fim).
- `STATUS = DUPLICADO` → fora do catálogo. Com isso, nenhum PMIB se repete nos 5 arquivos.
- Linhas de seção (`TGC`, `CCAR`) → atributo `SEÇÃO` dos itens seguintes; `INSTRUMENTAÇÃO` aparece numa coluna extra à esquerda (Reg. Vel.), detectar.
- Linhas de conjunto sem PMIB (`1 – CJ – Conjunto ... composto dos seguintes itens`, Reg. Vel. conjuntos motobomba 4–7) → agrupador (§3.7 R2); os subitens (`1.1`, `4.3`) carregam o PMIB.
- Numeração `x` / `x.y` → relações PAI/FILHO documentais (§3.7 R1).
- `PDM usado` com `FICHA PMIB, DUPLICADA` (11 na CCAR, 1 na Reg. Vel.) → aviso, não exclusão.

**Divergências a auditar na Fase 1:**
- Reg. Vel.: `0795` (válvula esfera QM231), `1137` e `1141` (jogos de vedação) estão na aplicação e **saíram do Status**; `1640` (plaqueta) e `1641` (válvula esfera) estão no Status e **não estão na aplicação**. Esse é um caso real de alteração para o Workflow C.
- `(REF)` diferente do código do material em 19 PMIBs (4 Água Pura, 3 CCAR, 12 Reg. Vel.). A maioria é variação de escrita (`HPI-904P2` × `HPI-904SP2-058-000-A4`). Há casos que parecem troca de código: Reg. Vel. `180001426` × `180001427`; CCAR `13001003` × `13001005`.

### 3.7 PAI e FILHO

Foi a principal fonte de erro em todas as aplicações. Na Reg. Vel. a mesma relação aparece escrita de 4 formas diferentes: só a área, RDS-PP+TAG do pai na TAG, cadeia do pai no CÓDIGO, ou TAG do pai trocada (`QG001` × `GQ001`). A regra abaixo deixa uma forma só.

**Duas categorias, mesma escrita:**

| Categoria | O que é | Exemplo | Quem identifica |
|---|---|---|---|
| **Documental** ("explodido") | o filho é componente do pai só no documento; não é material separado fisicamente | Reg. Vel. item 9, Conjunto de vedações (`0808`), com filhos 9.1–9.6 | **código**, pela numeração do Status PMIB |
| **Física** | pai e filho entregues fisicamente; o filho é instalado dentro do pai. Nem todo item físico e documental é pai ou filho | compressor WP66L (`1055`) e filtro de ar de sucção SAUER (`1054`) | **agente**, no desenho: o material está aplicado dentro de outro? |

**Regras:**

| # | Regra |
|---|---|
| R1 | **Documental:** item `x` com PMIB é pai dos subitens `x.y`. Vale qualquer que seja o `TIPO DE ENTREGA` do subitem (ex.: 9.1 `1150` está como `FÍSICA E DOCUMENTAL` e é filho do 9). A numeração recomeça em cada seção do Status (na Reg. Vel. há vários "item 9"), então a chave é **seção + item** |
| R2 | **Agrupador:** item `x` sem PMIB (conjuntos motobomba 4–7 da Reg. Vel.; item 1 `CJ` da Aeração) não gera linha e não é pai. Cada subitem segue as próprias regras (TAG própria → caso 1; instalado dentro de outro → físico) |
| R3 | **Física:** o código seleciona candidatos (sem TAG própria; descrição cita outro equipamento, ex.: "COMPRESSOR SAUER", "MOTOBOMBA NETZSCH", "PARA VALVULA DUPLOMATIC"). Para cada candidato, o agente recebe só as páginas do desenho onde aparecem as TAGs envolvidas e responde em qual pai o material está instalado, com documento e página. O código confere se o pai existe. A relação entra como `interpretada` e vai para a VALIDAÇÃO. **Sem evidência no desenho:** o material entra como item individual (sem pai) e é marcado na VALIDAÇÃO |
| R4 | **Escrita igual nas duas categorias:** CÓDIGO LMR do filho cita o pai com RDS-PP+TAG (§3.2 caso 3); TAG LMR do filho sem RDS-PP, salvo se tiver TAG própria |
| R5 | **Vários pais:** o filho é aplicado uma vez sob cada pai em que aparece (ex.: `1131` sob os itens 3, 8 e 9). Um PMIB pode ser pai e filho ao mesmo tempo (`1150`: pai no item 8, filho no 9.1) |
| R6 | **Instâncias:** o filho entra uma vez por TAG do pai, em cada UG. Não se agrupa por UG |
| R7 | **Filho que une dois pais** (acoplamento motor–bomba): o CÓDIGO cita os dois, `{ESC} - {TAG1} - RDS-PP: {RDS}{TAG1} - {TAG2} - RDS-PP: {RDS}{TAG2} - ...`, uma linha por par. O par vem do desenho; o código sugere pelo número da TAG (`MA151`/`GP151`) e o agente confirma |
| R8 | **Quantidade do filho:** instalada por instância do pai (desenho/lista do equipamento); sem fonte → pendência (decisão 9) |
| R9 | **Pai sem TAG** (ex.: `0803` Conjunto de vedações sem TAG): o filho cita a mesma localização do pai *(aprovado)*. Filho em geral fica no mesmo local do pai |
| R10 | **Checagens do código:** pai existe; sem ciclo (A filho de B filho de A); filho físico tem evidência; nenhum filho de agrupador |

**Consequência na Base:** a coluna única `PAI (PMIB)` não comporta R5 (vários pais). As relações vão para uma aba própria, **RELAÇÕES** (§5.2).

---

## 4. Arquitetura

### 4.1 Princípios

1. **Código lê o que é legível por código; IA interpreta o resto.**
2. **Chamadas pequenas**, JSON curto de esquema fixo.
3. **A Base da Aplicação é a fonte da verdade**; a planilha LMR é sempre gerada a partir dela.
4. **Toda alteração entra pela Base**, com versão e registro.
5. **Divergência vira item de relatório**, nunca escolha silenciosa.
6. **Regras e padrão são dados** (Data Tables / arquivos no Box).

### 4.2 Workflow A — Nova aplicação

```
A1  Formulário: escopo, subsistema, trechos do projeto; pasta Box do escopo (§5.1)
A2  Code: INVENTÁRIO a partir do nome dos arquivos → código do documento, revisão, tipo (&MPB, &MFB, &EFF...)
A3  Extract from File: texto de cada página de cada PDF
A4  Code: ÍNDICE por busca de padrão em cada página → TAGs, RDS-PP, elevações, códigos de material
     páginas sem texto → fila de leitura visual
A5  Code: STATUS PMIB (§3.6) → CATÁLOGO inicial (PMIB, item, qtd, descrição, código do material, marca/modelo)
     ligação material da lista de sobressalentes ↔ PMIB por CÓDIGO DO MATERIAL (código), IA só se não casar
A6  IA (Gemini Flash-Lite) sobre o TEXTO das páginas relevantes, um tema por chamada:
     a) lista de sobressalentes → linhas material × TAGs × quantidade
     b) títulos/carimbos/WS → localização (área, elev., eixo) por documento/subsistema
     c) desenhos/listas → TAG → subsistema/painel (RDS-PP do sistema)
     e) PAI/FILHO FÍSICO (§3.7 R3, R7): candidato + páginas do desenho → "instalado dentro de qual pai", com evidência
        (PAI/FILHO DOCUMENTAL não passa pela IA: código lê do Status PMIB, R1–R2)
     (DESCRIÇÃO não passa pela IA: copiada do Status PMIB, §3.2)
A7  IA visual só para páginas sem texto (diagramas escaneados)
A8  Code: valida cada JSON (repete 1x; senão pendência); confere toda TAG/código devolvido contra o ÍNDICE (A4)
A9  [opcional] 2ª leitura (Gemini Flash 3.0) dos itens críticos → Code compara
A9b Code: lista materiais de UG sem frequência após os passos 1–3 do §3.2, só se os trechos do projeto misturarem 50 e 60 Hz
     → se houver: n8n Form (Wait) pergunta ao usuário, um material por linha: 50 Hz / 60 Hz / ambas
     → resposta gravada com FONTE = manual
A10 Code: cruza tudo, aplica em TRECHOS DO PROJETO ∩ FREQUÊNCIA, repete pela QTD instalada → BASE DA APLICAÇÃO v1
A11 IA (Claude Sonnet) só para conflitos remanescentes, um por vez (sugere, não decide)
→ chama B
```

**Por que isso reduz a variação:** a IA não "procura" códigos numa imagem; ela recebe texto já extraído e só responde *qual TAG pertence a qual material/subsistema*. E **toda TAG ou código que ela devolve é conferido contra o texto real do documento (A8)**: se não existir no documento, é marcado. Isso pega invenção e erro de cópia na hora.

### 4.3 Workflow B — Geração (sem IA)

```
B1 lê BASE + REF-0013 (Box) + inventário de documentos
B2 Code: valida (§6)
B3 Code: monta CÓDIGO_LMR e TAG_LMR (§3.2 + padrão §3.3)
B4 Convert to File: APLICAÇÃO LMR (formato do template) + aba VALIDAÇÃO + abas DOCS DE REFERÊNCIA / DESCRIÇÃO DOCUMENTOS
```

**Abas do template:**

| Aba | Conteúdo | Quem preenche |
|---|---|---|
| APLICAÇÃO - LMR | `FICHA_PMIB`, `CÓDIGO_LMR`, `TAG_LMR`. A coluna `Status` sai | código (B3) |
| DOCS DE REFERÊNCIA | uma linha por PMIB: `CÓDIGO PMIB`, `PART NUMBER` (= `CÓDIGO DO MATERIAL` do Status), `DESCRIÇÃO DO MATERIAL`, `RDS-PP DOCUMENTO - PRINCIPAL` | código. O documento principal é P&ID, fluxograma, diagrama funcional, arranjo geral ou layout onde o material aparece. Para filho, vale o documento do pai ou do equipamento. Sem nenhum, a célula fica vazia e o PMIB vai para a VALIDAÇÃO |
| DESCRIÇÃO DOCUMENTOS | `CÓDIGO ITAIPU`, `CODIGO CMI`, `DESCRIÇÃO DOCUMENTO` | **vocês, no fim.** O fluxo copia a aba do template sem alterar |

### 4.4 Workflow C — Alteração (sem IA)

**Duas entradas, mesmo motor:**

**C-manual — correções da revisão ou pedidos pontuais.** Planilha de ALTERAÇÕES:

| Campo | Exemplo |
|---|---|
| TIPO | `SUBSTITUIR_MATERIAL` / `ALTERAR_CAMPO` / `INCLUIR` / `EXCLUIR` |
| PMIB_ATUAL / PMIB_NOVO | 4500063671.0816 → 4500063671.1700 |
| FILTRO (opcional) | `TAG=QM104G` / `UG=M01..M09` / vazio = todas as linhas do PMIB |
| CAMPO / VALOR_NOVO | para ALTERAR_CAMPO |
| MOTIVO / DOCUMENTO | ex.: `#ST00=M00MKF10&MPB020[R1A]` |

**C-automático — nova revisão de lista no Aconex (sua resposta 5).** Dois níveis:

**Nível 1 — Status PMIB × Base (só planilhas, sem PDF).** O Status PMIB acompanha a revisão em uso da lista (linha 3). O código compara os PMIBs válidos do Status com os da Base:
- PMIB na Base e fora do Status → candidato a `EXCLUIR` ou a material substituído;
- PMIB no Status e fora da Base → candidato a `INCLUIR` ou a material substituto;
- mesmo PMIB com código do material ou modelo diferente → `ALTERAR_CAMPO` (REF).

Um par saída/entrada do mesmo tipo vira sugestão de `SUBSTITUIR_MATERIAL`. Exemplo: Reg. Vel. `0795` válvula esfera sai, `1641` válvula esfera entra. A confirmação é sua. Esse nível já funciona com os arquivos que você mandou.

**Nível 2 — lista rev. anterior × rev. nova (PDF).** Usado quando o nível 1 não basta para saber em quais TAGs o material entra (ex.: material novo). Entrada: as duas revisões (ex.: `&MPB020[0]` e `&MPB020[R1A]`). O código:
1. Extrai as duas revisões (mesma leitura do A6a, que já fica testada).
2. Compara **por TAG**:
   - mesma TAG, **código de material diferente** → sugere `SUBSTITUIR_MATERIAL`;
   - TAG nova → `INCLUIR`;
   - TAG removida → `EXCLUIR`;
   - mudou só descrição/modelo → `ALTERAR_CAMPO`.
3. Gera a planilha de ALTERAÇÕES **pré-preenchida** para você confirmar (não aplica sozinho).

**Aplicação das alterações (sua resposta 1 — a linha antiga some):**
- `SUBSTITUIR_MATERIAL`: a linha do material novo **ocupa o lugar** da antiga (mesma posição, mesma TAG/RDS-PP/localização); PMIB e descrição vêm do catálogo do material novo. Não há Status `SUBSTITUÍDO`.
- Se o material novo não está no catálogo → alteração rejeitada com motivo.
- Se o substituído é PAI → os FILHOs afetados são listados no relatório.
- B regenera; a aba **DIFERENÇAS** mostra antes/depois de cada linha alterada; a Base anterior fica preservada como versão.

**Aplicações emitidas antes do fluxo:** o código **reconstrói a Base** decompondo cada `CÓDIGO_LMR`/`TAG_LMR` da aplicação emitida. Teste de aceitação da reconstrução: regenerar **no estilo antigo** e conferir que sai idêntica. Só depois a alteração é aplicada e a saída sai no padrão novo (§3.3).

### 4.5 Revisão no fim

A entrega de A/B/C é sempre: **APLICAÇÃO LMR** + **VALIDAÇÃO** + **BASE** (+ **DIFERENÇAS** no C). O revisor confere a aplicação final; se algo estiver errado, preenche ALTERAÇÕES e roda C. Nunca se edita a planilha final à mão.

### 4.6 Modelos

| Etapa | Modelo | Por quê |
|---|---|---|
| A6 leitura de texto | **Gemini Flash-Lite 3.5** (fallback 3.1) | melhor leitor na sua experiência; barato para muitas chamadas pequenas |
| A7 leitura visual | Gemini Flash-Lite 3.5 / Flash 3.0 (comparar na Fase 5) | páginas escaneadas |
| A9 2ª leitura | **Gemini Flash 3.0** | leitura independente para comparar |
| A11 conflitos | **Claude Sonnet 5.5** | raciocínio sobre um caso pequeno |
| B, C | nenhum | determinístico |

Nós: **Basic LLM Chain / GEV LLM Model** (prompt fixo, sem memória). **Amp Agent** só se necessário para PDF/imagem **[Fase 0]**.

---

## 5. Dados

### 5.1 Parâmetros da aplicação (formulário)

`aplicacao_id`, `escopo` (sigla, ex.: `RV`, `UG`, `SFC`), `subsistema`, **`trechos`** (`TODAS` / `ÍMPARES` / `PARES` / `LISTA` / `AMD` / `AMC`, §3.2), pasta Box do escopo, revisão da REF-0013 a usar. Formato do texto **não** é parâmetro: é o padrão único (§3.3). O local vem dos documentos e é conferido contra a lista fechada (Data Table). A frequência de cada material filtra dentro dos `trechos` (§3.2).

**Pastas no Box:** cada aplicação tem a pasta do seu escopo, com os documentos dela (ex.: pasta da Água Pura, pasta da Aeração Axial). O fluxo lê a pasta indicada no formulário e grava nela a Base, a aplicação e os relatórios. Onde a pasta ainda não existir, a sugestão é `LMR/{escopo}-{subsistema}/`.

### 5.2 Base da Aplicação (uma por aplicação, versionada no Box)

**CATÁLOGO** (uma linha por PMIB, origem Status PMIB §3.6): `PMIB`, `LISTA` (código + revisão em uso), `ITEM`, `SEÇÃO`, `QTD`, `UNID`, `DESCRIÇÃO LISTA`, `CÓDIGO MATERIAL`, `CÓDIGO CMI/GE`, `MARCA/MODELO`, `TIPO DE ENTREGA`, `AGRUPADOR` (sim/não), `GRANEL` (sim/não, pela unidade), `DESCRIÇÃO` (copiada do Status, limpeza mínima), `CASO RDS-PP+TAG` (1/2/3/—, §3.2), `DOC. REFERÊNCIA PRINCIPAL`.

**RELAÇÕES** (uma linha por par pai–filho; um filho pode ter várias, §3.7 R5): `PMIB FILHO`, `PMIB PAI`, `CATEGORIA` (documental/física), `ITEM NO STATUS` (ex.: `9.3`), `PAI 2` (só filho que une dois pais, R7), `QTD POR INSTÂNCIA`, `FONTE` (Status PMIB ou documento + página), `CONFIANÇA` (`texto` para documental; `interpretada` para física até a revisão).

**APLICAÇÕES** (uma linha por aplicação individual; equivalente à *Tags individuais*): `ID_LINHA`, `PMIB`, `ÁREA/PAINEL`, `RDS-PP` (do sistema, modelo `[XX]` ou expandido), `TAG`, `TAG PAI`, `DESCRIÇÃO DO LOCAL`, `ELEV.`, `EIXO`, `TRECHO`, `APLICAÇÃO (Hz)` + `FONTE Hz` (documento / RDS-PP / busca / manual), `QTD` (instalada), `FONTE` (documento + página + evidência), `CONFIANÇA` (`texto`/`interpretada`/`visual`/`manual`).

**DOCUMENTOS**: código, revisão, tipo, título, localização extraída (alimenta as abas DOCS DE REFERÊNCIA e DESCRIÇÃO DOCUMENTOS).

**HISTÓRICO**: versão, data, alterações aplicadas, origem (revisão Aconex / revisão humana), autor.

### 5.3 Saída da IA (exemplo — leitura da lista de sobressalentes, A6a)

```json
{
  "doc": "#ST00=M00MKF10&MPB020[R1A]",
  "paginas": "5",
  "linhas": [
    {
      "descricao": "Transmissor de vibração",
      "tags": ["BS141T", "BS143T", "BS160T", "BS144T", "BS146T", "BS161T"],
      "fabricante": "IFM",
      "modelo": "VTV122",
      "codigo_material": "9009397",
      "evidencia": "pág. 5, item 1.5"
    }
  ]
}
```
Campo ausente = `null`. A IA não devolve CÓDIGO_LMR nem TAG_LMR. Cada TAG e código é conferido no texto da página pelo código (A8).

---

## 6. Validação

| # | Regra | Severidade |
|---|---|---|
| V1 | Campos obrigatórios do CÓDIGO_LMR / TAG_LMR preenchidos (inclui EIXO e ELEV.) | bloqueia linha |
| V2 | Sem placeholder `[XX]` após expansão | bloqueia linha |
| V3 | RDS-PP existe na **REF-0013** (forma genérica por UG) **ou** é código de documento do inventário da aplicação | aviso se nenhum dos dois |
| V4 | M coerente com TRECHO (§3.2) | bloqueia linha |
| V5 | #ST50 só com M01–M09/M19/M50; #ST60 só com M10–M18/M20/M60 | bloqueia linha |
| V6 | PMIB existe no CATÁLOGO; relações de §3.7 R10 (pai existe, sem ciclo, físico com evidência, nenhum filho de agrupador); filho aplicado uma vez por TAG de cada pai (R5–R6) | bloqueia linha |
| V7 | Texto no padrão único (§3.3) | garantido pelo código |
| V8 | Toda TAG/código vindo da IA existe no texto do documento citado | aviso |
| V9 | Linhas duplicadas **além da QTD instalada** (repetição pela QTD é intencional) | aviso |
| V10 | QTD instalada com fonte (documento de projeto); material com TAG = 1 por TAG; nunca a QTD de reposição | bloqueia linha se sem fonte |
| V11 | Confiança `interpretada`/`visual` ou leituras divergentes | aviso |
| V12 | PMIB da Base está entre os válidos do Status PMIB, e todo PMIB válido do Status está aplicado | aviso (lista os faltantes/sobrantes) |
| V13 | `PART NUMBER` da DOCS DE REFERÊNCIA igual ao `CÓDIGO DO MATERIAL` do Status; documento principal preenchido | aviso |
| V14 | Eixo ∈ {AB, BC, CD, MB, JB, JD}; trecho ∈ {`U-01`…`U-18`, `U-09A`, `U-18A`, `AMD-01`…`AMD-04`, `AMC-01`…`AMC-03`}; elevação com 2 casas; local na lista fechada; `XXXX` proibido | bloqueia linha |
| V15 | Todo trecho aplicado pertence aos `trechos` do projeto; material de UG com frequência definida quando o projeto mistura 50 e 60 Hz; interseção não vazia; divergência com a descrição do Status | bloqueia linha nos três primeiros; aviso na divergência |

**Modo auditoria:** V3–V11 também sobre aplicações já emitidas (via reconstrução), sem alterar nada.

---

## 7. Prompts — estratégia

Escritos na Fase 5, um por tema (A6a–d, A7), com few-shot dos documentos da pasta de exemplos. Estrutura:

```
PAPEL: Você estrutura dados de UM trecho de texto de documento técnico. Não deduz além do escrito.
ENTRADA: código do documento, páginas, texto extraído. [Para A6c: lista de TAGs já indexadas.]
TAREFA: (uma só, específica do tema)
REGRAS: copiar códigos exatamente; ausente = null; toda linha com evidência;
        dedução = "interpretada"; não montar códigos LMR; responder só com o JSON.
FORMATO: {esquema}
EXEMPLOS: 2 casos reais da pasta de exemplos (um completo, um com campo ausente)
```

---

## 8. Código de apoio (nós Code, JavaScript)

| Módulo | Função |
|---|---|
| `ref0013` | carrega a REF (Box), índice genérico por UG |
| `status_pmib` | Status PMIB → CATÁLOGO (regras §3.6) |
| `inventario` | nome do arquivo → código do documento, revisão, tipo |
| `indice_texto` | busca de TAGs/RDS-PP/elevações por página |
| `expande_ugs` | `trechos` do projeto → lista de trechos; `#ST[XX]=M[XX]` → trechos do projeto ∩ frequência (50 Hz: M01–M09, M19; 60 Hz: M10–M18, M20); repete pela QTD; granel = 1 linha |
| `monta_codigos` | regras §3.2 + padrão §3.3 |
| `valida` | §6 → aba VALIDAÇÃO |
| `reconstroi` | aplicação emitida → Base |
| `compara_revisoes` | lista rev. N × rev. N+1 → ALTERAÇÕES sugeridas |
| `aplica_alteracoes` | ALTERAÇÕES → Base vN+1 |
| `diferencas` | vN × vN+1 (conteúdo × padrão) |

Desenvolvidos e testados **localmente nesta máquina** contra os exemplos (nada sai do computador) e depois colados nos nós Code.

---

## 9. Plano de implementação e teste

### Fase 0 — Viabilidade no AMP (execuções manuais)

**Arquivos prontos (23/10/2026):** `motor/fase0/S1…S8*.json`, gerados por `motor/fase0/gerar_fase0.js`, com apoio fictício em `motor/fase0/apoio/`. O roteiro passo a passo está no guia *Guia AMP n8n — Aplicação LMR (Fase 0)*: https://claude.ai/artifact/14qjTyoFX7Qpd2NYMzZfJh

Cada teste vai como **workflow n8n `.json` pronto para importar**, com dados fictícios e um roteiro curto (o que rodar, o que olhar, o que me devolver). Vocês executam no AMP. Execuções manuais não contam no limite. Inclui também o teste do **n8n Form com Wait** (pergunta da frequência, A9b).

| # | Pergunta | Se "não" |
|---|---|---|
| S1 | Code roda JS? Python? Bibliotecas? | JS puro |
| S2 | Extract from File lê a REF-0013 (1,2 MB) e o template? **Extrai texto de PDF por página?** | CSV / texto do documento inteiro com marcadores |
| S3 | Convert to File gera .xlsx com várias abas? Preserva template? | colunas na ordem do template |
| S4 | GEV BOX lê/grava nas pastas do projeto? | upload/download pelo formulário |
| S5 | LLM aceita imagem de página? **Limite de tamanho de arquivo (PDFs de 67–78 MB)?** | leitura visual no chat do AMP; dividir PDF |
| S6 | Mascaramento altera TAG/RDS-PP/código de material? | IA devolve posição; valor vem do índice (A4) |
| S7 | Sub-workflow conta como execução publicada? | juntar workflows |
| S8 | n8n Form (Wait) pausa o workflow e retoma com a resposta do usuário? | parar o A antes de A10, devolver a planilha PERGUNTAS e retomar por um 2º formulário |

### Fase 1 — Motor de regras e reconstrução (local)

- `status_pmib`, `monta_codigos`, `expande_ugs`, `ref0013`, `valida`, `reconstroi`.
- **Regressão:** Água Pura Tabela_Tags → aplicação; 5 aplicações: reconstruir → regenerar no estilo antigo → **idênticas**. Depois, regenerar no padrão v1.4 e listar na DIFERENÇAS só as mudanças decididas (sem `(REF)`, PAI/FILHO, frequência, QTD).
- **Auditoria** das 5 aplicações (inclui V12–V14 contra os Status PMIB) → você confirma quais avisos são erros reais.
- Exemplos lado a lado (estilo antigo × padrão único) para conferência final do padrão.

**Critério:** 5/5 reconstruções idênticas; catálogo dos 5 Status PMIB sem erro de leitura.

**Resultado (23/10/2026), em `motor/`:**

| Teste | Resultado |
|---|---|
| T1 Catálogo | 87 / 14 / 57 / 141 / 41 PMIBs válidos, nenhum repetido entre os 5 Status. 79 relações documentais na Reg. Vel. `1131` sob os itens 3, 8 e 9 (`0803`, `1150`, `0808`). `1150` é pai e filho |
| T2 Trechos | `ÍMPARES` / `PARES` pela posição física. A CCAR emitida já segue isso: 248 linhas nos trechos ímpares e 214 nos pares |
| T3 Água Pura | Tabela_Tags → CÓDIGO_LMR: 3.580/3.580 idênticas |
| T4 Reconstrução | 15.442/15.442 linhas decompostas em campos nas 5 aplicações |
| T5 Ida e volta | padrão v1.4 → decompõe → mesmos campos: 100% |
| T6 Água Pura | aplicação v1.4 pela Tabela_Tags = aplicação v1.4 pela reconstrução (0 diferenças) |
| T7 Workflow C nível 1 | Reg. Vel.: sugere `0795`→`1641` (substituir), excluir `1137`/`1141`, incluir `1640` |
| T8 Auditoria | Água Pura e SFC: 0 linhas bloqueadas. Aeração: 760 (eixo `XXXX`). CCAR: 940 (sem RDS-PP no CÓDIGO). Reg. Vel.: 487 (sem área/painel, local ausente, PMIB fora do Status, M inválido `M9A`/`M18A`, M trocado). Avisos V3: `MEU01` (54), `GQ010` fora da REF (192), pai `QG001` × `GQ001` |

O critério "regenerar no estilo antigo, idêntica" foi trocado por T3 + T5 + T6. Cada aplicação antiga tem estilo próprio, e o que importa é que os campos sejam lidos sem perda e que a Base gere a mesma aplicação por caminhos diferentes. Saídas para conferência: `motor/saida/APLICAÇÃO LMR v1.4 - *.xlsx` (abas VALIDAÇÃO, DIFERENÇAS e RELAÇÕES) e `Fase1_Resumo.xlsx`.

Comandos: `python -X utf8 extrair.py` → `node teste_fase1.js` → `python -X utf8 escreve_xlsx.py`.

### Fase 2 — Workflow B no AMP

**Primeira versão pronta (23/10/2026):** `motor/workflows/LMR_B_regenerar_aplicacao.json`, gerado por `gerar_workflows.js`. Tem 22 nós, todos padrão: Form → Code → 4× Extract from File → Merge → Code (motor) → um Convert to File por aba. Entrada: Status PMIB + aplicação emitida (+ REF-0013 opcional), escopo, subsistema e trechos. O estilo antigo é detectado sozinho. Local, com os dados no formato do Extract from File, dá o mesmo resultado da Fase 1. Ainda não grava no Box (depende do S4).

**Achados no AMP (23/10/2026):**
- O Merge parava esperando a REF-0013 opcional. As leituras passaram a rodar em sequência, com um IF para a REF.
- Os resultados sumiam do canvas porque as execuções manuais não eram guardadas. Agora a saída é um `.zip` baixado pela página final do formulário.
- **O AMP não tem o nó `n8n-nodes-base.compression`.** O `.zip` montado num nó Code travou: o Code do AMP é lento para laço byte a byte. Ele saiu do fluxo. A página final entrega só a APLICAÇÃO, e o workflow já vem configurado para guardar as execuções manuais (`saveManualExecutions`), onde ficam os outros arquivos. A entrega definitiva é pelo Box (Etapa 2).
- **"isolate for this caller is no longer available"**: o AMP descarta o ambiente do Code quando ele passa do limite de memória ou tempo. Causa: 7 nós Code depois do motor, cada um carregando o resultado inteiro. Agora o motor devolve um item por linha, um **Switch** separa as abas pela coluna própria de cada uma, e cada aba vai direto para o seu Convert to File. Nenhum Code roda depois do motor. **Regra de projeto:** um só Code pesado por workflow; ler e gravar arquivos com nós padrão.
- **Motor LMR travado** (versão com Switch): a conta leva 0,5 s localmente; o que trava é o Code **devolver milhares de itens** (7.300 na Água Pura, 17.000 na Reg. Vel.). Agora o motor devolve **um item só**, com cada aba em texto CSV num campo; cada aba passa por três nós nativos: Convert to File (texto → .csv) → Extract from File (CSV → linhas) → Convert to File (linhas → .xlsx). **Regra de projeto:** o Code devolve poucos itens; nós nativos cuidam de linhas em quantidade.

Portar para nós Code. **Critério:** saída idêntica à da Fase 1 em 3 execuções.

### Fase 3 — Workflow C

- C-manual: casos fictícios (substituir em todas as UGs; só em M01–M09; PAI com FILHOs; material fora do catálogo → rejeitado).
- C-automático nível 1: **caso real** Reg. Vel. (Base reconstruída × Status PMIB) → deve sugerir saída de `0795`/`1137`/`1141` e entrada de `1640`/`1641`.
- C-automático nível 2: comparar `&MPB020` rev. 0 × R1A da Água Pura (se você tiver as duas revisões) → conferir as alterações sugeridas.

**Critério:** DIFERENÇAS mostra exatamente as linhas esperadas.

### Fase 4 — Workflow A, parte determinística

Inventário, extração de texto, índice, catálogo inicial. **Critério:** índice da Água Pura contém todas as TAGs da Tabela_Tags emitida.

### Fase 5 — Workflow A, IA

Prompts A6a–d e A7; golden set = Água Pura (documentos + Tabela_Tags emitida); depois Aeração; depois SFC (testa páginas escaneadas).
**Métricas:** cobertura de TAGs 100% (por código); **erro silencioso** (linha sem aviso mas errada) ≤ 2%, tendendo a 0; precisão por campo ≥ 95%; estabilidade em 3 execuções.

### Fase 6 — Piloto em aplicação nova

A → B → revisão → C. **Critério:** duas aplicações novas consecutivas sem erro silencioso e mais rápidas que o processo manual.

### Fase 7 — Entrega para a equipe

Workflows publicados em Project Workspace, guia, versões registradas, pedido de aumento de execuções se necessário.

---

## 9B. Arquitetura simplificada (v1.6) — o que roda no AMP

> Esta seção manda sobre a §9A onde as duas divergem (formato da Base, função R, assinaturas).

### 9B.1 Por que mudou

O workflow B "regenerar" fazia tudo numa execução: lia milhares de linhas emitidas, decompunha, reconstruía, validava, comparava e gravava 7 abas. O Code do n8n roda num *task runner* com tempo e memória limitados, e todo item que entra ou sai dele passa por esse canal. No AMP, cada correção mudou o ponto em que travava (Merge, compactação, *isolate*, Motor), mas a causa era a mesma: **volume demais dentro do Code**. A conta em si leva 0,5 s.

### 9B.2 Princípios

1. **O AMP só faz o que se repete.** A migração de uma aplicação emitida para a Base (função R) acontece uma vez por sistema. Roda fora do AMP (`motor/base/criar_bases.js` + `escreve_base.py`), com o motor já validado.
2. **O Code nunca vê a aplicação inteira.** Um **Loop Over Items** entrega 20 linhas da Base por volta, e o Code expande só essas (maior saída: ~160 KB por volta).
3. **Linhas em massa ficam com nós nativos:** Split Out e Convert to File. Nenhum Code depois do Loop.
4. **Sem Merge, sem nós "reanexa":** cada aba é lida por um Extract from File ligado direto ao formulário.

### 9B.3 Base da Aplicação (formato adotado)

Arquivo `BASE LMR - {sistema}.xlsx`:

| Aba | Conteúdo |
|---|---|
| CABEÇALHO | CAMPO e VALOR do topo da DOCS DE REFERÊNCIA (lista, especificação, subsistema) |
| **BASE** | uma linha por material numa posição: `LINHA, ESCOPO, SUBSISTEMA, FICHA_PMIB, DESCRIÇÃO, ÁREA/PAINEL, RDS-PP, TAG, TAG COM RDS-PP, PAIS, LOCAL, ELEVAÇÃO, EIXO, TRECHOS, QTD POR TRECHO` |
| DOCS DE REFERÊNCIA | como na aplicação |
| RELAÇÕES | pares pai–filho do Status |
| NÃO LIDAS | linhas emitidas que a R não decompôs (vazia nos 5 exemplos) |
| LEIA-ME | como a BASE é expandida |

- `RDS-PP` e `PAIS` com `#ST[XX]=M[XX]` viram o #ST e o M de cada UG. Sem `[XX]`, o valor fica igual em todos os trechos (é assim que erros do emitido, como M trocado, continuam aparecendo na VALIDAÇÃO).
- `PAIS` = `TAG | RDS-PP`, separados por ` ; `.
- Cada linha da BASE gera `QTD POR TRECHO` × `TRECHOS` linhas, na ordem física das UGs.
- **Alterar a aplicação = editar a BASE e rodar o B** (trocar PMIB, QTD, trechos). O C automático (Status novo → sugestões na BASE) vem depois, sobre o mesmo arquivo.

Tamanho: Água Pura 182 linhas na BASE (3.580 na aplicação), Aeração 42 (760), CCAR 1.134 (4.620), Reg. Vel. 327 (6.030), SFC 452 (452).

### 9B.4 Workflow B no AMP (`LMR_B_gerar_aplicacao.json`, 11 nós)

Formulário (só o arquivo da Base) → **Lê CABEÇALHO** e **Lê DOCS DE REFERÊNCIA** (só leitura)
e → **Lê BASE** → **Lote da Base** (Loop, 20) ⇄ **Gera linhas do lote** (Code) → [done] → **Achados** (Split Out) → Arquivo VALIDAÇÃO
e → **Monta aplicação (template)** (Code, `planilha.js`) → **Entrega a aplicação** (página final com a assinatura).

**Saída no formato do template** (`Templates/Template_Aplicação_LMR.xlsx`): o Code do fim monta o `.xlsx` com as peças do próprio template (estilos, larguras, mesclagens), num zip sem compressão. Abas:
- **DOCS DE REFERÊNCIA**: cabeçalho (LISTA DE SOBRESSALENTE, ESPECIFICAÇÃO TÉCNICA / CAPÍTULO, SUBSISTEMA, da aba CABEÇALHO da Base) + uma linha por material da Base; a coluna TAGS é refeita a partir da BASE.
- **DESCRIÇÃO DOCUMENTOS**: igual ao template, para a equipe completar (decisão 25).
- **APLICAÇÃO - LMR**: FICHA_PMIB, CÓDIGO_LMR, TAG_LMR; coluna Status vazia (decisão 17); filtro automático em todas as linhas.

O arquivo sai com 0,3–3 MB (sem compressão); o Excel reduz ao salvar. Conferido localmente: zip íntegro, assinatura recalculada do arquivo igual à do §9B.5 nos 5 sistemas, e o Excel abre a Reg. Vel. sem reparo.

V3 (REF-0013) e V12 (cobertura do Status) saem do B. São checagens de quando a Base é montada (R/A) ou alterada (C).

### 9B.5 Assinaturas de referência (v1.6)

A assinatura passa a ser **nº de linhas + soma dos hashes das linhas**: não depende da ordem nem do tamanho do lote. Por isso os valores mudaram em relação à §9A.2 (a aplicação gerada é a mesma; conferido localmente, linha a linha).

| Aplicação | Assinatura | Bloqueadas |
|---|---|---|
| Água Pura | `3580-2989B1D8` | 0 |
| Aeração Axial | `760-B046B532` | 760 |
| CCAR | `4620-A69AFF1E` | 940 |
| Reg. Vel. | `6030-3B243771` | 487 |
| SFC | `452-7EF6CCD9` | 0 |

### 9B.6 Etapas daqui em diante

1. **B no AMP** com as 5 Bases (critério: as 5 assinaturas acima na página final). **As 5 OK no AMP (23/10/2026).** Próximo: saída no formato do template (§9B.4).
2. **Box**: o B lê a Base da pasta e grava a APLICAÇÃO (depende do S4).
3. **C — Alterações** (pronto localmente, 23/10/2026; falta o AMP). Duas etapas com decisão humana no meio:
   - **C1** `LMR_C1_comparar_status.json`: Base + Status PMIB novo → planilha **ALTERAÇÕES** (Nº, TIPO, APLICAR, PMIB ATUAL, PMIB NOVO, DESCRIÇÃO NOVA, PART NUMBER NOVO, TRECHOS, QTD POR TRECHO, COPIAR POSIÇÕES DE, ONDE NA BASE, MOTIVO). Descrição e part number do Status vêm com APLICAR = SIM; substituir, excluir e incluir vêm vazios para confirmar. Linhas manuais são aceitas.
   - **C2** `LMR_C2_aplicar_alteracoes.json`: Base + ALTERAÇÕES revisada → Base nova `BASE LMR - {sistema} - {data}.xlsx`, com abas HISTÓRICO (aplicada / ignorada / recusada, acumulado) e DIFERENÇAS (linhas da aplicação antes → depois). A Base antiga não muda.
   - Tipos: SUBSTITUIR_MATERIAL, EXCLUIR, INCLUIR (com COPIAR POSIÇÕES DE; sem isso entra só na DOCS), ALTERAR_QTD (por posição), ATUALIZAR_DESCRICAO, ATUALIZAR_PART_NUMBER. TRECHOS restringe (ÍMPARES, PARES, AMD, AMC ou lista) e divide a linha da BASE quando preciso. Excluir um pai avisa os filhos.
   - Caso real Reg. Vel.: C1 acha 0795, 1137, 1141 (saíram) e 1640, 1641 (entraram). Com 0795→1641, excluir 1137 e 1141 e 1640 só na DOCS, o B gera **`5990-62B0A8BD`** (6.030 → 5.990 linhas). Testes em `motor/alteracoes/teste_c.js` (T1–T5).
4. **A**: documentos → BASE, com IA por documento/página em lotes (mesmo princípio do Loop).

### 9B.7 Workflow A no AMP — três etapas (27/10/2026)

Mesmo princípio do B: um documento por volta do Loop, um Code leve por volta e um arquivo intermediário ligando as etapas. O **ÍNDICE** faz para o A o papel que a Base faz para B e C.

| Etapa | Workflow | IA | Entrada → saída | Estado |
|---|---|---|---|---|
| **A1** | `LMR_A1_indice_documentos.json` (10 nós) | não | PDFs + Status PMIB (+ BASE de gabarito, opcional) → `ÍNDICE LMR - {sistema}.xlsx` | pronto localmente; falta o AMP |
| **A2** | leitura por tema (lista de sobressalentes, localização, TAG → subsistema, PAI/FILHO físico) | sim | ÍNDICE (aba PÁGINAS) → LEITURAS, com cada TAG e código conferido no texto da página (V8) | depende do S5/S6 (nó do modelo) |
| **A3** | monta a Base | não | ÍNDICE + LEITURAS + formulário (escopo, subsistema, trechos) → `BASE LMR - {sistema}.xlsx` com aba PENDÊNCIAS | depois do A2 |

**A1 — o que faz** (`motor/indice/indice.js` + `motor/workflows/gerar_a1.js`):
- Formulário (PDFs, vários de uma vez; Status; BASE opcional) → **Separa PDFs** → **Lote de documentos** (Loop, 1 por volta) → **Lê PDF (por página)** (Extract from File, `joinPages = false`) → **Indexa documento** (Code) → [done] → **Monta índice** (Code) → página final com o resumo e o arquivo.
- **Inventário:** código, revisão e tipo pelo nome do arquivo; código do carimbo = o código de documento que aparece em mais páginas. Nome × carimbo diferentes → aviso (caso real: `M00MK10` no nome × `M00MKF10` no carimbo da lista da Água Pura).
- **TAGs (padrão KKS)**: o Extract do n8n (pdfjs) cola sem espaço os textos na mesma altura da página (conferido no código-fonte: `join('')`, quebra de linha só quando muda a altura). Cada sequência é coberta por TAGs (2 letras + 3 números + letra opcional) e rótulos de instrumento de 2–4 letras: `BL315FL314S` → `BL315` + `FL314S`; `PITBP316T` → `BP316T`; modelos (`EJA530E`, `SU7621`) e `DN150` não viram TAG. TAG partida em duas linhas numa lista (`BS` / `160T`) é rejuntada. Componentes de RDS-PP não contam.
- **RDS-PP, elevações** (2 casas), **menções a 50/60 Hz** e **páginas sem texto** (fila da leitura visual) por documento e página.
- **Materiais do Status** achados nos documentos pelo código do material, código CMI/GE ou modelo.
- **Sugestão de TAGs pela lista de sobressalentes** (`&MPB`): cada linha da lista termina no código do material; as TAGs entre o código anterior e o atual são as da linha. É sugestão, e o A2 confirma.
- **Conferência com gabarito** (BASE de um sistema já aplicado, dentro do AMP): cada TAG da BASE como CANDIDATA / SÓ NO TEXTO / CURTA (≤ 3 caracteres, conferir à mão) / NÃO ACHADA; por PMIB, TAGs da BASE × sugeridas (IGUAL / DIFERENTE / SEM SUGESTÃO). Diferença não é necessariamente erro do índice: pode ser divergência entre a lista e a aplicação emitida (ex.: na Água Pura a lista R1A põe uma TAG de transmissor de pressão em outro material).
- **Aba PÁGINAS**: texto de cada página (até 32.000 caracteres por célula). É a entrada do A2, que assim não reabre os PDFs com texto.
- **Testes locais:** T1–T3 com documentos fictícios (TAGs coladas, quebra de linha, PDF protegido, páginas escaneadas, DUPLICADO fora); T4 opcional com os trechos reais recuperados da Água Pura (só local).

**Resultado local com os PDFs reais (27/10/2026)** — texto extraído como o n8n (`motor/indice/extrai_como_n8n.mjs`, pdfjs com a mesma regra de altura), conferido contra a BASE de cada sistema:

| Sistema | Docs / páginas (sem texto) | TAGs da BASE achadas | Materiais do Status achados | PMIBs com TAGs sugeridas = BASE |
|---|---|---|---|---|
| Água Pura | 13 / 313 (0) | 99 de 99 com 4+ caracteres (35 curtas, à mão) | 86 / 87 | 38 / 87 |
| Aeração | 5 / 65 (0) | TAGs numéricas (curtas): conferir à mão | 14 / 14 | — |
| Reg. Vel. | 14 / 927 (44) | 170 / 171 (`F-020` fora do padrão) | 74 / 141 (subitens HYDAC sem documento no exemplo) | 92 / 142 |
| SFC | 11 / 594 (263: diagramas HF escaneados) | 183 / 211 no texto | 40 / 41 | — (lista sem TAG KKS) |

Ajustes que os PDFs reais pediram: o caractere U+FFFF no texto quebrava o `.xlsx` (removido no `planilha.js`); a coluna TAG da lista vem antes do código (Água Pura) ou depois (Reg. Vel.), lida no cabeçalho; a coluna de código da lista é a do Status com códigos únicos no documento (a Reg. Vel. usa o CÓDIGO GE, porque lá o CÓDIGO DO MATERIAL é o modelo); qualquer código com o formato do Status marca o fim de uma linha; modelo com formato de TAG (`VY150`) sai da sugestão.
As diferenças que sobram são de dois tipos: (1) peça sem TAG própria em que a lista cita a TAG do equipamento → é o **pai** (insumo para o A3); (2) divergência real lista × aplicação emitida (ex.: Reg. Vel. `QM151S/161S/171S` × `QM151/161/171` trocados entre dois materiais; Água Pura `QM408G` × `QM408V`).

**Versão Box** (`LMR_A1_indice_box.json`, 18 nós): formulário só com o link da pasta → nó Box *Get folder* (lista até 100 itens) → separa PDFs, Status e BASE pelo nome → baixa cada um com *Download* → mesmo índice → grava o ÍNDICE na pasta (*Upload*) e entrega na página final. Usa o nó Box padrão (`n8n-nodes-base.box`); se o AMP só tiver o GEV BOX, troca-se o tipo no gerador.

**Workflow A completo — documentos → BASE (27/10/2026)** (`LMR_A_gerar_base.json`, 16 nós; código em `motor/leitura/leitura.js` e `motor/workflows/gerar_a.js`). Pedido do usuário: primeiro a função principal (leitura com IA → Base), entrada pelo formulário; Box depois.
- Formulário: PDFs, Status PMIB, ESCOPO, SUBSISTEMA, TRECHOS DO PROJETO (TODAS/ÍMPARES/PARES/LISTA/AMD/AMC) + lista, especificação (opcional), BASE emitida (opcional, gabarito).
- PDFs → Loop (1 por volta) → índice do A1 → **IA: áreas** (1 chamada: nome, RDS-PP, local, elevação, eixo de cada área/painel) → **IA: materiais** (Loop, 5 materiais por chamada: TAGs com área e RDS-PP próprio, pais, área, QTD instalada, frequência) → **Confere leitura** → **Monta Base**.
- Os dois nós de IA são **Basic LLM Chain** (v1.5); o modelo (GEV LLM Model) é ligado à mão. O *AI Agent* do n8n foi a 1ª escolha, mas não aceita o GEV LLM Model no AMP (27/10/2026). Erro da IA não para o fluxo: vira PENDÊNCIA.
- Conferência no código: TAG, pai e RDS-PP devolvidos têm de estar no texto dos documentos (V8); área tem de estar na lista de áreas; eixo e local em lista fechada; RDS-PP de uma UG (`#ST50=M01…`) vira `#ST[XX]=M[XX]…`.
- Frequência na ordem do §3.2: texto do material (IA) → descrição do Status → RDS-PP da área (#ST50/#ST60) → título da lista de sobressalentes ("50 HZ E 60 HZ" → ambas) → PENDÊNCIA.
- Filho documental (Status x.y): uma linha por TAG do pai, citando o pai em PAIS (escrita única, R4). QTD de material sem TAG só com fonte; granel = 1.
- Saída `BASE LMR - {sistema}.xlsx`: BASE, CABEÇALHO, DOCS DE REFERÊNCIA, RELAÇÕES (se houver) + PENDÊNCIAS, LEITURA (o que a IA disse por material, com evidência e fonte da frequência), ÁREAS, RESPOSTAS IA e, com gabarito, CONFERÊNCIA.
- **Testes locais** (PDFs reais): com respostas de uma "IA perfeita" tiradas do gabarito, a Água Pura reproduz **3.560 de 3.580 linhas** da aplicação (os 20 restantes: 2 materiais com "60Hz" na descrição do Status que a aplicação emitida pôs nas 20 UGs). A Reg. Vel. dá 62%, limitada pelo gabarito antigo (áreas sem nome, 487 linhas bloqueadas). Sem IA a Base sai com tudo em PENDÊNCIAS; IA que inventa TAG, área ou RDS-PP, ou devolve JSON quebrado, vira PENDÊNCIA.
- **Limite de requisições do modelo** ("The service is receiving too many requests from you", 1ª execução no AMP, 27/10/2026): lotes de 8 materiais (11 chamadas na Água Pura), nó **Pausa** de 20 s antes de cada chamada, e saída de erro dos nós de IA → **Conta tentativas** → **Desiste?** → **Pausa longa** (60 s) → nova tentativa. Só erro temporário (429, limite, tempo, 502–504) é repetido, até 3 por lote (teto 30); erro permanente segue na hora para PENDÊNCIAS. Testes T5 (recusa 2× por chamada → tudo lido) e T6 (recusa sempre → termina com PENDÊNCIAS).
- **1ª execução real no AMP (27/10/2026, Água Pura, modelo azure-gpt-5-4-mini):** 86/87 materiais lidos, 5 áreas, 162 pendências, 0 de 3.580 linhas iguais (campos iguais: TAGs 53, pais 54, RDS-PP 0, elevação 6, eixo 0, trechos 83 de 87). Causas e correções:
  - o pedido listava as áreas como "NOME (RDS-PP)" e o modelo copiou o RDS-PP no nome → 72 "área fora da lista". Agora a lista mostra só o nome, numerado, e a conferência aceita o nome com RDS-PP, número ou aspas;
  - o **eixo não está nos documentos** (a coluna EIXO do workstatement vem vazia) → passou a ser campo do formulário ("Eixo do sistema"); "Elevação padrão" opcional preenche área sem elevação;
  - o modelo criou áreas por bomba ("CONJ. BOMBA 1") com o código do P&ID como RDS-PP → regras novas: área = conjunto com RDS-PP próprio, 2 a 8 por sistema, RDS-PP sem "&";
  - nome de área: sigla entre parênteses vira o nome ("PAINEL DE CONTROLE (PWB)" → PWB) e o nome do sistema sai do fim ("SKID DE ÁGUA PURA" → SKID); SPN e SCP não aparecem nos documentos (convenção da equipe, ficam para a revisão);
  - QTD instalada que cita só a lista de sobressalentes é recusada (é reposição).
  - Reprocessando as mesmas respostas com o código novo (`motor/leitura/reprocessa.js`): 550 linhas iguais, 46 pendências, eixo 73/87. As diferenças de TAG que sobram são, em boa parte, as divergências lista R1A × aplicação emitida já vistas no A1.
- Conferência ganhou "linhas iguais sem contar o nome da área" (o nome entra no CÓDIGO LMR e é convenção da equipe).
- **Elevação por TAG, por material e por área (27/10/2026, pedido do usuário: "a água pura e vários sistemas têm mais de uma elevação").** Ordem: elevação da TAG → do material → da área → PENDÊNCIA (uma por área, com o nº de linhas a preencher). Toda elevação devolvida pela IA, inclusive a da área, tem de estar escrita no texto dos documentos; senão é recusada. O campo "Elevação padrão" saiu (preencheria errado sem avisar). Achados: Água Pura tem 98,50 e 104,20 escritos no P&ID (a IA perfeita mantém 99,4%); na Reg. Vel. nenhuma elevação de material está escrita (98,50 é conhecimento da equipe); na Aeração as elevações só existem no desenho (imagem). A elevação mais próxima no texto do P&ID não serve como pista (42/168). Eixo: o do documento ("eixo B/C" → BC) e, onde faltar, o do formulário. Frequência: o formulário pergunta antes ("Frequência quando o documento não disser": pendência / ambas / 50 / 60).
- **2ª execução real (27/10/2026, Claude Haiku 4.5):** 87/87 lidos, 6 áreas (SKID UZ010-UZ001, PWB, TANQUE EXPANSÃO CM050 corretos; CN010 chamado de TUBULAÇÃO), 124 pendências; campos iguais: TAGs 61, pais 72, RDS-PP 30, elevação 2, eixo 71, trechos 85. O Haiku deixou a elevação das áreas vazia: o P&ID tem "EL 98.500", mas nada no texto liga a elevação ao skid. Correções: QTD só conferida em material sem TAG (81 pendências a menos); área por reserva (área do material; área pelo documento onde a TAG aparece, ex.: 72.x no diagrama UH010-UH001&EFF010 → PWB); TAG em lista ("72.1; 72.2") ou abreviada ("72.1...72.23") separada no código; frequência do kit = a do equipamento.
- **3ª execução real (28/10/2026, Gemini Flash 3, versão anterior do workflow):** 87/87 lidos, 6 áreas, 62 pendências; 820/3.580 linhas iguais já sem revisão (o Haiku teve 0), porque o Gemini ligou a elevação 98,50 ao SKID (MFB030 p.1) e nomeou "SISTEMA DE PRESSURIZAÇÃO POR NITROGÊNIO" e "SISTEMA DE COMPENSAÇÃO DE PRESSÃO" (as siglas SPN e SCP da equipe). Não deu RDS-PP ao SCP (tanque CM050). Reprocessado com o código atual + revisão simulada da aba ÁREAS: 1.240 linhas iguais (Haiku 1.160); campos: elevação 77 (Haiku 83), eixo 80 (85), RDS-PP 67 (67), pais 66 (72), TAGs 65 (63), trechos 85 (85). Os erros que sobram são quase os mesmos nos dois modelos (regra/convenção, não modelo):
  - kits: as aplicações emitidas nunca usam PAIS para kit (Reg. Vel. 93/99 e Aeração 9/9 levam a TAG do equipamento; Água Pura 14/14 sem TAG e sem pai, só a área). A regra §3.7 R3 (kit cita o pai) diverge de todas; decisão pendente do usuário.
  - frequência: `hzDaDescricao` lia "50/60 Hz" como 60 (corrigido: AMBAS); frequência pelo modelo citado no Status ("Kit … F1015V-717" ← "Bomba 50Hz F1015V-717"); a leitura continua valendo primeiro (decisão 21), mas quando contradiz o Status vira PENDÊNCIA de FREQUÊNCIA (os dois modelos disseram AMBAS para os kits das bombas).
- **Workflow A v2 (28/10/2026, reestruturação com autonomia dada pelo usuário).** `LMR_A_gerar_base.json`, 26 nós ("LMR - A Gerar Base (IA) v2"). Princípio: o que o código acha sozinho não passa pela IA; a IA recebe mais contexto e escolhe dentro do que foi achado; as áreas são conferidas antes dos materiais.
  - Diagnóstico da v1: (1) a IA via ±150 caracteres em volta de cada TAG e não enxergava a estrutura das listas de material (item "1 … #ST00=…CN010-CN001&MTB010 - SISTEMA DE PRESSURIZAÇÃO POR NITROGÊNIO" com subitens 1.x = área SPN); (2) TAGs que o código pode achar (lista de materiais do painel) passavam pela IA e voltavam erradas (72.23 × 72.24, KA4); (3) convenção de kit fixa (PAI) diferente de todas as aplicações emitidas; (4) áreas só corrigíveis depois dos materiais (o erro de área se espalhava); (5) JSON quebrado perdia o lote.
  - Evidências sem IA (`leitura.js`): `tagsDoPainel` (o modelo do Status vem colado às TAGs instaladas na lista de materiais do painel: "5ST301252.1;72.1...72.24"; uma leitura só → vale; variantes → fica com a IA; PN/CL/DN/IP descartados), `ehKit`, `titulosDeDocumentos` (código - título de cada conjunto), `chaveEquip` (CN010, UH010…: liga documento e área). Medido na Água Pura: 21 materiais de painel com TAG certa sem IA.
  - Regras na montagem: TAGs da lista do painel substituem as lidas e a área passa a ser a do documento do painel; kit pela convenção do formulário (*Levam a TAG do equipamento* | *Sem TAG, 1 por trecho, na área do equipamento* | *Citam o equipamento como PAI*; Água Pura = sem TAG; Reg. Vel. e Aeração = TAG); "AMBAS" lido pela IA cede a 50/60 Hz do Status (descrição ou modelo citado); "50/60 Hz" na descrição = AMBAS. Coluna REGRAS na aba LEITURA mostra cada ajuste.
  - Prompt de materiais: TAGs já achadas (lista de sobressalentes e lista do painel), trechos de ±400–450 caracteres priorizados por tipo de documento (MPA, APA, MTC, MTB, EFF… antes de MFB/MLU; a lista de sobressalentes entra só pela linha do material), "documentos do conjunto" em cada área, regra de subconjunto, campo `kit`, `pais` só para peça entre equipamentos. Lotes de até 8 materiais limitados a 32 mil caracteres. Prompt de áreas ganhou "DOCUMENTOS DE CONJUNTOS CITADOS COM TÍTULO" (ex.: CM050 - TANQUE DE EXPANSÃO).
  - Página "Confira as áreas" (nó Form, operação página, campos por JSON montados pelo Code "Lê áreas"): 3 campos por área (nome — REMOVER tira; RDS-PP; elevação), em branco = valor lido; campo "Áreas que faltam" (NOME; RDS-PP; ELEVAÇÃO por linha). Ligada pelo campo do formulário "Conferir as áreas antes de ler os materiais" (Sim/Não). Ainda não testada no AMP (mesmo nó da página final, que funciona).
  - Robustez: JSON quebrado → recupera os objetos de material inteiros (T12: 50/87 de uma resposta cortada a 60%); teto de tentativas 60.
  - Medido com as respostas reais da v1 (prompt antigo) + regras novas + revisão simulada das áreas: Gemini 1.240 → **2.300**/3.580 linhas iguais (trechos 87, eixo 87, elevação 84, pais 82, RDS-PP 77, TAGs 73); Haiku 1.160 → 1.680. IA perfeita: 3.580/3.580 (100%; antes 3.560). Testes T1–T12 OK. O que sobra depende do prompt novo (área de nitrogênio e tanque) ou é divergência dos documentos (CN010 × CN401/CN402; QM408G × QM408V; BP316T; QN203R).
- **Workflow A v3 (28/10/2026): leitura em etapas pequenas e generalização** (pedido do usuário: "vai ser usado em vários sistemas" e sugestão de quebrar a IA em vários processos porque os modelos disponíveis são fracos — adotada). Mesmo arquivo `LMR_A_gerar_base.json` (26 nós; nós da leitura renomeados para *Prepara leituras*, *Lote de leituras*, *IA: leituras*).
  - Etapas: (1) áreas + página "Confira as áreas" (agora com **trechos por área**); (2) **confirmação das TAGs da lista** — a IA vê o trecho da lista em volta do código do material e as TAGs candidatas e escolhe quais são do material e se a TAG é do próprio material ou do equipamento onde ele é montado (só escolhe entre candidatas), 20 por chamada; (3) **área das TAGs** — TAGs agrupadas pela página do documento mais confiável onde aparecem, resposta = número da área (lista quando a TAG está em mais de uma área), até 40 por chamada; (4) **leitura completa** só dos materiais sem TAG achada pelo código, 5 por chamada. Um só Loop com os três tipos de tarefa (independentes entre si).
  - Generalização (medida nos 4 sistemas com textos: Água Pura, Reg. Vel., Aeração, SFC — `node leitura/teste_a.js`): prompts sem exemplos do sistema de teste (sem "2 a 8 áreas", sem SKID/nitrogênio); TAG da lista do painel só vale confirmada em outra página; TAG da lista que não aparece em outro documento → troca pela única de mesmo código com outra letra final (QM408G → QM408V) ou PENDÊNCIA; convenção de **peças** no formulário (TAG do equipamento | equipamento como PAI — Reg. Vel. usa PAI); **mesma TAG em mais de uma área** (conjuntos gêmeos, ex.: SFC HF-01/HF-02); **RDS-PP por grupo de frequência** (#ST50=M50…/#ST60=M60… → `#ST[F]=M[F]`, uma linha por frequência: Aeração); trechos sem frequência (AMD/AMC) não zeram mais o material (`lmr.js trechosDoMaterial`); nome de área digitado pelo usuário mantém maiúsculas/minúsculas.
  - "IA perfeita" + página de áreas simulada (linhas iguais ao gabarito / sem contar o nome da área): Água Pura 3.460/3.580 em 10 chamadas (v2: 13 maiores); Reg. Vel. 3.550/6.030 (3.744); Aeração 160/760 (RDS-PP e trechos 14/14; a elevação por TAG 107,61/105,40/88,60 não está no texto → PENDÊNCIA); SFC 0/452 (452: só a grafia do nome "Cubículo HF-01"). O que sobra é divergência lista R1A × aplicação emitida (CN010, QN406R, BP316T, QN203R, GP231/MA231, KF042) ou dado fora do texto. Assinaturas do B/C inalteradas.
- **Workflow "LMR - A Revisar áreas"** (`LMR_A_revisar_areas.json`, 13 nós, sem IA): a BASE do A sai com a aba ÁREAS (ÁREA/PAINEL, NOVO NOME, RDS-PP, LOCAL, ELEVAÇÃO, EIXO, LINHAS NA BASE e os valores LIDOS); o usuário preenche e envia de volta; o código aplica nas linhas (só troca o que veio da área: elevação lida por TAG fica), atualiza os PAIS que citam o RDS-PP antigo, junta áreas com o mesmo NOVO NOME e refaz as pendências de elevação. Medido com as respostas reais do Haiku + revisão de 6 linhas na aba ÁREAS: 1.160 de 3.580 linhas iguais ao gabarito; campos iguais: elevação 83, eixo 85, trechos 85, pais 72, RDS-PP 67, TAGs 63 (de 87). O que sobra: divergências lista R1A × aplicação emitida, kits que agora citam o pai (regra §3.7 R3; a aplicação emitida não cita) e itens do nitrogênio/tanque que a IA pôs no SKID (limite de ler desenho por texto).
- Limite anterior (resolvido acima): uma área tinha uma elevação só.

### 9B.8 Leitura pelo agente do AMP — AG1 e AG2 (28/10/2026)

Os modelos do n8n do AMP (GPT-5.4-mini, Haiku 4.5, Gemini Flash 3) não leram bem nem em etapas pequenas. Decisão do
usuário: a leitura passa para um **agente do AMP** (modelos mais fortes: Claude Sonnet 5.5, Sonnet 5, Sonnet 4.6, GPT-6
Luna, GPT-5.4, Gemini 3.5 / 3.1 Flash-Lite, Gemini 3 Flash). O agente **não pode ser chamado de um workflow**; o
usuário anexa os PDFs no chat (sem Box por enquanto) e o agente devolve arquivos (.json). Plano:
`docs/superpowers/plans/2026-10-28-agente-lmr.md`.

- **Fluxo:** `AG1 Preparar etapas` (n8n, sem IA) → 4 etapas no agente, **um chat por etapa** → `AG2 Montar Base` (n8n, sem IA) → B.
- **Etapas** (página a página, pelo tipo do documento e por sinais genéricos do texto; o usuário pode forçar um documento
  no campo "Etapa de documentos"): 1 Áreas (MLU; páginas com elevação + planta/corte/arranjo/vista) · 2 Conjuntos (MPA, APA,
  MTB, MTC, EFF, EPA, MLD; páginas com "lista de material") · 3 Equipamentos (todo o resto: MFB, MFE, MDB, ACC, sem tipo)
  · 4 Materiais (MPB + JSONs das etapas 1–3; a mensagem lista os materiais do Status em partes de 50).
- **ROTEIRO LMR - {sistema}.xlsx** (saída do AG1; o formulário só entrega 1 arquivo): ROTEIRO (passo a passo, anexos e
  páginas de cada etapa, páginas sem texto), ETAPA 1…4 (mensagem pronta: o usuário copia a coluna A e cola no chat),
  CONTROLE (gabarito das perguntas: fica com o usuário), CONFIG, STATUS PMIB e ÍNDICE (texto das páginas em colunas de
  30 mil caracteres) — o AG2 lê de volta, sem reenviar PDFs nem Status.
- **Perguntas de controle:** "arquivo X, página N: quais destes códigos estão escritos?" — 3 TAGs da página + 2 do mesmo
  documento que não estão nela; páginas no início, meio e fim (mais em documento grande, até 5 por documento por etapa).
  Mostram se o agente leu o documento inteiro (o PDF de 571 páginas da Reg. Vel.). Erro → PENDÊNCIA CONTROLE e repetir a etapa daquele trecho.
- **AG2:** junta os JSONs (partes, cercas de código, texto em volta, JSON quebrado), confere o controle e o inventário de
  páginas, aplica a troca de letra final (QM408G → QM408V), completa área/RDS próprio/frequência das TAGs pelas etapas 2–3,
  convenção de peças e kits, e usa `LEITURA.confereMateriais` + `LEITURA.montaBase`. **Valor lido pelo agente que não está
  no texto extraído** (desenho, página escaneada): fica, com PENDÊNCIA **CONFERIR** e a página citada (a IA do n8n continua
  com a regra antiga: sai). TAG fora do texto → PENDÊNCIA (V8); QTD com fonte na lista de sobressalentes → recusada;
  material sem resposta ou `encontrado: false` → PENDÊNCIA. Abas novas: CONTROLE DO AGENTE, RESPOSTAS DO AGENTE.
- **Agente:** `motor/agente/system_prompt.md` (system prompt) e Knowledge base `regras_lmr.md` + `formatos_json.md` (sem
  dados reais). Modelo sugerido para o 1º teste: Claude Sonnet 5.5; depois Sonnet 4.6 com temperatura 0 para comparar.
- **Testes** (`node agente/teste_agente.js`, `node workflows/gerar_agente.js`): "agente perfeito" (respostas do gabarito) →
  Água Pura **3.580/3.580**; Reg. Vel. **3.740/6.030** (3.943 sem o nome da área; v3 com IA perfeita: 3.550); Aeração **480/760**
  (v3: 160); SFC 452/452 sem o nome da área. Controle 100% nos 4. Casos ruins conferidos (controle errado, TAG e elevação
  inventadas, material faltando, etapa não enviada, QTD de reposição, arquivo sem JSON). Ida e volta pelo .xlsx (openpyxl)
  com Água Pura: 3.580/3.580. B e C com assinaturas inalteradas; `teste_a.js`, `gerar_a.js` T1–T12 e fase 1 OK.

### 9B.9 Agente do AMP dentro do workflow — "LMR - A Gerar Base (agente AMP)" (28/10/2026)

Fato novo (usuário): o agente do AMP pode ser ligado no workflow — nó `CUSTOM.amp` v1 (`LMR/Nó agente AMP.txt`).
Campos: Credential, Custom Agent, Prompt (user message), Files, Session ID; opções qualifier e timeout.

- **Sonda S9** (`LMR_S9_sonda_amp_agent.json`, `LMR/Resultado Sonda.txt`): o Prompt padrão lê `$json.chatInput`; a
  resposta vem em `output` (+ `sessionId`, `files`); itens do mesmo nó dividiram a mesma sessão; com PDF em Files o agente
  viu só o NOME do arquivo.
- **Sonda S10** (`LMR_S10_sonda2_amp_agent.json`, `LMR/Resultado Sonda 2.txt`): PDF em Files + pedido para abrir →
  erro `424 / 500 from runtime`; na mesma sessão o arquivo não existe; **texto da página dentro do Prompt funciona**
  (Sonnet 5.5 devolveu 15 TAGs certas do P&ID e disse que só leu texto). O Session ID exportado tinha uma crase sobrando.
- **Decisão:** o agente recebe o **texto das páginas** na mensagem. Valor fora do texto sai (regra estrita, como a IA do
  n8n); o que só está no desenho entra pela página "Confira as áreas". Files fica para depois (novo teste se o AMP corrigir).
- **Workflow** `LMR_A_agente_amp.json` (44 nós, gerado por `workflows/gerar_agente.js`): Formulário → índice A1 →
  E1 → E2+E3 (com as áreas da E1) → **Confira as áreas** (depois das etapas 2/3, uma vez; serve também para sistema sem
  layout, como a Aeração) → E4 (lotes de 25 materiais, com as páginas da lista desses materiais, as áreas e a tabela de
  TAGs das etapas 2/3) → Monta Base. Cada chamada: até 80 mil caracteres, só páginas úteis (com TAG, RDS-PP, elevação ou
  código de material), sessão própria, pausa de 10 s; erro temporário (limite, tempo, 424/500) → 60 s e nova tentativa,
  até 3; sem resposta → PENDÊNCIA CHAMADA. Abas novas: CHAMADAS DO AGENTE.
- **Volume** (chamadas por sistema): Água Pura 14 (705 mil caracteres), Reg. Vel. 17 (855 mil), Aeração 4, SFC 10.
- **Testes** (`agente/teste_workflow.js`, `workflows/gerar_agente.js`): agente perfeito só texto + página de áreas →
  Água Pura 3.580/3.580; Reg. Vel. 3.740/6.030; Aeração 160/760 (elevação por TAG só no desenho); SFC 452/452 sem nome da
  área. Simulação nó a nó com recusa 424 repetida: 3.580/3.580. AG1/AG2 ficam como caminho manual.

**Critério de aceite do A1 no AMP (Água Pura, com a BASE como gabarito):** todas as TAGs da BASE com 4+ caracteres achadas (CANDIDATA ou SÓ NO TEXTO); os 87 materiais do Status achados; o código do carimbo identificado em todos os documentos com código. Depois, Aeração (5 PDFs) e SFC (páginas escaneadas e PDFs de 67–78 MB, que testam o limite do formulário).

---

## 9A. Roteiro de validação e construção do fluxo completo (v1.5)

> Esta seção manda sobre a ordem das Fases 2 a 7 do §9. Os critérios de lá continuam valendo.

### 9A.1 O que é o "fluxo completo"

Quatro funções. Todas leem e gravam a mesma **Base da Aplicação** (§5.2), que fica no Box, na pasta do escopo:

| Função | Entrada | Saída | IA |
|---|---|---|---|
| **R — Reconstruir** | aplicação já emitida + Status PMIB | Base v0 | não |
| **A — Nova aplicação** | documentos do escopo + Status PMIB + formulário | Base v1 (+ perguntas de frequência, S8) | sim |
| **B — Gerar** | Base vN | APLICAÇÃO LMR + VALIDAÇÃO + DOCS DE REFERÊNCIA | não |
| **C — Alterar** | Base vN + ALTERAÇÕES (manual) ou Status PMIB novo | Base vN+1 → B → DIFERENÇAS + HISTÓRICO | não |

O `LMR_B_regenerar_aplicacao.json` de hoje é **R + B juntos e sem Box**. Ele vira os dois workflows separados na Etapa 2.

**Uma entrada só para a equipe:** um formulário publicado *LMR* com a opção (Nova / Gerar / Alterar / Reconstruir) e um Switch para o ramo certo. Assim gasta 1 execução publicada por uso, não 2 ou 3. Se o S7 mostrar que sub-workflow conta como execução à parte, os ramos ficam todos num workflow só.

**Formato da Base (contrato entre as funções):** um `.xlsx` com as abas PARÂMETROS (escopo, subsistema, trechos, lista, revisões), CATÁLOGO, RELAÇÕES, APLICAÇÕES (linhas-modelo), DOCUMENTOS e HISTÓRICO. Fica em `{pasta do escopo}/BASE/Base_v{NN}.xlsx`. Nenhuma versão é sobrescrita.

### 9A.2 Como se valida cada etapa

1. **Local primeiro:** toda função é escrita no `lmr.js` e testada aqui contra os 5 exemplos (`teste_fase1.js` e testes novos). Os workflows `.json` são gerados por script a partir do mesmo `lmr.js`, nunca editados à mão. Assim o AMP e a máquina local rodam o mesmo código.
2. **Assinatura AMP × local:** o resumo de cada execução traz uma `assinatura` (nº de linhas + código de 8 caracteres). Se for igual à tabela abaixo, o AMP gerou exatamente o mesmo que a máquina local, linha por linha.
3. **Execução manual** em todo teste. Publica só na Etapa 6 (piloto).
4. **Critério de aceite** por etapa. A etapa seguinte só começa com o aceite da anterior.

**Assinaturas de referência**, workflow B regenerar, com escopo e subsistema digitados como abaixo:

| Aplicação | Escopo | Subsistema | Trechos | Assinatura | Bloqueadas |
|---|---|---|---|---|---|
| Água Pura | UG | ÁGUA PURA | TODAS | `3580-EEBDE8BD` | 0 |
| Aeração Axial | UG | AERAÇÃO AXIAL DA TURBINA | TODAS | `760-DA852BC5` | 760 |
| CCAR | RV | PARTE DIGITAL | TODAS | `4620-01F53EA9` | 940 |
| Reg. Vel. | RV | PARTE MECÂNICA | TODAS | `6030-F75996FA` | 487 |
| SFC | UG | SFC | LISTA `AMD-03, AMC-02` | `452-288AF7B2` | 0 |

A assinatura não depende da REF-0013. A REF muda só os avisos V3: 464 na Reg. Vel., 0 nas outras.

### 9A.3 Etapas

| Etapa | Entrega | Quem faz | Critério de aceite | Execuções publicadas |
|---|---|---|---|---|
| **1. Plataforma** | B regenerar rodando no AMP; S4–S8 respondidos | você executa; eu corrijo | as 5 assinaturas do §9A.2 iguais no AMP; tabela do guia preenchida | 0–2 (só S7) |
| **2. Base + R + B com Box** | formato da Base; workflow R (emitida → Base v0 no Box); workflow B (Base → aplicação no Box) | eu monto; você executa | B(R(aplicação)) com a mesma assinatura da Etapa 1, nas 5; arquivos aparecem na pasta do escopo | 0 |
| **3. C — Alterações** | planilha ALTERAÇÕES; C manual e C pelo Status novo; DIFERENÇAS; HISTÓRICO | eu monto; você executa | casos fictícios (substituir em todas as UGs, só em ímpares, pai com filhos, material fora do catálogo → rejeitado); caso real Reg. Vel. (`0795`→`1641`); a DIFERENÇAS mostra só as linhas esperadas | 0 |
| **4. A — parte sem IA** | inventário dos documentos da pasta; texto por página; índice de TAGs, RDS-PP e elevações; catálogo | eu monto; você executa | índice da Água Pura contém todas as TAGs da Tabela_Tags emitida (3.580 individuais) | 0 |
| **5. A — parte com IA** | prompts A6a–e; leitura visual das páginas escaneadas; pergunta de frequência (S8); pai/filho físico | eu escrevo os prompts; você executa 3× cada | Água Pura → Aeração → SFC: cobertura de TAGs 100%; erro silencioso ≤ 2%; 3 execuções estáveis | 0 |
| **6. Piloto** | formulário único publicado; uma aplicação **nova** de ponta a ponta (A → B → revisão → C) | você e um revisor | duas aplicações novas seguidas sem erro silencioso e mais rápidas que o processo manual | ~10–15 |
| **7. Entrega** | Project Workspace, guia da equipe, versões registradas, pedido de mais execuções | eu documento; você publica | outra pessoa da equipe roda uma aplicação só com o guia | conforme uso |

Etapas 2 e 3 podem começar enquanto a 1 termina S4–S8. Elas só precisam do B regenerar funcionando e do S4 (Box). A Etapa 5 depende de S5, S6 e S8.

### 9A.4 Regras de trabalho

- **Versão única do código:** `motor/lmr.js` é a fonte. Toda mudança passa por `teste_fase1.js`, depois os `.json` são gerados de novo e reimportados. O nome do workflow leva a data da versão.
- **Erro no AMP:** você me manda o nó vermelho, a mensagem e a contagem de itens dos nós anteriores. Eu reproduzo localmente, corrijo e reenvio o `.json`.
- **Dados reais** só dentro do AMP e do Box. Aqui na conversa, só resumos, assinaturas e mensagens de erro.
- **Revisão humana** só no fim (decisão registrada). Tudo o que o código não resolve vai para a VALIDAÇÃO e nunca é preenchido por suposição.

### 9A.5 Decisões que destravam as próximas etapas

1. **Formato da Base** (§9A.1): `.xlsx` no Box, uma versão por arquivo. Serve?
2. **Pasta de teste no Box** para as Etapas 2–3, separada das pastas reais dos escopos.
3. **Aplicação nova para o piloto** (Etapa 6): qual escopo, com os documentos já no Box.
4. **Duas revisões da mesma lista de sobressalentes** (`&MPB020` rev. 0 e R1A), para o C pelo PDF (nível 2).
5. **Revisor do piloto:** quem confere a aplicação final além de você.

---

## 10. Riscos e alternativas

| Risco | Plano B |
|---|---|
| Extract from File não separa páginas | texto inteiro com marcadores de página via Code |
| PDFs grandes (67–78 MB) excedem limite | dividir o PDF antes; ou só páginas relevantes |
| Páginas escaneadas leem mal | confiança `visual` → sempre na VALIDAÇÃO |
| Mascaramento altera códigos | IA devolve posição; valor vem do índice de texto |
| Convert to File não preserva template | colunas na ordem do template; colar (1 passo documentado) |
| REF-0013 muda de revisão | arquivo da REF no Box é parâmetro; relatório indica revisão usada |
| Limite de 50 execuções/mês | testes manuais; pedir aumento |
| Aplicação emitida não reconstrói 100% | linhas não decompostas → VALIDAÇÃO; alteração só nas que reconstroem |

---

## 11. Uso pela equipe (rascunho)

**Nova aplicação:** formulário *LMR — Nova aplicação* → recebe APLICAÇÃO + VALIDAÇÃO + BASE → revisa começando pela VALIDAÇÃO → erros vão para ALTERAÇÕES → *LMR — Alteração* → até a VALIDAÇÃO ficar limpa → arquiva no Box.

**Nova revisão de lista no Aconex:** *LMR — Alteração* com a revisão anterior e a nova da lista → confere as alterações sugeridas → confirma → recebe nova versão + DIFERENÇAS.

**Sempre conferir à mão:** VALIDAÇÃO; DIFERENÇAS; amostra de linhas sem aviso; DESCRIÇÃO LMR de materiais novos.

---

## 12. Decisões

### Registradas (22/10/2026)

| # | Tema | Decisão |
|---|---|---|
| 1 | Substituição | linha antiga some; a nova ocupa o lugar |
| 2 | Formato | padrão único para todas as aplicações |
| 3 | Localização | vem do WS, títulos/carimbos e desenhos |
| 4 | RDS-PP fora da REF | intencionais: códigos de documento; `{RDS}{TAG}` no TAG LMR quando o material tem RDS-PP próprio; FILHO sem RDS-PP usa o do pai na localização |
| 5 | Origem das alterações | revisão de lista no Aconex |
| 6 | Documentos | pasta de exemplos com 3 sistemas |
| 7 | Origem do PMIB | planilha Status PMIB de cada lista (§3.6) |
| 8 | Padrão | trecho `U-{nn}` + `AMD-01`…`04`, `AMC-01`…`03`; eixos `AB`, `BC`, `CD`, `MB`, `JB`, `JD`; elevação com 2 casas; RDS-PP+TAG concatenado nos 3 casos do §3.2 |
| 9 | Quantidade | instalada na usina (documentos de projeto), nunca a de reposição da lista de sobressalentes |
| 10 | PAI/FILHO | duas categorias, documental (subitens `x.y` do Status) e física (instalado dentro de outro, reconhecido no desenho), escritas do mesmo jeito (§3.7) |
| 11 | Vários pais | filho aplicado uma vez sob cada pai em que aparece |
| 12 | Agrupador | conjunto sem PMIB (motobomba 4–7) não é pai nem gera linha |
| 13 | Instâncias | uma vez por TAG do pai; o agrupamento por UG da Água Pura foi atalho para reduzir erros manuais e sai |

### Registradas (23/10/2026)

| # | Tema | Decisão |
|---|---|---|
| 14 | Formato | CÓDIGO e TAG LMR conforme §3.3; `(REF)` sai |
| 15 | Escopo e subsistema | entrada do formulário; área/painel vem dos documentos |
| 16 | Local | lista fechada (Data Table); `CASA DE FORÇA - UNIDADE GERADORA` = `CASA DE FORÇA` |
| 17 | Coluna `Status` | não é usada |
| 18 | Quantidade | QTD instalada define a repetição por trecho; linhas idênticas; granel = 1 linha |
| 19 | Descrição | copiada do Status PMIB, limpeza mínima |
| 20 | Trechos do projeto | parâmetro do formulário: todas, ímpares, pares, lista de UGs, AMD ou AMC. Cada projeto tem o seu. Ímpares e pares contam pela **posição física**: U-09A é a 10ª UG, U-10 a 11ª e U-18A a 20ª |
| 21 | Frequência e expansão | aplicação = trechos do projeto ∩ frequência. Frequência: documento → RDS-PP → busca nos documentos → pergunta ao usuário só se o projeto mistura 50 e 60 Hz. Fora de UG segue o RDS-PP do documento |
| 22 | Físico sem evidência | entra como item individual e vai para a VALIDAÇÃO |
| 23 | Pai sem TAG / local do filho | o filho usa a localização do pai |
| 24 | DOCS DE REFERÊNCIA | `PART NUMBER` = código do material do Status; documento principal = P&ID, fluxograma, diagrama funcional, arranjo geral ou layout; filho usa o do pai/equipamento; sem nenhum → VALIDAÇÃO |
| 25 | DESCRIÇÃO DOCUMENTOS | o fluxo não preenche; vocês completam no fim |
| 26 | Status PMIB | a atualização fica fora do fluxo (sistema próprio) |
| 27 | Fase 0 / pastas | testes como workflows `.json`; cada aplicação lê e grava na pasta do seu escopo no Box |
| 28 | TAG sem RDS-PP próprio | `{ESCOPO} - {TAG} - {DESCRIÇÃO}` (ex.: `SLOT1`, `GM11`, `028`) |
| 29 | Descrição | copiada do Status PMIB mesmo quando difere da redação feita à mão dos exemplos |
| 30 | Code no AMP | aceita JavaScript e Python (informado pelo usuário). O motor fica em JS (`lmr.js`); Python entra se o S1/S3 mostrar bibliotecas úteis (ex.: openpyxl) |
| 31 | Arquitetura (v1.6) | o AMP só expande a Base, em lotes; a R roda fora do AMP, uma vez por sistema; Base = `.xlsx` com a aba BASE (§9B.3); alterações manuais = editar a BASE e rodar o B |
| — | Revisão | no fim da aplicação, correções voltam pelo fluxo |
| — | Acesso | exemplos, templates e REF-0013 podem ser analisados |

### Adotados por padrão (mudam se você indicar)

- Elevação com 3 casas no documento: arredondamento comercial para 2 casas, com aviso.
- Filho que une dois pais: o código sugere o par pelo número da TAG (`MA151`/`GP151`) e o agente confirma no desenho (§3.7 R7).
- `STATUS = DUPLICADO` no Status PMIB fica fora do catálogo.

### Pendentes (não travam a Fase 1)

1. Duas revisões da mesma lista (ex.: `&MPB020` rev. 0 e R1A) para testar o C-automático nível 2.
2. Lista fechada de locais: começo pelos locais dos exemplos, vocês completam.
3. Tabela de siglas de escopo (`RV`, `UG`, `SFC`...) para o formulário.

# Aplicação LMR: o que é e como fazer, passo a passo

Guia descritivo para quem vai montar ou conferir uma Aplicação LMR, à mão ou com a automação deste
repositório. As regras detalhadas e o histórico de cada decisão estão no [`PLANO.md`](../PLANO.md);
aqui o foco é o caminho do começo ao fim.

---

## 1. Qual a função da Aplicação LMR

Um material sobressalente cadastrado (uma **ficha PMIB**) diz *o que* é o material: descrição, part
number, fabricante. Ele não diz **onde esse material está instalado na usina**. A Aplicação LMR é a
planilha que faz essa ligação.

Ela traz **uma linha para cada unidade instalada do material, em cada trecho onde ele existe**. Cada
linha responde a três perguntas:

| Coluna | Pergunta | Exemplo (Banco de Baterias) |
|---|---|---|
| `FICHA_PMIB` | Qual material? | `4500063671.0456` |
| `CÓDIGO_LMR` | Onde ele está? Sistema, equipamento, RDS-PP e localização física | `CC - BATERIAS E CARREGADORES - HBC - RDS-PP: #ST00=B03BPA10GB010-GB901&ETB010 - CASA DE FORÇA - ELEV. 115,00 - EIXO CD - TRECHO U-01` |
| `TAG_LMR` | Qual é a peça nesse lugar? TAG, descrição e part number | `CC - Termômetro Infravermelho para baterias (G50-047-10)` |

Se um disjuntor existe 1 vez em cada um de 10 carregadores, ele aparece em 10 linhas, uma por trecho.
Se aparece 3 vezes no mesmo painel, a linha se repete 3 vezes naquele trecho. **A quantidade da
aplicação é sempre a quantidade instalada, nunca a de reposição** que consta na lista de
sobressalentes.

Com a aplicação pronta, dá para saber em quais equipamentos e unidades cada material de estoque é
usado, conferir se cada ficha PMIB tem aplicação e rastrear cada linha até o documento de projeto que
a justifica (aba DOCS DE REFERÊNCIA).

A planilha final segue o **`Template_Aplicação_LMR.xlsx`** e tem três abas:

- **DOCS DE REFERÊNCIA**: o cabeçalho (lista de sobressalentes, especificação/capítulo, subsistema) e,
  para cada PMIB, o part number, a descrição, o documento principal onde o material aparece e as TAGs.
- **DESCRIÇÃO DOCUMENTOS**: código Itaipu, código CMI e título dos documentos usados. A equipe
  completa no fim.
- **APLICAÇÃO - LMR**: as linhas `FICHA_PMIB`, `CÓDIGO_LMR`, `TAG_LMR`.

---

## 2. Visão geral do processo

```
 Status PMIB ─┐
 Documentos   ├──► (1) BASE LMR ──► (2) APLICAÇÃO LMR + VALIDAÇÃO ──► (3) revisão e emissão
 REF-0013     │       uma linha por        uma linha por unidade
 Localização ─┘       material/posição     instalada em cada trecho
```

O trabalho pesado é a **Base LMR**. Ela é compacta: uma linha por material numa posição, com a lista
de trechos e a quantidade por trecho. A aplicação é só a expansão da Base, feita pelo Workflow B, sem
interpretação. Por isso:

- toda correção é feita **na Base**, e a aplicação é gerada de novo;
- a mesma Base gera sempre a mesma aplicação. A **assinatura** (`nº de linhas-hash`) comprova isso.

| Etapa | Quem faz | Ferramenta |
|---|---|---|
| Montar a Base de um sistema novo | pessoa + automação | Workflow A (AMP) ou leitor de cadernos GE (`leitura_ge/`) |
| Recuperar a Base de uma aplicação já emitida | automação | Workflow R (local) |
| Gerar a aplicação a partir da Base | automação | Workflow B (AMP) ou `rodar_workflow_b.py` (local) |
| Atualizar quando o Status PMIB muda | automação + confirmação | Workflow C (C1 compara, C2 aplica) |
| Conferir pendências, localização e emitir | pessoa | — |

---

## 3. Passo a passo

### Passo 1 — Reunir os insumos

Separe, para o sistema:

1. **Status PMIB** (`{lista}_STATUS_PMIB.xlsx`, aba *Lista de Materiais*). É o catálogo: item, descrição,
   código do material (part number), marca/modelo, código PMIB e status. Itens com `STATUS = DUPLICADO`
   ficam de fora.
2. **Lista de sobressalentes** (código `...&EPB020`, `...&MPB020`). Dá a relação material ↔ TAG. A
   quantidade dela é de reposição e **não** é usada.
3. **Documentos de projeto**: cadernos de painel com a folha LISTA DE MATERIAIS, P&IDs, arranjos,
   layouts, diagramas, workstatement. Deles saem TAG, área/painel, quantidade instalada, frequência e
   localização.
4. **ITAIPU-REF-0013** (codificação RDS-PP). Aba *AGRUPADO (Função)* para o RDS-PP de cada TAG de
   equipamento e aba *AGRUPADO (Localização)* para conferir trecho, elevação e eixo.
5. **Template** `Template_Aplicação_LMR.xlsx`.

> O código PMIB não aparece em nenhum documento de projeto: ele vem sempre do Status PMIB.

### Passo 2 — Definir os parâmetros da aplicação

| Parâmetro | O que é | Exemplo |
|---|---|---|
| Escopo | sigla que abre o CÓDIGO e a TAG LMR | `CC`, `UG`, `RV` |
| Subsistema | nome do sistema no CÓDIGO LMR | `BATERIAS E CARREGADORES` |
| Lista de sobressalentes | código da lista no cabeçalho | `#ST00=B03BPA10TB010-TB903&EPB020` |
| Especificação / capítulo | texto do cabeçalho | `CONTROLE CENTRALIZADO / SERVIÇOS AUXILIARES ESSENCIAIS` |
| Trechos do projeto | onde o sistema existe | `TODAS`, `ÍMPARES`, `PARES`, lista de UGs, `AMD`/`AMC` |

**Trechos e frequência.** As UGs de 50 Hz (`#ST50`, M01–M09, M19) ficam em U-01…U-09 e U-09A; as de
60 Hz (`#ST60`, M10–M18, M20) em U-10…U-18 e U-18A. O material é aplicado na **interseção** entre os
trechos do projeto e a frequência dele. Exemplo: um material de 60 Hz num projeto de UGs ímpares entra
em U-10, U-12, U-14, U-16 e U-18. Material comum às duas frequências entra em todos os trechos do
projeto.

### Passo 3 — Montar o catálogo pelo Status PMIB

Para cada PMIB válido, anote a descrição (copiada do Status, só com limpeza de espaços), o part number
(`CÓDIGO DO MATERIAL`; se estiver vazio, use `MARCA/MODELO`) e a unidade.

- Unidade a granel (`L`, `kg`, `m`…) gera **1 linha por trecho**, qualquer que seja a quantidade.
- Numeração `x` / `x.y` no Status indica **pai e filho documental**: o subitem `x.y` é componente do
  item `x`.
- Item sem PMIB que só agrupa subitens (ex.: "Conjunto ... composto dos seguintes itens") não gera
  linha.

Esse catálogo alimenta a aba DOCS DE REFERÊNCIA.

### Passo 4 — Encontrar onde cada material está instalado

Para cada PMIB, procure nos documentos de projeto:

1. **Área / painel / equipamento** onde está (ex.: `HBC`, `C1`, `PLA-CCR`, `SKID`).
2. **RDS-PP** da área ou do documento (ex.: `#ST50=B03BPA10TB010-TB011&EFF010`). Em sistemas de UG o
   RDS-PP leva o marcador da unidade (`M[XX]`), que a automação troca pelo M de cada trecho.
3. **TAG** do material no desenho (ex.: `52.A`, `GP151`). Em listas de materiais de painel a TAG pode
   vir em faixa (`27.1...27.3`): cada TAG da faixa é uma unidade instalada.
4. **Se a TAG leva RDS-PP próprio** (coluna `TAG COM RDS-PP`): sim quando o material tem RDS-PP
   individual (ex.: uma bomba) ou o documento manda relacioná-lo ao RDS-PP da área + TAG.
5. **Pai**, quando o material é componente de outro equipamento com TAG (vedação de uma bomba,
   acoplamento entre motor e bomba). O filho cita o pai no CÓDIGO LMR e entra **uma vez para cada TAG
   do pai**.
6. **Quantidade instalada por trecho**: 1 por TAG quando há TAG; senão, a quantidade da lista de
   materiais do equipamento ou do desenho. **Sem fonte, não se supõe: vira pendência.**
7. **Frequência** (50/60 Hz), na ordem: documento → RDS-PP (`#ST50`/`#ST60`) → outros documentos do
   escopo → pergunta ao responsável.

Quando o material casa pela descrição mas o part number do desenho é diferente do Status, registre como
pendência para conferir: pode ser outro material.

### Passo 5 — Levantar a localização física

Cada área/equipamento precisa de quatro campos. Os materiais daquele equipamento herdam esses campos.

| Campo | Regra | Exemplo |
|---|---|---|
| Local | lista fechada, em maiúsculas e com acento | `CASA DE FORÇA` |
| Elevação | vírgula decimal, sempre 2 casas | `115,00`, `131,50` |
| Eixo | lista fechada: `AB`, `BC`, `CD`, `MB`, `JB`, `JD` | `CD` |
| Trecho | `U-01`…`U-18`, `U-09A`, `U-18A`, `AMD-01`…`AMD-04`, `AMC-01`…`AMC-03` | `U-09` |

As fontes são o workstatement, o título e o carimbo dos documentos, o próprio desenho e, para conferir,
a aba *AGRUPADO (Localização)* da REF-0013. **Campo vazio ou fora da lista bloqueia a linha.** Quando o
documento não traz a localização (caso comum nos cadernos de painel), ela precisa ser informada pela
equipe. Na automação isso vai para a planilha `LOCAIS A PREENCHER - BASE LMR.xlsx`.

### Passo 6 — Escrever a Base LMR

Arquivo `BASE LMR - {sistema}.xlsx`, com as abas:

- **BASE**, uma linha por material numa posição:

  `LINHA, ESCOPO, SUBSISTEMA, FICHA_PMIB, DESCRIÇÃO, ÁREA/PAINEL, RDS-PP, TAG, TAG COM RDS-PP, PAIS,
  LOCAL, ELEVAÇÃO, EIXO, TRECHOS, QTD POR TRECHO`

  - `TRECHOS`: lista separada por vírgula (`U-01, U-03, U-05`).
  - `PAIS`: `TAG | RDS-PP` do pai; vários pais separados por `;`.
  - `QTD POR TRECHO`: quantas vezes a linha se repete em cada trecho.
- **CABEÇALHO**: lista de sobressalentes, especificação/capítulo e subsistema.
- **DOCS DE REFERÊNCIA**: `CÓDIGO PMIB, PART NUMBER, DESCRIÇÃO DO MATERIAL, RDS-PP DOCUMENTO -
  PRINCIPAL, QTD, TAGS, OBSERVAÇÕES`. O `PART NUMBER` daqui é o que aparece entre parênteses no fim da
  TAG LMR.
- **PENDÊNCIAS**: tudo o que não foi confirmado, com o motivo.

Exemplo de linha da BASE:

| FICHA_PMIB | DESCRIÇÃO | ÁREA/PAINEL | RDS-PP | TAG | LOCAL | ELEV. | EIXO | TRECHOS | QTD |
|---|---|---|---|---|---|---|---|---|---|
| 4500063671.0414 | Disjuntor XT5H 400 TMA 400 | C1 | #ST50=B03BPA10TB010-TB011&EFF010 | 52.A | CASA DE FORÇA | 115,00 | CD | U-01, U-03, U-05, U-07, U-09 | 1 |

### Passo 7 — Resolver as pendências

Antes de gerar, percorra a aba PENDÊNCIAS: localizações faltando, quantidades sem fonte, part numbers
divergentes, frequência não encontrada, materiais do Status sem nenhuma posição. Corrija **na BASE**.
O que não tiver resposta fica registrado; a linha sem dado obrigatório será bloqueada no passo 8.

### Passo 8 — Gerar a aplicação (Workflow B)

- **No AMP**: abra o workflow *LMR - B Gerar aplicação a partir da Base*, clique em *Execute workflow*,
  envie a `BASE LMR - {sistema}.xlsx` e deixe a aba do formulário aberta. No fim ela mostra a assinatura
  e baixa a `APLICAÇÃO LMR - {sistema}.xlsx`. A VALIDAÇÃO fica na execução (nó *Arquivo VALIDAÇÃO*).
- **Localmente**: `py -X utf8 leitura_ge/rodar_workflow_b.py "<pasta>/BASE LMR - X.xlsx"`. A aplicação
  e a validação saem ao lado da Base.

O que o B faz em cada linha da Base: para cada trecho, troca o `M[XX]` do RDS-PP pelo M do trecho, monta
o CÓDIGO LMR e a TAG LMR no padrão abaixo e repete a linha `QTD POR TRECHO` vezes.

```
CÓDIGO_LMR = {ESCOPO} - {SUBSISTEMA} - {ÁREA/PAINEL} - RDS-PP: {RDS-PP} - {LOCAL} - ELEV. {xx,xx} - EIXO {..} - TRECHO {..}
           (filho: a TAG do pai e o RDS-PP+TAG do pai entram no lugar da ÁREA/PAINEL)
TAG_LMR    = {ESCOPO} - {TAG} - RDS-PP: {RDS-PP}{TAG} - {DESCRIÇÃO} ({PN})   (TAG com RDS-PP próprio)
TAG_LMR    = {ESCOPO} - {TAG} - {DESCRIÇÃO} ({PN})                         (TAG sem RDS-PP próprio)
TAG_LMR    = {ESCOPO} - {DESCRIÇÃO} ({PN})                                 (sem TAG, ou filho)
```

Sem part number, a TAG sai sem os parênteses.

### Passo 9 — Conferir a VALIDAÇÃO e a assinatura

A VALIDAÇÃO lista, por linha da Base, o que **bloqueia** (a linha não entra na aplicação) e o que é
**aviso**. Os bloqueios mais comuns:

| Mensagem | Causa | Correção na Base |
|---|---|---|
| `TRECHOS vazio` | localização não levantada | preencher TRECHOS (e local, elevação, eixo) |
| `QTD POR TRECHO vazia` | quantidade instalada sem fonte | buscar no desenho/lista do equipamento |
| local, eixo ou trecho fora da lista | grafia diferente ou local novo | corrigir a grafia ou incluir o local na lista fechada (decisão da equipe) |
| M do RDS-PP incompatível com o trecho | material de 50 Hz em trecho de 60 Hz, ou o contrário | rever a frequência ou os trechos |
| TAG do pai inexistente | pai citado sem linha própria na Base | incluir o pai ou corrigir a TAG |

Corrigiu a Base, gere de novo. A **assinatura** só muda quando o conteúdo muda: se duas execuções da
mesma Base derem assinaturas diferentes, há algo errado no processo.

### Passo 10 — Revisar e emitir

1. Confira por amostragem linhas sem aviso, principalmente de materiais novos: descrição, TAG, trecho e
   quantidade contra o desenho.
2. Preencha a aba **DESCRIÇÃO DOCUMENTOS** (código Itaipu, código CMI, título).
3. Confira se todo PMIB do Status tem aplicação ou uma justificativa na PENDÊNCIAS.
4. Guarde a Base junto com a aplicação, na pasta `LMR/` do sistema. **A Base é o arquivo-mestre** das
   próximas revisões.

### Passo 11 — Quando algo mudar depois da emissão (Workflow C)

Nova revisão do Status PMIB, material substituído, quantidade alterada:

1. **C1**: envie a Base atual e o Status novo. Sai a planilha ALTERAÇÕES, com o que mudou (incluir,
   excluir, substituir material, alterar quantidade, atualizar descrição ou part number).
2. Marque `APLICAR = SIM` no que for confirmado.
3. **C2**: aplica as alterações na Base e devolve a Base nova.
4. Rode o **B** de novo para obter a aplicação revisada.

Correções pontuais também podem ser feitas direto na BASE, seguidas de nova execução do B.

---

## 4. Erros que já aconteceram e como evitar

- **Usar a quantidade de reposição** da lista de sobressalentes. A aplicação usa a quantidade instalada.
- **Supor localização.** Sem documento, pergunte; nunca preencha por semelhança com outro sistema.
- **Trecho em formato antigo** (`U01/02`, `U9A`). Use sempre `U-01`, `U-09A`; uma faixa precisa ser
  aberta trecho a trecho.
- **Local com outro nome** (`SALA DE FORÇA`). A lista fechada usa `CASA DE FORÇA`; local novo precisa
  ser aprovado e incluído na lista.
- **Part number do desenho diferente do Status.** Pode ser outro material; confirme antes de aplicar.
- **Pai e filho escritos de formas diferentes.** O filho sempre cita o pai no CÓDIGO LMR e aparece uma
  vez para cada TAG do pai.
- **Corrigir na aplicação e não na Base.** A correção se perde na próxima geração.

---

## 5. Onde fica cada coisa

| Item | Local |
|---|---|
| Regras completas e decisões | [`aplicacao-lmr/PLANO.md`](../PLANO.md) |
| Motor de regras (monta CÓDIGO e TAG, valida) | `aplicacao-lmr/motor/lmr.js` |
| Workflows do AMP (A, B, C) | `aplicacao-lmr/motor/workflows/` |
| Leitor de cadernos GE e runner local do B | `aplicacao-lmr/leitura_ge/` |
| Auditoria do processo (06/11/2026) | [`docs/auditorias/2026-11-06-auditoria-processo-lmr.md`](auditorias/2026-11-06-auditoria-processo-lmr.md) |
| Dados reais (Status, documentos, Bases, aplicações) | Box, `DocManager Itaipu/Docs Aconex/LMR/` e pasta `LMR/` de cada sistema. **Não são versionados** |

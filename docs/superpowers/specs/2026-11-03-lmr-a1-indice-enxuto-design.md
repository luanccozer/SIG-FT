# Aplicação LMR: A1 enxuto, índice dos documentos

Data: 03/11/2026. Segundo degrau do fluxo A novo, depois do A0
(`2026-11-03-lmr-a0-conferir-materiais-design.md`, validado no AMP: Água Pura 87/87, SFC 40/41).

## 1. Objetivo

Gerar, sem IA, o **índice** dos documentos de um sistema: o que o texto dos PDFs já diz sobre TAGs, RDS-PP, elevações,
materiais e documentos. Ele serve a duas coisas:

1. **Medir**, com a BASE emitida como gabarito, quantas TAGs da aplicação já estão no texto. É o teto do que qualquer
   leitura por texto, com ou sem agente, consegue achar.
2. **Ser a entrada do próximo degrau** (A2, leitura pelo agente): a aba PÁGINAS leva o texto de cada página, e o A2
   não precisa receber os PDFs de novo.

Fora do escopo: IA, áreas, montagem da Base, Box. Workflow B, formato da Base e `lmr.js` não mudam.

## 2. Ponto de partida: o A1 que já existe

`workflows/gerar_a1.js` já gera `LMR_A1_indice_documentos.json`: 10 nós, o mesmo desenho do A0 (Loop de 1 PDF por volta,
sem Merge, sem Wait), e testes com dados fictícios e reais. **Ele nunca rodou no AMP.** O A0 provou esse desenho lá.

Por isso este degrau **não reescreve** o A1. Ele faz quatro ajustes e o valida no AMP:

| # | Ajuste | Por quê |
|---|---|---|
| 1 | Campo **Sistema** no formulário, como no A0 | Hoje o nome sai do nome do arquivo do Status (`… - {sistema}.xlsx`); fora desse padrão, a planilha sai como "Sistema" |
| 2 | **Mensagem final montada no código** (`resumo.mensagem`, em `indice.js`), como no A0 | Hoje é uma expressão do n8n de 6 linhas, sem teste; no código ela é testada |
| 3 | **PÁGINAS sem corte**, nas colunas `TEXTO1`, `TEXTO2`, … de 30.000 caracteres | Hoje o texto é cortado em 32.000 caracteres e o resto se perde. É a convenção que o `agente.js` já usa na aba ÍNDICE (`CELULA = 30000`) e que `indexadosDoRoteiro` já remonta: o A2 lê esta aba com código que já existe |
| 4 | **Mensagem com o critério de aceite**: TAGs da BASE não achadas, com a lista | Para conferir o aceite (§5) sem abrir a planilha |

A versão Box (`LMR_A1_indice_box.json`) sai do mesmo gerador e recebe os mesmos ajustes, mas não é testada neste
degrau (a ligação com o Box ainda não funciona).

## 3. Fluxo (inalterado)

```
Formulário: Documentos (PDF), Status PMIB (.xlsx), Sistema, BASE para conferência (.xlsx, opcional)
 → Lê Status PMIB · Lê BASE (gabarito; segue com erro se não vier)
 → Separa PDFs → Loop (1 por volta) → Lê PDF (por página) → Indexa documento
 → Monta índice → Entrega o índice (página final com a mensagem e o download)
```

## 4. Entrega

`ÍNDICE LMR - {sistema}.xlsx`, com as abas de hoje: RESUMO, DOCUMENTOS, MATERIAIS, TAGS, RDS-PP, ELEVAÇÕES, SEM TEXTO,
PÁGINAS e, com gabarito, CONFERÊNCIA TAGS e CONFERÊNCIA MATERIAIS. Muda só a aba PÁGINAS:

| ARQUIVO | CÓDIGO | PÁGINA | CARACTERES | TEXTO1 | TEXTO2 … |
|---|---|---|---|---|---|

Uma linha por página. O número de colunas `TEXTOn` é o da maior página (`ceil(caracteres / 30.000)`, no mínimo 1);
juntas na ordem, elas dão o texto da página sem perda. `CARACTERES` é o tamanho da página inteira. O RESUMO troca a linha
"Páginas com texto cortado em 32.000 caracteres" por "Páginas em mais de uma coluna de texto".

**Mensagem final** (uma linha, partes separadas por ` · `, só as que se aplicam):

- `{n} documentos, {p} páginas ({s} sem texto)`
- `{a} de {m} materiais do Status achados`
- `{t} TAGs candidatas (assinatura {x})`
- com gabarito: `Gabarito: {c+s} de {T} TAGs da BASE achadas ({c} candidatas, {s} só no texto; {k} curtas para conferir à mão)`,
  `TAGs da BASE não achadas ({q}): TAG1, TAG2, …` (até 20 e `(+ n)`) e `{i} de {P} PMIBs com TAGs sugeridas iguais às da BASE`
- `Documentos com aviso ({d}): arquivo1, …` (até 20 e `(+ n)`)
- `{v} páginas em mais de uma coluna de texto`
- `{kb} KB`

## 5. Testes e aceite

**Locais** (`node workflows/gerar_a1.js`): os T1–T3 de hoje continuam e ganham:

- página de 70.000 caracteres → colunas TEXTO1 a TEXTO3, que juntas dão o texto original;
- `indexadosDoRoteiro` (`agente.js`) lê a aba PÁGINAS gerada e devolve o mesmo texto de cada página;
- a mensagem do caso fictício, comparada por inteiro (com e sem gabarito);
- o campo Sistema dá o nome do arquivo; sem ele, o nome sai do arquivo do Status, como hoje.

O T4 com dados reais (na máquina com o Box) continua e imprime a mensagem de cada sistema. Pulado não conta como aprovado.

**No AMP, em execução manual** (aceite do degrau, o critério do `PLANO.md` §9):

1. **Água Pura com a BASE emitida:** todas as TAGs da BASE com 4 ou mais caracteres achadas (CANDIDATA ou SÓ NO TEXTO),
   87 de 87 materiais, e nenhum documento com aviso de código do carimbo não identificado.
2. **SFC, Aeração e Reg. Vel.** (com os diagramas comprimidos): rodam até o fim sem travar. Anotar o tempo e o tamanho (KB)
   de cada uma: o tamanho da aba PÁGINAS é o dado que dimensiona o A2.

Se a Água Pura tiver TAG da BASE não achada, a lista da mensagem diz quais. Cada uma é investigada antes de qualquer
mudança na busca: pode estar só em página escaneada ou ser divergência da aplicação emitida.

## 6. Arquivos

| Arquivo | Mudança |
|---|---|
| `aplicacao-lmr/motor/indice/indice.js` | `montaIndice`: aba PÁGINAS em colunas `TEXTOn` e `resumo.mensagem` |
| `aplicacao-lmr/motor/workflows/gerar_a1.js` | Campo Sistema; o nó de entrega usa `{{ $json.mensagem }}`; testes novos |
| `aplicacao-lmr/motor/workflows/LMR_A1_indice_documentos.json`, `LMR_A1_indice_box.json` | Gerados de novo |
| `aplicacao-lmr/HANDOFF.md` | Resultado do AMP |

Ninguém lê hoje a coluna `TEXTO` da aba PÁGINAS do A1 (o `agente.js` lê a aba ÍNDICE do roteiro AG1, que já usa
`TEXTOn`), então a troca não quebra outro fluxo.

# Workflow no n8n: revisão de lista com os dois agentes

Você monta este workflow à mão e roda pelo editor, sem o SIG-FT. Preencha um formulário com:
- as duas revisões da lista, em PDF;
- a _STATUS_PMIB colada do Excel.

No fim, você baixa um HTML com o que mudou e com a _STATUS_PMIB remontada. A execução manual não conta no limite
de 50 execuções publicadas por mês.

**Antes:** crie no AMP os dois agentes, com os arquivos `agentes/revisor_de_listas.md` e
`agentes/conferente_de_listas.md`, nesta pasta.

## Os nós, em ordem

```text
Formulário → Lê a revisão em uso → Lê a revisão atual → Monta o pedido → Revisor de Listas
→ Prepara a conferência → Conferente de Listas → Monta o resultado → Entrega o HTML
```

**Use exatamente esses nomes**, porque o código dos nós procura os outros nós pelo nome. Para renomear, clique no
nome do nó ou aperte F2. Ligue cada nó no seguinte, em linha.

### 0. Criar o workflow

1. Em **Personal**, clique em **Create workflow**.
2. No menu **⋯**, abra **Settings** e ponha **Save manual executions** em **Save**.

### 1. Formulário

Use o nó **n8n Form Trigger** (*On form submission*) e renomeie para `Formulário`.

- **Form Title:** `Revisão de lista (AMP)`
- **Form Elements** (*Add Form Element*), nesta ordem:

| Field Label | Element Type | Required |
|---|---|---|
| `Código da lista` | Text | sim |
| `Revisão em uso` | Text | não |
| `Revisão atual` | Text | sim |
| `PDF da revisão em uso` | File | sim |
| `PDF da revisão atual` | File | sim |
| `STATUS_PMIB colado do Excel` | Textarea | sim |

Nos dois campos File, ponha `.pdf` em *Accepted File Types* e deixe *Multiple Files* desligado.

Depois, descubra o nome de cada PDF:
1. clique em **Execute step** no nó;
2. envie o formulário de teste com os arquivos de uma lista;
3. na saída do nó, aba **Binary**, veja o nome de cada PDF (algo como `PDF_da_revis_o_em_uso`).

Você vai usar esses dois nomes nos passos 2 e 3.

**Como colar a _STATUS_PMIB:** no Excel, aba Lista de Materiais, selecione da célula ITEM do cabeçalho até a
última célula preenchida, copie com Ctrl+C e cole no campo. Pode incluir a linha de revisão que fica acima do
cabeçalho.

**Lista sem revisão em uso:** deixe `Revisão em uso` vazio e mande o PDF da revisão atual nos dois campos de PDF.
Com o campo vazio, o código ignora o primeiro PDF.

### 2. Lê a revisão em uso

Use o nó **Extract from File** e renomeie para `Lê a revisão em uso`.

- **Operation:** Extract From PDF
- **Input Binary Field:** o nome do PDF da revisão em uso, visto no passo 1
- **Options → Join Pages:** desligado. Assim o texto sai página por página, e os agentes citam a página.
- **Options → Keep Source:** Binary. Assim o próximo nó ainda recebe os PDFs.

### 3. Lê a revisão atual

Use outro **Extract from File** e renomeie para `Lê a revisão atual`.

- **Operation:** Extract From PDF
- **Input Binary Field:** o nome do PDF da revisão atual
- **Options → Join Pages:** desligado

### 4. Monta o pedido

Use o nó **Code**, em JavaScript, e renomeie para `Monta o pedido`. Apague o código de exemplo e cole todo o conteúdo
de `nos_para_colar/1_monta_o_pedido.js`.

### 5. Revisor de Listas

Use o nó **AMP Agent** e renomeie para `Revisor de Listas`.

- **Credential:** a sua conta do AMP
- **Custom Agent:** Revisor de Listas
- **Prompt (User message):** `{{ $json.chatInput }}`
- **Session ID:** `{{ $json.sessionId }}`
- **Options → timeout:** o maior valor que o campo aceitar
- **Settings** do nó: **Retry On Fail** ligado, **Max Tries** 3

### 6. Prepara a conferência

Use o nó **Code**, em JavaScript, e renomeie para `Prepara a conferência`. Cole todo o conteúdo de
`nos_para_colar/2_prepara_a_conferencia.js`.

### 7. Conferente de Listas

Use outro **AMP Agent** e renomeie para `Conferente de Listas`. Configure igual ao passo 5, mas com **Custom
Agent:** Conferente de Listas.

### 8. Monta o resultado

Use o nó **Code**, em JavaScript, e renomeie para `Monta o resultado`. Cole todo o conteúdo de
`nos_para_colar/3_monta_o_resultado.js`.

### 9. Entrega o HTML

Use o nó **n8n Form** e renomeie para `Entrega o HTML`. É a mesma página final com arquivo do workflow B da LMR:

- **Page Type:** Form Ending
- **On n8n Form Submission:** Return Binary File
- **Input Data Field Name:** `data`

Salve com Ctrl+S.

## Rodar

1. Clique em **Execute workflow**. Abre o formulário de teste.
2. Preencha e envie. Deixe a aba aberta: as duas chamadas aos agentes levam alguns minutos.
3. No fim, a página baixa o HTML `<código>[<em uso>-<atual>] revisao AMP.html`. Se não baixar, abra
   **Executions**, a execução, o nó **Monta o resultado**, a aba **Binary** e clique em **Download**.

## O que o HTML traz

- O resumo e as contagens.
- O que mudou entre as revisões, com a página, o trecho do PDF e o veredito do Conferente.
- **A conferir:** o que não entrou na tabela, com o motivo.
- A _STATUS_PMIB remontada, com um botão de copiar. Cole numa cópia do arquivo. Na tabela só entra:
  - o que o Conferente confirmou;
  - e cuja prova (o trecho e o código) o código achou no PDF.

  As colunas da equipe, CÓDIGO PMIB e as que ficam à direita dele, não mudam.
- As linhas para a SEM_LISTA_STATUS_PMIB e a linha de revisão nova, também com botão de copiar.

## Se der erro

| Onde parou | O que fazer |
|---|---|
| Lê a revisão atual: não acha o arquivo | no nó Lê a revisão em uso, ponha *Options → Keep Source* em Binary; confira o *Input Binary Field* |
| Monta o pedido: não acha um nó | o nome do nó está diferente do passo a passo |
| Monta o pedido: "não tem o cabeçalho" | a colagem não pegou a linha do cabeçalho: copie de novo a partir da célula ITEM |
| Monta o pedido: "não leu texto do PDF" | o PDF é só imagem, e essa lista não dá para revisar pelo texto |
| Revisor de Listas ou Conferente de Listas: "424" ou "500 from runtime" | erro do AMP: rode de novo mais tarde |
| Prepara a conferência: "não devolveu o JSON combinado" | veja a saída do nó Revisor de Listas e confira se o system prompt foi colado inteiro |
| HTML com "A conferência não foi feita" | o Conferente falhou, e nada foi aplicado na tabela |

Para melhorar um agente, mude o system prompt dele no AMP. O workflow não muda.

## Depois: ligar no SIG-FT

O workflow ligado ao SIG-FT já está pronto para importar: `workflow_revisao_de_listas.json`, com o passo a passo no `LEIA-ME.md`.

Quando formos ligar o SIG-FT, o webhook entra no lugar do formulário e da leitura dos PDFs, porque o SIG-FT já manda o
texto pronto. A resposta ao webhook entra no lugar da página final. Os dois agentes e o nó Monta o resultado ficam
iguais.

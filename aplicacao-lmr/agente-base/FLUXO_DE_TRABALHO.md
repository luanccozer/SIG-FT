# Montador da BASE LMR: um agente do AMP, sem fluxograma

Caminho alternativo ao workflow A. Um único agente, no **chat** do AMP, lê os PDFs e o Status PMIB de um
sistema e entrega a BASE LMR em 6 etapas fixas. Você cola as tabelas dele no modelo `.xlsx` e roda o
**Workflow B** (`LMR_B_gerar_aplicacao.json`, já validado no AMP), que gera a APLICAÇÃO LMR e a VALIDAÇÃO.

```
PDFs + Status PMIB ──► agente (chat, 6 etapas, você confere 2 portões) ──► tabelas
tabelas ──► BASE LMR - modelo.xlsx ──► Workflow B ──► APLICAÇÃO LMR + VALIDAÇÃO
```

| Arquivo | Para quê |
|---|---|
| `system_prompt.md` | o system prompt do agente (as regras de montagem que antes estavam no código, em `leitura.js` → `montaBase`) |
| `exemplo_base_lmr.md` | Knowledge base: um sistema fictício passando pelas 6 etapas |
| `BASE LMR - modelo.xlsx` | modelo para colar as tabelas (abas BASE, CABEÇALHO, DOCS DE REFERÊNCIA, PENDÊNCIAS; colunas em formato texto) |

**Por que tabelas e não o arquivo:** no chat, o agente do AMP só gera PDF, PowerPoint ou HTML e não roda código
(`contexto/limitacoes-amp/`). Ele não consegue entregar o `.xlsx`.

## 1. Criar o agente (uma vez, na sua conta do AMP)

| Campo | O que colocar |
|---|---|
| Nome | `Montador BASE LMR` |
| Descrição | `Lê os PDFs e o Status PMIB de um sistema da usina e monta, em 6 etapas fixas, as tabelas da BASE LMR (entrada do Workflow B). Comandos: INÍCIO, OK, CONTINUAR, CORRIGIR, ÁREAS CONFIRMADAS, ONDE PAROU, RETOMAR ETAPA n.` |
| Modelo | **Claude Sonnet 5.5** |
| System prompt | o texto inteiro de `system_prompt.md` |
| Knowledge base | `exemplo_base_lmr.md` (se o AMP não aceitar `.md`, salve como PDF ou Word com o mesmo nome) |
| Box | não conceder |

Se o AMP recusar o system prompt por tamanho, me avise: dá para mover as seções 3 (glossário) e 9 (conferência)
para a Knowledge base.

## 2. Preparar o sistema

1. Junte numa pasta: o **Status PMIB** (`.xlsx`) e os **PDFs** do escopo do sistema (layouts, P&ID/fluxogramas,
   listas de material, diagramas de painel, descritivos, lista de sobressalentes). PDF grande ou escaneado: comprima
   com `motor/indice/comprime_pdf_janela.pyw`, que mantém o texto.
2. Preencha os parâmetros. Valores já decididos nos sistemas de teste:

| Sistema | ESCOPO | SUBSISTEMA | TRECHOS | KITS | PEÇAS | EIXO PADRÃO |
|---|---|---|---|---|---|---|
| Água Pura | UG | ÁGUA PURA | TODAS | SEM TAG | TAG | CD |
| Reg. Vel. | RV | (o da aplicação emitida) | TODAS | TAG | PAI | |
| Aeração | (o da aplicação emitida) | | TODAS | TAG | TAG | |
| SFC | (o da aplicação emitida) | | | (a decidir) | TAG | |

## 3. A conversa (sempre um chat NOVO por sistema)

**Mensagem 1:** anexe todos os arquivos e envie:

```
INÍCIO
SISTEMA: Água Pura
ESCOPO: UG
SUBSISTEMA: ÁGUA PURA
TRECHOS DO PROJETO: TODAS
KITS: SEM TAG
PEÇAS: TAG
EIXO PADRÃO: CD
FREQUÊNCIA PADRÃO: PENDÊNCIA
ESPECIFICAÇÃO TÉCNICA / CAPÍTULO:
ANEXOS: (os nomes dos arquivos anexados)
```

| Etapa | O agente entrega | Você confere | Você envia |
|---|---|---|---|
| 1 INVENTÁRIO | DOCUMENTOS (páginas de cada PDF) e resumo do catálogo | o nº de páginas de 2 ou 3 PDFs; o TOTAL NO CATÁLOGO igual ao do A0 / Status | `OK` |
| 2 ÁREAS | tabela ÁREAS com FALTA | **portão 1:** nomes da equipe (SCP, SPN…), RDS-PP, local, elevação, eixo | `ÁREAS CONFIRMADAS` + a tabela corrigida (copie, corrija, cole) |
| 3 TAGS | TAGs instaladas, por documento | 3 TAGs ao acaso: abra a página da EVIDÊNCIA e veja se a TAG está lá | `CONTINUAR` até "Etapa 3 pronta", depois `OK` |
| 4 LIGAÇÃO | 25 materiais por parte | **portão 2:** PAPEL e TAGS dos materiais que você conhece; nenhuma QTD tirada da lista de sobressalentes | `CONTINUAR` …, `CORRIGIR PMIB x: …` se precisar, `OK` |
| 5 BASE | BASE em partes de 40 linhas; CABEÇALHO, DOCS DE REFERÊNCIA, PENDÊNCIAS | vá colando no modelo (seção 4) | `CONTINUAR` …, `OK` |
| 6 CONFERÊNCIA | 10 itens com OK ou erro | se houver erro, ele reentrega só as partes afetadas | — |

- Corrigir em texto livre também vale ("o RDS-PP do SKID é o do P&ID"). O que você mandar vence o que ele leu.
- Se o chat ficar lento ou o agente se perder: `ONDE PAROU`. Se não resolver, abra um chat novo, anexe os mesmos
  arquivos e envie `RETOMAR ETAPA n` com os PARÂMETROS e as tabelas já aceitas (ÁREAS CONFIRMADAS e as partes prontas).

## 4. Montar o arquivo

1. Copie `BASE LMR - modelo.xlsx` com o nome **`BASE LMR - {sistema}.xlsx`**.
2. Em cada aba, clique em **A2** e cole a tabela do agente com **Ctrl+Shift+V** (só o texto). A próxima parte vai
   logo abaixo da última linha. Não cole o cabeçalho de novo. No CABEÇALHO, cole só os valores (B2:B4).
3. Confira três coisas:
   - FICHA_PMIB com 4 dígitos depois do ponto (`4500000000.0010`, não `4500000000.001`);
   - PAIS com a barra `|` entre a TAG e o RDS-PP;
   - LINHA de 1 até N, sem buraco.

## 5. Gerar a aplicação

Rode o **Workflow B** com o arquivo. Ele expande a BASE e baixa a APLICAÇÃO LMR. A VALIDAÇÃO fica na execução (nó
**Arquivo VALIDAÇÃO**). Linha com campo vazio aparece como bloqueada (V1) e PMIB sem linha aparece em V12: as duas
coisas batem com a aba PENDÊNCIAS.

## 6. Primeiro teste: Água Pura (tem gabarito)

O aceite é comparar com a BASE emitida (`BASE LMR - Água Pura.xlsx`, assinatura no B `3580-2989B1D8`):

1. a mensagem final do Workflow B (nº de linhas e assinatura). O alvo é **3.580 linhas**;
2. a tabela ÁREAS confirmada × a BASE emitida (SKID `UZ010-UZ001`, PWB `UH010-UH901&ELU010`, SCP `CM050`, SPN `CN010`);
3. quantos materiais ficaram na PENDÊNCIAS e por quê;
4. tempo total, número de mensagens e se alguma parte veio cortada.

Depois, nesta ordem: **SFC** (páginas escaneadas), **Reg. Vel.** (grande, peças como PAI) e **Aeração**.

## 7. Riscos que só o AMP mostra

- **Leitura por busca:** na sonda S10, pelo *Files* do nó, o agente só buscava trechos do PDF. No chat pode ser
  diferente: o Luan viu o Gemini ler a SFC escaneada. O inventário da Etapa 1 e o sorteio de 3 TAGs na Etapa 3 servem
  para pegar isso cedo. Se as páginas não baterem, pare e me mande o inventário.
- **Conversa longa:** a Água Pura deve render umas 15 mensagens. O Reg. Vel. vai passar disso. É para esse caso
  que existe o `RETOMAR ETAPA n`.
- **Colagem no Excel:** se a tabela colar numa coluna só, ou a barra de PAIS sumir, me mande um print. A alternativa é
  pedir ao agente a BASE como arquivo HTML, que o Excel abre direto.
- **Regras sem código:** antes, `montaBase` aplicava as regras de kits, peças, frequência e `#ST[XX]`. Agora quem
  aplica é o agente, e a Etapa 6 e a VALIDAÇÃO do B são as redes de segurança.

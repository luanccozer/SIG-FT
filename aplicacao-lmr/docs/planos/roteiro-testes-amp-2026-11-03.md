# Roteiro dos testes no AMP (03/11/2026)

São dois testes, nesta ordem. Os dois usam **execução manual**, que não gasta a cota de 50 execuções publicadas.

**Dados reais ficam no AMP e no Box.** Devolva só o que o roteiro pede, sem colar trechos de documentos.

## Teste 1: sonda S10 com Gemini (cerca de 10 minutos)

Pergunta: o agente Gemini consegue ler o PDF enviado pelo campo Files?

### Preparar (uma vez)

1. No AMP, crie um agente:

   | Campo | Valor |
   |---|---|
   | Nome | `Leitor LMR Gemini` |
   | Modelo | Gemini 3.5 Flash-Lite |
   | Temperatura | 0 |
   | System prompt | todo o texto de `motor/agente/system_prompt.md` |
   | Knowledge base | `motor/agente/regras_lmr.md` e `motor/agente/formatos_json.md` |
   | Box | não conceder |

2. No n8n, importe `motor/workflows/LMR_S10_sonda2_amp_agent.json`.
3. Em ⋯ → *Settings*, deixe *Save manual executions* = **Save**.
4. Nos nós **AMP Agent A**, **B** e **C**, preencha:

   | Campo | Valor |
   |---|---|
   | Credential | a sua AMP account |
   | Custom Agent | `Leitor LMR Gemini` (**não** o `Leitor LMR`, como diz o Leia-me do workflow) |
   | Prompt | `{{ $json.chatInput }}` |
   | Session ID | `{{ $json.sessionId }}`, sem nada depois das chaves (uma crase sobrando já causou problema) |
   | Files | **A:** o binário `data`. **B e C:** vazio |
   | Add option → timeout | o maior valor aceito |

### Rodar

Clique em **Execute workflow** duas vezes, enviando um arquivo por vez:

- **Rodada 1:** o P&ID de 1 página usado nas sondas anteriores.
- **Rodada 2:** um PDF com **uma página escaneada** da SFC. Só esta rodada mostra se o agente lê imagem, porque o P&ID também tem texto extraível.

### Me devolver

Para cada rodada e cada nó (A, B, C):

- se houve erro e a mensagem de erro;
- `paginas`, `ve_desenho` e `como_leu`;
- se o valor de `palavras_pagina_1` parece mesmo vir da página (sim ou não, sem copiar o texto).

### Como leio o resultado

| Resultado | O que acontece |
|---|---|
| Nó A sem erro nas duas rodadas e, na rodada 2, descreve o conteúdo da página escaneada | O Leitor passa a Gemini com PDF. Escrevo um plano complementar para isso |
| Erro, só vê o nome do arquivo, ou não lê a página escaneada | Segue o Sonnet 5.5 com texto, como hoje. Nada muda no fluxo novo |

## Teste 2: linha de base (depende do tempo das chamadas)

Pergunta: quanto o fluxo atual acerta com o modelo real? Este é o número que o fluxo novo precisa superar.

### Preparar

1. Confirme que o agente `Leitor LMR` existe na sua conta, com modelo Claude Sonnet 5.5 (`motor/agente/CONFIGURAR_AGENTE.md`, seção 1).
2. No n8n, importe `motor/workflows/LMR_A_agente_amp.json`.
3. Em ⋯ → *Settings*, deixe *Save manual executions* = **Save**.
4. Nos nós **Agente E1**, **Agente E23** e **Agente E4**, preencha:

   | Campo | Valor |
   |---|---|
   | Credential | a sua AMP account |
   | Custom Agent | `Leitor LMR` |
   | Prompt | `{{ $json.chatInput }}` |
   | Session ID | `{{ $json.sessionId }}` |
   | Files | vazio |
   | Add option → timeout | o maior valor aceito |

### Rodar

1. Clique em **Execute workflow** e **deixe a aba aberta** até o fim.
2. Envie os PDFs da Água Pura, o Status PMIB e a **BASE LMR - Água Pura.xlsx** emitida, que serve de gabarito.
3. Preencha:

   | Campo | Valor |
   |---|---|
   | Escopo | `UG` |
   | Subsistema | `ÁGUA PURA` |
   | Trechos | `TODAS` |
   | Eixo | `CD` |
   | Frequência | `Deixar pendência` |
   | Kits | `Sem TAG (1 por trecho, na área do equipamento)` |
   | Peças | `Levam a TAG do equipamento` |
   | Conferir as áreas | `Sim` |

4. Quando aparecer **Confira as áreas**, preencha só o que falta (elevação, RDS-PP, trechos da área) e clique em **Ligar os materiais**.
5. Salve o arquivo baixado no Box, numa pasta nova `LMR/Ouputs linha de base/`.

### Me devolver

- A **mensagem final** da página, inteira. Ela traz chamadas, controle, pendências e a conferência com o gabarito.
- Quanto tempo a execução levou.
- Se algum nó ficou vermelho ou travou: o nome do nó, a mensagem de erro e quantos itens os nós anteriores tinham.

**Se travar:** não tente de novo às cegas. Me devolva o que está acima, porque um travamento aqui também afetaria o fluxo novo.

## Depois dos dois testes

Com os dois resultados, defino a meta numérica de cobertura na spec e passamos à criação dos agentes `Ligador LMR` e `Recuperador LMR`, com o guia em `motor/agente/CONFIGURAR_AGENTE.md`.

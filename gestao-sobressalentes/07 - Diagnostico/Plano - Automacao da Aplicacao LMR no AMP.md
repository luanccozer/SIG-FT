---
tags: [plano, lmr, automacao, amp, n8n, handoff]
status: em-execucao
criado: 2026-10-23
atualizado: 2026-10-23
repositorio: aplicacao-lmr/ (este repositório)
---

# Plano — Automação da Aplicação LMR no AMP

> [!warning] Documento de trabalho, datado
> Estado em 23/10/2026. As regras permanentes estão em [[Aplicacao LMR - Regras de Montagem]].
> O código, os workflows e o plano completo (`PLANO.md`, v1.6) estão em `aplicacao-lmr/` na raiz deste
> repositório. Guia de uso no AMP: [Guia AMP n8n — Aplicação LMR](https://claude.ai/artifact/14qjTyoFX7Qpd2NYMzZfJh).

## Por que

É a resposta à melhoria **M6** ([[Diagnostico - Plano de Melhoria]]) e ao passivo do
[[Plano de Acao - Aplicacao LMR]]: gerar a LMR por regra em vez de digitar. A tentativa anterior
(o LLM montando a aplicação a partir da Tabela de TAGs) falhava em silêncio. Agora **a IA só lê
documentos**; montar os códigos é regra, conferida por assinatura.

## Onde roda

No **n8n do AMP** (GE Vernova). Dados reais ficam no AMP e no Box; nada de dado real no repositório.
Limite de 50 execuções publicadas por mês — testes em execução manual, que não contam.

## As quatro funções e a Base

A **Base da Aplicação** (`BASE LMR - {sistema}.xlsx`) tem uma linha por material numa posição
(TAG, painel, local), com TRECHOS e QTD POR TRECHO. Água Pura: 182 linhas na Base → 3.580 na aplicação.

| Função | O que faz | Estado (23/10/2026) |
|---|---|---|
| **R** | aplicação emitida + Status → Base (uma vez por sistema, fora do AMP) | feita para os 5 exemplos |
| **B** | Base → aplicação no formato do template + VALIDAÇÃO | **rodando no AMP, 5 sistemas OK** |
| **C** | C1: Base + Status novo → ALTERAÇÕES (você aprova) · C2: aplica → Base nova | pronto local; AMP não urgente |
| **A** | documentos do escopo + Status → Base (A1 índice sem IA, A2 leitura com IA, A3 monta) | em desenho |

## O que o AMP ensinou (não repetir)

| Sintoma | Causa | Regra |
|---|---|---|
| parou no Merge | ramo opcional (REF-0013) sem dados | fluxo sem Merge; leituras paralelas ligadas ao formulário |
| saídas sumiram | execução manual não guardada | Settings → *Save manual executions* = Save |
| `unrecognized node type: n8n-nodes-base.compression` | o AMP não tem o nó | nada de `.zip` |
| travou compactando | `.zip` byte a byte no Code | — |
| `isolate for this caller is no longer available` | vários Code relendo o resultado inteiro | um Code pesado por fluxo |
| travou no Motor | Code devolvendo 7–17 mil itens | **Loop Over Items** (20 linhas por volta) e nós nativos para as linhas |

Nós confirmados no AMP: Form Trigger, n8n Form (página final com arquivo), Extract from File,
Convert to File, Code (JS e Python), IF, Switch, Loop Over Items, Split Out.

## Próximos passos

1. **Workflow A** — prioridade do Luan (23/10) para começar aplicações reais.
   - A1 (índice, sem IA): nome do arquivo → código, revisão e tipo; texto de cada página → TAGs, RDS-PP,
     elevações, códigos de material; páginas sem texto → fila visual. Validação dentro do AMP contra a
     Base gabarito (Água Pura: as 3.580 TAGs).
   - A2 (leitura com IA): Basic LLM Chain + GEV LLM Model, um tema por chamada, toda TAG/código
     devolvido conferido no texto da página.
   - A3 (monta a Base): Status + índice + leituras → Base + aba PENDÊNCIAS (frequência, QTD, documento).
2. Testes de plataforma pendentes: **S4** (GEV Box), **S5/S6** (modelo de IA, texto e imagem),
   **S7** (sub-workflow), **S8** (formulário de espera).
3. Box: B e C lendo e gravando na pasta do escopo (depende do S4 e de uma pasta de teste).

## Pendências do Luan

- Pasta de documentos de exemplo (`LMR/Exemplo de Documentos Aplicação LMR/`) saiu do Box local:
  devolver a da Água Pura ou seguir com amostras + validação no AMP.
- Resultado do S5/S6 (modelos e tipo do nó GEV LLM Model) e do S4 (pasta de teste no Box).
- PDFs da SFC de 67–78 MB passam do limite do formulário: precisam vir do Box.

## Relacionados
[[Aplicacao LMR - Regras de Montagem]] · [[Secao - Aplicacao LMR]] · [[Plano de Acao - Aplicacao LMR]] ·
[[Diagnostico - Plano de Melhoria]] · [[SIG-FT - Modulos]]

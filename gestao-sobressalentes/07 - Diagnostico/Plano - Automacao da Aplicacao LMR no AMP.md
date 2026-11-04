---
tags: [plano, lmr, automacao, amp, n8n, handoff]
status: em-execucao
criado: 2026-10-23
atualizado: 2026-11-02
repositorio: aplicacao-lmr/ (este repositório)
---

# Plano — Automação da Aplicação LMR no AMP

> [!warning] Documento de trabalho, datado
> Estado em 02/11/2026 (passagem para outra pessoa: `aplicacao-lmr/HANDOFF.md`). As regras permanentes estão em [[Aplicacao LMR - Regras de Montagem]].
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

## Workflow A — o que aconteceu de 27/10 a 02/11

- **IA do n8n** (GEV LLM Model + Basic LLM Chain; GPT-5.4-mini, Haiku 4.5, Gemini Flash 3): 820–1.240 de 3.580
  linhas iguais na Água Pura, mesmo em etapas pequenas (A v3). Modelos fracos para ler documento.
- **Agente do AMP no workflow** (nó `CUSTOM.amp`, descoberto em 28/10): Prompt lê `chatInput`, resposta em
  `output`; itens com o mesmo Session ID dividem a conversa; PDF em *Files* deu erro 424/500 com o Sonnet 5.5;
  texto da página no Prompt funciona. Workflow `LMR_A_agente_amp.json`: 4 etapas (áreas, conjuntos,
  equipamentos, materiais), perguntas de controle, página "Confira as áreas". Testado localmente com
  "agente perfeito" (Água Pura 3.580/3.580); **ainda não rodou no AMP**.
- Luan viu o **Gemini 3.5 Flash-Lite** ler no chat um PDF da SFC de 100+ páginas (escaneado) com acerto.

## Próximos passos

1. Rodar a sonda S10 com um agente **Gemini 3.5 Flash-Lite** (o PDF chega pelo *Files*?).
2. Aprovar o desenho direto: **Leitor** (Gemini 3.5 Flash-Lite, etapas 1–3) + **Ligador** (Sonnet 5.5, etapa 4)
   + validador final de formato e de pendências no código. Detalhe em `aplicacao-lmr/HANDOFF.md` §6.
3. Rodar no AMP com a Água Pura (BASE emitida como gabarito) e depois a Reg. Vel.
4. Testes no AMP ainda pendentes: C1/C2, S4 (Box), S7, S8.

## Pendências do Luan

- Nomes de área da equipe (SPN, SCP), lista fechada de locais, siglas de escopo.
- Pasta de teste no Box (o acesso do agente ao Box ficou para depois).

## Relacionados
[[Aplicacao LMR - Regras de Montagem]] · [[Secao - Aplicacao LMR]] · [[Plano de Acao - Aplicacao LMR]] ·
[[Diagnostico - Plano de Melhoria]] · [[SIG-FT - Modulos]]

# Agente LMR no AMP — configuração e primeiro teste (Água Pura)

## 1. Criar o agente (uma vez)

| Campo | O que colocar |
|---|---|
| Nome | `Leitor LMR` |
| Descrição | `Lê documentos técnicos (PDF) de um sistema da usina e devolve, em JSON, as áreas, as TAGs instaladas e a ligação de cada material sobressalente (PMIB) às TAGs, para montar a aplicação LMR. Trabalha em 4 etapas, com as mensagens do ROTEIRO gerado pelo workflow AG1.` |
| Modelo | **Claude Sonnet 5.5** (1º teste). No 2º teste: Claude Sonnet 4.6 com temperatura **0**, para comparar. |
| System prompt | todo o texto de `motor/agente/system_prompt.md` |
| Knowledge base | anexar `motor/agente/regras_lmr.md` e `motor/agente/formatos_json.md`. Se o AMP não aceitar `.md`, salve os dois como PDF ou Word com o mesmo nome. |
| Box | **não** conceder agora |

## 2. Importar os workflows no n8n do AMP (uma vez)

1. Importe `motor/workflows/LMR_AG1_preparar_etapas.json` e `motor/workflows/LMR_AG2_montar_base.json`.
2. Em cada um: ⋯ → *Settings* → *Save manual executions* = **Save**.
3. Nenhum dos dois tem nó de IA: não é preciso ligar modelo.

## 3. AG1 — preparar as etapas

1. Abra o **AG1**, clique em **Execute workflow**.
2. Envie os PDFs da Água Pura e o Status PMIB. Preencha: Escopo `UG`; Subsistema `ÁGUA PURA`; Trechos `TODAS`; Eixo `CD`;
   Frequência `Deixar pendência`; Kits `Sem TAG (1 por trecho, na área do equipamento)`; Peças `Levam a TAG do equipamento`.
   Deixe "Etapa de documentos" em branco.
3. A página final baixa **ROTEIRO LMR - {sistema}.xlsx**. Copie a mensagem final que aparece na página.

## 4. Agente — as 4 etapas (um chat NOVO por etapa)

Para cada etapa, na ordem 1, 2, 3, 4 (a aba **ROTEIRO** do arquivo lista tudo):

1. Abra um chat novo com o **Leitor LMR**.
2. Anexe os PDFs listados para a etapa e, a partir da etapa 2, os `.json` das etapas anteriores.
3. Abra a aba **ETAPA n** do roteiro, clique na letra **A** no topo da coluna, **Ctrl+C**, cole no chat e envie.
4. Quando o agente responder:
   - confira o inventário (páginas de cada anexo);
   - compare as respostas das perguntas de controle com a coluna **CORRETAS** da aba **CONTROLE**;
   - se errou uma página: peça "Leia de novo a página N do arquivo X e refaça a resposta"; se errar de novo, anote;
   - baixe o arquivo `.json` com o nome indicado no fim da mensagem.
5. A etapa 4 da Água Pura tem 2 partes (abas **ETAPA 4A** e **ETAPA 4B**): um chat para cada parte, com os mesmos anexos.

Etapa que o ROTEIRO manda **PULAR** (sistema sem esse tipo de documento): siga para a próxima.

## 5. AG2 — montar a Base

1. Abra o **AG2**, **Execute workflow**.
2. Envie o **ROTEIRO** (o mesmo arquivo, sem editar as abas CONFIG, CONTROLE, STATUS PMIB e ÍNDICE), **todos** os `.json`
   do agente e, para o teste, a **BASE LMR - Água Pura.xlsx** emitida (gabarito).
3. A página final baixa **BASE LMR - {sistema}.xlsx**.

## 6. O que me devolver

- A mensagem final do AG1 e a do AG2.
- Quantas perguntas de controle o agente errou em cada etapa (antes e depois de pedir para ler de novo).
- Quanto tempo levou cada etapa no agente e se alguma resposta veio cortada ou em partes.
- Salve o ROTEIRO, os `.json` do agente e a BASE gerada numa pasta nova `LMR/Ouputs agente/`, como foi feito com o Workflow A.

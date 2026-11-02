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

## 7. Fluxo A enxuto (`LMR_A_enxuto.json`): três agentes dentro do workflow

Ainda **não rodou no AMP**. Faça depois dos testes de `docs/planos/roteiro-testes-amp-2026-11-03.md`.

### Criar os dois agentes novos (uma vez)

O `Leitor LMR` continua como está na seção 1. Crie mais estes:

| Campo | Ligador LMR | Recuperador LMR |
|---|---|---|
| Descrição | `Liga cada material sobressalente (PMIB) às TAGs onde está instalado e devolve JSON, para montar a aplicação LMR. Recebe as mensagens do workflow LMR.` | `Procura nas páginas indicadas só o que faltou na leitura de um material e devolve JSON, para montar a aplicação LMR. Recebe as mensagens do workflow LMR.` |
| Modelo | Claude Sonnet 5.5 | Claude Sonnet 5.5 |
| System prompt | todo o texto de `motor/agente/system_prompt_ligador.md` | todo o texto de `motor/agente/system_prompt_recuperador.md` |
| Knowledge base | `motor/agente/kb/ligador_regras.md` e `ligador_formatos.md` | `motor/agente/kb/recuperador_regras.md` e `recuperador_formatos.md` |
| Box | **não** conceder | **não** conceder |

Se o AMP não aceitar `.md`, salve como PDF ou Word com o mesmo nome. Os arquivos de `kb/` são gerados: para mudar, altere `regras_lmr.md` ou `gerar_kb.js` e rode `node agente/gerar_kb.js`.

### Importar e rodar

1. Importe `motor/workflows/LMR_A_enxuto.json` e ative *Save manual executions*.
2. Nos 4 nós de agente, escolha *Credential* = a sua AMP account e *Custom Agent*:

   | Nó | Custom Agent |
   |---|---|
   | Agente E1, Agente E23 | Leitor LMR |
   | Agente E4 | Ligador LMR |
   | Agente R | Recuperador LMR |

3. Nos 4: *Prompt* = `{{ $json.chatInput }}`; *Session ID* = `{{ $json.sessionId }}`; *Files* vazio; *timeout* = o maior valor aceito.
4. **Execute workflow**, com as mesmas opções do Workflow A. A página final baixa um destes arquivos:
   - **BASE LMR - {sistema}.xlsx:** segue para o Workflow B. Revise PENDÊNCIAS, inclusive as do tipo RECUPERADOR.
   - **BLOQUEIO LMR - {sistema}.xlsx:** o Validador travou. A aba VIOLAÇÕES diz a linha e o motivo; corrija a causa e rode de novo.
5. Me devolva a mensagem final.

# Aplicação LMR: fluxo A enxuto com três agentes

Data: 02/11/2026. Parte de `aplicacao-lmr/HANDOFF.md` (estado em 02/11/2026) e substitui a proposta da §6 de lá.

## 1. Objetivo

Aumentar a **cobertura** da Base gerada a partir dos documentos: mais materiais com linha completa e menos trabalho
manual para a equipe. Sem deixar o fluxo complexo: uma versão anterior deste desenho, com 6 agentes e cerca de 75 nós,
foi recusada por isso.

Prioridade definida: **baixa cobertura é a falha mais grave**. O erro silencioso continua limitado pelo critério do
`PLANO.md` (no máximo 2%).

Fora do escopo: Workflow B, C1/C2, R e o formato da Base. Eles não mudam.

## 2. Fluxo

```
Formulário → Índice A1
 → Leitor (E1 áreas, E2 conjuntos, E3 equipamentos)
 → Confira as áreas (pessoa)
 → Ligador (E4: lista de sobressalentes + ligação às TAGs)
 → Recuperador (só o que faltou, uma passada)   ← novo
 → Monta a Base + Validador                     ← novo
 → Entrega a Base ou o arquivo de BLOQUEIO
```

É o fluxo de `LMR_A_agente_amp.json` com um bloco de agente a mais e o validador dentro do código que monta a Base.
Estimativa: cerca de 58 nós, contra 44 hoje. O workflow novo é outro arquivo, `LMR_A_enxuto.json`, gerado por
`workflows/gerar_agente.js`. O atual fica como está até o novo passar nos critérios da §7.

## 3. Agentes

| Agente no AMP | Etapas | Recebe | Devolve | Knowledge base |
|---|---|---|---|---|
| `Leitor LMR` (já existe, sem mudança) | E1, E2, E3 | Páginas por tipo de documento + áreas | `areas`, `tags` (formatos atuais) | A atual, completa: o workflow antigo ainda precisa dela |
| `Ligador LMR` | E4 | Páginas da lista de sobressalentes + áreas + tabela de TAGs | `materiais` (formato atual) | Glossário + §6 de `regras_lmr.md` |
| `Recuperador LMR` | Nova | Lacunas + páginas candidatas | `recuperacoes` (formato novo, §5) | Glossário + regras da §5 |

Modelo: `Ligador` e `Recuperador` usam Claude Sonnet 5.5. O `Leitor` depende da sonda (§4).

Cada chamada segue com sessão própria, até 80 mil caracteres e 25 materiais por lote no Ligador, como hoje.

**Regra de crescimento:** só se divide um agente quando a mensagem final de execuções reais mostrar que ele é o gargalo
(muitas falhas de chamada, respostas cortadas ou erros de controle concentrados nele).

## 4. Decisão dependente da sonda S10

Rodar `LMR_S10_sonda2_amp_agent.json` com um agente Gemini 3.5 Flash-Lite, temperatura 0, em dois arquivos: o P&ID de
1 página e uma página escaneada da SFC.

| Resultado | Leitor | Regra para valor fora do texto da página citada |
|---|---|---|
| Gemini recebe o PDF e lê a página escaneada | Gemini 3.5 Flash-Lite com o PDF | Fica na linha, com pendência CONFERIR (como o modo chat AG2 já faz) |
| Erro, ou só lê texto | Claude Sonnet 5.5 com texto (como hoje) | Sai e vira pendência (regra estrita de hoje), porque sem o PDF o agente não vê o desenho |

Qualquer outro resultado, como ler só parte das páginas, conta como a segunda linha.

## 5. Recuperador

Roda depois do Ligador, uma passada só. O código monta as lacunas, nesta prioridade:

1. PMIB sem nenhuma linha ou que não voltou na resposta do Ligador, inclusive os de lote sem resposta.
2. TAG sem área, ou TAG citada pelo Ligador que não existe na tabela de TAGs nem no texto.
3. Elevação da TAG e quantidade instalada de material sem TAG, vazias ou com formato inválido.

Campos da área (RDS-PP, local, eixo) não vão ao Recuperador: já passaram pela pessoa na página "Confira as áreas".
O que ficar vazio vira uma pendência por área.

Cada lacuna leva as páginas em que o índice A1 achou o código. Lacuna sem nenhuma página candidata não vai ao agente e
vira pendência direto.

Limites iniciais: 10 lacunas por chamada e 10 chamadas por execução. O que sobrar vira pendência.

Formato da resposta:

```json
{
  "etapa": "R", "parte": "1", "arquivos": [], "controle": [], "observacoes": [],
  "recuperacoes": [
    { "lacuna": "L-1", "achou": true, "campo": "area", "valor": "SKID",
      "evidencia": "#ST00=M00ABC10UZ010-UZ901&MPA010 p.5", "procurou": "" },
    { "lacuna": "L-2", "achou": false, "campo": "tag", "valor": null,
      "evidencia": "", "procurou": "#ST00=M00ABC10&MPB020 p.3" },
    { "lacuna": "L-3", "achou": true, "campo": "tag", "valor": ["GP101"], "papel": "peca",
      "evidencia": "#ST00=M00ABC10UZ010-UZ901&MPA010 p.5", "procurou": "" }
  ]
}
```

`papel` (`proprio` ou `peca`) é obrigatório quando `campo` é `tag`, porque a convenção de peças do formulário depende dele.

Regras aplicadas pelo código:

- Só preenche campo vazio ou inválido. Nunca altera valor válido.
- O valor passa pela regra de fonte da §4, igual aos outros agentes.
- `achou: false` vira pendência com o motivo e onde o agente procurou.

Isto não é o "conferente de IA" descartado no HANDOFF §6: ele não revisa nem corrige a Base, só procura o que faltou.

## 6. Validador e erros

**O validador trava a entrega** quando, depois do Recuperador, restar:

- PMIB sem linha **e** sem pendência com motivo;
- campo obrigatório vazio sem pendência;
- formato inválido: elevação (2 casas), eixo da lista, trecho, RDS-PP, CÓDIGO LMR ou TAG LMR.

Um PMIB sem linha, mas com pendência e motivo, não trava. O código só normaliza o que é certo (`98.5` → `98,50`).

**Quando trava:** o nó de entrega baixa `BLOQUEIO LMR - {sistema}.xlsx` no lugar da Base, com as abas `VIOLAÇÕES` e
`CHAMADAS DO AGENTE`, e a mensagem final mostra o total. Não há remontagem nesta versão: corrige-se a causa e roda-se de
novo.

| Falha | Reação |
|---|---|
| Erro temporário (limite, tempo, 424/500) | Como hoje: 60 s e até 3 tentativas |
| JSON inválido ou resposta cortada | Conta como erro temporário e usa as mesmas tentativas |
| Tentativas esgotadas | PENDÊNCIA CHAMADA; os itens do lote viram lacunas, se houver E4; o fluxo continua |
| Pergunta de controle errada | Como hoje: PENDÊNCIA CONTROLE |

**Mensagem final de toda execução:** PMIBs com linha e com pendência, chamadas e falhas por agente, erros de controle,
lacunas enviadas e resolvidas pelo Recuperador.

**Limitação aceita:** não há retomada. Se o n8n parar, recomeça do início.

## 7. Testes e fases

**Fase 0, sonda:** a §4.

**Fase 1, linha de base:** rodar `LMR_A_agente_amp.json` como está com a Água Pura, em execução manual, e guardar a
mensagem final e as divergências contra o gabarito. Sem isso não há como provar melhora. Esse fluxo também nunca rodou no
AMP, então a fase revela travamentos de plataforma antes de o fluxo crescer.

**Fase 2, construção e testes locais:**

- Testes novos com dados fictícios: montagem de lacunas, aplicação das recuperações, cada violação do validador, e cada
  falha da §6 na simulação nó a nó. Rodam em qualquer máquina.
- Regressão com dados reais, na máquina com o Box: com agente perfeito, os números do HANDOFF §9 não podem cair (3.580,
  3.740, 160, 452), e as assinaturas do Workflow B ficam iguais. Sem `dados/textos_*.json`, o gerador pula esse teste:
  pulado não conta como aprovado.

**Fase 3, AMP, em execução manual:** Água Pura contra a linha de base; depois Reg. Vel., Aeração e SFC; depois 3 execuções
por sistema.

**Critérios de aceite:**

- Cobertura maior que a linha de base nos 4 sistemas. A meta em número é fixada depois da Fase 1, quando houver medição real
  do modelo.
- Erro silencioso de no máximo 2%: linhas sem pendência que divergem do gabarito.
- Nenhum travamento de plataforma nas 3 execuções.

## 8. Arquivos

| Arquivo | Mudança |
|---|---|
| `motor/agente/agente.js` | Funções novas de lacunas, aplicação das recuperações e validação |
| `motor/agente/system_prompt.md`, `regras_lmr.md`, `formatos_json.md` | Dividir por agente, a partir da mesma fonte |
| `motor/agente/teste_workflow.js` | Casos novos da §7 |
| `motor/workflows/gerar_agente.js` | Gera `LMR_A_enxuto.json`, sem alterar a geração dos atuais |
| `motor/agente/CONFIGURAR_AGENTE.md` | Guia dos três agentes e do novo workflow |
| `aplicacao-lmr/HANDOFF.md`, `README.md`, `PLANO.md` | Registrar a decisão e o novo caminho |

Regras que continuam: dados reais fora do Git, nada sob medida para os sistemas de teste e `.json` de workflow nunca
editado à mão.

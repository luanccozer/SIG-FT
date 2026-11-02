# LMR: fluxo A enxuto (implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar `LMR_A_enxuto.json`: o fluxo A atual com Ligador próprio, passada do Recuperador e Validador que trava a entrega.

**Architecture:** A lógica nova fica em um módulo só, `agente/recuperacao.js`, testado com dados fictícios. As recuperações viram uma resposta sintética da etapa 4, que passa por `montaBaseDoAgente` como as outras, e assim herda as conferências existentes. `gerar_agente.js` monta os dois fluxos da mesma função, e `agente.js`, `leitura.js` e `lmr.js` não mudam.

**Tech Stack:** Node.js sem dependências (nós Code do n8n), testes em scripts `node`, como no resto de `motor/`.

**Spec:** `docs/superpowers/specs/2026-11-02-lmr-fluxo-a-enxuto-design.md`

**Comandos:** rodar em `aplicacao-lmr/motor/`. Os caminhos abaixo são relativos a essa pasta.

## Global Constraints

- Limites: 10 lacunas por chamada, 10 chamadas por execução, até 5 páginas candidatas por lacuna, 80 mil caracteres por chamada, uma passada só.
- Agentes: `Ligador LMR` e `Recuperador LMR` com `bedrock-claude-sonnet-5.5`; `Leitor LMR` sem mudança.
- `LMR_A_agente_amp.json`, `LMR_AG1_*`, `LMR_AG2_*` e Workflow B ficam funcionalmente iguais. Só o `LMR_A_enxuto.json` novo entra nos commits de `workflows/*.json`.
- `.json` de workflow nunca é editado à mão. Dados reais fora do Git. Nada sob medida para os sistemas de teste.
- Commits em português, sem acento, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sem push sem pedido explícito.
- Teste local pulado por falta de dados não conta como aprovado: diga isso no relato.

## Review Focus

1. Material em que o Recuperador devolve TAG fora do texto citado: deve virar pendência, nunca linha. (Task 2)
2. Resposta do Recuperador para lacuna que não foi pedida ou para campo já preenchido: deve ser ignorada e registrada. (Task 2)
3. Execução sem nenhuma lacuna: o loop do Recuperador precisa terminar e entregar a Base. (Task 4)
4. Área em branco depois de "Confira as áreas": deve gerar uma pendência por área e não travar a entrega. (Task 3)
5. Reexecução do gerador: os UUIDs mudam nos workflows antigos, então eles não podem ir no commit. (Task 4)

---

### Task 1: Lacunas e tarefas do Recuperador

**Files:**
- Create: `agente/recuperacao.js`, `agente/fixture_enxuto.js`, `agente/teste_enxuto.js`

**Interfaces:**
- Consumes: `AGENTE.montaBaseDoAgente`, `LEITURA.indiceCompacto`, `LMR.lerStatusPmib`.
- Produces, em `RECUPERACAO` (IIFE no padrão de `agente.js`, com `module.exports`):
  - `lacunas({ m, st, indexados }) -> { enviar: Lacuna[], semPagina: Lacuna[] }`, com `Lacuna = { id: 'L-1', pmib, campo: 'tag'|'area'|'elevacao'|'qtd_instalada', tag: string|null, prioridade: 1|2|3, paginas: [{ k, pagina }] }`. `m` é a saída de `montaBaseDoAgente`.
  - `tarefas(enviar, indexados, cfg) -> { tarefas: [{ etapa: 'R', parte, rotulo, sessionId, chatInput, lacunas: [ids], controle: [], pmibs: [], caracteres }], sobra: Lacuna[] }`, com sessão `${cfg.sessao}-r-p${parte}`.
- Produces, em `fixture_enxuto.js`: `{ statusRows, indexados, cfg, respostasBoas() }`: sistema fictício com 3 PDFs (MLU, MPA, MPB), 6 materiais, sem dado real. `respostasBoas()` devolve respostas das etapas 1 a 4 sem lacunas.

- [ ] **Step 1: Escrever os testes que falham em `agente/teste_enxuto.js`** (padrão `ok(cond, msg)`, sai com código 1 se houver falha)

```js
// sem lacunas: respostasBoas() → enviar e semPagina vazios
// prioridade 1: remove um material da E4 → { campo: 'tag', prioridade: 1, pmib, paginas.length >= 1 }
// prioridade 1: material com encontrado:false e sem tags, pais ou area → idem
// prioridade 2: TAG sem area → { campo: 'area', prioridade: 2, tag }
// prioridade 2: aviso "TAG X não está nos documentos (V8)" → { campo: 'tag', prioridade: 2, tag: 'X' }
// prioridade 3: TAG sem elevação em área sem elevação → { campo: 'elevacao', prioridade: 3, tag }
// prioridade 3: pendência QTD → { campo: 'qtd_instalada', prioridade: 3 }
// ordem: enviar ordenado por prioridade; ids sequenciais depois de ordenar
// sem página: lacuna de código que não aparece no índice → semPagina, fora de enviar
// páginas: nunca mais de 5 por lacuna
// tarefas: 25 lacunas → 3 chamadas de 10, 10 e 5; sobra vazia; sessões distintas
// tarefas: 120 lacunas → 10 chamadas e 20 em sobra, sobra com as de menor prioridade
// mensagem: cada chatInput contém o id de cada lacuna, "### arquivo — página N" e "RESPOSTA"; caracteres <= 80000
// mensagem: página repetida entre lacunas da mesma chamada aparece uma vez
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node agente/teste_enxuto.js`
Expected: FAIL, `Cannot find module './recuperacao.js'`

- [ ] **Step 3: Criar a fixture e implementar `lacunas` e `tarefas`**

Monte a fixture com `INDICE.indexaDocumento(arquivo, paginasTexto, catalogo)`, e um `statusRows` no formato lido por `LMR.lerStatusPmib`.

Fontes das lacunas: prioridade 1 vem de `m.leitura` (linha com `TAGS`, `PAIS` e `ÁREA` vazios); prioridade 2 de `m.base` (com `TAG` e sem `ÁREA/PAINEL`) e de `m.pendencias` (`TIPO: 'LEITURA'`, V8); prioridade 3 de `m.base` (com `TAG` e sem `ELEVAÇÃO`, uma lacuna por par PMIB e TAG) e de `m.pendencias` (`TIPO: 'QTD'`). Páginas candidatas: `indexados[k].materiais` pelo PMIB e `indexados[k].tags` por `valor`, só as com texto. Na prioridade 1, use também as páginas das TAGs de `ind.sug[pmib]`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node agente/teste_enxuto.js`
Expected: `TUDO OK`

- [ ] **Step 5: Commit**

```bash
git add agente/recuperacao.js agente/fixture_enxuto.js agente/teste_enxuto.js
git commit -m "LMR: lacunas e tarefas do Recuperador"
```

### Task 2: Aplicação das recuperações

**Files:**
- Modify: `agente/recuperacao.js`, `agente/teste_enxuto.js`

**Interfaces:**
- Consumes: `AGENTE.jsonDaResposta`, `AGENTE.leRespostas`, `Lacuna` da Task 1.
- Produces: `aplica({ respostasR: [{ arquivo, texto }], lacunas: Lacuna[], R, indexados }) -> { resposta: { arquivo: 'recuperador', texto } | null, pendencias: [{ PMIB, ITEM, 'DESCRIÇÃO', TIPO: 'RECUPERADOR', DETALHE }], enviadas: number, resolvidas: number }`. `resposta.texto` é JSON com `{ etapa: 4, parte: 'R', materiais: [...] }`, no formato atual. `R.materiais` vale como ponto de partida e o último bloco vence em `leRespostas`, então a resposta sintética entra depois da E4.

- [ ] **Step 1: Escrever os testes que falham**

```js
// tag: L-1 achou ["GP101"], papel "peca", GP101 no texto → material com a TAG, encontrado:true, papel:"peca"; resolvidas 1
// tag fora do texto: valor "ZZ999" → não entra; pendência TIPO RECUPERADOR citando ZZ999
// tag V8: troca só a TAG inválida apontada pela lacuna e mantém as outras
// area: preenche a TAG da lacuna, com nome das áreas; outras TAGs intactas
// elevacao: "98.5" → "98,50"; texto inválido → pendência
// qtd_instalada: material sem TAG recebe a quantidade; a evidência original é mantida e a nova, anexada
// achou:false → pendência com o conteúdo de "procurou"
// campo já preenchido: não altera; pendência citando o valor mantido
// lacuna desconhecida ou campo diferente do pedido: ignorada; pendência
// lacuna enviada sem resposta: pendência "sem resposta do Recuperador"
// resposta sem JSON válido: todas as lacunas daquela chamada viram pendência; nada quebra
// tag sem papel: pendência, não entra
// integração: montaBaseDoAgente com [...respostas, aplica().resposta] → PMIB recuperado tem linha com a TAG
// integração: sem lacunas → resposta null
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node agente/teste_enxuto.js`
Expected: FAIL, `RECUPERACAO.aplica is not a function`

- [ ] **Step 3: Implementar `aplica`**

Confira a TAG contra o texto das `lacuna.paginas`, com a mesma comparação sem espaços e em maiúsculas de `noTexto` em `leitura.js`, sem exportar nada novo de lá. Normalize elevação com `LMR.formataElevacao`. Quando o texto não confirmar a TAG, o motivo da pendência cita o valor sugerido.

- [ ] **Step 4: Rodar e ver passar**

Run: `node agente/teste_enxuto.js`
Expected: `TUDO OK`

- [ ] **Step 5: Commit**

```bash
git add agente/recuperacao.js agente/teste_enxuto.js
git commit -m "LMR: aplicacao das recuperacoes como resposta da etapa 4"
```

### Task 3: Validador e arquivo de bloqueio

**Files:**
- Modify: `agente/recuperacao.js`, `agente/teste_enxuto.js`

**Interfaces:**
- Consumes: `LMR.geraLote(linhasBase, tagsDaBase)`, `LMR.formataElevacao`.
- Produces:
  - `pendenciasDeArea(base, pendencias) -> Pendencia[]`: para cada área com `RDS-PP`, `LOCAL` ou `EIXO` vazio em alguma linha, uma pendência `{ PMIB: '', ITEM: '', 'DESCRIÇÃO': 'ÁREA x', TIPO: 'ÁREA', DETALHE }`.
  - `valida({ base, pendencias, catalogo, LMR }) -> Violacao[]`, com `Violacao = { REGRA, 'LINHA DA BASE', FICHA_PMIB, DETALHE }`.
  - `checaResposta(j) -> j | { ...j, error: { message } }`: `j` é a saída do nó AMP Agent.

- [ ] **Step 1: Escrever os testes que falham**

```js
// PMIB sem linha e sem pendência → REGRA 'PMIB'; com pendência de motivo → sem violação
// campo vazio (ÁREA/PAINEL, ELEVAÇÃO, EIXO, LOCAL, RDS-PP, TRECHOS, QTD POR TRECHO): sem pendência do PMIB ou da área → REGRA 'CAMPO'; com pendência → sem violação
// PAIS preenchido: ÁREA/PAINEL e RDS-PP vazios não violam
// formato: ELEVAÇÃO "98.5" → corrigida na própria linha, sem violação; "abc" → REGRA 'FORMATO'
// formato: EIXO "XY" e TRECHOS "U-99" → REGRA 'FORMATO'; RDS-PP com M inválido → REGRA 'FORMATO'
// CÓDIGO/TAG LMR: placeholder [XX] após gerar → REGRA 'FORMATO' (V2 do geraLote)
// pendenciasDeArea: 2 linhas da mesma área sem LOCAL → 1 pendência; não duplica a que já existe
// fixture completa: respostasBoas() → valida() vazio
// checaResposta: ```json válido com texto em volta → sem error; JSON cortado → error.message contém "temporar"; j.error existente → intacto; {"output":"{}"} → sem error
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node agente/teste_enxuto.js`
Expected: FAIL, `RECUPERACAO.valida is not a function`

- [ ] **Step 3: Implementar**

Em `valida`, rode `LMR.geraLote` e transforme em violação os `achados` com `SEVERIDADE: 'bloqueia'` de V2, V4, V5, V14 e V15. V1 fica de fora, porque vazio é tratado pela regra `CAMPO`. Avisos não travam. Em `checaResposta`, tente `JSON.parse` no maior bloco ```` ``` ```` e, sem bloco, do primeiro `{` ao último `}`. A mensagem de erro precisa bater com o regex `temporar` de `CONTA`, para usar as tentativas existentes. O módulo resolve `LEITURA` e `AGENTE` só quando precisa, porque `checaResposta` roda em nó Code sem as bibliotecas.

- [ ] **Step 4: Rodar e ver passar**

Run: `node agente/teste_enxuto.js`
Expected: `TUDO OK`

- [ ] **Step 5: Commit**

```bash
git add agente/recuperacao.js agente/teste_enxuto.js
git commit -m "LMR: validador da Base e checagem da resposta do agente"
```

### Task 4: Gerar o workflow `LMR_A_enxuto.json`

**Files:**
- Modify: `workflows/gerar_agente.js:306-413`
- Create: `workflows/LMR_A_enxuto.json` (gerado)
- Test: `agente/teste_enxuto.js`

**Interfaces:**
- Consumes: `RECUPERACAO.lacunas`, `tarefas`, `aplica`, `pendenciasDeArea`, `valida`, `checaResposta`.
- Produces: nós novos `Guarda E4`, `Planeja R`, `Lote R`, `Pausa R`, `Agente R`, `Erro? R`, `Conta tentativas R`, `Desiste? R`, `Pausa longa R`, `Confere R`, e `Checa E1`, `Checa E23`, `Checa E4`, `Checa R`. `Monta Base` e `Entrega a Base` mantêm o nome.

- [ ] **Step 1: Escrever os testes que falham, lendo o JSON gerado**

```js
const wf = require('../workflows/LMR_A_enxuto.json');
// nós entre 54 e 62; existem todos os nomes novos
// Agente E1 e E23: agentName "Leitor LMR"; E4: "Ligador LMR"; R: "Recuperador LMR"; modelo "bedrock-claude-sonnet-5.5"
// ligações: Lote E4 (saída 0) → Guarda E4 → Planeja R → Lote R; Lote R (saída 0) → Monta Base → Entrega a Base
// ligações: Agente X → Checa X → Erro? X, nos 4 loops
// Sem credencial no JSON; Leia-me cita os 3 agentes
// antigo: LMR_A_agente_amp.json com UUIDs removidos é igual ao do git (git show HEAD:...)
// simulação nó a nó com a fixture e agente fictício: sem lacunas, Planeja R devolve item vazia e a Base sai
// simulação: 1 material sem resposta → Recuperador responde → linha na Base; mensagem final conta 1 enviada e 1 resolvida
// simulação: Recuperador falha 3 vezes → PENDÊNCIA CHAMADA e pendência da lacuna; Base sai
// simulação: JSON cortado na E4 → repete; depois da última tentativa, PMIBs do lote viram lacunas
// simulação: violação forçada → arquivo "BLOQUEIO LMR - {sistema}.xlsx" com abas VIOLAÇÕES e CHAMADAS DO AGENTE, sem aba BASE
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node agente/teste_enxuto.js`
Expected: FAIL, `Cannot find module '../workflows/LMR_A_enxuto.json'`

- [ ] **Step 3: Transformar `agA` em `fluxoA({ nome, enxuto })`**

Com `enxuto: false` a saída é a de hoje. Com `true`: `loop()` recebe o nó do agente e insere `Checa` entre `Agente` e `Erro?`; o `Lote E4` vai para `Guarda E4` em vez de `Monta Base`. Inclua `recuperacao.js` só nos Code do fluxo enxuto.

`Planeja R` roda `montaBaseDoAgente`, `lacunas` e `tarefas`, e devolve as tarefas, ou um item `vazia` com `{ etapa: 'R', parte: '0' }` se não houver lacunas. `Monta Base` junta `aplica().resposta` às respostas, soma as pendências de `aplica`, `semPagina`, `sobra` e `pendenciasDeArea`, chama `valida` e decide o arquivo.

- [ ] **Step 4: Mensagem final e título por expressão**

`completionTitle` e `completionMessage` usam `$json.bloqueada`. Na Base: `MENSAGEM_A` + `lacunas enviadas` e `resolvidas`. No bloqueio: total de violações e as 3 primeiras. `chamadas` e `falhas` passam a sair por agente (`Leitor`, `Ligador`, `Recuperador`).

- [ ] **Step 5: Gerar, rodar e restaurar os antigos**

Run: `node workflows/gerar_agente.js && node agente/teste_enxuto.js`
Expected: `ok LMR_A_enxuto.json`, `TUDO OK`. Sem dados do Box, a primeira linha também diz `teste local pulado`: relate isso.

Run: `git restore workflows/LMR_AG1_preparar_etapas.json workflows/LMR_AG2_montar_base.json workflows/LMR_A_agente_amp.json`
Expected: `git status` mostra só `workflows/gerar_agente.js`, `workflows/LMR_A_enxuto.json` e `agente/teste_enxuto.js`.

- [ ] **Step 6: Commit**

```bash
git add workflows/gerar_agente.js workflows/LMR_A_enxuto.json agente/teste_enxuto.js
git commit -m "LMR: gera o workflow A enxuto com Ligador, Recuperador e Validador"
```

### Task 5: Configuração dos agentes e documentação

**Files:**
- Create: `agente/gerar_kb.js`, `agente/system_prompt_ligador.md`, `agente/system_prompt_recuperador.md`, `agente/kb/` (gerada: `ligador_regras.md`, `ligador_formatos.md`, `recuperador_regras.md`, `recuperador_formatos.md`)
- Modify: `agente/CONFIGURAR_AGENTE.md`, `agente/teste_enxuto.js`, `../HANDOFF.md`, `../README.md`, `../PLANO.md`

**Interfaces:**
- Consumes: seções `## ` de `regras_lmr.md` e `formatos_json.md`, que não mudam.
- Produces: `gerar_kb.js` escreve `agente/kb/`. Ligador: §1, §2, §6, §7, §8 das regras e o formato Etapa 4. Recuperador: §1, §2, §8 mais as regras abaixo, e o formato `recuperacoes`.

- [ ] **Step 1: Escrever os testes que falham**

```js
// kb gerada contém o glossário igual ao de regras_lmr.md
// ligador_regras.md tem "Etapa 4" e não tem "Etapa 1"; recuperador_formatos.md tem "recuperacoes" e "papel"
// cada prompt novo cita "WORKFLOW LMR", "bloco ```json" e "Use só o que está escrito"
// system_prompt.md, regras_lmr.md e formatos_json.md iguais ao git
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node agente/teste_enxuto.js`
Expected: FAIL, `ligador_regras.md` não existe

- [ ] **Step 3: Escrever `gerar_kb.js` e os dois prompts**

Prompt do Ligador: parte de `system_prompt.md`, só com a etapa 4. Prompt do Recuperador: responder uma vez cada lacuna da mensagem, procurar só nas páginas dela, não alterar nada, usar `achou: false` com `procurou` quando não encontrar, e `papel` obrigatório em `campo: "tag"`.

- [ ] **Step 4: Atualizar a documentação**

`CONFIGURAR_AGENTE.md`: nova seção com a tabela de campos dos agentes `Ligador LMR` e `Recuperador LMR` e a configuração dos 4 nós de agente. `HANDOFF.md` §6: a decisão aponta para a spec. `README.md`: nova linha na tabela de estado e o comando `node agente/gerar_kb.js`. `PLANO.md` §12: decisão registrada. Nenhum texto diz que o fluxo rodou no AMP.

- [ ] **Step 5: Rodar tudo**

Run: `node agente/gerar_kb.js && node agente/teste_enxuto.js && node teste_fase1.js`
Expected: `TUDO OK` no teste novo. `teste_fase1.js` depende dos dados do Box: sem eles, relate como não executado.

- [ ] **Step 6: Commit**

```bash
git add agente/ ../HANDOFF.md ../README.md ../PLANO.md
git commit -m "LMR: configuracao dos agentes Ligador e Recuperador e documentacao"
```

### Task 6: Regressão com dados reais (máquina com o Box)

**Files:**
- Modify: `agente/teste_workflow.js`

**Interfaces:**
- Consumes: `RECUPERACAO.valida`, `pendenciasDeArea`, `lacunas`.

- [ ] **Step 1: Adicionar a cada sistema de `teste_workflow.js`**

```js
ok(RECUPERACAO.valida({ base: m.base, pendencias: [...m.pendencias, ...RECUPERACAO.pendenciasDeArea(m.base, m.pendencias)], catalogo: st.catalogo, LMR }).length === 0, 'violação com agente perfeito');
```

Imprima também o total de lacunas por prioridade. Sistema sem dados continua pulado.

- [ ] **Step 2: Rodar na máquina com o Box**

Run: `node agente/teste_workflow.js`
Expected: `TUDO OK` e, por sistema, pelo menos 3.580, 3.740, 160 e 452 linhas iguais.

Se houver violação com agente perfeito, pare e leve a regra ao usuário: uma aplicação emitida reprovada indica validador rígido demais. Não enfraqueça a regra por conta própria.

- [ ] **Step 3: Regressão do Workflow B**

Run: `node workflows/gerar_workflows.js`
Expected: assinaturas iguais às do `README.md`. Depois restaure o `.json` gerado, se só os UUIDs mudaram.

- [ ] **Step 4: Commit**

```bash
git add agente/teste_workflow.js
git commit -m "LMR: validador na regressao dos 4 sistemas"
```

### Task 7: Testes no AMP (execução manual, pessoa)

Sem código. Cada passo devolve só resumos: dados reais ficam no AMP e no Box. Ordem da spec §7; passos 1 e 2 não dependem das Tasks 1 a 6.

- [ ] **Step 1: Sonda S10 com Gemini 3.5 Flash-Lite** com o P&ID e a página escaneada. Devolver: erro, `paginas`, `ve_desenho`, `como_leu`.

Se aprovar o PDF, a entrega do PDF ao Leitor recebe um plano complementar, porque o formato e o tamanho aceitos só serão conhecidos com o resultado. Reprovando, nada muda.

- [ ] **Step 2: Linha de base:** `LMR_A_agente_amp.json` com a Água Pura e o gabarito. Devolver a mensagem final. Em seguida, fixar a meta numérica de cobertura na spec.

- [ ] **Step 3: Criar os agentes** seguindo `CONFIGURAR_AGENTE.md`, importar `LMR_A_enxuto.json` e rodar a Água Pura. Devolver a mensagem final.

- [ ] **Step 4: Rodar Reg. Vel., Aeração e SFC.** Devolver as mensagens finais.

- [ ] **Step 5: Três execuções por sistema.** Critérios: cobertura maior que a linha de base, erro silencioso de no máximo 2%, nenhum travamento.

Só depois disso o `HANDOFF.md` pode dizer que o fluxo rodou no AMP e o `LMR_A_agente_amp.json` pode deixar de ser o caminho atual.

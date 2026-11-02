# Passagem — Aplicação LMR no AMP (estado em 02/11/2026)

Documento para quem continua o projeto. Junto com ele: a conversa exportada pelo Luan (histórico
completo), o [`PLANO.md`](PLANO.md) (decisões numeradas na §12; histórico técnico na §9B) e o
[`README.md`](README.md) (pastas e comandos).

## 1. Em uma frase

Gerar a **Base da Aplicação LMR** de um sistema (uma linha por material do Status PMIB em cada posição
instalada: área, RDS-PP, TAG, local, elevação, eixo, trechos) a partir dos PDFs do sistema, dentro do
n8n do AMP. A Base entra no **Workflow B**, que já funciona no AMP e gera a planilha de aplicação.

O gargalo é a **leitura dos documentos**. Montar os códigos já é regra, conferida por assinatura.

## 2. O que está pronto e o que já rodou no AMP

| Peça | Arquivo | Estado |
|---|---|---|
| Motor de regras | `motor/lmr.js` | pronto; reproduz as 5 aplicações emitidas (`teste_fase1.js`) |
| **B** Base → aplicação | `workflows/LMR_B_gerar_aplicacao.json` | **rodou no AMP** com os 5 sistemas |
| C1/C2 alterações | `LMR_C1_…`, `LMR_C2_…` | pronto localmente; **não rodou no AMP** |
| A1 índice dos PDFs (sem IA) | `LMR_A1_indice_documentos.json`, `LMR_A1_indice_box.json` | pronto localmente; versão Box não configurada |
| A v3 (IA do n8n em etapas pequenas) | `LMR_A_gerar_base.json` + `LMR_A_revisar_areas.json` | v1/v2 rodaram no AMP com resultado fraco (abaixo); **v3 não rodou** |
| AG1/AG2 (agente no chat, à mão) | `LMR_AG1_preparar_etapas.json`, `LMR_AG2_montar_base.json` | pronto localmente; **não rodou no AMP** |
| **A com agente AMP no workflow** | `LMR_A_agente_amp.json` (44 nós) | pronto localmente; **não rodou no AMP** — é o caminho atual |
| **A enxuto** (Leitor, Ligador, Recuperador + Validador) | `LMR_A_enxuto.json` (58 nós) | testado só com sistema fictício (`agente/teste_enxuto.js`); **não rodou no AMP nem na regressão com dados reais** |
| Sondas do nó AMP Agent | `LMR_S9_…`, `LMR_S10_…` | **rodaram no AMP** (resultados em `contexto/amp/`) |

Todo `.json` de `motor/workflows/` é **gerado** por um `gerar_*.js`: mude o gerador ou o módulo e rode de novo.

## 3. Por que o caminho mudou três vezes (não repetir)

1. **IA do n8n (GEV LLM Model + Basic LLM Chain)**: modelos disponíveis = azure-gpt-5-4-mini, Claude Haiku 4.5,
   Gemini Flash 3 (Bedrock Nova Pro não testado). Na Água Pura deram 820–1.240 de 3.580 linhas iguais ao gabarito,
   mesmo com etapas pequenas e regras no código. Conclusão do Luan: modelos fracos demais.
2. **Agente do AMP no chat (AG1/AG2)**: modelos fortes, mas o usuário faria 4+ etapas à mão por sistema.
3. **Agente do AMP dentro do workflow** (nó `CUSTOM.amp`, descoberto em 28/10): é o caminho atual.

## 4. Fatos do AMP (confirmados; a fonte está entre parênteses)

**n8n**
- Nós que funcionam: Form Trigger, n8n Form (página no meio do fluxo e página final com arquivo), Extract from File
  (xlsx, pdf, text), Convert to File, Code (JS e Python), IF, Switch, Loop Over Items (`splitInBatches` v3), Split Out,
  Wait, Basic LLM Chain, GEV LLM Model (`CUSTOM.liteLLMChat`), GEV Box (`CUSTOM.GEVBox`, credencial `boxOAuth2Api`).
- **Não existe** nó `compression`. O **AI Agent** padrão (v3.1) **não aceita** o GEV LLM Model.
- **Merge trava** com ramo vazio → fluxos lineares. O **Code** roda num task runner limitado: trava ao devolver
  milhares de itens ou ao reler resultados grandes ("isolate for this caller is no longer available").
- Extract from File (PDF) junta com `join('')` os textos na mesma altura → TAGs coladas (`BL315FL314S`);
  `indice.js` separa. Texto de PDF traz U+FFFF, que corrompe o `.xlsx` (`planilha.js` remove).
- 50 execuções **publicadas** por mês; execuções manuais não contam (ativar *Save manual executions*).
- Limite de requisições da IA ("too many requests"): pausas e novas tentativas nos workflows.
- O formulário entrega **um** arquivo no fim.

**Nó AMP Agent** (`CUSTOM.amp` v1; export em `contexto/amp/no_amp_agent_export.json`)
- Campos: Credential, Custom Agent (`agentId` = `{"agentName":"…","model":"…"}`), **Prompt** (padrão lê
  `$json.chatInput`), **Files**, **Session ID**; opções `qualifier` (não testada) e `timeout`.
- Saída: `output` (texto da resposta), `sessionId`, `files`.
- Itens do mesmo nó com o mesmo Session ID **dividem a conversa** → uma sessão por chamada.
- **S9**: com PDF em Files, o agente (Sonnet 5.5) viu só o **nome** do arquivo.
- **S10**: PDF em Files + pedido para abrir → **erro 424 / 500 from runtime**; **texto da página no Prompt funciona**
  (Sonnet 5.5 devolveu 15 TAGs certas de um P&ID). O Session ID do export tinha uma crase sobrando: conferir.
- **Não testado ainda:** Files com um agente **Gemini**. O Luan viu o Gemini 3.5 Flash-Lite, no chat, ler um PDF de
  100+ páginas da SFC (grande parte escaneada) e extrair TAGs, quantidades e aplicações corretas, com o Status PMIB
  e a aplicação LMR anexados. Se o Files funcionar com Gemini, o Leitor passa a ver desenhos e páginas escaneadas.

**Agentes do AMP** (configurados na interface: descrição, modelo, system prompt, Knowledge base, acesso ao Box)
- Modelos: Claude Sonnet 5.5, Sonnet 5, Sonnet 4.6 (com temperatura); GPT-6 Luna, GPT-5.4; Gemini 3.5 Flash-Lite
  (com temperatura), Gemini 3.1 Flash-Lite, Gemini 3 Flash.
- No chat, o agente lê PDFs anexados; só vê como imagem as páginas "indexadas como visuais"
  (`contexto/limitacoes-amp/`). Acesso ao Box: decidido **não usar por enquanto**.
- Agente existente: **Leitor LMR** (Sonnet 5.5) com `motor/agente/system_prompt.md` e Knowledge base
  `regras_lmr.md` + `formatos_json.md`. Cada pessoa precisa do agente na própria conta do AMP.

## 5. Como o workflow atual funciona (`LMR_A_agente_amp.json`)

```
Formulário (PDFs + Status PMIB + opções) → índice A1 (sem IA, texto por página)
 → E1 Áreas → E2 Conjuntos + E3 Equipamentos (com os nomes das áreas)
 → página "Confira as áreas" (a equipe completa elevação, RDS-PP, trechos)
 → E4 Materiais (25 por chamada: páginas da lista, áreas, tabela de TAGs das etapas 2/3)
 → monta a Base (regras + PENDÊNCIAS) → baixa BASE LMR - {sistema}.xlsx
```
- O agente recebe o **texto** das páginas (não o PDF), até 80 mil caracteres por chamada, só páginas com TAG,
  RDS-PP, elevação ou código de material. Água Pura = 14 chamadas, Reg. Vel. = 17, Aeração = 4, SFC = 10.
- **Perguntas de controle**: "arquivo X, página N: quais destes códigos estão escritos?" (3 certos + 2 falsos);
  erro → PENDÊNCIA CONTROLE. Erro temporário do agente → 60 s e nova tentativa (até 3) → PENDÊNCIA CHAMADA.
- Regra estrita: valor que não está no texto extraído sai (vira PENDÊNCIA). No modo chat (AG2), o valor fica com
  PENDÊNCIA **CONFERIR**, porque ali o agente vê a imagem.
- Lógica em `motor/agente/agente.js` (`tarefasWorkflow`, `contextoDasRespostas`, `montaBaseDoAgente`), que usa
  `leitura.js` (`confereMateriais`, `montaBase`, `leAreas`, `formAreas`) e `lmr.js`.

## 6. Decisão em aberto (o próximo passo)

> **Atualização de 02/11/2026:** o desenho abaixo foi substituído pelo fluxo enxuto, com três agentes e o Validador:
> [`docs/superpowers/specs/2026-11-02-lmr-fluxo-a-enxuto-design.md`](../docs/superpowers/specs/2026-11-02-lmr-fluxo-a-enxuto-design.md) (plano em `docs/superpowers/plans/`).
> Falta confirmar com o Luan que o Recuperador respeita o descarte do "conferente de IA". Próximos testes:
> [`docs/planos/roteiro-testes-amp-2026-11-03.md`](docs/planos/roteiro-testes-amp-2026-11-03.md). O texto abaixo fica como histórico.

Na última conversa o Luan pediu **um fluxo direto, só com os agentes necessários**, e deu liberdade total.
A proposta abaixo **não foi aprovada ainda** (a conversa parou na passagem):

| Agente | Modelo | Faz | Etapas |
|---|---|---|---|
| **Leitor LMR** | Gemini 3.5 Flash-Lite, temperatura 0 | lê os documentos e devolve fatos com página | E1, E2, E3 |
| **Ligador LMR** | Claude Sonnet 5.5 | liga cada PMIB às TAGs (próprio/peça/kit, pai, frequência) | E4 |

- Código (sem agente): ordem, novas tentativas, controle, regras LMR, página de áreas, montagem e um
  **validador final** que trava a entrega: todo PMIB com linha ou pendência com motivo; todo campo obrigatório
  vazio com pendência; formato linha a linha (elevação 2 casas, eixo da lista, trecho válido, RDS-PP, CÓDIGO e TAG LMR).
- Primeiro teste: rodar a sonda **S10** com um agente Gemini 3.5 Flash-Lite. Se o PDF chegar pelo Files, o Leitor
  recebe o PDF; senão, continua o texto.
- Ideias discutidas e **descartadas** pelo Luan ("fomos longe demais"): agente gerente (o workflow já faz),
  conferente de IA que corrige a Base, especialista que lê workstatement/descritivos (Ficha do sistema).
  Achado que vale guardar: o workstatement da Reg. Vel. (571 p.) cobre o regulador inteiro e outros subsistemas, e o
  da Aeração cita mais outro sistema (MEA33) que a própria Aeração; números em títulos de capítulo não são quantidades.

## 7. Regras de domínio (resumo; completas no PLANO §3 e §12 e em `motor/agente/regras_lmr.md`)

- CÓDIGO LMR: `{ESCOPO} - {SUBSISTEMA} - {ÁREA/PAINEL} - RDS-PP: {RDS-PP} - {LOCAL} - ELEV. {xx,xx} - EIXO {..} - TRECHO {..}`.
  TAG LMR: `{ESCOPO} - {TAG} - RDS-PP: {RDS-PP}{TAG} - {DESCRIÇÃO}`; sem RDS próprio `{ESCOPO} - {TAG} - {DESCRIÇÃO}`.
- **QTD = quantidade instalada**, nunca a de reposição da lista de sobressalentes.
- UG: `#ST50` → M01–M09 e M19 (U-09A); `#ST60` → M10–M18 e M20 (U-18A). Ímpares/pares pela posição física.
- Frequência: documento → RDS-PP (#ST50/#ST60) → outros documentos → descrição do Status → lista → formulário.
  "50/60 Hz" = AMBAS.
- Kits (escolha no formulário): Reg. Vel. e Aeração = *levam a TAG do equipamento*; Água Pura = *sem TAG, na área*.
  Peças: Reg. Vel. = *citam o equipamento como PAI*; os outros = *levam a TAG*.
- TAG da lista que nenhum outro documento cita → troca pela única TAG de mesmo código com outra letra final
  (QM408G → QM408V), com registro.
- Nomes de área da equipe (SPN, SCP) não aparecem nos documentos: vêm da página "Confira as áreas".

## 8. Rodar os testes (na máquina com o Box)

Os dados reais ficam fora do Git, em `DocManager Itaipu/Docs Aconex/LMR/` no Box (`motor/dados/`, `Exemplo docs/`,
`Exemplo - PMIB/`, `Exemplos/`). Para recriar `motor/dados/`:
`python -X utf8 extrair.py` e, para os textos dos PDFs, `npm i pdfjs-dist@4.10.38` e
`node indice/extrai_como_n8n.mjs "<pasta de PDFs>" dados/textos_{sistema}.json`.

| Comando (em `motor/`) | Esperado |
|---|---|
| `node teste_fase1.js` | TUDO OK |
| `node workflows/gerar_workflows.js` | assinaturas do README (B inalterado) |
| `node alteracoes/teste_c.js` | TUDO OK |
| `node leitura/teste_a.js` | TUDO OK (A v3 com "IA perfeita") |
| `node workflows/gerar_a.js` | T1–T12 OK |
| `node agente/teste_agente.js` | TUDO OK (modo chat: Água Pura 3.580/3.580) |
| `node agente/teste_workflow.js` | TUDO OK (modo workflow; números na §9) |
| `node workflows/gerar_agente.js` | gera AG1, AG2 e A agente; simulação nó a nó 3.580/3.580; TUDO OK (precisa de Python + openpyxl) |

"IA/agente perfeito" (`leitura/oraculo.js`, `agente/perfeito.js`) = respostas tiradas da Base emitida: mede o
fluxo e as regras, não o modelo. A medida do modelo só existe no AMP.

## 9. Números de referência (agente perfeito, linhas da aplicação iguais à emitida)

| Sistema | Modo chat (vê imagem) | Modo workflow (texto + página de áreas) | Teto da v3 |
|---|---|---|---|
| Água Pura | 3.580/3.580 | 3.580/3.580 | 3.460 |
| Reg. Vel. | 3.740/6.030 | 3.740/6.030 | 3.550 |
| Aeração | 480/760 | 160/760 (elevação por TAG só no desenho) | 160 |
| SFC | 452/452 sem o nome da área | 452/452 sem o nome da área | 452 |

O que sobra é divergência entre a lista de sobressalentes R1A e a aplicação emitida (CN010 × CN401/CN402, QN406R,
BP316T, QN203R, GP231/MA231, KF041–43) ou dado que só existe no desenho.

## 10. Pendências

**Do Luan / equipe:** aprovar o desenho da §6; rodar a sonda S10 com agente Gemini; rodar o A agente AMP com a
Água Pura (gabarito) e depois a Reg. Vel.; nomes de área da equipe; lista fechada de locais; siglas de escopo;
pasta de teste no Box; testes no AMP de C1/C2.

**Técnicas:** validador final de formato (§6); envio do PDF ao Leitor se o Files funcionar; leitura das páginas
escaneadas (SFC: 263 de 594 páginas sem texto); o guia no Claude Docs (link no README) está desatualizado
(cobre só o B).

## 11. Como trabalhar com o Luan

- Português; passo a passo sem ambiguidade (ele nunca tinha usado n8n). Ele devolve a **mensagem final** de cada
  execução e salva as saídas em `LMR/Ouputs …/` no Box.
- **Nada sob medida para os sistemas de teste**: a ferramenta vai para vários sistemas. Testar sempre nos 4
  sistemas com textos (Água Pura, Reg. Vel., Aeração, SFC).
- **Dados reais fora do Git** e fora de conversas com IA sem anonimização. Box: só escrever com ordem explícita.
- Propostas antigas (pasta `contexto/`) são histórico, não decisões. Decisões ficam na §12 e na §9B do PLANO e nas
  notas do cofre (`gestao-sobressalentes/07 - Diagnostico/Plano - Automacao da Aplicacao LMR no AMP.md`).

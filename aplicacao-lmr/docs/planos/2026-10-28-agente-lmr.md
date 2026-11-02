# Base LMR com agente do AMP — plano de implementação

> Execução: superpowers:executing-plans (nativo, nesta sessão). Sem git nesta pasta: sem commits.

**Objetivo:** gerar a Base da Aplicação com a leitura feita por um agente do AMP (modelo forte), em 4 etapas
conferidas, com o n8n preparando cada etapa e montando a Base no fim (sem IA no n8n).

**Arquitetura:** `AG1 Preparar etapas` (n8n) indexa os PDFs (A1), separa as páginas por etapa, gera as mensagens
prontas e as perguntas de controle e entrega um `ROTEIRO LMR - {sistema}.xlsx`. O usuário roda as 4 etapas no
agente (um chat por etapa) e salva os JSONs. `AG2 Montar Base` (n8n) lê o roteiro + JSONs, confere (controle,
TAG no texto, elevação escrita, QTD sem fonte) e reaproveita `LEITURA.confereMateriais` e `LEITURA.montaBase`.

**Tech:** JavaScript sem dependências (cola em nó Code), `planilha.js` para o .xlsx, testes em Node com os dados locais.

## Restrições globais
- Nada sob medida para os sistemas de teste: classificação por tipo de documento e sinais genéricos do texto.
- Dados reais não saem da máquina; prompts e Knowledge base sem dados reais.
- O formulário do n8n entrega 1 arquivo; o AMP não corta PDF; 50 execuções publicadas/mês (2 por sistema).
- Célula do Excel ≤ 32.767 caracteres (texto de página dividido em colunas de 30.000).
- Gabarito do controle nunca vai na mensagem do agente.

## Etapas do agente
| Etapa | Documentos (por página) | Saída |
|---|---|---|
| 1 Áreas | MLU; páginas com elevação + planta/corte/arranjo/layout/vista | `areas` |
| 2 Conjuntos | MPA, APA, MTB, MTC, EFF, EPA, MLD; páginas com "lista de materia" | `tags` (+ `areas` novas) |
| 3 Equipamentos | todo o resto (MFB, MFE, MDB, ACC, sem tipo…) | `tags` (+ `areas` novas) |
| 4 Materiais | MPB | `materiais` (formato de `confereMateriais` + `encontrado`, `papel`) |

Toda resposta: `etapa`, `parte`, `arquivos` (inventário), `controle` ([{id, presentes}]), `observacoes`.

## Tarefas
1. **`motor/agente/agente.js`** — `ETAPAS`, `etapasDasPaginas(indexados, sobrepor)`, `controle(indexados, etapas)`,
   `roteiro(indexados, st, cfg)`, `abasDoRoteiro(r, statusRows, indexados, cfg)`, `leRespostas(textos)`,
   `conferirControle(gabarito, controle)`, `montaBaseDoAgente(e)`. LEITURA passa a exportar
   `titulosDeDocumentos, confereTagDaLista, normArea`.
2. **`motor/agente/system_prompt.md`, `regras_lmr.md`, `formatos_json.md`** — system prompt e Knowledge base.
3. **`motor/agente/teste_agente.js`** — 4 sistemas com "agente perfeito" (oráculo do gabarito) e casos ruins:
   controle errado, TAG inventada, elevação inventada, material faltando, JSON com cerca ```json, etapa 4 em partes,
   ida e volta do Status e do ÍNDICE pelo .xlsx. Regressão: `teste_a.js`, `teste_fase1.js`, `gerar_a.js` seguem OK.
4. **`motor/workflows/gerar_agente.js`** → `LMR_AG1_preparar_etapas.json`, `LMR_AG2_montar_base.json`, com simulação
   nó a nó (Água Pura) e conferência do .xlsx do roteiro.
5. **Documentação** — Plano §9B, memória, guia de uso (roteiro passo a passo).

## Foco de revisão
- PDF grande (571 p.): controle no início, meio e fim; páginas sem texto listadas para leitura visual.
- Agente que devolve JSON com texto em volta, cercas de código ou cortado → leitura tolerante e aviso.
- Mesma TAG em duas áreas (conjuntos iguais) → uma linha por área.
- Etapa pulada (sistema sem aquele tipo de documento) → Base sai, sem erro, com aviso.
- Material que o agente não achou → PENDÊNCIA, nada inventado.

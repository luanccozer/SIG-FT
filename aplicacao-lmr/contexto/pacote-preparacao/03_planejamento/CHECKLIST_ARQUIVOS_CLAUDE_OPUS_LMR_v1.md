# Checklist de arquivos para a sessão Claude Opus 5.5 — LMR

## A. Arquivos essenciais do novo piloto

- [ ] Workstatement vigente do novo sistema.
- [ ] Lista mestre oficial de materiais/PMIBs do novo sistema.
- [ ] Planilha-modelo correta de aplicação LMR, que será preenchida pelo motor Python.
- [ ] Arranjos gerais, layouts e desenhos de conjunto pertinentes.
- [ ] Fluxogramas e P&IDs pertinentes.
- [ ] Listas de materiais e documentos de referência que contenham TAG, RDS-PP, quantidades e contexto de aplicação.
- [ ] Documentos técnicos adicionais citados no Workstatement ou nas referências.
- [ ] Informação sobre revisões vigentes/supersedidas, se existir.
- [ ] Regras confirmadas do projeto: escopo, subsistema, trecho/unidades, frequências, eixo, elevação, localização, base de quantidade, fonte/hierarquia por campo e formato final.

## B. Artefatos de arquitetura a entregar a Claude

- [ ] `Preparacao_Sessao_Claude_Opus_5_5_LMR_v1_0.md` — dossiê de contexto.
- [ ] `PROMPT_INICIAL_Claude_Opus_5_5_LMR.txt` — instrução inicial com escopo limitado à auditoria.
- [ ] `Arquitetura_e_prompts_agentes_LMR_v0_2.md` — arquitetura proposta dos dois agentes.
- [ ] `contrato_dados_lmr_v1_0.md` — contrato JSON preliminar.
- [ ] `schema_dados_lmr_v1_0.schema.json` — schema preliminar.
- [ ] `exemplo_estrutura_lmr_v1_0.json` — exemplo meramente estrutural.
- [ ] `system_prompt_extracao_lmr_v0_1.md` ou `.txt` — prompt anterior para auditoria/reutilização seletiva.
- [ ] `roteiro_operacional_lmr_v1.md` — etapas e critérios de aceitação.
- [ ] `Relatorio_Completo_Atualizacao_Aplicacao_LMR_v1_0.pdf` (ou DOCX) — histórico e decisões anteriores.

## C. Arquivos da Água Pura: rotular como HISTÓRICOS

Usar apenas para entender cabeçalhos/formato ou fazer regressão quando apropriado. Não utilizar como fonte técnica do novo projeto sem autorização explícita.

- [ ] `Tabela_TAGS(2).xlsx` — tabela legado, não deve ser recriada no novo fluxo.
- [ ] `Tabela_TAGS_R3.xlsx` — versão histórica/alternativa; não assumir que é a versão vigente de outro sistema.
- [ ] `APLICAÇÃO LMR - Água Pura.xlsx` — modelo e registros históricos de Água Pura; verificar qual aba é modelo e quais dados são do projeto antigo.
- [ ] `#ST00=M00MKF10&MPB020_STATUS_PMIB.xlsx` — lista de materiais histórica da Água Pura.
- [ ] `#ST00=M00MKF10&MFB030[0]_P&ID.pdf` — P&ID histórico de Água Pura.
- [ ] `aplicacao_lmr_agua_pura.html` e `tabela_tags_agua_pura.html` — saídas históricas, não fontes universais.
- [ ] `lista_preliminar_pais_filhos_agua_pura.xlsx`, `consolidado_pais_filhos_agua_pura.xlsx`, imagens e demais análises de relações — auxiliares históricos; não transportar relações automaticamente.

## D. Verificação antes de começar

- [ ] O Workstatement do novo sistema foi distinguido dos documentos da Água Pura.
- [ ] A lista mestre do novo sistema foi identificada e sua cobertura pode ser contada.
- [ ] O modelo de saída LMR correto foi identificado.
- [ ] Todas as fontes possuem nome/revisão/localizadores preserváveis.
- [ ] O usuário sabe que o primeiro resultado de Claude será um inventário e relatório de lacunas, não o sistema final.
- [ ] Nenhum arquivo original será sobrescrito.

## E. Não considerar como aprovado ainda

- [ ] Contrato JSON v1.0.
- [ ] JSON Schema v1.0.
- [ ] System Prompt de agente único v0.1.
- [ ] Arquitetura de dois agentes v0.2.

Os artefatos acima são pontos de partida que Claude deverá reconciliar. A versão aprovada só deve ser declarada após revisão e testes de aceitação.

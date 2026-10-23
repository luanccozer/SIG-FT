# Dossiê de preparação — Sessão Claude Opus 5.5
## Projeto: padronização e automatização da aplicação LMR

**Versão:** 1.0.0  
**Data de preparação:** 21/10/2026  
**Status:** briefing operacional para iniciar a próxima sessão; não representa validação final do sistema.

---

## 1. Objetivo da sessão

Usar o Claude Opus 5.5 como parceiro técnico para consolidar e implementar, de maneira incremental e testável, um fluxo de aplicação LMR consistente e reutilizável entre projetos.

O objetivo não é simplesmente gerar uma aplicação isolada. É desenvolver um processo em que:

1. os parâmetros gerais do projeto sejam coletados e confirmados uma única vez;
2. um agente especializado investigue os documentos técnicos e levante quantidades, TAGs, RDS-PP e local de aplicação com evidência rastreável;
3. o levantamento seja revisto e aprovado;
4. um segundo agente transforme o levantamento aprovado em um JSON canônico, aderente a um contrato documentado;
5. Python valide o JSON, execute as regras determinísticas e preencha a planilha de aplicação LMR;
6. testes de aceitação demonstrem cobertura, rastreabilidade e consistência antes do uso operacional.

**Princípio principal:** IA lê e estrutura informações com evidência; regras aprovadas e Python fazem as operações repetíveis; decisões técnicas não comprovadas ficam pendentes de validação humana.

## 2. Contexto e decisões já estabelecidas

### 2.1 Mudança principal de arquitetura

A antiga Tabela_TAGS não será uma etapa obrigatória do fluxo futuro. O JSON substituirá a Tabela_TAGS como base estruturada de dados. O sistema não deve reconstruir a Tabela_TAGS em Excel para depois convertê-la em JSON.

### 2.2 Dois agentes especializados

**Agente 1 — Levantamento Técnico Documental**
- Recebe o Workstatement, a lista mestre de materiais/PMIBs e os documentos técnicos relevantes: arranjo geral, fluxogramas, listas de materiais, P&IDs, layouts, desenhos e documentos complementares autorizados.
- Pesquisa cada item da lista mestre e identifica quantidades aplicadas, diferenças por frequência, TAGs, RDS-PP exatos e área/painel quando houver evidência.
- Registra arquivo, revisão, folha/página/aba, região ou localizador e método de identificação.
- Produz `Base_Aplicacao_LMR.xlsx`, com as abas `Resumo_Aplicacao`, `Ocorrencias_Documentais` e `Pendencias`.
- Não gera `CÓDIGO_LMR` nem `TAG_LMR` finais e não inventa dados ausentes.

**Ponto de revisão humana**
- O usuário revisa o resumo, a cobertura, as diferenças por frequência, os registros não encontrados e os conflitos.
- A base intermediária só é considerada aprovada depois da confirmação explícita.

**Agente 2 — Estruturador JSON**
- Recebe o Workstatement para entender o sistema, a configuração de projeto previamente confirmada e a `Base_Aplicacao_LMR.xlsx` aprovada.
- Estrutura os dados segundo o contrato JSON oficial.
- Não deve reabrir a interpretação técnica dos desenhos nem criar quantidades, TAGs ou relações ausentes do levantamento aprovado, salvo que o usuário inicie explicitamente uma revisão documental.
- Mostra resumo de cobertura e pendências antes de emitir o JSON integral, conforme o fluxo de confirmação acordado.

**Python — Validador e motor de aplicação**
- Valida o JSON Schema e regras semânticas (IDs únicos, referências existentes, cobertura de PMIBs, coerência de instâncias, campos críticos e pendências).
- Monta `CÓDIGO_LMR` e `TAG_LMR` com regras versionadas, não com geração livre por IA.
- Preenche uma cópia da planilha-modelo de aplicação LMR, preservando o arquivo original e suas abas/formatação.
- Emite relatório de validação e pendências.

### 2.3 Confirmações gerais do projeto

Antes do levantamento, devem ser confirmados em um único bloco, sempre que possível:
- projeto e sistema;
- limites do sistema definidos no Workstatement;
- escopo e subsistema;
- trechos, unidades e frequências;
- eixo e exceções;
- elevação e exceções;
- local de aplicação/área/painel e como identificá-lo;
- RDS-PP esperados e regras de preservação;
- significado de quantidade: total do sistema, por UG, por conjunto, por painel ou outra base;
- como tratar diferenças por frequência e itens comuns;
- lista mestre de materiais que precisa ser coberta;
- hierarquia de documentos/revisões e decisão em conflito;
- critérios de vínculo PMIB–TAG–RDS-PP;
- fontes autorizadas;
- valores permitidos para a coluna `Status` da aplicação final.

Os valores sugeridos pelos agentes devem vir acompanhados da fonte. Um valor não documentado deve ser mostrado como pergunta ou proposta, nunca como fato.

### 2.4 Dois pontos de confirmação, evitando ciclos

1. **Configuração:** o usuário confirma parâmetros gerais e regras do projeto.
2. **Aprovação do levantamento:** o usuário revisa o resumo e as exceções antes de o Agente 2 gerar o JSON completo.

Não perguntar repetidamente sobre cada registro sem necessidade. Casos claros e rastreáveis devem seguir automaticamente; perguntas devem ser consolidadas por tema e impacto.

## 3. Papel e limitações dos modelos

O usuário observou, em testes práticos no AMP corporativo, que o Gemini Flash Lite tende a ser forte na leitura de documentos e que Claude tende a lidar bem com raciocínio, organização e construção de artefatos. Isso é uma observação operacional do usuário, não garantia universal de desempenho.

Para a sessão com Claude Opus 5.5:
- usar a capacidade de raciocínio para auditar a arquitetura, harmonizar contratos, desenhar fluxos, prompts, regras e testes;
- não permitir que o modelo substitua dados de origem por conhecimento externo;
- não pedir que ele resolva todo o projeto de uma só vez;
- exigir evidência rastreável em cada resultado técnico importante;
- executar uma etapa por vez e manter registros de decisões e testes.

## 4. Inventário de artefatos anteriores

Estes documentos representam o histórico de desenho do processo e devem ser lidos antes de propor mudanças.

| Artefato | Papel | Estado e cuidado |
|---|---|---|
| `Arquitetura_e_prompts_agentes_LMR_v0_2.md` | Arquitetura mais recente dos dois agentes e proposta da `Base_Aplicacao_LMR.xlsx` | Principal ponto de partida arquitetural; proposta para revisão/piloto, ainda não congelada. |
| `contrato_dados_lmr_v1_0.md` | Especificação inicial do JSON que substitui a Tabela_TAGS | Preliminar; precisa ser compatibilizada com a arquitetura de dois agentes. |
| `schema_dados_lmr_v1_0.schema.json` | JSON Schema inicial | Preliminar; não considerar definitivo até alinhar nomes, tipos, evidências e campos com o contrato aprovado. |
| `exemplo_estrutura_lmr_v1_0.json` | Exemplo de JSON | Ilustrativo; não é fonte técnica nem dado real para outro projeto. |
| `system_prompt_extracao_lmr_v0_1.md` / `.txt` | Prompt anterior de agente único | Histórico útil; não deve prevalecer sobre a nova arquitetura sem auditoria. Há instruções que precisarão ser conciliadas. |
| `roteiro_operacional_lmr_v1.md` | Plano de desenvolvimento por fases | Usar como plano auxiliar; revisar compatibilidade com a arquitetura de dois agentes. |
| `Relatorio_Completo_Atualizacao_Aplicacao_LMR_v1_0.docx` / `.pdf` | Histórico amplo das decisões e pendências | Usar como contexto de gestão; não tomar propostas preliminares como decisões aprovadas. |

### Artefatos históricos da aplicação Água Pura

Podem ajudar a compreender formatos, cabeçalhos, casos já tratados e referências históricas, mas **não devem ser usados automaticamente como fonte de dados do novo sistema**:
- `Tabela_TAGS(2).xlsx`;
- `Tabela_TAGS_R3.xlsx`;
- `APLICAÇÃO LMR - Água Pura.xlsx`;
- `#ST00=M00MKF10&MPB020_STATUS_PMIB.xlsx`;
- `#ST00=M00MKF10&MFB030[0]_P&ID.pdf`;
- `aplicacao_lmr_agua_pura.html` e `tabela_tags_agua_pura.html`;
- `lista_preliminar_pais_filhos_agua_pura.xlsx`;
- `consolidado_pais_filhos_agua_pura.xlsx` e imagens/relatórios de revisão associados.

A aplicação Água Pura foi concluída. Seus dados técnicos pertencem àquele sistema. Reutilizar somente como referência histórica ou teste de regressão, quando explicitamente apropriado e validado.

## 5. Arquivos que devem estar disponíveis para o novo piloto

O usuário informa que Claude terá acesso aos arquivos necessários. Na abertura da sessão, Claude ainda deve confirmar a presença e o papel dos itens abaixo, sem pedir reenvio se já estiverem anexados/acessíveis.

### Essenciais
1. Workstatement do sistema novo;
2. lista mestre oficial de materiais/PMIBs;
3. modelo correto de aplicação LMR a preencher;
4. configuração aprovada do projeto, caso já exista;
5. documentos que definem ou contêm RDS-PP aplicáveis.

### Fontes técnicas, conforme existirem para o sistema
- arranjos gerais;
- fluxogramas;
- listas de materiais;
- P&IDs;
- layouts;
- desenhos de conjunto e detalhes;
- documentos de referência e especificações;
- listas auxiliares de TAGs;
- documentos que identifiquem revisão vigente/supersedida;
- tabela ou regra oficial de frequências, unidades e códigos, quando aplicável.

Claude deve inventariar os arquivos recebidos, registrar duplicatas e revisões e classificar cada arquivo como fonte do novo piloto, modelo de saída, artefato histórico ou referência de processo. Não presumir que um arquivo antigo pertence ao novo sistema apenas por ter nome semelhante.

## 6. Estrutura e conteúdo esperado da Base_Aplicacao_LMR.xlsx

### Aba `Resumo_Aplicacao`
Uma linha por combinação de material e contexto de aplicação que não possa ser misturado. Campos mínimos propostos:
- `codigo_pmib`;
- `part_number_origem`;
- `descricao_origem`;
- `qtd_total_aplicada`;
- `base_quantidade`;
- `detalhe_qtd_frequencia`;
- `rds_pp_origem`;
- `tags_associadas`;
- `area_painel`;
- `status_area_painel` (`confirmado`, `indicio_requer_confirmacao`, `nao_identificado`);
- `status_levantamento` (`encontrado`, `nao_localizado`, `conflitante`, `ilegivel`, `requer_revisao`);
- `ids_evidencia`;
- `observacoes`.

### Aba `Ocorrencias_Documentais`
Uma linha por ocorrência ou associação de material/TAG/contexto:
- `ocorrencia_id`;
- `codigo_pmib`;
- `part_number_origem`;
- `tag`;
- `rds_pp_exato`;
- `frequencia`;
- `qtd_documentada`;
- `unidade_contagem` ou `base_contagem`;
- `arquivo_fonte`;
- `revisao_documento`;
- `aba_folha_pagina`;
- `localizador`;
- `metodo_identificacao`;
- `trecho_evidencia`;
- `status_evidencia` (`explicita`, `interpretada_requer_revisao`, `conflitante`, `nao_localizada`);
- `observacao`.

### Aba `Pendencias`
- `pendencia_id`;
- `codigo_pmib`;
- `campo_afetado`;
- `tipo`;
- `descricao`;
- `fontes_em_conflito`;
- `bloqueia_registro`;
- `decisao_necessaria`;
- `status` (`aberta`, `resolvida`, `deferida`).

O formato definitivo deve ser validado no piloto e poderá ser ajustado antes de congelar a versão.

## 7. Regras de quantidade, TAG, RDS-PP e área/painel

### Quantidades
- A base de quantidade precisa ser aprovada antes do levantamento.
- Nunca somar variantes de frequência automaticamente.
- Preservar quantidades por frequência/instância na aba de ocorrências, mesmo quando houver um total resumido.
- Não extrapolar contagens a partir de um único desenho se a cobertura ou a regra de contagem não forem comprováveis.
- Qualquer contagem visual deve identificar região/localizador, método e status de evidência.

### TAG e RDS-PP
- Preservar o RDS-PP exato da fonte em que foi encontrado/aplicado.
- Não presumir que um mesmo PMIB possui apenas um RDS-PP ou uma TAG.
- Preservar a associação entre cada PMIB, TAG, RDS-PP, frequência, quantidade e documento.
- Não criar associação apenas por proximidade visual, similaridade de descrição ou sequência de códigos.

### Área/painel
- Identificar quando explicitamente documentado.
- Se houver apenas um indício visual ou inferência, registrar o estado `indicio_requer_confirmacao` e a evidência.
- Não preencher um valor em definitivo só para evitar campo vazio.

## 8. Pendências críticas de harmonização

Antes de implementar o sistema completo, Claude deve identificar, propor solução e registrar como decisões a aprovar:

1. **Schema JSON vs. arquitetura atual:** alinhar o schema preliminar (`project`, `sources`, `materials`, `instances`, `relationships`, `pending_items`, `extraction_metadata`, `validation_report`) à estrutura e aos dados da `Base_Aplicacao_LMR.xlsx`.
2. **Agente único vs. dois agentes:** o prompt v0.1 descreve um fluxo de agente único; a arquitetura v0.2 prevê dois agentes. Adotar a arquitetura de dois agentes para o desenho futuro, preservando regras úteis do prompt antigo apenas após revisão.
3. **Dados que podem ser agregados:** determinar quais campos são únicos por material e quais são por ocorrência/instância, sem perda de variância por TAG, RDS-PP, frequência ou local de aplicação.
4. **Precedência por campo e revisão:** não definir uma única hierarquia global simplista. A precedência pode depender do campo e do documento; conflitos sem regra aprovada ficam pendentes.
5. **QTD:** definir bases, unidades de contagem, tratamento de itens comuns e variantes por frequência.
6. **Status da aplicação:** definir valores permitidos para a coluna `Status` e sua relação com pendências do JSON.
7. **Relações PAI/FILHO:** determinar se serão necessárias no contrato canônico e que evidência/aprovação deve ser registrada.
8. **Confirmações:** manter dois pontos de confirmação consolidados — configuração do projeto e aprovação do levantamento — sem interromper repetidamente os casos claros.
9. **Rastreabilidade:** definir o nível mínimo de referência por campo/ocorrência, especialmente para quantidades contadas visualmente e associações TAG–RDS-PP.
10. **Limite de processamento:** decidir como dividir lotes de documentos e consolidar resultados sem duplicar nem omitir materiais.

Claude não deve resolver esses pontos por suposição. Deve apresentar alternativas, indicar impacto e pedir decisões só para o que depender de autorização humana. Tudo o que puder ser decidido por critérios técnicos já explícitos pode ser recomendado com justificativa.

## 9. Critérios de qualidade e aceitação

O piloto só será considerado aprovado quando:
- cada item da lista mestre tiver um resultado identificado ou uma pendência/status explícito;
- não houver PMIB omitido silenciosamente;
- toda quantidade usada na aplicação tiver origem e base de contagem identificáveis;
- diferenças de frequência forem preservadas e tratadas conforme regra aprovada;
- toda associação relevante PMIB–TAG–RDS-PP tiver evidência ou estado pendente;
- área/painel incerto não for apresentado como confirmado;
- nenhuma relação técnica tiver sido inventada;
- os JSONs passarem pelo schema e pelas verificações semânticas Python;
- a planilha original não for sobrescrita;
- o resultado final mantiver as colunas e o formato exigidos pelo modelo;
- um relatório indicar erros, avisos, registros bloqueados e decisões humanas necessárias;
- todos os testes de referência aprovados continuarem passando após alterações no prompt ou no código.

## 10. Plano de execução para a sessão com Opus 5.5

### Fase A — Auditoria e inventário (primeira tarefa)
- Ler este dossiê e os artefatos de processo listados.
- Inventariar os arquivos acessíveis na sessão.
- Distinguir fontes do novo piloto das referências históricas da Água Pura.
- Relatar ausências, duplicatas, revisões e conflitos; não começar ainda a escrever o motor completo.

**Entregável:** `01_INVENTARIO_E_LACUNAS.md`.

### Fase B — Especificação consolidada
- Mapear os campos e relações da Base_Aplicacao_LMR para o JSON canônico.
- Propor schema revisado, exemplo realista sem inventar fatos e dicionário de dados.
- Resolver ambiguidades somente com as fontes ou decisões explícitas do usuário.

**Entregável:** contrato JSON v1.1 ou nova versão claramente identificada, mais schema e exemplo; não sobrescrever v1.0.

### Fase C — Prompts dos agentes
- Revisar o prompt do Agente 1 e definir formato de saída, evidências, cobertura e pendências.
- Revisar o prompt do Agente 2 para conversão estrita da base aprovada para JSON.
- Adicionar a configuração inicial de projeto com questionário preenchido previamente a partir de documentos e confirmação em um único bloco.

**Entregáveis:** prompts separados, versionados, mais testes de conformidade.

### Fase D — Teste controlado do Agente 1
- Usar uma amostra representativa do sistema novo, sem aplicar automaticamente as conclusões a todo o lote.
- Comparar registros com fontes.
- Registrar erros de extração por campo, tipo de documento e caso de uso.
- Ajustar prompt e formato intermediário.

**Entregável:** base de levantamento piloto, relatório de cobertura e amostra revisada.

### Fase E — Validador Python
- Validar schema, unicidade, integridade referencial, cobertura, campos críticos e pendências.
- Criar casos de teste válidos e inválidos.
- Produzir relatório legível por humano e máquina.

**Entregável:** validador executável e testes automatizados.

### Fase F — Motor de aplicação LMR
- Implementar templates de `CÓDIGO_LMR` e `TAG_LMR` a partir de regras aprovadas.
- Preservar o arquivo-modelo, escrever em uma cópia e preencher a aba correta.
- Implementar Status e política de bloqueio.

**Entregável:** primeira versão do motor e conjunto de testes de regressão.

### Fase G — Aceitação e documentação
- Comparar a saída com uma aplicação validada por referência independente.
- Revisar pendências e divergências.
- Atualizar documentação, changelog e instrução de operação.
- Não liberar como processo produtivo se houver erros críticos de quantidades, TAG, RDS-PP ou cobertura.

## 11. Prompt inicial para Claude Opus 5.5

Usar o arquivo `PROMPT_INICIAL_Claude_Opus_5_5_LMR.txt` incluído neste pacote. A primeira resposta deve ser a auditoria/inventário e um plano de trabalho baseado nos arquivos realmente disponíveis. Não deve tentar produzir todo o sistema em uma única resposta.

# Roteiro operacional — Desenvolvimento do fluxo automatizado de aplicação LMR

**Versão:** 1.0  
**Status:** plano de trabalho inicial  
**Objetivo:** construir um fluxo replicável no qual o JSON substitui a Tabela_TAGS, e um motor Python valida os dados, aplica as regras aprovadas e preenche a planilha-modelo de aplicação LMR.

## Princípio central

A IA interpreta fontes e registra fatos com evidência. O JSON é o contrato de intercâmbio e a base estruturada. Python valida, aplica regras determinísticas, calcula contagens e escreve o resultado. Decisões técnicas não comprovadas ficam pendentes de revisão humana.

## Fase 0 — Organizar o projeto e proteger as fontes

### Ações
- Manter os arquivos originais em uma pasta somente leitura; nunca sobrescrever os modelos recebidos.
- Dar um identificador a cada execução do fluxo (por exemplo, `LMR-2026-001`).
- Registrar nome, versão/revisão, tamanho e hash dos arquivos de entrada.
- Manter prompts, schema, regras, código e testes versionados.
- Gerar cada resultado em uma pasta nova, sem substituir saídas de execuções anteriores.

### Estrutura de pastas sugerida

```text
LMR_Automatizacao/
  00_gestao_e_especificacao/
  01_fontes_originais/          # não editar
  02_extracao_ia_bruta/         # saídas originais do AMP, por lote
  03_json_consolidado/          # JSON combinado antes/depois da revisão
  04_validacao/                # relatórios automáticos e revisão humana
  05_regras_lmr/               # regras globais e configurações por projeto
  06_motor_python/             # código de validação, concatenação e escrita Excel
  07_casos_teste_aprovados/     # resultados de referência revisados
  08_resultados/                # saídas versionadas por execução
```

### Critério de saída

Todos os arquivos de uma execução têm identificador, origem conhecida e cópia original preservada.

## Fase 1 — Inventariar as fontes e determinar a função de cada uma

O objetivo não é escolher uma única fonte globalmente, mas definir a fonte de referência por campo. Enquanto a precedência não estiver aprovada, conservar separadamente os valores de cada fonte e registrar conflitos.

| Arquivo/artefato de referência | Uso identificado | Regra de segurança |
|---|---|---|
| `Tabela_TAGS(2).xlsx` | Usado para descobrir os campos individuais e gerais que o JSON deverá substituir; também pode servir de caso histórico de comparação. | Não será recriado como etapa futura. Valores são mantidos apenas como referência durante a transição. |
| `#ST00=M00MKF10&MPB020_STATUS_PMIB.xlsx` | Fonte de lista de materiais e identificação de PMIB; contém campos como item, quantidade, unidade, descrição, códigos de material/CMI, marca/modelo, PMIB e PDM. | Os valores originais devem ser preservados sem decidir automaticamente que prevalecem sobre outras fontes. |
| `APLICAÇÃO LMR - Água Pura.xlsx` | Modelo de saída e referência de conteúdo; a aba `APLICAÇÃO - LMR` define as colunas finais identificadas: `FICHA_PMIB`, `CÓDIGO_LMR`, `TAG_LMR`, `Status`. | Preservar o modelo original e escrever em uma cópia. A aba de exemplo é referência de formato, não fonte de dados para outro sistema. |
| Desenhos, P&IDs e documentos técnicos do projeto | Evidências para TAGs, RDS-PP, localização, contexto técnico e relações quando explícitos. | Registrar página/localizador e a evidência; não inferir relações apenas por similaridade. |

### Entregável

`matriz_fontes_campos.xlsx` ou `.csv`, com uma linha por campo de destino e estas colunas: `campo`, `fonte_preferencial`, `fontes_auxiliares`, `regra_em_conflito`, `evidencia_necessaria`, `bloqueia_geracao`, `aprovado_por`, `status`.

### Critério de saída

Todo campo necessário à aplicação tem origem preferencial definida ou tem regra explícita de conflito/pendência. Não avançar para aplicação completa enquanto campos críticos estiverem ambíguos.

## Fase 2 — Aprovar o contrato JSON

O contrato deve refletir a informação necessária para gerar a aplicação; não precisa copiar o layout da antiga Tabela_TAGS.

### Estrutura lógica prevista

- `schema_version`: versão do contrato.
- `project`: identificação do projeto/sistema.
- `sources`: inventário de fontes com IDs estáveis, tipo e hash calculado por Python.
- `materials`: registro canônico de cada material/PMIB, mantendo capturas separadas de campos vindos de fontes diferentes quando houver divergência.
- `instances`: cada instância individual usada na aplicação LMR, vinculada ao material por `material_id`.
- `relationships`: relações PAI/FILHO ou outras classificações, com evidência e estado de aprovação.
- `pending_items`: registro consolidado de campos ausentes, conflitos, ambiguidades e decisões pendentes.
- `extraction_metadata`: modelo, versão do prompt, lote e data, preenchidos com dados verificáveis.
- `validation_report`: `null` na saída bruta da IA; preenchido exclusivamente pelo validador Python.

### Regras

- IDs técnicos são diferentes dos códigos de negócio (PMIB, TAG, RDS-PP, PN).
- Valores documentais são preservados literalmente. Não normalizar zeros iniciais, pontuação, sufixos ou caracteres sem regra aprovada.
- Campo sem valor usa `null` e um estado explícito; não usar valores substitutos inventados.
- A IA não preenche `validation_report` nem declara o próprio JSON validado.
- `materials` e `instances` são separados para que um material possa ter várias instâncias sem perder a rastreabilidade de cada uma.

### Entregáveis

- `contrato_dados_lmr.md`
- `schema_dados_lmr.schema.json`
- `exemplo_json_comentado.json`
- versão aprovada e registrada do contrato.

### Critério de saída

Uma amostra real está representada sem perda relevante; os campos e estados estão documentados; schema, IDs e referências são verificáveis por código.

## Fase 3 — Construir o protocolo de extração AMP

### Primeiro modo: execução assistida por lotes

Como ainda não está confirmado se existe API corporativa disponível para o AMP, o processo inicial deve funcionar manualmente e de forma rastreável:

1. Separar a lista de materiais em lotes delimitados por PMIB ou grupos de documentos coerentes.
2. Usar uma versão fixa do prompt e o mesmo contrato/schema em todos os lotes.
3. Solicitar JSON apenas, sem texto antes/depois, e nunca pedir ao modelo para declarar que validou os dados.
4. Exigir `batch_id`, `batch_index`, `batch_count` e fontes/localizadores.
5. Salvar sem editar a resposta bruta em `02_extracao_ia_bruta/`.
6. Não pedir a dois modelos que reescrevam todo o conjunto. Usar Claude para exceções/casos ambíguos e comparação controlada.
7. Consolidar lotes por Python; nunca concatenar manualmente textos JSON grandes.

### Papéis de modelo para o piloto

- Gemini Flash Lite: primeiro candidato para leitura e extração.
- Claude Sonnet: revisão direcionada de exceções documentadas, relações ambíguas e consistência do raciocínio.
- GPT-5.4, Gemini Flash e Nova Pro: comparação experimental com a mesma amostra, não parte obrigatória do fluxo até comprovar ganho.

### Critério de saída

O prompt produz dados parseáveis, rastreáveis e compatíveis com o schema, sem omitir materiais silenciosamente. Os erros observados são registrados por tipo e modelo.

## Fase 4 — Criar o validador Python

Executar em sequência:

1. Parsear o JSON e validar contra o schema.
2. Conferir unicidade de IDs técnicos.
3. Conferir se todo `source_id` referenciado existe.
4. Conferir se cada instância tem `material_id` válido.
5. Comparar a cobertura dos PMIBs com as listas de entrada, contabilizando exceções justificadas.
6. Verificar campos críticos e estados; `null` sem justificativa é erro.
7. Identificar duplicatas candidatas sem removê-las automaticamente.
8. Detectar conflitos entre fontes e contradições entre materiais/instâncias.
9. Confirmar que relações estão documentadas/aprovadas ou pendentes.
10. Gerar relatório em JSON/CSV com erro, severidade, registro afetado, evidência e ação recomendada.

### Estados recomendados

- `PASS`: pode seguir para geração.
- `PASS_WITH_WARNINGS`: pode seguir apenas se os avisos não afetarem o resultado gerado.
- `BLOCKED_RECORDS`: algumas instâncias são bloqueadas, outras válidas podem seguir.
- `BLOCKED_BATCH`: erro estrutural ou falha de cobertura torna inseguro continuar com o lote.

O estado deve ser calculado por Python, não pela IA.

### Critério de saída

Um conjunto de testes contendo casos válidos e inválidos produz os erros esperados e identifica exatamente os registros afetados.

## Fase 5 — Formalizar regras e desenvolver o motor LMR

Antes da implementação, registrar cada regra em `regras_lmr.json` ou documentação equivalente:

- template exato de `CÓDIGO_LMR`;
- template exato de `TAG_LMR`;
- origem de cada segmento e sua precedência;
- regras de substituição de placeholders do RDS-PP;
- mapeamentos de unidade, trecho, escopo, área/painel, elevação/eixo quando aplicáveis;
- tratamento de PMIB, PN, TAGs múltiplas e acessórios;
- classificações PAI/FILHO e evidência mínima exigida;
- valores permitidos em `Status`;
- política de bloqueio parcial;
- regras de preservação do workbook e da formatação.

O motor deverá:

1. Ler JSON já validado e o arquivo modelo.
2. Calcular os campos finais com funções determinísticas.
3. Emitir uma tabela intermediária de auditoria (uma linha por saída prevista) antes de escrever Excel.
4. Preencher uma cópia do modelo, preservando demais abas e estilos.
5. Gerar relatório das linhas criadas, bloqueadas e não processadas.

### Critério de saída

As mesmas entradas e regras geram a mesma saída; exemplos aprovados de concatenação passam nos testes automáticos.

## Fase 6 — Executar piloto controlado

Selecionar um pequeno conjunto representativo, de preferência 10–20 materiais/PMIBs ou uma amostra equivalente do projeto novo. Incluir casos simples, múltiplas instâncias, variação de RDS-PP/TAG, relações explícitas, dados ausentes e conflitos. A quantidade é uma sugestão inicial; o conteúdo da amostra é mais importante que o tamanho.

### Procedimento

1. Criar uma referência esperada revisada por pessoa competente (`golden set`).
2. Rodar extração IA.
3. Consolidar JSON.
4. Executar validação.
5. Resolver pendências e registrar decisões.
6. Gerar aplicação em arquivo de saída separado.
7. Comparar cada linha/campo com a referência esperada.
8. Classificar cada erro por etapa: extração, schema, relação, regra de concatenação, escrita Excel.
9. Corrigir a causa, atualizar testes e repetir o piloto.

Não usar os 3.580 registros de Água Pura como padrão obrigatório para outras aplicações. Podem apoiar a reconstrução histórica e testes de regressão quando seus registros estiverem verificados, mas o piloto operacional deve ser feito em nova aplicação conforme planejado.

### Critério de saída

Todos os campos e linhas da amostra conferem com a referência; nenhuma relação não comprovada foi usada; qualquer exceção aparece no relatório; a saída do Excel preserva o modelo.

## Fase 7 — Benchmark de modelos e regressão

Usar exatamente a mesma amostra, os mesmos documentos e o mesmo contrato para comparar modelos. Medir:

- exatidão de cada campo crítico;
- cobertura (itens/instâncias esperados extraídos);
- referências de evidência válidas;
- taxa de conteúdo inventado ou relação não suportada;
- JSON estruturalmente válido na primeira tentativa;
- tempo de revisão humana por lote;
- custo/limite operacional, se a plataforma disponibilizar essa métrica.

Guardar os resultados aprovados como testes de regressão. Uma mudança no prompt, schema, regras ou código não deve quebrar esses casos sem que a alteração seja explicada e aprovada.

## Fase 8 — Operação por execução

Checklist mínimo de cada aplicação:

- [ ] Fontes originais inventariadas e congeladas.
- [ ] Configuração/regras específicas do projeto identificadas.
- [ ] Extração por lotes salva e identificada.
- [ ] JSON consolidado com IDs únicos.
- [ ] Validação Python concluída.
- [ ] Pendências bloqueantes resolvidas ou registros dependentes bloqueados.
- [ ] Aplicação gerada em cópia do modelo.
- [ ] Excel comparado com o relatório de auditoria.
- [ ] Pacote final arquivado com JSON, regras utilizadas, relatório e arquivo final.

## Onde estamos e qual o próximo passo

**Estado atual:** existe uma proposta inicial do contrato JSON v1.0.0 e um schema. O contrato ainda não deve ser congelado; a existência de um schema válido não garante que todas as regras de negócio estejam definidas.

**Próxima atividade recomendada:** construir a matriz de fontes e precedência por campo, com os valores em conflito preservados até que a regra seja aprovada. Depois, confirmar a lista de campos canônicos no contrato, congelar o schema e só então finalizar o prompt de extração.

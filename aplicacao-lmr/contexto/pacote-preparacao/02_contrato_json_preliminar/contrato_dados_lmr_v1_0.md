# Contrato de Dados LMR — v1.0.0

**Status:** proposta técnica inicial, construída a partir dos três arquivos-base fornecidos. Ainda requer aprovação antes de ser congelada.

## 1. Objetivo

O JSON será a base de dados estruturada que substitui a Tabela_TAGS. Não haverá a etapa de recriar a tabela Excel intermediária. A IA extrai e estrutura os dados; o Python valida, aplica regras determinísticas e preenche a aba `APLICAÇÃO - LMR` do arquivo-modelo.

O contrato preserva fatos uma única vez sempre que possível. Resumos que antes apareciam como linhas agregadas ou blocos visuais da planilha podem ser derivados por código, desde que sejam reconstruíveis a partir dos dados canônicos e das regras aprovadas.

## 2. Evidências encontradas nos arquivos-base

- `Tabela_TAGS(2).xlsx`: aba `Tags individuais` com cabeçalhos `CÓDIGO PMIB`, `ESCOPO`, `SISTEMA`, `RDS-PP`, `ELEV.`, `EIXO`, `TRECHO`, `DESCRIÇÃO DO MATERIAL`, `APLICAÇÃO`, `QTD`, `TAG INDIVIDUAL`; contém 3.580 registros preenchidos e 87 PMIBs distintos.
- `Tabela_TAGS(2).xlsx`: aba `Tags gerais` possui um quadro principal com cabeçalho `Nº`, `CÓDIGO PMIB`, `ESCOPO`, `ÁREA/PAINEL`, `RDS-PP`, `DESCRIÇÃO DO MATERIAL`, `CÓD. MATERIAL (PART NUMBER)`, `APLICAÇÃO`, `QTD TOTAL / UG`, `TAGS`, além de blocos adicionais organizados por unidade/painel. O JSON não deve reproduzir a disposição física desses blocos; deve preservar os fatos e permitir a reconstrução dos agrupamentos pertinentes.
- `#ST00=M00MKF10&MPB020_STATUS_PMIB.xlsx`: a aba `Lista de Materiais` contém uma linha por material com campos como `ITEM`, `QTD.`, `UNID.`, `DESCRIÇÃO`, `CÓDIGO DO MATERIAL`, `CÓDIGO CMI`, `MARCA/MODELO`, `CÓDIGO PMIB` e `PDM usado`.
- `APLICAÇÃO LMR - Água Pura.xlsx`: a aba `DOCS DE REFERÊNCIA` contém `CÓDIGO PMIB`, `PART NUMBER`, `DESCRIÇÃO DO MATERIAL`, `RDS-PP DOCUMENTO - PRINCIPAL`, `QTD` e `COMENTÁRIOS`. A aba `APLICAÇÃO - LMR` tem as colunas finais `FICHA_PMIB`, `CÓDIGO_LMR`, `TAG_LMR` e `Status` e estava sem registros de saída.
- A aba `EXEMPLO APLICAÇÃO LMR DO RTA` é referência de formato. Seus dados não podem ser reutilizados como dados do novo sistema.

Os 3.580 registros e 87 PMIBs são observações do arquivo Água Pura usado para estudar a estrutura, não quantidades fixas que o novo fluxo deva forçar.

## 3. Modelo de dados canônico

### `project`
Identifica o projeto, sistema e escopo geral.

### `sources`
Inventário dos arquivos consultados. Cada arquivo recebe `source_id` estável. O hash SHA-256 deve ser calculado pelo Python; a IA não deve inventar ou estimar esse valor.

### `materials`
Um registro por PMIB/material. Reúne duas capturas distintas quando ambas estiverem disponíveis:
- `source_material_list`: campos originais da lista principal de materiais;
- `source_document_reference`: campos originais da lista de documentos de referência.

Manter os campos das fontes em blocos distintos é intencional: descrições, quantidades ou códigos podem divergir. O programa não deve resolver conflitos silenciosamente. O PMIB deve ser armazenado como texto sem o apóstrofo usado apenas para formatação de célula no Excel.

### `instances`
Um registro por aplicação individual que precisa ser considerada na LMR. Contém `material_id` e os campos equivalentes à aba `Tags individuais`: escopo, sistema, RDS-PP de origem, elevação, eixo, trecho, descrição da instância, aplicação, quantidade e TAG individual. `area_panel` está disponível para valores explicitamente documentados ou mapeamentos aprovados.

A descrição da instância deve ser preservada separadamente da descrição na lista principal; não são necessariamente idênticas. O RDS-PP de origem deve conservar literalmente placeholders como `ST[XX]` e `M[XX]`; a transformação pertence ao motor Python.

### `relationships`
Armazena relações PAI/FILHO, material aplicado diretamente ao pai ou item independente quando necessárias para a aplicação. Uma relação sem evidência suficiente fica em `pending_review`; não se autoriza inferir parentesco pela semelhança de nomes, PN ou proximidade na lista.

### `pending_items`
Lista única de informações ausentes, conflitantes, ilegíveis ou ambíguas. O bloqueio pode afetar apenas um registro, ou o lote inteiro, conforme a dependência da geração.

### `extraction_metadata`
Controla modo, modelo, versão do prompt e lote. Se o modelo não tiver informação confiável, usar `null`; o orquestrador pode preencher esses campos após a extração.

### `validation_report`
Deve ser `null` na saída inicial da IA e preenchido pelo Python após a validação. A IA não pode declarar por conta própria que o JSON foi validado.

## 4. Origem e evidência

Cada material e instância precisa ter pelo menos uma referência de origem (`source_refs`), que aponta para `sources` por `source_id`. Uma referência registra arquivo, aba/linha ou página/localizador e método de obtenção.

Para transcrição direta de planilha, arquivo + aba + linha pode ser suficiente. Para leitura de desenho/P&ID/PDF, valores ambíguos e relações, registrar `field_evidence` com campo, fonte, localização e valor observado. O validador deve conferir que cada `source_id` referenciado existe.

## 5. Campos ausentes e conflitos

`field_status` aceita:
- `documented`: consta na fonte identificada;
- `not_found`: foi procurado nas fontes definidas, mas não foi localizado;
- `conflicting`: há valores incompatíveis entre fontes;
- `illegible`: existe, mas não pode ser lido com segurança;
- `not_applicable`: há base para considerar o campo inaplicável;
- `pending_review`: requer revisão.

O valor sem informação deve ser `null`, acompanhado do estado aplicável. Não usar `"N/A"`, `"XXXX"` ou um valor presumido, salvo quando for o próprio texto documentado ou uma regra aprovada do motor final.

## 6. IDs, lotes e deduplicação

- `material_id`, `instance_id`, `relationship_id` e `pending_id` são IDs técnicos; devem ser gerados de forma estável por um script/orquestrador sempre que possível.
- O `codigo_pmib` continua sendo um dado de negócio, não um substituto para todos os IDs técnicos: um PMIB pode ter várias instâncias.
- `batch_id`, `batch_index` e `batch_count` suportam extração em partes. Antes de aplicar a LMR, Python deve consolidar os lotes e detectar IDs repetidos, registros duplicados candidatos e lacunas de cobertura.
- Duplicatas candidatas devem ser reportadas e não removidas automaticamente sem regra aprovada.

## 7. O que não é calculado pela IA

A IA não deve montar `CÓDIGO_LMR`, gerar a planilha final, trocar placeholders do RDS-PP, calcular contagens de validação, preencher apóstrofos de Excel, inferir TAGs ou resolver relações não comprovadas. Essas tarefas são responsabilidade do Python ou de uma decisão humana registrada.

A saída da IA deve manter `validation_report: null`. O validador Python preenche esse bloco após verificar schema, referências, IDs, PMIBs, cobertura, campos críticos, quantidade de registros e consistência interna.

## 8. Como as informações do JSON alimentam a aplicação

Para cada instância válida, o motor localiza o material relacionado por `material_id`, recupera o PMIB e o Part Number pertinente, aplica regras aprovadas de unidade/trecho/RDS-PP, monta as strings finais para `CÓDIGO_LMR` e `TAG_LMR`, e escreve os registros na aba `APLICAÇÃO - LMR` do modelo fornecido.

O mapeamento final para a planilha é:
- `FICHA_PMIB` ← `materials.codigo_pmib`;
- `CÓDIGO_LMR` ← concatenação determinística dos campos da instância e dos parâmetros/regras aprovados;
- `TAG_LMR` ← regra de montagem baseada na instância, descrição/PN do material e relação aprovada, quando aplicável;
- `Status` ← definido pelo motor conforme sucesso/pendências do registro, usando valores autorizados pelo processo.

Nenhuma regra de concatenação será considerada aprovada só por constar neste contrato; ela será especificada separadamente em `regras_lmr.json` e testada contra um exemplo validado.

## 9. Teste de aceitação da v1.0

Antes de congelar o contrato:
1. Uma amostra extraída dos documentos de um projeto novo deve passar pelo JSON Schema.
2. Todos os registros devem apontar para fontes existentes e localizáveis.
3. Nenhum PMIB ou instância esperada pode desaparecer sem explicação registrada.
4. Diferenças entre a lista principal, documentos de referência e documentos técnicos devem permanecer visíveis até a resolução.
5. As relações sem evidência devem permanecer pendentes.
6. O validador Python deve preencher um relatório e bloquear apenas os resultados cuja geração não seja segura.
7. O motor LMR ainda não deve ser desenvolvido com base em suposições; primeiro aprovaremos os campos e os estados deste contrato.

## 10. Pendências de desenho a fechar antes da versão estável

- Confirmar se há tipos adicionais de instância necessários em sistemas além de Água Pura.
- Aprovar qual fonte prevalece para cada campo final quando duas fontes apresentam valores distintos; até lá, ambas são preservadas.
- Definir taxonomia definitiva de estados/valores da coluna `Status` na aplicação.
- Formalizar em arquivo separado as regras globais e as regras específicas por sistema.

# Contexto e histórico do projeto de automatização da aplicação LMR

**Finalidade deste documento:** ajudar um novo colaborador de IA a compreender o projeto e as tentativas anteriores. **Não é uma especificação técnica aprovada nem um roteiro obrigatório.**

## 1. Objetivo do usuário

O usuário quer tornar o processo de aplicação LMR (Lista de Materiais de Referência) mais consistente, rastreável, repetível e automatizado. A meta de longo prazo é reduzir retrabalho manual e a dependência de resultados variáveis gerados por agentes de IA, preservando a correção técnica e documental.

A aplicação LMR deve usar dados do sistema em análise, documentos de referência e regras da empresa/projeto para produzir o preenchimento correto da planilha-modelo. O resultado esperado não se limita à geração de um arquivo: o processo precisa conseguir explicar de onde vieram as informações e como tratou divergências.

## 2. O que já foi feito

- Foi finalizada uma aplicação LMR do sistema Água Pura. Ela serve como experiência anterior e conjunto de exemplos do processo, não como fonte universal de regras técnicas.
- Foram examinados arquivos associados a essa aplicação, incluindo uma Tabela_TAGS antiga, uma lista de materiais/PMIBs, uma planilha-modelo de aplicação LMR, um P&ID, arquivos de relações e resultados HTML/Excel.
- O usuário observou que os agentes e modelos variavam de desempenho e que algumas execuções produziam saídas incompletas ou inconsistentes.
- Entre os problemas relatados em etapas anteriores estavam dificuldade de ler certos PDFs/desenhos ou planilhas, ciclos repetitivos de perguntas, resultados HTML vazios ou incompletos, resultados que continham apenas PMIBs ou não respeitavam a estrutura esperada.
- O usuário observou empiricamente que Gemini Flash Lite se saiu melhor na leitura de documentos e projetos, enquanto Claude foi útil em raciocínio, organização e produção de artefatos. Isso reflete a experiência dele, não uma avaliação universal dos modelos.
- Foram criados artefatos preliminares: um System Prompt de agente único, uma proposta de arquitetura com dois agentes, um contrato JSON, um JSON Schema, um exemplo JSON, um roteiro operacional e um relatório histórico.
- O usuário esclareceu que a Tabela_TAGS não será mais uma etapa obrigatória: o objetivo é que os dados necessários sejam estruturados diretamente em JSON, que substituirá essa tabela no fluxo futuro.
- Mais tarde, foi considerada uma separação entre levantamento técnico documental e estruturação de dados para JSON, com eventual processamento determinístico em Python. Isso ainda é uma hipótese de arquitetura, não uma escolha final e congelada.

## 3. Ideias que foram consideradas — não são decisões definitivas

As propostas anteriores incluíram:

- um agente para ler Workstatement e documentos técnicos;
- a extração de quantidades aplicadas, variantes por frequência, RDS-PP, TAGs e, quando possível, área/painel;
- uma etapa de revisão das informações encontradas;
- outro agente para estruturar os dados em JSON;
- um programa Python para validar dados, aplicar regras de montagem e preencher uma planilha final;
- um questionário inicial sobre parâmetros comuns ao projeto, como escopo, subsistema, trechos, frequências, eixo, elevação, RDS-PP, local de aplicação e base de quantidade;
- pontos de confirmação para evitar a emissão de dados antes de revisar premissas e resultados.

Essas propostas podem ser úteis, mas não precisam ser adotadas. O novo colaborador deve analisá-las criticamente e comparar alternativas, incluindo agente único, fluxo de agentes, processamento predominantemente por código, processamento sem planilha intermediária ou outras abordagens.

## 4. O que ainda não foi validado operacionalmente

- Não foi demonstrado, em um piloto de um sistema novo, que o fluxo de dois agentes produz resultados completos e consistentes.
- O contrato JSON v1.0, o schema correspondente, o prompt de agente único v0.1 e a arquitetura de dois agentes v0.2 foram desenvolvidos em momentos diferentes e não estão completamente harmonizados.
- Não há evidência de que todos os campos do esquema inicial sejam suficientes para todos os casos reais de aplicação.
- As regras de precedência entre fontes, as bases de quantidade e o tratamento de diferenças por frequência precisam ser definidos por aplicação ou a partir de regras oficiais confirmadas.
- A abordagem para conflitos entre documentos, revisões de desenhos, associação entre PMIB/TAG/RDS-PP e identificação de área/painel ainda precisa ser avaliada.
- O motor Python de produção, o validador integrado e o conjunto de testes de aceitação ainda não foram concluídos como solução operacional neste histórico.

## 5. Sobre os modelos disponíveis

O usuário informou ter acesso corporativo ao AMP e aos seguintes modelos: Claude Sonnet 5.0/5.5/4.6, Gemini Flash Lite 3.1/3.5, Gemini Flash 3.0, GPT 5.4 e Nova Pro. Ele planejava ter acesso ampliado ao Claude Opus 5.5 para apoiar a revisão do processo.

O ambiente corporativo pode mascarar dados, o que segundo a experiência do usuário pode reduzir o desempenho das IAs. Qualquer conclusão sobre a melhor arquitetura ou o melhor modelo deve ser testada com materiais representativos e respeitando a política corporativa de uso de dados.

## 6. Como interpretar o conjunto de arquivos

Os arquivos anexados devem ser entendidos em categorias distintas:

1. **Histórico técnico da aplicação Água Pura:** planilhas, P&ID, HTMLs e arquivos de análise daquela aplicação. Servem para conhecer o contexto anterior; os valores do sistema Água Pura não devem ser transferidos automaticamente para outro sistema.
2. **Propostas de processo:** prompts, arquitetura, contrato, schema e roteiro criados durante o planejamento. São propostas sujeitas a revisão, não instruções autoritativas.
3. **Relatório histórico:** consolida os desenvolvimentos e decisões ao longo do processo; não transforma automaticamente toda ideia mencionada em decisão aprovada.
4. **Documentos de um novo sistema/piloto:** quando fornecidos, precisam ser identificados separadamente e analisados como fontes para aquela aplicação.

Se houver contradição entre os documentos, registre-a e pergunte ou apresente hipóteses; não escolha silenciosamente qual deles prevalece.

## 7. O que o usuário espera do novo colaborador

O usuário quer que a IA compreenda o contexto, entenda o que foi feito e o que não funcionou, e ajude a estruturar novamente todo o processo. Ele não quer limitar a IA desde o início a uma arquitetura já escolhida ou obrigá-la a preservar as propostas anteriores.

A conversa inicial deve priorizar a compreensão compartilhada e um diagnóstico próprio. O colaborador pode desafiar ideias anteriores, apresentar alternativas e explicar vantagens/desvantagens. As escolhas finais devem ser construídas em colaboração com o usuário, e não presumidas a partir de artefatos preliminares.

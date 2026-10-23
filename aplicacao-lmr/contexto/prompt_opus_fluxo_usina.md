Você vai atuar como engenheiro sênior de automação e arquitetura de sistemas com agentes de IA. Preciso que projete o melhor fluxo possível para o projeto descrito abaixo.

## SEU PAPEL E SUA LIBERDADE

Você tem total liberdade para criar o fluxo do zero. Pode descartar, mudar ou reorganizar qualquer parte da proposta atual (número de etapas, divisão de tarefas entre modelos, formato intermediário de dados, uso de agentes ou de chats, código de apoio). Quero o fluxo mais confiável e previsível que você conseguir desenhar, e não uma adaptação do que já tenho.

## RESTRIÇÃO PRINCIPAL (INEGOCIÁVEL)

Os dados do projeto são sigilosos. Por isso:

- O fluxo será EXECUTADO exclusivamente na ferramenta de IA da minha empresa, o AMP. Todo o processamento dos documentos e dos dados reais acontece lá, com os modelos que o AMP disponibiliza.
- O fluxo NÃO pode depender de você (Claude Opus) nem desta conversa para processar documentos ou dados. Seu trabalho é projetar e entregar tudo o que eu preciso para implementar e rodar no AMP: arquitetura, prompts, esquemas, regras de validação e código.
- Não vou enviar documentos reais do projeto nesta conversa. Trabalhe com a descrição abaixo e com exemplos fictícios ou mascarados, e me diga o que mais precisar que eu forneça de forma anonimizada.

## CONTEXTO DO PROJETO

Trabalho no mapeamento de materiais físicos de uma Usina Hidroelétrica. Para cada escopo do projeto, é preciso abrir os projetos, identificar onde cada material fica fisicamente na usina e registrar onde ele é aplicado naquele local. O resultado é uma planilha Excel (aplicação LMR) com dois códigos por material:

- **Código LMR:**[ESCOPO] - [SUBSISTEMA] - [ÁREA/PAINEL] - RDS-PP: #ST[XX]=M[NN][SISTEMA][LOCAL]  - [DESCRIÇÃO DA ÁREA NA USINA] - ELEV. [X] - EIXO [Y] - TRECHO [Z]

- **TAG LMR:** [ESCOPO] - [TAG/REF] - [DESCRIÇÃO TÉCNICA] ([PART NUMBER])

Para cada mapeamento tenho: desenhos esquemáticos de montagem, desenhos de fabricação, diagramas em geral, lista de materiais e work statements. Já existe um template base em Excel e alguns mapeamentos prontos que servem de exemplo.

## FLUXO ATUAL (ponto de partida, não obrigação)

1. Um chat ou agente (ainda não decidi qual) lê os documentos e gera um JSON com todas as informações do arquivo Tabela_Tags.
2. Um código Python concatena o JSON e completa a aba de aplicação LMR do arquivo de aplicação LMR.

## PROBLEMA ATUAL

O desempenho dos agentes varia muito entre execuções na aplicação LMR, o que a torna ineficiente.

[Descreva aqui 1 ou 2 exemplos: o que foi pedido, o que o agente devolveu e o que estava errado.]

## O QUE SEI SOBRE O AMP E SEUS LIMITES

- O AMP mascara os dados, o que reduz a eficiência dos modelos.
- Modelos disponíveis: Claude Sonnet 4.6/5.0/5.5, Gemini Flash-Lite 3.1/3.5, Gemini Flash 3.0, GPT 5.4 e Nova Pro.
- Na prática, o Gemini Flash-Lite lê melhor documentos e projetos, e o Claude é melhor em raciocínio, criação de HTML e organização.
- [Descreva o que o AMP permite: criação de agentes, encadeamento de etapas, upload de arquivos, tamanho de contexto, execução de código, limites de uso.]
- Onde o código Python pode rodar: [AMP / minha máquina / outro]. Se for na minha máquina, ele só pode tratar os arquivos localmente, sem enviar dados a serviços externos.
- Pretendo compartilhar o agente com outras pessoas da equipe, então o fluxo precisa ser previsível e fácil de usar por quem não participou do desenvolvimento.

## MATERIAIS ANEXADOS (anonimizados)

- [Template base em Excel]
- [Um ou dois mapeamentos prontos de exemplo, com dados mascarados]
- [Exemplo do JSON esperado / estrutura da Tabela_Tags]
- [Código Python atual, se existir]
- [Prompts atuais dos agentes, se existirem]

## O QUE EU PRECISO DE VOCÊ

1. **Diagnóstico:** causas mais prováveis da variação de desempenho (prompt, tamanho do contexto, mascaramento, formato da saída, ambiguidade nas regras de codificação etc.).
2. **Fluxo recomendado:** o desenho completo, etapa por etapa, indicando qual modelo do AMP executa cada etapa e por quê, e o que é feito por modelo e o que é feito por código determinístico.
3. **Esquema dos dados intermediários** (JSON ou outro formato que você julgar melhor), com campos obrigatórios e formatos validáveis.
4. **Validação:** regras para checar o formato dos códigos, campos faltantes e inconsistências antes de escrever na planilha, e como sinalizar itens para revisão humana.
5. **Prompts prontos para colar no AMP,** uma versão para cada etapa, com exemplos (few-shot) baseados na estrutura dos meus mapeamentos.
6. **Código de apoio,** se o fluxo precisar, escrito para rodar nas condições que informei.
7. **Plano de implementação e teste:** ordem de desenvolvimento parte por parte e como testar cada etapa em uma nova aplicação LMR, com critérios para saber se o fluxo ficou estável.
8. **Orientações para a equipe:** como outra pessoa usaria o fluxo no dia a dia e o que ela precisa conferir manualmente.

Antes de projetar, liste as dúvidas ou informações que faltam. Se algo estiver ambíguo, faça no máximo 5 perguntas objetivas em vez de assumir.

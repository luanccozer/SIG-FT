# Revisão das listas pelo AMP (n8n)

Dois agentes do AMP comparam duas revisões de uma lista de sobressalentes com o `_STATUS_PMIB`. O que eles leem:
- o texto das duas revisões do PDF;
- o `_STATUS_PMIB`.

O resultado é um HTML com o que mudou e com o `_STATUS_PMIB` remontado inteiro, pronto para colar no Excel.

**Por onde começar:**
1. **Os agentes:** crie no AMP o Revisor de Listas e o Conferente de Listas com `agentes/revisor_de_listas.md` e
   `agentes/conferente_de_listas.md`. Cada arquivo traz a ficha (nome, modelo, temperatura) e o system prompt.
2. **Agora, sem o SIG-FT:** monte à mão o workflow com formulário pelo `passo_a_passo_workflow_n8n.md`. Você envia os
   dois PDFs, cola o `_STATUS_PMIB` e baixa o HTML no fim. Roda à mão, sem gastar execução publicada.
3. **Depois, ligado ao SIG-FT:** importe `workflow_revisao_de_listas.json`. O SIG-FT o chama no **PMIB Manager**, aba
   **Revisão no AMP**, botão **Revisar no AMP**, para cada lista com divergência da última conferência. O passo a
   passo está nas seções 2 e 3 abaixo.

Há dois desenhos:
- `docs/superpowers/specs/2026-10-27-amp-revisao-de-listas-design.md`: o lado do SIG-FT;
- `docs/superpowers/specs/2026-11-02-amp-agentes-revisao-design.md`: os agentes e o workflow.

| Arquivo | O quê |
|---|---|
| `agentes/revisor_de_listas.md` | a ficha e o system prompt do agente **Revisor de Listas**, para colar no AMP. **É aqui que se melhora o Revisor.** |
| `agentes/conferente_de_listas.md` | a ficha e o system prompt do agente **Conferente de Listas** |
| `agentes/contexto_sobressalentes.md` | o arquivo da Knowledge base dos dois agentes, opcional, com o processo explicado com exemplos inventados |
| `passo_a_passo_workflow_n8n.md` | como montar à mão, no n8n, o workflow com formulário |
| `nos_para_colar/` | o código dos três nós de código do workflow com formulário. Gerado: não edite à mão |
| `js/` | o código dos nós de código: `comum.js` (as funções que eles dividem) e um arquivo por nó |
| `gerar_workflow.py` | gera o `.json` e o `nos_para_colar/` a partir de `js/`: `python amp/revisao_de_listas/gerar_workflow.py` |
| `workflow_revisao_de_listas.json` | o workflow ligado ao SIG-FT, para importar no n8n. Não edite à mão: mude `js/` e rode o gerador |

## Como funciona o workflow ligado ao SIG-FT

```text
Webhook do SIG-FT → É ping? ─sim→ Responde ping
                       └não→ Monta o pedido → Revisor de Listas → Lê o Revisor → Vai à conferência?
   ┌───────────────────────────────────────────────────────────────────────────────┘ sim     │ não (eco ou erro)
   └→ Espera 10 s → Prepara a conferência → Conferente de Listas → Monta o resultado → Deu certo? ←┘
                                                                                     ├ sim → Responde
                                                                                     └ não → Responde erro (502)
```

| Nó | O que faz |
|---|---|
| Webhook do SIG-FT | recebe a chamada do SIG-FT. A chave vem no cabeçalho `X-SIGFT-Chave` |
| É ping? | o `ping` responde na hora, sem chamar nenhum agente |
| Monta o pedido | monta a mensagem do Revisor: a lista, as duas revisões com `--- página N ---` e o `_STATUS_PMIB` com uma coluna LINHA numerada. No eco, a lista de códigos |
| Revisor de Listas | o agente do AMP (Claude Sonnet 5.5). Compara e devolve, em JSON, as mudanças e as ações na planilha, cada uma com a página e o trecho do PDF |
| Lê o Revisor | tira o JSON da resposta. O eco volta direto ao SIG-FT; a falha vira erro 502 (`etapa: revisor`) |
| Espera 10 s | uma pausa entre as duas chamadas ao AMP |
| Prepara a conferência | a mesma mensagem do Revisor e, no fim, o resultado dele |
| Conferente de Listas | o agente do AMP (Gemini 3.5 Flash-Lite). Dá um veredito para cada ação (confirmado, corrigido, rejeitado ou a conferir) e procura o que faltou |
| Monta o resultado | confere a prova no texto do PDF, remonta a `_STATUS_PMIB` e gera o HTML |
| Responde / Responde erro | devolvem ao SIG-FT o HTML (200) ou o erro (502) |

**O que entra na tabela remontada:** só a ação que o Conferente confirmou ou corrigiu e cuja prova o código achou:
- o trecho citado está no texto do PDF;
- o código do material aparece na revisão atual;
- numa remoção, o código **não** aparece mais.

As colunas da equipe nunca mudam: CÓDIGO PMIB e todas as que ficam à direita dele. O que não passa vai para "A conferir"
no HTML, fora da tabela, para você decidir. O item removido vai para a seção da SEM_LISTA_STATUS_PMIB com o
andamento dele e a origem em OBSERVAÇÕES.

## 1. Criar os dois agentes no AMP (uma vez)

Vale para as duas formas de rodar. A ficha também está no começo de cada arquivo de `agentes/`:

| Campo | Revisor de Listas | Conferente de Listas |
|---|---|---|
| **Nome** | `Revisor de Listas` | `Conferente de Listas` |
| **Descrição** | Compara duas revisões de uma lista de sobressalentes do projeto de Itaipu com a planilha de controle (_STATUS_PMIB) e diz o que mudou e o que atualizar. Usado pelo workflow SIG-FT · Revisão das listas. | Confere contra os PDFs o resultado do Revisor de Listas: cada mudança e cada ação na _STATUS_PMIB. Usado pelo workflow SIG-FT · Revisão das listas. |
| **Modelo** | Claude Sonnet 5.5 | Gemini 3.5 Flash-Lite |
| **Temperatura** | o Sonnet 5.5 não tem | 0 |
| **System prompt** | o texto abaixo da linha em `agentes/revisor_de_listas.md` | o texto abaixo da linha em `agentes/conferente_de_listas.md` |
| **Knowledge base** | `agentes/contexto_sobressalentes.md` (opcional) | o mesmo arquivo (opcional) |
| **Acesso ao Box** | não ligar | não ligar |

Por que dois modelos de famílias diferentes: o Conferente não repete o raciocínio do Revisor e pega o que ele errou.

**Teste rápido, sem gastar execução:** no chat do Revisor de Listas, mande:

```text
MODO ECO
ABC-123
#ITA0=Y01TF001&BPB020
```

Ele deve responder só os dois códigos, iguais. Se responder outra coisa, o system prompt não foi colado inteiro.

## 2. Ligado ao SIG-FT: importar e ligar o workflow (uma vez)

1. **Importar.** No n8n (`https://ampworkflow.gevernova.net`), clique em **Create workflow**. Depois, no menu **⋯**,
   use **Import from File...** e escolha `workflow_revisao_de_listas.json`. Se o menu não tiver a opção, abra o
   `.json` no Bloco de Notas, copie tudo e cole no canvas vazio.
2. **Salvar as execuções.** No menu **⋯**, abra **Settings** e confira que **Save manual executions** está em
   **Save**. O arquivo já vem assim.
3. **Credencial do webhook.** Abra o nó **Webhook do SIG-FT**. Em *Credential for Header Auth*, crie uma nova:
   - **Name:** `X-SIGFT-Chave`;
   - **Value:** um valor longo e aleatório, por exemplo 40 letras e números.

   Guarde o valor: ele vai no SIG-FT, no passo 7.
4. **Os dois agentes.** Abra o nó **Revisor de Listas**:
   - em **Credential**, escolha a sua conta do AMP;
   - em **Custom Agent**, escolha **Revisor de Listas** na lista.

   Faça o mesmo no nó **Conferente de Listas**, escolhendo o agente **Conferente de Listas**. Até você escolher, o nó
   pode aparecer com erro: ele chega apontando para o agente só pelo nome.

   Não mude o **Prompt**: ele lê `{{ $json.chatInput }}`. Também não mude o **Session ID**: ele lê
   `{{ $json.sessionId }}`, uma sessão nova por execução. Se o campo Prompt estiver vazio, escreva nele
   `{{ $json.chatInput }}`.
5. **Publicar.** Salve e **publique** o workflow (*Publish* ou *Active*, conforme a versão).
6. **Endereço.** No nó **Webhook do SIG-FT**, aba *Production URL*, copie o endereço. Ele termina em
   `/webhook/sigft-revisao-listas`.
7. **No SIG-FT.** Na engrenagem (Configuração), abra **Chaves de API** e preencha:
   - **AMP Webhook (URL):** o endereço do passo 6;
   - **AMP Webhook (chave):** o valor do passo 3.

## 3. Ligado ao SIG-FT: testar

Cada chamada ao workflow publicado gasta uma das **50 execuções publicadas do mês**.

| O que | Execuções |
|---|---|
| Testar conexão com o AMP | 2: o ping e o eco |
| Revisar no AMP | 1 por lista, mais 1 ping no começo da rodada |
| Primeiro teste completo (conexão + uma lista) | 4 |

1. **Conexão.** No PMIB Manager, aba **Revisão no AMP**, clique em **Testar conexão com o AMP**. O eco usa os códigos
   da última conferência: rode a aba **Conferência de Revisões** antes (sem ela, só o ping vai).
   - O **ping** prova a rede, a chave e o workflow publicado.
   - O **eco** passa pelo Revisor de Listas e confere se os códigos voltaram iguais. É o teste de mascaramento:
     se voltar `FALHOU ... mascarado`, o AMP está escondendo códigos, e a tabela remontada não é confiável.
2. **Uma lista.** Clique em **Revisar no AMP** e, logo que a primeira lista for ao AMP, em **Parar**: as outras ficam
   "parado". O HTML aparece na pasta do `_STATUS_PMIB`.
3. **Conferir.** Siga a Etapa 5c de `docs/ROTEIRO_DE_TESTE.md`. Confira também tudo o que está em "A conferir".

## 4. Melhorar os agentes

Se um agente errar (item inventado, página errada, item que faltou):
1. corrija o system prompt dele no AMP. O workflow **não** precisa ser importado de novo;
2. leve a mesma mudança para `agentes/revisor_de_listas.md` ou `agentes/conferente_de_listas.md` no repositório, que
   guarda a versão que vale.

**Para testar de novo sem gastar execução publicada,** repita a mesma lista quantas vezes quiser em execução manual:
1. no n8n, menu **Executions**, abra a execução de uma lista real e copie a saída do nó **Webhook do SIG-FT** (aba
   JSON);
2. no editor do workflow, abra o nó **Webhook do SIG-FT**, edite a saída (*Edit output*, o lápis), cole e salve. Isso
   fixa os dados (*pin*). O nome do botão muda conforme a versão do n8n;
3. clique em **Execute workflow**. A execução manual não conta no limite e não muda nada no SIG-FT;
4. o HTML sai no nó **Monta o resultado**, aba *Binary* → *Download*.

Os dados fixados têm texto dos documentos. Eles ficam no n8n da GE e só valem na execução manual. **Não exporte** o
workflow com eles para o repositório.

O que é regra fica no código, e não no prompt: a proteção das colunas da equipe, a prova no PDF e a remontagem da
tabela. Para mudar regra, mude `js/`, rode o gerador e importe de novo.

## Se der errado

Cada lista que falha gera um **diagnóstico**:
- o console mostra a falha e onde o diagnóstico foi gravado;
- fica gravado em `Documentos\SIG-FT\logs\amp\`;
- o botão **Copiar diagnóstico** junta o de todas as falhas da rodada, já com uma abertura que diz ao Claude o que é o
  texto.

O diagnóstico **não leva texto de documento nem a chave**. Leva:
- a versão do SIG-FT;
- a lista e as revisões;
- o tamanho do que foi mandado;
- o HTTP e o tempo;
- a resposta;
- o **número da execução do n8n**. No n8n, menu **Executions**, essa execução mostra em que nó parou e por quê.

Para pedir ajuda numa conversa nova (o Claude na web, no PC da GE, com o repositório do SIG-FT), cole isto e, embaixo,
o diagnóstico:

```text
Estou testando a revisão das listas pelo AMP no SIG-FT (PMIB Manager, aba Revisão no AMP). A
chamada ao workflow do n8n falhou. Leia, no repositório:
- amp/revisao_de_listas/LEIA-ME.md e docs/superpowers/specs/2026-11-02-amp-agentes-revisao-design.md
- amp/revisao_de_listas/js/ (o código dos nós) e amp/revisao_de_listas/agentes/ (os system prompts)
- sigft/core/amp/cliente.py e sigft/services/revisao_amp.py
Diga a causa provável e o que eu faço: no AMP, no n8n, no SIG-FT ou no código. Não peça os
documentos: eles não podem sair da GE. O diagnóstico do SIG-FT está abaixo.
```

Se o que falhou foi o **Testar conexão com o AMP**, cole as duas linhas do console (`Ping` e `Eco`) no lugar do
diagnóstico. Se o SIG-FT nem abriu a aba, cole o fim de `Documentos\SIG-FT\logs\sigft.log`.

| Sintoma | Onde olhar |
|---|---|
| "Sem conexão com o AMP" | a rede da máquina: ela precisa alcançar `ampworkflow.gevernova.net` |
| HTTP 401 ou 403 | a chave no SIG-FT é diferente da credencial `X-SIGFT-Chave` do workflow |
| HTTP 404 | o workflow não está publicado, ou o endereço no SIG-FT não é a Production URL |
| HTTP 502, `etapa: revisor`, "falhou" | o nó Revisor de Listas deu erro depois de 3 tentativas: veja a execução no n8n. Confira a credencial e o agente escolhidos no nó. "424" ou "500 from runtime" é erro do AMP: tente mais tarde |
| HTTP 502, `etapa: revisor`, "não devolveu o JSON combinado" | o Revisor respondeu texto: confira se o system prompt foi colado inteiro e se o agente é o Revisor de Listas |
| HTTP 502, `etapa: montar` | defeito no código do nó Monta o resultado: mande o diagnóstico |
| HTML com "A conferência não foi feita" | o Conferente falhou ou não devolveu o JSON. Nada foi aplicado na tabela; rode a lista de novo ou confira tudo à mão |
| "o agente não devolveu HTML" | o workflow importado é o antigo, de antes de 2026-11-02: importe o atual |
| "o AMP não respondeu JSON" | algo no caminho devolveu uma página (login, proxy): a resposta está no diagnóstico |
| "a conexão com o AMP caiu depois de N s" | algo no caminho (um proxy) corta a chamada longa; o n8n pode ter seguido, veja a execução. Se cair sempre perto do mesmo tempo, o workflow tem de responder logo e o SIG-FT buscar o resultado depois: desenho novo |
| "o AMP não respondeu em 15 min" | os agentes demoraram demais: veja a execução no n8n. Se o nó de um agente deu tempo esgotado, abra *Add option* → *timeout* nele e ponha o maior valor |

A revisão de cada lista vai **uma vez só**: o SIG-FT não repete a chamada sozinho, porque cada repetição seria outra
execução no AMP.

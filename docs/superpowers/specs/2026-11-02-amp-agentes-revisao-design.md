# Revisão das listas pelo AMP: dois agentes no lugar do nó de modelo

**Data:** 2026-11-02. **Peça anterior:** `docs/superpowers/specs/2026-10-27-amp-revisao-de-listas-design.md`. O
contrato com o SIG-FT (§4, §7 e §8 de lá) não muda; mudam o §5 (o pedido) e o §6 (o workflow).

As decisões marcadas *(minha decisão)* são de quem escreveu este desenho, não do Luan.

## 1. Por quê

O desenho de 27/10 tinha um agente só: um nó de modelo (Basic LLM Chain com o GEV LLM Model) devolvia o HTML
inteiro, com o `_STATUS_PMIB` redigitado pelo modelo. Dois fatos mudaram o caminho:

- **O agente do AMP entra no workflow** (conversa da LMR, 28/10). O nó AMP Agent (`CUSTOM.amp`) chama um agente
  criado na plataforma, com descrição, modelo, system prompt e Knowledge base. Pelas sondas S9 e S10 da LMR:
  - a mensagem vai em `chatInput`;
  - a resposta volta em `output`;
  - o PDF mandado pelo campo Files deu erro 424/500;
  - o texto dentro da mensagem funcionou.
- **O jeito que funcionou no chat.** Na revisão que o Luan fez à mão, o prompt vinha cheio de contexto: o papel,
  como a lista nasce, para que serve o controle e só então o que analisar. O `pedido.md` era curto de propósito.

## 2. O que o Luan decidiu

- **Dois agentes**, aprovados em 02/11:
  - o **Revisor de Listas** compara e propõe;
  - o **Conferente de Listas**, de outra família de modelo, faz a "Verificação?" do rascunho dele.
- **O agente lê tudo e interpreta** (decisão de 27/10): os dois PDFs e o `_STATUS_PMIB` inteiros, e não só uma
  extração de itens para o código comparar.
- **Ele confere o HTML antes de colar** (27/10). Nada é aplicado no Excel.
- **Primeiro, o workflow montado à mão**, com formulário e sem o SIG-FT. A ligação pelo webhook e pela chave fica
  para depois (02/11).

## 3. Os agentes

| | Revisor de Listas | Conferente de Listas |
|---|---|---|
| Modelo | Claude Sonnet 5.5 | Gemini 3.5 Flash-Lite, temperatura 0 |
| Recebe | a lista, as duas revisões com `--- página N ---` e o `_STATUS_PMIB` com a coluna LINHA | o mesmo e o resultado do Revisor |
| Devolve (JSON) | `mudancas` (M1...) e `acoes` (A1...: atualizar, remover ou inserir), cada uma com página e trecho literal | um veredito para cada id (confirmado, corrigido, rejeitado ou a_conferir) e `faltou` (F1...) |

- Os system prompts ficam em `amp/revisao_de_listas/agentes/`. O arquivo de cada agente traz a ficha e o prompt.
- O formato segue o prompt do chat do Luan e as regras do second brain: QTD. como valor final, linhas DOCUMENTAL,
  DUPLICADO, renumeração, como casar um item com uma linha e o que não é mudança.
- A Knowledge base é opcional: `contexto_sobressalentes.md`. Ela usa só exemplos inventados *(minha decisão)*, porque
  as notas do second brain trazem códigos reais de outras listas, que o agente poderia confundir com os da lista
  revisada.
- O Revisor também atende o `MODO ECO`, que é o teste de mascaramento do SIG-FT *(minha decisão)*: assim não é
  preciso um terceiro agente só para o eco.

## 4. O que fica com o código, e não com os agentes *(minha decisão)*

É a regra do plano da LMR no AMP: "a IA só lê documentos; montar os códigos é regra". O nó "Monta o resultado"
aplica uma ação só quando três condições valem:
- o Conferente confirmou ou corrigiu;
- o trecho citado está no texto da revisão atual;
- o código do material aparece nela. Numa remoção, o código **não** pode aparecer, nem grudado no texto vizinho,
  como a extração de PDF do n8n costuma deixar.

O resto do que o código garante:
- **As colunas da equipe nunca mudam:** CÓDIGO PMIB e tudo à direita dele. É o leiaute dos 54 `_STATUS_PMIB` do Box
  medidos em 02/11.
- **O que não passa vai para "A conferir"**, fora da tabela. Na dúvida, a tabela fica como estava.
- **A remontagem segue a ordem da planilha:** sem as linhas removidas e com os itens novos depois da LINHA indicada.
- **O removido vai para a seção da SEM_LISTA_STATUS_PMIB**, com o andamento e a origem em OBSERVAÇÕES.
- **A linha de revisão nova** sai da revisão atual e da data de hoje.
- **O HTML carrega o resultado em JSON** (`<script id="sigft-revisao">`), que é o ponto de partida da peça 3.
- **Se o Conferente falhar**, a resposta continua `ok`, com um `aviso`, e nada é aplicado. Só a falha do Revisor
  vira erro.

## 5. Os dois workflows

| | Montado à mão (agora) | Ligado ao SIG-FT (depois) |
|---|---|---|
| Entrada | formulário: código, revisões, os dois PDFs e o `_STATUS_PMIB` colado do Excel | webhook com o JSON do SIG-FT |
| Leitura dos PDFs | Extract from File, com *Join Pages* desligado | o SIG-FT já manda o texto por página |
| Agentes e montagem | os mesmos | os mesmos |
| Saída | página final do formulário, que entrega o HTML | resposta ao webhook, `{ok, html, ...}` |
| Execuções publicadas | nenhuma (roda à mão) | uma por lista, mais o ping |
| Onde está | `passo_a_passo_workflow_n8n.md` e `nos_para_colar/` | `workflow_revisao_de_listas.json` e o `LEIA-ME.md` |

`gerar_workflow.py` gera os dois a partir de `js/`. Os testes de `tests/test_amp_workflow.py` rodam o código dos nós
no Node contra uma lista inventada.

## 6. Medido no Box em 02/11 (só números, nenhum texto saiu)

- **PDFs de lista:** 73, com 3 a 12 páginas, todos com texto.
- **O pedido de uma lista:** mediana de 16 mil caracteres, máximo de 82 mil. Cabe numa chamada só.
- **O `_STATUS_PMIB`:** mediana de 23 linhas, máximo de 220.

## 7. O que só a GE prova

- O nó AMP Agent com o pedido inteiro, e o tempo que cada agente leva.
- Os nomes das opções do n8n do AMP, que podem variar com a versão:
  - *Keep Source* e *Join Pages* no Extract from File;
  - a página final que devolve o arquivo;
  - o *timeout* do nó do agente.
- O id do modelo do Conferente no `agentId` (`gemini-3.5-flash-lite`, um palpite). Escolher o agente no nó resolve.
- Se o PDF pelo campo Files funciona com um agente Gemini. Funcionando, o agente passaria a ler desenho e tabela pelo
  PDF.
- O mascaramento de códigos (o eco).

# Análise da Aplicação LMR pelo AMP (n8n)

O workflow que o SIG-FT chama no módulo **Gerar Aplicação LMR**, aba **2. Análise no AMP**, botão
**Enviar ao AMP**. Ele leva ao agente *Spare Parts LMR Extractor*, criado no AMP, o texto que a aba 1
extraiu dos PDFs de um sistema, um lote por vez, e devolve um CSV com as posições onde cada material
sobressalente está instalado.

> **Estado: ainda não testado.** O workflow nunca rodou no n8n do AMP e o agente nunca rodou no AMP.
> Tudo o que está escrito aqui sobre o AMP vem do desenho e dos testes que leem o `.json` e rodam o
> código do nó que junta as respostas. A primeira rodada de verdade é a Tarefa 16 do plano. Use a seção
> "O primeiro teste no n8n" como roteiro dela.

O SIG-FT manda:
- os campos `modo=aplicacao_lmr`, `escopo`, `subsistema`, `trechos` e `lotes` (quantos lotes vão);
- os arquivos `indice` (`INDICE.md`), `status_pmib` (`STATUS_PMIB.csv`) e `lote_01` até `lote_NN`
  (`LOTES\lote_NN.md`), todos da pasta `LMR\EXTRACAO` do sistema.

O workflow confere que todos os arquivos chegaram, lê o texto de cada um e percorre os lotes um a um.
Para cada lote chama o agente com uma sessão nova, com o formato do CSV, o índice, o catálogo e o texto
do lote. Se a chamada falha, espera 60 s e tenta de novo, até 3 vezes. Lote que falha nas 3 vai para
`lotes_com_erro`. No fim junta as linhas num CSV só, com um cabeçalho só.

O SIG-FT grava o CSV em `LMR\EXTRACAO\RESPOSTA_AMP.csv` (o anterior vira `RESPOSTA_AMP (anterior).csv`).
Nada é aplicado no Excel: a aba 3 é que lê o CSV, valida e monta a planilha.

Desenho: `docs/superpowers/specs/2026-11-11-gerar-aplicacao-lmr-design.md`, §4.

| Arquivo | O quê |
|---|---|
| `agente.md` | a cópia do agente no AMP: nome, descrição, goal e system prompt. **O agente se melhora no AMP**, e a cópia é atualizada depois |
| `kb/regras_lmr.md` | o arquivo "Regras LMR" da Knowledge base do agente |
| `gerar_workflow.py` | gera o `.json`: `python amp/aplicacao_lmr/gerar_workflow.py` |
| `workflow_aplicacao_lmr.json` | o workflow para importar ou colar no n8n. Não edite à mão: rode o gerador |

O cabeçalho do CSV é o contrato entre o agente e o SIG-FT (`COLUNAS` em
`sigft/services/gerar_lmr_csv.py`). Se mudar um, muda o outro.

## Ligar (uma vez)

### 1. O agente, no AMP

1. Crie o agente com o texto do `agente.md`:
   - **Agent Name:** `Spare Parts LMR Extractor` (o nó do workflow o acha por esse nome);
   - **Customized Goal** e **Description:** os do arquivo;
   - **Model:** o do arquivo (`bedrock-claude-sonnet-5.5`);
   - **Tone:** `professional`;
   - **System Prompt:** o do arquivo.
2. **Data sources:** a Knowledge base com o `kb/regras_lmr.md`. Os textos a ler chegam na mensagem de
   cada pedido.
3. Não use o **Add Optimized Query**: ele reescreve o prompt e pode amolecer regras como "não invente".

### 2. O workflow, no n8n

1. **Importar.** **Create workflow**, menu **⋯**, **Import from File...**, e escolha
   `workflow_aplicacao_lmr.json`. Ou abra o arquivo, copie tudo e cole no canvas vazio com **Ctrl+V**.
2. **Credencial.** Abra o nó **Webhook do SIG-FT**. Em *Credential for Header Auth*, escolha
   **Create new**:
   - **Name:** `X-SIGFT-Chave`;
   - **Value:** um valor longo e aleatório. No PowerShell:

     ```powershell
     -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})
     ```

   Guarde o valor: ele vai no SIG-FT no passo 3. Não o escreva em arquivo do repositório.
3. **O agente.** No nó **AMP Agent**:
   - escolha **Spare Parts LMR Extractor**. Se ele não aparecer, confira se foi salvo no AMP e
     recarregue a página; **By ID** é a saída;
   - confira a credencial do AMP;
   - em **Add option**, **Timeout**, ponha o máximo.
4. **Publicar.** Salve e publique o workflow (*Publish* ou *Active*, conforme a versão).
5. **Endereço.** No nó **Webhook do SIG-FT**, aba **Production URL** (não a *Test URL*), copie o
   endereço. Ele termina em `/webhook/sigft-aplicacao-lmr`.

### 3. No SIG-FT

1. Vá em **Gerar Aplicação LMR**, **Configurar IA** (no alto) e escolha **Análise no AMP (Gerar
   Aplicação LMR)**:
   - **Endereço:** a Production URL;
   - **Chave:** o valor da credencial.

   Clique em **Salvar**. A aba 2 passa a dizer "Workflow AMP configurado".
2. Na aba 2, clique em **Testar conexão com o AMP**. O console deve mostrar uma linha
   `OK      Ping: workflow 2026-11-11 (HTTP 200, ...)`. O ping prova três coisas: a rede, a chave e o
   workflow publicado. Ele não chama o agente.

## Testar sem o SIG-FT (PowerShell)

Serve para separar um problema do SIG-FT de um problema do AMP. Copie o `INDICE.md`, o
`STATUS_PMIB.csv` e os `lote_NN.md` de uma extração para `C:\temp\amp` (o `curl.exe` costuma falhar
com acento no caminho). Troque o `XXXXXX` pela chave e o `<servidor>` pelo servidor do n8n. Se houver
mais de dois lotes, acrescente um `-F "lote_03=@..."` para cada um e mude `lotes`. Depois cole no
PowerShell:

```powershell
$url   = "https://<servidor>/webhook/sigft-aplicacao-lmr"
$chave = "XXXXXX"
$teste = "C:\temp\amp"
curl.exe -sS -w "`nHTTP %{http_code} em %{time_total} s`n" -H "X-SIGFT-Chave: $chave" --form-string "modo=ping" $url
curl.exe -sS --max-time 2700 -o "$teste\resposta_amp.json" -w "HTTP %{http_code} em %{time_total} s`n" -H "X-SIGFT-Chave: $chave" --form-string "modo=aplicacao_lmr" --form-string "escopo=RV" --form-string "subsistema=TESTE" --form-string "trechos=TODAS" --form-string "lotes=2" -F "indice=@$teste\INDICE.md" -F "status_pmib=@$teste\STATUS_PMIB.csv" -F "lote_01=@$teste\lote_01.md" -F "lote_02=@$teste\lote_02.md" $url
$resposta = Get-Content "$teste\resposta_amp.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$resposta | Select-Object ok, modo, lotes_recebidos, lotes_com_erro, execucao, versao_workflow
$resposta.csv | Set-Content "$teste\resposta_amp.csv" -Encoding UTF8
```

- **O ping** deve responder em poucos segundos.
- **A rodada** vai levar minutos por lote. O tempo de uma rodada inteira ainda não foi medido.
- **Se o HTTP não for 200,** rode `Get-Content C:\temp\amp\resposta_amp.json`: o corpo diz a `etapa`
  e o `erro`.

## O primeiro teste no n8n: as 11 suposições

O workflow foi escrito sem acesso ao n8n do AMP. Estas 11 coisas foram supostas e só o primeiro teste
prova. Rode com **Execute workflow** no canvas ou pelo PowerShell acima e confira uma a uma:

| # | A suposição | O que olhar |
|---|---|---|
| 1 | O nó **Passa os arquivos** mantém os binários, e o nó **Separa os arquivos** lê `$input.first().binary` e repassa cada arquivo | Na execução, abra **Separa os arquivos**, aba Binary: deve haver um item por arquivo (índice, Status e cada lote) |
| 2 | O nó **Lê o texto** (Extract from File, operação texto) existe nessa versão do n8n, lê a propriedade `data` e devolve o texto em `json.data`, **na mesma ordem** da entrada | A ordem importa: o índice é o item 0 e o Status o item 1. Abra a saída do nó e confira o começo de cada texto |
| 3 | O nome do campo **Session ID** do nó AMP Agent é o que o workflow preencheu, e o `chatInput` é lido sem definir o Prompt | Veja se cada lote chega ao agente com sessão própria (`lmr-<execução>-<lote>-<tentativa>`) e se o agente recebe a mensagem, e não "Prompt is empty" |
| 4 | Na saída de erro do AMP Agent (`continueErrorOutput`) o item traz `numero`, `tentativa` e o `error` | Force um erro (agente despublicado, por exemplo) e veja o item que sai pela saída de erro. Sem o `tentativa`, as novas tentativas podem não parar: pare a execução se passar de 3 voltas |
| 5 | `$('Nó').first()` dentro do laço devolve a execução corrente do nó | Confira o `numero` e a `tentativa` em **Guarda o lote**, **Guarda o lote com erro** e **Pode tentar de novo?** em cada volta |
| 6 | **Um lote por volta** (Loop Over Items, versão 3): a saída 0 é o fim, com todos os itens, e a saída 1 é o laço | Com 2 lotes, veja se o agente roda 2 vezes e se **Junta o CSV** recebe os 2 resultados |
| 7 | O nó **Wait** (60 s) funciona nessa versão e cria o webhook sozinho na importação | Force a falha de um lote e veja se a espera de 60 s acontece e se a volta seguinte começa |
| 8 | A execução inteira, com todos os lotes, cabe no tempo do webhook e do Production | Meça uma rodada real. Se o n8n cortar, o SIG-FT mostra "a conexão caiu" e o resultado fica no histórico |
| 9 | A mensagem cabe no agente: índice, catálogo e lote de até 80.000 caracteres | Procure erro de tamanho no nó AMP Agent com o maior lote |
| 10 | A credencial do AMP e o agente que o JSON aponta são os da instância da GE | No nó **AMP Agent** confira a credencial e o agente escolhidos depois de importar |
| 11 | A configuração `saveManualExecutions` do JSON é aceita na importação | Se a importação reclamar, tire a opção do JSON gerado (ou ligue **Save manual executions** na tela) |

Além das 11, ainda **não foi testado** que o agente cumpre o `agente.md`: só o CSV, sem frase antes,
com `;` e 13 colunas. O que ele devolver vai para o `ler_csv`, que recusa o que não for CSV.

## Melhorar o agente

**As instruções moram no AMP, não no workflow.** Se o agente errar (TAG inventada, linha sem página,
quantidade de reposição no lugar da instalada):
1. Corrija o system prompt no AMP: o agente, Configure.
2. Copie o texto novo para o `agente.md`, num commit que diga o porquê.

Não precisa reimportar o workflow: ele só chama o agente. Mude o workflow só se mudar o contrato
(campos, nomes de arquivo ou colunas): nesse caso, mude o `gerar_workflow.py`, rode-o e reimporte.

## Resgatar o CSV de uma execução que não voltou ao SIG-FT

Se o SIG-FT fechou no meio, ou desistiu antes da resposta (ele espera até 45 min), o resultado fica
no histórico do n8n:
1. No workflow, abra o menu **Executions** e escolha a execução do sistema, pela hora.
2. Clique no nó **Junta o CSV**, aba **Output**, visão **JSON**. Copie tudo e salve num Bloco de
   Notas como `C:\temp\amp\resultado.json`, em UTF-8.
3. No PowerShell, troque os nomes entre `< >` e rode:

```powershell
$pasta = "<pasta do sistema>\LMR\EXTRACAO"
$dados = Get-Content "C:\temp\amp\resultado.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$linha = if ($dados -is [array]) { $dados[0] } else { $dados }
$csv = if ($linha.json) { $linha.json.csv } else { $linha.csv }
Set-Content -Path (Join-Path $pasta "RESPOSTA_AMP.csv") -Value $csv -Encoding UTF8
```

O formato exato da saída do n8n ainda não foi visto: se o campo `csv` não estiver onde o script
procura, abra o `resultado.json` e ajuste o caminho. Depois, na aba 3 do SIG-FT, escolha esse CSV.
Se a execução parou no **AMP Agent**, não há CSV: o motivo está na saída de erro desse nó.

## Se der errado

O que se vê de cada rodada:
- **O console da aba 2** mostra o que vai (índice, Status e quantos lotes), a espera, de 30 em 30 s, e
  o que volta (as linhas, a execução e os lotes sem leitura).
- **Quando a resposta falha,** o SIG-FT grava um diagnóstico em `Documentos\SIG-FT\logs\amp\`
  (`<data> aplicacao_lmr.txt`), com o motivo, o HTTP, a execução, a versão do workflow e o começo do
  corpo da resposta, sem a chave. Em caso de sucesso, não grava diagnóstico.
- **Com o número da execução,** o n8n mostra em que nó ela parou (menu **Executions**).

| Sintoma | Onde olhar |
|---|---|
| "Sem conexão com o AMP" | a rede da máquina: ela precisa alcançar o servidor do n8n |
| HTTP 401 ou 403 | a chave do **Configurar IA** (Análise no AMP) é diferente da credencial `X-SIGFT-Chave` do workflow |
| HTTP 404 | o workflow não está publicado, ou o endereço é a Test URL (`/webhook-test/`) |
| HTTP 400, etapa `arquivos` | os arquivos não chegaram completos: veja a aba Binary do Webhook na execução e o nó **Passa os arquivos** (*Include Other Input Fields = All*) |
| Etapa `agente`, "nenhum lote foi lido pelo agente" | o agente falhou em todos os lotes: veja a saída de erro do nó **AMP Agent** na execução e confira o agente e a credencial |
| "O AMP recebeu N lote(s) e foram enviados M" | o workflow percorreu menos lotes do que foram enviados: veja o laço (suposição 6). O CSV é gravado assim mesmo, incompleto (aviso no console) |
| "A resposta do AMP não tem um CSV válido" | o agente devolveu texto no lugar do CSV: o corpo está no diagnóstico. Melhore o system prompt no AMP |
| "O agente não leu os lotes ..." (aviso) | o CSV saiu incompleto: o que faltou são as linhas desses lotes. Rode de novo ou resgate da execução |
| "Sem a extração em LMR\EXTRACAO" | a aba 1 não rodou nessa pasta, ou faltam o índice, o Status ou os lotes |
| "o AMP não respondeu JSON" | algo no caminho devolveu uma página (login, proxy): a resposta está no diagnóstico |
| "a conexão com o AMP caiu depois de N s" | algo no caminho corta a chamada longa; o n8n pode ter seguido (veja a execução) |
| "o AMP não respondeu em 45 min" | a rodada demorou demais: veja a execução. O Timeout do AMP Agent no n8n precisa ser de 45 min ou mais |

**O envio vai uma vez só.** O SIG-FT não repete a chamada sozinho, porque cada repetição seria outra
execução do agente no AMP. Para tentar de novo, clique em **Enviar ao AMP** outra vez.

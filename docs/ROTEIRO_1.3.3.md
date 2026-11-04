# Roteiro de teste da 1.3.3 (Windows, máquina real)

Tudo o que mudou desde a v1.3.2 (bloco `## 1.3.3` do `CHANGELOG.md`). A suíte de
testes não alcança nada disto: Outlook, Excel, Box, Aconex, AMP e o portal só
existem na máquina de quem usa. Cada item tem o que precisa antes, os passos, o
resultado esperado e o que mandar se der errado.

**Os logs que se pedem a cada falha** ficam em `Documentos\SIG-FT\logs\`:

| Arquivo | O que tem |
|---|---|
| `sigft.log` | tudo o que o SIG-FT escreveu, com as linhas `[atualizacao]` |
| `diario.log` | cada abertura e fechamento (e queda) do SIG-FT |
| `amp\amp_revisao_*.log` | um por execução da Revisão no AMP |
| `erros_lmr.csv` | os códigos que falharam na Aplicação LMR |

Na dúvida, mande o `sigft.log`, o `diario.log` e um print da tela.

---

## 1. Atualizar da 1.3.2 (por arquivos)

**Antes:** a 1.3.2 instalada "só para mim" (em `AppData\Local\Programs\SIG-FT Itaipu`).
Para receber uma rc da 1.3.3, a caixa **"Receber versões de teste"** marcada em
Configuração.

- [ ] 1. Abra o SIG-FT. O aviso de versão nova mostra um tamanho de poucos MB (o
  zip de arquivos), não os ~300 MB do instalador.
- [ ] 2. Clique em **"Atualizar agora"**. O status passa por "Aplicando a
  atualização…" e "Conferindo os arquivos…", e o SIG-FT fecha e abre sozinho,
  sem instalador e sem pedido de permissão.
- [ ] 3. A Home mostra a versão nova; no `diario.log`, a linha
  `ATUALIZACAO por arquivos v1.3.2 -> v<nova>`.

**Se baixou o completo** (o status ficou minutos em "Baixando… ~300 MB"): mande o
`sigft.log`. As linhas `[atualizacao]` dizem por quê (pasta sem escrita ou o
registro do Windows com outra versão).

## 2. Migração de Program Files

**Antes:** uma máquina com o SIG-FT instalado **para todos** (Program Files).
Detalhes na Etapa 5d.2 do `docs/ROTEIRO_DE_TESTE.md`.

- [ ] 1. Atualize pelo app: vem o **instalador completo**, que pede a senha de
  administrador uma vez.
- [ ] 2. A pasta de Program Files some; o SIG-FT abre de `AppData\Local\Programs`;
  `Documentos\SIG-FT` (chaves, preferências) continua igual.
- [ ] 3. Desafixe o atalho velho da barra de tarefas e fixe o SIG-FT aberto.

**Se falhar:** o `sigft.log`, o `diario.log` e o `instalacao.log` da pasta
`%TEMP%\SIG-FT_Update`.

## 3. Sugestões (a lâmpada)

**Antes:** Outlook instalado e aberto com a conta da GE.

- [ ] 1. Na Home, a **lâmpada** está ao lado da engrenagem. O Ctrl+K também acha
  "Sugestões".
- [ ] 2. Clique nela: abre a janela **Sugestões**. O botão **"Escrever o e-mail"**
  fica cinza enquanto o texto está vazio.
- [ ] 3. Escreva uma frase, deixe **"Anexar o log do SIG-FT"** marcado e clique em
  **"Escrever o e-mail"**. O status diz "Abrindo o rascunho…" e depois "Rascunho
  aberto no Outlook. Revise e envie."
- [ ] 4. No Outlook, o rascunho tem o **"Para" vazio**, a versão no assunto, o
  texto, a versão, o idioma e o sistema no corpo, e o **`sigft.log` anexado**. Nada
  foi enviado.
- [ ] 5. Feche a janela de Sugestões e abra de novo pela lâmpada: o texto continua lá.

**Sem Outlook** (ou se ele não responder): abre o programa de e-mail padrão, sem
anexo, e o status diz que o log vai à mão, com o caminho dele. Texto muito longo
chega cortado por esse caminho (o `mailto:` leva até 1800 caracteres).

**Se não abrir nada:** um print do status da janela e o `sigft.log`.

## 4. Telas num notebook 1366×768

**Antes:** um notebook com tela 1366×768 (ou a resolução do Windows ajustada para
ela), letra Normal.

- [ ] 1. Com o SIG-FT maximizado, abra **Upload Condições**, **Upload Specs** e
  **Correção de PDM**. O console aparece inteiro embaixo, com a barra do filtro
  (Tudo, Avisos, Erros, Buscar) à vista: nada cortado no pé da tela.
- [ ] 2. Abra as outras telas do menu: nenhuma tem barra de rolagem para os lados.
- [ ] 3. Em Configuração, troque a letra para **Grande**: pode aparecer rolagem
  vertical, mas nenhum texto cortado.

**Se algo cortar:** print da tela inteira, com o nome da tela e a letra usada.

## 5. Estabilidade (sem quedas)

A queda do `MenuDeOpcoes.paintEvent` (o SIG-FT fechava sozinho, às vezes ao
trocar de tela) foi resolvida na Busca PMIB e em mais cinco telas.

- [ ] 1. Use o SIG-FT normalmente por uma sessão longa, trocando bastante de tela
  (Busca PMIB, Home, Analyzer, Upload Condições, Upload Specs, Correção de PDM) e
  abrindo os menus de opções.
- [ ] 2. Nenhuma queda. Se o SIG-FT fechar sozinho, na abertura seguinte a Home
  avisa no topo, com "Abrir o registro".

**Se cair:** o `diario.log` (a linha da queda) e o `sigft.log`, com o que estava
fazendo na hora. O AutoSpec ainda tem o mesmo tipo de problema (é da frente do
Rafael); anote se a queda foi nele.

## 6. Aplicação LMR: o `erros_lmr.csv`

**Antes:** uma Aplicação LMR em que algum código falhe (ou um lote pequeno real).

- [ ] 1. Rode a Aplicação LMR.
- [ ] 2. No fim, o console diz onde gravou o relatório dos códigos que falharam:
  `Documentos\SIG-FT\logs\erros_lmr.csv`, e o arquivo está lá (antes ia para a
  pasta de onde o SIG-FT foi aberto).

**Se o console disser que não conseguiu gravar:** a linha do console e o `sigft.log`.

## 7. DocPack

**Antes:**
- a mapeadora (`Mapeamento Listas de Sobressalentes.xlsx`) com ao menos uma lista
  PB020 **sem** `_STATUS_PMIB`;
- os templates do Box, em `15 - PDM\Templates`: `codigo_itaipu_STATUS_PMIB.xlsx`,
  `Lista de Sobressalentes com preço.xlsm` e o da Aplicação LMR
  (`Aplicação LMR - Sistema.xlsx` ou `APLICACAO LMR - SOBRESSALENTES_template.xlsx`);
- **uma pasta raiz de TESTE** (por exemplo `Documentos\DocPack teste`), com uma
  ou duas pastas de capítulo copiadas da raiz real só para ter onde escolher. Não
  use a `SOBRESSALENTES - PMIB` real no primeiro teste.

**Passos** (o DocPack é a aba do PMIB Manager; numa versão com os módulos de
Gestão separados, é o item próprio do menu):

- [ ] 1. Escolha a **mapeadora** e a **pasta raiz** de teste. Se os templates
  estão no Box, os três botões de template ficam verdes sozinhos; senão, escolha
  cada um.
- [ ] 2. **"Listar sem _STATUS_PMIB"**: a tabela traz as listas sem link e sem
  `_STATUS_PMIB` na raiz, com código, título, pasta do capítulo, sistema e pasta
  final.
- [ ] 3. Marque uma lista e clique em **"Sugerir com IA"**: os campos de capítulo,
  sistema e pasta final se preenchem. Confira se faz sentido; ajuste à mão se não.
- [ ] 4. **"Pré-visualizar"**: o console lista cada pasta e arquivo que seria
  criado, e nada é criado ainda.
- [ ] 5. **"Criar dossiês"**: confirma "Criar {n} dossiê(s) em …?". Responda Sim.
  O console mostra uma linha por lista (✅/⚠️/❌) e o resumo.
- [ ] 6. Na pasta criada há: `<código>_STATUS_PMIB.xlsx`, `<código com PB021>.xlsm`
  e as subpastas `LMR\` (com `Aplicação LMR - <pasta>.xlsx`), `IMAGENS\` e
  `DATASHEETS\`.

**Abra cada arquivo no Excel:**
- [ ] 7. `_STATUS_PMIB`: na aba **Lista de Materiais**, a **A3** traz
  `ET / CAPÍTULO / SUBSISTEMA | CÓDIGO ITAIPU / CÓDIGO CMI | EVENTOS` da lista; a
  **A4** traz a revisão em uso e a data de hoje. As listas suspensas e a aba
  Checklist funcionam como no template. O Excel não pede reparo ao abrir.
- [ ] 8. Lista com preço (`.xlsm`): abre **com as macros** (aviso de habilitar
  conteúdo, como o template). Na **Capa**, a **F37** tem o código PB021 e a **E27**
  o título da lista + " - LISTA DE SOBRESSALENTE COM PREÇO". A Contracapa repete
  esses dados pelas fórmulas.
- [ ] 9. Aplicação LMR: na aba **DOCS DE REFERENCIA**, ao lado de "LISTA DE
  SOBRESSALENTE:", "ESPECIFICACAO TECNICA / CAPITULO:" e "SUBSISTEMA:", os valores
  da lista. Se o console avisou ⚠️ que não achou um desses rótulos, anote qual: o
  template real pode ter outro texto.
- [ ] 10. Rode **"Criar dossiês"** de novo com a mesma lista: ela é pulada (já tem
  `_STATUS_PMIB` vivo) e nenhum arquivo é sobrescrito.
- [ ] 11. Só depois de 7 a 10 certos: crie um dossiê na raiz real e rode o
  **Gestão PMIB**. Ele liga o `_STATUS_PMIB` novo na mapeadora (o DocPack não mexe
  nela).

**Se falhar:** o print da tela, a parte do console da lista (Copiar, no console),
o `sigft.log` e, se for erro de conteúdo, o arquivo gerado.

## 8. Upload de Fotos (RPA no portal)

**Antes:** sessão no portal PMIB (login manual), uma **pasta de fotos de um
subsistema** com arquivos `<4 últimos dígitos do PMIB><letra>` (`0071.jpg`,
`0071a.jpg`, só JPEG/PNG) e o `_STATUS_PMIB` do sistema. Comece com **2 ou 3
fichas** de teste. O caderno do módulo é `docs/UPLOAD_DE_FOTOS.md`.

- [ ] 1. Menu **4.5. Upload de Fotos**: escolha a pasta de fotos e o `_STATUS_PMIB`.
- [ ] 2. Em "3. Fichas que já têm fotos", escolha **"Perguntar em cada ficha que
  já tiver fotos"** no primeiro teste. Em "4. Velocidade do portal", deixe Normal
  (use Lento se o portal estiver demorando).
- [ ] 3. **"INICIAR UPLOAD"**: o console lista as fotos fora do padrão e os finais
  ambíguos ou sem ficha (esses não sobem). Abre a janela **"Fichas para subir as
  fotos"**: marque as de teste e clique em **"Subir nas marcadas"**; confirme o
  "Começar?".
- [ ] 4. Faça o login no navegador quando ele pedir.
- [ ] 5. Na ficha que já tiver fotos, a janela pergunta: **Excluir e subir**,
  **Adicionar** ou **Pular**. Teste uma de cada, se houver fichas.
- [ ] 6. No portal, na aba "Documentos e imagens" de cada ficha: as fotos da pasta,
  sem repetição, com a descrição `imagens - <4 dígitos>`.
- [ ] 7. No `_STATUS_PMIB`, a coluna `DOCUMENTOS E IMAGENS` da ficha: `COMPLETO`
  (fotos e documento) ou `INCOMPLETO` com a nota "Faltam documentos". Ficha que
  falhou fica como estava. Os comentários e listas suspensas da planilha continuam.
- [ ] 8. O console fecha com "{ok} de {n} ficha(s) com as fotos no portal."

**Se falhar:** o console inteiro (Copiar), o `sigft.log` e o número PMIB da ficha.
É RPA: o problema costuma ser o portal, e se resolve numa sessão local
(`docs/OLHAR_O_PORTAL.md`).

## 9. Revisão no AMP (peça 2 v2)

**Antes:** o PC da GE (o AMP só existe na rede da GE), o agente e o workflow
`amp/revisao_de_listas/` publicados no n8n (`amp/revisao_de_listas/LEIA-ME.md`) e
uma Conferência de Revisões feita nesta sessão. O passo a passo completo é a
Etapa 5c do `docs/ROTEIRO_DE_TESTE.md`; aqui só o que mudou na 1.3.3:

- [ ] 1. Na aba **Revisão no AMP**, o botão **"Webhook…"** guarda a Production URL
  e a chave. Em Configuração → Chaves de API não há mais os campos do AMP (o que
  estava lá foi aproveitado na primeira vez).
- [ ] 2. **"Testar conexão com o AMP"** faz só o ping: `OK Ping: workflow …`.
- [ ] 3. As listas abrem **todas marcadas**; "Marcar todas" e "Desmarcar todas"
  funcionam. Só as marcadas vão.
- [ ] 4. Mande uma lista: o console mostra os arquivos que vão, uma linha a cada
  30 s e a resposta com o tempo, o número da execução e os arquivos recebidos. A
  lista pronta se desmarca sozinha.
- [ ] 5. O botão **"Abrir Pasta"** da lista abre a pasta do `_STATUS_PMIB` dela,
  com os PDFs e o HTML.

**Se falhar:** o `amp\amp_revisao_*.log` da execução e o número da execução no n8n.

---

## Como mandar o resultado

Para cada item: ✅, ou ❌ com o número do passo, o print e o log pedido. Os itens
que dependem de outra pessoa (Program Files, AMP) podem ficar para depois; o resto
dá para fazer numa tarde.

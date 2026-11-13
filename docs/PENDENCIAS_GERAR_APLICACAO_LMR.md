# Gerar Aplicação LMR: pendências para o módulo ficar 100% funcional

Estado em 2026-11-13. Dono da frente: João. O histórico e as decisões estão no caderno
[`GERAR_APLICACAO_LMR.md`](GERAR_APLICACAO_LMR.md); aqui fica só o que falta, na ordem em que precisa acontecer.

## O que já funciona hoje

A **aba 3 (Realizar a Aplicação LMR)** funciona de ponta a ponta: com um CSV no formato do módulo e o
`_STATUS_PMIB`, gera a Aplicação no template e a planilha de validação. O motor dá o mesmo resultado do
`lmr.js` do Box em cinco aplicações reais (Água Pura, SFC, Aeração, Reg. Vel. e CCAR), e o Excel abre os
arquivos sem reparo.

As **abas 1 (Extração) e 2 (Análise no AMP)** estão escritas e testadas com dublês, mas nunca rodaram de
verdade: dependem de duas coisas que ainda não existem, o pacote do Docling e o agente no AMP.

## 1. Pacote do Docling (a DLC). Bloqueia a aba 1

Sem isto o botão **Extrair documentos** fica desligado para todo mundo.

- [ ] **Gerar o pacote.** Numa máquina com Python 3.12 e rede: `empacotamento\docling_dlc\Gerar-DLC.bat`
  (10 a 40 minutos, vários GB). Anotar o tamanho da pasta e do zip.
- [ ] **Se o zip passar de 2 GB:** implementar a divisão em partes no job `dlc` do `release.yml` e a junção em
  `sigft/services/gerar_lmr_dlc.py`. Hoje o job reprova nesse caso.
- [ ] **Sonda sem rede.** Rodar o pacote, com a rede desligada, nos PDFs da Água Pura e da SFC. Portão da spec
  §2.2: toda TAG da aplicação emitida aparece no texto extraído; página escaneada sai com texto. Medir o tempo
  por documento. Roteiro em `empacotamento/docling_dlc/LEIA-ME.md`.
- [ ] **Confirmar o par de versões** `docling==2.150.0` + `torch==2.9.1+cpu` na conversão real. Só foi
  conferido que o `pip` resolve.
- [ ] **Publicar:** `git tag docling-v1 && git push origin docling-v1`. O job `dlc` do `release.yml` nunca rodou;
  a primeira publicação é também o teste dele.
- [ ] **Instalar pela tela** (botão **Instalar componente**) numa máquina da empresa e ver o aviso sumir.

## 2. Agente e workflow no AMP. Bloqueia a aba 2

Precisa de aprovação para mexer no AMP.

- [ ] **Criar o agente** com `amp/aplicacao_lmr/agente.md` e a base `kb/regras_lmr.md`.
- [ ] **Importar o workflow** `amp/aplicacao_lmr/workflow_aplicacao_lmr.json` no n8n e ligar a chave
  `X-SIGFT-Chave`.
- [ ] **Conferir as 11 suposições** sobre os nós do n8n listadas no `amp/aplicacao_lmr/LEIA-ME.md`. A mais
  séria: se o nó de erro não devolver o item, o contador de tentativas de um lote pode repetir sem fim.
- [ ] **Configurar o endereço e a chave** no SIG-FT (botão **Configurar IA** da tela) e passar no
  **Testar conexão com o AMP**.
- [ ] **Confirmar o limite de execuções do AMP** (falava-se em 50 por mês). Cada envio gasta uma execução por
  lote.

## 3. Rodada real pelas três abas. É o que prova o módulo

- [ ] Rodar **Água Pura** e **SFC** do começo ao fim: Extrair, Enviar ao AMP, Gerar aplicação.
- [ ] Comparar cada aplicação gerada com a emitida, ficha a ficha, e registrar em
  `docs/revisoes/2026-11-gerar-aplicacao-lmr.md`. Os dados reais ficam na máquina, fora do Git.
- [ ] Conferir se o campo `DOCUMENTO` do CSV do agente casa com o nome do arquivo da extração (o arquivo tem a
  revisão entre colchetes, `[R1A]`; a conferência tira o colchete final, mas só uma extração real confirma).
- [ ] Ajustar o agente (`agente.md`) com o que a comparação mostrar. A qualidade da aba 2 depende disso.

## 4. Defeitos e limites conhecidos no código

Nenhum impede o uso; todos têm comportamento definido.

- [ ] **Fechar o SIG-FT com a extração rodando** deixa o processo do Docling vivo até ele terminar o PDF.
- [ ] **Arquivo de saída aberto no Excel:** a geração recusa na hora, em vez de oferecer "tentar de novo". É o
  que evita gravar a Aplicação sem a Validação.
- [ ] **Conferência com o REF-0013 (regra V3) e detecção de ciclo entre PAI e FILHO** existem no `lmr.js` e não
  foram portadas. O plano não pedia.
- [ ] **Frequência não encontrada vira `TODAS`.** O plano antigo mandava perguntar ao usuário; o CSV não tem
  como perguntar.
- [ ] **`STATUS_PMIB.csv` enviado ao agente tem três colunas** (ficha, descrição, código do material). A spec
  §3.3 também cita item, seção e marca/modelo.
- [ ] **Célula C3 da aba `DOCS DE REFERÊNCIA`** (especificação técnica / capítulo) fica vazia: a tela não pede
  esse dado.
- [ ] **A lista de PDFs olha só a pasta escolhida**, sem subpastas.
- [ ] **Banco AUTO ficou fora da regressão** contra o `lmr.js`: não há BASE dele no Box.
- [ ] **Descrição e PN vêm do Status, não da BASE antiga.** Na Reg. Vel., três fichas da BASE não estão no
  Status de exemplo e três descrições diferem em espaço ou quebra de linha; com um Status atual essas linhas
  saem diferentes da aplicação antiga.

## 5. Para combinar com o Luan

- [ ] As três zonas dele tocadas por esta frente: `SIG-FT.spec` (o template nas `datas`),
  `sigft/app/ia_por_modulo.py` (tarefa `aplicacao_lmr`) e `.github/workflows/release.yml` (gatilho `docling-v*`,
  condição no job `build` e o job novo `dlc`).
- [ ] A linha do mural do `CLAUDE.md` avisando do módulo novo (o mural já tinha 5 avisos).
- [ ] As 4 falhas de `tests/test_amp_workflow_ia_por_modulo.py` no Python 3.14, que já existiam antes desta
  frente.

## Como saber que acabou

O módulo está 100% funcional quando uma pessoa, numa máquina da empresa com o SIG-FT instalado pelo
instalador, consegue: instalar o componente pela tela, extrair os PDFs de um sistema, enviar ao AMP, gerar a
aplicação, e o resultado bate com uma aplicação emitida conferida ficha a ficha.

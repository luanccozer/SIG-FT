# Módulo Aplicação LMR (Gerar Aplicação LMR): caderno da frente

Estado em 2026-11-13. Branch `joao/modulo-aplicacao-lmr`. Dono da frente: João.

O módulo "7.1. Gerar Aplicação LMR" leva os PDFs de um sistema e o `_STATUS_PMIB` até a planilha da
Aplicação LMR: Docling (componente à parte) → pasta de extração → agente do AMP pelo n8n → CSV → aplicação
no template.

- Desenho: `docs/superpowers/specs/2026-11-11-gerar-aplicacao-lmr-design.md`
- Plano (17 tarefas): `docs/superpowers/plans/2026-11-11-gerar-aplicacao-lmr.md`
- Como funciona hoje: `docs/base-conhecimento/17-gerar-aplicacao-lmr.md`
- Lado do AMP: `amp/aplicacao_lmr/LEIA-ME.md`
- Pacote do Docling: `empacotamento/docling_dlc/LEIA-ME.md`

## O que está pronto

Todo o código do plano está escrito e testado. Com dados reais, até aqui, só o motor e a leitura do Status
(ver "Provado com dados reais"); a extração e o AMP ainda não rodaram com um sistema real.

| Tarefa | O quê | Onde |
|---|---|---|
| 2 | programa da DLC do Docling | `empacotamento/docling_dlc/docling_sigft.py` |
| 3 | receita do pacote e roteiro da sonda | `empacotamento/docling_dlc/` (`.spec`, `Gerar-DLC.bat`, LEIA-ME) |
| 4, 5 | motor: regras, geração e validação (port do `lmr.js` do Box) | `sigft/services/gerar_lmr_regras.py`, `gerar_lmr_motor.py` |
| 6 | leitura e conferência do CSV | `sigft/services/gerar_lmr_csv.py` |
| 7 | gravação no template e planilha de validação | `sigft/services/gerar_lmr_planilha.py`, `sigft/dados/lmr/` |
| 8 | conversor da BASE antiga e teste de regressão por assinatura | `tools/lmr_base_para_csv.py`, `tests/test_gerar_lmr_regressao.py` |
| 9 | serviço da extração (chama a DLC, monta índice e lotes) | `sigft/services/gerar_lmr_extracao.py` |
| 10, 14 | a tela, com as três abas, e o registro do módulo | `sigft/app_qt/views/gerar_aplicacao_lmr.py` |
| 11 | baixar e instalar a DLC; job de publicação | `sigft/services/gerar_lmr_dlc.py`, `.github/workflows/release.yml` |
| 12 | agente do AMP e base de regras | `amp/aplicacao_lmr/agente.md`, `kb/regras_lmr.md` |
| 13 | workflow do n8n | `amp/aplicacao_lmr/gerar_workflow.py`, `workflow_aplicacao_lmr.json` |
| 14 | envio ao AMP | `sigft/services/gerar_lmr_amp.py` |
| 15 | documentação e CHANGELOG | `docs/`, `amp/aplicacao_lmr/LEIA-ME.md` |

Suíte inteira nesta máquina (Python 3.14): 9368 passam, 4 falham. As 4 são de
`tests/test_amp_workflow_ia_por_modulo.py` e já falhavam antes de qualquer mudança desta frente.

## Pendências para concluir

### 1. O que só roda na máquina da empresa, no Box ou no AMP

- [ ] **Tarefa 3, pacote da DLC.** Rodar `empacotamento\docling_dlc\Gerar-DLC.bat` (Python 3.12, com rede;
  10 a 40 minutos, vários GB). Anotar o tamanho da pasta e do zip. Se o zip tiver 2 GB ou mais, falta
  implementar a divisão em partes (no job e em `gerar_lmr_dlc.py`).
- [ ] **Tarefa 3, sonda.** Rodar o pacote **sem rede** com os PDFs da Água Pura e da SFC, medir o tempo por
  documento e passar o portão da spec §2.2 (toda TAG da aplicação emitida aparece na extração; páginas
  escaneadas saem com texto). O roteiro e o script da contagem estão no LEIA-ME da DLC.
- [ ] **Tarefa 11, publicar a DLC.** `git tag docling-v1 && git push origin docling-v1`, com o job já na
  branch oficial, e instalar pela tela (**Instalar componente**) na máquina da empresa.
- [ ] **Tarefa 16, AMP.** Criar o agente e importar o workflow pelo `amp/aplicacao_lmr/LEIA-ME.md`, conferir
  as 11 suposições listadas nele, rodar a Água Pura e a SFC pelas três abas e comparar cada aplicação com a
  emitida, ficha a ficha. Registrar em `docs/revisoes/2026-11-gerar-aplicacao-lmr.md`. Os dados reais ficam
  na máquina.

### 2. Revisão final (Tarefa 17)

- [x] Revisão da branch (2026-11-13): nada grave. Corrigidos: resposta do AMP que se perdia com o
  `RESPOSTA_AMP.csv` aberto no Excel; troca de pasta que mantinha CSV e Status do sistema anterior;
  `.paginas.json` pela metade que derrubava a geração; nome com `/ : * ?` no arquivo; CSV salvo pelo Excel em
  cp1252; linha do CSV com coluna a mais; índice e lotes velhos depois de extração interrompida.
- [ ] Ficaram da revisão, sem correção: **Parar** só é visto quando a DLC imprime uma linha (PDF pesado demora);
  nada impede **Enviar ao AMP** com a extração rodando; o teste de arquivo aberto em `gerar_lmr_planilha.py`
  recusa antes de o diálogo "tentar de novo" aparecer.
- [x] App aberto numa janela de verdade (2026-11-13): as três abas desenham certo e o botão **Gerar aplicação**
  fez a Água Pura (3580 linhas). Os avisos em laranja das abas 1 e 2 ficavam espremidos; corrigido. Não foram
  clicados na janela: **Instalar componente**, **Extrair** e **Enviar ao AMP** (dependem da DLC e do AMP).
- [x] Aplicação e validação da Água Pura (dados reais, 3580 linhas) abrem no Excel sem reparo (2026-11-13).
- [ ] PR para `claude/checkpoint-01-refactor-executor-5lawtu`, com a lista das zonas do Luan.

### 3. Para combinar com o Luan antes do PR

- [ ] Três commits isolados em zonas dele: `SIG-FT.spec` (o template nas `datas`), `sigft/app/ia_por_modulo.py`
  (tarefa `aplicacao_lmr`) e `.github/workflows/release.yml` (gatilho `docling-v*`, condição no job `build`
  e o job novo `dlc`, que nunca rodou).
- [ ] A linha do mural do `CLAUDE.md`. O mural já tem 5 avisos, então não foi aplicada. Texto sugerido:
  "Módulo novo 7.1. Gerar Aplicação LMR: serviços `gerar_lmr_*.py`, tela `views/gerar_aplicacao_lmr.py`,
  a DLC do Docling fora do instalador (o SIG-FT nunca importa `docling`/`torch`). Ainda sem rodada real:
  leia `docs/base-conhecimento/17-gerar-aplicacao-lmr.md`."
- [ ] O item do módulo no bloco `## 1.4.1` do `CHANGELOG.md`.
- [ ] As 4 falhas antigas de `tests/test_amp_workflow_ia_por_modulo.py` no Python 3.14.

### 4. Decisões em aberto

- **V3 e ciclo PAI/FILHO.** O motor em Python não tem a conferência com o REF-0013 nem a detecção de ciclo
  entre pais. O `lmr.js` tem as duas; o plano não pedia.
- **Frequência não encontrada vira `TODAS`.** O plano antigo mandava perguntar ao usuário; o CSV não tem como
  perguntar.
- **`STATUS_PMIB.csv` com três colunas** (ficha, descrição, código do material). A spec §3.3 também cita item,
  seção e marca/modelo.
- **Aba `DOCS DE REFERÊNCIA`, célula C3** (especificação técnica / capítulo) fica vazia: a tela não pede esse dado.
- **A lista de PDFs olha só a pasta escolhida**, sem subpastas.
- **O leitor une linhas do CSV com a mesma posição e a mesma quantidade.** Quantidade diferente em trechos
  separados fica em linhas separadas (as BASEs reais têm isso); só é conflito, com aviso, se os trechos se cruzam.
- **Descrição e PN vêm do Status, não da BASE.** Na Reg. Vel. três fichas da BASE não estão no Status de exemplo
  e três descrições diferem só em espaço ou quebra de linha: com o Status, essas linhas saem diferentes da
  aplicação antiga. A regressão compara com o catálogo da própria BASE, como o Workflow B fazia.

## Provado com dados reais (2026-11-13)

- **Motor igual ao `lmr.js` do Box em cinco aplicações** (assinatura e bloqueadas): Água Pura, SFC, Aeração,
  Reg. Vel. e CCAR, pelo caminho BASE → CSV → `ler_csv` → `gerar`. As assinaturas estão em
  `tests/fixtures/lmr/assinaturas.json`. O Banco AUTO não tem BASE no Box e ficou de fora.
  Para repetir: copiar `motor\saidaases\*.xlsx` do Box para uma pasta local e rodar
  `tests/test_gerar_lmr_regressao.py` com `LMR_BASES` apontando para ela. A referência sai de
  `geraLote` do `lmr.js` (TAGs da aba BASE, PN da aba DOCS DE REFERÊNCIA) com `node`.
- **`catalogo_do_status` lê os cinco `_STATUS_PMIB` de exemplo** com o openpyxl real e acha o mesmo número de
  fichas que o `lerStatusPmib` do `lmr.js` (87, 14, 57, 141 e 41).
- **Aba 3 de ponta a ponta com a Água Pura**: CSV convertido da BASE + Status real → `realizar_aplicacao` →
  3580 linhas, 0 bloqueadas, a mesma assinatura do `lmr.js` (`3580-4B02203E`).

## Armadilhas já pagas

- Os testes do módulo não pegam as guardas do projeto. Antes de cada commit de serviço ou tela, rodar a suíte
  inteira: ela achou o `wb.save` direto (a regra é `salvar_perguntando`) e a tela 9 px mais alta que o limite
  de 1366x768.
- `empacotamento/docling_dlc/docling_sigft.spec` cai no `*.spec` do `.gitignore`: precisa de `git add -f`.
- A referência do motor é o `lmr.js` do **Box** (`DocManager Itaipu\Docs Aconex\LMR\motor\lmr.js`), não o do
  GitHub. Ele tem 8 eixos e o cabeçalho do template é `FICHA_PMIB | CÓDIGO_LMR | TAG_LMR | Status`.
- O `pip` passa pelo Zscaler sem `--trusted-host`; `curl` e `urllib` do Python 3.14 não passam.
- Dado real (Status, PDFs, aplicações, CSVs, BASEs) nunca entra no Git nem em conversa com IA.

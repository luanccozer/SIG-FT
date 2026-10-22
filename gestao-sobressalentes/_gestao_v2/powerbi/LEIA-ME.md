---
tags: [gestao-v2, power-bi, handoff]
criado: 2026-10-01
atualizado: 2026-10-05
---

# Power BI v2 — como montar

> [!success] v4.3 (22/10/2026): atualização que não quebra por arquivo opcional
> - Em 21/10 o Luan não conseguiu atualizar na máquina da GE ("erro com o arquivo"). Não reproduziu aqui. O arquivo
>   do Box estava íntegro e no Box da nuvem (log do Box Drive).
> - Causa provável: o export do Aconex mais recente. O DocManager grava um por dia, e o Box o cria com 0 byte enquanto
>   sobe. Um export incompleto ou travado derrubava a atualização inteira.
> - **Agora:**
>   - export do Aconex ilegível → vale o anterior (até 3); nenhum legível → aba de follow-up;
>   - extrato de eventos ausente ou ilegível → tabela vazia (nenhuma página usa);
>   - as páginas internas de listas mostram de onde veio a situação das listas de preços
>     ("Situação das listas de preços: Aconex: Aconex_Historico_…" ou "aba de follow-up").
> - **Continuam estritos, de propósito:** `_STATUS_PMIB`, listas de preços e mapeadora. Se um não abrir, a atualização
>   para com o nome do arquivo, em vez de mostrar números errados.
> - **Testado** com falhas simuladas: export do dia vazio, só export vazio e extrato ausente. Todas atualizam.
> - No Box desde 22/10. A versão anterior está em `%LOCALAPPDATA%\Sobressalentes-v2\backup_pbi_20261022`.

> [!success] v4.2 (15/10/2026, noite): o painel não depende mais da aba Atividades da mapeadora
> - Pedido do Luan: as atividades vão ser registradas de outro jeito, talvez numa coluna nova da mapeadora.
> - Saíram a consulta e a tabela `Atividades`, as 3 medidas (abertas, atrasadas, travadas) e a relação com
>   `Listas`. Nenhuma página usava. O arquivo de consultas passou a se chamar `04 - Listas e Eventos.pq`.
> - No painel HTML saiu o card "Plano de ação (aba Atividades)".
> - Pode apagar ou reorganizar a aba à vontade. Se a coluna nova vier, é só pedir para o painel lê-la.
> - No Box desde 15/10, 19h30: projeto inteiro, sem cache. Clique em Atualizar ao abrir.
>   - O que o Luan salvou às 19:16 está em `%LOCALAPPDATA%\Sobressalentes-v2\backup_pbi_20261015_1916`.
>   - Na leitura final, as letras dos cartões do slide já não cortam.

> [!success] v4.1 (15/10/2026): filtros no slide e versão "clássica"
> - Os dois slides do relatório Itaipu têm filtros pequenos de **Especificação técnica** e **Capítulo** no topo,
>   sincronizados com as outras páginas.
> - Os dois vêm com o filtro de página **Lista ≠ SEM_LISTA** já aplicado. Ele fica no painel Filtros; tire de lá
>   para ver tudo.
> - **"Resumo (1 slide, clássico)"**: a mesma página com o visual do painel antigo de sobressalentes.
>   - Fundo branco, bordas e títulos azul-marinho em maiúsculas, fonte DIN.
>   - Cores antigas: verde aprovado, vermelho não aprovado, azul-marinho não emitido, azul-claro em processo.
>   - Formatação aplicada visual a visual (`CLASSICO` em `relatorios_v2.py`). O nome interno do DIN nos visuais é
>     `wf_standard-font`; o nome "DIN" só funciona na caixa de texto.
> - **Letras maiores nos dois slides** (o Luan achou pequenas; o padrão da tela, 9 a 11 pt, some numa projeção):
>   - títulos dos visuais 13, eixos e valores das barras 12, números grandes 28, tabela 11, título da página 18;
>   - modo `grande=True` da `Pagina` (`TAM_SLIDE` em `relatorios_v2.py`). As outras páginas não mudaram.
> - **A situação das listas de preços vem do Aconex** (15/10), e não mais da aba manual "Lista de preços Follow-up".
>   - A aba estava desatualizada: tinha 21 das 28 listas de preços do Aconex, e vários status velhos.
>   - A fonte é o export diário do DocManager Itaipu (`Box\DocManager Itaipu\Aconex_Historico_*.xlsx`, o mais
>     recente, aba `Documentos`), na revisão atual (`Current`) e na coluna **Status**.
>   - É lista de preços o código `PB021`/`PB020-0x` que não seja código de lista.
>   - A aba de follow-up só liga a lista de preços à lista de sobressalentes. Sem ela, liga pelo código.
>   - Parâmetro opcional `PastaDocManager`: vazio, usa a pasta `DocManager Itaipu` ao lado da pasta do Consórcio no Box.
>     Sem export, volta para a aba de follow-up.
>   - Resultado em 15/10: **18 listas com lista de preços no Aconex** (UG 7, CC 4, SAE 4, IC 1, SAM 1, SMF 1).
>     A UG tinha 2 pela aba.
>   - Status novo: *For Partial Handover*, nas 3 listas de refrigeração da UG.
> - **Correção da regra da lista de preços de cada lista** (15/10).
>   - Antes, a PB021 que só existe na pasta passava na frente de uma lista de preços já postada no Aconex. A UG
>     aparecia com 2 listas "com preços" em vez de 4.
>   - Agora vale primeiro a que está no Aconex. "Em elaboração (CMI)" só aparece quando não há nenhuma no Aconex.
>   - Total com lista de preços no Aconex: 12 → 16.
>   - Limite que continua: a fonte é a aba "Lista de preços Follow-up", que é manual. Há listas de preços PB020 nas
>     pastas que não estão nela (ex.: `#ST00=M00QEB10&EPB020-01`).
>   - Ler o export do Aconex DocManager (o mesmo que o Gestão PMIB usa) resolveria isso sem digitação.
> - **No Box desde 15/10, 18h10**: o projeto inteiro (o modelo mudou), sem cache. Ao abrir, clique em Atualizar.
>   O que o Luan salvou às 17:15 (com cache) está em `%LOCALAPPDATA%\Sobressalentes-v2\backup_pbi_20261015`
>   nesta máquina.
> - Ajustes do Luan preservados: o hífen no título do slide ("Sobressalentes - situação geral"). Os filtros de ET e
>   Capítulo não oferecem "(Em branco)".
> - Entrega no Box: só as duas pastas `.Report`. O modelo (`.SemanticModel`) ficou como o Luan salvou em 15/10, com o
>   cache de dados, e por isso o arquivo abre já com números. O modelo da v4.1 é igual ao da v4.
> - Em 15/10 a atualização deu problema no trabalho e voltou a funcionar. Não consegui reproduzir aqui: o arquivo do
>   Box estava íntegro e atualizou pelos dois caminhos (pasta automática e pasta preenchida). Se acontecer de novo,
>   guarde a mensagem de erro.

> [!success] v4 (14/10/2026): situação das listas e das listas de preços + um slide para Itaipu
> - **Itaipu › Resumo (1 slide)**: primeira página do relatório Itaipu, feita para colar num slide 16:9. Sem filtro e
>   sem rolagem.
>   - Três números: listas aprovadas, listas com lista de preços no Aconex e fichas enviadas.
>   - Três barras: última revisão no Aconex, lista de preços de cada lista e etapa das fichas.
>   - Entrega: itens entregues, autorizações pendentes e além do prazo.
>   - Uma tabela por especificação técnica.
> - **Interno › Listas de sobressalentes**:
>   - situação da **última revisão no Aconex**, com o vocabulário do Aconex: Aprovado, Aprovado com comentários,
>     Para assinatura, Em processo, Não aprovado, Não emitido;
>   - a situação da **lista de preços de cada lista**;
>   - uma tabela com cada lista ao lado da sua lista de preços.
> - **Interno › Listas de preços**: a situação no Aconex completa, mais **Em elaboração (CMI)**: PB021 que já está na
>   pasta e ainda não foi para o follow-up.
> - **Regras novas**:
>   - "Aprovadas" continua sendo o **Status Real** da mapeadora. Ele dá APROVADO a toda lista cuja última revisão
>     está *Aprovado*, *Aprovado com comentários* ou *Para assinatura*, e às *Em processo* que já tinham revisão
>     aprovada.
>   - A lista de preços de uma lista vem da coluna LISTA DE SOBRESSALENTES do follow-up. Vazia, a PB021 aponta pelo
>     próprio código (`…&MPB021` → `…&MPB020`). Vale primeiro a PB021, depois a mais recente.
>   - Mesmas regras no painel HTML (`regras_sobressalentes.status_aconex`, `lista_da_lista_de_precos`).
> - **Pasta no computador do trabalho**: em 06/10 alguém preencheu o parâmetro `PastaPMIB` com
>   `C:\Users\560083605\Box\…\SOBRESSALENTES - PMIB` e salvou. Foi a única mudança feita à mão no arquivo. A v4 já sai
>   com esse caminho (`montar_pbip.py --pasta …`). Em outra máquina o caminho não existe, e a consulta volta a procurar
>   a pasta sozinha.
>   - A detecção automática pelo `C:\Users` provavelmente não funcionou no trabalho. Quem souber o motivo (erro ou
>     permissão), registre aqui.
>   - A cópia anterior do Box (com o cache de dados de 06/10) está em
>     `%LOCALAPPDATA%\Sobressalentes-v2\backup_pbi_20261014`, nesta máquina.
> - **Conferido em 14/10** com os dados reais, Power BI e HTML com os mesmos números:
>   - listas: 93 cadastradas, 67 aprovadas;
>   - última revisão: 29 Aprovado, 15 com comentários, 21 para assinatura, 4 em processo, 11 não aprovado, 12 não
>     emitido, 1 sem lista;
>   - lista de preços: 12 com lista de preços no Aconex, 9 em elaboração, 72 sem.

> [!success] v3 (05/10/2026, tarde): visual executivo, filtros por ET e capítulo, acha a pasta sozinho
> **Como abrir e atualizar em qualquer máquina**
> 1. Precisa do **Power BI Desktop** e do **Box Drive** sincronizando `CMI - Consórcio Itaipu` (caminho padrão
>    `C:\Users\<seu usuário>\Box\CMI - Consórcio Itaipu\11 - Ger. Engenharia\15 - PDM\SOBRESSALENTES - PMIB`).
> 2. Abra `Sobressalentes v2 - Interno.pbip` (ou `- Itaipu.pbip`) na pasta `Sobressalentes v2 (Power BI)`.
> 3. **Página Inicial › Atualizar** (≈ 1 min). Pronto.
>
> Não há caminho para trocar: a consulta `PastaPMIBEfetiva` procura a pasta em `C:\Users\<cada usuário>\Box\...`.
> O parâmetro `PastaPMIB` fica **vazio**; só preencha (Transformar dados › Editar parâmetros) se o Box estiver em
> outro lugar. Para mandar a alguém um arquivo único: atualize e use Arquivo › Salvar como › `.pbix`.
>
> **O que tem**: um modelo (`Sobressalentes v2.SemanticModel`) e dois relatórios.
> - **Interno** (5 páginas):
>   - *Visão geral*: 6 indicadores, etapa das fichas, com quem estão, tabela por ET.
>   - *Listas de sobressalentes*: Aconex, situação no PMIB, revisão desatualizada, responsável.
>   - *Listas de preços*: situação no Aconex e as listas com fichas e **sem** lista de preços.
>   - *Autorização e entrega*: pauta da cobrança a Itaipu.
>   - *Fila de trabalho*: a primeira coisa que falta em cada ficha.
> - **Itaipu** (2 páginas):
>   - *Panorama*: etapa para o cliente, por ET e por lista.
>   - *Pendências*: autorizações além de 15 d.u. e listas de preços aguardando a SM.DT.
> - Em todas as páginas: filtros **Especificação técnica** e **Capítulo** (sincronizados entre as páginas) e a data
>   dos dados.
> - Visual: tema próprio (`relatorios_v2.py`) no estilo do protótipo HTML.
>   - Fundo claro, cartões brancos, números grandes.
>   - Barras horizontais simples com cor por significado: verde = concluído, vermelho = atraso, âmbar = aguardando.
>   - **Sem barras empilhadas em porcentagem.**
>
> **No Box desde 05/10/2026, 14h40** (versão testada, idêntica arquivo a arquivo).
>
> **Testado** em 05/10 no Power BI Desktop desta máquina, com os dados reais e o parâmetro vazio (achou a pasta
> sozinho). O filtro de ET foi testado propagando para as outras páginas. Os cartões mostram 0, e não "(Em
> branco)", quando não há dado: o gerador cria uma cópia oculta da medida, `... (cartão)` = `COALESCE(..., 0)`. As 7 tabelas atualizam em ≈ 30–50 s e todas as páginas foram conferidas por captura de tela.
> Números do dia:
> - 1.352 fichas, 615 enviadas (45%), 73 aprovadas;
> - 53 autorizações atrasadas (maior: 446 dias, e-mail de 24/06/2025);
> - 93 listas, 28 delas com fichas e sem lista de preços.
>
> "Fichas" = PMIB distinto (5 fichas aparecem em duas listas).
>
> **Para mudar**:
> - consultas: os `.pq`;
> - medidas: `05 - Medidas.dax`;
> - desenho das páginas: `relatorios_v2.py`.
>
> `python montar_pbip.py --saida <pasta>` gera tudo de novo; tema e logotipos vêm de `recursos/`.
>
> O `Sobressalentes - Dashboard.pbix` antigo **não atualiza mais** (a mapeadora virou cadastro em 05/10).

O roteiro abaixo é o que o gerador faz — serve para entender ou montar à mão.

O protótipo `_gerado/prototipo-dashboard.html` mostra o resultado esperado com os dados reais.
Este roteiro reproduz o mesmo painel no Power BI Desktop. As regras são as de
`_scripts/regras_sobressalentes.py`. **Situação da autorização e dias de atraso são calculados
pelo SIG-FT** e gravados no `_STATUS_PMIB`; o Power BI só lê (decisão de 04/10/2026).

> [!info] Layout do `_STATUS_PMIB` que este pacote lê (04/10/2026)
> `... APLICAÇÃO - LMR | TIPO DE ENTREGA | DATA DO EMAIL | SITUAÇÃO DA AUTORIZAÇÃO | DIAS DE ATRASO |
> EQUIPAMENTO ENTREGUE | FORNECEDOR | PROCUREMENT | OBSERVAÇÕES`, mais a linha
> "REVISÃO DA LISTA DE SOBRESSALENTES ATUAL EM USO" acima do cabeçalho.
> - `SITUAÇÃO DA AUTORIZAÇÃO` substituiu `APTO PARA ENTREGA` (SIM = AUTORIZADO). Valores:
>   AGUARDANDO ITAIPU · ATRASADO ITAIPU · AUTORIZADO · **N/A**. **Só FÍSICA E DOCUMENTAL precisa de
>   autorização**: DOCUMENTAL (componente) e TÍTULO (agrupamento) = N/A; TIPO vazio aparece no painel
>   como "SEM TIPO DE ENTREGA" e não conta. Arquivo antigo cai no APTO.
> - `DIAS DE ATRASO` = dias corridos além do prazo de 15 dias úteis do e-mail; congela quando
>   Itaipu autoriza (por isso `Autorizadas com Atraso` = autorizada com dias > 0).
> - Não há data de autorização nem coluna de prazo: o prazo é regra, não dado.

## O que muda em relação ao `Sobressalentes - Dashboard.pbix` atual

| Hoje | v2 |
|---|---|
| Uma tabela: a aba principal da mapeadora (contagens por lista) | Tabela fato **Itens** lida direto dos `_STATUS_PMIB`, uma linha por material |
| Os números só ficam certos depois de rodar o SIG-FT | Atualizou o `_STATUS_PMIB`, o Power BI já vê |
| Caminho fixo `C:\Users\560083605\Box\...` | Acha a pasta do Box sozinho em qualquer máquina (**PastaPMIB** só se estiver fora do padrão) |
| Funil misturando etapas que correm em paralelo | Barras simples por etapa e por "com quem está" (sem empilhar) |
| "Atraso de Itaipu" contado pelo SIG-FT com 14 dias corridos | situação e dias de atraso **calculados pelo SIG-FT** (15 dias úteis) e lidos do `_STATUS_PMIB` — o Power BI não calcula dias úteis |
| Sem tempo, sem tipo de entrega, sem valor | Situação da autorização, dias de atraso, LMR, tipo de entrega, valor US$ |
| Revisão em uso digitada à mão na mapeadora | Lida da linha de revisão de cada `_STATUS_PMIB` (`Listas[Revisao em Uso]`), com alerta de revisão desatualizada |
| Uma página interna copiada numa segunda, com gráfico de preço apontando para a coluna errada | Dois relatórios: **Interno** e **Itaipu** |

## Passo a passo (≈ 1 h na primeira vez)

1. **Novo arquivo** no Power BI Desktop.
2. **Consultas** — Página Inicial › Transformar dados › Nova Fonte › Consulta Nula ›
   Editor Avançado. Para cada bloco `// CONSULTA: Nome` dos arquivos `.pq`, cole o bloco e
   renomeie a consulta com o mesmo nome. Ordem:
   - `00` — `PastaPMIB` (parâmetro: **troque o caminho**), `DataReferencia`, `fxNorm`, `fxPMIB`,
     `fxLerTabela`, `fxData`, `fxStatus`, `fxTipoEntrega`, `fxRevisaoEmUso`
   - `01` — `Calendario`
   - `02` — `PrecosArquivos`, `PrecosPorPMIB`, `PrecosAconex`
   - `03` — `Itens`
   - `04` — `Listas`, `Atividades`, `Eventos`, `ListaEvento`
3. **Desabilite o carregamento** (clique direito › Habilitar carga) de: funções, `DataReferencia`,
   `PrecosArquivos`, `PrecosPorPMIB`. Fechar e aplicar.
4. **Relacionamentos** (Exibição de modelo):

   | De (muitos) | Para (um) | Filtro cruzado |
   |---|---|---|
   | `Itens[Lista]` | `Listas[Lista]` | único |
   | `PrecosAconex[Lista]` | `Listas[Lista]` | único |
   | `ListaEvento[Lista]` | `Listas[Lista]` | **ambos** |
   | `ListaEvento[Evento]` | `Eventos[Evento]` | único |
   | `Itens[Data Email]` | `Calendario[Data]` | único (ativo) |

   Marque `Calendario` como tabela de datas.
5. **Medidas** — Exibição de consulta DAX › cole `05 - Medidas.dax` inteiro › clique em
   **Atualizar modelo com alterações**. Formate: contagens `0`, `%` com 0 casas, US$ `#,##0`.
6. **Páginas** — abaixo. Comece pela visão interna.
7. **Publicação** — salve como `Sobressalentes - Interno.pbix`. Para o cliente, **Salvar como**
   `Sobressalentes - Itaipu.pbix` e apague as páginas internas (não basta ocultar: página oculta
   continua no arquivo). Se tiverem workspace, o melhor é um modelo semântico publicado e dois
   relatórios finos conectados a ele.

## Cores (validadas para daltonismo, claro e escuro)

| Uso | Cores |
|---|---|
| Com quem está (CMI · Fornecedor · Itaipu · Aprovada) | `#2a78d6` · `#eb6834` · `#1baf7a` · `#eda100` |
| Etapa para o cliente (preparação → análise → aprovada) | `#86b6ef` → `#2a78d6` → `#104281` |
| Situação (no prazo · atenção · fora) | `#0ca30c` · `#fab219` · `#d03b3b`, sempre com rótulo |
| "Depende do fornecedor" (seções) e "sem status válido" | `#898781` |

Tema do relatório: fundo `#fcfcfb`, texto `#0b0b0b`, secundário `#52514e`, grade `#e1e0d9`.
Nada de funil, rosca ou medidor: barras horizontais finas com rótulo na ponta.

## Visão interna (CMI) — 5 páginas

**1. Painel**
- Cartões: `Fichas` · `Fichas Emitidas` (+ `% Emitidas`) · `Autorizações Atrasadas Itaipu`
  (+ `Maior Atraso Itaipu (dias)`) · `LMR Fora do Compromisso` · `Valor Entregue USD` / `Valor Físico USD` ·
  `Pendências CMI`. Subtítulo com `Atualizado em`.
- Barras empilhadas 100%: eixo `Itens[Area]`, legenda `Itens[Com Quem]`, valor `Fichas`.
- Barras: seções da ficha — use uma tabela de apoio com as 6 medidas `%` (ou 6 cartões de linha).
  Valorização e LMR em azul; as do fornecedor em cinza.
- Segmentações (uma linha, no topo): `Itens[Area]`, `Listas[Nome]`, `Itens[Tipo de Entrega]`, `Itens[PROCUREMENT]`.

**2. Entrega (trilha logística)**
- Barras empilhadas por `Listas[Nome]`: `Aguardando Itaipu no Prazo` + `Autorizações Atrasadas Itaipu`;
  rótulo `Maior Atraso Itaipu (dias)`.
- Tabela: Lista, PMIB, Descrição, Data Email, Dias de Atraso, Situacao Autorizacao —
  filtro de página `Situacao Autorizacao` = ATRASADO ITAIPU. **É a pauta da cobrança.**
- Cartões: `Itens Físicos Entregues` / `Itens Físicos`, `Aptas Aguardando Entrega`, `Autorizadas com Atraso`,
  `Aguardando Cálculo do SIG-FT`.

**3. Documental**
- Matriz Lista × seção (% completo) com formatação condicional — mostra onde a ficha trava.
- Barras empilhadas `Situacao LMR` por lista (no prazo / atenção / fora), rótulo `Maior Atraso LMR (dias)`.

**4. Fila de trabalho**
- Tabela com `Itens[Pendencia]` ≠ "—", ordenada por Pendência e Dias de Atraso.
  Segmentação por Pendência e por PROCUREMENT. Detalhamento (drill-through) para a ficha.

**5. Plano de ação e listas de preços**
- Tabela de `Atividades` com `Situacao` ≠ CONCLUÍDA (ícone em ATRASADA / TRAVADA).
- Tabela de `PrecosAconex` com `Geracao` (destacar PB020-0x) e `Situacao Preco`.
- Tabela de `Listas` com `Revisao em Uso`, `Ultima Revisao` e `Revisao Desatualizada` (cartão
  `Listas com Revisão Desatualizada`): lista cujo `_STATUS_PMIB` ainda não foi conferido com a revisão nova.
- Página extra opcional: **Eventos de pagamento** — tabela `Eventos` com `% do Evento Cumprido`.

## Visão Itaipu (cliente) — 2 páginas

O que **não** vai: nomes de pessoas, procurement, observações internas, valor em US$, fila de
trabalho, LMR fora do compromisso, qualidade de dados.

**1. Panorama**
- Cartões: `Fichas Emitidas` ("fichas técnicas enviadas a Itaipu"), `Fichas em Análise IB`,
  `Fichas Aprovadas`, fichas com material entregue, `Pedidos de Autorização` pendentes
  (`Aguardando Itaipu no Prazo` + `Autorizações Atrasadas Itaipu`).
- Barras empilhadas por área, rampa de uma cor: em preparação/ajuste (CMI) → em análise
  Itaipu → aprovada.
- Linha: acumulado de `Fichas Emitidas` por `Calendario[Mes Ano]` (data do e-mail de intenção).

**2. Pendências e listas**
- "Pedidos de autorização de entrega": por lista, no prazo × além de 15 d.u., com a data do pedido e os dias de atraso.
- "Listas de preços aguardando a SM.DT": `PrecosAconex` com `Situacao Preco` = EMITIDA.
- Tabela por lista: fichas, enviadas, em análise, aprovadas, material entregue, autorização pendente.

> [!tip] Tom com o cliente
> "Pedidos de autorização além de 15 dias úteis" é fato contratual, não acusação — o painel
> mostra a data do pedido e os dias de atraso, e a conversa sai do "achismo" para a data.

## Atualização

Power BI Desktop › Atualizar. Se o Box estiver com arquivos "somente online", a primeira
atualização baixa os `_STATUS_PMIB` (pequenos). Erro de arquivo aberto: feche a planilha e repita.

## Relacionados
[[Plano - Sistema de Gestao v2]] · [[Planilha STATUS_PMIB]] · [[Indicadores e Como Ler]]

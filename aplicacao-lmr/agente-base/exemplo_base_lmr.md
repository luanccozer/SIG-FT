# Exemplo completo — Montador da BASE LMR (sistema fictício)

Knowledge base do agente. Tudo aqui é FICTÍCIO: serve para mostrar como cada etapa vira a seguinte.
Os nomes, códigos e TAGs não existem na usina. Nunca copie valores deste exemplo para uma BASE real.

## Parâmetros (mensagem INÍCIO)

```
INÍCIO
SISTEMA: Sistema X
ESCOPO: UG
SUBSISTEMA: SISTEMA X
TRECHOS DO PROJETO: TODAS
KITS: SEM TAG
PEÇAS: TAG
EIXO PADRÃO: CD
FREQUÊNCIA PADRÃO: PENDÊNCIA
ESPECIFICAÇÃO TÉCNICA / CAPÍTULO: ET 0000 / CAP. 00
ANEXOS: Status PMIB - Sistema X.xlsx; #ST00=M00ABC10UZ010-UZ001&MLU010.pdf; #ST00=M00ABC10UZ010-UZ901&MPA010.pdf;
#ST00=M00ABC10UH010-UH001&EFF010.pdf; #ST00=M00ABC10&MFB030.pdf; #ST00=M00ABC10&MPB020.pdf
```

## Status PMIB (aba Lista de Materiais, resumida)

| ITEM | QTD. | UNID. | DESCRIÇÃO | CÓDIGO DO MATERIAL | CÓDIGO PMIB | STATUS |
|---|---|---|---|---|---|---|
| 1 | 2 | PÇ | BOMBA CENTRIFUGA 50HZ F1015V-717 | 11111 | 4500000000.0001 | APROVADO |
| 1.1 | 4 | PÇ | SELO MECANICO DA BOMBA | 11112 | 4500000000.0002 | APROVADO |
| 2 | 1 | CJ | KIT DE REPARO BOMBA F1015V-717 | 11113 | 4500000000.0003 | APROVADO |
| 3 | 5 | PÇ | RELE AUXILIAR 24VCC | 11114 | 4500000000.0004 | APROVADO |
| 4 | 10 | M | MANGUEIRA 1/2" | 11115 | 4500000000.0005 | APROVADO |
| 5 | 1 | PÇ | MANOMETRO 0-10 BAR | 11116 | 4500000000.0006 | APROVADO |

Topo da planilha: `#ST00=M00ABC10&MPB020`, `EM USO: R1A`. As QTD. acima são de REPOSIÇÃO: não entram na BASE.

## Etapa 2 — ÁREAS CONFIRMADAS (devolvida pelo engenheiro)

| ÁREA/PAINEL | RDS-PP | LOCAL | ELEVAÇÃO | EIXO | TRECHOS DA ÁREA | EVIDÊNCIA | FALTA | OBSERVAÇÕES |
|---|---|---|---|---|---|---|---|---|
| SKID | #ST00=M00ABC10UZ010-UZ001 | CASA DE FORÇA | 98,50 | CD | | P&ID #ST00=M00ABC10&MFB030 p.1 (marca do conjunto); elevação informada pelo engenheiro; eixo padrão | | |
| PNL | #ST00=M00ABC10UH010-UH001 | CASA DE FORÇA | 104,20 | CD | | #ST00=M00ABC10UH010-UH001&EFF010 p.1; elevação informada pelo engenheiro; eixo padrão | | o documento chama de "PAINEL LOCAL"; nome trocado pela equipe |

## Etapa 3 — TAGS

| TAG | DESCRIÇÃO NO DOCUMENTO | ÁREA/PAINEL | TAG COM RDS-PP | QTD INSTALADA | ELEVAÇÃO | FREQUÊNCIA | PAI | EVIDÊNCIA |
|---|---|---|---|---|---|---|---|---|
| GP101 | bomba de circulação 1 | SKID | SIM | 1 | | 50 | | #ST00=M00ABC10UZ010-UZ901&MPA010 p.2 (lista "UNIDADE 50 HZ") |
| GP102 | bomba de circulação 2 | SKID | SIM | 1 | | 50 | | #ST00=M00ABC10UZ010-UZ901&MPA010 p.2 |
| | selo mecânico (item 1.1) | SKID | NÃO | 2 | | 50 | GP101 | #ST00=M00ABC10UZ010-UZ901&MPA010 p.2 (1 por bomba) |
| | mangueira 1/2" (item 12) | SKID | NÃO | 4 | | 50 | | #ST00=M00ABC10UZ010-UZ901&MPA010 p.3 |
| 72.1 | relé auxiliar | PNL | NÃO | 1 | | | | #ST00=M00ABC10UH010-UH001&EFF010 p.4 |
| 72.2 | relé auxiliar | PNL | NÃO | 1 | | | | #ST00=M00ABC10UH010-UH001&EFF010 p.4 |

## Etapa 4 — LIGAÇÃO

| PMIB | ITEM | DESCRIÇÃO | PAPEL | TAGS | PAIS | ÁREA/PAINEL | QTD INSTALADA | FREQUÊNCIA | FONTE DA FREQUÊNCIA | EVIDÊNCIA | PENDÊNCIA |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4500000000.0001 | 1 | BOMBA CENTRIFUGA 50HZ F1015V-717 | PRÓPRIO | GP101, GP102 | | | | 50 | documento | #ST00=M00ABC10&MPB020 p.3; MPA010 p.2 | |
| 4500000000.0002 | 1.1 | SELO MECANICO DA BOMBA | FILHO | | GP101, GP102 | | 1 | 50 | equipamento onde é montado (bomba) | MPA010 p.2: 1 selo por bomba | |
| 4500000000.0003 | 2 | KIT DE REPARO BOMBA F1015V-717 | KIT | GP101, GP102 | | SKID | | 50 | modelo F1015V-717 na descrição da bomba | MPB020 p.3 | QTD 1 por convenção de kit |
| 4500000000.0004 | 3 | RELE AUXILIAR 24VCC | PRÓPRIO | 72.1, 72.2 | | | | | | EFF010 p.4 | frequência não achada |
| 4500000000.0005 | 4 | MANGUEIRA 1/2" | SEM TAG | | | SKID | 1 | 50 | documento | MPA010 p.3 (granel: 1 por trecho) | |
| 4500000000.0006 | 5 | MANOMETRO 0-10 BAR | NÃO ACHADO | | | | | | | não está na lista de sobressalentes nem nos outros anexos | não encontrado |

## Etapa 5 — BASE

Trechos de 50 Hz do projeto TODAS: `U-01, U-02, U-03, U-04, U-05, U-06, U-07, U-08, U-09, U-09A`.

| LINHA | ESCOPO | SUBSISTEMA | FICHA_PMIB | DESCRIÇÃO | ÁREA/PAINEL | RDS-PP | TAG | TAG COM RDS-PP | PAIS | LOCAL | ELEVAÇÃO | EIXO | TRECHOS | QTD POR TRECHO |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | UG | SISTEMA X | 4500000000.0001 | BOMBA CENTRIFUGA 50HZ F1015V-717 | SKID | #ST[XX]=M[XX]ABC10UZ010-UZ001 | GP101 | SIM | | CASA DE FORÇA | 98,50 | CD | U-01, U-02, U-03, U-04, U-05, U-06, U-07, U-08, U-09, U-09A | 1 |
| 2 | UG | SISTEMA X | 4500000000.0001 | BOMBA CENTRIFUGA 50HZ F1015V-717 | SKID | #ST[XX]=M[XX]ABC10UZ010-UZ001 | GP102 | SIM | | CASA DE FORÇA | 98,50 | CD | U-01, U-02, U-03, U-04, U-05, U-06, U-07, U-08, U-09, U-09A | 1 |
| 3 | UG | SISTEMA X | 4500000000.0002 | SELO MECANICO DA BOMBA | SKID | #ST[XX]=M[XX]ABC10UZ010-UZ001 | | NÃO | GP101 \| #ST[XX]=M[XX]ABC10UZ010-UZ001 | CASA DE FORÇA | 98,50 | CD | U-01, U-02, U-03, U-04, U-05, U-06, U-07, U-08, U-09, U-09A | 1 |
| 4 | UG | SISTEMA X | 4500000000.0002 | SELO MECANICO DA BOMBA | SKID | #ST[XX]=M[XX]ABC10UZ010-UZ001 | | NÃO | GP102 \| #ST[XX]=M[XX]ABC10UZ010-UZ001 | CASA DE FORÇA | 98,50 | CD | U-01, U-02, U-03, U-04, U-05, U-06, U-07, U-08, U-09, U-09A | 1 |
| 5 | UG | SISTEMA X | 4500000000.0003 | KIT DE REPARO BOMBA F1015V-717 | SKID | #ST[XX]=M[XX]ABC10UZ010-UZ001 | | NÃO | | CASA DE FORÇA | 98,50 | CD | U-01, U-02, U-03, U-04, U-05, U-06, U-07, U-08, U-09, U-09A | 1 |
| 6 | UG | SISTEMA X | 4500000000.0004 | RELE AUXILIAR 24VCC | PNL | #ST[XX]=M[XX]ABC10UH010-UH001 | 72.1 | NÃO | | CASA DE FORÇA | 104,20 | CD | | 1 |
| 7 | UG | SISTEMA X | 4500000000.0004 | RELE AUXILIAR 24VCC | PNL | #ST[XX]=M[XX]ABC10UH010-UH001 | 72.2 | NÃO | | CASA DE FORÇA | 104,20 | CD | | 1 |
| 8 | UG | SISTEMA X | 4500000000.0005 | MANGUEIRA 1/2" | SKID | #ST[XX]=M[XX]ABC10UZ010-UZ001 | | NÃO | | CASA DE FORÇA | 98,50 | CD | U-01, U-02, U-03, U-04, U-05, U-06, U-07, U-08, U-09, U-09A | 1 |

Por que cada linha é assim:
- Linhas 1–2: material PRÓPRIO, uma linha por TAG, QTD 1. RDS-PP é o da ÁREA convertido para `#ST[XX]=M[XX]`.
- Linhas 3–4: FILHO documental (1.1 de 1) sem TAG: uma linha por TAG do pai, PAIS = "TAG | RDS-PP da área do pai".
  Frequência herdada da bomba (50 Hz). QTD 1 = um selo em cada bomba (lista de material), não o 4 do Status.
- Linha 5: KIT com KITS = SEM TAG: UMA linha na área do equipamento, QTD 1 por convenção (aviso na PENDÊNCIAS).
- Linhas 6–7: frequência não achada e o projeto TODAS mistura 50 e 60 Hz: TRECHOS vazio + PENDÊNCIA FREQUÊNCIA.
  Nunca preencher as 20 unidades por suposição.
- Linha 8: GRANEL (UNID. = M): 1 por trecho. A QTD 10 do Status é de reposição e a lista de material diz 4 m: nenhuma das duas entra.
- 4500000000.0006: NÃO ACHADO, sem linha; só na PENDÊNCIAS.

## Etapa 5 — CABEÇALHO, DOCS DE REFERÊNCIA e PENDÊNCIAS

| CAMPO | VALOR |
|---|---|
| LISTA DE SOBRESSALENTE | #ST00=M00ABC10&MPB020 |
| ESPECIFICAÇÃO TÉCNICA / CAPÍTULO | ET 0000 / CAP. 00 |
| SUBSISTEMA | SISTEMA X |

| CÓDIGO PMIB | PART NUMBER | DESCRIÇÃO DO MATERIAL | RDS-PP DOCUMENTO - PRINCIPAL | QTD | TAGS | OBSERVAÇÕES |
|---|---|---|---|---|---|---|
| 4500000000.0001 | 11111 | BOMBA CENTRIFUGA 50HZ F1015V-717 | #ST00=M00ABC10&MFB030 | 2 | GP101, GP102 | #ST[XX]=M[XX]ABC10UZ010-UZ001 |
| 4500000000.0002 | 11112 | SELO MECANICO DA BOMBA | #ST00=M00ABC10&MFB030 | 1 | | #ST[XX]=M[XX]ABC10UZ010-UZ001 |
| 4500000000.0003 | 11113 | KIT DE REPARO BOMBA F1015V-717 | #ST00=M00ABC10&MFB030 | 1 | | #ST[XX]=M[XX]ABC10UZ010-UZ001 |
| 4500000000.0004 | 11114 | RELE AUXILIAR 24VCC | #ST00=M00ABC10UH010-UH001&EFF010 | 2 | 72.1, 72.2 | #ST[XX]=M[XX]ABC10UH010-UH001 |
| 4500000000.0005 | 11115 | MANGUEIRA 1/2" | #ST00=M00ABC10UZ010-UZ901&MPA010 | 1 | | #ST[XX]=M[XX]ABC10UZ010-UZ001 |
| 4500000000.0006 | 11116 | MANOMETRO 0-10 BAR | #ST00=M00ABC10&MPB020 | | | |

| PMIB | ITEM | DESCRIÇÃO | TIPO | DETALHE | O QUE FAZER |
|---|---|---|---|---|---|
| 4500000000.0003 | 2 | KIT DE REPARO BOMBA F1015V-717 | AVISO | QTD 1 por convenção de kit | confira QTD POR TRECHO na linha 5 |
| 4500000000.0004 | 3 | RELE AUXILIAR 24VCC | FREQUÊNCIA | nenhum documento nem a descrição dizem 50 ou 60 Hz, e o projeto mistura as duas | preencha TRECHOS nas linhas 6 e 7 |
| 4500000000.0006 | 5 | MANOMETRO 0-10 BAR | NÃO ENCONTRADO | não está na lista de sobressalentes nem nos outros anexos | confirme com a engenharia do sistema; se instalado, inclua a linha na BASE |

## Etapa 6 — CONFERÊNCIA (trecho)

1. Catálogo 6 = 5 materiais com linha na BASE + 1 só na PENDÊNCIAS. OK.
8. Linhas com TAG (1, 2, 6, 7) com QTD POR TRECHO = 1. OK.
10. Linhas 6 e 7 com TRECHOS vazio: PENDÊNCIA FREQUÊNCIA aberta. OK.

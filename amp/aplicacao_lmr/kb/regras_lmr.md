# Regras LMR — leitura de um lote e resposta em CSV

Knowledge base do agente `Spare Parts LMR Extractor`. Os valores dos exemplos são fictícios.

## 1. O que é a aplicação LMR

Cada material sobressalente (uma linha do catálogo `STATUS_PMIB.csv`, identificada pela ficha PMIB, ex.:
`4500000000.0001`) é ligado às posições onde ele está **instalado**: área ou painel, RDS-PP, TAG, local,
elevação, eixo e trechos. Um programa monta o CÓDIGO LMR e a TAG LMR a partir das suas linhas, e confere
cada TAG e cada RDS-PP contra o texto do documento que você citar. Por isso a leitura é cópia exata, com fonte.

Você recebe um lote por vez e não vê os outros. Registre só o que este lote mostra. O que falta aqui pode
estar em outro lote: deixe vazio, o programa junta as linhas depois.

## 2. Glossário

| Termo | O que é |
|---|---|
| **TAG** | Identificação de um equipamento ou instrumento. Mais comum: 2 letras + 3 números + letra opcional (`GP101`, `QM104G`). Em painel: `52.1`, `72.24`, `KA1`, `S2`. |
| **RDS-PP** | Código da posição na usina: `#ST00=M00ABC10GH010` ou `#ST00=M00ABC10GH010-GH001`. `#ST50=…` é unidade de 50 Hz, `#ST60=…` de 60 Hz, `#ST00=M00` é comum a todas. |
| **Código de documento** | RDS-PP seguido de `&` + tipo + número: `#ST00=M00ABC10&MPB020`. |
| **Área** | Conjunto físico com RDS-PP próprio: skid, painel ou quadro, tanque, central, unidade hidráulica, tubulação, cubículo. |
| **Trecho** | Unidade onde a aplicação se repete: `U-01` a `U-18`, `U-09A`, `U-18A`, `AMD-01` a `AMD-04`, `AMC-01` a `AMC-03`. |

Tipos de documento (letras depois do `&`):

| Tipo | Documento | Serve para |
|---|---|---|
| MLU | layout / arranjo | área, local, elevação, eixo |
| MPA, APA | lista de material | TAG instalada, quantidade instalada, área |
| EFF | diagrama funcional (painel) | TAGs do painel |
| MTB, MTC | desenho dimensional / caderno mecânico | quantidade instalada, pai |
| MFB | P&ID / fluxograma | TAGs, elevações, RDS-PP |
| MFE, MDB, ACC | descrição, descritivo, workstatement | frequência, local |
| MPB | lista de sobressalentes | relação material ↔ TAG. **A quantidade dela é de reposição: nunca use.** |

## 3. Qual material é qual

- Ache o material do catálogo no lote pelo código do material, pelo código CMI/GE ou pelo modelo; a descrição
  sozinha só vale se for inequívoca.
- A lista de sobressalentes é uma tabela: a TAG da linha de cima ou de baixo é de outro material.
- Lista de material e desenho mostram o que está instalado e valem mais que a lista de sobressalentes. Se a
  TAG divergir (ex.: letra final diferente), use a da lista de material ou do desenho.
- Material do lote que não está no catálogo não entra. Material do catálogo que o lote não mostra não ganha linha.

## 4. Colunas

**AREA_PAINEL** — o conjunto onde o material está instalado, com o nome curto que o documento dá (a sigla, se
houver: `PWB`, `SKID`). Não repita o nome do sistema. Não crie área por bomba, válvula ou instrumento: o que
está montado num conjunto é do conjunto. Componente do diagrama ou da lista de material de um painel é do painel.

**RDS_PP** — o RDS-PP da área ou painel, copiado caractere por caractere. Prefira o sem `&` (o com `&` é código
de documento: só se o conjunto não tiver outro). Nunca o código do P&ID, da lista de sobressalentes ou do
workstatement. Se o documento escreve o mesmo RDS-PP por unidade geradora (`#ST50=M01…`, `#ST60=M10…`), escreva
uma vez com `#ST[XX]=M[XX]…`. `#ST00=M00…`, `M50`, `M60`, AMD e AMC ficam como estão.

**TAG** — uma TAG por linha, copiada exata. Nunca junte (`GP101/GP102`) nem abrevie faixa (`72.1...72.24`):
uma linha para cada. Material sem TAG: vazio.

**TAG_COM_RDS_PP** — `SIM` se a TAG é de equipamento ou instrumento com identificação própria no P&ID ou no
diagrama. `NÃO` para borne, contato, item de lista sem identificação no sistema, e para linha sem TAG.

**PAIS** — só quando o texto do lote mostra o material montado em outro equipamento (peça, kit, acessório,
consumível). Formato: `TAG do pai | RDS-PP da área do pai`. Peça entre dois equipamentos (acoplamento
motor-bomba): os dois, separados por ` ; `, com o campo entre aspas. Uma linha por pai (ou par) em que o
material aparece. A descrição citar outro equipamento ("PARA BOMBA X") não é evidência: sem desenho ou lista
que mostre a montagem, `PAIS` vazio. O material que **é** o equipamento da TAG não tem pai.

**LOCAL** — `CASA DE FORÇA`, `SALA GERADORES DIESEL`, `BARRAGEM` ou `VERTEDOURO`, só se escrito na página ou na linha do documento no
resumo de localização do `INDICE.md`. Outro local escrito: vazio.

**ELEVACAO** — número com vírgula e 2 casas (`EL 98.500` → `98,50`), da área ou, se o documento ligar a TAG a
outra elevação, a da TAG. Área em várias elevações ou sem elevação escrita: vazio.

**EIXO** — `AB`, `BC`, `CD`, `MB`, `JB` ou `JD` ("eixo B/C" → `BC`). Sem eixo escrito: vazio.

**TRECHOS** — onde o material se aplica:
- lista, se o documento restringe a unidades (ex.: um cubículo por margem): `"U-03;U-11"`, entre aspas;
- `50HZ` ou `60HZ`, pela primeira fonte que disser, nesta ordem: (1) o documento (título, carimbo, desenho,
  workstatement); (2) o RDS-PP onde a TAG aparece (`#ST50` / `#ST60`); (3) a descrição do material no catálogo;
- `TODAS` quando nenhuma das três diz, ou quando diz "50/60 Hz".

| Designação | M | Trechos |
|---|---|---|
| `#ST50` | M01…M09, M19 | U-01…U-09, U-09A |
| `#ST60` | M10…M18, M20 | U-10…U-18, U-18A |
| `#ST00` | M00 | comum a todas |

**QTD_POR_TRECHO** — quantidade **instalada** em um trecho, inteiro:
- material com TAG: `1` em cada linha (o número de linhas já é a quantidade);
- material sem TAG: a da lista de material, do desenho ou do workstatement;
- sem TAG e sem quantidade instalada no lote: o material não ganha linha neste lote (outro lote pode trazer;
  se nenhum trouxer, o programa avisa que a ficha ficou sem linha).

Nunca a `QTD` da lista de sobressalentes nem a do catálogo.

**DOCUMENTO, PAGINA** — o código e o número do cabeçalho `### <código> · página N` da página de onde saiu a
TAG (ou, sem TAG, a quantidade instalada). Um código e um número, copiados do cabeçalho.

## 5. Não faça

- Não invente TAG, RDS-PP, elevação, eixo, local, pai ou quantidade. Sem texto = vazio.
- Não complete por semelhança, costume ou "provavelmente", nem com o que você sabe de outras usinas.
- Não busque na internet.
- Não escreva descrição nem part number: o programa copia do Status.

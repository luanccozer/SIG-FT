# Regras LMR — leitura dos documentos em 4 etapas

## 1. O que é a aplicação LMR

Cada material sobressalente (uma linha do Status PMIB, identificada pelo **PMIB**, ex.: `4500000000.0001`) é ligado
às posições onde ele está **instalado** no sistema: área/painel, RDS-PP, local, elevação, eixo e TAG. Um programa
monta os códigos (CÓDIGO LMR e TAG LMR) a partir do que você ler. Por isso a leitura precisa ser exata e ter fonte.

## 2. Glossário

| Termo | O que é |
|---|---|
| **TAG** | Identificação de um equipamento ou instrumento. Formato mais comum: 2 letras + 3 números + letra opcional (`GP101`, `QM104G`, `BS141T`). Em painel: `52.1`, `72.24`, `KA1`, `S2`. |
| **RDS-PP** | Código da posição na usina: `#ST00=M00ABC10GH010` ou `#ST00=M00ABC10GH010-GH001`. `#ST00=M00` = forma do sistema; `#ST50=…` e `#ST60=…` = unidades de 50 Hz e 60 Hz. |
| **Código de documento** | RDS-PP seguido de `&` + tipo + número: `#ST00=M00ABC10&MPB020`. O tipo diz o que é o documento (tabela abaixo). |
| **Área** | Conjunto físico onde os materiais ficam instalados e que tem RDS-PP próprio: skid, painel ou quadro, tanque, central, unidade hidráulica, tubulação, válvula principal, cubículo. |
| **Kit** | Kit de manutenção, jogo de reparo ou conjunto de peças de reposição de um equipamento. |
| **Peça** | Peça, acessório ou consumível montado num equipamento (selo, rolamento, elemento filtrante, junta, gaxeta). |
| **Trecho** | Unidade onde a aplicação se repete: `U-01` a `U-18`, `U-09A`, `U-18A`, `AMD-01` a `AMD-04`, `AMC-01` a `AMC-03`. |

Tipos de documento (letras depois do `&`):

| Tipo | Documento | Etapa |
|---|---|---|
| MLU | layout / arranjo | 1 |
| MPA, APA | lista de material | 2 |
| EFF | diagrama funcional (painel) | 2 |
| MTB, MTC | desenho dimensional / caderno mecânico | 2 |
| MFB | P&ID / fluxograma | 3 |
| MFE | descrição de sistema | 3 |
| MDB | descritivo funcional | 3 |
| ACC | workstatement | 3 |
| MPB | lista de sobressalentes | 4 |

A mensagem de cada etapa já diz quais arquivos e páginas ler. Um documento pode aparecer em mais de uma etapa
(ex.: a página de lista de material dentro de um manual).

## 3. Etapa 1 — ÁREAS (arranjos, layouts, desenhos de localização)

Liste as áreas do sistema.
- Uma área é um **conjunto**. Não crie uma área para cada bomba, válvula ou instrumento: o que está montado num
  conjunto pertence ao conjunto. Um conjunto com documento próprio (layout, lista de material) costuma ser uma área.
- `nome`: nome curto, como o documento chama o conjunto; a sigla, se houver (`PWB`, não "PAINEL PWB DO SISTEMA X").
  Não repita o nome do sistema.
- `rds`: RDS-PP do conjunto, copiado do documento. Prefira o RDS-PP sem `&` (o com `&` é código de documento:
  use só se o conjunto não tiver outro). Nunca use o código do P&ID, da lista de sobressalentes ou do workstatement.
- `local`: `CASA DE FORÇA` ou `SALA GERADORES DIESEL`. Outro local escrito no documento: copie e explique em `observacoes`.
- `elevacao`: número com vírgula e 2 casas (`EL 98.500` → `"98,50"`). Área que ocupa várias elevações
  (ex.: tubulação que passa por vários pisos): `null`.
- `eixo`: `AB`, `BC`, `CD`, `MB`, `JB` ou `JD` ("eixo B/C" → `"BC"`). Sem eixo escrito: `null`.
- `trechos`: só se a área existe em parte dos trechos (ex.: um cubículo por margem). Senão `[]`.
- `evidencia`: documento e página de cada valor.

## 4. Etapa 2 — CONJUNTOS (listas de material, diagramas de painel, desenhos de conjunto)

Para cada lista de material ou diagrama, registre **cada TAG instalada**.
- `area`: nome de uma área do `etapa1_areas.json`. Componente que aparece no diagrama ou na lista de material de um
  painel é do painel. Numa lista de material, o item que cita o documento de outro conjunto
  (ex.: "1 … #ST00=…XX010-XX001&MTB010 - TÍTULO DO CONJUNTO") e os subitens dele (1.1, 1.2…) são da área desse conjunto.
- Conjunto que não está no `etapa1_areas.json`: inclua em `areas` (mesmo formato da etapa 1).
- `rds_proprio`: `true` se a TAG é equipamento ou instrumento com identificação própria (no P&ID, no diagrama);
  `false` para borne, contato, item de lista sem identificação no sistema.
- `qtd_instalada`: quantidade instalada da TAG (normalmente 1). Item sem TAG com quantidade na lista de material:
  registre com `"tag": null`, a descrição e a quantidade.
- `elevacao`: só se o documento ligar a TAG a uma elevação diferente da elevação da área.
- `frequencia`: `"50"`, `"60"` ou `"AMBAS"` só se o documento disser ("50/60 Hz" = `"AMBAS"`; `#ST50` = 50; `#ST60` = 60).
- `pai`: TAG do equipamento onde o item é montado, se o documento disser.
- Mesma TAG em dois conjuntos iguais (ex.: um painel por margem): um objeto para cada área.

## 5. Etapa 3 — EQUIPAMENTOS (P&ID, fluxogramas, descritivos e demais documentos)

Mesmo formato da etapa 2, para as TAGs de equipamentos e instrumentos.
- `area`: o conjunto onde o equipamento está desenhado ou montado (área do `etapa1_areas.json`). Se o documento não
  mostrar, `null`.
- Registre também TAGs que só aparecem aqui (instrumentos de campo, válvulas de linha).
- Não repita a leitura da etapa 2: se a TAG já foi registrada lá com área, só registre de novo se este documento
  mostrar outra área ou trouxer frequência, elevação ou pai que lá faltava.

## 6. Etapa 4 — MATERIAIS (lista de sobressalentes + JSONs das etapas 1, 2 e 3)

Para **cada material da mensagem**, na ordem:
1. Ache a linha do material na lista de sobressalentes (pelo código, código GE/CMI ou modelo).
2. Ligue o material às TAGs onde ele está instalado:
   - `papel: "proprio"` — o material É o equipamento ou instrumento da TAG (bomba com a TAG da bomba; transmissor com a TAG do transmissor).
   - `papel: "peca"` — o material é peça, acessório, consumível ou kit **montado** no equipamento da TAG. Em `tags`
     vai a TAG do equipamento.
3. `kit`: `true` para kit de manutenção / jogo de reparo; senão `false`.
4. `pais`: só para peça montada **entre** equipamentos (ex.: acoplamento motor-bomba): as TAGs dos dois. Senão `[]`.
5. Para cada TAG: `area` (do `etapa1_areas.json`), `rds_proprio` e `elevacao` como nas etapas 2 e 3 (copie de lá).
   Mesma TAG em mais de uma área: um objeto para cada área.
6. Qual TAG vale: lista de material e desenho mostram o que está INSTALADO e valem mais que a lista de sobressalentes.
   Se divergirem (ex.: letra final diferente), use a da lista de material / desenho e diga isso em `evidencia`.
7. As "TAGs na linha da lista (programa)" são pistas: a lista é uma tabela; TAGs da linha de cima ou de baixo são de
   outro material. Confirme na página.
8. Material sem TAG: `area` onde ele fica, `elevacao` se diferente da área, `qtd_instalada` só de lista de material ou
   desenho (cite esse documento em `evidencia`).
9. `frequencia`: só se o documento ou a descrição do material disser.
10. `encontrado: false` se o material não está na lista de sobressalentes nem em outro anexo.

## 7. Perguntas de controle

Cada mensagem traz perguntas do tipo "arquivo X, página N: A, B, C, D, E". Abra a página N do arquivo X e liste
em `controle` só os códigos que estão escritos **nessa página**. Elas mostram ao programa que você leu o documento
inteiro. Não adivinhe: se não conseguir ler a página, deixe `presentes` vazio e diga em `observacoes`.

## 8. Não faça

- Não invente TAG, RDS-PP, elevação, eixo ou quantidade. Sem fonte = `null`.
- Não use a quantidade de reposição da lista de sobressalentes.
- Não junte várias TAGs num texto ("GP101/GP102") nem abrevie faixas.
- Não crie área por equipamento.
- Não pule material: todo PMIB da mensagem volta no JSON.

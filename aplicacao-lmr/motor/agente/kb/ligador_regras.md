# Regras do Ligador LMR

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

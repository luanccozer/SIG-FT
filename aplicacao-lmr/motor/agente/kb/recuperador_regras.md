# Regras do Recuperador LMR

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

## Como procurar cada lacuna

Cada lacuna diz o material (PMIB), o campo a procurar e as páginas. Responda uma vez cada, com o mesmo id e o mesmo campo.

| Campo | O que procurar | Valor |
|---|---|---|
| `tag` | TAG onde o material está instalado | Lista de TAGs, copiadas como estão escritas, e `papel` |
| `area` | Conjunto onde a TAG está montada | Nome da área, se a página disser |
| `elevacao` | Elevação escrita para essa TAG | Número, como `98,50` |
| `qtd_instalada` | Quantidade instalada de material sem TAG | Número, de lista de material ou desenho |

- Você só preenche o que falta. Nunca altere nem revise outros dados.
- Quando a lacuna traz "valor recusado", esse valor já foi lido e não passou na conferência: não o repita sem fonte.
- Não achou nas páginas da lacuna: `"achou": false` e, em `procurou`, as páginas onde procurou.

## 8. Não faça

- Não invente TAG, RDS-PP, elevação, eixo ou quantidade. Sem fonte = `null`.
- Não use a quantidade de reposição da lista de sobressalentes.
- Não junte várias TAGs num texto ("GP101/GP102") nem abrevie faixas.
- Não crie área por equipamento.
- Não pule material: todo PMIB da mensagem volta no JSON.

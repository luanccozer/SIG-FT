---
tags: [processo, lmr, regras, padrao]
status: aprovado
criado: 2026-10-23
atualizado: 2026-10-23
fonte: aplicacao-lmr/PLANO.md (decisões 14–31), validado nas 5 aplicações de exemplo
---

# Aplicação LMR — Regras de Montagem (padrão v1.4)

> [!success] Padrão único, aprovado pelo Luan em 22–23/10/2026
> Vale para **todas** as aplicações, novas e regeradas. É o que o motor da automação
> (`aplicacao-lmr/motor/lmr.js`) aplica e confere. O "como fazer no AMP" está em
> [[Plano - Automacao da Aplicacao LMR no AMP]]; o que é a seção, em [[Secao - Aplicacao LMR]].

## Os dois textos que vão ao portal

**CÓDIGO_LMR** — onde o material está:
```
{ESCOPO} - {SUBSISTEMA} - {ÁREA/PAINEL} - RDS-PP: {RDS-PP} - {LOCAL} - ELEV. {xx,xx} - EIXO {..} - TRECHO {..}
```

**TAG_LMR** — como ele é identificado no documento:
```
{ESCOPO} - {TAG} - RDS-PP: {RDS-PP}{TAG} - {DESCRIÇÃO}     material com TAG e RDS-PP próprio
{ESCOPO} - {TAG} - {DESCRIÇÃO}                             TAG sem RDS-PP próprio (ex.: SLOT1, GM11, 028)
{ESCOPO} - {DESCRIÇÃO}                                     sem TAG
```
- Sem `(REF)` no fim. A coluna `Status` da aba APLICAÇÃO - LMR não é usada.
- **Escopo e subsistema** vêm do formulário (ex.: `UG` / `ÁGUA PURA`, `RV` / `PARTE MECÂNICA`).
- **Descrição**: sempre copiada do Status PMIB, com limpeza mínima — mesmo quando difere da redação
  feita à mão nas aplicações antigas.

## Listas fechadas

| Campo | Valores |
|---|---|
| Elevação | 2 casas com vírgula (`98,50`). 3 casas no documento → arredonda com aviso (`106,105` → `106,11`) |
| Eixo | `AB`, `BC`, `CD`, `MB`, `JB`, `JD` |
| Trecho | `U-01`…`U-18`, `U-09A`, `U-18A`, `AMD-01`…`AMD-04`, `AMC-01`…`AMC-03` |
| Local | lista fechada; `CASA DE FORÇA - UNIDADE GERADORA` = `CASA DE FORÇA` |

## Trechos e frequência

**Ordem física das UGs**: posições 1–9 = U-01…U-09; **10 = U-09A**; 11–19 = U-10…U-18; **20 = U-18A**.
U-01…U-09 e U-09A são **50 Hz** (`#ST50`, M01–M09 e M19); U-10…U-18 e U-18A são **60 Hz** (`#ST60`,
M10–M18 e M20). M50, M60 e M00 são comuns.

**Trechos do projeto** (parâmetro de cada aplicação — nem todo projeto vai nas 20 UGs):

| Opção | Trechos |
|---|---|
| TODAS | as 20 UGs |
| ÍMPARES (pela posição física) | U-01, U-03, U-05, U-07, U-09, U-10, U-12, U-14, U-16, U-18 |
| PARES (pela posição física) | U-02, U-04, U-06, U-08, U-09A, U-11, U-13, U-15, U-17, U-18A |
| LISTA | UGs específicas |
| AMD / AMC | AMD-01…04 / AMC-01…03 |

**Frequência do material** filtra dentro dos trechos do projeto, nesta ordem:
1. o documento (título, carimbo, desenho, WS);
2. o RDS-PP onde a TAG aparece (`#ST50` / `#ST60`);
3. outros documentos da pasta do escopo;
4. se nada indicar e o projeto misturar 50 e 60 Hz: **perguntar ao usuário**.

> [!danger] Nunca aplicar nas 20 UGs por suposição
> Correção explícita do Luan. A descrição do Status só confere a frequência; não decide.

## Quantidade

- É a **quantidade instalada**, nunca a de reposição (a QTD do Status e da lista de sobressalentes é
  de reposição).
- Material com TAG: 1 por TAG. Sem TAG: lista de materiais do skid/equipamento, desenho ou WS.
- A QTD define **quantas linhas idênticas por trecho** (intencional). Granel (`L`, `kg`, `m`…) = 1 linha.
- Não encontrada → pendência, nunca valor preenchido por suposição.

## Pai e filho

- **Documental**: no Status PMIB, o item `x.y` é filho de `x` (chave = seção + item; a numeração
  recomeça por seção).
- **Físico**: o material está instalado dentro de outro — confirmado no desenho. Sugestão pelo número
  da TAG (`MA151` com `GP151`). Sem evidência no desenho: entra como item individual e vai para a
  validação.
- Mesma escrita nos dois casos: o **CÓDIGO do filho cita o pai** (`{TAG do pai} - RDS-PP: {RDS-PP}{TAG}`
  no lugar de ÁREA/PAINEL) e a **TAG do filho fica sem RDS-PP**.
- Filho com vários pais entra uma vez sob cada um; instâncias = uma vez por TAG do pai, em cada UG.
- Conjuntos (ex.: motobomba 4 a 7) podem ser só agrupadores.

## DOCS DE REFERÊNCIA e DESCRIÇÃO DOCUMENTOS

- DOCS DE REFERÊNCIA: cabeçalho (LISTA DE SOBRESSALENTE, ESPECIFICAÇÃO TÉCNICA / CAPÍTULO, SUBSISTEMA) e
  uma linha por material: `CÓDIGO PMIB`, `PART NUMBER` (código do material do Status), `DESCRIÇÃO DO
  MATERIAL`, `RDS-PP DOCUMENTO - PRINCIPAL` (P&ID, fluxograma, diagrama funcional, arranjo geral ou
  layout; filho usa o do pai), `QTD`, `TAGS`, `OBSERVAÇÕES`.
- DESCRIÇÃO DOCUMENTOS: sai vazia; a equipe completa no fim.

## Erros encontrados nas aplicações já emitidas (exemplos de 2026)

Achados ao reconstruir as 5 aplicações de exemplo — servem de lista do que conferir:
eixo `XXXX` em todas as linhas da Aeração (760); descrição no lugar do RDS-PP no CCAR (940);
na Reg. Vel., linhas sem área/painel (210) e sem local (150), `MEU01` com dígito trocado (54),
códigos `M9A`/`M18A`/`M19A`, UG trocada (M19 com U-18), pai citado como `QG001` (TAG real `GQ001`)
e `GQ010` inexistente na REF-0013 (192).

## Relacionados
[[Secao - Aplicacao LMR]] · [[Plano - Automacao da Aplicacao LMR no AMP]] · [[RDS-PP e KKS]] ·
[[Codigo PMIB]] · [[Planilha STATUS_PMIB]] · [[Revisao da Aplicacao LMR - Agosto 2026]]

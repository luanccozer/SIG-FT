# BASE LMR → Workflow B (Serviços Auxiliares Essenciais)

## Fluxo
```
Documentos (pasta LMR) + Status PMIB + SAP + REF-0013
        │  gerar_base_lmr.py   (= Workflow A, sem IA, para cadernos GE "LISTA DE MATERIAIS")
        │  reconstruir_base.py (= Workflow R, para aplicação já emitida: Banco de Baterias)
        ▼
BASE LMR - <Sistema>.xlsx   ← formato do motor (abas BASE, CABEÇALHO, DOCS DE REFERÊNCIA)
        │  rodar_workflow_b.py (roda motor/lmr.js + motor/planilha.js + template_partes.json)
        ▼
APLICAÇÃO LMR - <Sistema>.xlsx (Template_Aplicação_LMR) + VALIDAÇÃO - <Sistema>.xlsx
```
O executor local reproduz o Workflow B do AMP: ele confere as assinaturas de referência do plano (SFC `452-7EF6CCD9`, Água Pura `3580-2989B1D8`).
A mesma BASE pode ser enviada ao formulário do `LMR_B_gerar_aplicacao` no n8n.

## Interface (10/11/2026)
Duplo clique em `Abrir Interface LMR.bat` (ou `py -X utf8 interface_lmr.py`). Precisa de `py -m pip install PyQt6`.
Escolha o sistema à esquerda: a tabela mostra as BASEs de `LMR/SAIDA ATUAL` com assinatura, linhas e bloqueadas da
VALIDAÇÃO, e a aba STATUS mostra o `LMR/STATUS.md` (o que é novo, pendências, testes). Os botões rodam os mesmos
scripts abaixo, com o log na aba "Log da execução". Autoteste sem janela: `py -X utf8 interface_lmr.py --autoteste`.

## Organização de cada `<sistema>/LMR`
`#ST...pdf` ficam na raiz da pasta LMR (o gerador lê de lá); `SAIDA ATUAL/` tem BASE, APLICAÇÃO e VALIDAÇÃO vigentes
(os scripts gravam lá); `ARQUIVOS ADICIONAIS/` tem texto extraído, recortes e imagens de conferência; `STATUS.md` diz o que é novo.

## Nome curto e limite de caminho
O Excel não abre arquivo com caminho maior que 259 caracteres, e a pasta SAE no Box já tem 155. A BASE AUTO usa o
**nome curto** do sistema (campo "Nome curto" na interface, `--nome` no `gerar_base_auto.py`; ex.: "Banco de Baterias")
e as saídas se chamam `APLICAÇÃO LMR AUTO - <nome>` e `VALIDAÇÃO AUTO - <nome>`. Se o caminho passar do limite, a
geração para antes de gravar e avisa.

## Ajustes de engenharia (`AJUSTES - BASE LMR.xlsx`, pasta do projeto) — 10/11/2026
Decisões que o desenho não resolve (quantidade que não divide pelas TAGs, TAG que falta no desenho, item que a
emitida exclui). Uma linha por SISTEMA + FICHA_PMIB + EQUIPAMENTO + TAG + QTD; só vale com **APROVADO = SIM**.
As linhas de um FICHA + EQUIPAMENTO **substituem** o que o desenho deu ali; TAG vazia = sem TAG; QTD 0 = exclui.
Assim a BASE AUTO sai igual toda vez que for regerada. Piloto Banco: com todos os ajustes aprovados a AUTO dá as
mesmas 4.175 linhas da emitida (só a descrição de 0418 e 1364 difere, porque vem do Status PMIB, decisão 19).

**Caderno gêmeo.** Linha do desenho com TAG e quantidade mas sem Código/Designação na camada de texto do PDF
(ex.: C2 itens 132/134/136) é completada pelo mesmo ITEM e TAG do caderno da outra frequência (#ST50 ↔ #ST60),
marcada `VERIFICAR` no rastreio. **Casamento por descrição** não aceita tipo de contato diferente (1NA ≠ 1NF).

## Comandos
```bash
py -X utf8 lmr_core.py                                  # autoteste
py -X utf8 localizacao.py                               # autoteste
py -X utf8 gerar_base_lmr.py --todos                    # configs/*.json -> BASE de cada sistema
py -X utf8 rodar_workflow_b.py "<pasta>/LMR/SAIDA ATUAL/BASE LMR - Painéis.xlsx"
```

## Geração automática no VS Code (sem configuração escrita à mão) — 09/11/2026
1. Abra a pasta `_AUTOMACAO_LMR` no VS Code e um terminal (`Ctrl+'`). Precisa de Python 3.10+ com `openpyxl` e `pymupdf`
   (`py -m pip install openpyxl pymupdf`) e de Node para o passo 3.
2. Gere a BASE informando só a pasta do sistema, o escopo e o subsistema:
   ```bash
   py -X utf8 gerar_base_auto.py "BANCO DE BATERIAS E CARREGADORES" --escopo CC --subsistema "BATERIAS E CARREGADORES"
   ```
   Ele acha sozinho o Status PMIB, os cadernos `#STxx=...pdf` da pasta `LMR`, a sigla de cada caderno (REF-0013 Função
   + grupos do Status), a localização (REF-0013 Localização) e os materiais genéricos. Grava:
   - `LMR/SAIDA ATUAL/BASE LMR AUTO - <Sistema>.xlsx` (ou `--saida "LMR/SAIDA ATUAL/BASE LMR - X.xlsx"`);
   - `configs/auto_<sistema>.json` (a configuração descoberta, para conferência);
   - `TABELA DE LOCALIZAÇÃO - LMR.xlsx` na pasta do projeto (`aplicação LMR`, acima de `_AUTOMACAO_LMR`; se não existir lá, na raiz SAE).
3. Gere a aplicação: `py -X utf8 rodar_workflow_b.py "../<pasta>/LMR/SAIDA ATUAL/BASE LMR AUTO - <Sistema>.xlsx"`.
4. Revise as abas **PENDÊNCIAS**, **LOCAIS** e **ORIGEM (RASTREIO)** da BASE.

**Tabela de localização.** A REF-0013 decodifica os códigos `++` (local, bloco, elevação, eixo), e a descrição da
sala cita os equipamentos dela ("SALA DE BATERIAS (HB-01 / HN-01)"). Uma sala só é usada para os típicos de um
sistema se citar equipamento da **mesma família** (BL2, ex. `B03BPA10GB010`) de algum caderno do sistema; o caderno
`#ST50` fica nas salas de 50 Hz, o `#ST60` nas de 60 Hz e o `#ST00` em todas. O que a REF não liga fica
`A PREENCHER`. Para informar à mão, acrescente uma linha na tabela com `FONTE = MANUAL` (SISTEMA = nome da pasta,
EQUIPAMENTO = sigla): ela vence a automática e é mantida quando a tabela é regravada.

**Formatos de lista de materiais lidos:** GE (`TAG/Designação/Código/Quantidade/Local`) e Alpha-Enersys
(`ITEM/DESCRIÇÃO/TAG/QTDE/FABRICANTE/MODELO/COD. ALPHA`). Quantidade que não divide pelas TAGs (14 diodos em 4 TAGs)
entra sem TAG, com o total, e vai para PENDÊNCIAS.

**Piloto Banco de Baterias (09/11/2026)**, comparado com a aplicação emitida (via BASE reconstruída):
55 de 61 fichas com a mesma quantidade; localização igual em todas as linhas onde o material existe nas duas;
2.610 de 4.175 linhas idênticas. As diferenças são: material que só o documento traz (itens do CHBC; S1...S4),
quantidade que o desenho não divide por TAG (diodos, bornes) e bornes do C2 sem código na camada de texto do PDF.

## Regras da BASE (uma linha = um material numa posição)
| Campo | Origem |
|---|---|
| FICHA_PMIB, DESCRIÇÃO | Status PMIB (descrição copiada, decisão 19) |
| ÁREA/PAINEL | instância do equipamento (CBC-01, PDE-22021, VVT-9A30...) |
| RDS-PP | **REF-0013 aba Função** pela TAG da instância. Se a TAG tiver 2 códigos, vale o do setor do caderno. Sem TAG na REF, vale o código do documento. |
| TAG | TAG do caderno GE sem o "-" IEC, expandida (`-27.1...-27.3` → 3 linhas). Em caderno com várias colunas leva `(COLUNA n)` |
| TAG COM RDS-PP | NÃO (TAG IEC do caderno, não código de produto RDS-PP) |
| LOCAL / ELEVAÇÃO / EIXO / TRECHOS | config da instância ou planilha `LOCAIS A PREENCHER - BASE LMR.xlsx` (pasta do projeto). Se vazio, o B bloqueia a linha (V1) |
| QTD POR TRECHO | unidades por TAG: múltiplo exato da quantidade do desenho (ex.: base bipolar = 2 fusíveis). Sem TAG = nº de peças |

Casamento ficha × desenho: pelo **PN** (Código Fabricante ou "tipo XXX" na Designação). Se não achar, pela descrição quase idêntica com os mesmos números, marcado VERIFICAR.
Cada item é conferido nos equipamentos do **seu grupo** da lista. Itens sem TAG (acessórios Rittal) entram como genéricos, um por painel do grupo.

## Situação (06/11/2026)
| Sistema | Linhas BASE | Linhas aplicação | Bloqueadas no B |
|---|---|---|---|
| Banco de Baterias e Carregadores (reconstruída da emitida) | 443 | 4.175 | 0 |
| Ventilação U9 | 20 | 21 | 0 |
| Ventilação U10 | 16 | 16 | 0 |
| Painéis | 1.989 | 105 (só PLA-CCR) | 1.884: falta TRECHO |
| Inversores e PDE | 3.116 | 0 | 3.116: falta TRECHO |

Depois de preencher os locais: rode `gerar_base_lmr.py --todos` e, em seguida, `rodar_workflow_b.py` em cada BASE.

## Listas fechadas do motor (atualizado 10/11/2026, decisão 33)
- **TRECHO**: `U-01…U-18A`, `AMD-01…04`, `AMC-01…03` e, para Barragem e Vertedouro, letra + bloco da REF-0013 (`F-18`, `H-03`, `A-15`; D 01–58, E 01–06, F 01–36, H 01–14, I 01–27, A 01–15).
- **LOCAL**: `CASA DE FORÇA`, `SALA GERADORES DIESEL`, `BARRAGEM` e `VERTEDOURO`. No AMP, se o local vier da Data Table, acrescente BARRAGEM e VERTEDOURO lá também.

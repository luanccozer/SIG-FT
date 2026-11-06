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

## Comandos
```bash
py -X utf8 lmr_core.py                                  # autoteste
py -X utf8 gerar_base_lmr.py --todos                    # configs/*.json -> BASE de cada sistema
py -X utf8 rodar_workflow_b.py "<pasta>/LMR/BASE LMR - Painéis.xlsx"
```

## Regras da BASE (uma linha = um material numa posição)
| Campo | Origem |
|---|---|
| FICHA_PMIB, DESCRIÇÃO | Status PMIB (descrição copiada, decisão 19) |
| ÁREA/PAINEL | instância do equipamento (CBC-01, PDE-22021, VVT-9A30...) |
| RDS-PP | **REF-0013 aba Função** pela TAG da instância. Se a TAG tiver 2 códigos, vale o do setor do caderno. Sem TAG na REF, vale o código do documento. |
| TAG | TAG do caderno GE sem o "-" IEC, expandida (`-27.1...-27.3` → 3 linhas). Em caderno com várias colunas leva `(COLUNA n)` |
| TAG COM RDS-PP | NÃO (TAG IEC do caderno, não código de produto RDS-PP) |
| LOCAL / ELEVAÇÃO / EIXO / TRECHOS | config da instância ou planilha `LOCAIS A PREENCHER - BASE LMR.xlsx` (raiz SAE). Se vazio, o B bloqueia a linha (V1) |
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

## Limitações do motor que afetam o CC
- **TRECHO** só aceita `U-01…U-18A`, `AMD-01…04` e `AMC-01…03`. Os 17 PDE da Barragem e do Vertedouro (#BA50, #BA60, #VE00) ficam fora da lista.
- **LOCAL** só aceita `CASA DE FORÇA` e `SALA GERADORES DIESEL`. Barragem e Vertedouro precisam entrar na Data Table e em `LOCAIS` do `lmr.js`.

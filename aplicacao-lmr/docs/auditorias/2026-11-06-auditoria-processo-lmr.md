# Auditoria do processo da Aplicação LMR (06/11/2026)

Escopo: todo o desenvolvimento da automação da Aplicação LMR até 06/11/2026.
- Plano e motor (`aplicacao-lmr/` nas branches de LMR do SIG-FT e a cópia no Box `DocManager Itaipu/Docs Aconex/LMR/`).
- Integração com o SIG-FT (seção "Aplicação LMR" do app: upload e exclusão no portal PMIB).
- O trabalho de hoje: Bases dos Serviços Auxiliares Essenciais (SAE) do Controle Centralizado e leitor de cadernos GE.

Fontes conferidas:
- `PLANO.md` v1.6, `HANDOFF.md` e `README.md` da branch `jonathan/integracao-lmr-amp`.
- `docs/revisoes/2026-11-04-integracao-lmr-amp.md` e as specs de 02 e 03/11.
- O motor `lmr.js` e o `planilha.js`.
- Os 5 exemplos emitidos, o `Template_Aplicação_LMR.xlsx`, a REF-0013 e as pastas dos 5 sistemas SAE.

---

## 1. O processo em uma página

```
                 ┌──────────── R (reconstruir) ── aplicação emitida + Status PMIB
                 │                                  (roda fora do AMP, 1x por sistema)
Documentos ──► A (nova aplicação) ──► BASE LMR ──► B (gerar) ──► APLICAÇÃO LMR (template) + VALIDAÇÃO
do escopo       IA + código           (fonte         só código        │
+ Status PMIB                          da verdade)                     ▼ revisão humana
                                          ▲                     correções / nova revisão de lista (Aconex)
                                          └──── C (alterar: C1 compara Status × Base, C2 aplica) ◄┘
                                                                       │
                                                         SIG-FT "Aplicação LMR" → upload no portal PMIB
```

**Princípio central (PLANO §4.1):** o código lê o que dá para ler por código, e a IA só interpreta o resto.
A montagem dos textos (CÓDIGO_LMR e TAG_LMR) é 100% regra: 3.580 de 3.580 linhas iguais na Água Pura.
A IA nunca escreve a planilha.

## 2. Estado de cada peça

| Peça | Onde | Estado | Evidência |
|---|---|---|---|
| Motor de regras `lmr.js` (montagem, validação V1–V15, reconstrução, comparação) | `aplicacao-lmr/motor/` | **pronto** | `teste_fase1.js`: reproduz as 5 aplicações emitidas |
| **B** Base → aplicação no template | `LMR_B_gerar_aplicacao.json` (11 nós) | **rodando no AMP** | assinaturas dos 5 sistemas (§9B.5) iguais no AMP e localmente |
| **R** aplicação emitida → Base | `motor/base/criar_bases.js` (+ `reconstruir_base.py` de hoje) | pronto (local) | 5 Bases de referência; Baterias SAE reconstruída hoje (4.175/4.175 linhas) |
| **C1/C2** alterações | `LMR_C1_…`, `LMR_C2_…` | pronto localmente; **não rodou no AMP** | caso real Reg. Vel. em `teste_c.js` |
| **A0** conferir materiais (sem IA) | `LMR_A0_conferir_materiais.json` | **validado no AMP (03/11)** | Água Pura 87/87, SFC 40/41 |
| **A1** índice dos PDFs (sem IA) | `LMR_A1_indice_documentos.json` | **validado no AMP (03/11)** | Água Pura 99/99 TAGs com 4+ caracteres |
| **A** com agente AMP (`LMR_A_agente_amp.json`, 44 nós) | `motor/workflows/` | testado localmente; **não rodou no AMP** | – |
| **A enxuto** (Leitor + Ligador + Recuperador + Validador, ~58 nós) | spec de 02/11 | testado só com sistema fictício | – |
| **A-GE** leitor determinístico de cadernos GE (hoje) | `aplicacao-lmr/leitura_ge/` | **rodou com dados reais** em 5 sistemas SAE | §4 |
| SIG-FT: tela "Aplicação LMR" (upload/exclusão no PMIB) | `sigft/app_qt/views/aplicacao_lmr.py` | em produção | 1.4.0-rc.4 |
| Integração motor ↔ repositório | `jonathan/integracao-lmr-amp` | **sem PR**, aguardando revisão desde 04/11 | `docs/revisoes/2026-11-04-…` |

**Gargalo (HANDOFF §1):** a leitura dos documentos (Workflow A). A montagem e a geração já estão resolvidas.

## 3. Achados

Severidade: 🔴 trava a entrega ou pode produzir dado errado · 🟠 risco relevante · 🟡 melhoria.

### 3.1 Governança e código

| # | Sev. | Achado | Recomendação |
|---|---|---|---|
| G1 | 🔴 | **O trabalho de LMR não está na branch oficial.** Ele está espalhado em `claude/automacao-lmr-amp`, que está dentro de `backup/lmr-fluxo-a-2026-11-03`, que está dentro de `claude/lmr-fluxo-a-enxuto`, que está dentro de `jonathan/integracao-lmr-amp`. Esta última não tem PR. | Revisar e abrir PR da integração para a oficial. A `AUTOMACAO_LMR` parte dela, para não criar mais um galho paralelo. |
| G2 | 🟠 | **Duas fontes do motor e do plano.** O Box (`DocManager/.../LMR/motor`) e o Git têm cópias. Hoje o `lmr.js`, o `planilha.js` e o `extrair.py` são iguais (o `lmr.js` só difere no fim de linha). Já o `PLANO.md` do Box está **atrás**: falta a decisão de 02/11 sobre o Fluxo A enxuto. | O Git passa a ser a fonte do código e do plano, e o Box guarda só dados (regra que o `aplicacao-lmr/README.md` já diz). Copiar do Git para o Box, nunca o contrário. |
| G3 | 🟠 | **Pasta apagada no Box.** A `_AUTOMACAO_LMR` do SAE sumiu durante o trabalho e foi restaurada à mão. Código só no Box não tem histórico. | Versionar no Git (esta branch). No Box fica uma cópia de trabalho. |
| G4 | 🟡 | Os `.json` dos workflows são gerados por `gerar_*.js`, o que é bom. Mas não há conferência de que o `.json` versionado é igual ao gerado. | Teste que regenera e compara (como o `CHANGELOG` faz no CI). |

### 3.2 Regras do motor e padrão

| # | Sev. | Achado | Recomendação |
|---|---|---|---|
| M1 | 🔴 | **As listas fechadas não cobrem o Controle Centralizado fora da Casa de Força.** TRECHO aceita só `U-01…U-18A`, `AMD-01…04` e `AMC-01…03`. LOCAL aceita só `CASA DE FORÇA` e `SALA GERADORES DIESEL`. Os 17 PDE da Barragem (#BA50/#BA60, trechos E, F, H, I) e do Vertedouro (#VE00) **sempre bloqueiam** (V14). | Decidir como representar trecho e bloco da Barragem e do Vertedouro. A REF-0013, aba Localização, já tem a codificação (ex.: `Trecho F - Barragem Principal - Bloco F18`). Depois ampliar `TRECHOS` e `LOCAIS` no `lmr.js` e a Data Table. |
| M2 | 🟠 | **A lista de locais é a pendência nº 2 do plano e continua aberta.** Ela começou só com os locais dos exemplos. | Levantar a lista com a equipe e publicá-la na Data Table. |
| M3 | 🟠 | **Regras novas de hoje que o PLANO ainda não registra:** (a) TAG de caderno GE com `(COLUNA n)` quando o caderno tem várias colunas (o mesmo `H.1` existe em colunas diferentes); (b) `TAG COM RDS-PP = NÃO` para TAG IEC (caso da decisão 28); (c) caderno com 2 painéis (PPE-01 e PPE-03) separado por coluna; (d) unidades por TAG = quantidade do desenho ÷ nº de TAGs, quando a divisão é exata. | Aprovar e registrar como decisões 32–35. |
| M4 | 🟡 | A TAG_LMR fica longa nos painéis: a descrição do Status GE tem ~200 caracteres. Isso segue as decisões 19 e 29, mas pesa na leitura. | Manter (decisão já tomada) ou definir um limite. |
| M5 | 🟡 | O B não roda a V3 (RDS-PP na REF-0013), por desenho (§9B.4). Nas Bases do SAE, o RDS-PP de cada instância **já vem da REF-0013**, então o risco é baixo. | Rodar a V3 na montagem da Base (A/R). |

### 3.3 Dados de entrada (achados nos documentos do SAE)

| # | Sev. | Achado | Onde está |
|---|---|---|---|
| D1 | 🔴 | **A localização não está nos cadernos GE** (diagramas funcionais &EFF010). Eles só trazem "ABRIGADO" e a sala. Elevação, eixo e trecho têm de vir de outra fonte. O plano (§3.4) tirou a aba Localização da REF-0013 da validação, mas para o CC ela é a melhor fonte disponível. | `LOCAIS A PREENCHER - BASE LMR.xlsx` (raiz do SAE): 66 instâncias |
| D2 | 🟠 | **Capa do caderno típico do PDE × REF-0013:** a numeração UC é diferente, a capa repete `PDE-F18021` e não lista `PDE-F05021` nem `PDE-06201`. O `PDE-I01021` está em setor diferente. A REF-0013 foi adotada como oficial. | BASE Inversores e PDE, aba PENDÊNCIAS |
| D3 | 🟠 | **PN do Status ≠ PN do desenho:** 0468 (CBC usa 1SVR730**831**R0400), 0473 (desenho: ISL-A 115), 0471 (desenho: R0019732114C) e os shunts 0630/0634. Casados por descrição e marcados VERIFICAR. | BASE Painéis e Inversores, PENDÊNCIAS |
| D4 | 🟠 | **Itens da lista sem aplicação no desenho:** 1022/1025 (sinaleiros amarelos) e 0757 (ventilador) não aparecem nos INV. Os TAGs internos dos painéis GMV-9A30/GMV-1030 dependem de um caderno `UH001&EFF010` que não está na pasta. | idem |
| D5 | 🟠 | **RDS-PP da REF-0013 × nome do arquivo:** PLA-CCR tem 2 códigos na REF (#ST50 UC018 e #ST60 UC015). O PLA-SD está como ST60 UC018 na REF, mas o arquivo diz ST50 UC018. | PENDÊNCIAS Painéis |
| D6 | 🟡 | **Aplicação emitida do Banco de Baterias:** 20 linhas com `{DRIVER_ID}` no lugar do PN (ficha 0427), local `SALA DE FORÇA` e trechos `U01/02`. Na reconstrução: `CASA DE FORÇA` e `U-01` (salas de baterias da REF-0013), a descrição vem do Status e o `{DRIVER_ID}` some. | BASE Baterias, PENDÊNCIAS |

### 3.4 Plataforma (AMP / n8n)

| # | Sev. | Achado | Recomendação |
|---|---|---|---|
| P1 | 🟠 | **50 execuções publicadas por mês**, contra 5+ sistemas × (A + B + C). | Usar execuções manuais nos testes e um formulário único com Switch (HANDOFF §5). Pedir aumento. |
| P2 | 🟠 | **S4 (gravar no Box) pendente.** O B entrega o arquivo para baixar e não grava na pasta do escopo. | Rodar a S4. |
| P3 | 🟡 | O nó AMP Agent não lê PDF escaneado de forma confiável (S10 de 03/11). | Seguir com texto no Prompt, e a página escaneada vira PENDÊNCIA (decisão já tomada). |

### 3.5 Qualidade e verificação

| # | Sev. | Achado |
|---|---|---|
| Q1 | ✅ | O executor local do B (`leitura_ge/rodar_workflow_b.py`) usa o próprio `lmr.js` + `planilha.js` + `template_partes.json` e reproduz as assinaturas de referência: SFC `452-7EF6CCD9` e Água Pura `3580-2989B1D8`. |
| Q2 | ✅ | Bases do SAE: as unidades batem com a contagem dos desenhos (Painéis 2.041, Inversores e PDE 3.424, Ventilação 21 + 16). Baterias: 4.175 de 4.175 linhas emitidas reconstruídas. |
| Q3 | 🟠 | O leitor GE foi conferido por amostragem e por "QTD do desenho × nº de TAGs". Não há gabarito emitido para Painéis e Inversores (são aplicações novas). | 
| Q4 | 🟡 | O leitor GE só tem autoteste de funções puras (`lmr_core.py` e `tests/test_lmr_leitura_ge.py`). A leitura de PDF não está no CI, porque não há documentos reais no repositório (regra do projeto). |

## 4. O que foi feito hoje (06/11) e como se encaixa

**Fluxo A-GE (sem IA, para fornecedor GE).** Os cadernos GE trazem a folha "LISTA DE MATERIAIS" com TAG, código do fabricante, quantidade e coluna em camada de texto. Isso segue o princípio 1 do plano: o código lê, e a IA não é necessária. O caminho:
1. `gerar_base_lmr.py` lê o Status PMIB e as listas de materiais (por coordenadas das palavras).
2. Casa a ficha com o desenho pelo PN; se não achar, pela descrição, com VERIFICAR.
3. Expande os TAGs e as instâncias. O RDS-PP de cada instância vem da REF-0013.
4. Gera a **BASE no formato exato do motor**.
5. `rodar_workflow_b.py` gera a APLICAÇÃO no template.

| Sistema | Fichas | Linhas da BASE | Linhas da aplicação | Bloqueadas no B |
|---|---|---|---|---|
| Banco de Baterias e Carregadores (R) | 61 | 443 | 4.175 | 0 |
| Ventilação U9 (manual) | 17 | 20 | 21 | 0 |
| Ventilação U10 (manual) | 14 | 16 | 16 | 0 |
| Painéis (A-GE) | 64 | 1.989 | 105 | 1.884: falta TRECHO |
| Inversores e PDE (A-GE) | 49 | 3.116 | 0 | 3.116: falta TRECHO |

Fornecedores sem a folha GE (AT PLAN na Ventilação, Alpha no Banco de Baterias) continuam com mapeamento manual na configuração (bloco `manual`), ou vão para o Workflow A com IA.

## 5. Recomendações em ordem

1. **Preencher os locais do SAE** (`LOCAIS A PREENCHER - BASE LMR.xlsx`) e regerar. Assim Painéis e Inversores e PDE saem completos.
2. **Decidir o M1** (trecho e local da Barragem e do Vertedouro) e ampliar as listas do `lmr.js` e a Data Table.
3. **Aprovar as regras M3** e registrar as decisões 32–35 no `PLANO.md`.
4. **Revisar e mesclar a integração** (`jonathan/integracao-lmr-amp` + `AUTOMACAO_LMR`) na branch oficial (G1). A partir daí, o Git é a fonte (G2).
5. **Incluir o A-GE no Workflow A** como um degrau sem IA, antes do Leitor/Ligador. Para cadernos GE, ele resolve TAG, quantidade e coluna. A IA fica só para o que sobra (fornecedores sem lista estruturada e páginas escaneadas). Isso reduz chamadas, que são o recurso escasso (P1).
6. Rodar no AMP o que só rodou localmente: C1/C2, A com agente e S4.
7. Resolver as divergências D2–D5 com a engenharia: PN, RDS-PP e capa do PDE.

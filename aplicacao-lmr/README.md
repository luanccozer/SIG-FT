# Aplicação LMR no AMP (n8n)

Automação da **Aplicação LMR** (CÓDIGO_LMR e TAG_LMR de cada material sobressalente) para rodar no
n8n do AMP da GE Vernova. Plano completo e histórico de decisões em [`PLANO.md`](PLANO.md) (v1.6).
Guia de uso no AMP: [Guia AMP n8n — Aplicação LMR](https://claude.ai/artifact/14qjTyoFX7Qpd2NYMzZfJh).
Nota do cofre: `gestao-sobressalentes/07 - Diagnostico/Plano - Automacao da Aplicacao LMR no AMP.md`.

> [!danger] Sem dados reais aqui
> Status PMIB, aplicações emitidas, REF-0013, documentos de projeto, dados extraídos e Bases geradas
> **não são versionados** (mesma regra do resto do repositório). Eles ficam no Box, em
> `DocManager Itaipu/Docs Aconex/LMR/`. Os testes rodam na máquina que tem o Box.

## Estado em 23/10/2026

| Parte | Estado |
|---|---|
| Motor de regras (`motor/lmr.js`) | pronto; reproduz as 5 aplicações de exemplo (regressão `teste_fase1.js`) |
| **B — Base → aplicação** | **rodando no AMP** com os 5 sistemas; entrega no formato do template (DOCS DE REFERÊNCIA, DESCRIÇÃO DOCUMENTOS, APLICAÇÃO - LMR) |
| C — alterações (C1 comparar, C2 aplicar) | pronto e testado localmente; falta rodar no AMP (não urgente) |
| A — documentos → Base | em desenho: A1 índice (sem IA), A2 leitura (IA), A3 monta a Base |
| Testes de plataforma S4 (Box), S5/S6 (IA), S7, S8 | pendentes no AMP |

## Arquitetura (v1.6)

O AMP só faz o que se repete, com pouco dado por execução de Code. A Base da Aplicação (uma linha por
material numa posição, com TRECHOS e QTD POR TRECHO) liga as funções:

| Função | Onde roda | Entrada → saída |
|---|---|---|
| R — reconstruir | local, uma vez por sistema | aplicação emitida + Status PMIB → `BASE LMR - {sistema}.xlsx` |
| A — nova aplicação | AMP (em construção) | documentos do escopo + Status PMIB → Base |
| B — gerar | AMP | Base → `APLICAÇÃO LMR - {sistema}.xlsx` (template) + VALIDAÇÃO |
| C — alterar | AMP | C1: Base + Status novo → ALTERAÇÕES · C2: Base + ALTERAÇÕES → Base nova |

Regras do AMP aprendidas no caminho: não existe nó `compression`; Merge trava com ramo opcional vazio;
o Code roda num *task runner* limitado e trava ao receber ou devolver milhares de itens. Por isso o B
usa Loop Over Items (20 linhas da Base por volta) e cada aba é lida por um Extract ligado direto ao
formulário.

## Pastas

| Caminho | O quê |
|---|---|
| `motor/lmr.js` | motor de regras, um arquivo só, colado nos nós Code (seções 1–12) |
| `motor/planilha.js` | grava `.xlsx` sem bibliotecas: aplicação no formato do template e planilhas simples |
| `motor/extrair.py` | converte as planilhas do Box em JSON (`motor/dados/`, fora do Git) |
| `motor/teste_fase1.js` | regressão do motor contra as 5 aplicações de exemplo |
| `motor/base/` | função R: `criar_bases.js` (monta e confere) e `escreve_base.py` (grava o `.xlsx`) |
| `motor/alteracoes/teste_c.js` | testes do C (caso real da Reg. Vel. + fictícios) |
| `motor/workflows/` | geradores (`gerar_workflows.js` = B, `gerar_c.js` = C1/C2) e os `.json` para importar no AMP |
| `motor/fase0/` | testes de plataforma S1–S8 (`.json`) e arquivos de apoio fictícios |
| `motor/dados/template_partes.json` | peças internas do template vazio (única coisa versionada de `dados/`) |
| `templates/` | `Template_Aplicação_LMR.xlsx` (vazio) |
| `contexto/` | histórico do projeto, pacote de preparação, limitações do AMP, cheat sheet do n8n da GE |

## Como rodar (na máquina com o Box)

Copie `motor/` para `DocManager Itaipu/Docs Aconex/LMR/motor/` (ou trabalhe direto lá) e, nessa pasta:

```bash
python -X utf8 extrair.py                 # planilhas do Box → dados/*.json
node teste_fase1.js                        # regressão do motor
node base/criar_bases.js                   # função R: Bases dos 5 sistemas + conferência
python -X utf8 base/escreve_base.py        # grava saida/bases/BASE LMR - *.xlsx
node workflows/gerar_workflows.js          # gera LMR_B_gerar_aplicacao.json e testa os 5
node workflows/gerar_c.js                  # gera C1/C2 e testa o caso real
node alteracoes/teste_c.js                 # testes do C
```

Os `.json` de `motor/workflows/` são **gerados**: nunca edite à mão; mude `lmr.js`/`planilha.js` ou o
gerador e rode de novo.

## Assinaturas de referência (B, v1.6)

Nº de linhas + soma dos hashes FNV-1a das linhas (não depende da ordem). Conferidas no AMP em 23/10/2026.

| Base | Assinatura | Bloqueadas |
|---|---|---|
| Água Pura | `3580-2989B1D8` | 0 |
| Aeração Axial | `760-B046B532` | 760 |
| CCAR | `4620-A69AFF1E` | 940 |
| Reg. Vel. | `6030-3B243771` | 487 |
| SFC | `452-7EF6CCD9` | 0 |
| Reg. Vel. depois do C (caso real) | `5990-62B0A8BD` | — |

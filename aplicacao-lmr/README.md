# Aplicação LMR no AMP (n8n)

Automação da **Aplicação LMR** (CÓDIGO_LMR e TAG_LMR de cada material sobressalente) para rodar no
n8n do AMP da GE Vernova. Plano completo e histórico de decisões em [`PLANO.md`](PLANO.md) (v1.6, §9B até 9B.9).
**Quem vai continuar: comece por [`HANDOFF.md`](HANDOFF.md)** (estado, fatos do AMP, decisão em aberto).
Guia de uso no AMP: [Guia AMP n8n — Aplicação LMR](https://claude.ai/artifact/14qjTyoFX7Qpd2NYMzZfJh).
Nota do cofre: `gestao-sobressalentes/07 - Diagnostico/Plano - Automacao da Aplicacao LMR no AMP.md`.

> [!danger] Sem dados reais aqui
> Status PMIB, aplicações emitidas, REF-0013, documentos de projeto, dados extraídos e Bases geradas
> **não são versionados** (mesma regra do resto do repositório). Eles ficam no Box, em
> `DocManager Itaipu/Docs Aconex/LMR/`. Os testes rodam na máquina que tem o Box.

## Estado em 02/11/2026

| Parte | Estado |
|---|---|
| Motor de regras (`motor/lmr.js`) | pronto; reproduz as 5 aplicações de exemplo (regressão `teste_fase1.js`) |
| **B — Base → aplicação** | **rodando no AMP** com os 5 sistemas; entrega no formato do template (DOCS DE REFERÊNCIA, DESCRIÇÃO DOCUMENTOS, APLICAÇÃO - LMR) |
| C — alterações (C1 comparar, C2 aplicar) | pronto e testado localmente; falta rodar no AMP (não urgente) |
| A — documentos → Base | **caminho atual: `LMR_A_agente_amp.json`** (agente do AMP dentro do workflow, texto das páginas na mensagem, 4 etapas com perguntas de controle e página "Confira as áreas"); testado localmente, **ainda não rodou no AMP**. Alternativas: A v3 com a IA do n8n (`LMR_A_gerar_base.json`) e AG1/AG2 (agente no chat) |
| A enxuto (`LMR_A_enxuto.json`) | Leitor, Ligador, Recuperador + Validador; testado só com sistema fictício; **não rodou no AMP nem na regressão com dados reais** |
| Próximo passo | sonda S10 com Gemini e linha de base: [`docs/planos/roteiro-testes-amp-2026-11-03.md`](docs/planos/roteiro-testes-amp-2026-11-03.md) |
| Testes de plataforma | S9/S10 (nó AMP Agent) rodaram; S4 (Box), S7, S8 pendentes |

## Arquitetura (v1.6)

O AMP só faz o que se repete, com pouco dado por execução de Code. A Base da Aplicação (uma linha por
material numa posição, com TRECHOS e QTD POR TRECHO) liga as funções:

| Função | Onde roda | Entrada → saída |
|---|---|---|
| R — reconstruir | local, uma vez por sistema | aplicação emitida + Status PMIB → `BASE LMR - {sistema}.xlsx` |
| A — nova aplicação | AMP (agente do AMP no workflow) | documentos do escopo + Status PMIB → Base (+ PENDÊNCIAS, CONTROLE, ÁREAS) |
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
| `motor/indice/` | A1: índice dos PDFs sem IA (`indice.js`); `extrai_como_n8n.mjs` extrai texto como o n8n |
| `motor/leitura/` | A v3: leitura com a IA do n8n e montagem da Base (`leitura.js`, `montaBase`); `oraculo.js` = IA perfeita; `teste_a.js`; `reprocessa.js` |
| `motor/agente/` | leitura pelo agente do AMP (`agente.js`), system prompt e Knowledge base do agente, guia `CONFIGURAR_AGENTE.md`, testes `teste_agente.js` (chat) e `teste_workflow.js` (workflow) |
| `motor/workflows/` | geradores (`gerar_workflows.js` = B, `gerar_c.js` = C1/C2, `gerar_a1.js`, `gerar_a.js`, `gerar_agente.js` = AG1/AG2/A agente AMP, `gerar_sonda_amp*.js` = S9/S10) e os `.json` para importar no AMP |
| `docs/planos/` | planos de implementação (agente LMR) |
| `contexto/amp/` | exports dos nós AMP Agent, GEV Box e GEV LLM (sem credenciais) e resultados das sondas S9/S10 |
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
node leitura/teste_a.js                    # A v3 nos 4 sistemas (IA perfeita)
node workflows/gerar_a.js                  # gera A v3 + Revisar áreas; T1–T12
node agente/teste_agente.js                # agente no chat (AG1/AG2) nos 4 sistemas
node agente/teste_workflow.js              # agente no workflow nos 4 sistemas
node agente/gerar_kb.js                    # Knowledge base do Ligador e do Recuperador (agente/kb/)
python -X utf8 indice/comprime_pdf.py "<pasta>"  # comprime PDFs grandes mantendo o texto (ou dois cliques em indice/comprime_pdf_janela.pyw)
node conferencia/teste_conferencia.js      # A0: conferência dos materiais (fictício)
node workflows/gerar_a0.js                 # gera A0 Conferir materiais; simulação nó a nó (+ regressão contra o A1 com dados reais)
node agente/teste_enxuto.js                # A enxuto com sistema fictício; roda em qualquer máquina (depois de gerar_agente)
node workflows/gerar_agente.js             # gera AG1, AG2 e A agente AMP; simulação nó a nó
```
Os testes do A precisam de `dados/textos_{sistema}.json` (texto dos PDFs; ver `HANDOFF.md` §8).

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

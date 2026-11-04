# Integração de 2026-11-04: o fluxo LMR no AMP e os dois agentes da Revisão

Branch `jonathan/integracao-lmr-amp`, a partir da oficial em `c47e470`. **Não foi para a oficial
nem tem PR:** é para o Luan e o JP revisarem antes.

## O que entrou

| Branch | Commits | Como entrou |
|---|---|---|
| `claude/lmr-fluxo-a-enxuto` (JP e Luan; contém `claude/automacao-lmr-amp` e `backup/lmr-fluxo-a-2026-11-03`) | 18 | merge **sem conflito** |
| `claude/amp-agentes-revisao` (Luan, `9fc8992`, 02/11) | 1 | merge **com 8 conflitos**, todos na Revisão no AMP |

## A escolha nos conflitos da Revisão no AMP

Os dois lados mudaram a mesma coisa, de jeitos que não se somam:

- **`9fc8992` (02/11):** o SIG-FT manda **texto**, e dois agentes leem: o Revisor de Listas
  (Claude Sonnet 5.5) e o Conferente de Listas (Gemini 3.5 Flash-Lite). O nó "Monta o resultado"
  só aplica o que o Conferente confirmou e cuja prova está no PDF. Sai o `pedido.md`.
- **A oficial (03/11 e 04/11, a peça 2 v2 da rc.2, mais "45 min por lista" e "a resposta chega
  depois"):** o SIG-FT manda os **arquivos como estão** a um agente só (*Spare Parts Document
  Reviewer*, `amp/revisao_de_listas/agente.md`). É o que saiu na 1.3.3-rc.2 e na rc.3.

**Ficou a oficial**, por ser a mais nova e a que já está nas rcs instaladas. Nos 8 arquivos em
conflito valeu o lado da oficial: `sigft/services/revisao_amp.py` (a lista de arquivos do
diagnóstico), `amp/revisao_de_listas/gerar_workflow.py`, `workflow_revisao_de_listas.json`,
`LEIA-ME.md`, `tests/test_amp_workflow.py`, `docs/ROTEIRO_DE_TESTE.md`,
`docs/base-conhecimento/14-aconex-e-conferencia-de-revisoes.md` e a linha da tabela de docs do
`CLAUDE.md`.

Pelo mesmo motivo, dois arquivos que o merge juntou sozinho voltaram ao texto da oficial, porque
diziam que o desenho de dois agentes era o atual:
- `docs/ACONEX_AO_VIVO.md`;
- a nota de 02/11 em `docs/superpowers/specs/2026-10-27-amp-revisao-de-listas-design.md`.

**O que não se perdeu:** os arquivos novos de `9fc8992` estão em
`amp/revisao_de_listas/alternativa_2026-11-02_dois_agentes/` (os system prompts, os nós do n8n e
o passo a passo à mão), com um LEIA-ME que diz que não é o workflow em uso. O desenho
`docs/superpowers/specs/2026-11-02-amp-agentes-revisao-design.md` ganhou uma nota no topo:
"não adotado".

**O que não veio:** os testes que rodavam os nós daquele desenho no Node, porque viviam no mesmo
`tests/test_amp_workflow.py` do workflow em uso.

### As alternativas, para o Luan decidir

1. **Deixar como está:** um agente com os arquivos. A pasta da alternativa fica como referência,
   ou some.
2. **Voltar aos dois agentes:** `git checkout 9fc8992 -- amp/revisao_de_listas tests/test_amp_workflow.py`.
   Junto, desfazer na oficial o envio dos arquivos (`services/revisao_amp.py`,
   `core/amp/cliente.py`), porque o contrato muda de arquivos para texto.
3. **Juntar os dois:** o Revisor recebe os arquivos, e o Conferente confere a prova. É trabalho
   novo, de desenho, e não de integração.

## Verificação

Python 3.12 (PySide 6.12): 8855 passed, 28 skipped. `ruff` (depois de `nval` -> `_nval` em
`aplicacao-lmr/motor/escreve_xlsx.py`, a única quebra da integração), `pyflakes frontend.py` e
`--smoke` limpos. Nada contra o AMP, o n8n ou o portal.

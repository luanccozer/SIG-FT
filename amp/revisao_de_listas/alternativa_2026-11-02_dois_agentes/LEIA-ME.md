# Alternativa de 2026-11-02: dois agentes (não é o workflow em uso)

Esta pasta guarda o desenho do Luan de 02/11 (`claude/amp-agentes-revisao`, commit `9fc8992`):
o SIG-FT manda **texto**, e dois agentes do AMP leem — o **Revisor de Listas** (Claude Sonnet 5.5)
propõe as ações e o **Conferente de Listas** (Gemini 3.5 Flash-Lite) as confirma. O nó "Monta o
resultado" só aplica o que o Conferente confirmou, com prova no texto do PDF.

**Não é o que roda hoje.** Em 03/11 a Revisão no AMP passou a mandar os **arquivos como estão** a
um agente só (*Spare Parts Document Reviewer*, `../agente.md`; desenho
`docs/superpowers/specs/2026-11-03-amp-revisao-com-arquivos-design.md`), e é esse o workflow que o
`../gerar_workflow.py` gera e que saiu na 1.3.3-rc.2/rc.3.

Ficou aqui, na integração de 2026-11-04, para não se perder: o par Revisor + Conferente e a
conferência da prova no PDF podem voltar por cima do desenho com arquivos. O porquê da escolha e as
alternativas estão em `docs/revisoes/2026-11-04-integracao-lmr-amp.md`.

| Arquivo | O quê |
|---|---|
| `agentes/` | os system prompts do Revisor, do Conferente e a base de conhecimento opcional |
| `js/` | o código dos nós do n8n daquele desenho |
| `nos_para_colar/` | os mesmos nós, para montar o workflow à mão no n8n, com formulário |
| `passo_a_passo_workflow_n8n.md` | o passo a passo do workflow à mão |

Os testes que rodavam esse código no Node (`tests/test_amp_workflow.py` do commit `9fc8992`) não
vieram: o arquivo de testes é do workflow em uso.

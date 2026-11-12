# Upload de Condições: o robô não acha os campos (2026-11-12)

## O relato (Jonathan, log de 12/11/2026 13:27)

```
Processando 4500063671.1662...
[!] Não consegui escrever em 'Input_PackingLength': TempoEsgotado: Timeout 20000ms exceeded.
    waiting for locator("//*[@id=\"b10-b17-b1-Input_PackingLength\"]").first
Aviso: Falha nas Dimensões.
Sinal de parada enviado ao robô!
[!] ... 'Input_LiquidWeight': NavegadorFechado ...   (e mais 8 linhas iguais, +4 "Salvando...")
```

Dois defeitos, o segundo consequência do primeiro:

1. **O primeiro campo da aba não é achado em 20 s.** O seletor é o id INTEIRO do OutSystems,
   com o prefixo gerado (`b10-b17-b1-`). `sigft/services/upload_conditions.py` tem 56 seletores
   assim. O prefixo é gerado pelo portal e muda quando a tela muda (ver os comentários de
   `core/rpa/seletores_duplicada.py`: `b10-b15-b19-`, `b12-b20-b1-`, "o `$` já denuncia que é
   gerado").
2. **Depois do "Parar" (navegador fechado), o robô segue tentando** os outros campos, as outras
   três abas e quatro "Salvando...", cada um falhando com `NavegadorFechado`. Ruído, e tempo.

## O que NÃO se sabe (sessão web não alcança o portal)

Três hipóteses para o defeito 1, e o log atual não as separa:

- **H1** o prefixo do id mudou (o portal foi atualizado);
- **H2** a ficha não abriu (a busca/lápis falhou calada: `pesquisar_e_abrir` não devolve nada);
- **H3** a seção Condições não abriu (o `safe_click` do cabeçalho engole a falha) ou a sub-aba
  ainda não montou (regra 2 do `PORTAL_COMO_ELE_SE_COMPORTA.md`: aba ativa não é aba montada).

Por isso a solução tem DUAS frentes: tornar o seletor independente do prefixo (resolve H1 sem
precisar saber o prefixo novo) **e** fazer o robô DIZER o que viu quando não acha (uma única
execução passa a separar H1/H2/H3).

## Solução

### T1. Seletor pelo sufixo estável, não pelo id inteiro

- Função única (em `sigft/core/rpa/`, junto dos outros seletores; nome sugerido
  `seletor_por_sufixo(sufixo, prefixo_conhecido=None)`) que devolve um XPath que casa o id que
  TERMINA no sufixo estável (`Input_PackingLength`, `Checkbox4`, `RadioButton5-input`...).
  XPath 1.0 não tem `ends-with`: usar
  `substring(@id, string-length(@id) - string-length('SUFIXO') + 1) = 'SUFIXO'`.
  `contains()` sozinho NÃO serve para `Checkbox4` (casaria `Checkbox40`, `Checkbox41`).
- É o padrão que o projeto já usa contra o portal real em `core/rpa/caracteristicas.py`
  (`contains(@id, "TextArea_ValuePT")`).
- **Ambiguidade:** antes de trocar, levantar os 56 seletores (sufixo → prefixos). Se um mesmo
  sufixo aparece sob prefixos diferentes (ex.: `Checkbox1` em Armazenamento e em Transporte),
  o seletor tem de ser ESCOPADO ao contêiner da sub-aba ativa/visível — nunca "o primeiro do
  documento". Usar o que o arquivo já sabe das sub-abas; se não houver contêiner conhecido,
  manter o id inteiro como 1ª tentativa e o sufixo como 2ª (ver T2) e registrar em PENDENCIAS.
- Os 56 literais viram constantes nomeadas num lugar só (uma implementação por conceito).
  A ORDEM dos passos e as esperas não mudam.

### T2. Compatível com o portal de hoje E com o de antes

Como não dá para ver o portal: cada campo tenta **primeiro o id inteiro de hoje** (se existir
já, sem esperar 20 s: `element_exists`/`contar`), e **cai no sufixo** se não existir. Assim, se
H1 for falsa, nada muda; se for verdadeira, o robô volta a funcionar e o log diz
`id novo: b11-b17-b1-Input_PackingLength` UMA vez por execução (é a prova de H1).

### T3. Portão da aba: esperar o PRIMEIRO campo, e falhar cedo dizendo o porquê

Antes de preencher cada sub-aba, esperar o 1º campo dela (por sufixo). Se não aparecer:

- UMA linha de diagnóstico no log, em português, com o que o robô viu (só leitura):
  a URL, se o cabeçalho `Conditions_Header` existe, se a seção está aberta, quantos elementos
  têm id terminando no sufixo esperado (e o id real do primeiro), e se há modal aberto
  (regra 4). Sem dado pessoal, sem HTML inteiro.
- a ficha é marcada INCOMPLETA com esse motivo e o robô **passa à próxima ficha** — sem tentar
  os outros ~15 campos a 20 s cada (hoje são minutos de espera por ficha).
- Ler `tests/test_condicoes_primeiro_campo.py`: já existe trabalho sobre o primeiro campo;
  estender, não duplicar.

### T4. Navegador fechado ou parada: encerra na hora

`NavegadorFechado` (em qualquer campo) e `deve_parar()` encerram a ficha e o lote
imediatamente: nada de "Salvando Armazenamento/Transporte/Manutenção/Descarte" sem navegador,
nada de 9 linhas de "campo com falha". O resumo diz "interrompido pelo usuário" (ou "o
navegador foi fechado") e a ficha fica sem marcação no `_STATUS_PMIB`, como hoje.
**Atenção à regra do salvamento:** não interromper ENTRE o clique de salvar e a confirmação;
a parada vale entre campos e entre abas.

## Fora do escopo

- Descobrir o prefixo novo (não é preciso: é o que T1 dispensa).
- Mudar a ordem do preenchimento, os tempos, o que a IA manda, ou os outros módulos
  (`duplicadas_condicoes`, Upload Specs). Se eles tiverem o mesmo problema, vira linha no
  `PENDENCIAS.md`.

## Testes (TDD, com o motor falso que os testes de condições já usam)

1. id antigo existe → usa o id antigo, sem log de "id novo";
2. só existe o id com OUTRO prefixo → preenche pelo sufixo e loga o id real uma vez;
3. `Checkbox4` não casa `Checkbox40` (o `ends-with` de XPath 1.0);
4. sufixo repetido em duas sub-abas → pega o da sub-aba ativa;
5. 1º campo não aparece → uma linha de diagnóstico, ficha INCOMPLETA, próxima ficha, e o
   número de esperas longas é 1 (não 15);
6. `NavegadorFechado` no 2º campo → nenhum "Salvando...", lote encerrado, resumo certo;
7. parada pedida entre abas → idem; parada durante o salvar → o salvar termina.
8. Se houver teste que rode o `PlaywrightEngine` de verdade com HTML local (como
   `test_cria_fichas_massa_nos_dois_motores.py`), um caso com o XPath de sufixo num HTML
   mínimo, para provar que o XPath é válido no motor real.

## Verificação e entrega

- Suíte inteira `-n auto` em Python 3.12 e 3.10, `ruff check .`, `python -m pyflakes
  frontend.py`, `QT_QPA_PLATFORM=offscreen python frontend.py --smoke`.
- CHANGELOG: linha "Upload de Condições: ..." no bloco aberto (`## 1.4.1`, conferir o mural).
- `docs/base-conhecimento/05-upload-conditions-backend.md` e, se couber, um item novo na §0
  ou no corpo do `docs/PORTAL_COMO_ELE_SE_COMPORTA.md` ("o prefixo do id é gerado: case pelo
  sufixo").
- Commit(s) em português sem acento; push de `jonathan/condicoes-seletores`. Sem PR, sem versão.
- **Dizer com todas as letras que não foi exercido no portal.** O critério de pronto de verdade
  é UMA ficha real: se ainda falhar, a linha de diagnóstico do T3 diz qual hipótese era.

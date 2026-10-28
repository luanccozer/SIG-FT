# Ajuda para quem começa (2026-10-28)

Tanda B das ideias trazidas do Corella Automation (`rafhagmm/Corella_automation`,
v1.4.0: *"a interface não está muito explicativa para novos usuários"*). Pedida
pelo Jonathan em 2026-10-26; escopo escolhido em 2026-10-28: **"Como funciona"
em cada tela + página de boas-vindas**. O guia em PDF e os estados vazios ficam
de fora.

## 1. "Como funciona" em cada tela

### O que a pessoa vê

Logo abaixo do título de cada tela (sempre no MESMO lugar, em todas):

- uma **frase curta**, sempre visível, dizendo o que a tela faz
  ("Cria as fichas no portal PMIB a partir da planilha de materiais.");
- um botão discreto **"Como funciona"** (ícone de ajuda + texto, variante
  secundária), **fechado por padrão**, que abre um bloco com 3 a 6 itens: o que a
  tela espera receber (que planilha, que pasta), o que ela muda (o portal? a
  planilha? só gera arquivo?), o que acontece se parar no meio, e o atalho para
  o roteiro quando houver um.
- O estado aberto/fechado é lembrado por tela (`prefs`, chave
  `como_funciona_aberto`), como as colunas.

### Onde

As 12 telas do menu (as do `catalogo.py`), as abas das seções com abas (Aplicação
LMR, PMIB Manager) contam como telas próprias quando têm regra própria. O AutoSpec
é tela do Rafael (`class ModuloAutoSpec`): ganha o bloco como as outras, mas o
TEXTO dele sai do `docs/base-conhecimento/08b-autospec-contexto-negocio.md` e o
commit diz isso (contrato de fronteiras: zona dele, mudança só de texto de tela).

### Como

- `sigft/app_qt/widgets/como_funciona.py` (novo): `ComoFunciona(frase, itens,
  chave)` — o widget; `instalar_como_funciona(tela, texto)` põe no lugar certo
  do `ModuleFrame` (abaixo do título).
- Os textos moram num lugar só: `sigft/app/como_funciona.py` (sem Qt), um
  dicionário `tela -> (frase, [itens])`, cada texto marcado com `marcar()` para
  o `t()` e traduzido em `es.json`/`en.json`. Escritos a partir da
  `docs/base-conhecimento/` de cada módulo, conferidos contra o código (nada de
  prometer o que a tela não faz).
- `tests/test_como_funciona.py`: toda tela do `catalogo` tem frase e pelo menos
  3 itens; nenhum texto passa de 140 caracteres por item; tudo traduzido; o
  bloco nasce fechado e lembra o estado; a varredura de corte (pt/es/en e letra
  Grande) continua passando com o bloco aberto.

## 2. Boas-vindas

### Quando aparece

Só para quem **nunca usou**: na abertura, se não há preferência
`boas_vindas_vista` e a pasta de dados (`Documentos\SIG-FT`) não tem rastro de
uso (nenhum log de módulo, nenhuma preferência de pasta). Quem já usava o SIG-FT
e atualiza não vê. Reabre pelo Ctrl+K ("Boas-vindas") e pela Configuração.

### O que é

Uma **página da pilha** (não janela modal, como no Corella), no lugar da Home na
primeira abertura, depois das perguntas que já existem (idioma, nome):

- título "Bem-vindo ao SIG-FT" e uma frase sobre o que o app faz;
- **3 caminhos**, cartões grandes com ícone, cada um abrindo a tela certa:
  1. **Criar fichas novas** → Cria Fichas;
  2. **Completar fichas que já existem** (condições, especificações, LMR) →
     Upload Condições;
  3. **Acompanhar as listas de sobressalentes** → PMIB Manager;
- o lembrete de que **cada tela tem o "Como funciona"** e de que o Ctrl+K acha
  qualquer módulo;
- **"Ir para o início"** fecha a página (grava `boas_vindas_vista`).

### Como

- `sigft/app_qt/views/boas_vindas.py` (nova), registrada na pilha da janela
  principal mas **fora do menu lateral**; ícones via `icones`, cor só por papel.
- `main.py`: decide na montagem (`deve_mostrar_boas_vindas()`, em
  `sigft/app/boas_vindas.py`, sem Qt e testável).
- Ctrl+K: ação `acao:boas_vindas`, buscável em português também.
- `tests/test_boas_vindas.py` (regra) e `tests/test_qt_boas_vindas.py` (tela:
  aparece só na primeira vez, cada caminho abre a tela certa, "Ir para o início"
  grava e mostra a Home, reabre pelo Ctrl+K; nada corta em pt/es/en e letra
  Grande). O `conftest` desliga a boas-vindas nos testes que não a testam
  (variável de ambiente, como o diário).

## Fora do escopo

O guia em PDF, os estados vazios, mudar o texto das dicas que já existem.

## Entrega

Uma linha no CHANGELOG (bloco em aberto), `docs/base-conhecimento/00-frontend.md`,
suíte verde em 3.10 e 3.12, smoke em pt/es/en.

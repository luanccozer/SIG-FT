# Aplicação LMR: A0, conferir os materiais nos documentos

Data: 03/11/2026. Primeiro degrau do fluxo A novo. O fluxo anterior (A agente AMP e A enxuto) está guardado na branch
`backup/lmr-fluxo-a-2026-11-03`.

## 1. Por que começar por aqui

Nenhuma versão do fluxo A rodou inteira no AMP: elas cresceram até 44 e 58 nós, e a última nem iniciou depois do
formulário. O fluxo novo é uma escada de workflows pequenos, e cada degrau é provado no AMP antes de se escrever o
próximo. O A0 é o primeiro degrau. Ele responde a duas perguntas:

1. Todos os materiais do Status PMIB estão nos documentos do sistema? Onde?
2. O upload dos PDFs pelo formulário funciona no AMP, e com quantos PDFs e de que tamanho?

Fora do escopo: IA, TAGs, RDS-PP, elevações, busca por descrição, Box. Workflow B, formato da Base e `lmr.js` não mudam.

## 2. Fluxo

```
Formulário: Documentos (PDF, vários), Status PMIB (.xlsx), Sistema (texto)
 → Lê Status PMIB (Extract from File, xlsx)
 → Separa PDFs (Code: 1 item por PDF)
 → Loop Over Items (1 por volta)
     → Lê PDF (Extract from File, pdf, texto por página)
     → Confere documento (Code: procura as chaves dos materiais nas páginas; devolve 1 item)
 → Monta conferência (Code: junta os documentos, monta o .xlsx; devolve 1 item)
 → Entrega (n8n Form, página final com a mensagem e o download)
```

Oito nós, mais o Leia-me. Sem Merge, sem Wait, sem página no meio. É o mesmo desenho do Workflow B, que já rodou no AMP.

## 3. Como um material é achado

Usa o que já existe, sem copiar regra:

- `LMR.lerStatusPmib` (`motor/lmr.js`) lê o Status e dá o catálogo de materiais válidos.
- `INDICE.chavesDoMaterial` (`motor/indice/indice.js`) dá as chaves de cada material: código do material, código
  CMI/GE e cada parte do modelo depois da "/" (com 5 caracteres ou mais e pelo menos um dígito).
- A busca é a mesma do `indice.js`: a chave tem de estar inteira, sem letra ou dígito colado antes ou depois, em
  maiúsculas.

Material sem nenhuma chave válida no Status sai como `SEM CHAVE` (não dá para procurar), em vez de `NÃO`.

## 4. Entrega

Arquivo `CONFERÊNCIA MATERIAIS - {sistema}.xlsx`, montado com `PLANILHA.planilhaSimples` (`motor/planilha.js`):

**Aba MATERIAIS**, uma linha por material do Status, na ordem do Status:

| Coluna | Conteúdo |
|---|---|
| SEÇÃO, ITEM, PMIB, DESCRIÇÃO, CÓDIGO DO MATERIAL, MARCA/MODELO | do Status |
| ACHADO | `SIM`, `NÃO` ou `SEM CHAVE` |
| ACHADO POR | as chaves que bateram (ex.: `código do material`) |
| ONDE | `arquivo p.N`, até 10 lugares, e `(+ n)` se houver mais |

**Aba DOCUMENTOS**, uma linha por PDF: ARQUIVO, PÁGINAS, PÁGINAS SEM TEXTO (lista), MATERIAIS ACHADOS, AVISO.
Página sem texto é página com menos de 20 caracteres que não sejam espaço.

**Mensagem final:** `X de Y materiais achados` · documentos e páginas · páginas sem texto · até 20 PMIBs não achados
(e `+ n`) · documentos com aviso.

O texto das páginas não vai para a planilha.

## 5. Erros e limites do AMP

| Situação | Reação |
|---|---|
| PDF que o Extract não lê (protegido, corrompido) | O nó Lê PDF segue com erro (`continueRegularOutput`); o documento entra na aba DOCUMENTOS com AVISO e 0 páginas |
| PDF sem nenhuma página com texto (escaneado) | Entra com todas as páginas em PÁGINAS SEM TEXTO e AVISO `sem texto: escaneado?` |
| Status sem materiais válidos | A mensagem final diz isso e a planilha sai só com a aba DOCUMENTOS |
| Arquivo que não é PDF no campo de documentos | Ignorado e citado no AVISO da mensagem final |
| Caractere U+FFFF e controles no texto | Removidos antes da busca (o `.xlsx` corrompe com eles) |

Para não travar o task runner: o Code de cada volta devolve 1 item só (o resumo do documento: páginas, páginas sem
texto, e para cada PMIB achado as páginas); o Code final devolve 1 item com o binário.

## 6. Arquivos

| Arquivo | O que é |
|---|---|
| `aplicacao-lmr/motor/conferencia/conferencia.js` | Funções puras: `confereDocumento(arquivo, paginas, catalogo)` e `montaConferencia({ documentos, catalogo, sistema })` → `{ abas, resumo }` |
| `aplicacao-lmr/motor/conferencia/teste_conferencia.js` | Testes com material fictício |
| `aplicacao-lmr/motor/workflows/gerar_a0.js` | Gera `LMR_A0_conferir_materiais.json` e simula o fluxo nó a nó com dados fictícios |
| `aplicacao-lmr/motor/workflows/LMR_A0_conferir_materiais.json` | Gerado; nunca editado à mão |
| `aplicacao-lmr/README.md`, `HANDOFF.md` | O fluxo novo e o comando |

O código dos Code nodes leva o texto de `lmr.js`, `planilha.js`, `indice.js` e `conferencia.js`, como o A1 já faz.
A leitura do Status e a separação dos PDFs usam as peças `LE_STATUS` e `SEPARA` de `workflows/pecas_a.js`, sem cópia.
A página sem texto usa o mesmo limite do `indice.js` (`SEM_TEXTO = 20`).

## 7. Testes

**Locais, em qualquer máquina** (`node conferencia/teste_conferencia.js` e `node workflows/gerar_a0.js`):

- material achado pelo código do material, pelo CMI/GE e pelo modelo;
- chave colada em outro código não conta (`GP1011` não acha `GP101`);
- material não achado; material `SEM CHAVE`;
- PDF sem texto e PDF com erro de leitura;
- `ONDE` com mais de 10 lugares;
- simulação nó a nó: o `.json` tem os 8 nós ligados na ordem da §2, e os Code rodam com dados fictícios e devolvem 1 item.

**Na máquina com o Box** (regressão, com `dados/textos_{sistema}.json`): os achados batem com a aba MATERIAIS do A1 nos
4 sistemas (Água Pura 87 de 87; SFC 40 de 41). Sem os arquivos, o teste é pulado e o pulado não conta como aprovado.

**No AMP, em execução manual** (aceite do degrau):

1. 1 PDF pequeno e o Status: inicia e baixa a planilha.
2. Os 13 PDFs da Água Pura: 87 de 87 achados.
3. A SFC: se o upload falhar pelo tamanho, anotar o limite (quantos MB passaram); é o dado que decide o degrau seguinte.

## 8. Depois do A0

O resultado do AMP decide o próximo degrau, que terá a sua própria spec: o índice de TAGs e áreas (A1 enxuto), ou o
envio dos PDFs em lotes, se o upload tiver limite.

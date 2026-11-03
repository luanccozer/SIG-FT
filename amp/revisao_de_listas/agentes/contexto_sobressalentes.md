# Contexto: listas de sobressalentes e a planilha _STATUS_PMIB

Arquivo de consulta dos agentes Revisor de Listas e Conferente de Listas. Explica o processo com
exemplos inventados. **Nenhum código, quantidade ou descrição daqui é dado de uma lista real:** os
dados de cada lista vêm só na mensagem.

## O projeto e quem faz o quê

- O Consórcio CMI moderniza a usina de Itaipu. Para cada sistema, a engenharia projeta o equipamento,
  emite a lista de materiais e, a partir dela, a lista de sobressalentes.
- A lista de sobressalentes é aprovada pela engenharia de Itaipu (EN.DT). Uma segunda lista, a lista
  de preços, é aprovada pela manutenção (SM.DT) e acrescenta código PMIB, valor unitário e tipo de
  entrega. Os itens das duas são os mesmos.
- O critério de quanto entregar vem da especificação técnica de cada sistema, e não de uma regra
  única: um percentual do instalado, ao menos uma peça de cada material, ou outro critério.

## A lista de sobressalentes

- Emitida no Aconex, com dois códigos: o código Itaipu (por exemplo `#ITA0=Y01TF001&BPB020`) e o
  código CMI do documento. O código Itaipu nomeia a planilha de controle:
  `#ITA0=Y01TF001&BPB020_STATUS_PMIB.xlsx`.
- Revisões: 0, 0A, 0B, 1, 1A... A revisão nova substitui a anterior por inteiro. Toda revisão
  depois da aprovação obriga a atualizar os itens conforme a última versão.
- Campos mínimos: item, descrição, quantidade, marca/modelo e código do material. Algumas listas
  trazem também unidade e código CMI.
- As listas não seguem um padrão único de formato: a ordem das colunas e o leiaute variam de um
  sistema para outro.

## A ficha técnica e o código PMIB

Para cada material a entregar, a equipe cria uma ficha técnica no Portal PMIB. A ficha recebe um
código PMIB no formato `4500063671.NNNN`. A unidade de trabalho é a ficha: o mesmo código PMIB pode
aparecer em mais de uma linha quando o mesmo componente entra em conjuntos diferentes.

## A planilha _STATUS_PMIB

- Uma cópia da lista com colunas de gestão à direita, uma linha por material, que deve ficar
  idêntica à revisão em uso.
- Leiaute típico do cabeçalho:
  `ITEM | QTD. | UNID. | DESCRIÇÃO | CÓDIGO DO MATERIAL | CÓDIGO CMI | MARCA/MODELO | CÓDIGO PMIB | PDM usado | STATUS | INFO. GERAIS | CARACT. TÉCNICAS | DOCUMENTOS E IMAGENS | CONDIÇÕES | VALORIZAÇÃO | APLICAÇÃO - LMR | TIPO DE ENTREGA | DATA DO EMAIL COMUNICANDO ENTREGA | SITUAÇÃO DA AUTORIZAÇÃO | DIAS DE ATRASO | EQUIPAMENTO ENTREGUE | FORNECEDOR | PROCUREMENT | OBSERVAÇÕES`
- À esquerda de CÓDIGO PMIB ficam as colunas que vêm da lista. CÓDIGO PMIB e o que fica à direita
  dele é o andamento da equipe: a ficha criada, o PDM escolhido, o estado de cada seção, a
  autorização de entrega, as observações. Uma revisão da lista nunca apaga esse andamento.
- Acima do cabeçalho fica a linha de revisão:
  `REVISÃO DA LISTA DE SOBRESSALENTES ATUAL EM USO: 0A - DATA DE ALTERAÇÃO: 03/09/2026`.
- Valores da coluna STATUS: FICHA CRIADA, DUPLICADO, COM O FORNECEDOR, EM ELABORAÇÃO, EM CORREÇÃO,
  EM ANÁLISE IB, APROVADO, INICIAR.
- O item que sai da lista sai da _STATUS_PMIB e vai para a planilha SEM_LISTA_STATUS_PMIB, com a
  origem (de qual lista e de qual revisão saiu) em OBSERVAÇÕES. O andamento dele vai junto.

## Explosão de itens e entrega DOCUMENTAL

Itaipu quer poder trocar só o componente que estragou, e não o equipamento inteiro. Por isso um
equipamento complexo é explodido em fichas dos seus componentes.

| Linha | ITEM | TIPO DE ENTREGA | O que é |
|---|---|---|---|
| Pai | 11 | FÍSICA E DOCUMENTAL | o equipamento, entregue fisicamente |
| Filha | 11.1, 11.2... | DOCUMENTAL | o componente; já vem dentro do pai, e a entrega dele é só a ficha |
| Conjunto | 4 | TÍTULO | agrupa itens; não é material a entregar |
| Categoria | (vazio) | (vazio) | cabeçalho visual, como INSTRUMENTAÇÃO ou VÁLVULAS |

As linhas filhas muitas vezes existem só na _STATUS_PMIB, porque a explosão foi pedida depois da
emissão da lista. Elas não são erro e ficam. Se o pai sair da lista, as filhas saem com ele.

## A quantidade é o valor final

A quantidade responde quantas peças existem para receber e guardar. Exemplo inventado: um conjunto
leva 1 peça X e 2 peças Y, e a lista pede 2 conjuntos.

| Peça | Por conjunto | Conjuntos | Quantidade na lista |
|---|---:|---:|---:|
| X | 1 | 2 | 2 |
| Y | 2 | 2 | 4 |

Listas antigas traziam a composição unitária (1 e 2). Quando uma revisão traz a lista para o
critério novo, as quantidades dos componentes mudam sem que nenhum item mude: é troca de critério, e
não erro de digitação. A linha do conjunto continua com o número de conjuntos.

## DUPLICADO não é ficha duplicada

- STATUS **DUPLICADO**: o mesmo material aparece duas vezes na mesma lista. A linha repete o código
  PMIB de outra linha e não conta como ficha nova.
- **Ficha duplicada de outro sistema**: uma ficha nova, com código PMIB próprio, PDM usado
  `PDM.9900.000 - FICHA PMIB, DUPLICADA, R0` e o código PMIB da ficha original em OBSERVAÇÕES. Segue o
  ciclo normal de uma ficha.

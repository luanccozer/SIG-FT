// =====================================================================
// SOBRESSALENTES — MODELO v2 — PARÂMETROS E FUNÇÕES
// Cada bloco abaixo é UMA consulta. No Power Query: Nova Fonte > Consulta
// Nula > Editor Avançado > colar o bloco > renomear a consulta com o nome
// indicado em "CONSULTA:". As regras espelham _scripts/regras_sobressalentes.py.
// =====================================================================


// ---------------------------------------------------------------------
// CONSULTA: PastaPMIB   (parâmetro OPCIONAL — vazio = descobre sozinho)
// Só preencha se a pasta SOBRESSALENTES - PMIB não estiver no lugar padrão do
// Box Drive (C:\Users\<usuário>\Box\CMI - Consórcio Itaipu\...).
// ---------------------------------------------------------------------
"" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = false]


// ---------------------------------------------------------------------
// CONSULTA: PastaPMIBEfetiva   — a pasta que as consultas usam: o parâmetro, se
// preenchido e existente; senão procura em C:\Users\<cada usuário>\Box\... a
// pasta SOBRESSALENTES - PMIB (funciona em qualquer máquina com o Box Drive).
// ---------------------------------------------------------------------
let
    Relativo = "\Box\CMI - Consórcio Itaipu\11 - Ger. Engenharia\15 - PDM\SOBRESSALENTES - PMIB",
    Existe = (p as text) as logical => (try Table.RowCount(Table.FirstN(Folder.Contents(p), 1)) >= 0 otherwise false),
    Manual = if PastaPMIB <> null and Text.Trim(PastaPMIB) <> "" and Existe(Text.Trim(PastaPMIB)) then Text.Trim(PastaPMIB) else null,
    Usuarios = try Table.SelectRows(Folder.Contents("C:\Users"), each [Attributes]?[Kind]? = "Folder")[Name] otherwise {},
    Candidatos = List.Transform(Usuarios, each "C:\Users\" & _ & Relativo),
    Achado = List.First(List.Select(Candidatos, Existe), null),
    Resultado =
        if Manual <> null then Manual
        else if Achado <> null then Achado
        else error "Pasta SOBRESSALENTES - PMIB não encontrada. Informe o caminho no parâmetro PastaPMIB (Transformar dados > Editar parâmetros)."
in
    Resultado


// ---------------------------------------------------------------------
// CONSULTA: DataReferencia   (a "data de hoje" de cada atualização)
// ---------------------------------------------------------------------
let
    Hoje = Date.From(DateTime.LocalNow())
in
    Hoje


// ---------------------------------------------------------------------
// CONSULTA: fxNorm   — maiúsculas, sem acento, espaços colapsados
// ---------------------------------------------------------------------
(valor as any) as text =>
let
    Texto = if valor = null then "" else Text.Upper(Text.Trim(Text.From(valor))),
    Trocas = {
        {"Á","A"},{"À","A"},{"Â","A"},{"Ã","A"},{"Ä","A"},
        {"É","E"},{"È","E"},{"Ê","E"},{"Ë","E"},
        {"Í","I"},{"Ì","I"},{"Î","I"},{"Ï","I"},
        {"Ó","O"},{"Ò","O"},{"Ô","O"},{"Õ","O"},{"Ö","O"},
        {"Ú","U"},{"Ù","U"},{"Û","U"},{"Ü","U"},
        {"Ç","C"},{"Ñ","N"},{"°",""},{"º",""},{"ª",""},
        {"#(lf)"," "},{"#(cr)"," "},{"#(tab)"," "}
    },
    SemAcento = List.Accumulate(Trocas, Texto, (estado, par) => Text.Replace(estado, par{0}, par{1})),
    Colapsado = Text.Combine(List.Select(Text.Split(SemAcento, " "), each _ <> ""), " ")
in
    Colapsado


// ---------------------------------------------------------------------
// CONSULTA: fxPMIB   — '4500063671.0156' | 4500063671.0156 | '45000636710156'
//                      -> '4500063671.0156'; qualquer outra coisa -> null
//                      Sequencial com 3 dígitos perdeu o zero do FIM (ljust).
// ---------------------------------------------------------------------
(valor as any) as nullable text =>
let
    Bruto = if valor = null then ""
            else if Value.Is(valor, type number) then Number.ToText(valor, "F4", "en-US")
            else Text.Remove(Text.From(valor), {" ", "#(lf)", "#(tab)"}),
    TemPonto = Text.StartsWith(Bruto, "4500063671."),
    SemPonto = (not TemPonto) and Text.StartsWith(Bruto, "4500063671"),
    Seq = if TemPonto then Text.AfterDelimiter(Bruto, "4500063671.")
          else if SemPonto then Text.Middle(Bruto, 10)
          else null,
    SoDigitos = Seq <> null and Seq <> "" and Text.Length(Seq) <= 4
                and List.AllTrue(List.Transform(Text.ToList(Seq), each List.Contains({"0".."9"}, _))),
    Valido = SoDigitos and (TemPonto or Text.Length(Seq) = 4),
    Resultado = if Valido then "4500063671." & Text.PadEnd(Seq, 4, "0") else null
in
    Resultado


// ---------------------------------------------------------------------
// CONSULTA: fxLerTabela  — abre a aba e começa na linha cujo cabeçalho
//                          contém a palavra-chave (o cabeçalho do _STATUS_PMIB
//                          não está numa linha fixa). Cabeçalhos normalizados.
// ---------------------------------------------------------------------
(conteudo as binary, aba as text, chave as text) as table =>
let
    Livro = Excel.Workbook(conteudo, null, true),
    Planilha = try Livro{[Item = aba, Kind = "Sheet"]}[Data]
               otherwise Table.SelectRows(Livro, each [Kind] = "Sheet"){0}[Data],
    Topo = Table.ToRows(Table.FirstN(Planilha, 30)),
    Posicao = List.PositionOf(List.Transform(Topo, each List.Contains(List.Transform(_, fxNorm), chave)), true),
    Resultado =
        if Posicao < 0 then #table({}, {})
        else
            let
                Corpo = Table.Skip(Planilha, Posicao),
                Promovida = Table.PromoteHeaders(Corpo, [PromoteAllScalars = true]),
                Antigos = Table.ColumnNames(Promovida),
                Novos = List.Accumulate(Antigos, {}, (acc, nome) =>
                    let
                        n = fxNorm(nome),
                        base = if n = "" then "_COL" & Text.From(List.Count(acc)) else n,
                        unico = if List.Contains(acc, base) then base & "_" & Text.From(List.Count(acc)) else base
                    in acc & {unico}),
                Renomeada = Table.RenameColumns(Promovida, List.Zip({Antigos, Novos}))
            in
                Renomeada
in
    Resultado


// ---------------------------------------------------------------------
// CONSULTA: fxData  — data do Excel (data, data/hora, número serial ou texto
//                     dd/mm/aaaa) -> date; o resto ("-", "Atualizar data") -> null
// ---------------------------------------------------------------------
(valor as any) as nullable date =>
    if valor = null then null
    else if Value.Is(valor, type date) then valor
    else if Value.Is(valor, type datetime) then Date.From(valor)
    else if Value.Is(valor, type number) then (if valor > 40000 and valor < 60000 then Date.From(valor) else null)
    else try Date.FromText(Text.Trim(Text.From(valor)), [Culture = "pt-BR"]) otherwise null


// ---------------------------------------------------------------------
// CONSULTA: fxStatus  — vocabulário único da coluna STATUS
// ---------------------------------------------------------------------
(valor as any) as text =>
let
    n = fxNorm(valor),
    Mapa = [
        #"INICIAR" = "INICIAR",
        #"FICHA CRIADA" = "FICHA CRIADA",
        #"FICHAS CRIADAS" = "FICHA CRIADA",
        #"COM O FORNECEDOR" = "COM O FORNECEDOR",
        #"EM ELABORACAO" = "EM ELABORAÇÃO",
        #"EM ANALISE IB" = "EM ANÁLISE IB",
        #"EM ANALISE ITAIPU" = "EM ANÁLISE IB",
        #"EM CORRECAO" = "EM CORREÇÃO",
        #"APROVADO" = "APROVADO",
        #"DUPLICADO" = "DUPLICADO",
        #"N/A" = "N/A"
    ]
in
    if n = "" then "SEM STATUS" else Record.FieldOrDefault(Mapa, n, n)


// ---------------------------------------------------------------------
// CONSULTA: fxTipoEntrega  — FÍSICA E DOCUMENTAL | DOCUMENTAL | TÍTULO | null
// ---------------------------------------------------------------------
(valor as any) as nullable text =>
let
    n = fxNorm(valor)
in
    if n = "FISICA E DOCUMENTAL" or n = "FISICO E DOCUMENTAL" then "FÍSICA E DOCUMENTAL"
    else if n = "DOCUMENTAL" or n = "APENAS DOCUMENTAL" then "DOCUMENTAL"
    else if n = "TITULO" or n = "CONJUNTO" or n = "CONJUNTO (TITULO)" then "TÍTULO"
    else null


// ---------------------------------------------------------------------
// CONSULTA: fxStatusAconex  — situação de um documento no Aconex (lista de
//   sobressalentes da EN.DT, lista de preços da SM.DT) com o vocabulário do
//   próprio Aconex. Mesma tabela de regras_sobressalentes.STATUS_ACONEX.
//   Vazio -> null; valor desconhecido passa como está.
// ---------------------------------------------------------------------
(valor as any) as nullable text =>
let
    n = fxNorm(valor),
    Mapa = [
        #"APROVADO" = "Aprovado",
        #"APROVADO COM COMENTARIOS" = "Aprovado com comentários",
        #"PARA ASSINATURA" = "Para assinatura",
        #"FOR PARTIAL HANDOVER" = "For Partial Handover",
        #"PARA ANALISE" = "Para análise",
        #"EM PROCESSO" = "Em processo",
        #"INFORMATIVO" = "Informativo",
        #"NAO APROVADO" = "Não aprovado",
        #"VOID" = "Cancelado (Void)",
        #"NAO EMITIDO" = "Não emitido",
        #"SEM LISTA" = "Sem lista"
    ]
in
    if n = "" then null else Record.FieldOrDefault(Mapa, n, Text.Trim(Text.From(valor)))


// ---------------------------------------------------------------------
// CONSULTA: fxOrdemStatusAconex  — posição para ordenar os gráficos, do pronto
//   ao que não começou (= regras_sobressalentes.ORDEM_STATUS_ACONEX)
// ---------------------------------------------------------------------
(rotulo as nullable text) as number =>
let
    Ordem = {"Aprovado", "Aprovado com comentários", "Para assinatura", "For Partial Handover", "Para análise",
             "Em processo", "Informativo", "Não aprovado",
             "Cancelado (Void)", "Em elaboração (CMI)", "Não emitido", "Sem lista", "Sem lista de preços",
             "Fora da mapeadora", "Sem informação"},
    p = List.PositionOf(Ordem, rotulo)
in
    if p < 0 then 99 else p + 1


// ---------------------------------------------------------------------
// CONSULTA: fxListaDaListaDePrecos  — a lista de sobressalentes de uma lista de
//   preços: a da coluna LISTA DE SOBRESSALENTES do follow-up; vazia, a PB021
//   aponta pelo próprio código (...&MPB021 -> ...&MPB020). Senão, null.
// ---------------------------------------------------------------------
(codigo as any, informada as any) as nullable text =>
let
    i = if informada = null then "" else Text.Trim(Text.From(informada)),
    c = if codigo = null then "" else Text.Trim(Text.From(codigo))
in
    if i <> "" then i
    else if Text.EndsWith(Text.Upper(c), "PB021") then Text.Start(c, Text.Length(c) - 5) & "PB020"
    else if Text.Length(c) > 9 and Text.Upper(Text.Middle(c, Text.Length(c) - 8, 7)) = "PB020-0" then Text.Start(c, Text.Length(c) - 3)
    else null


// ---------------------------------------------------------------------
// CONSULTA: PastaDocManager   (parâmetro OPCIONAL — vazio = Box\DocManager Itaipu)
// Pasta onde o DocManager Itaipu grava o export diário do Aconex
// (Aconex_Historico_DD.MM.AA_HHhMMm.xlsx). Só preencha se estiver em outro lugar.
// ---------------------------------------------------------------------
"" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = false]


// ---------------------------------------------------------------------
// CONSULTA: AconexListasDePrecos  — listas de preços no export do Aconex mais
//   recente, revisão ATUAL (coluna Current). null quando não há export: a consulta
//   PrecosAconex volta para a aba "Lista de preços Follow-up" da mapeadora.
// ---------------------------------------------------------------------
let
    Existe = (p as text) as logical => (try Table.RowCount(Table.FirstN(Folder.Contents(p), 1)) >= 0 otherwise false),
    Manual = if PastaDocManager <> null and Text.Trim(PastaDocManager) <> "" and Existe(Text.Trim(PastaDocManager))
             then Text.Trim(PastaDocManager) else null,
    Padrao = Text.BeforeDelimiter(PastaPMIBEfetiva, "\CMI - Consórcio Itaipu") & "\DocManager Itaipu",
    Pasta = if Manual <> null then Manual else if Existe(Padrao) then Padrao else null,
    Resultado =
        if Pasta = null then null
        else
            let
                Arquivos = Table.SelectRows(Folder.Contents(Pasta), each
                    Text.StartsWith([Name], "Aconex_Historico_") and Text.EndsWith(Text.Lower([Name]), ".xlsx")),
                Ultimo = if Table.RowCount(Arquivos) = 0 then null
                         else Table.First(Table.Sort(Arquivos, {{"Date modified", Order.Descending}})),
                Docs = if Ultimo = null then null else fxLerTabela(Ultimo[Content], "Documentos", "NO. DO DOCUMENTO"),
                Atuais = if Docs = null then null else Table.SelectRows(Docs, each
                    let v = Record.Field(_, "NO. DO DOCUMENTO"), c = if v = null then "" else Text.Upper(Text.Trim(Text.From(v))) in
                    List.Contains({"TRUE", "VERDADEIRO", "1", "SIM"}, fxNorm([CURRENT]))
                    and (Text.Contains(c, "PB021") or Text.Contains(c, "PB020-0"))),
                Saida = if Atuais = null then null else Table.TransformColumns(
                    Table.RenameColumns(Table.SelectColumns(Atuais, {"NO. DO DOCUMENTO", "REVISAO", "STATUS", "DATA DE ALTERACAO"}),
                        {{"NO. DO DOCUMENTO", "Lista de Precos"}, {"REVISAO", "Revisao"}, {"STATUS", "Status Aconex"},
                         {"DATA DE ALTERACAO", "Data Aconex"}}),
                    {{"Lista de Precos", each Text.Trim(Text.From(_)), type text}, {"Revisao", each Text.From(_), type text},
                     {"Status Aconex", each Text.Trim(Text.From(_)), type text}, {"Data Aconex", fxData, type date}})
            in
                Saida
in
    Resultado


// ---------------------------------------------------------------------
// CONSULTA: fxRevisaoEmUso  — a revisão da lista de sobressalentes que o
//   _STATUS_PMIB reflete, lida da linha acima do cabeçalho:
//   "REVISÃO DA LISTA DE SOBRESSALENTES ATUAL EM USO: 0A - DATA DE ALTERAÇÃO: 03/09/2026" -> "0A"
//   Procura pelo texto, não pela posição. Sem a linha -> null.
// ---------------------------------------------------------------------
(conteudo as binary) as nullable text =>
let
    Livro = Excel.Workbook(conteudo, null, true),
    Planilha = try Livro{[Item = "Lista de Materiais", Kind = "Sheet"]}[Data]
               otherwise Table.SelectRows(Livro, each [Kind] = "Sheet"){0}[Data],
    Textos = List.Transform(List.Combine(Table.ToRows(Table.FirstN(Planilha, 10))), fxNorm),
    Linha = List.First(List.Select(Textos, each Text.StartsWith(_, "REVISAO DA LISTA")), null),
    Rev = if Linha = null then null
          else Text.Trim(Text.BeforeDelimiter(Text.AfterDelimiter(Linha, "EM USO:"), " - DATA"))
in
    if Rev = null or Rev = "" then null else Rev


// (Sem funções de dias úteis: situação e dias de atraso da autorização são
//  calculados pelo SIG-FT e lidos do _STATUS_PMIB. Decisão de 04/10/2026.)

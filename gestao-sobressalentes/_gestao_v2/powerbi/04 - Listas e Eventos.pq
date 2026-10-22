// =====================================================================
// CONSULTA: Listas   — DIMENSÃO. Uma linha por Lista de Sobressalentes.
// A mapeadora continua sendo o CADASTRO das listas (responsável, ET,
// revisão, eventos...). Os NÚMEROS saem de Itens. Lista que tem
// _STATUS_PMIB mas não está na mapeadora entra mesmo assim (com aviso).
// =====================================================================
let
    Arquivo = File.Contents(PastaPMIBEfetiva & "\Mapeamento Listas de Sobressalentes.xlsx"),
    Tabela = fxLerTabela(Arquivo, "Acompanhamento Sobressalente", "N DOCUMENTO ITAIPU"),
    SoLinhas = Table.SelectRows(Tabela, each fxNorm([N DOCUMENTO ITAIPU]) <> ""),
    Colunas = Table.SelectColumns(SoLinhas, {
        "N DOCUMENTO ITAIPU", "N DOCUMENTO CMI", "ULTIMA REVISAO EMITIDA", "STATUS DA REVISAO", "STATUS REAL",
        "REVISAO EM USO", "DESCRICAO", "ESPECIFICACAO TECNICA", "CAPITULO", "RESPONSAVEL", "PROCUREMENT",
        "ELABORADOR DO DOCUMENTO", "ORIGEM FORNECEDOR", "ENTREGA", "OBSERVACAO",
        "EVENTOS DE PAGAMENTOS RELACIONADOS", "SITUACAO NO PMIB"}, MissingField.UseNull),
    Renomeada = Table.RenameColumns(Colunas, {
        {"N DOCUMENTO ITAIPU", "Lista"}, {"N DOCUMENTO CMI", "Documento CMI"},
        {"ULTIMA REVISAO EMITIDA", "Ultima Revisao"}, {"STATUS DA REVISAO", "Status da Revisao"},
        {"STATUS REAL", "Status Real"}, {"REVISAO EM USO", "Revisao em Uso"}, {"DESCRICAO", "Descricao"},
        {"ESPECIFICACAO TECNICA", "Especificacao Tecnica"}, {"CAPITULO", "Capitulo"},
        {"RESPONSAVEL", "Responsavel"}, {"PROCUREMENT", "Procurement (lista)"},
        {"ELABORADOR DO DOCUMENTO", "Elaborador"}, {"ORIGEM FORNECEDOR", "Origem Fornecedor"},
        {"ENTREGA", "Entrega (texto)"}, {"OBSERVACAO", "Observacao"},
        {"EVENTOS DE PAGAMENTOS RELACIONADOS", "Eventos"}, {"SITUACAO NO PMIB", "Situacao PMIB (mapeadora)"}}),
    TextoTudo = Table.TransformColumns(Renomeada, List.Transform(Table.ColumnNames(Renomeada), (c) => {c, each if _ = null then null else Text.Trim(Text.From(_)), type text})),
    ComOrigem = Table.AddColumn(TextoTudo, "Origem Cadastro", each "MAPEADORA", type text),

    // listas que existem só como _STATUS_PMIB
    DeItens = Table.Distinct(Table.SelectColumns(Itens, {"Lista", "Sistema"}), {"Lista"}),
    Faltantes = Table.SelectRows(DeItens, each not List.Contains(ComOrigem[Lista], [Lista])),
    FaltantesFmt = Table.AddColumn(Table.RenameColumns(Faltantes, {{"Sistema", "Descricao"}}), "Origem Cadastro", each "SÓ _STATUS_PMIB (falta na mapeadora)", type text),
    Unidas = Table.Combine({ComOrigem, FaltantesFmt}),

    // nome curto para gráficos: pasta do _STATUS_PMIB; sem ela, a descrição sem o prefixo padrão
    Pastas = Table.Distinct(Table.SelectColumns(Itens, {"Lista", "Area", "Sistema"}), {"Lista"}),
    ComPasta = Table.NestedJoin(Unidas, {"Lista"}, Pastas, {"Lista"}, "P", JoinKind.LeftOuter),
    ExpPasta = Table.ExpandTableColumn(ComPasta, "P", {"Area", "Sistema"}),
    ComNome = Table.AddColumn(ExpPasta, "Nome", each
        if [Sistema] <> null then [Sistema]
        else
            let
                d = if [Descricao] = null then [Lista] else [Descricao],
                Prefixos = {"ATUALIZAÇÃO TECNOLÓGICA - PAT_OBJ1 - ", "ATUALIZAÇÃO TECNOLÓGICA – PAT_OBJ1 - ",
                            "ENG. ELÉTRICA - ", "ENG. MECÂNICA  - ", "ENG. MECÂNICA - ", "ENG. ELETRÔNICA - ", "ENG. CIVIL - ",
                            " - LISTA DE SOBRESSALENTES", " - LISTA DESOBRESSALENTES"},
                Limpo = List.Accumulate(Prefixos, d, (s, p) => Text.Replace(s, p, ""))
            in
                Text.Trim(Limpo), type text),
    ComAreaFinal = Table.AddColumn(ComNome, "Area Final", each if [Area] <> null then [Area] else "SEM _STATUS_PMIB", type text),
    ComFlags = Table.AddColumn(ComAreaFinal, "Tem Responsavel", each [Responsavel] <> null and fxNorm([Responsavel]) <> "" and fxNorm([Responsavel]) <> "-", type logical),

    // revisão em uso: a do próprio _STATUS_PMIB (linha acima do cabeçalho) manda; a da
    // mapeadora fica como referência até o SIG-FT passar a copiá-la do arquivo
    Revisoes = Table.Distinct(Table.SelectRows(Table.SelectColumns(Itens, {"Lista", "Revisao no Arquivo"}),
                                               each [Revisao no Arquivo] <> null), {"Lista"}),
    ComRevArq = Table.ExpandTableColumn(Table.NestedJoin(ComFlags, {"Lista"}, Revisoes, {"Lista"}, "R", JoinKind.LeftOuter),
                                        "R", {"Revisao no Arquivo"}),
    ComRevMap = Table.RenameColumns(ComRevArq, {{"Revisao em Uso", "Revisao em Uso (mapeadora)"}}),
    ComRevisao = Table.AddColumn(ComRevMap, "Revisao em Uso", each
        if [Revisao no Arquivo] <> null then [Revisao no Arquivo] else [#"Revisao em Uso (mapeadora)"], type text),
    ComDefasagem = Table.AddColumn(ComRevisao, "Revisao Desatualizada", each
        [Revisao em Uso] <> null and [Ultima Revisao] <> null and fxNorm([Ultima Revisao]) <> "SEM LISTA"
        and fxNorm([Revisao em Uso]) <> fxNorm([Ultima Revisao]), type logical),
    // situação da ÚLTIMA revisão no Aconex (Para assinatura, Em processo...). O "Status Real" é o da equipe:
    // APROVADO quando há revisão aprovada (inclui Para assinatura e Em processo com revisão anterior aprovada)
    ComSituacaoLista = Table.AddColumn(ComDefasagem, "Situacao Lista", each
        if [Origem Cadastro] <> "MAPEADORA" then "Fora da mapeadora"
        else let s = fxStatusAconex([Status da Revisao]) in if s = null then "Sem informação" else s, type text),
    ComOrdemLista = Table.AddColumn(ComSituacaoLista, "Ordem Situacao Lista", each fxOrdemStatusAconex([Situacao Lista]), Int64.Type),

    // lista de preços ATUAL de cada lista: a que está no Aconex (follow-up) antes da PB021 que só existe na pasta;
    // entre as do Aconex, PB021 antes do código antigo e, entre iguais, a mais recente
    PrecosV = Table.SelectRows(Table.SelectColumns(PrecosAconex, {"Lista", "Lista de Precos", "Revisao", "Situacao Aconex", "Geracao",
        "Data Aconex", "Origem"}), each [Lista] <> null),
    PrecosChave = Table.AddColumn(Table.AddColumn(PrecosV, "NoAconex", each if Text.StartsWith([Origem], "Arquivo na pasta") then 0 else 1, Int64.Type),
        "P21", each if [Geracao] = "PB021" then 1 else 0, Int64.Type),
    PrecosOrd = Table.Buffer(Table.Sort(PrecosChave,
        {{"NoAconex", Order.Descending}, {"P21", Order.Descending}, {"Data Aconex", Order.Descending}, {"Revisao", Order.Descending}})),
    PrecoAtual = Table.Distinct(PrecosOrd, {"Lista"}),
    ComPreco = Table.ExpandTableColumn(Table.NestedJoin(ComOrdemLista, {"Lista"}, PrecoAtual, {"Lista"}, "LP", JoinKind.LeftOuter), "LP",
        {"Lista de Precos", "Revisao", "Situacao Aconex"}, {"Lista de Precos Atual", "Revisao Lista de Precos", "Situacao LP"}),
    ComSituacaoLP = Table.AddColumn(ComPreco, "Situacao Lista de Precos", each
        if [Lista de Precos Atual] = null then "Sem lista de preços" else if [Situacao LP] = null then "Sem informação" else [Situacao LP], type text),
    ComOrdemLP = Table.AddColumn(Table.RemoveColumns(ComSituacaoLP, {"Situacao LP"}), "Ordem Situacao Lista de Precos",
        each fxOrdemStatusAconex([Situacao Lista de Precos]), Int64.Type),

    // uma linha por lista (a mapeadora pode repetir um código): exigência do relacionamento com Itens
    Unica = Table.Distinct(ComOrdemLP, {"Lista"}),
    Final = Table.RemoveColumns(Table.RenameColumns(Unica, {{"Area", "Area (pasta)"}}), {"Sistema"})
in
    Final


// =====================================================================
// CONSULTA: Eventos   — "Extrato dos Eventos dos Sobressalentes.xlsx"
// (fica na pasta 15 - PDM, um nível acima de PastaPMIBEfetiva)
// Tipo ENTREGA = parcela paga no recebimento; APROVAÇÃO = na aprovação.
// =====================================================================
let
    // sem o extrato (ou ilegível), a tabela vem vazia e a atualização segue
    Vazia = #table(type table [Evento = text, Grupo = text, #"Tipo Evento" = text, Percentual = number,
        #"Descricao Evento" = text, #"Mes de Referencia" = text], {}),
    PastaPDM = Text.BeforeDelimiter(PastaPMIBEfetiva, "\", {0, RelativePosition.FromEnd}),
    Arquivo = File.Contents(PastaPDM & "\Extrato dos Eventos dos Sobressalentes.xlsx"),
    Tabela = fxLerTabela(Arquivo, "Sheet2", "ITEM"),
    ComGrupo = Table.AddColumn(Tabela, "Grupo", each if [VALOR] = null and [ITEM] <> null then [ITEM] else null),
    Preenchida = Table.FillDown(ComGrupo, {"Grupo"}),
    SoEventos = Table.SelectRows(Preenchida, each [VALOR] <> null),
    ComEvento = Table.AddColumn(SoEventos, "Evento", each Text.Upper(Text.Remove(Text.From([ITEM]), {" "})), type text),
    ComPercentual = Table.AddColumn(ComEvento, "Percentual", each try Number.From(Text.BeforeDelimiter(Text.From([VALOR]), "%")) / 100 otherwise null, Percentage.Type),
    ComTipo = Table.AddColumn(ComPercentual, "Tipo Evento", each if Text.Contains(fxNorm([DESCRICAO]), "APROVACAO") then "APROVAÇÃO" else "ENTREGA", type text),
    Selecionada = Table.SelectColumns(Table.RenameColumns(ComTipo, {{"DESCRICAO", "Descricao Evento"}, {"MES DE REFERENCIA", "Mes de Referencia"}}),
        {"Evento", "Grupo", "Tipo Evento", "Percentual", "Descricao Evento", "Mes de Referencia"}, MissingField.UseNull),
    Unicos = Table.Distinct(Selecionada, {"Evento"}),          // um evento por linha: exigência do relacionamento
    Final = try Table.Buffer(Unicos) otherwise Vazia
in
    Final


// =====================================================================
// CONSULTA: ListaEvento   — ponte Lista x Evento ("2835, 2835a, 2836")
// Relacionamento Listas 1—* ListaEvento com filtro cruzado AMBAS as direções.
// =====================================================================
let
    Base = Table.SelectRows(Table.SelectColumns(Listas, {"Lista", "Eventos"}), each [Eventos] <> null),
    Separada = Table.AddColumn(Base, "Evento", each
        List.Select(List.Transform(Text.SplitAny([Eventos], ",/;"), each Text.Upper(Text.Remove(Text.Trim(_), {" "}))), each _ <> "")),
    Expandida = Table.ExpandListColumn(Separada, "Evento"),
    Final = Table.Distinct(Table.SelectColumns(Expandida, {"Lista", "Evento"}))
in
    Final

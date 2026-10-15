// =====================================================================
// CONSULTA: PrecosArquivos   (uma linha por arquivo de lista de preços)
// Reconhece a lista de preços pelo DCC do código:
//   ...PB021      vigente (revisão do ITAIPU-REF-0013)
//   ...PB020-0x   legado — ainda existe enquanto não for reemitida como PB021
// =====================================================================
let
    Raiz = if Text.EndsWith(PastaPMIBEfetiva, "\") then PastaPMIBEfetiva else PastaPMIBEfetiva & "\",
    Arquivos = Folder.Files(Raiz),
    Filtrados = Table.SelectRows(Arquivos, each
        let
            n = Text.Upper([Name]),
            p = fxNorm([Folder Path])
        in
            (Text.EndsWith(n, ".XLSM") or Text.EndsWith(n, ".XLSX"))
            and (Text.Contains(n, "PB021") or Text.Contains(n, "PB020-0"))
            and not Text.Contains(n, "STATUS_PMIB")
            and not Text.StartsWith(n, "~$")
            and not List.AnyTrue(List.Transform({"COPY", "COPIA", "CÓPIA", "COMENT", "RESPOSTA"}, (k) => Text.Contains(n, k)))
            and not List.AnyTrue(List.Transform({"OBSOLETO", "TESTES", "BACKUP"}, (k) => Text.Contains(p, k)))),
    ComCodigo = Table.AddColumn(Filtrados, "Lista de Precos", each
        let
            SemExt = Text.BeforeDelimiter([Name], ".", {0, RelativePosition.FromEnd}),
            SemRev = if Text.Contains(SemExt, "[") then Text.BeforeDelimiter(SemExt, "[") else SemExt
        in
            Text.Trim(SemRev), type text),
    ComGeracao = Table.AddColumn(ComCodigo, "Geracao", each if Text.Contains(Text.Upper([Name]), "PB021") then "PB021" else "PB020-0x (legado)", type text),
    ComPasta = Table.AddColumn(ComGeracao, "Pasta", each Text.AfterDelimiter([Folder Path], Raiz), type text),
    ComDados = Table.AddColumn(ComPasta, "Dados", each fxLerTabela([Content], "Lista de Materiais", "DESCRICAO")),
    Resultado = Table.SelectColumns(ComDados, {"Lista de Precos", "Geracao", "Pasta", "Date modified", "Dados"})
in
    Resultado


// =====================================================================
// CONSULTA: PrecosPorPMIB   (desabilite o carregamento: só alimenta Itens)
// Uma linha por PMIB. Se o PMIB aparece em mais de um arquivo, vale
// PB021 antes de PB020-0x e, entre iguais, o arquivo mais recente.
// =====================================================================
let
    Base = PrecosArquivos,
    Colunas = {"QTD.", "CODIGO GE", "CODIGO GE (MTA)", "CODIGO CMI", "CODIGO PMIB", "VALOR UNITARIO", "TIPO DE ENTREGA"},
    Selecionadas = Table.TransformColumns(Base, {"Dados", each Table.SelectColumns(_, Colunas, MissingField.UseNull)}),
    Expandida = Table.ExpandTableColumn(Selecionadas, "Dados", Colunas),
    ComPMIB = Table.AddColumn(Expandida, "PMIB", each fxPMIB([CODIGO PMIB]), type text),
    SoComPMIB = Table.SelectRows(ComPMIB, each [PMIB] <> null),
    ComTipo = Table.AddColumn(SoComPMIB, "Tipo Preco", each fxTipoEntrega([TIPO DE ENTREGA]), type text),
    ComValor = Table.AddColumn(ComTipo, "Valor Unitario USD", each try Number.From([VALOR UNITARIO]) otherwise null, type number),
    ComCodigoGE = Table.AddColumn(ComValor, "Codigo GE Preco", each
        List.First(List.Select({[CODIGO GE], [#"CODIGO GE (MTA)"], [CODIGO CMI]}, each _ <> null and fxNorm(_) <> "" and fxNorm(_) <> "-"), null), type text),
    Prioridade = Table.AddColumn(ComCodigoGE, "Prioridade", each if [Geracao] = "PB021" then 2 else 1, Int64.Type),
    Ordenada = Table.Buffer(Table.Sort(Prioridade, {{"Prioridade", Order.Descending}, {"Date modified", Order.Descending}})),
    UmPorPMIB = Table.Distinct(Ordenada, {"PMIB"}),
    Resultado = Table.SelectColumns(UmPorPMIB, {"PMIB", "Tipo Preco", "Valor Unitario USD", "Codigo GE Preco", "Lista de Precos", "Geracao"})
in
    Resultado


// =====================================================================
// CONSULTA: PrecosAconex   (cada lista de preços e a sua situação no Aconex:
//   - situação: o export do Aconex (DocManager), revisão atual — desde 15/10/2026;
//     sem o export, a aba "Lista de preços Follow-up" da mapeadora (manual);
//   - a aba de follow-up liga a lista de preços à lista de sobressalentes;
//   - + as PB021 que já estão na pasta e não estão no Aconex = "Em elaboração (CMI)")
// =====================================================================
let
    Arquivo = File.Contents(PastaPMIBEfetiva & "\Mapeamento Listas de Sobressalentes.xlsx"),
    Tabela = fxLerTabela(Arquivo, "Lista de preços Follow-up", "N DOCUMENTO ITAIPU"),
    SoLinhas = Table.SelectRows(Tabela, each fxNorm([N DOCUMENTO ITAIPU]) <> ""),
    Colunas = Table.SelectColumns(SoLinhas,
        {"N DOCUMENTO ITAIPU", "N DOCUMENTO CMI", "ULTIMA REVISAO EMITIDA", "STATUS DA REVISAO", "DATA DE ATUALIZACAO",
         "LISTA DE SOBRESSALENTES", "ALERTA RDS-PP", "ACAO", "OBSERVACOES"}, MissingField.UseNull),
    Renomeada = Table.RenameColumns(Colunas, {
        {"N DOCUMENTO ITAIPU", "Lista de Precos"}, {"N DOCUMENTO CMI", "Documento CMI"},
        {"ULTIMA REVISAO EMITIDA", "Revisao"}, {"STATUS DA REVISAO", "Status Aconex"},
        {"DATA DE ATUALIZACAO", "Data Aconex"}, {"LISTA DE SOBRESSALENTES", "Lista"},
        {"ALERTA RDS-PP", "Alerta RDS-PP"}, {"ACAO", "Acao"}, {"OBSERVACOES", "Observacoes"}}),
    FollowUp = Table.TransformColumns(Renomeada, {{"Data Aconex", fxData, type date},
        {"Lista de Precos", each Text.Trim(Text.From(_)), type text}}),
    CadListas = fxLerTabela(Arquivo, "Acompanhamento Sobressalente", "N DOCUMENTO ITAIPU"),
    CodigosListas = List.Buffer(List.Transform(List.Select(CadListas[N DOCUMENTO ITAIPU], each _ <> null),
        each Text.Trim(Text.From(_)))),
    Aconex = AconexListasDePrecos,
    DoAconex = if Aconex = null then null
        else
            let
                SoPrecos = Table.SelectRows(Aconex, each not List.Contains(CodigosListas, [Lista de Precos])),
                ComFU = Table.NestedJoin(SoPrecos, {"Lista de Precos"}, FollowUp, {"Lista de Precos"}, "FU", JoinKind.LeftOuter),
                Exp = Table.ExpandTableColumn(ComFU, "FU", {"Documento CMI", "Lista", "Alerta RDS-PP", "Acao", "Observacoes"})
            in
                Table.AddColumn(Exp, "Origem", each "Aconex (DocManager)", type text),
    ComData0 = if DoAconex <> null then DoAconex else Table.AddColumn(FollowUp, "Origem", each "Aconex (follow-up)", type text),
    // a lista de sobressalentes: a informada no follow-up; vazia, a PB021 aponta pelo próprio código
    ComVinculo = Table.AddColumn(ComData0, "Vinculo Lista", each
        if [Lista] <> null and Text.Trim(Text.From([Lista])) <> "" then "Follow-up"
        else if fxListaDaListaDePrecos([Lista de Precos], null) <> null then "Pelo código"
        else "Sem lista", type text),
    ComListaV = Table.AddColumn(ComVinculo, "Lista Vinculada", each fxListaDaListaDePrecos([Lista de Precos], [Lista]), type text),
    ComData = Table.RenameColumns(Table.RemoveColumns(ComListaV, {"Lista"}), {{"Lista Vinculada", "Lista"}}),
    ComGeracao = Table.AddColumn(ComData, "Geracao", each if Text.Contains(Text.Upper(Text.From([Lista de Precos])), "PB021") then "PB021" else "PB020-0x (legado)", type text),
    ComSituacao = Table.AddColumn(ComGeracao, "Situacao Preco", each
        let s = fxNorm([Status Aconex]) in
        if s = "APROVADO" or s = "APROVADO COM COMENTARIOS" then "APROVADA SM.DT"
        else if s = "NAO APROVADO" then "NÃO APROVADA"
        else if s = "VOID" then "CANCELADA"
        else "EMITIDA", type text),
    ComSituacaoAconex = Table.AddColumn(ComSituacao, "Situacao Aconex", each
        let s = fxStatusAconex([Status Aconex]) in if s = null then "Sem informação" else s, type text),

    // PB021 que já existe na pasta e ainda não está no Aconex: em elaboração pelo CMI
    NoFollowUp = List.Buffer(List.Transform(ComSituacaoAconex[Lista de Precos], fxNorm)),
    SoNaPasta = Table.Distinct(Table.SelectRows(Table.SelectColumns(PrecosArquivos, {"Lista de Precos", "Geracao", "Date modified"}),
        each [Geracao] = "PB021" and not List.Contains(NoFollowUp, fxNorm([Lista de Precos]))), {"Lista de Precos"}),
    Pasta1 = Table.TransformColumns(Table.RenameColumns(SoNaPasta, {{"Date modified", "Data Aconex"}}), {{"Data Aconex", each Date.From(_), type date}}),
    Pasta2 = Table.AddColumn(Pasta1, "Lista", each fxListaDaListaDePrecos([Lista de Precos], null), type text),
    Pasta3 = Table.AddColumn(Pasta2, "Vinculo Lista", each if [Lista] <> null then "Pelo código" else "Sem lista", type text),
    Pasta4 = Table.AddColumn(Pasta3, "Origem", each "Arquivo na pasta (fora do Aconex)", type text),
    Pasta5 = Table.AddColumn(Pasta4, "Situacao Preco", each "EM ELABORAÇÃO", type text),
    Pasta6 = Table.AddColumn(Pasta5, "Situacao Aconex", each "Em elaboração (CMI)", type text),
    Unidas = Table.Combine({ComSituacaoAconex, Pasta6}),
    ComOrdem = Table.AddColumn(Unidas, "Ordem Situacao Aconex", each fxOrdemStatusAconex([Situacao Aconex]), Int64.Type),
    Tipada = Table.TransformColumnTypes(ComOrdem, {{"Lista de Precos", type text}, {"Lista", type text}, {"Revisao", type text}, {"Status Aconex", type text}})
in
    Tipada

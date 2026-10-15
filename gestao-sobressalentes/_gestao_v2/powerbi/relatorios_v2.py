# -*- coding: utf-8 -*-
"""
Desenho dos relatorios do Power BI v2 (PBIR) — "executivo": tema proprio no estilo do prototipo
HTML (fundo claro, cartoes brancos com borda fina, numeros grandes, barras horizontais simples,
poucas cores), filtros de Especificacao Tecnica e Capitulo sincronizados em todas as paginas.
Nada de barra empilhada em porcentagem.

Usado por montar_pbip.py.
"""
from __future__ import annotations

import json
import pathlib
import shutil
import uuid

AQUI = pathlib.Path(__file__).resolve().parent
RECURSOS = AQUI / "recursos"
SCH = "https://developer.microsoft.com/json-schemas/fabric/item/report/definition"
VC = f"{SCH}/visualContainer/2.12.0/schema.json"
COR = {"azul": "#2A78D6", "laranja": "#EB6834", "verde": "#1BAF7A", "ambar": "#EDA100", "vermelho": "#D03B3B",
       "cinza": "#898781", "tinta": "#0B0B0B", "tinta2": "#52514E", "borda": "#E4E3DD", "fundo": "#F4F4F1",
       "cartao": "#FFFFFF", "azul_claro": "#86B6EF", "azul_escuro": "#104281", "linha": "#ECEBE6"}
W, H, MARGEM, VAO = 1280, 720, 24, 16
LOGO_CMI, LOGO_IB = "CMI_LOGO5666199698605043.png", "LOGO_IB_Colorido6911759159194111.png"


def tema() -> dict:
    s = lambda c: {"solid": {"color": c}}  # noqa: E731
    return {
        "name": "Sobressalentes v2",
        "dataColors": [COR["azul"], COR["laranja"], COR["verde"], COR["ambar"], COR["azul_claro"], COR["azul_escuro"],
                       COR["vermelho"], COR["cinza"]],
        "background": COR["cartao"], "foreground": COR["tinta"], "tableAccent": COR["azul"],
        "good": "#0CA30C", "neutral": COR["ambar"], "bad": COR["vermelho"],
        "textClasses": {
            "callout": {"fontSize": 26, "fontFace": "Segoe UI Semibold", "color": COR["tinta"]},
            "title": {"fontSize": 11, "fontFace": "Segoe UI Semibold", "color": COR["tinta"]},
            "header": {"fontSize": 11, "fontFace": "Segoe UI Semibold", "color": COR["tinta"]},
            "label": {"fontSize": 10, "fontFace": "Segoe UI", "color": COR["tinta2"]},
        },
        "visualStyles": {
            "*": {"*": {
                "background": [{"show": True, "color": s(COR["cartao"]), "transparency": 0}],
                "border": [{"show": True, "color": s(COR["borda"]), "radius": 10}],
                "dropShadow": [{"show": False}],
                "title": [{"show": True, "fontColor": s(COR["tinta"]), "fontSize": 11, "fontFamily": "Segoe UI Semibold",
                           "alignment": "left"}],
                "padding": [{"top": 10, "bottom": 10, "left": 14, "right": 14}],
            }},
            "page": {"*": {"background": [{"color": s(COR["fundo"]), "transparency": 0}],
                          "outspace": [{"color": s(COR["fundo"]), "transparency": 0}]}},
            "card": {"*": {"labels": [{"color": s(COR["tinta"]), "fontSize": 24, "fontFamily": "Segoe UI Semibold",
                                       "labelDisplayUnits": 1}],
                           "categoryLabels": [{"show": True, "color": s(COR["tinta2"]), "fontSize": 10,
                                               "fontFamily": "Segoe UI"}],
                           "title": [{"show": False}]}},
            "clusteredBarChart": {"*": {
                "valueAxis": [{"show": False, "showAxisTitle": False, "gridlineShow": False}],
                "categoryAxis": [{"show": True, "showAxisTitle": False, "fontSize": 10, "labelColor": s(COR["tinta2"]),
                                  "maxMarginFactor": 45, "innerPadding": 35}],
                "labels": [{"show": True, "fontSize": 10, "color": s(COR["tinta2"]), "labelDisplayUnits": 1}],
                "legend": [{"show": False}],
                "dataPoint": [{"fill": s(COR["azul"])}]}},
            "tableEx": {"*": {
                "grid": [{"gridVertical": False, "gridHorizontal": True, "gridHorizontalColor": s(COR["linha"]),
                          "rowPadding": 4, "outlineColor": s(COR["cartao"])}],
                "columnHeaders": [{"fontColor": s(COR["tinta2"]), "backColor": s(COR["cartao"]),
                                   "fontFamily": "Segoe UI Semibold", "fontSize": 9, "wordWrap": True}],
                "values": [{"fontColorPrimary": s(COR["tinta"]), "backColorPrimary": s(COR["cartao"]),
                            "fontColorSecondary": s(COR["tinta"]), "backColorSecondary": s(COR["cartao"]),
                            "fontSize": 9}],
                "total": [{"totals": False}]}},
            "slicer": {"*": {"header": [{"show": True, "fontColor": s(COR["tinta2"]), "fontSize": 9}],
                             "items": [{"fontSize": 10, "fontColor": s(COR["tinta"])}],
                             "padding": [{"top": 4, "bottom": 4, "left": 10, "right": 10}]}},
            "textbox": {"*": {"background": [{"show": False}], "border": [{"show": False}]}},
            "image": {"*": {"background": [{"show": False}], "border": [{"show": False}]}},
        },
    }


# --------------------------------------------------------------------------
def lit(v) -> dict:
    if isinstance(v, bool):
        v = "true" if v else "false"
    elif isinstance(v, (int, float)):
        v = f"{v}D"
    else:
        v = "'" + str(v).replace("'", "''") + "'"
    return {"expr": {"Literal": {"Value": v}}}


def cor(hexa: str) -> dict:
    return {"solid": {"color": lit(hexa)}}


class Campo:
    def __init__(self, tabela: str, prop: str, medida: bool = False, rotulo: str | None = None):
        self.t, self.p, self.m, self.rotulo = tabela, prop, medida, rotulo

    def expr(self) -> dict:
        k = "Measure" if self.m else "Column"
        return {k: {"Expression": {"SourceRef": {"Entity": self.t}}, "Property": self.p}}

    def proj(self, ativo: bool = False) -> dict:
        p = {"field": self.expr(), "queryRef": f"{self.t}.{self.p}", "nativeQueryRef": self.rotulo or self.p}
        if self.rotulo:
            p["displayName"] = self.rotulo
        if ativo:
            p["active"] = True
        return p


def M(p, rotulo=None):
    return Campo("Itens", p, True, rotulo)


def L(p, rotulo=None):
    return Campo("Listas", p, True, rotulo)


def PR(p, rotulo=None):
    return Campo("PrecosAconex", p, True, rotulo)


CARTOES: dict[tuple[str, str], str] = {}   # (tabela, medida) -> medida "(cartão)" criada pelo montar_pbip.py


def para_cartao(campo: Campo) -> Campo:
    """Cartao mostra 0, nao "(Em branco)": usa uma copia da medida com COALESCE(..., 0). A medida original
    continua vazia onde nao ha dado, para as tabelas nao listarem linhas zeradas."""
    if not campo.m or "(texto)" in campo.p or campo.p == "Atualizado em":
        return campo
    nome = f"{campo.p} (cartão)"
    CARTOES[(campo.t, campo.p)] = nome
    return Campo(campo.t, nome, True, campo.rotulo or campo.p)


def filtro(campo: Campo, valores: list[str], negar: bool = False) -> dict:
    cond = {"In": {"Expressions": [{"Column": {"Expression": {"SourceRef": {"Source": "f"}}, "Property": campo.p}}],
                   "Values": [[{"Literal": {"Value": "null" if v is None else "'" + v.replace("'", "''") + "'"}}]
                              for v in valores]}}
    if negar:
        cond = {"Not": {"Expression": cond}}
    return {"name": uuid.uuid4().hex[:20], "field": campo.expr(), "type": "Categorical",
            "filter": {"Version": 2, "From": [{"Name": "f", "Entity": campo.t, "Type": 0}], "Where": [{"Condition": cond}]}}


# Estilo "classico": o do painel antigo de sobressalentes (fundo branco, bordas e titulos azul-marinho, fonte DIN).
# "fonte" vai nos visuais (o nome interno do DIN no Power BI e wf_standard-font); "fonte_texto" vai na caixa de texto.
CLASSICO = {"fundo": "#FFFFFF", "borda": "#2B2A8C", "titulo": "#1E1B78", "numero": "#1F1C99", "texto": "#1E1B78",
            "fonte": "wf_standard-font, helvetica, arial, sans-serif", "fonte_texto": "DIN", "raio": 4}
COR_ACONEX_CLASSICO = {"Aprovado": "#08A64A", "Aprovado com comentários": "#6FCB93", "Para assinatura": "#2C8BF6",
                       "Em processo": "#8CC2FA", "Informativo": "#8CC2FA", "Não aprovado": "#F42B3B",
                       "Cancelado (Void)": "#9A9A9A", "Em elaboração (CMI)": "#F5A31A", "Não emitido": "#1F1C99",
                       "Sem lista": "#9A9A9A", "Sem lista de preços": "#1F1C99", "Fora da mapeadora": "#9A9A9A",
                       "Sem informação": "#9A9A9A"}


# Letras para projetar (o slide de Itaipu): o padrao da tela (9-11 pt) fica pequeno numa apresentacao.
TAM_SLIDE = {"titulo_visual": 13, "eixo": 12, "rotulo": 12, "kpi": 28, "kpi_rotulo": 12, "tabela": 11,
             "pag": "18pt", "sub": "10pt", "nota": 10, "filtro_cab": 10, "filtro_item": 11}


class Pagina:
    def __init__(self, nome_exibicao: str, estilo: dict | None = None, filtros: list[dict] | None = None,
                 grande: bool = False):
        self.id = uuid.uuid4().hex[:20]
        self.nome = nome_exibicao
        self.visuais: list[dict] = []
        self.estilo = estilo          # None = tema do relatorio; CLASSICO = formatacao propria em cada visual
        self.filtros = filtros or []  # filtros de pagina (aparecem no painel Filtros e podem ser tirados)
        self.tam = TAM_SLIDE if grande else None   # letras maiores (slide)

    def _add(self, tipo, x, y, w, h, query=None, objetos=None, titulo=None, filtros=None, sem_caixa=False,
             extra=None):
        z = (len(self.visuais) + 1) * 1000
        v = {"visualType": tipo}
        if query:
            v["query"] = query
        if objetos:
            v["objects"] = objetos
        vco = {}
        e = self.estilo
        if titulo is not None:
            vco["title"] = [{"properties": {"show": lit(True), "text": lit(titulo.upper() if e else titulo)}}]
            if e:
                vco["title"][0]["properties"].update({"fontColor": cor(e["titulo"]), "fontFamily": lit(e["fonte"]),
                                                       "bold": lit(True), "fontSize": lit(11)})
            if self.tam:
                vco["title"][0]["properties"]["fontSize"] = lit(self.tam["titulo_visual"])
        if e and not sem_caixa:
            vco["background"] = [{"properties": {"show": lit(True), "color": cor(e["fundo"]), "transparency": lit(0)}}]
            vco["border"] = [{"properties": {"show": lit(True), "color": cor(e["borda"]), "radius": lit(e["raio"])}}]
        if sem_caixa:
            vco["background"] = [{"properties": {"show": lit(False)}}]
            vco["border"] = [{"properties": {"show": lit(False)}}]
            vco["padding"] = [{"properties": {"top": lit(0), "bottom": lit(0), "left": lit(0), "right": lit(0)}}]
        if vco:
            v["visualContainerObjects"] = vco
        if extra:
            v.update(extra)
        v["drillFilterOtherVisuals"] = True
        cont = {"$schema": VC, "name": uuid.uuid4().hex[:20],
                "position": {"x": round(x, 2), "y": y, "z": z, "height": h, "width": round(w, 2), "tabOrder": z},
                "visual": v}
        if filtros:
            cont["filterConfig"] = {"filters": filtros}
        self.visuais.append(cont)

    def titulo(self, x, y, w, h, titulo, subtitulo):
        e = self.estilo
        c1, c2, f = (e["titulo"], e["texto"], e["fonte_texto"]) if e else (COR["tinta"], COR["tinta2"], "Segoe UI")
        par = [{"textRuns": [{"value": titulo.upper() if e else titulo,
                              "textStyle": {"fontWeight": "bold", "fontSize": self.tam["pag"] if self.tam else "15pt",
                                            "color": c1, "fontFamily": f}}]},
               {"textRuns": [{"value": subtitulo, "textStyle": {"fontSize": self.tam["sub"] if self.tam else "9pt",
                                                                "color": c2, "fontFamily": f}}]}]
        self._add("textbox", x, y, w, h, objetos={"general": [{"properties": {"paragraphs": par}}]}, sem_caixa=True)

    def logo(self, x, y, w, h, item):
        self._add("image", x, y, w, h, sem_caixa=True, objetos={
            "general": [{"properties": {"imageUrl": {"expr": {"ResourcePackageItem": {
                "PackageName": "RegisteredResources", "PackageType": 1, "ItemName": item}}}}}],
            "imageScaling": [{"properties": {"imageScalingType": lit("Fit")}}]})

    def kpi(self, x, y, w, h, campo: Campo, cor_valor: str | None = None, tamanho: int | None = None,
            tamanho_rotulo: int | None = None):
        campo = para_cartao(campo)
        objetos = {}
        rotulo = {}
        e = self.estilo
        if cor_valor or e:
            rotulo["color"] = cor(cor_valor or e["numero"])
        if tamanho or self.tam:
            rotulo["fontSize"] = lit(tamanho or self.tam["kpi"])
        categoria = {}
        if e:
            rotulo["fontFamily"] = lit(e["fonte"])
            categoria.update({"color": cor(e["texto"]), "fontFamily": lit(e["fonte"])})
        if tamanho_rotulo or self.tam:
            categoria["fontSize"] = lit(tamanho_rotulo or self.tam["kpi_rotulo"])
        if categoria:
            objetos["categoryLabels"] = [{"properties": categoria}]
        if rotulo:
            objetos["labels"] = [{"properties": rotulo}]
        self._add("card", x, y, w, h, query={"queryState": {"Values": {"projections": [campo.proj()]}}},
                  objetos=objetos or None)

    def nota(self, x, y, w, h, campo: Campo):
        """Texto pequeno vindo de medida (data de atualizacao)."""
        self._add("card", x, y, w, h, query={"queryState": {"Values": {"projections": [campo.proj()]}}}, sem_caixa=True,
                  objetos={"labels": [{"properties": {"fontSize": lit(self.tam["nota"] if self.tam else 9),
                                                      "color": cor(self.estilo["texto"] if self.estilo else COR["tinta2"]),
                                                      "fontFamily": lit(self.estilo["fonte"] if self.estilo else "Segoe UI")}}],
                           "categoryLabels": [{"properties": {"show": lit(False)}}]})

    def barras(self, x, y, w, h, categoria: Campo, valor: Campo, titulo: str, ordem: str = "valor",
               cor_unica: str | None = None, cores: dict | None = None, filtros=None, margem: int = 45):
        q = {"queryState": {"Category": {"projections": [categoria.proj(ativo=True)]},
                            "Y": {"projections": [valor.proj()]}}}
        q["sortDefinition"] = {"sort": [{"field": categoria.expr() if ordem == "categoria" else valor.expr(),
                                         "direction": "Ascending" if ordem == "categoria" else "Descending"}],
                               "isDefaultSort": False}
        pontos = []
        if cor_unica:
            pontos.append({"properties": {"fill": cor(cor_unica)}})
        for valor_cat, hexa in (cores or {}).items():
            pontos.append({"properties": {"fill": cor(hexa)}, "selector": {"data": [{"scopeId": {"Comparison": {
                "ComparisonKind": 0, "Left": categoria.expr(),
                "Right": {"Literal": {"Value": "'" + valor_cat.replace("'", "''") + "'"}}}}}]}})
        objetos = {"valueAxis": [{"properties": {"show": lit(False), "showAxisTitle": lit(False)}}],
                   "categoryAxis": [{"properties": {"showAxisTitle": lit(False), "maxMarginFactor": lit(margem)}}]}
        if self.estilo:
            e = self.estilo
            objetos["categoryAxis"][0]["properties"].update({"labelColor": cor(e["texto"]), "fontFamily": lit(e["fonte"])})
            objetos["labels"] = [{"properties": {"show": lit(True), "color": cor(e["texto"]), "fontFamily": lit(e["fonte"])}}]
        if self.tam:
            objetos["categoryAxis"][0]["properties"]["fontSize"] = lit(self.tam["eixo"])
            objetos.setdefault("labels", [{"properties": {"show": lit(True)}}])[0]["properties"]["fontSize"] = \
                lit(self.tam["rotulo"])
        if pontos:
            objetos["dataPoint"] = pontos
        self._add("clusteredBarChart", x, y, w, h, query=q, titulo=titulo, filtros=filtros, objetos=objetos)

    def tabela(self, x, y, w, h, campos: list[Campo], titulo: str, filtros=None, ordenar: Campo | None = None,
               crescente: bool = False, pesos: list[float] | None = None, total: bool = False, compacta: bool = False):
        """pesos = largura relativa de cada coluna (Power BI nao estica coluna sozinho)."""
        nomes = [c.rotulo or c.p for c in campos]
        repetidos = {n for n in nomes if nomes.count(n) > 1}
        if repetidos:   # o Power BI recusa a consulta ("identical native reference name")
            raise ValueError(f"tabela '{titulo}' com coluna repetida: {sorted(repetidos)}")
        q = {"queryState": {"Values": {"projections": [c.proj() for c in campos]}}}
        if ordenar:
            q["sortDefinition"] = {"sort": [{"field": ordenar.expr(), "direction": "Ascending" if crescente else "Descending"}]}
        pesos = pesos or [1] * len(campos)
        util = (w - 28 - 22) * 1.0          # padding + barra de rolagem
        larguras = [{"properties": {"value": lit(round(util * pz / sum(pesos)))},
                     "selector": {"metadata": f"{c.t}.{c.p}"}} for c, pz in zip(campos, pesos)]
        objetos = {"columnWidth": larguras, "total": [{"properties": {"totals": lit(total)}}],
                   "values": [{"properties": {"wordWrap": lit(not compacta)}}]}
        if compacta:   # cabe sem rolagem: linha baixa, cabecalho numa linha so
            objetos["grid"] = [{"properties": {"rowPadding": lit(1)}}]
            objetos["columnHeaders"] = [{"properties": {"wordWrap": lit(False)}}]
        if self.estilo:
            e = self.estilo
            objetos.setdefault("columnHeaders", [{"properties": {}}])[0]["properties"].update(
                {"fontColor": cor(e["titulo"]), "fontFamily": lit(e["fonte"]), "bold": lit(True)})
            objetos["total"][0]["properties"].update({"fontColor": cor(e["titulo"]), "fontFamily": lit(e["fonte"])})
        if self.tam:
            tam = lit(self.tam["tabela"])
            objetos["values"][0]["properties"]["fontSize"] = tam
            objetos.setdefault("columnHeaders", [{"properties": {}}])[0]["properties"]["fontSize"] = tam
            objetos["total"][0]["properties"]["fontSize"] = tam
        self._add("tableEx", x, y, w, h, query=q, titulo=titulo, filtros=filtros, objetos=objetos)

    def segmentacao(self, x, y, w, h, campo: Campo, titulo: str, grupo: str | None = None):
        """Filtro em lista suspensa; sem a opcao "(Em branco)" (vem do relacionamento sem par)."""
        extra = {"syncGroup": {"groupName": grupo, "fieldChanges": True, "filterChanges": True}} if grupo else None
        self._add("slicer", x, y, w, h, query={"queryState": {"Values": {"projections": [campo.proj(ativo=True)]}}},
                  objetos={"data": [{"properties": {"mode": lit("Dropdown")}}],
                           **({"items": [{"properties": {"textSize": lit(self.tam["filtro_item"])}}]} if self.tam else {}),
                           "header": [{"properties": {"text": lit(titulo.upper() if self.estilo else titulo),
                                                      **({"textSize": lit(self.tam["filtro_cab"])} if self.tam else {}),
                                                      **({"fontColor": cor(self.estilo["titulo"]),
                                                          "fontFamily": lit(self.estilo["fonte"])} if self.estilo else {})}}]},
                  extra=extra, filtros=[NAO_VAZIO(campo)])


def cabecalho(pg: Pagina, titulo: str, subtitulo: str, itaipu: bool = False) -> None:
    x = MARGEM
    if itaipu:
        pg.logo(MARGEM, 18, 104, 44, LOGO_IB)
        x += 116
    pg.titulo(x, 4, 640 - x, 62, titulo, subtitulo)
    pg.nota(x - 6, 64, 128, 28, M("Atualizado em"))
    pg.segmentacao(680, 14, 236, 64, Campo("Listas", "Especificacao Tecnica"), "Especificação técnica", "ET")
    pg.segmentacao(928, 14, 236, 64, Campo("Listas", "Capitulo"), "Capítulo", "Capitulo")
    pg.logo(1176, 16, 80, 60, LOGO_CMI)


def linha_kpis(pg: Pagina, y: int, itens: list[tuple[Campo, str | None]], h: int = 92) -> None:
    n = len(itens)
    w = (W - 2 * MARGEM - (n - 1) * VAO) / n
    for i, (campo, c) in enumerate(itens):
        pg.kpi(MARGEM + i * (w + VAO), y, w, h, campo, c)


ATRASADO = lambda: filtro(Campo("Itens", "Situacao Autorizacao"), ["ATRASADO ITAIPU"])  # noqa: E731
COM_PENDENCIA = lambda: filtro(Campo("Itens", "Pendencia"), ["—"], negar=True)  # noqa: E731
NOME_LISTA = lambda: Campo("Listas", "Nome", rotulo="Lista")  # noqa: E731


def filtro_medida_positiva(campo: Campo) -> dict:
    """Filtro de visual 'medida > 0' (ex.: so as listas sem lista de precos)."""
    return {"name": uuid.uuid4().hex[:20], "field": campo.expr(), "type": "Advanced",
            "filter": {"Version": 2, "From": [{"Name": "m", "Entity": campo.t, "Type": 0}],
                       "Where": [{"Condition": {"Comparison": {
                           "ComparisonKind": 1,
                           "Left": {"Measure": {"Expression": {"SourceRef": {"Source": "m"}}, "Property": campo.p}},
                           "Right": {"Literal": {"Value": "0L"}}}}}]}}


COR_ACONEX = {"Aprovado": COR["verde"], "Aprovado com comentários": "#78CFA9", "Para assinatura": COR["azul"],
              "Em processo": COR["ambar"], "Informativo": COR["azul_claro"], "Não aprovado": COR["vermelho"],
              "Cancelado (Void)": COR["cinza"], "Em elaboração (CMI)": COR["laranja"], "Não emitido": "#C9C7C0",
              "Sem lista": "#C9C7C0", "Sem lista de preços": "#C9C7C0", "Fora da mapeadora": COR["cinza"],
              "Sem informação": COR["cinza"]}


def NAO_VAZIO(campo: Campo) -> dict:
    """Filtro de visual 'campo nao e (Vazio)' (tira a linha em branco do relacionamento sem par)."""
    return filtro(campo, [None], negar=True)


COR_COM_QUEM = {"CMI": COR["azul"], "Fornecedor": COR["laranja"], "Itaipu": COR["ambar"], "Concluída": COR["verde"],
                "Sem status": COR["cinza"]}


def relatorio_interno() -> list[Pagina]:
    p1 = Pagina("Visão geral")
    cabecalho(p1, "Sobressalentes — visão geral", "Fichas técnicas no PMIB, contadas item a item nos _STATUS_PMIB")
    linha_kpis(p1, 100, [(M("Fichas", "Fichas técnicas"), None),
                         (M("Enviadas a Itaipu (texto)", "Enviadas a Itaipu"), None),
                         (M("Aprovadas (texto)", "Aprovadas por Itaipu"), COR["verde"]),
                         (M("Autorizações Atrasadas Itaipu", "Autorizações atrasadas"), COR["vermelho"]),
                         (M("Itens Físicos Entregues", "Material entregue"), None),
                         (M("Pendências CMI", "Com pendência do CMI"), COR["laranja"])])
    p1.barras(MARGEM, 208, 608, 262, Campo("Itens", "Etapa"), M("Fichas"), "Em que etapa estão as fichas",
              ordem="categoria", cor_unica=COR["azul"], margem=30)
    p1.barras(648, 208, 608, 262, Campo("Itens", "Com Quem"), M("Fichas"), "Com quem estão", cores=COR_COM_QUEM, margem=25)
    p1.tabela(MARGEM, 486, 1232, 210, [Campo("Listas", "Especificacao Tecnica", rotulo="Especificação técnica"),
                                       M("Fichas"), M("Fichas Emitidas", "Enviadas"), M("Fichas em Análise IB", "Em análise"),
                                       M("Fichas Aprovadas", "Aprovadas"), M("% Aprovadas", "% aprovadas"),
                                       M("Itens Físicos Entregues", "Entregues"),
                                       M("Autorizações Atrasadas Itaipu", "Autorização atrasada"),
                                       M("Pendências CMI", "Com pendência do CMI")],
              "Por especificação técnica", ordenar=M("Fichas"), pesos=[3, 1, 1, 1, 1, 1, 1, 1.3, 1.4], total=True)

    p2 = Pagina("Listas de sobressalentes")
    cabecalho(p2, "Listas de sobressalentes",
              "Situação da última revisão no Aconex (EN.DT) e a lista de preços de cada lista (SM.DT)")
    linha_kpis(p2, 100, [(L("Listas Cadastradas", "Listas de sobressalentes"), None),
                         (L("Listas Aprovadas EN.DT", "Aprovadas (Status Real)"), COR["verde"]),
                         (L("Listas Para Assinatura", "Para assinatura"), COR["azul"]),
                         (L("Listas Não Aprovadas", "Não aprovadas — reemitir"), COR["vermelho"]),
                         (L("Listas Não Emitidas", "Não emitidas"), COR["cinza"]),
                         (L("Listas com Revisão Desatualizada", "Revisão desatualizada"), COR["laranja"])])
    p2.barras(MARGEM, 208, 608, 232, Campo("Listas", "Situacao Lista", rotulo="Situação"), L("Listas"),
              "Última revisão no Aconex", ordem="categoria", cores=COR_ACONEX, margem=40)
    p2.barras(648, 208, 608, 232, Campo("Listas", "Situacao Lista de Precos", rotulo="Situação"), L("Listas"),
              "Lista de preços de cada lista", ordem="categoria", cores=COR_ACONEX, margem=40)
    p2.tabela(MARGEM, 456, 1232, 240, [NOME_LISTA(), Campo("Listas", "Ultima Revisao", rotulo="Rev."),
                                       Campo("Listas", "Situacao Lista", rotulo="Aconex"),
                                       Campo("Listas", "Lista de Precos Atual", rotulo="Lista de preços"),
                                       Campo("Listas", "Revisao Lista de Precos", rotulo="Rev. (preços)"),
                                       Campo("Listas", "Situacao Lista de Precos", rotulo="Aconex (preços)"),
                                       L("Fichas na Lista", "Fichas"), M("% Aprovadas", "% fichas aprovadas"),
                                       Campo("Listas", "Responsavel", rotulo="Responsável")],
              "Cada lista e a sua lista de preços", ordenar=Campo("Listas", "Situacao Lista"), crescente=True,
              pesos=[3.2, 0.45, 1.5, 2.8, 0.85, 1.5, 0.6, 0.9, 1.5], filtros=[NAO_VAZIO(Campo("Listas", "Lista"))])

    p3 = Pagina("Listas de preços")
    cabecalho(p3, "Listas de preços", "Cada lista de preços no Aconex (aba Lista de preços Follow-up) e as PB021 já na pasta")
    linha_kpis(p3, 100, [(PR("Listas de Preços Emitidas", "Emitidas no Aconex"), None),
                         (PR("Listas de Preços Aprovadas SM.DT", "Aprovadas pela SM.DT"), COR["verde"]),
                         (PR("Listas de Preços Aguardando SM.DT", "Aguardando a SM.DT"), COR["ambar"]),
                         (PR("Listas de Preços Não Aprovadas", "Não aprovadas"), COR["vermelho"]),
                         (PR("Listas de Preços em Elaboração", "Em elaboração (CMI)"), COR["laranja"]),
                         (L("Listas sem Lista de Preços", "Com fichas e sem preços"), COR["cinza"])])
    p3.barras(MARGEM, 208, 440, 252, Campo("PrecosAconex", "Situacao Aconex", rotulo="Situação"),
              PR("Listas de Preços", "Listas de preços"), "Situação no Aconex", ordem="categoria", cores=COR_ACONEX,
              margem=45)
    p3.tabela(MARGEM, 476, 440, 220, [NOME_LISTA(), M("Fichas")], "Listas com fichas e sem lista de preços",
              filtros=[filtro_medida_positiva(L("Listas sem Lista de Preços"))], ordenar=M("Fichas"), pesos=[4, 1])
    p3.tabela(480, 208, 776, 488, [Campo("Listas", "Nome", rotulo="Lista de sobressalentes"),
                                   Campo("PrecosAconex", "Lista de Precos", rotulo="Lista de preços"),
                                   Campo("PrecosAconex", "Revisao", rotulo="Rev."),
                                   Campo("PrecosAconex", "Situacao Aconex", rotulo="Situação"),
                                   Campo("PrecosAconex", "Data Aconex", rotulo="Data"),
                                   Campo("PrecosAconex", "Geracao", rotulo="Código")],
              "Listas de preços", ordenar=Campo("PrecosAconex", "Situacao Aconex"), crescente=True,
              pesos=[2.4, 2.7, 0.45, 1.5, 1.15, 1.45])

    p4 = Pagina("Autorização e entrega")
    cabecalho(p4, "Autorização de entrega e material",
              "Prazo de Itaipu: 15 dias úteis do e-mail de intenção · só FÍSICA E DOCUMENTAL precisa")
    linha_kpis(p4, 100, [(M("Pedidos de Autorização Pendentes", "Pedidos pendentes"), None),
                         (M("Aguardando Itaipu no Prazo", "Dentro do prazo"), COR["ambar"]),
                         (M("Autorizações Atrasadas Itaipu", "Além de 15 dias úteis"), COR["vermelho"]),
                         (M("Maior Atraso Itaipu (dias)", "Maior atraso (dias)"), COR["vermelho"]),
                         (M("Aptas Aguardando Entrega", "Autorizadas, a entregar"), COR["azul"]),
                         (M("Itens Físicos Entregues", "Material entregue"), COR["verde"])])
    p4.barras(MARGEM, 208, 500, 488, NOME_LISTA(), M("Autorizações Atrasadas Itaipu", "Atrasadas"),
              "Autorizações atrasadas por lista", cor_unica=COR["vermelho"], margem=60)
    p4.tabela(540, 208, 716, 488, [NOME_LISTA(), Campo("Itens", "PMIB"), Campo("Itens", "DESCRICAO", rotulo="Descrição"),
                                   Campo("Itens", "Data Email", rotulo="Pedido em"),
                                   Campo("Itens", "Dias de Atraso", rotulo="Dias de atraso")],
              "Pauta da cobrança — além de 15 dias úteis", filtros=[ATRASADO()], ordenar=Campo("Itens", "Dias de Atraso"),
              pesos=[2.2, 1.3, 3, 1, 0.8])

    p5 = Pagina("Fila de trabalho")
    cabecalho(p5, "Fila de trabalho do CMI", "A primeira coisa que falta para cada ficha andar")
    p5.segmentacao(MARGEM, 100, 300, 84, Campo("Itens", "Pendencia"), "Pendência")
    p5.segmentacao(340, 100, 300, 84, Campo("Itens", "PROCUREMENT"), "Procurement")
    p5.segmentacao(656, 100, 300, 84, Campo("Itens", "Area"), "Área")
    p5.kpi(972, 100, 284, 84, M("Pendências CMI", "Fichas com pendência"), COR["laranja"])
    p5.barras(MARGEM, 200, 400, 496, Campo("Itens", "Pendencia", rotulo="Pendência"), M("Fichas"), "Pendências por tipo",
              cor_unica=COR["laranja"], filtros=[COM_PENDENCIA()], margem=50)
    p5.tabela(440, 200, 816, 496, [Campo("Itens", "Pendencia", rotulo="Pendência"), NOME_LISTA(), Campo("Itens", "PMIB"),
                                   Campo("Itens", "DESCRICAO", rotulo="Descrição"),
                                   Campo("Itens", "PROCUREMENT", rotulo="Procurement"),
                                   Campo("Itens", "Dias de Atraso", rotulo="Dias de atraso")],
              "Fichas com pendência", filtros=[COM_PENDENCIA()], ordenar=Campo("Itens", "Dias de Atraso"),
              pesos=[1.8, 2, 1.4, 2.8, 1.1, 0.7])
    return [p1, p2, p3, p4, p5]


def relatorio_itaipu() -> list[Pagina]:
    p0 = slide_itaipu()
    p0c = slide_itaipu(classico=True)
    p1 = Pagina("Panorama")
    cabecalho(p1, "Sobressalentes — panorama", "Fichas técnicas no PMIB e entregas · contrato 4500063671", itaipu=True)
    linha_kpis(p1, 100, [(M("Fichas", "Fichas técnicas"), None), (M("Fichas Emitidas", "Enviadas a Itaipu"), None),
                         (M("Fichas em Análise IB", "Em análise por Itaipu"), None),
                         (M("Fichas Aprovadas", "Aprovadas"), COR["verde"]),
                         (M("Itens Físicos Entregues", "Material entregue"), COR["verde"]),
                         (M("Pedidos de Autorização Pendentes", "Autorizações pendentes"), COR["ambar"])])
    p1.barras(MARGEM, 208, 440, 236, Campo("Itens", "Etapa Cliente", rotulo="Etapa"), M("Fichas"), "Fichas por etapa",
              ordem="categoria", cores={"Em preparação (CMI)": COR["azul_claro"], "Em análise Itaipu": COR["azul"],
                                        "Aprovada": COR["azul_escuro"]}, margem=35)
    p1.barras(MARGEM, 460, 440, 236, Campo("Listas", "Especificacao Tecnica", rotulo="Especificação técnica"), M("Fichas"),
              "Fichas por especificação técnica", cor_unica=COR["azul"], margem=55)
    p1.tabela(480, 208, 776, 488, [NOME_LISTA(), M("Fichas"), M("Fichas Emitidas", "Enviadas"),
                                   M("Fichas em Análise IB", "Em análise"), M("Fichas Aprovadas", "Aprovadas"),
                                   M("Itens Físicos Entregues", "Entregues")],
              "Por lista de sobressalentes", ordenar=M("Fichas"), pesos=[4, 1, 1, 1, 1, 1], total=True)

    p2 = Pagina("Pendências")
    cabecalho(p2, "Sobressalentes — pendências", "O que aguarda decisão de Itaipu", itaipu=True)
    linha_kpis(p2, 100, [(M("Pedidos de Autorização Pendentes", "Autorizações de entrega pendentes"), COR["ambar"]),
                         (M("Autorizações Atrasadas Itaipu", "Além de 15 dias úteis"), COR["vermelho"]),
                         (PR("Listas de Preços Aguardando SM.DT", "Listas de preços aguardando a SM.DT"), COR["ambar"])])
    p2.tabela(MARGEM, 208, 760, 488, [NOME_LISTA(), Campo("Itens", "PMIB"), Campo("Itens", "DESCRICAO", rotulo="Descrição"),
                                      Campo("Itens", "Data Email", rotulo="Pedido em"),
                                      Campo("Itens", "Dias de Atraso", rotulo="Dias além do prazo")],
              "Pedidos de autorização de entrega além de 15 dias úteis", filtros=[ATRASADO()],
              ordenar=Campo("Itens", "Dias de Atraso"), pesos=[2.2, 1.3, 3, 1, 0.9])
    p2.tabela(800, 208, 456, 488, [Campo("PrecosAconex", "Lista de Precos", rotulo="Lista de preços"),
                                   Campo("PrecosAconex", "Revisao", rotulo="Rev."),
                                   Campo("PrecosAconex", "Data Aconex", rotulo="Emitida em")],
              "Listas de preços aguardando a SM.DT",
              filtros=[filtro(Campo("PrecosAconex", "Situacao Preco"), ["EMITIDA"])], pesos=[3, 0.6, 1.1])
    return [p0, p0c, p1, p2]


def slide_itaipu(classico: bool = False) -> Pagina:
    """Uma pagina que cabe num slide 16:9 para Itaipu: listas, listas de precos, fichas e entrega, sem rolagem
    (tudo agregado; a tabela e por especificacao tecnica). Filtros de ET e Capitulo pequenos no topo (sincronizados
    com as outras paginas) e o filtro de pagina "sem a SEM_LISTA" ja aplicado (pode ser tirado no painel Filtros).
    classico=True: a mesma pagina com o visual do painel antigo (fundo branco, bordas azuis)."""
    sem_lista = filtro(Campo("Listas", "Lista"), ["SEM_LISTA"], negar=True)
    pg = Pagina("Resumo (1 slide, clássico)" if classico else "Resumo (1 slide)",
                estilo=CLASSICO if classico else None, filtros=[sem_lista], grande=True)
    ca = COR_ACONEX_CLASSICO if classico else COR_ACONEX
    verde, azul, ambar, vermelho = (("#08A64A", "#2C8BF6", "#F5A31A", "#F42B3B") if classico
                                    else (COR["verde"], COR["azul"], COR["ambar"], COR["vermelho"]))
    etapas = ({"Em preparação (CMI)": "#8CC2FA", "Em análise Itaipu": "#2C8BF6", "Aprovada": "#08A64A"} if classico
              else {"Em preparação (CMI)": COR["azul_claro"], "Em análise Itaipu": COR["azul"], "Aprovada": COR["verde"]})
    pg.logo(MARGEM, 14, 110, 48, LOGO_IB)
    pg.titulo(150, 4, 580, 56, "Sobressalentes - situação geral",   # hífen: ajuste do Luan em 15/10
              "Atualização Tecnológica de Itaipu · contrato 4500063671")
    pg.nota(144, 60, 150, 24, M("Atualizado em"))
    pg.segmentacao(744, 10, 206, 60, Campo("Listas", "Especificacao Tecnica"),
                   "Espec. técnica" if classico else "Especificação técnica", "ET")
    pg.segmentacao(958, 10, 206, 60, Campo("Listas", "Capitulo"), "Capítulo", "Capitulo")
    pg.logo(1176, 12, 80, 60, LOGO_CMI)
    cadastro = lambda: filtro(Campo("Listas", "Origem Cadastro"), ["MAPEADORA"])  # noqa: E731
    w3 = (W - 2 * MARGEM - 2 * VAO) / 3
    xs = [MARGEM + i * (w3 + VAO) for i in range(3)]
    pg.kpi(xs[0], 90, w3, 82, L("Listas Aprovadas (texto)", "Listas de sobressalentes aprovadas (EN.DT)"), verde)
    pg.barras(xs[0], 180, w3, 254, Campo("Listas", "Situacao Lista", rotulo="Situação"), L("Listas"),
              "Última revisão no Aconex", ordem="categoria", cores=ca, margem=48, filtros=[cadastro()])
    pg.kpi(xs[1], 90, w3, 82, L("Listas com Lista de Preços no Aconex (texto)", "Listas com lista de preços no Aconex (SM.DT)"),
           azul)
    pg.barras(xs[1], 180, w3, 254, Campo("Listas", "Situacao Lista de Precos", rotulo="Situação"), L("Listas"),
              "Lista de preços de cada lista", ordem="categoria", cores=ca, margem=48, filtros=[cadastro()])
    pg.kpi(xs[2], 90, w3, 82, M("Enviadas a Itaipu (texto)", "Fichas técnicas enviadas a Itaipu"), None)
    pg.barras(xs[2], 180, w3, 254, Campo("Itens", "Etapa Cliente", rotulo="Etapa"), M("Fichas"),
              "Fichas técnicas no PMIB", ordem="categoria", margem=40, cores=etapas)
    hk = (696 - 446 - 2 * 8) / 3
    for i, (campo, c) in enumerate([(M("Itens Físicos Entregues", "Itens físicos entregues"), verde),
                                    (M("Pedidos de Autorização Pendentes", "Autorizações de entrega pendentes"), ambar),
                                    (M("Autorizações Atrasadas Itaipu", "Além de 15 dias úteis"), vermelho)]):
        pg.kpi(MARGEM, 446 + i * (hk + 8), 300, hk, campo, c, tamanho=22, tamanho_rotulo=11)
    pg.tabela(MARGEM + 316, 446, W - 2 * MARGEM - 316, 250,
              [Campo("Listas", "Especificacao Tecnica", rotulo="Especificação técnica"),
               L("Listas Cadastradas", "Listas"), L("Listas Aprovadas EN.DT", "Aprovadas"),
               L("Listas com Lista de Preços no Aconex", "Com preços"), M("Fichas"),
               M("Fichas Emitidas", "Enviadas"), M("Fichas Aprovadas", "Fichas aprov."),
               M("Itens Físicos Entregues", "Entregues")],
              "Por especificação técnica", ordenar=M("Fichas"), total=True, compacta=True,
              pesos=[3.6, 0.8, 1.1, 1.1, 0.8, 1, 1.2, 1], filtros=[NAO_VAZIO(Campo("Listas", "Especificacao Tecnica"))])
    return pg


def escrever_relatorio(raiz: pathlib.Path, paginas: list[Pagina], exibicao: str, modelo: str) -> None:
    d = raiz / "definition"
    (d / "pages").mkdir(parents=True)
    (raiz / "definition.pbir").write_text(json.dumps({
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/1.0.0/schema.json",
        "version": "4.0", "datasetReference": {"byPath": {"path": f"../{modelo}.SemanticModel"}}}, indent=2), encoding="utf-8")
    (raiz / ".platform").write_text(json.dumps({
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
        "metadata": {"type": "Report", "displayName": exibicao}, "config": {"version": "2.0", "logicalId": str(uuid.uuid4())}},
        indent=2), encoding="utf-8")
    shutil.copy2(RECURSOS / "version.json", d / "version.json")
    rep = json.loads((RECURSOS / "report.json").read_text(encoding="utf-8"))
    rep["themeCollection"]["customTheme"] = {"name": "SobressalentesV2.json",
                                             "reportVersionAtImport": rep["themeCollection"]["baseTheme"]["reportVersionAtImport"],
                                             "type": "RegisteredResources"}
    for pac in rep["resourcePackages"]:
        if pac["name"] == "RegisteredResources":
            pac["items"] = [i for i in pac["items"] if i["type"] != "CustomTheme"] + [
                {"name": "SobressalentesV2.json", "path": "SobressalentesV2.json", "type": "CustomTheme"}]
    rep.setdefault("objects", {}).pop("outspacePane", None)
    (d / "report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
    st = raiz / "StaticResources"
    (st / "SharedResources" / "BaseThemes").mkdir(parents=True)
    (st / "RegisteredResources").mkdir(parents=True)
    shutil.copy2(RECURSOS / "CY24SU10.json", st / "SharedResources" / "BaseThemes" / "CY24SU10.json")
    for logo in (LOGO_CMI, LOGO_IB):
        shutil.copy2(RECURSOS / logo, st / "RegisteredResources" / logo)
    (st / "RegisteredResources" / "SobressalentesV2.json").write_text(json.dumps(tema(), ensure_ascii=False, indent=2),
                                                                      encoding="utf-8")
    (d / "pages" / "pages.json").write_text(json.dumps({
        "$schema": f"{SCH}/pagesMetadata/1.1.0/schema.json", "pageOrder": [p.id for p in paginas],
        "activePageName": paginas[0].id}, indent=2), encoding="utf-8")
    for pg in paginas:
        pd = d / "pages" / pg.id
        (pd / "visuals").mkdir(parents=True)
        pagina = {"$schema": f"{SCH}/page/2.1.0/schema.json", "name": pg.id, "displayName": pg.nome,
                  "displayOption": "FitToPage", "height": H, "width": W}
        if pg.estilo:
            fundo = [{"properties": {"color": cor(pg.estilo["fundo"]), "transparency": lit(0)}}]
            pagina["objects"] = {"background": fundo, "outspace": fundo}
        if pg.filtros:
            pagina["filterConfig"] = {"filters": pg.filtros}
        (pd / "page.json").write_text(json.dumps(pagina, ensure_ascii=False, indent=2), encoding="utf-8")
        for v in pg.visuais:
            (pd / "visuals" / v["name"]).mkdir()
            (pd / "visuals" / v["name"] / "visual.json").write_text(json.dumps(v, ensure_ascii=False, indent=2),
                                                                     encoding="utf-8")

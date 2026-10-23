"""Grava as saídas da Fase 1 em .xlsx a partir do template (papel do Convert to File).

Entrada: motor/saida/linhas_*.json (gerados por teste_fase1.js) e motor/dados/app_*.json.
Saída:   motor/saida/APLICAÇÃO LMR v1.4 - {sistema}.xlsx  (uma por exemplo)
         motor/saida/Fase1_Resumo.xlsx

Uso: python -X utf8 escreve_xlsx.py
"""
import collections
import json
import os

import openpyxl
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

MOTOR = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(MOTOR)
SAIDA = os.path.join(MOTOR, "saida")
TEMPLATE = os.path.join(RAIZ, "Templates", "Template_Aplicação_LMR.xlsx")

NOMES = {
    "agua_pura": "Água Pura",
    "aeracao": "Aeração Axial da Turbina",
    "ccar": "RV Parte Digital TGC e CCAR",
    "regvel": "Reg. Vel. e Pot. Hidráulica",
    "sfc": "SFC HF-01 e HF-02",
}
NEGRITO = Font(bold=True)
CAB = PatternFill("solid", fgColor="D9E1F2")
BLOQ = PatternFill("solid", fgColor="F8CBAD")
AVISO = PatternFill("solid", fgColor="FFE699")


def ler(caminho):
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def aba_tabela(wb, titulo, cabecalho, linhas, larguras=None):
    ws = wb.create_sheet(titulo)
    ws.append(cabecalho)
    for c in ws[1]:
        c.font, c.fill = NEGRITO, CAB
    for r in linhas:
        ws.append(r)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for i, w in enumerate(larguras or [], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    return ws


def docs_antigos(app):
    """DOCS DE REFERÊNCIA da aplicação emitida → cabeçalho e {PMIB: (doc principal, qtd, obs)}."""
    rows = app["abas"].get("DOCS DE REFERÊNCIA", [])
    topo, por_pmib = {}, {}
    hi = next((i for i, r in enumerate(rows) if r and str(r[0] or "").strip() == "CÓDIGO PMIB"), None)
    for r in rows[: hi or 0]:
        if r and r[0]:
            topo[str(r[0]).strip().rstrip(":").upper()] = next((str(c) for c in r[1:] if c), "")
    for r in rows[(hi or 0) + 1:]:
        if r and r[0]:
            p = str(r[0]).strip().lstrip("'")
            por_pmib.setdefault(p, (r[3] if len(r) > 3 else None, r[4] if len(r) > 4 else None,
                                    r[5] if len(r) > 5 else None))
    return topo, por_pmib


def grava_aplicacao(nome, dados, app):
    wb = openpyxl.load_workbook(TEMPLATE)
    linhas = dados["linhas"]

    # APLICAÇÃO - LMR: FICHA_PMIB, CÓDIGO_LMR, TAG_LMR (coluna Status sai — decisão 17)
    ws = wb["APLICAÇÃO - LMR"]
    ws["D1"] = None
    for i, l in enumerate(linhas, start=2):
        ws.cell(i, 1, l["pmib"])
        ws.cell(i, 2, l["codigo"])
        ws.cell(i, 3, l["tag"])
        if l["bloqueia"]:
            for c in range(1, 4):
                ws.cell(i, c).fill = BLOQ
    ws.column_dimensions["B"].width = 110
    ws.column_dimensions["C"].width = 90

    # DOCS DE REFERÊNCIA: uma linha por PMIB do catálogo (§4.3)
    topo, antigos = docs_antigos(app)
    ws = wb["DOCS DE REFERÊNCIA"]
    cat = dados["catalogo"]
    ws["C2"] = cat[0]["lista"] if cat else None
    ws["C3"] = topo.get("ESPECIFICAÇÃO TÉCNICA / CAPÍTULO")
    ws["C4"] = topo.get("SUBSISTEMA")
    tags = collections.defaultdict(set)
    for l in linhas:
        partes = l["tag"].split(" - ")
        if len(partes) > 2 and partes[1] and any(ch.isdigit() for ch in partes[1]):
            tags[l["pmib"]].add(partes[1])
    for i, c in enumerate(cat, start=7):
        doc, qtd, obs = antigos.get(c["pmib"], (None, None, None))
        ws.cell(i, 1, c["pmib"])
        ws.cell(i, 2, c["codigoMaterial"])
        ws.cell(i, 3, c["descricao"])
        ws.cell(i, 4, doc)
        ws.cell(i, 5, qtd)
        ws.cell(i, 6, ", ".join(sorted(tags.get(c["pmib"], []))) or None)
        ws.cell(i, 7, obs if obs else ("documento principal não encontrado" if not doc else None))
        if not doc:
            ws.cell(i, 4).fill = AVISO
    # DESCRIÇÃO DOCUMENTOS: sem alteração (decisão 25)

    # VALIDAÇÃO
    val = []
    for i, l in enumerate(linhas, start=2):
        for v in filter(None, l["validacao"].split(" | ")):
            regra, _, msg = v.partition(" ")
            val.append([i, l["pmib"], regra, "bloqueia" if l["bloqueia"] and regra in ("V1", "V2", "V4", "V5", "V6", "V14", "V15") else "aviso", msg])
    for g in dados["gerais"]:
        val.append([None, g["pmib"], g["regra"], g["severidade"], g["msg"]])
    ws = aba_tabela(wb, "VALIDAÇÃO", ["LINHA", "PMIB", "REGRA", "SEVERIDADE", "MENSAGEM"], val, [8, 18, 8, 11, 100])
    for r in ws.iter_rows(min_row=2):
        r[3].fill = BLOQ if r[3].value == "bloqueia" else AVISO

    # DIFERENÇAS: estilo antigo × padrão v1.4
    dif = [[i, l["pmib"], l["antigoCodigo"], l["codigo"], l["antigoTag"], l["tag"], l["mudancas"]]
           for i, l in enumerate(linhas, start=2)]
    aba_tabela(wb, "DIFERENÇAS", ["LINHA", "PMIB", "CÓDIGO_LMR ANTIGO", "CÓDIGO_LMR v1.4", "TAG_LMR ANTIGA", "TAG_LMR v1.4", "O QUE MUDOU"],
               dif, [8, 18, 70, 70, 60, 60, 60])

    # RELAÇÕES documentais lidas do Status (Base, §5.2)
    rel = [[r["pmibPai"], r["pmibFilho"], r["categoria"], r["secao"], r["itemNoStatus"], r["fonte"]] for r in dados["relacoes"]]
    if rel:
        aba_tabela(wb, "RELAÇÕES", ["PMIB PAI", "PMIB FILHO", "CATEGORIA", "SEÇÃO", "ITEM NO STATUS", "FONTE"], rel, [18, 18, 12, 22, 12, 14])

    destino = os.path.join(SAIDA, f"APLICAÇÃO LMR v1.4 - {NOMES[nome]}.xlsx")
    wb.save(destino)
    return destino, len(linhas), sum(l["bloqueia"] for l in linhas), len(val)


def main():
    res = ler(os.path.join(SAIDA, "fase1_resultado.json"))
    resumo = []
    for nome in NOMES:
        dados = ler(os.path.join(SAIDA, f"linhas_{nome}.json"))
        app = ler(os.path.join(MOTOR, "dados", f"app_{nome}.json"))
        destino, n, bloq, nval = grava_aplicacao(nome, dados, app)
        print("ok", os.path.basename(destino), n, "linhas,", bloq, "bloqueadas")
        resumo.append((nome, n, bloq, nval))

    wb = openpyxl.Workbook()
    for ws in list(wb.worksheets):
        wb.remove(ws)
    linhas = []
    for nome, n, bloq, nval in resumo:
        a = res["auditoria"][nome]
        regras = "; ".join(f"{k}: {v}" for k, v in sorted(a["porRegra"].items(), key=lambda x: -x[1]))
        linhas.append([NOMES[nome], n, bloq, res["catalogo"][nome]["pmibs"], res["catalogo"][nome]["relacoes"], regras])
    aba_tabela(wb, "RESUMO", ["APLICAÇÃO", "LINHAS", "BLOQUEADAS", "PMIBs NO STATUS", "RELAÇÕES DOCUMENTAIS", "ACHADOS POR REGRA"],
               linhas, [30, 9, 12, 16, 20, 140])
    aba_tabela(wb, "WORKFLOW C (REG VEL)", ["TIPO", "PMIB ATUAL", "PMIB NOVO", "MOTIVO"],
               [[s["tipo"], s.get("pmibAtual"), s.get("pmibNovo"), s["motivo"]] for s in res["workflowC"]], [22, 18, 18, 80])
    av = [[NOMES[n], a] for n in NOMES for a in res["catalogo"][n]["avisos"]]
    aba_tabela(wb, "AVISOS DO STATUS", ["APLICAÇÃO", "AVISO"], av, [30, 110])
    destino = os.path.join(SAIDA, "Fase1_Resumo.xlsx")
    wb.save(destino)
    print("ok", os.path.basename(destino))


if __name__ == "__main__":
    main()

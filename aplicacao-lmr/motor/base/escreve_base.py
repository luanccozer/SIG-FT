"""Grava a Base da Aplicação de cada sistema em .xlsx (entrada do Workflow B no AMP).

Entrada: motor/dados/base_{sistema}.json (gerados por criar_bases.js).
Saída:   motor/saida/bases/BASE LMR - {sistema}.xlsx
         motor/dados/base_lida_{sistema}.json  (a aba BASE relida, como o Extract from File entrega)

Uso: python -X utf8 base/escreve_base.py
"""
import json
import os

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

MOTOR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DADOS = os.path.join(MOTOR, "dados")
SAIDA = os.path.join(MOTOR, "saida", "bases")
NOMES = {
    "agua_pura": "Água Pura",
    "aeracao": "Aeração Axial da Turbina",
    "ccar": "RV Parte Digital TGC e CCAR",
    "regvel": "Reg. Vel. e Pot. Hidráulica",
    "sfc": "SFC HF-01 e HF-02",
}
NUMEROS = {"LINHA", "QTD POR TRECHO"}
LARGURAS = {"CAMPO": 34, "VALOR": 80, "LINHA": 7, "ESCOPO": 8, "SUBSISTEMA": 18, "FICHA_PMIB": 17, "DESCRIÇÃO": 45, "ÁREA/PAINEL": 22, "RDS-PP": 34,
            "TAG": 10, "TAG COM RDS-PP": 9, "PAIS": 40, "LOCAL": 20, "ELEVAÇÃO": 10, "EIXO": 6, "TRECHOS": 40, "QTD POR TRECHO": 9}
NEGRITO = Font(bold=True)
CAB = PatternFill("solid", fgColor="D9E1F2")
LEIA_ME = [
    "BASE DA APLICAÇÃO LMR",
    "",
    "Cada linha da aba BASE é um material numa posição (TAG, painel, local). O Workflow B expande cada linha em",
    "QTD POR TRECHO linhas iguais em cada trecho de TRECHOS, na ordem física das UGs.",
    "",
    "RDS-PP e PAIS: #ST[XX]=M[XX] vira o #ST e o M de cada UG. RDS-PP sem [XX] fica igual em todos os trechos.",
    "PAIS: TAG | RDS-PP do pai, separados por ' ; ' quando há mais de um pai. Com PAIS, o CÓDIGO cita o pai no lugar de ÁREA/PAINEL.",
    "TAG COM RDS-PP: SIM → TAG_LMR leva 'RDS-PP: {RDS-PP}{TAG}'; NÃO → '{ESCOPO} - {TAG} - {DESCRIÇÃO}'.",
    "",
    "Para alterar a aplicação: edite esta aba (trocar PMIB, mudar QTD, incluir ou tirar trechos) e rode o Workflow B.",
    "CABEÇALHO: LISTA DE SOBRESSALENTE, ESPECIFICAÇÃO TÉCNICA / CAPÍTULO e SUBSISTEMA do topo da aba DOCS DE REFERÊNCIA da aplicação.",
    "DOCS DE REFERÊNCIA: uma linha por material; a coluna TAGS é refeita pelo Workflow B a partir da BASE.",
    "Não mude os nomes das colunas nem os nomes das abas.",
]


def tabela(wb, titulo, colunas, linhas):
    ws = wb.create_sheet(titulo)
    ws.append(colunas)
    for c in ws[1]:
        c.font, c.fill = NEGRITO, CAB
        c.alignment = Alignment(wrap_text=True, vertical="top")
    for r in linhas:
        ws.append([r.get(k) if k in NUMEROS else ("" if r.get(k) is None else str(r.get(k))) for k in colunas])
    for i, k in enumerate(colunas, start=1):
        ws.column_dimensions[get_column_letter(i)].width = LARGURAS.get(k, 20)
        if k not in NUMEROS:
            for (c,) in ws.iter_rows(min_row=2, min_col=i, max_col=i):
                c.number_format = "@"
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    return ws


def releia(caminho):
    """Aba BASE como o Extract from File (headerRow, includeEmptyCells) entrega: um objeto por linha."""
    ws = openpyxl.load_workbook(caminho, read_only=True)["BASE"]
    linhas = list(ws.iter_rows(values_only=True))
    cab = linhas[0]
    return [{k: ("" if v is None else v) for k, v in zip(cab, r)} for r in linhas[1:]]


def main():
    os.makedirs(SAIDA, exist_ok=True)
    for n, nome in NOMES.items():
        with open(os.path.join(DADOS, f"base_{n}.json"), encoding="utf-8") as f:
            b = json.load(f)
        wb = openpyxl.Workbook()
        wb.remove(wb.worksheets[0])
        tabela(wb, "BASE", b["colunas"], b["base"])
        tabela(wb, "CABEÇALHO", ["CAMPO", "VALOR"], [{"CAMPO": k, "VALOR": v} for k, v in b["cabecalho"].items()])
        if b["docs"]:
            tabela(wb, "DOCS DE REFERÊNCIA", list(b["docs"][0].keys()), b["docs"])
        if b["relacoes"]:
            tabela(wb, "RELAÇÕES", list(b["relacoes"][0].keys()), b["relacoes"])
        if b["naoLidas"]:
            tabela(wb, "NÃO LIDAS", list(b["naoLidas"][0].keys()), b["naoLidas"])
        ws = wb.create_sheet("LEIA-ME")
        for t in LEIA_ME:
            ws.append([t])
        ws["A1"].font = Font(bold=True, size=13)
        r = b["resumo"]
        for t in ["", f"Sistema: {nome}", f"Lista: {r.get('lista') or ''}   Revisão do Status: {r.get('revisao') or ''}",
                  f"Gerada da aplicação emitida. Assinatura esperada no Workflow B: {r['assinatura']} ({r['bloqueadas']} linhas bloqueadas)."]:
            ws.append([t])
        ws.column_dimensions["A"].width = 120
        caminho = os.path.join(SAIDA, f"BASE LMR - {nome}.xlsx")
        wb.save(caminho)
        lida = releia(caminho)
        with open(os.path.join(DADOS, f"base_lida_{n}.json"), "w", encoding="utf-8") as f:
            json.dump(lida, f, ensure_ascii=False)
        print(f"ok {os.path.basename(caminho)}: {len(lida)} linhas na BASE, {os.path.getsize(caminho) // 1024} KB")


main()

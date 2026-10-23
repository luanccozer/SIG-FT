"""Converte as planilhas do projeto LMR em JSON (lista de linhas por aba).

Faz localmente o papel do nó Extract from File do n8n: cada aba vira uma
lista de linhas, e cada linha é uma lista de valores. Assim o motor (lmr.js)
recebe a mesma estrutura aqui e no AMP.

Uso: python -X utf8 extrair.py  →  grava em motor/dados/*.json
"""
import datetime
import glob
import json
import os

import openpyxl

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "motor", "dados")


def valor(c):
    if isinstance(c, (datetime.date, datetime.datetime)):
        return c.isoformat()
    return c


def extrai(caminho, abas=None):
    wb = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
    out = {}
    for ws in wb.worksheets:
        if abas and ws.title not in abas:
            continue
        linhas = []
        for r in ws.iter_rows(values_only=True):
            linhas.append([valor(c) for c in r])
        while linhas and not any(c is not None for c in linhas[-1]):
            linhas.pop()
        out[ws.title] = linhas
    return out


def grava(nome, dados):
    with open(os.path.join(SAIDA, nome + ".json"), "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False)


def main():
    os.makedirs(SAIDA, exist_ok=True)
    # nome curto → (Status PMIB, aplicação emitida)
    sistemas = {
        "agua_pura": ("Água Pura", "Aplicação_LMR_Água_Pura_Exemplo.xlsx"),
        "aeracao": ("Aeração axial", "APLICAÇÃO_LMR - Sistema_de_Aeração_Axial_da_Turbina_Exemplo.xlsx"),
        "ccar": ("CCAR", "APLICAÇÃO LMR - RV PARTE DIGITAL TGC E CCAR - Exemplo.xlsx"),
        "regvel": ("Reg Vel e POt", "APLICAÇÃO LMR - REG. VEL E POT - HIDRÁULICA - Exemplo.xlsx"),
        "sfc": ("SFC", "APLICAÇÃO LMR - SFC HF-01 e HF-02_R2 - Exemplo.xlsx"),
    }
    for nome, (sufixo, app) in sistemas.items():
        st = glob.glob(os.path.join(RAIZ, "Exemplo - PMIB", f"*STATUS_PMIB - {sufixo}.xlsx"))[0]
        grava(f"status_{nome}", {"arquivo": os.path.basename(st),
                                 "linhas": extrai(st, ["Lista de Materiais"])["Lista de Materiais"]})
        grava(f"app_{nome}", {"arquivo": app, "abas": extrai(os.path.join(RAIZ, "Exemplos", app))})
        print("ok", nome)
    grava("tabela_tags_agua_pura", {"abas": extrai(os.path.join(RAIZ, "Exemplos", "TABELA_TAGS_EXEMPLO.xlsx"))})
    grava("template", {"abas": extrai(os.path.join(RAIZ, "Templates", "Template_Aplicação_LMR.xlsx"))})
    ref = extrai(os.path.join(RAIZ, "Codificação - RDS-PP", "ITAIPU-REF-0013.xlsx"), ["AGRUPADO (Função)"])
    grava("ref0013_funcao", {"linhas": ref["AGRUPADO (Função)"]})
    print("ok tabela_tags, template, ref0013")


if __name__ == "__main__":
    main()

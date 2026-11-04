"""Lê um .xlsx como o Extract from File do n8n e imprime JSON (teste local do AG2).
Uso: python agente/le_xlsx.py <arquivo.xlsx> <aba:cab|sem> [<aba:cab|sem> ...]
cab = primeira linha é cabeçalho (lista de objetos); sem = lista de linhas. Células vazias = ''."""
import json
import sys

import openpyxl

wb = openpyxl.load_workbook(sys.argv[1], read_only=True)
saida = {}
for pedido in sys.argv[2:]:
    aba, modo = pedido.rsplit(':', 1)
    linhas = [['' if v is None else str(v) for v in r] for r in wb[aba].iter_rows(values_only=True)]
    if modo == 'cab':
        cab = linhas[0]
        saida[aba] = [dict(zip(cab, r)) for r in linhas[1:]]
    else:
        saida[aba] = linhas
sys.stdout.buffer.write(json.dumps(saida, ensure_ascii=False).encode('utf-8'))

# -*- coding: utf-8 -*-
"""BASE LMR -> APLICAÇÃO LMR (template oficial) + VALIDAÇÃO, rodando o motor do Workflow B localmente.

Uso: py -X utf8 rodar_workflow_b.py "<pasta>/BASE LMR - X.xlsx" [...]
Saída ao lado da BASE: 'APLICAÇÃO LMR - X.xlsx' e 'VALIDAÇÃO - X.xlsx'.
"""
import json, os, subprocess, sys, tempfile
from collections import Counter
import openpyxl

AQUI = os.path.dirname(os.path.abspath(__file__))


def ler_aba(wb, nome):
    """Como o Extract from File do n8n: lista de dicts pelo cabeçalho, valores em texto (números inteiros sem '.0')."""
    if nome not in wb.sheetnames: return []
    rows = list(wb[nome].iter_rows(values_only=True))
    if not rows: return []
    cab = [str(c) if c is not None else '' for c in rows[0]]
    fmt = lambda v: '' if v is None else (str(int(v)) if isinstance(v, float) and v.is_integer() else str(v))
    return [dict(zip(cab, map(fmt, r), strict=False)) for r in rows[1:] if any(v is not None for v in r)]


def rodar(base_xlsx):
    wb = openpyxl.load_workbook(base_xlsx, data_only=True)
    dados = {'base': ler_aba(wb, 'BASE'), 'docs': ler_aba(wb, 'DOCS DE REFERÊNCIA'),
             'cabecalho': {r['CAMPO']: r['VALOR'] for r in ler_aba(wb, 'CABEÇALHO')}}
    pasta, nome = os.path.split(base_xlsx)
    sistema = nome.replace('BASE LMR - ', '').replace('.xlsx', '')
    saida = os.path.join(pasta, f'APLICAÇÃO LMR - {sistema}.xlsx')
    with tempfile.TemporaryDirectory() as tmp:
        ent, val = os.path.join(tmp, 'base.json'), os.path.join(tmp, 'val.json')
        json.dump(dados, open(ent, 'w', encoding='utf-8'), ensure_ascii=False)
        r = subprocess.run(['node', os.path.join(AQUI, 'rodar_workflow_b.js'), ent, saida, val], capture_output=True, text=True, encoding='utf-8')
        if r.returncode: raise SystemExit(r.stderr)
        print(f'[{sistema}]', r.stdout.strip())
        v = json.load(open(val, encoding='utf-8'))
    out = openpyxl.Workbook(); ws = out.active; ws.title = 'VALIDAÇÃO'
    cols = ['LINHA DA BASE', 'FICHA_PMIB', 'TRECHO', 'REGRA', 'SEVERIDADE', 'MENSAGEM']
    ws.append(cols)
    for a in v['achados']: ws.append([a.get(c, '') for c in cols])
    rs = out.create_sheet('RESUMO')
    rs.append(['Assinatura', v['assinatura']]); rs.append(['Linhas na aplicação', v['linhas']]); rs.append(['Linhas bloqueadas', v['bloqueadas']])
    rs.append([]); rs.append(['MENSAGEM', 'OCORRÊNCIAS (linhas da BASE)'])
    for msg, n in Counter(f"{a['REGRA']} {a['SEVERIDADE']}: {a['MENSAGEM']}" for a in v['achados']).most_common(): rs.append([msg, n])
    out.save(os.path.join(pasta, f'VALIDAÇÃO - {sistema}.xlsx'))
    return v


if __name__ == '__main__':
    for b in sys.argv[1:]: rodar(b)

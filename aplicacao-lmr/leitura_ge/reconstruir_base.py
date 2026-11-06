# -*- coding: utf-8 -*-
"""Aplicação LMR já emitida (estilo 'CC - <ÁREA> - RDS-PP: <rds> - <LOCAL> - ELEV. x - EIXO y - TRECHO z') -> BASE LMR.

Uso: py -X utf8 reconstruir_base.py <aplicação emitida.xlsx> <STATUS_PMIB.xlsx> <BASE saída.xlsx> <ESCOPO> <SUBSISTEMA> <CAPÍTULO>
Equivale ao Workflow R. A descrição vem do Status PMIB (não da TAG emitida). Linhas iguais em vários trechos viram 1 linha da BASE.
"""
import re, sys
from collections import OrderedDict, defaultdict
import openpyxl
from openpyxl.styles import Font, PatternFill
from lmr_core import formata_elev, ler_lista_sobressalentes
from gerar_base_lmr import COLUNAS_BASE, COLUNAS_DOCS

RE_COD = re.compile(r'^(?P<esc>[^-]+?) - (?P<area>.+?) - RDS-PP: ?(?P<rds>\S+) - (?P<local>.+?) - ELEV\. (?P<elev>[\d.,]+) - EIXO (?P<eixo>\S+) - TRECHO (?P<trecho>\S+)$')
LOCAL_PADRAO = {'SALA DE FORÇA': 'CASA DE FORÇA', 'CASA DE FORCA': 'CASA DE FORÇA'}  # lista fechada do motor


def trecho_padrao(t):
    """'U01/02' -> 'U-01', 'U09/09A' -> 'U-09', 'U-9A' -> 'U-09A' (1º bloco da faixa = bloco da sala, REF-0013)."""
    m = re.match(r'^U-?0*(\d{1,2})(A?)', t.upper())
    return f'U-{int(m.group(1)):02d}{m.group(2)}' if m else t


def reconstruir(app, status, saida, escopo, subsistema, capitulo):
    wb = openpyxl.load_workbook(app, data_only=True)
    cat = {i['ficha']: i for i in ler_lista_sobressalentes(status) if not i['eh_grupo']}
    docs_ws = wb['DOCS DE REFERÊNCIA']
    lista = docs_ws['C2'].value or ''
    rds_doc = defaultdict(list)
    for r in docs_ws.iter_rows(min_row=9, values_only=True):
        if r[1] and r[4]:
            for d in re.split(r'\s*\|\s*', str(r[4]).strip()):
                if d and d not in rds_doc[str(r[1]).strip()]: rds_doc[str(r[1]).strip()].append(d)
    cont, pend, avisos = OrderedDict(), [], set()
    for ficha, cod, tag_lmr, *_ in wb['APLICAÇÃO - LMR'].iter_rows(min_row=2, values_only=True):
        if not ficha: continue
        m = RE_COD.match(' '.join(str(cod).split()))
        if not m: pend.append([ficha, '', '', '', f'CÓDIGO_LMR não decomposto: {cod}']); continue
        p = m.groupdict()
        partes = [x.strip() for x in str(tag_lmr).split(' - ')]
        tag = partes[1] if len(partes) >= 3 else ''
        local = LOCAL_PADRAO.get(p['local'].upper(), p['local'].upper())
        tr = trecho_padrao(p['trecho'])
        if local != p['local'].upper(): avisos.add(f"LOCAL '{p['local']}' convertido para '{local}' (lista fechada do motor)")
        if tr != p['trecho']: avisos.add(f"TRECHO '{p['trecho']}' convertido para '{tr}' (1º bloco da faixa; salas de baterias da REF-0013 em U01, U03, ..., U18)")
        k = (ficha, p['area'], p['rds'], tag, local, formata_elev(p['elev']), p['eixo'].upper().replace('-', ''), tr)
        cont[k] = cont.get(k, 0) + 1
    agrup = OrderedDict()  # mesma posição e mesma QTD em vários trechos -> uma linha com TRECHOS = lista
    for (ficha, area, rds, tag, local, elev, eixo, tr), q in cont.items():
        agrup.setdefault((ficha, area, rds, tag, local, elev, eixo, q), []).append(tr)
    rows = []
    for i, ((ficha, area, rds, tag, local, elev, eixo, q), trs) in enumerate(agrup.items(), 1):
        c = cat.get(ficha)
        if not c: pend.append([ficha, '', '', '', 'PMIB da aplicação fora do Status PMIB'])
        rows.append({'LINHA': i, 'ESCOPO': escopo, 'SUBSISTEMA': subsistema, 'FICHA_PMIB': ficha, 'DESCRIÇÃO': c['desc'] if c else '',
                     'ÁREA/PAINEL': area, 'RDS-PP': rds, 'TAG': tag, 'TAG COM RDS-PP': 'NÃO', 'PAIS': '', 'LOCAL': local, 'ELEVAÇÃO': elev,
                     'EIXO': eixo, 'TRECHOS': ', '.join(trs), 'QTD POR TRECHO': q})
    qtd = defaultdict(int)
    for (ficha, *_), q in cont.items(): qtd[ficha] += q
    docs = [{'CÓDIGO PMIB': f, 'PART NUMBER': c['pn'] or c['modelo'], 'DESCRIÇÃO DO MATERIAL': c['desc'],
             'RDS-PP DOCUMENTO - PRINCIPAL': ' / '.join(rds_doc.get(f, [])), 'QTD': qtd.get(f) or '', 'TAGS': '',
             'OBSERVAÇÕES': '' if qtd.get(f) else 'Sem aplicação na LMR emitida'} for f, c in cat.items()]
    out = openpyxl.Workbook(); out.remove(out.active); H = Font(bold=True); F = PatternFill('solid', fgColor='D9E1F2')
    for nome, cols, linhas in [('BASE', COLUNAS_BASE, rows),
                               ('CABEÇALHO', ['CAMPO', 'VALOR'], [{'CAMPO': 'LISTA DE SOBRESSALENTE', 'VALOR': lista},
                                                                 {'CAMPO': 'ESPECIFICAÇÃO TÉCNICA / CAPÍTULO', 'VALOR': capitulo},
                                                                 {'CAMPO': 'SUBSISTEMA', 'VALOR': subsistema}]),
                               ('DOCS DE REFERÊNCIA', COLUNAS_DOCS, docs),
                               ('PENDÊNCIAS', ['FICHA_PMIB', 'ITEM', 'PART NUMBER', 'DESCRIÇÃO', 'MOTIVO'],
                                [dict(zip(['FICHA_PMIB', 'ITEM', 'PART NUMBER', 'DESCRIÇÃO', 'MOTIVO'], p, strict=False)) for p in pend]
                                + [{'FICHA_PMIB': '-', 'MOTIVO': a} for a in sorted(avisos)])]:
        ws = out.create_sheet(nome); ws.append(cols)
        for cel in ws[1]: cel.font = H; cel.fill = F
        for r in linhas: ws.append([r.get(c, '') for c in cols])
        ws.freeze_panes = 'A2'; ws.auto_filter.ref = ws.dimensions
    out.save(saida)
    print(f'reconstruída: {len(rows)} linhas BASE, {sum(cont.values())} linhas de aplicação, {len(pend)} pendências, {len(avisos)} conversões -> {saida}')


if __name__ == '__main__':
    reconstruir(*sys.argv[1:7])

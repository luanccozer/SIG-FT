# -*- coding: utf-8 -*-
"""Leitura dos documentos para a BASE LMR (equivale ao Workflow A, sem IA, para cadernos GE).

Lê: Status PMIB (lista de sobressalentes), SAP (descrição curta), REF-0013 (RDS-PP oficial por TAG)
e as folhas 'LISTA DE MATERIAIS' dos cadernos &EFF010 da pasta LMR. Casa ficha x TAG do desenho.
"""
import csv, difflib, glob, os, re, warnings
import openpyxl

warnings.filterwarnings('ignore')
norm = lambda s: re.sub(r'[^A-Z0-9]', '', str(s or '').upper())
REF0013 = os.environ.get('LMR_REF0013') or r'C:\Users\260040670\Box\DocManager Itaipu\Docs Aconex\LMR\Codificação - RDS-PP\ITAIPU-REF-0013.xlsx'


def _pdf(path):
    import pymupdf  # só quem lê PDF precisa dele (o CI testa as regras sem o pymupdf)
    return pymupdf.open(path)


# ---------------------------------------------------------------- Status PMIB
def ler_lista_sobressalentes(path):
    """Aba 'Lista de Materiais' do *_STATUS_PMIB.xlsx: itens (fichas) e grupos (linhas sem PMIB)."""
    ws = openpyxl.load_workbook(path, data_only=True)['Lista de Materiais']
    idx, itens, grupo = None, [], None
    for r in ws.iter_rows(values_only=True):
        if 'ITEM' in r:
            idx = {h: r.index(h) for h in r if h}; continue
        if not idx or not any(r): continue
        g = lambda k, r=r, idx=idx: (r[idx[k]] if k in idx and idx[k] < len(r) else None)
        it = {'item': str(g('ITEM') or '').strip(), 'qtd': g('QTD.'), 'unid': str(g('UNID.') or '').strip(),
              'desc': ' '.join(str(g('DESCRIÇÃO') or '').split()), 'pn': str(g('CÓDIGO DO MATERIAL') or '').strip(),
              'cmi': str(g('CÓDIGO CMI') or '').strip(), 'modelo': str(g('MARCA/MODELO') or '').strip(),
              'ficha': str(g('CÓDIGO PMIB') or '').strip()}
        for k in ('pn', 'cmi', 'modelo'):
            if it[k] in ('None', 'N/A', '-'): it[k] = ''
        it['eh_grupo'] = not it['ficha'] or it['ficha'] in ('N/A', '-', 'None')
        if it['eh_grupo']:
            grupo = it['item']; it['grupo_titulo'] = ' | '.join(x for x in (it['desc'], it['pn']) if x)
        it['grupo'] = grupo
        itens.append(it)
    return itens


def ler_sap_descricoes(path):
    """Descrição curta do SAP ('Object description') por código CMI ('Component')."""
    if not path or not os.path.exists(path): return {}
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]; out, idx = {}, None
    for r in ws.iter_rows(values_only=True):
        if 'Component' in r: idx = (r.index('Component'), r.index('Object description')); continue
        if idx and r[idx[0]]: out[str(r[idx[0]]).strip()] = str(r[idx[1]]).strip()
    return out


# ---------------------------------------------------------------- REF-0013
def ler_ref0013(path=REF0013):
    """Aba 'AGRUPADO (Função)': designação de campo -> [(RDS-PP, descritivo)]. Uma designação pode ter mais de um código."""
    out = {}
    if not os.path.exists(path): return out
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True)['AGRUPADO (Função)']
    # coluna 'TAG' = código RDS-PP completo (7ª); 'CÓDIGO DE REFERÊNCIA INTERNA' = designação de campo (8ª), ex. PDE-F18021
    for r in ws.iter_rows(min_row=2, values_only=True):
        if len(r) > 8 and r[6] and r[7] and str(r[6]).startswith('#'):
            out.setdefault(str(r[7]).strip(), []).append((str(r[6]).strip(), str(r[8] or '').strip()))
    return out


def rds_da_ref(ref, tag, setor=None):
    """(RDS-PP oficial, nº de códigos). Com mais de um código, prefere o do setor do documento (#ST50/#ST60)."""
    cands = ref.get(tag, [])
    if setor:
        for rds, _ in cands:
            if rds.startswith(setor): return rds, len(cands)
    return (cands[0][0], len(cands)) if cands else (None, 0)


# ---------------------------------------------------------------- PDFs
def extrair_texto_pdfs(pasta_lmr, saida_csv):
    """'TEXTO DOS PDFs - LMR.csv' (ARQUIVO, CÓDIGO, PÁGINA, CARACTERES, TEXTO) de uma pasta LMR."""
    with open(saida_csv, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f); w.writerow(['ARQUIVO', 'CÓDIGO', 'PÁGINA', 'CARACTERES', 'TEXTO'])
        for pdf in sorted(glob.glob(os.path.join(pasta_lmr, '*.pdf'))):
            nome = os.path.basename(pdf); m = re.match(r'(#\w\w\d\d=[^\[ .]+)', nome)
            for i, pg in enumerate(_pdf(pdf), 1):
                t =' | '.join(l.strip() for l in pg.get_text().splitlines() if l.strip())
                w.writerow([nome, m.group(1) if m else '', i, len(t), t])


def info_documento(pdf):
    """(código CMI do emitente, título) lidos do carimbo."""
    cmi = tit = ''
    for pg in _pdf(pdf):
        t = ' | '.join(l.strip() for l in pg.get_text().splitlines() if l.strip())
        m = re.search(r'\b(0893\w{7,9}-\w{6}-\d\d)\b', t); cmi = cmi or (m.group(1) if m else '')
        m = re.search(r'TÍTULO: \| (?:CONTROLE CENTRALIZADO \| )?([^|]+)', t); tit = tit or (m.group(1).strip() if m else '')
        if cmi and tit: break
    return cmi, tit


COLS = ['TAG', 'Designação', 'Código', 'Quantidade', 'Local', 'Fabricante', 'Folha']


def _parse_pagina(page):
    """Tabela 'LISTA DE MATERIAIS' padrão GE por coordenadas: cada coluna é definida pelo cabeçalho."""
    words = page.get_text('words')
    hdr = {}
    for w in words:
        if w[4] in COLS and w[4] not in hdr: hdr[w[4]] = w
    if not {'TAG', 'Designação', 'Quantidade', 'Código'} <= hdr.keys(): return []
    hy = max(w[3] for w in hdr.values()) + 1
    cen = sorted(((w[0] + w[2]) / 2, k) for k, w in hdr.items())
    # dados centralizados sob o cabeçalho; 'Designação' é longa e alinhada à esquerda
    bounds = [(hdr[k1][2] + 6) if k2 == 'Designação' else (c1 + c2) / 2 for (c1, k1), (c2, k2) in zip(cen, cen[1:], strict=False)]

    def col(w):
        x = (w[0] + w[2]) / 2
        for b, (_, k) in zip(bounds, cen, strict=False):
            if x < b: return k
        return cen[-1][1]

    body = [w for w in words if w[1] > hy and w[3] < page.rect.height * 0.86]
    starts = []
    for w in sorted(body, key=lambda w: w[1]):
        if col(w) == 'Quantidade' and re.fullmatch(r'\d+([.,]\d+)?', w[4]) and (not starts or w[1] - starts[-1] > 4):
            starts.append(w[1])
    rows = [{c: [] for c in COLS} for _ in starts]
    for w in sorted(body, key=lambda w: (round(w[1]), w[0])):
        i = max([i for i, y in enumerate(starts) if w[1] >= y - 3], default=None)
        if i is not None: rows[i][col(w)].append(w[4])
    out = []
    for r in rows:
        d = {c: ' '.join(v).strip() for c, v in r.items()}
        m = re.search(r'COLUNA\s*\d+', d['Local']); d['Local'] = ' '.join(m.group(0).split()) if m else ''
        out.append(d)
    return out


def ler_lista_materiais(pdf):
    """Linhas das folhas 'LISTA DE MATERIAIS' / 'LISTA MATERIAIS - ...' de um caderno GE."""
    itens = []
    for i, pg in enumerate(_pdf(pdf), 1):
        if not re.search(r'LISTA (DE )?MATERIAIS', pg.get_text()): continue
        for r in _parse_pagina(pg):
            r['PAGINA'] = i; itens.append(r)
    return itens


def expandir_tags(s):
    """'-27.1...-27.3;-72.E -BTR/ -BTS' -> ['27.1','27.2','27.3','72.E','BTR','BTS'] (sem o '-' IEC)."""
    res = []
    for part in re.split(r'[;,/\s]+', s or ''):
        if not part or part in ('-', 'N/A'): continue
        for p in re.split(r'(?<=\w)(?=-\w)', part):  # TAGs coladas pela quebra de linha: '-52.110-52.111'
            m = re.match(r'^(.*?)(\d+)\.\.\.(.*?)(\d+)$', p)
            if m and m.group(1) == m.group(3) and int(m.group(4)) >= int(m.group(2)):
                a, b = int(m.group(2)), int(m.group(4)); z = len(m.group(2)) if m.group(2).startswith('0') else 0
                res += [f'{m.group(1)}{str(i).zfill(z)}' for i in range(a, b + 1)]
            else:
                res.append(p)
    return [t.lstrip('-') for t in res if t.lstrip('-')]


def unidades_por_tag(r):
    """Quantidade do desenho múltiplo exato do nº de TAGs (ex.: base bipolar F.1 com 2 fusíveis) -> unidades por TAG."""
    n = len(expandir_tags(r['TAG'])); q = re.fullmatch(r'\d+', r['Quantidade'] or '')
    return int(q.group()) // n if q and n and int(q.group()) % n == 0 else 1


# ---------------------------------------------------------------- casamento ficha x linha do desenho
def casa_por_codigo(item, linha):
    c = norm(item['pn'])
    if len(c) < 5: return False
    return c == norm(linha['Código']) or c in norm(linha['Designação']) or c in norm(linha['Código'])


def _numeros(s): return set(re.findall(r'\d+(?:[.,]\d+)?', s or ''))


def casa_por_descricao(item, linha, limite=0.88):
    """Fallback: descrição quase idêntica e mesmos números (evita trocar 16A por 20A)."""
    a, b = norm(item['desc']), norm(linha['Designação'])
    if not a or not b: return False
    return difflib.SequenceMatcher(None, a, b).ratio() >= limite and _numeros(item['desc']) <= _numeros(linha['Designação'])


def formata_elev(v):
    """Elevação no padrão do motor: vírgula e 2 casas ('131,5' -> '131,50')."""
    if v in (None, ''): return ''
    s = str(v).replace('EL.', '').replace(',', '.').strip()
    try: return f'{float(s):.2f}'.replace('.', ',')
    except ValueError: return str(v)


if __name__ == '__main__':  # autoteste: py lmr_core.py
    assert expandir_tags('-27.1...-27.3') == ['27.1', '27.2', '27.3']
    assert expandir_tags('-72.E;-72.G') == ['72.E', '72.G']
    assert expandir_tags('-72.01...-72.03') == ['72.01', '72.02', '72.03']
    assert expandir_tags('-52.110-52.111') == ['52.110', '52.111']
    assert expandir_tags('-52.107...-52.109-52.112') == ['52.107', '52.108', '52.109', '52.112']
    assert expandir_tags('-XACC.1...-XACC.3;-XC.1 -XC.2') == ['XACC.1', 'XACC.2', 'XACC.3', 'XC.1', 'XC.2']
    assert expandir_tags('-BTR/ -BTS') == ['BTR', 'BTS']
    assert unidades_por_tag({'TAG': '-F.1...-F.3', 'Quantidade': '6'}) == 2
    assert unidades_por_tag({'TAG': '-72.c', 'Quantidade': '3'}) == 3
    assert formata_elev('131,5') == '131,50' and formata_elev(115) == '115,00'
    assert casa_por_codigo({'pn': '2TAZ110200R1204'}, {'Código': '2TAZ110200R1204', 'Designação': ''})
    assert not casa_por_descricao({'desc': 'Minidisjuntor bipolar 16A curva C'}, {'Designação': 'Minidisjuntor bipolar 20A curva C'})
    ref = {'PLA-CCR': [('#ST50=B04BMA10UC013-UC018', ''), ('#ST60=B04BMA10UC013-UC015', '')]}
    assert rds_da_ref(ref, 'PLA-CCR', '#ST60') == ('#ST60=B04BMA10UC013-UC015', 2)
    print('lmr_core: autoteste OK')

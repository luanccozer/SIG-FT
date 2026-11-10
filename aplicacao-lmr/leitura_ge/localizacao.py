# -*- coding: utf-8 -*-
"""Localização automática (local, elevação, eixo, trecho) pela ITAIPU-REF-0013.

A aba 'AGRUPADO (Localização)' decodifica cada código ++ (ex.: ++U10UME10.U01115CDE01) em local, bloco,
elevação e eixo, e a descrição da sala costuma citar os equipamentos dela ("SALA DE BATERIAS (HB-01 / HN-01)").
A aba 'AGRUPADO (Função)' dá os nomes dos equipamentos de cada sistema (HB-01, CB-01, PLA-CCR...).
Cruzando as duas: salas do sistema -> localização, sem digitar nada. O que não cruzar fica para a equipe.
"""
import os, re
import openpyxl
from lmr_core import REF0013, formata_elev

RE_NOME = re.compile(r'\b[A-Z]{1,5}-\d{1,2}[A-Z]?(?:\.\d)?\b|\bPLA[- ]?[A-Z0-9]{2,4}\b')


def trecho_do_bloco(letra, bloco):
    """'U','01' -> 'U-01'; 'U','09A' -> 'U-09A'; 'S','02' -> 'AMD-02'. Faixas ('01_04') não viram trecho."""
    b = str(bloco or '')
    if not re.fullmatch(r'\d{2}A?', b): return None
    if letra == 'U': return f'U-{b}'
    if letra == 'S' and b[-1] != 'A': return f'AMD-{b}'
    return None


def hz_do_trecho(t):
    """U-01..U-09A = 50 Hz; U-10..U-18A = 60 Hz; fora de UG = None (vale para as duas)."""
    m = re.fullmatch(r'U-(\d\d)A?', t or '')
    return None if not m else ('50' if int(m.group(1)) <= 9 else '60')


def ler_locais_ref(path=REF0013):
    """Linhas da aba 'AGRUPADO (Localização)' com campos decodificados e os nomes de equipamento citados."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    bl1 = {r[0]: str(r[1]).upper() for r in wb['BL1 (LOCAIS E ÁREAS)'].iter_rows(min_row=3, values_only=True) if r[0] and r[1]}
    out = []
    for r in wb['AGRUPADO (Localização)'].iter_rows(min_row=2, values_only=True):
        if not r or not r[8]: continue
        desc = str(r[9] or '')
        m = re.search(r'EL\.\s*(\d{2,3}(?:,\d+)?)', desc)
        elev = formata_elev(m.group(1)) if m else (formata_elev(r[4]) if r[4] else '')
        out.append({'codigo': str(r[8]).strip(), 'descricao': desc, 'local': bl1.get(r[1], ''),
                    'trecho': trecho_do_bloco(r[2], r[3]), 'elev': elev, 'eixo': str(r[5] or ''),
                    'nomes': set(RE_NOME.findall(desc.upper()))})
    return out


def ler_funcao_ref(path=REF0013):
    """Linhas da aba 'AGRUPADO (Função)' (RDS-PP na 7ª coluna, nome do equipamento na 8ª, descritivo na 9ª)."""
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True)['AGRUPADO (Função)']
    return [r for r in ws.iter_rows(min_row=2, values_only=True) if len(r) > 8 and r[6]]


def equipamentos_do_sistema(funcao, raiz):
    """Nomes (CÓDIGO DE REFERÊNCIA INTERNA) dos equipamentos cujo RDS-PP é do sistema, ex. raiz 'B03BPA10'."""
    return {str(r[7]).strip() for r in funcao if r[7] and f'={raiz}' in str(r[6])}


def salas_do_sistema(locais, nomes):
    """Localizações da REF que citam algum equipamento do sistema, com trecho único definido."""
    return [{**loc, 'citados': sorted(loc['nomes'] & nomes)} for loc in locais if loc['trecho'] and loc['nomes'] & nomes]


def localizacao_por_nome(locais, nome):
    """Localização da sala que cita este equipamento pelo nome (ex.: PLA-CCR), se houver uma só."""
    achou = [loc for loc in locais if loc['trecho'] and nome in loc['nomes']]
    return achou[0] if len(achou) == 1 else None


def agrupa_por_local(salas):
    """Salas com o mesmo local/elevação/eixo viram uma posição com vários trechos (ordem física)."""
    ordem = lambda t: (t.startswith('AMD'), int(re.sub(r'\D', '', t)), t.endswith('A'))
    g = {}
    for s in salas:
        g.setdefault((s['local'], s['elev'], s['eixo']), []).append(s)
    return [{'local': k[0], 'elev': k[1], 'eixo': k[2], 'trechos': sorted({s['trecho'] for s in v}, key=ordem),
             'codigos': sorted({s['codigo'] for s in v})} for k, v in g.items()]


COLUNAS_TABELA = ['SISTEMA', 'EQUIPAMENTO', 'RDS-PP', 'LOCAL', 'ELEVAÇÃO', 'EIXO', 'TRECHO', 'CÓDIGO DE LOCALIZAÇÃO',
                  'DESCRIÇÃO NA REF-0013', 'FONTE', 'CONFERIDO']


def _ler_tabela(path):
    if not os.path.exists(path): return []
    ws = openpyxl.load_workbook(path, data_only=True)['LOCALIZAÇÃO']
    return [dict(zip(COLUNAS_TABELA, r, strict=False)) for r in ws.iter_rows(min_row=2, values_only=True) if any(r)]


def gravar_tabela(path, sistema, linhas):
    """Atualiza a tabela de localização: troca as linhas automáticas do sistema e mantém as de FONTE = MANUAL."""
    manter = [r for r in _ler_tabela(path) if r['SISTEMA'] != sistema or str(r['FONTE'] or '').upper().startswith('MANUAL')]
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'LOCALIZAÇÃO'; ws.append(COLUNAS_TABELA)
    for r in manter + linhas: ws.append([r.get(c, '') for c in COLUNAS_TABELA])
    for i, w in enumerate((30, 14, 34, 16, 10, 7, 30, 34, 70, 60, 11), 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w
    ws.freeze_panes = 'A2'; ws.auto_filter.ref = ws.dimensions
    wb.save(path)


def manuais(path, sistema):
    """Linhas FONTE = MANUAL da tabela para o sistema: EQUIPAMENTO -> campos. Elas vencem as automáticas."""
    return {str(d['EQUIPAMENTO']): {'local': d['LOCAL'] or '', 'elev': formata_elev(d['ELEVAÇÃO']), 'eixo': d['EIXO'] or '',
                                    'trecho': d['TRECHO'] or ''}
            for d in _ler_tabela(path)
            if d['SISTEMA'] == sistema and str(d['FONTE'] or '').upper().startswith('MANUAL') and d['EQUIPAMENTO']}


if __name__ == '__main__':  # autoteste: py localizacao.py
    assert trecho_do_bloco('U', '01') == 'U-01' and trecho_do_bloco('U', '09A') == 'U-09A'
    assert trecho_do_bloco('U', '01_04') is None and trecho_do_bloco('S', '02') == 'AMD-02'
    assert hz_do_trecho('U-09A') == '50' and hz_do_trecho('U-10') == '60' and hz_do_trecho('AMD-01') is None
    assert RE_NOME.findall('SALA DE BATERIAS (HB-01 / HN-01)') == ['HB-01', 'HN-01']
    assert 'PLA-CCR' in RE_NOME.findall('SALA DO CCR PLA-CCR')
    g = agrupa_por_local([{'local': 'CF', 'elev': '115,00', 'eixo': 'CD', 'trecho': t, 'codigo': t} for t in ('U-10', 'U-09A', 'U-01')])
    assert g[0]['trechos'] == ['U-01', 'U-09A', 'U-10']
    print('localizacao: autoteste OK')

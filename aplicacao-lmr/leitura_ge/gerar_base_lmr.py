# -*- coding: utf-8 -*-
"""Documentos do sistema -> 'BASE LMR - <Sistema>.xlsx' no formato lido pelo Workflow B (motor/lmr.js).

Uso:  py -X utf8 gerar_base_lmr.py configs/paineis.json [...]      |   py -X utf8 gerar_base_lmr.py --todos
Depois: py -X utf8 rodar_workflow_b.py <BASE.xlsx>   (gera a APLICAÇÃO LMR no template oficial)

BASE: uma linha por material numa posição (ÁREA/PAINEL + TAG), com LOCAL/ELEVAÇÃO/EIXO/TRECHOS e QTD POR TRECHO.
"""
import glob, json, os, re, sys
from collections import OrderedDict, defaultdict
import openpyxl
from openpyxl.styles import Font, PatternFill
from lmr_core import (casa_por_codigo, casa_por_descricao, expandir_tags, formata_elev, ler_lista_materiais,
                      ler_lista_sobressalentes, ler_ref0013, rds_da_ref, unidades_por_tag)

AQUI = os.path.dirname(os.path.abspath(__file__))
SAE = os.environ.get('LMR_SAE') or r'C:\Users\260040670\Box\CMI - Consórcio Itaipu\11 - Ger. Engenharia\15 - PDM\SOBRESSALENTES - PMIB\01 - CONTROLE CENTRALIZADO\SERVIÇOS AUXILIARES ESSENCIAIS'
SAIDA = 'LMR/SAIDA ATUAL'  # BASE, APLICAÇÃO e VALIDAÇÃO vigentes de cada sistema


def arquivo_raiz(nome):
    """Planilhas da equipe (TABELA DE LOCALIZAÇÃO, LOCAIS A PREENCHER): na pasta do projeto (acima de _AUTOMACAO_LMR), senão na raiz SAE."""
    p = os.path.join(os.path.dirname(AQUI), nome)
    return p if os.path.exists(p) or not os.path.exists(os.path.join(SAE, nome)) else os.path.join(SAE, nome)
COLUNAS_BASE = ['LINHA', 'ESCOPO', 'SUBSISTEMA', 'FICHA_PMIB', 'DESCRIÇÃO', 'ÁREA/PAINEL', 'RDS-PP', 'TAG', 'TAG COM RDS-PP',
                'PAIS', 'LOCAL', 'ELEVAÇÃO', 'EIXO', 'TRECHOS', 'QTD POR TRECHO']
COLUNAS_DOCS = ['CÓDIGO PMIB', 'PART NUMBER', 'DESCRIÇÃO DO MATERIAL', 'RDS-PP DOCUMENTO - PRINCIPAL', 'QTD', 'TAGS', 'OBSERVAÇÕES']
raiz_rds = lambda s: (s or '').split('&')[0]


def resolve_instancias(cfg, ref, pend_fixas):
    """RDS-PP de cada instância: o informado, senão o da REF-0013 pela TAG, senão a raiz do documento."""
    for e in cfg['equipamentos']:
        setor = e['rds_doc'][:5]
        for inst in e['instancias']:
            if inst.get('rds'): inst['fonte_rds'] = 'config'; continue
            rds, n = rds_da_ref(ref, inst['nome'], setor)
            if rds:
                inst['rds'], inst['fonte_rds'] = rds, 'REF-0013' + (f' ({n} códigos para a TAG)' if n > 1 else '')
                doc = raiz_rds(e['rds_doc'])  # caderno de 1 painel (não típico/agrupado UC9xx) deveria ter o mesmo código
                if doc != rds and inst['nome'] == e['sigla'] and not re.search(r'\w\w9\d\d$', doc):
                    pend_fixas.append(f"{inst['nome']}: RDS-PP da REF-0013 ({rds}) difere do código do caderno ({e['rds_doc']})")
            else:
                inst['rds'], inst['fonte_rds'] = raiz_rds(e['rds_doc']), 'documento (TAG não está na REF-0013)'


def ler_locais_preenchidos(sistema):
    """'LOCAIS A PREENCHER - BASE LMR.xlsx', preenchida pela equipe: ÁREA/PAINEL -> {local, elev, eixo, trecho}."""
    p = arquivo_raiz('LOCAIS A PREENCHER - BASE LMR.xlsx')
    if not os.path.exists(p): return {}
    out = {}
    for r in openpyxl.load_workbook(p, data_only=True)['LOCAIS'].iter_rows(min_row=2, values_only=True):
        if r[0] == sistema and r[1]:
            out[str(r[1])] = {'local': r[3] or '', 'elev': r[4] or '', 'eixo': r[5] or '', 'trecho': r[6] or ''}
    return out


AJUSTES = 'AJUSTES - BASE LMR.xlsx'
COLUNAS_AJUSTES = ['SISTEMA', 'FICHA_PMIB', 'EQUIPAMENTO', 'TAG', 'QTD', 'MOTIVO', 'FONTE', 'APROVADO']


def ler_ajustes(sistema):
    """Decisões de engenharia que o desenho não resolve (aba AJUSTES, APROVADO = SIM), por (ficha, equipamento).

    As linhas de um (ficha, equipamento) SUBSTITUEM o que o desenho deu para aquele material naquele equipamento.
    TAG vazia = unidades sem TAG; QTD 0 = o material não vai naquele equipamento.
    """
    p = arquivo_raiz(AJUSTES)
    if not os.path.exists(p): return {}
    out = defaultdict(list)
    for r in openpyxl.load_workbook(p, data_only=True)['AJUSTES'].iter_rows(min_row=2, values_only=True):
        d = dict(zip(COLUNAS_AJUSTES, r, strict=False))
        if d['SISTEMA'] == sistema and str(d['APROVADO'] or '').strip().upper() == 'SIM':
            out[(str(d['FICHA_PMIB']).strip().lstrip("'"), str(d['EQUIPAMENTO']).strip())].append(
                (str(d['TAG']).strip() if d['TAG'] else None, int(d['QTD'] or 0)))
    return out


def completar_pelo_gemeo(cache, base):
    """Linha do desenho sem Código e Designação na camada de texto do PDF (ex.: C2 itens 132/134/136):
    completa pelo mesmo ITEM e mesma TAG do caderno gêmeo da outra frequência (#ST50 <-> #ST60)."""
    for pdf, rs in list(cache.items()):
        gemeo = re.sub(r'#ST(50|60)=', lambda m: '#ST' + ('60' if m[1] == '50' else '50') + '=', pdf)
        if gemeo == pdf: continue
        if gemeo not in cache and os.path.exists(os.path.join(base, gemeo)): cache[gemeo] = ler_lista_materiais(os.path.join(base, gemeo))
        par = {(g['Item'], g['TAG']): g for g in cache.get(gemeo, []) if g['Item'] and g['Código']}
        for r in rs:
            g = par.get((r['Item'], r['TAG']))
            if g and not r['Código'] and not r['Designação']:
                r.update({'Código': g['Código'], 'Designação': g['Designação'], 'GEMEO': os.path.basename(gemeo)})


def gerar(cfg_path):
    """cfg_path: caminho do JSON de configuração ou o dict já montado (gerar_base_auto.py)."""
    cfg = cfg_path if isinstance(cfg_path, dict) else json.load(open(cfg_path, encoding='utf-8'))
    base = os.path.join(SAE, cfg['pasta'])
    itens = ler_lista_sobressalentes(os.path.join(base, cfg['lista_status']))
    ref = ler_ref0013()
    pend_fixas = list(cfg.get('pendencias_fixas', []))
    resolve_instancias(cfg, ref, pend_fixas)
    equips = cfg['equipamentos']; por_sigla = {e['sigla']: e for e in equips}
    preenchidos = ler_locais_preenchidos(os.path.basename(cfg['saida_base'])[len('BASE LMR - '):-len('.xlsx')])
    for e in equips:
        for inst in e['instancias']:
            for campo, v in preenchidos.get(inst['nome'], {}).items():
                if v: inst[campo] = v

    cache = {}
    for e in equips:
        if e.get('pdf') and e['pdf'] not in cache: cache[e['pdf']] = ler_lista_materiais(os.path.join(base, e['pdf']))
    completar_pelo_gemeo(cache, base)
    ajustes = ler_ajustes(os.path.basename(os.path.normpath(cfg['pasta'])))
    def linhas(e):
        rs = cache.get(e.get('pdf'), [])
        return [r for r in rs if r['Local'] in {f'COLUNA {c}' for c in e['colunas']}] if e.get('colunas') else rs
    multi_col = {e['sigla']: len({r['Local'] for r in linhas(e)} - {''}) > 1 for e in equips}

    fichas = OrderedDict()
    for it in itens:
        if not it['eh_grupo']: fichas.setdefault(it['ficha'], {'item': it, 'itens': []})['itens'].append(it)
    manual = defaultdict(list)
    for m in cfg.get('manual', []): manual[m['ficha']].append(m)
    genericos = cfg.get('genericos', {})
    titulos = {it['item']: it.get('grupo_titulo', '') for it in itens if it['eh_grupo']}
    grupo_siglas = {g: cfg.get('grupos', {}).get(g) or [s for s in por_sigla if s in titulos[g].upper()] for g in titulos}

    base_rows, origem, pend, docs_ficha, obs = OrderedDict(), [], [], defaultdict(list), {}
    def add(ficha, it, e, inst, tag, qtd):
        k = (ficha, inst['nome'], inst['rds'], tag, inst.get('trecho'))
        if k in base_rows:
            if tag is None: base_rows[k]['QTD POR TRECHO'] += qtd  # sem TAG: soma as unidades na mesma posição
            return
        base_rows[k] = {'ESCOPO': cfg['escopo'], 'SUBSISTEMA': cfg['subsistema'], 'FICHA_PMIB': ficha, 'DESCRIÇÃO': it['desc'],
                        'ÁREA/PAINEL': inst['nome'], 'RDS-PP': inst['rds'], 'TAG': tag or '', 'TAG COM RDS-PP': 'NÃO', 'PAIS': '',
                        'LOCAL': inst.get('local', ''), 'ELEVAÇÃO': formata_elev(inst.get('elev')), 'EIXO': inst.get('eixo', ''),
                        'TRECHOS': inst.get('trecho', ''), 'QTD POR TRECHO': qtd}

    for ficha, f in fichas.items():
        it = f['item']; achados = []  # (equip, tag|None, linha_desenho|None, método)
        for m in manual.get(ficha, []):
            for t in (m.get('tags') or [None] * m.get('qtd', 1)): achados.append((por_sigla[m['sigla']], t, None, 'manual'))
            if m.get('obs'): obs[ficha] = m['obs']
        if not achados:
            for e in equips:
                for r in linhas(e):
                    if casa_por_codigo(it, r):
                        ts = expandir_tags(r['TAG'])
                        q = re.fullmatch(r'\d+', r['Quantidade'] or '')
                        if ts and q and int(q.group()) % len(ts):  # ex.: 14 diodos em 4 TAGs: a divisão está só no desenho
                            pend.append([ficha, it['item'], it['pn'], it['desc'], f"{q.group()} unidades para {len(ts)} TAGs ({r['TAG']}) "
                                         f"em {e['sigla']}: aplicado sem TAG com a quantidade total - conferir a divisão no desenho"])
                            ts = []
                        if not ts:  # sem TAG no desenho: uma unidade por peça instalada
                            ts = [None] * (int(q.group()) if q else 1)
                        metodo = f"código (texto do gêmeo {r['GEMEO']}) - VERIFICAR" if r.get('GEMEO') else 'código'
                        achados += [(e, t, r, metodo) for t in ts]
        if not achados and cfg.get('fallback_descricao', True):
            achados = [(e, t, r, 'descrição - VERIFICAR') for e in equips for r in linhas(e) if casa_por_descricao(it, r) for t in expandir_tags(r['TAG'])]
            if achados: pend.append([ficha, it['item'], it['pn'], it['desc'], 'Casado por DESCRIÇÃO (PN diferente no desenho) - verificar'])
        for i2 in f['itens']:  # cada item precisa aparecer nos equipamentos do SEU grupo
            gs = grupo_siglas.get(i2['grupo'], [])
            if not gs or i2['grupo'] in genericos: continue
            achou = {e['sigla'] for e, *_ in achados}
            faltam = [s for s in gs if s not in achou and s in por_sigla]
            if achou & set(gs):  # achado em parte do grupo (ex.: C1 mas não C2): avisa, não aplica sem evidência
                if faltam and cfg.get('avisar_grupo_parcial'):
                    pend.append([ficha, i2['item'], it['pn'], it['desc'], f"Achado em {', '.join(sorted(achou & set(gs)))}; "
                                 f"não achado no desenho de {', '.join(faltam)} (grupo {i2['grupo']}) - verificar"])
                continue
            extra = [(e, t, r, 'descrição - VERIFICAR') for e in equips if e['sigla'] in gs
                     for r in linhas(e) if casa_por_descricao(it, r) for t in expandir_tags(r['TAG'])]
            achados += extra
            pend.append([ficha, i2['item'], it['pn'], it['desc'], f"Não casou por PN em {', '.join(gs)}; casado por DESCRIÇÃO - verificar PN" if extra
                         else f"Não encontrado nos desenhos de {', '.join(gs)} (grupo {i2['grupo']})"])
        if not achados and it['grupo'] in genericos:
            achados = [(por_sigla[s], None, None, 'genérico (sem TAG no desenho)') for s in genericos[it['grupo']]]
        ajustados = sorted(s for fi, s in ajustes if fi == ficha)
        if ajustados:  # decisão aprovada substitui o desenho neste equipamento; as pendências da ficha ficam resolvidas
            achados = [a for a in achados if a[0]['sigla'] not in ajustados]
            pend = [p for p in pend if p[0] != ficha]
            for s in ajustados:
                if s not in por_sigla:
                    pend.append([ficha, it['item'], it['pn'], it['desc'], f'AJUSTE com EQUIPAMENTO desconhecido: {s}']); continue
                achados += [(por_sigla[s], t, None, f'AJUSTE APROVADO ({AJUSTES})', q) for t, q in ajustes[(ficha, s)] if q > 0]
        if not achados:
            if not any(p[0] == ficha for p in pend): pend.append([ficha, it['item'], it['pn'], it['desc'], 'Não encontrado nas listas de materiais dos desenhos LMR'])
            continue
        for e, t, r, metodo, *q_ajuste in achados:
            col = r['Local'] if (r and multi_col[e['sigla']]) else ''
            tag = (f'{t} ({col})' if col else t) if t else None
            qtd = q_ajuste[0] if q_ajuste else (unidades_por_tag(r) if (r and t) else 1)
            for inst in e['instancias']: add(ficha, it, e, inst, tag, qtd)
            if e['rds_doc'] not in docs_ficha[ficha]: docs_ficha[ficha].append(e['rds_doc'])
            origem.append([ficha, e['sigla'], os.path.basename(e.get('pdf') or '-'), r['PAGINA'] if r else '-', r['TAG'] if r else (t or '-'),
                           r['Código'] if r else '-', r['Designação'] if r else '-', metodo])
            if 'gêmeo' in metodo:
                obs.setdefault(ficha, 'VERIFICAR: código/designação sem texto no PDF, completados pelo caderno gêmeo')
            elif 'VERIFICAR' in metodo: obs.setdefault(ficha, 'VERIFICAR: casado por descrição (PN do desenho difere do Status)')

    # ---------------- planilha BASE (formato do motor) ----------------
    wb = openpyxl.Workbook(); H = Font(bold=True); F = PatternFill('solid', fgColor='D9E1F2')
    def aba(nome, cols, rows, larg):
        ws = wb.create_sheet(nome); ws.append(cols)
        for c in ws[1]: c.font = H; c.fill = F
        for r in rows: ws.append([r.get(c, '') if isinstance(r, dict) else r[i] for i, c in enumerate(cols)])
        for i, w in enumerate(larg): ws.column_dimensions[openpyxl.utils.get_column_letter(i + 1)].width = w
        ws.freeze_panes = 'A2'; ws.auto_filter.ref = ws.dimensions
        return ws
    wb.remove(wb.active)
    rows = list(base_rows.values())
    for i, r in enumerate(rows, 1): r['LINHA'] = i
    aba('BASE', COLUNAS_BASE, rows, (7, 8, 22, 17, 60, 14, 32, 16, 9, 8, 16, 10, 7, 9, 8))
    aba('CABEÇALHO', ['CAMPO', 'VALOR'], [['LISTA DE SOBRESSALENTE', cfg['lista_sobressalente']],
        ['ESPECIFICAÇÃO TÉCNICA / CAPÍTULO', cfg['capitulo']], ['SUBSISTEMA', cfg.get('cab_subsistema', cfg['subsistema'])]], (36, 90))
    qtd_ficha = defaultdict(int)
    for r in rows: qtd_ficha[r['FICHA_PMIB']] += r['QTD POR TRECHO']
    pend_f = {p[0]: p[4] for p in pend}
    docs = [{'CÓDIGO PMIB': fi, 'PART NUMBER': f['item']['pn'] or f['item']['modelo'], 'DESCRIÇÃO DO MATERIAL': f['item']['desc'],
             'RDS-PP DOCUMENTO - PRINCIPAL': ' / '.join(docs_ficha.get(fi, [])), 'QTD': qtd_ficha.get(fi) or '', 'TAGS': '',
             'OBSERVAÇÕES': pend_f.get(fi) or obs.get(fi, '')} for fi, f in fichas.items()]
    aba('DOCS DE REFERÊNCIA', COLUNAS_DOCS, docs, (17, 22, 60, 45, 7, 30, 60))
    aba('PENDÊNCIAS', ['FICHA_PMIB', 'ITEM', 'PART NUMBER', 'DESCRIÇÃO', 'MOTIVO'], pend + [['-', '-', '-', '-', p] for p in pend_fixas], (17, 8, 22, 60, 80))
    aba('ORIGEM (RASTREIO)', ['FICHA_PMIB', 'EQUIPAMENTO', 'PDF', 'FOLHA PDF', 'TAG NO DESENHO', 'CÓDIGO NO DESENHO', 'DESIGNAÇÃO NO DESENHO', 'MÉTODO'],
        origem, (17, 12, 50, 8, 26, 22, 80, 24))
    locais = []
    for e in equips:
        for inst in e['instancias']:
            falta = [k for k in ('local', 'elev', 'eixo', 'trecho') if not inst.get(k)]
            locais.append([inst['nome'], inst['rds'], inst['fonte_rds'], inst.get('local', ''), formata_elev(inst.get('elev')), inst.get('eixo', ''),
                           inst.get('trecho', ''), 'A PREENCHER: ' + ', '.join(falta) if falta else 'OK', inst.get('fonte_local', '')])
    aba('LOCAIS', ['ÁREA/PAINEL', 'RDS-PP', 'FONTE DO RDS-PP', 'LOCAL', 'ELEVAÇÃO', 'EIXO', 'TRECHO', 'SITUAÇÃO', 'FONTE / OBSERVAÇÃO'], locais,
        (14, 32, 30, 16, 10, 7, 9, 30, 80))
    aba('LEIA-ME', ['T'], [[t] for t in [
        f"BASE LMR - {cfg['sistema']} (gerada dos documentos da pasta LMR + Status PMIB + REF-0013).",
        'Formato da aba BASE igual ao do motor do Workflow B (motor/lmr.js): não mude nomes de abas nem de colunas.',
        'Cada linha = um material numa posição (ÁREA/PAINEL + TAG). O B expande QTD POR TRECHO linhas em cada trecho de TRECHOS.',
        'LOCAL / ELEVAÇÃO / EIXO / TRECHOS vazios bloqueiam a linha no B (V1): preencha na aba LOCAIS da config e regere, ou edite a BASE.',
        'Listas fechadas do motor: TRECHO U-01..U-18A, AMD-01..04, AMC-01..03; EIXO AB, BC, CD, MB, JB, JD; LOCAL da Data Table.',
        'TAG: TAG do caderno GE sem o "-" IEC; em cadernos com várias colunas leva "(COLUNA n)". TAG COM RDS-PP = NÃO.',
        'Abas PENDÊNCIAS, ORIGEM (RASTREIO) e LOCAIS são de revisão: o Workflow B não as lê.']], (130,))
    saida = os.path.join(base, cfg['saida_base']); os.makedirs(os.path.dirname(saida), exist_ok=True); wb.save(saida)
    print(f"[{cfg['sistema']}] fichas={len(fichas)} linhas BASE={len(rows)} unidades={sum(qtd_ficha.values())} pendências={len(pend)} -> {saida}")
    return saida


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args or args == ['--todos']: args = sorted(glob.glob(os.path.join(AQUI, 'configs', '*.json')))
    for a in args: gerar(a)

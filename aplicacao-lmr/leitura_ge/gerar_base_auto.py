# -*- coding: utf-8 -*-
"""Pasta do sistema -> BASE LMR, sem configuração escrita à mão.

Uso (VS Code / terminal):
    py -X utf8 gerar_base_auto.py "<pasta do sistema>" --escopo CC --subsistema "BATERIAS E CARREGADORES"
Opcional: --saida "LMR/BASE LMR - X.xlsx"   (padrão: LMR/SAIDA ATUAL/BASE LMR AUTO - <pasta>.xlsx)

O que ele descobre sozinho:
  - Status PMIB (*_STATUS_PMIB.xlsx) e código da lista de sobressalentes;
  - cadernos da pasta LMR (#STxx=...pdf) e a sigla de cada um (REF-0013 Função + grupos do Status);
  - localização de cada caderno (REF-0013 Localização: salas que citam equipamentos do sistema);
  - o que é genérico (grupo do Status cujo caderno não tem lista de materiais).
Grava: a configuração usada (configs/auto_<pasta>.json), a TABELA DE LOCALIZAÇÃO - LMR.xlsx (pasta do projeto) e a BASE em LMR/SAIDA ATUAL.
Depois: py -X utf8 rodar_workflow_b.py "<BASE>"
"""
import argparse, glob, json, os, re
from gerar_base_lmr import AQUI, SAE, SAIDA, arquivo_raiz, gerar
from rodar_workflow_b import checa_caminho, nomes_saida
from lmr_core import ler_lista_materiais, ler_lista_sobressalentes
from localizacao import (agrupa_por_local, equipamentos_do_sistema, hz_do_trecho, ler_funcao_ref, ler_locais_ref,
                         localizacao_por_nome, manuais, salas_do_sistema, gravar_tabela)

TABELA = arquivo_raiz('TABELA DE LOCALIZAÇÃO - LMR.xlsx')
RE_DOC = re.compile(r'(#ST\d\d=[A-Z0-9-]+&[A-Z]{3}\d{2,3})')


def capitulo_da_pasta(pasta):
    """'.../01 - CONTROLE CENTRALIZADO/SERVIÇOS AUXILIARES ESSENCIAIS/<sistema>' -> 'CONTROLE CENTRALIZADO / SERVIÇOS AUXILIARES ESSENCIAIS'."""
    p = os.path.dirname(os.path.abspath(pasta))
    return ' / '.join(re.sub(r'^\d+\s*-\s*', '', os.path.basename(x)) for x in (os.path.dirname(p), p))


def montar_config(pasta, escopo, subsistema, saida=None, nome=None):
    nome_pasta = os.path.basename(os.path.normpath(pasta))
    status = sorted(glob.glob(os.path.join(pasta, '*_STATUS_PMIB.xlsx')))
    if not status: raise SystemExit(f'Sem *_STATUS_PMIB.xlsx em {pasta}')
    lista = os.path.basename(status[0]).split('_STATUS_PMIB')[0]
    m = re.search(r'=([A-Z]\d\d[A-Z]{3}\d\d)', lista)
    if not m: raise SystemExit(f'Não reconheci o sistema no código da lista: {lista}')
    raiz = m.group(1)

    funcao, locais = ler_funcao_ref(), ler_locais_ref()
    nomes = equipamentos_do_sistema(funcao, raiz)
    prefixos = {n.split('-')[0] for n in nomes} | nomes
    descr_ref = {str(r[6]).strip(): (str(r[7] or '').strip(), str(r[8] or '')) for r in funcao}

    itens = ler_lista_sobressalentes(status[0])
    grupos = {it['item']: [t for t in dict.fromkeys(re.findall(r'[A-Z][A-Z0-9]*', it['grupo_titulo'].upper())) if t in prefixos]
              for it in itens if it['eh_grupo']}
    siglas_status = {s for v in grupos.values() for s in v}

    pdfs = [(p, RE_DOC.search(os.path.basename(p))) for p in sorted(glob.glob(os.path.join(pasta, 'LMR', '#ST*.pdf')))]
    pdfs = [(p, m.group(1)) for p, m in pdfs if m]
    # Sala só vale para os típicos se citar equipamento da MESMA família (BL2, ex. B03BPA10GB010) de algum caderno:
    # no Banco a sala cita HB-01 (GB010) e há o caderno GB010-GB901; nos Painéis (UC012/UC013) nenhuma sala serve.
    familia = lambda rds: rds.split('=')[-1][:13]
    rds_do_nome = {str(r[7]).strip(): str(r[6]).strip() for r in funcao if r[7]}
    fam_cadernos = {familia(d) for _, d in pdfs}
    salas = [s for s in salas_do_sistema(locais, nomes) if any(familia(rds_do_nome.get(c, '')) in fam_cadernos for c in s['citados'])]
    manual = manuais(TABELA, nome_pasta)
    equipamentos, tabela, avisos = [], [], []
    for pdf, doc in pdfs:
        raiz_doc = doc.split('&')[0]; setor = doc[3:5]
        interno, descr = descr_ref.get(raiz_doc, ('', ''))
        palavras = re.findall(r'[A-Z][A-Z0-9]*', descr.upper())
        sigla = (interno if interno else next((p for p in palavras if p in siglas_status), None)
                 or next((p for p in palavras if p in prefixos), None) or raiz_doc.split('-')[-1])
        linhas = ler_lista_materiais(pdf)
        if not linhas and sigla not in siglas_status:
            avisos.append(f'{os.path.basename(pdf)}: sem lista de materiais e sem grupo no Status - ignorado'); continue

        insts = []
        if sigla in manual:
            l = manual[sigla]
            insts.append({'nome': sigla, 'rds': doc, **l, 'fonte_local': 'TABELA DE LOCALIZAÇÃO (MANUAL)'})
        elif (loc := localizacao_por_nome(locais, sigla)):
            insts.append({'nome': sigla, 'rds': doc, 'local': loc['local'], 'elev': loc['elev'], 'eixo': loc['eixo'],
                          'trecho': loc['trecho'], 'fonte_local': f"REF-0013 {loc['codigo']}: {loc['descricao']}"})
        else:
            hz = {'50': '50', '60': '60'}.get(setor)
            minhas = [s for s in salas if hz is None or hz_do_trecho(s['trecho']) in (None, hz)]
            for g in agrupa_por_local(minhas):
                cit = sorted({c for s in minhas if s['codigo'] in g['codigos'] for c in s['citados']})
                insts.append({'nome': sigla, 'rds': doc, 'local': g['local'], 'elev': g['elev'], 'eixo': g['eixo'],
                              'trecho': ', '.join(g['trechos']), 'codigos': g['codigos'],
                              'fonte_local': f"REF-0013: típico aplicado às salas do sistema ({', '.join(cit)}) - {setor} Hz"
                                             if hz else f"REF-0013: típico aplicado às salas do sistema ({', '.join(cit)})"})
            if not insts:
                insts.append({'nome': sigla, 'rds': doc, 'fonte_local': 'A PREENCHER: a REF-0013 não liga este equipamento a uma sala '
                              '(informe na TABELA DE LOCALIZAÇÃO com FONTE = MANUAL)'})
        equipamentos.append({'sigla': sigla, 'pdf': os.path.relpath(pdf, pasta), 'rds_doc': doc, 'instancias': insts, 'n_linhas': len(linhas)})
        for i in insts:
            tabela.append({'SISTEMA': nome_pasta, 'EQUIPAMENTO': sigla, 'RDS-PP': doc, 'LOCAL': i.get('local', ''),
                           'ELEVAÇÃO': i.get('elev', ''), 'EIXO': i.get('eixo', ''), 'TRECHO': i.get('trecho', ''),
                           'CÓDIGO DE LOCALIZAÇÃO': ', '.join(i.get('codigos', [])), 'DESCRIÇÃO NA REF-0013': '',
                           'FONTE': i['fonte_local'], 'CONFERIDO': ''})

    sem_lista = {e['sigla'] for e in equipamentos if not e['n_linhas']}
    cfg = {
        'sistema': nome or nome_pasta.title(), 'pasta': os.path.abspath(pasta), 'escopo': escopo, 'subsistema': subsistema,
        'lista_status': os.path.basename(status[0]), 'lista_sobressalente': lista, 'capitulo': capitulo_da_pasta(pasta),
        'saida_base': saida or f'{SAIDA}/BASE LMR AUTO - {nome or nome_pasta.title()}.xlsx',
        'fallback_descricao': True, 'avisar_grupo_parcial': True, 'equipamentos': equipamentos,
        'grupos': {g: s for g, s in grupos.items() if s},
        # grupo do Status cujo(s) caderno(s) não têm lista de materiais: o material vale 1 por posição do equipamento
        'genericos': {g: s for g, s in grupos.items() if s and set(s) <= sem_lista},
        'pendencias_fixas': avisos,
    }
    return cfg, tabela, nome_pasta


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pasta'); ap.add_argument('--escopo', required=True); ap.add_argument('--subsistema', required=True)
    ap.add_argument('--saida')
    ap.add_argument('--nome', help='nome curto do sistema nos arquivos (ex.: "Banco de Baterias"); padrão: nome da pasta')
    a = ap.parse_args()
    pasta = a.pasta if os.path.isabs(a.pasta) else os.path.join(SAE, a.pasta)
    cfg, tabela, nome = montar_config(pasta, a.escopo, a.subsistema, a.saida, a.nome)
    base = os.path.join(pasta, cfg['saida_base'])
    checa_caminho(base, *nomes_saida(base))  # antes de gravar qualquer coisa
    gravar_tabela(TABELA, nome, tabela)
    os.makedirs(os.path.join(AQUI, 'configs'), exist_ok=True)
    slug = re.sub(r'\W+', '_', nome.lower()).strip('_')
    with open(os.path.join(AQUI, 'configs', f'auto_{slug}.json'), 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=1)
    for e in cfg['equipamentos']:
        print(f"  {e['sigla']:6} {e['n_linhas']:4} linhas no caderno  ->", '; '.join(f"{i.get('trecho') or 'SEM LOCAL'} ({i.get('elev', '')})" for i in e['instancias']))
    gerar(cfg)


if __name__ == '__main__':
    main()

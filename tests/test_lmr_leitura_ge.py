"""Regras puras do leitor de cadernos GE da Aplicação LMR (`aplicacao-lmr/leitura_ge/lmr_core.py`).

A leitura dos PDFs não entra aqui: os documentos reais ficam no Box (regra do repositório).
"""
import importlib.util
from pathlib import Path

_ARQ = Path(__file__).resolve().parents[1] / "aplicacao-lmr" / "leitura_ge" / "lmr_core.py"
_spec = importlib.util.spec_from_file_location("lmr_core_ge", _ARQ)
core = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(core)


def test_expande_faixas_listas_e_tags_coladas():
    assert core.expandir_tags("-27.1...-27.3") == ["27.1", "27.2", "27.3"]
    assert core.expandir_tags("-72.E;-72.G") == ["72.E", "72.G"]
    assert core.expandir_tags("-72.01...-72.03") == ["72.01", "72.02", "72.03"]
    assert core.expandir_tags("-52.110-52.111") == ["52.110", "52.111"]
    assert core.expandir_tags("-52.107...-52.109-52.112") == ["52.107", "52.108", "52.109", "52.112"]
    assert core.expandir_tags("-XACC.1...-XACC.3;-XC.1 -XC.2") == ["XACC.1", "XACC.2", "XACC.3", "XC.1", "XC.2"]
    assert core.expandir_tags("-BTR/ -BTS") == ["BTR", "BTS"]


def test_unidades_por_tag_so_quando_a_divisao_e_exata():
    assert core.unidades_por_tag({"TAG": "-F.1...-F.3", "Quantidade": "6"}) == 2  # base bipolar: 2 fusíveis por TAG
    assert core.unidades_por_tag({"TAG": "-F.1...-F.3", "Quantidade": "4"}) == 1
    assert core.unidades_por_tag({"TAG": "-72.c", "Quantidade": "3"}) == 3


def test_elevacao_no_padrao_do_motor():
    assert core.formata_elev("131,5") == "131,50"
    assert core.formata_elev(115) == "115,00"
    assert core.formata_elev("") == ""


def test_casamento_por_pn_e_por_descricao_sem_trocar_numeros():
    assert core.casa_por_codigo({"pn": "2TAZ110200R1204"}, {"Código": "2TAZ110200R1204", "Designação": ""})
    assert core.casa_por_codigo({"pn": "1SDA064708R1"}, {"Código": "", "Designação": "Disjuntor ..., tipo 1SDA064708R1"})
    assert not core.casa_por_codigo({"pn": "123"}, {"Código": "123", "Designação": ""})  # PN curto demais
    assert not core.casa_por_descricao({"desc": "Minidisjuntor bipolar 16A curva C"},
                                       {"Designação": "Minidisjuntor bipolar 20A curva C"})


def test_rds_da_ref_prefere_o_setor_do_caderno():
    ref = {"PLA-CCR": [("#ST50=B04BMA10UC013-UC018", ""), ("#ST60=B04BMA10UC013-UC015", "")]}
    assert core.rds_da_ref(ref, "PLA-CCR", "#ST60") == ("#ST60=B04BMA10UC013-UC015", 2)
    assert core.rds_da_ref(ref, "PLA-CCR") == ("#ST50=B04BMA10UC013-UC018", 2)
    assert core.rds_da_ref(ref, "INEXISTENTE") == (None, 0)

"""Regras do motor LMR (port do lmr.js do Box). Valores de referência tirados do lmr.js com Node e dados fictícios."""

import pytest

from sigft.services import gerar_lmr_regras as r

BASE = {
    "escopo": "RV", "subsistema": "HIDRÁULICA", "area": "SKID", "rds": "#ST50=M01MKF10UZ001",
    "local": "CASA DE FORÇA", "elev": "98,50", "eixo": "BC", "trecho": "U-01",
}
TAG = {"escopo": "RV", "tag": "XV101", "rds": "#ST50=M01MKF10", "descricao": "VALVULA ESFERA", "pn": "PN-123"}
LONGA = ("VALVULA DE ESFERA TRIPARTIDA EM ACO INOXIDAVEL COM ATUADOR PNEUMATICO DUPLA ACAO, CORPO FLANGEADO "
         "CLASSE 150, SEDE EM PTFE REFORCADO, HASTE ANTIEXPULSAO")


def nomes(ts):
    return [t.nome for t in ts]


def test_constantes():
    assert len(r.UGS) == 20 and r.UGS[9].nome == "U-09A" and r.UGS[19].m == "M20"
    assert r.TRECHO_POR_NOME["F-18"].hz is None
    assert len(r.TRECHOS) == 20 + 4 + 3 + 58 + 6 + 36 + 14 + 27 + 15
    assert r.EIXOS == ("AB", "BC", "CD", "MB", "JB", "JD", "BP", "VT")
    assert r.LIMITE_TAG == 150


def test_trechos_do_projeto():
    assert nomes(r.trechos_do_projeto("ÍMPARES")) == [
        "U-01", "U-03", "U-05", "U-07", "U-09", "U-10", "U-12", "U-14", "U-16", "U-18"]
    pares = nomes(r.trechos_do_projeto("PARES"))
    assert "U-09A" in pares and "U-18A" in pares
    assert nomes(r.trechos_do_projeto("LISTA", ["u1", "F18"])) == ["U-01", "F-18"]
    with pytest.raises(ValueError):
        r.trechos_do_projeto("LISTA", ["X-99"])


def test_trechos_do_material():
    todas = r.trechos_do_projeto("TODAS")
    assert all(t.hz == 60 for t in r.trechos_do_material(todas, 60))
    assert len(r.trechos_do_material(todas, "AMBAS")) == 20
    assert r.trechos_do_material(todas, None) == []
    amd = r.trechos_do_projeto("AMD")
    assert r.trechos_do_material(amd, 50) == amd


def test_expande_rds():
    m = "#ST[XX]=M[XX]MKF10UZ001"
    assert r.expande_rds(m, "U-09A") == "#ST50=M19MKF10UZ001"
    assert r.expande_rds(m, "U-10") == "#ST60=M10MKF10UZ001"
    assert r.expande_rds(m, "AMD-03") == m


def test_elevacao_local_eixo_trecho():
    assert r.formata_elevacao("106,105") == ("106,11", "elevação 106,105 arredondada para 106,11")
    assert r.formata_elevacao("98.5") == ("98,50", None)
    assert r.formata_elevacao("EL 104.200") == ("104,20", None)
    assert r.formata_elevacao("x") == (None, "elevação inválida: x")
    assert r.formata_elevacao("") == (None, None)
    assert r.normaliza_local("CASA DE FORCA") == "CASA DE FORÇA"
    assert r.normaliza_local("SALA") is None
    assert r.normaliza_eixo("B-C") == "BC"
    assert r.normaliza_eixo("XY") is None
    assert r.normaliza_trecho("u 9a") == "U-09A"
    assert r.normaliza_trecho("amc2") == "AMC-02"
    assert r.normaliza_trecho("U-21") is None


def test_monta_codigo():
    assert r.monta_codigo(BASE) == ("RV - HIDRÁULICA - SKID - RDS-PP: #ST50=M01MKF10UZ001 - CASA DE FORÇA"
                                    " - ELEV. 98,50 - EIXO BC - TRECHO U-01")
    pai = {**BASE, "pais": [{"tag": "GP151", "rds": "#ST50=M01MKF10"}]}
    assert r.monta_codigo(pai) == ("RV - HIDRÁULICA - GP151 - RDS-PP: #ST50=M01MKF10GP151 - CASA DE FORÇA"
                                   " - ELEV. 98,50 - EIXO BC - TRECHO U-01")
    vazio = {**BASE, "eixo": "", "rds": None}
    assert r.monta_codigo(vazio) == ("RV - HIDRÁULICA - SKID - RDS-PP: [?] - CASA DE FORÇA"
                                     " - ELEV. 98,50 - EIXO [?] - TRECHO U-01")


@pytest.mark.parametrize("extra, esperado", [
    ({"caso_rds": 1}, "RV - XV101 - RDS-PP: #ST50=M01MKF10XV101 - VALVULA ESFERA (PN-123)"),
    ({"caso_rds": 1, "pn": ""}, "RV - XV101 - RDS-PP: #ST50=M01MKF10XV101 - VALVULA ESFERA"),
    ({"caso_rds": 3}, "RV - XV101 - VALVULA ESFERA (PN-123)"),
    ({"caso_rds": 3, "pn": None}, "RV - XV101 - VALVULA ESFERA"),
    ({"tag": None}, "RV - VALVULA ESFERA (PN-123)"),
    ({"tag": None, "pn": ""}, "RV - VALVULA ESFERA"),
])
def test_monta_tag(extra, esperado):
    assert r.monta_tag({**TAG, **extra}) == esperado


def test_monta_tag_corta_em_150():
    t = r.monta_tag({**TAG, "caso_rds": 1, "descricao": LONGA})
    assert t == ("RV - XV101 - RDS-PP: #ST50=M01MKF10XV101 - VALVULA DE ESFERA TRIPARTIDA EM ACO INOXIDAVEL"
                 " COM ATUADOR PNEUMATICO DUPLA ACAO, CORPO FLANGEADO (PN-123)")
    assert len(t) <= 150
    t = r.monta_tag({**TAG, "tag": None, "descricao": LONGA, "pn": ""})
    assert t == ("RV - VALVULA DE ESFERA TRIPARTIDA EM ACO INOXIDAVEL COM ATUADOR PNEUMATICO DUPLA ACAO,"
                 " CORPO FLANGEADO CLASSE 150, SEDE EM PTFE REFORCADO, HASTE")


def test_hash_e_assinatura():
    assert r.hash_linha("a") == 0xE40C292C
    assert r.hash_linha("") == 2166136261
    assert r.hash_linha("AÇÃO é ü") == 2820372476
    assert r.hash_linha("😀x") == 2673392192  # par substituto UTF-16, como o charCodeAt
    assert r.assinatura_soma(3, 0x1FFFFFFFF) == "3-FFFFFFFF"

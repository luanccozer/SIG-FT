"""Geração e validação da Aplicação LMR. Dados fictícios; a assinatura de referência veio do geraLote do lmr.js (Node)."""

from dataclasses import replace

from sigft.services.gerar_lmr_motor import LinhaCsv, Material, gerar
from sigft.services.gerar_lmr_regras import trechos_do_projeto

F1 = "1234567890.0001"
F2 = "1234567890.0002"
CAT = {
    F1: Material(F1, "VALVULA ESFERA", "PN-1", False),
    F2: Material(F2, "OLEO LUBRIFICANTE", "", True),
}
BASE = LinhaCsv(
    n=1, ficha=F1, area="SKID", rds="#ST50=M01MKF10UZ001", tag="XV101", tag_com_rds=True,
    pais=[], local="CASA DE FORÇA", elevacao="98,5", eixo="BC", trechos="U-01",
    qtd=1, documento="DOC-1", pagina="1",
)
TODAS = trechos_do_projeto("TODAS")


def roda(*linhas, projeto=TODAS, catalogo=CAT):
    return gerar(list(linhas), catalogo, escopo="RV", subsistema="HIDRÁULICA", projeto=projeto)


def regras(res, severidade="bloqueia"):
    return {a.regra for a in res.achados if a.severidade == severidade}


def test_todas_com_qtd_2_em_20_ugs():
    res = roda(replace(BASE, trechos="TODAS", qtd=2))
    assert len(res.linhas) == 40 and res.bloqueadas == 0 and res.assinatura.startswith("40-")


def test_rds_bloqueado_entra_na_assinatura():
    res = roda(replace(BASE, rds="", trechos="U-01, U-03"))
    assert res.linhas == [] and res.bloqueadas == 2 and res.assinatura.startswith("2-")


def test_60hz_em_projeto_impares():
    res = roda(replace(BASE, trechos="60HZ", rds="#ST[XX]=M[XX]MKF10UZ001"), projeto=trechos_do_projeto("ÍMPARES"))
    trechos = [c.rsplit("TRECHO ", 1)[1] for _, c, _ in res.linhas]
    assert trechos == ["U-10", "U-12", "U-14", "U-16", "U-18"]


def test_granel_1_por_trecho():
    res = roda(replace(BASE, ficha=F2, trechos="U-01, U-03", qtd=50))
    assert len(res.linhas) == 2


def test_nao_granel_sem_qtd_bloqueia_v1():
    res = roda(replace(BASE, qtd=None))
    assert res.linhas == [] and "V1" in regras(res) and res.bloqueadas == 1


def test_m01_com_u02_bloqueia_v4():
    res = roda(replace(BASE, trechos="U-02"))
    assert "V4" in regras(res) and res.linhas == []


def test_st60_com_m01_bloqueia_v5():
    res = roda(replace(BASE, rds="#ST60=M01MKF10UZ001"))
    assert "V5" in regras(res) and res.linhas == []


def test_eixo_e_local_fora_da_lista_v14():
    assert "V14" in regras(roda(replace(BASE, eixo="XXXX")))
    assert "V14" in regras(roda(replace(BASE, local="SALA QUALQUER")))


def test_elevacao_normalizada():
    res = roda(BASE)
    assert "ELEV. 98,50" in res.linhas[0][1] and res.bloqueadas == 0


def test_foco_3_trechos_vazios_bloqueiam_v15():
    vazio = roda(replace(BASE, trechos=""))
    amd = roda(replace(BASE, trechos="TODAS"), projeto=trechos_do_projeto("AMD"))
    so50 = roda(replace(BASE, trechos="60HZ"), projeto=trechos_do_projeto("LISTA", ["U-01", "U-02"]))
    for res, valor in ((vazio, ""), (amd, "TODAS"), (so50, "60HZ")):
        v15 = [a for a in res.achados if a.regra == "V15"]
        assert v15 and v15[0].severidade == "bloqueia"
        assert v15[0].mensagem == f"nenhum trecho do projeto para {valor}"
        assert res.linhas == [] and res.bloqueadas == 1


def test_trecho_fora_do_projeto_v15():
    res = roda(BASE, projeto=trechos_do_projeto("PARES"))
    assert "V15" in regras(res)


def test_ficha_fora_do_catalogo_v6():
    res = roda(replace(BASE, ficha="9999999999.0001"))
    assert "V6" in regras(res) and res.linhas == []


def test_cobertura_v12():
    res = roda(BASE)
    v12 = [a for a in res.achados if a.regra == "V12"]
    assert [a.ficha for a in v12] == [F2] and v12[0].severidade == "aviso"


def test_pai_sem_tag_de_material_v6_aviso_uma_vez():
    pai = [{"tag": "GP151", "rds": "#ST50=M01MKF10"}]
    res = roda(replace(BASE, pais=pai, trechos="U-01"), replace(BASE, n=2, pais=pai, tag="XV102"))
    v6 = [a for a in res.achados if a.regra == "V6"]
    assert len(v6) == 1 and v6[0].severidade == "aviso"


def test_igual_ao_gera_lote_do_lmr_js():
    # mesma linha que o geraLote recebeu no Node: TRECHOS "U-01, U-10", QTD 2, pai GP151 → "4-4C2D5CD4"
    linha = replace(BASE, pais=[{"tag": "GP151", "rds": "#ST50=M01MKF10"}], trechos="U-01, U-10", qtd=2)
    res = roda(linha)
    assert res.assinatura == "4-4C2D5CD4"
    assert res.linhas[0] == (
        F1,
        "RV - HIDRÁULICA - GP151 - RDS-PP: #ST50=M01MKF10GP151 - CASA DE FORÇA - ELEV. 98,50 - EIXO BC - TRECHO U-01",
        "RV - XV101 - RDS-PP: #ST50=M01MKF10UZ001XV101 - VALVULA ESFERA (PN-1)",
    )
    assert "#ST60=M10MKF10UZ001XV101" in res.linhas[2][2]

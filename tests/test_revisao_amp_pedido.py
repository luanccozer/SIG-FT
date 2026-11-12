"""O pedido de cada lista para o AMP: os arquivos como estão na pasta e a mensagem que o SIG-FT
monta sozinho, e quais listas têm o que precisa. O SIG-FT não lê mais o conteúdo dos arquivos.
Desenho: `docs/superpowers/specs/2026-11-03-amp-revisao-com-arquivos-design.md`, §5.2.
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

from sigft.core.aconex.cliente import Versao
from sigft.services import conferencia_revisoes as cr
from sigft.services import revisao_amp as ra

CODIGO = "#ITA0=Y01TF001&BPB020"
HOJE = date(2026, 11, 3)


def _lista(codigo=CODIGO, ultima="0B", em_uso="0A", status_real="Aprovado"):
    return cr.ListaNaMapeadora(codigo, ultima, "Em Processo", status_real, em_uso,
                               f"Lista {codigo[-3:]}/{codigo}_STATUS_PMIB.xlsx")


def _pasta(raiz: Path, codigo=CODIGO, pdfs=(), com_status=True) -> Path:
    pasta = raiz / f"Lista {codigo[-3:]}"
    pasta.mkdir(parents=True, exist_ok=True)
    if com_status:
        (pasta / f"{codigo}_STATUS_PMIB.xlsx").write_bytes(b"planilha")
    for revisao in pdfs:
        (pasta / cr.nome_do_pdf(codigo, revisao)).write_bytes(b"%PDF")
    return pasta


def _conferencia(*itens):
    return cr.Conferencia(list(itens), em_dia=0, sem_status_pmib=0)


def _uma_lista(tmp_path, *, em_uso="0A", ultima="0B"):
    pasta = _pasta(tmp_path, pdfs=(em_uso, ultima) if em_uso else (ultima,))
    item = cr.ItemConferencia(_lista(ultima=ultima, em_uso=em_uso), "aprovada", pasta)
    [lista] = ra.listas_para_amp(_conferencia(item), [], tmp_path, None)
    return lista


# ------------------------------------------------------------------ quais listas vão

def test_listas_usam_os_pdfs_baixados_na_sessao(tmp_path):
    pasta = _pasta(tmp_path, pdfs=("0A",))
    baixado = pasta / cr.nome_do_pdf(CODIGO, "0C")
    baixado.write_bytes(b"%PDF")
    downloads = [cr.Download(CODIGO, "0C", baixado, "baixado", "mapeadora desatualizada: o Aconex está na 0C"),
                 cr.Download(CODIGO, "0A", pasta / cr.nome_do_pdf(CODIGO, "0A"), "ja_existia")]
    [lista] = ra.listas_para_amp(_conferencia(cr.ItemConferencia(_lista(), "aprovada", pasta)),
                                 downloads, tmp_path, None)
    assert (lista.revisao_atual, lista.pdf_atual, lista.falta) == ("0C", baixado, "")
    assert lista.pdf_em_uso == pasta / cr.nome_do_pdf(CODIGO, "0A")
    assert lista.status_pmib == pasta / f"{CODIGO}_STATUS_PMIB.xlsx"


def test_listas_sem_download_procuram_pelo_nome(tmp_path):
    pasta = _pasta(tmp_path, pdfs=("0A", "0B"))
    [lista] = ra.listas_para_amp(_conferencia(cr.ItemConferencia(_lista(), "aprovada", pasta)), [], tmp_path, None)
    assert (lista.revisao_atual, lista.pdf_atual.name, lista.pdf_em_uso.name, lista.falta) == (
        "0B", cr.nome_do_pdf(CODIGO, "0B"), cr.nome_do_pdf(CODIGO, "0A"), "")


def test_lista_sem_revisao_em_uso_nao_exige_esse_pdf(tmp_path):
    lista = _uma_lista(tmp_path, em_uso="", ultima="0")
    assert (lista.pdf_em_uso, lista.falta) == (None, "")


def test_o_que_falta_aparece_e_a_ordem_e_a_das_categorias(tmp_path):
    outro = "#ST00=X01MPB020&MPB020"
    pasta_ok = _pasta(tmp_path, outro, pdfs=("0A", "0B"))
    pasta_sem = _pasta(tmp_path, pdfs=("0A",))
    pasta_sem_status = _pasta(tmp_path / "s", "#ZZ00=1&MPB020", pdfs=("0A", "0B"), com_status=False)
    listas = ra.listas_para_amp(_conferencia(
        cr.ItemConferencia(_lista(outro, status_real="Em Processo"), "em_processo", pasta_ok),
        cr.ItemConferencia(_lista(), "aprovada", pasta_sem),
        cr.ItemConferencia(_lista("#ZZ00=1&MPB020"), "outros", pasta_sem_status)), [], tmp_path, None)
    assert [(lst.item.lista.codigo, lst.falta) for lst in listas] == [
        (CODIGO, "falta: PDF da revisão atual"),
        (outro, ""),
        ("#ZZ00=1&MPB020", "falta: _STATUS_PMIB"),
    ]


NOVO, ANTIGO = "#ST00=B01BMU10TA010&EPB020", "#ST00=B01MSE10&EPB020"


def test_pdf_da_revisao_em_uso_com_o_codigo_antigo_vale(tmp_path):
    """[2026-11-12] O caso do Luan: a lista mudou de código no Aconex (o RDS-PP mudou), e a 0C,
    baixada à mão, veio com o código antigo. Ficava "falta: PDF da revisão em uso", sem caixa."""
    pasta = _pasta(tmp_path, NOVO, pdfs=("0",))
    manual = pasta / cr.nome_do_pdf(ANTIGO, "0C")
    manual.write_bytes(b"%PDF")
    downloads = [cr.Download(NOVO, "0", pasta / cr.nome_do_pdf(NOVO, "0"), "baixado")]
    item = cr.ItemConferencia(_lista(NOVO, ultima="0", em_uso="0C"), "aprovada", pasta)
    [lista] = ra.listas_para_amp(_conferencia(item), downloads, tmp_path, None)
    assert (lista.pdf_em_uso, lista.falta) == (manual, "")
    assert ra.com_outro_codigo(lista) == [manual]
    assert "(arquivo #ST00=B01MSE10&EPB020[0C].pdf)" in ra.mensagem_da_lista(lista, hoje=HOJE)


def test_pdf_com_o_codigo_da_lista_nao_e_outro_codigo(tmp_path):
    assert ra.com_outro_codigo(_uma_lista(tmp_path)) == []


def test_pdf_apagado_depois_do_download_volta_a_faltar(tmp_path):
    # A releitura das pastas (botão Reler as pastas) vê o que está na pasta, não o que foi baixado.
    pasta = _pasta(tmp_path, pdfs=("0A",))
    downloads = [cr.Download(CODIGO, "0C", pasta / cr.nome_do_pdf(CODIGO, "0C"), "baixado")]
    [lista] = ra.listas_para_amp(_conferencia(cr.ItemConferencia(_lista(), "aprovada", pasta)), downloads,
                                 tmp_path, None)
    assert (lista.revisao_atual, lista.pdf_atual, lista.falta) == ("0C", None, "falta: PDF da revisão atual")


# ------------------------------------------------------------------ o que falta, do Aconex (2026-11-12)

class _Aconex:
    """Dublê do `ClienteAconex`, com o que `conferencia_revisoes.baixar` usa."""

    def __init__(self, vigentes, historico=None):
        self.vigentes, self.historico, self.baixados = vigentes, historico or {}, []

    def versao_vigente(self, codigo):
        return self.vigentes.get(codigo)

    def versao(self, codigo, revisao):
        return self.historico.get((codigo, revisao))

    def baixar(self, document_id):
        self.baixados.append(document_id)
        return f"%PDF {document_id}".encode()


def _item_em(raiz: Path, sub: str, codigo: str, *, ultima: str, em_uso: str, pdfs=()):
    pasta = _pasta(raiz / sub, codigo, pdfs=pdfs)
    link = (pasta / f"{codigo}_STATUS_PMIB.xlsx").relative_to(raiz).as_posix()
    return cr.ItemConferencia(cr.ListaNaMapeadora(codigo, ultima, "Em Processo", "Aprovado", em_uso, link),
                              "aprovada", pasta)


def test_faltam_pdfs_e_so_o_que_o_aconex_tem(tmp_path):
    completa = _item_em(tmp_path, "a", CODIGO, ultima="0B", em_uso="0A", pdfs=("0A", "0B"))
    sem_em_uso = _item_em(tmp_path, "b", NOVO, ultima="0", em_uso="0C", pdfs=("0",))
    sem_atual = _item_em(tmp_path, "c", ANTIGO, ultima="0D", em_uso="0C", pdfs=("0C",))
    listas = ra.listas_para_amp(_conferencia(completa, sem_em_uso, sem_atual), [], tmp_path, None)
    assert [ra.faltam_pdfs(lista) for lista in listas] == [False, True, True]


def test_baixar_o_que_falta_baixa_so_das_listas_com_falta_e_a_releitura_ve(tmp_path):
    completa = _item_em(tmp_path, "a", CODIGO, ultima="0B", em_uso="0A", pdfs=("0A", "0B"))
    sem_em_uso = _item_em(tmp_path, "b", NOVO, ultima="0", em_uso="0C", pdfs=("0",))
    conferencia = _conferencia(completa, sem_em_uso)
    listas = ra.listas_para_amp(conferencia, [], tmp_path, None)
    assert [lista.falta for lista in listas] == ["", "falta: PDF da revisão em uso"]
    # A 0C desta lista está no Aconex com o código antigo: o cliente a acha pelo Tracking ID.
    aconex = _Aconex({CODIGO: Versao("100", CODIGO, "0B", 2, True), NOVO: Versao("300", NOVO, "0", 4, True)},
                     {(NOVO, "0C"): Versao("201", ANTIGO, "0C", 3, False, "T-77")})
    logs = []
    downloads = ra.baixar_o_que_falta(listas, aconex, log_cb=logs.append)
    assert aconex.baixados == ["201"]
    assert [(d.codigo, d.revisao, d.situacao) for d in downloads] == [(NOVO, "0", "ja_existia"),
                                                                      (NOVO, "0C", "baixado")]
    [_completa, relida] = ra.listas_para_amp(conferencia, downloads, tmp_path, None)
    assert (relida.falta, relida.pdf_em_uso.name) == ("", cr.nome_do_pdf(NOVO, "0C"))
    assert any("Baixando 1 lista(s)" in linha for linha in logs)


def test_baixar_o_que_falta_sem_falta_nao_chama_o_aconex(tmp_path):
    aconex = _Aconex({})
    assert ra.baixar_o_que_falta([_uma_lista(tmp_path)], aconex, log_cb=lambda _m: None) == []
    assert aconex.baixados == []


def test_lista_sem_pasta_fica_de_fora(tmp_path):
    item = cr.ItemConferencia(_lista(), "outros", None, cr.MOTIVO_SEM_PASTA)
    assert ra.listas_para_amp(_conferencia(item), [], tmp_path, None) == []


# ------------------------------------------------------------------ a mensagem e o pedido

def test_mensagem_tem_a_lista_as_revisoes_os_arquivos_e_a_data(tmp_path):
    lista = _uma_lista(tmp_path)
    assert ra.mensagem_da_lista(lista, hoje=HOJE) == (
        f"Lista: {CODIGO}. Revisão em uso: 0A (arquivo {cr.nome_do_pdf(CODIGO, '0A')}). "
        f"Revisão atual: 0B (arquivo {cr.nome_do_pdf(CODIGO, '0B')}). "
        f"Controle: {CODIGO}_STATUS_PMIB.xlsx. Data de hoje: 03/11/2026. Faça a revisão.")


def test_mensagem_sem_revisao_em_uso(tmp_path):
    mensagem = ra.mensagem_da_lista(_uma_lista(tmp_path, em_uso="", ultima="0"), hoje=HOJE)
    assert ("Revisão em uso: nenhuma (a lista ainda não tem revisão em uso: compare só a revisão atual "
            "com o controle).") in mensagem
    assert f"Revisão atual: 0 (arquivo {cr.nome_do_pdf(CODIGO, '0')})." in mensagem


def test_pedido_leva_os_arquivos_como_estao_e_a_mensagem(tmp_path):
    lista = _uma_lista(tmp_path)
    pedido = ra.montar_pedido(lista, hoje=HOJE)
    assert pedido.campos == {"modo": "revisar", "mensagem": ra.mensagem_da_lista(lista, hoje=HOJE)}
    assert pedido.arquivos == {"revisao_em_uso": lista.pdf_em_uso, "revisao_atual": lista.pdf_atual,
                               "status_pmib": lista.status_pmib}
    assert list(pedido.arquivos) == ["revisao_em_uso", "revisao_atual", "status_pmib"]


def test_pedido_sem_revisao_em_uso_vai_com_dois_arquivos(tmp_path):
    pedido = ra.montar_pedido(_uma_lista(tmp_path, em_uso="", ultima="0"), hoje=HOJE)
    assert list(pedido.arquivos) == ["revisao_atual", "status_pmib"]


def test_o_sigft_nao_le_mais_o_conteudo():
    for nome in ("texto_do_pdf", "status_pmib_em_tsv", "TextoPdf", "TabelaStatus", "codigos_para_eco"):
        assert not hasattr(ra, nome), nome

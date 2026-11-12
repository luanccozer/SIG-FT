r"""
Upload de Condições: o robô não achava os campos (2026-11-12).

Log do usuário: `Input_PackingLength` -- o primeiro campo da aba -- estourou os
20 s com o seletor `//*[@id="b10-b17-b1-Input_PackingLength"]`, e depois a
ficha seguiu tentando mais ~15 campos, as outras 3 abas e 4 "Salvando...", cada
um falhando com `NavegadorFechado`.

Este arquivo cobre as duas frentes do conserto (plano
`docs/superpowers/plans/2026-11-12-condicoes-seletores-robustos.md`):

  * T1/T2  o seletor casa pelo SUFIXO estável do id (o prefixo é gerado pelo
           portal), com o id inteiro de hoje como 1ª tentativa;
  * T3     o portão da aba espera o 1º campo e, se ele não vem, diz o que viu;
  * T4     navegador fechado e parada encerram na hora.

⚠️ Nada disto foi exercido contra o portal real. O DOM abaixo é uma ideia do
Claude sobre o portal (ids montados a partir das constantes), e o XPath é
avaliado pelo lxml -- o mesmo XPath 1.0 dos navegadores.
"""
from __future__ import annotations

import pytest

etree = pytest.importorskip("lxml.etree", reason="lxml e usado para avaliar o XPath")

from sigft.core.rpa import portal as portal_mod  # noqa: E402
from sigft.core.rpa import seletores_condicoes as sc  # noqa: E402
from sigft.core.rpa.engine import NavegadorFechado, TempoEsgotado  # noqa: E402
from sigft.core.rpa.portal import PMIBPortal  # noqa: E402
from sigft.services import upload_conditions  # noqa: E402

MENSAGEM = {
    "Armazenamento": "As condições de armazenamento foram modificadas com sucesso!",
    "Transporte": "As condições de transporte e movimentação foram modificadas com sucesso!",
    "Manutenção": "As condições de manutenção foram modificadas com sucesso!",
    "Descarte": "As condições de descarte foram modificadas com sucesso!",
}


def _html(ids, troca, sem):
    """Monta o DOM a partir dos ids conhecidos. `troca` = (velho, novo) aplicado
    ao começo de cada id (simula o portal que mudou o prefixo); `sem` = sufixos
    que NÃO existem na página."""
    velho, novo = troca
    partes = []
    vistos = set()
    for campo in ids:
        if campo.sufixo in sem:
            continue
        id_real = campo.id_conhecido.replace(velho, novo, 1)
        if id_real in vistos:
            continue
        vistos.add(id_real)
        if campo.sufixo == "Title":
            interno = "<div></div>" * 5
        elif campo.sufixo.startswith("$b"):
            n = int(campo.sufixo[2:])
            interno = "<div></div>" * (n - 1) + "<div><button></button></div>"
        elif campo.depois == "/button":
            interno = "<button></button>"
        else:
            interno = ""
        partes.append(f'<div id="{id_real}">{interno}</div>')
    return "<html><body>" + "".join(partes) + "</body></html>"


class DomFalso:
    """Motor duck-typed sobre um DOM de verdade (lxml). Clicar num botão de
    SALVAR faz nascer o toast da seção, como no portal."""

    def __init__(self, *, troca=("b10-", "b10-"), sem=(), secoes_mudas=(),
                 ao_clicar_salvar=None, fechar_na_escrita=None, ao_escrever=None):
        self.doc = etree.fromstring(
            _html(sc.todos_os_campos(), troca, set(sem)), etree.HTMLParser(encoding="utf-8"))
        self.secoes_mudas = set(secoes_mudas)
        self.ao_clicar_salvar = ao_clicar_salvar
        self.fechar_na_escrita = fechar_na_escrita
        self.ao_escrever = ao_escrever
        self.fechado = False
        self.toasts = []
        self.valores = {}
        self.marcados = {}
        self.tocados = []          # (acao, id real)
        self.esperas_longas = 0    # esperas que estouraram (20 s no portal)
        self.esperou = []
        self.escritas = 0

    # -- infraestrutura ----------------------------------------------------
    def _vivo(self):
        if self.fechado:
            raise NavegadorFechado("Target page, context or browser has been closed")

    def _achar(self, seletor):
        return self.doc.xpath(seletor)

    def _um(self, seletor):
        self._vivo()
        achados = self._achar(seletor)
        if not achados:
            self.esperas_longas += 1
            raise TempoEsgotado(f"Timeout 20000ms exceeded. waiting for {seletor}")
        return achados[0]

    @staticmethod
    def _secao_do_botao(elemento):
        acima = [e.get("id", "") for e in elemento.iterancestors()]
        for id_ in acima:
            for marca, secao in (("b35-Button", "Armazenamento"), ("$b3", "Transporte"),
                                 ("$b4", "Manutenção"), ("$b5", "Descarte")):
                if id_.endswith(marca):
                    return secao
        return None

    # -- leitura -----------------------------------------------------------
    def contar(self, seletor):
        self._vivo()
        if seletor == portal_mod.XPATH_MENSAGEM_DE_FEEDBACK:
            return len(self.toasts)
        return len(self._achar(seletor))

    def element_exists(self, seletor):
        return self.contar(seletor) > 0

    def atributo(self, seletor, nome):
        self._vivo()
        achados = self._achar(seletor)
        return (achados[0].get(nome) or "") if achados else ""

    def texto(self, seletor):
        self._vivo()
        for posicao, mensagem in enumerate(self.toasts, start=1):
            if seletor == f"({portal_mod.XPATH_MENSAGEM_DE_FEEDBACK})[{posicao}]":
                return mensagem
        return ""

    def get_value(self, seletor):
        return self.valores.get(self._um(seletor).get("id"), "")

    def esta_marcado(self, seletor):
        return self.marcados.get(self._um(seletor).get("id"), False)

    def current_url(self):
        self._vivo()
        return "https://portal.exemplo/Fichas"

    # -- ações -------------------------------------------------------------
    def wait_visible(self, seletor):
        self.esperou.append(seletor)
        self._um(seletor)

    def click(self, seletor):
        el = self._um(seletor)
        self.tocados.append(("click", el.get("id") or seletor))
        secao = self._secao_do_botao(el) if el.tag == "button" else None
        if secao:
            if self.ao_clicar_salvar:
                self.ao_clicar_salvar(secao)
            if secao not in self.secoes_mudas:
                self.toasts.append(MENSAGEM[secao])

    def click_dom(self, seletor):
        el = self._um(seletor)
        self.tocados.append(("click_dom", el.get("id")))
        self.marcados[el.get("id")] = not self.marcados.get(el.get("id"), False)

    def fill(self, seletor, texto):
        el = self._um(seletor)
        self.escritas += 1
        if self.fechar_na_escrita and self.escritas == self.fechar_na_escrita:
            self.fechado = True
            self._vivo()
        self.tocados.append(("fill", el.get("id")))
        self.valores[el.get("id")] = texto
        if self.ao_escrever:
            self.ao_escrever(self.escritas)

    def fill_estrito(self, seletor, texto):
        self.fill(seletor, texto)

    def focar(self, seletor):
        self._um(seletor)

    def press(self, teclas):
        self._vivo()

    def digitar_no_foco(self, texto):
        self._vivo()

    def goto(self, url):
        self._vivo()

    def screenshot(self, caminho):
        self._vivo()


FICHA = {
    "pmib_codigo": "4500063671.1234",
    "dimensoes": {"comprimento": "30", "largura": "20", "altura": "15"},
    "controle_temperatura": {
        "necessidade": "NÃO",
        "climatizacao": {"ativo": False, "temp_max": "", "temp_min": ""},
        "umidade": {"ativo": False, "hr_max": "", "hr_min": ""},
    },
    "posicao_armazenamento": "Vertical",
    "nocivo": {"status": "Não contém", "cuidado_es": "", "cuidado_pt": ""},
    "peso": {"liquido": "12,5", "bruto": "13,0"},
    "sujeito_intemperie": "NÃO",
    "protecao": ["SN"],
    "empilhamento": "5",
    "outros_cuidados": {"status": "NÃO", "cuidado_es": "", "cuidado_pt": ""},
    "embalagem_transp_es": "Caja", "embalagem_transp_pt": "Caixa",
    "posicao_icagem_es": "Asas", "posicao_icagem_pt": "Alças",
    "cuidad_preserv_es": "a", "cuidad_preserv_pt": "b",
    "limpeza_secagem_es": "c", "limpeza_secagem_pt": "d",
    "ferramentas_es": "e", "ferramentas_pt": "f",
    "legislacao_es": "g", "legislacao_pt": "h",
    "perigoso_10004": "NÃO",
    "descarte_es": "i", "descarte_pt": "j",
    "logistica_reversa": {"status": "NÃO", "logistica_reversa_es": "", "logistica_reversa_pt": ""},
}


@pytest.fixture(autouse=True)
def sem_espera_real(monkeypatch):
    monkeypatch.setattr(upload_conditions.time, "sleep", lambda _s: None)
    monkeypatch.setattr(portal_mod, "TIMEOUT_CONFIRMACAO_S", 0.0)


def _automacao(engine):
    automacao = upload_conditions.UploadAutomation()
    automacao.engine = engine
    automacao.portal = PMIBPortal(engine)
    automacao.portal.pesquisar_e_abrir = lambda *a, **k: True
    automacao.marcadas = []
    automacao.atualizar_status_excel = (
        lambda caminho, pmib, status, cb=None, ask=None: automacao.marcadas.append((pmib, status)))
    return automacao


def _rodar(engine, fichas=None, automacao=None):
    automacao = automacao or _automacao(engine)
    linhas = []
    resultado = automacao.processar_lista(
        [dict(f) for f in (fichas or [FICHA])], "/tmp/status.xlsx", callback_log=linhas.append)
    return automacao, linhas, resultado


def _ids_tocados(engine, acao):
    return [i for a, i in engine.tocados if a == acao]


# =============================================================================
# O XPath de sufixo (T1)
# =============================================================================
def _doc(*ids):
    corpo = "".join(f'<div id="{i}"></div>' for i in ids)
    return etree.fromstring(f"<html><body>{corpo}</body></html>", etree.HTMLParser())


def test_checkbox4_nao_casa_checkbox40_nem_meucheckbox4():
    """XPath 1.0 não tem `ends-with`; `contains()` casaria `Checkbox40`."""
    doc = _doc("b1-Checkbox4", "b1-Checkbox40", "b1-Checkbox41", "b1-MeuCheckbox4")

    achados = doc.xpath(sc.seletor_por_sufixo("Checkbox4"))

    assert [e.get("id") for e in achados] == ["b1-Checkbox4"]


def test_o_xpath_de_sufixo_e_valido_para_o_cifrao_e_o_hifen_dos_ids_gerados():
    doc = _doc("b11-b17-$b3", "b11-b17-b1-RadioButton5-input", "b11-b17-b1-b35-Button")

    assert len(doc.xpath(sc.seletor_por_sufixo("$b3"))) == 1
    assert len(doc.xpath(sc.seletor_por_sufixo("RadioButton5-input"))) == 1
    assert len(doc.xpath(sc.seletor_por_sufixo("b35-Button"))) == 1


def test_prefixo_conhecido_escopa_o_casamento():
    doc = _doc("p1-b1-RadioButton1-input", "p1-b5-RadioButton1-input")

    assert len(doc.xpath(sc.seletor_por_sufixo("RadioButton1-input"))) == 2
    escopado = doc.xpath(sc.seletor_por_sufixo("RadioButton1-input", "p1-b5-"))
    assert [e.get("id") for e in escopado] == ["p1-b5-RadioButton1-input"]


def test_todo_literal_de_id_do_modulo_virou_constante():
    """Uma implementação por conceito: não sobrou `//*[@id="b10-...` no serviço."""
    import pathlib
    fonte = pathlib.Path(upload_conditions.__file__).read_text(encoding="utf-8")

    assert "b10-b17" not in fonte
    assert "b10-Conditions_Header" not in fonte
    assert len(sc.todos_os_campos()) >= 50


def test_os_sufixos_repetidos_entre_sub_abas_estao_levantados():
    assert set(sc.repetidos()) == {"RadioButton1-input", "RadioButton2-input"}


# =============================================================================
# 1. id de hoje existe -> usa o id de hoje, sem aviso (T2)
# =============================================================================
def test_id_de_hoje_existente_e_usado_sem_log_de_id_novo():
    engine = DomFalso()
    automacao, linhas, (completas, incompletas) = _rodar(engine)

    assert completas == ["4500063671.1234"] and incompletas == []
    assert "b10-b17-b1-Input_PackingLength" in _ids_tocados(engine, "fill")
    assert not any("Id novo" in l for l in linhas)


# =============================================================================
# 2. só existe o id com OUTRO prefixo -> preenche pelo sufixo e loga UMA vez
# =============================================================================
def test_prefixo_mudou_preenche_pelo_sufixo_e_loga_o_id_novo_uma_vez():
    engine = DomFalso(troca=("b10-", "b11-"))
    automacao, linhas, (completas, incompletas) = _rodar(engine)

    assert completas == ["4500063671.1234"], linhas
    preenchidos = _ids_tocados(engine, "fill")
    assert "b11-b17-b1-Input_PackingLength" in preenchidos
    assert "b11-b17-b5-TextArea_TypeLegislationPT" in preenchidos
    assert not any(i.startswith("b10-") for i in preenchidos)
    novos = [l for l in linhas if "Id novo" in l]
    assert len(novos) == 1, novos
    assert "'b11-" in novos[0] and "'b10-" in novos[0], "a linha é a prova de H1"


def test_sel_cai_no_sufixo_so_quando_o_id_de_hoje_nao_existe():
    engine = DomFalso(troca=("b10-", "b11-"))
    automacao = _automacao(engine)

    escolhido = automacao._sel(sc.ARM_PESO_BRUTO)

    assert engine.doc.xpath(escolhido)[0].get("id") == "b11-b17-b1-Input_GrossWeight"


def test_sel_sem_nenhum_dos_dois_devolve_o_id_de_hoje_como_antes():
    """Nenhum dos dois existe: o comportamento é o de sempre (esperar o id de
    hoje e falhar com o motivo), nunca um palpite."""
    engine = DomFalso(sem={"Input_GrossWeight"})
    automacao = _automacao(engine)

    assert automacao._sel(sc.ARM_PESO_BRUTO) == sc.ARM_PESO_BRUTO.xpath_conhecido


# =============================================================================
# 4. sufixo repetido -> o da sub-aba ativa
# =============================================================================
def test_sufixo_repetido_pega_o_da_sub_aba_certa():
    engine = DomFalso(troca=("b10-", "b11-"))
    automacao, linhas, (completas, _i) = _rodar(engine)

    cliques = _ids_tocados(engine, "click")
    # Armazenamento escolhe "Não contém nocivo" (RadioButton1-input em b1) e
    # Descarte escolhe "perigoso = NÃO" (RadioButton2-input em b5).
    assert "b11-b17-b1-RadioButton1-input" in cliques
    assert "b11-b17-b5-RadioButton2-input" in cliques
    assert "b11-b17-b1-RadioButton2-input" not in cliques
    assert "b11-b17-b5-RadioButton1-input" not in cliques
    assert completas, linhas


def test_sufixo_repetido_sem_prefixo_aprendido_nao_adivinha():
    """Dois elementos casam e a sub-aba é desconhecida: nada de "o primeiro do
    documento" -- devolve o id de hoje (que não existe) e a falha é dita."""
    engine = DomFalso(troca=("b10-", "b11-"))
    automacao = _automacao(engine)
    linhas = []
    automacao._log_sel = linhas.append

    escolhido = automacao._sel(sc.DES_PERIGOSO_SIM)

    assert escolhido == sc.DES_PERIGOSO_SIM.xpath_conhecido
    assert any("mais de um" in l for l in linhas)


# =============================================================================
# 5. o 1º campo não aparece -> diagnóstico, INCOMPLETA, próxima ficha
# =============================================================================
def test_primeiro_campo_ausente_diagnostica_e_passa_a_proxima_ficha():
    engine = DomFalso(sem={"Input_PackingLength"})
    outra = dict(FICHA, pmib_codigo="4500063671.9999")
    automacao, linhas, (completas, incompletas) = _rodar(engine, [FICHA, outra])

    assert completas == []
    assert incompletas == ["4500063671.1234", "4500063671.9999"]
    assert automacao.marcadas == []
    diagnosticos = [l for l in linhas if "Diagnóstico" in l]
    assert len(diagnosticos) == 2, "uma linha por ficha"
    assert "https://portal.exemplo/Fichas" in diagnosticos[0]
    assert "Input_PackingLength" in diagnosticos[0]
    assert engine.esperas_longas == 2, "1 espera longa por ficha, não ~15"
    assert engine.escritas == 0
    assert not any("Salvando" in l for l in linhas), "não salva o que não preencheu"
    assert any("INCOMPLETO" in l and "4500063671.1234" in l for l in linhas)


def test_o_diagnostico_diz_o_que_viu_do_cabecalho_dos_elementos_e_do_modal():
    engine = DomFalso(troca=("b10-", "b11-"), sem={"Input_PackingLength", "Conditions_Header"})
    engine.doc.xpath("//body")[0].append(
        etree.fromstring('<div role="dialog"></div>', etree.HTMLParser()).xpath("//div")[0])
    automacao = _automacao(engine)
    linhas = []

    automacao._diagnosticar_aba("Armazenamento", sc.ARM_COMPRIMENTO, linhas.append)

    assert len(linhas) == 1
    texto = linhas[0]
    assert "cabeçalho" in texto and "não" in texto
    assert "0 elemento" in texto
    assert "modal" in texto and "sim" in texto


def test_diagnostico_acha_o_id_real_do_primeiro_campo_pelo_sufixo():
    engine = DomFalso(troca=("b10-", "b11-"))
    automacao = _automacao(engine)
    linhas = []

    automacao._diagnosticar_aba("Armazenamento", sc.ARM_COMPRIMENTO, linhas.append)

    assert "b11-b17-b1-Input_PackingLength" in linhas[0]
    assert "1 elemento" in linhas[0]


def test_aba_nao_monta_depois_de_tabs_ja_salvas_ainda_passa_a_proxima_ficha():
    engine = DomFalso(sem={"TextArea_PreservationCareES"})
    automacao, linhas, (completas, incompletas) = _rodar(engine)

    assert completas == [] and incompletas == ["4500063671.1234"]
    assert any("Diagnóstico" in l and "Manutenção" in l for l in linhas)
    assert not any("Salvando Manutenção" in l or "Salvando Descarte" in l for l in linhas)


# =============================================================================
# 6. NavegadorFechado -> nenhum "Salvando", lote encerrado
# =============================================================================
def test_navegador_fechado_no_2o_campo_encerra_tudo_sem_ruido():
    engine = DomFalso(fechar_na_escrita=2)
    outra = dict(FICHA, pmib_codigo="4500063671.9999")
    automacao, linhas, (completas, incompletas) = _rodar(engine, [FICHA, outra])

    assert completas == []
    assert incompletas == ["4500063671.1234"], "a 2ª ficha nem foi tentada"
    assert not any("Salvando" in l for l in linhas)
    assert not any("campo com falha" in l for l in linhas)
    assert not any("ERRO CRÍTICO" in l for l in linhas)
    assert sum("navegador foi fechado" in l for l in linhas) >= 1
    assert any("navegador foi fechado" in l and "interrompid" in l.lower() for l in linhas), (
        "o resumo diz por que o lote terminou")
    assert automacao.marcadas == []


def test_navegador_fechado_ao_salvar_nao_pede_intervencao_manual():
    """Antes, o clique de salvar sem navegador caía em "Falha ao salvar...
    Aguardando intervenção manual" e abria o diálogo de pausa."""
    engine = DomFalso()
    pausas = []

    def fechar(_secao):
        engine.fechado = True

    engine.ao_clicar_salvar = fechar
    automacao = _automacao(engine)
    linhas = []
    automacao.processar_lista([dict(FICHA)], "/tmp/s.xlsx", callback_log=linhas.append,
                              callback_pause=pausas.append)

    assert pausas == []
    assert not any("intervenção manual" in l for l in linhas)


# =============================================================================
# 7. parada pedida
# =============================================================================
def test_parada_durante_o_salvar_deixa_o_salvar_terminar_e_para_antes_da_proxima_aba():
    holder = {}

    def pedir_parada(secao):
        if secao == "Armazenamento":
            holder["a"].solicitar_parada()

    engine = DomFalso(ao_clicar_salvar=pedir_parada)
    automacao = _automacao(engine)
    holder["a"] = automacao
    _a, linhas, (completas, incompletas) = _rodar(engine, automacao=automacao)

    assert any("Salvando Armazenamento" in l for l in linhas)
    assert not any("Não vi a confirmação" in l for l in linhas), "o salvar terminou"
    assert not any("Salvando Transporte" in l for l in linhas)
    assert not any("Diagnóstico" in l for l in linhas)
    assert any("interrompida pelo usuário" in l for l in linhas)
    assert completas == []
    assert automacao.marcadas == []


def test_parada_entre_campos_encerra_a_ficha_sem_salvar():
    holder = {}

    def pedir_parada(n):
        if n == 3:
            holder["a"].solicitar_parada()

    engine = DomFalso(ao_escrever=pedir_parada)
    automacao = _automacao(engine)
    holder["a"] = automacao
    _a, linhas, (completas, incompletas) = _rodar(engine, automacao=automacao)

    assert engine.escritas == 3, "parou no campo seguinte ao pedido"
    assert not any("Salvando" in l for l in linhas)
    assert not any("campo com falha" in l for l in linhas)
    assert completas == []


def test_parada_pedida_antes_da_ficha_nao_abre_nada():
    engine = DomFalso()
    automacao = _automacao(engine)
    automacao.solicitar_parada()

    _a, linhas, (completas, incompletas) = _rodar(engine, automacao=automacao)

    assert engine.tocados == []
    assert completas == [] and incompletas == []
    assert any("interrompida pelo usuário" in l for l in linhas)


# =============================================================================
# 8. O XPath no navegador de VERDADE (pulado onde não há Chromium)
# =============================================================================
def test_xpath_de_sufixo_e_valido_no_chromium_real():
    """O lxml prova o XPath 1.0; este prova que o Playwright também o aceita.
    Pulado quando o Chromium não está instalado (como na sessão web)."""
    sync_api = pytest.importorskip("playwright.sync_api")
    try:
        pw = sync_api.sync_playwright().start()
        navegador = pw.chromium.launch()
    except Exception as erro:  # noqa: BLE001
        pytest.skip(f"sem Chromium: {type(erro).__name__}")
    try:
        pagina = navegador.new_page()
        pagina.set_content(
            '<div id="b11-b17-b1-Checkbox4"></div><div id="b11-b17-b1-Checkbox40"></div>'
            '<div id="b11-b17-$b3"><div></div><div></div><div><button>x</button></div></div>')
        assert pagina.locator("xpath=" + sc.seletor_por_sufixo("Checkbox4")).count() == 1
        assert pagina.locator(
            "xpath=" + sc.seletor_por_sufixo("$b3", None, "/div[3]/button")).count() == 1
    finally:
        navegador.close()
        pw.stop()

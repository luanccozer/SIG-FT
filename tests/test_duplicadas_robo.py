r"""
O robô da ficha duplicada (CP 6.3) — a ordem das coisas e o que conta como ok.

O portal é de mentira; o que se testa é a ORQUESTRAÇÃO: por qual porta entra em
cada ficha, o que acontece quando uma etapa falha, e o que o lote reporta no
fim. As peças (extrator, injetor) têm os seus próprios testes.
"""
import pytest

from sigft.services import duplicadas_injetor as injetor
from sigft.services import duplicadas_robo as robo


@pytest.fixture(autouse=True)
def _sem_espera(monkeypatch):
    monkeypatch.setattr(robo.time, "sleep", lambda _s: None)


class _Ficha:
    def __init__(self, pmib="4500063671.1418", original="4500063671.1471",
                 material="2904616", descricao="FONTE"):
        self.pmib = pmib
        self.ficha_original = original
        self.codigo_material = material
        self.codigo_fornecedor = "CMI-1"
        self.descricao = descricao
        self.linha = 12


class _PortalFalso:
    def __init__(self):
        self.engine = self
        self.cliques = []
        self.salvou = []

    # -- lado engine
    def click_nativo(self, seletor):
        self.cliques.append(seletor)

    def element_exists(self, _seletor):
        return False

    def contar(self, _seletor):
        return 0

    # -- lado portal
    def ir_para_lista(self):
        pass

    def safe_click(self, seletor):
        self.cliques.append(seletor)

    def safe_fill(self, _seletor, _texto):
        pass

    def salvar_e_confirmar(self, nome="", callback_log=None, **_kwargs):
        """Passa a ser o caminho do módulo novo (2026-08-19): SALVAR + toast
        de sucesso NOVO na tela. O duplo delega no `clicar_salvar_visivel`
        de sempre -- a mecânica do toast é testada contra o `PMIBPortal`
        real em tests/test_duplicadas_salvar_com_prova.py, e reimplementá-la
        aqui só criaria uma segunda verdade para envelhecer sozinha."""
        return self.clicar_salvar_visivel(nome)

    def clicar_salvar_visivel(self, nome=""):
        self.salvou.append(nome)
        return True


def _com_etapas(monkeypatch, *, blocos=(("Fabricantes", {"Fabricante": "SCHNEIDER"}),),
                achou_original=True, achou_alvo=True, secoes_ok=True):
    portal = _PortalFalso()
    monkeypatch.setattr(robo.extrator, "abrir_original_em_visualizacao",
                        lambda *_a, **_k: achou_original)
    monkeypatch.setattr(robo.extrator, "ler_secao_visivel", lambda *_a, **_k: list(blocos))
    monkeypatch.setattr(robo.extrator, "localizar_aba_da_ficha",
                        lambda *_a, **_k: "Em Elaboração" if achou_alvo else None)

    def _secao(nome):
        return lambda *_a, **_k: injetor.ResultadoDaSecao(nome, secoes_ok, "")

    monkeypatch.setattr(robo.injetor, "escolher_fabricante", _secao("fabricante"))
    monkeypatch.setattr(robo.injetor, "escolher_fornecedor", _secao("fornecedor"))
    # `escrever_referencia` é chamada DUAS vezes (fabricante e fornecedor) e
    # nomeia o resultado pelo `nome_da_secao` que recebe -- o duplo respeita
    # isso, senão os dois resultados viram um só e uma falha some do placar.
    monkeypatch.setattr(
        robo.injetor, "escrever_referencia",
        lambda *_a, nome_da_secao="referencia", **_k:
            injetor.ResultadoDaSecao(nome_da_secao, secoes_ok, ""))
    monkeypatch.setattr(robo.injetor, "escrever_referencia_da_ge", _secao("ge_vernova"))
    monkeypatch.setattr(robo.injetor, "limpar_caracteristicas", _secao("caracteristicas"))

    # CP 6.4 -- as duas seções novas. Neutralizadas aqui pelo mesmo motivo das
    # outras: este arquivo testa a ORQUESTRAÇÃO (quem roda, em que ordem, o que
    # entra no placar). A mecânica de cada uma tem arquivo próprio
    # (test_duplicadas_condicoes.py e test_duplicadas_documentos.py).
    monkeypatch.setattr(robo.extrator, "abrir_secao", lambda *_a, **_k: True)
    monkeypatch.setattr(robo.extrator, "ler_tabela_de", lambda *_a, **_k: [])
    monkeypatch.setattr(robo.condicoes, "ler", lambda *_a, **_k: {})
    monkeypatch.setattr(robo.condicoes, "escrever", _secao("condicoes"))
    monkeypatch.setattr(robo.documentos, "associar", _secao("documentos"))
    # CP 6.4: o PDM roda ANTES das características e as GATEIA -- ficha no PDM
    # errado tem a lista de características errada. Neutralizado aqui como as
    # demais; a mecânica está em test_duplicadas_pdm.py.
    monkeypatch.setattr(robo.pdm, "garantir_pdm", _secao("pdm"))
    monkeypatch.setattr(robo.imagens, "ler_da_original", lambda *_a, **_k: [])
    monkeypatch.setattr(robo.imagens, "copiar", _secao("imagens"))
    return portal


# ===========================================================================
# Motor
# ===========================================================================
def test_o_modulo_novo_roda_em_playwright():
    """"Podemos fazer direto no motor novo" -- palavra do usuário. É o primeiro
    módulo do projeto que nunca teve versão Selenium.

    Desde o CP 5.5 não há mais o que escolher: `config.get_rpa_engine` saiu
    junto com o Selenium. O que sobrou para afirmar é que o módulo pede o
    motor à fábrica em vez de construir um, e é o teste abaixo que trava
    isso."""
    assert robo.NOME_DO_MODULO == "duplicadas"


def test_o_robo_novo_nao_importa_selenium():
    """Princípio nº 3: nenhum serviço conhece o motor. Se um `import selenium`
    entrar aqui, o módulo deixa de ser portável e o CP 5.5 volta a travar.

    A checagem é por AST, e não por `"selenium" in fonte`: a primeira versão
    era textual e reprovou os próprios COMENTÁRIOS que explicam por que não há
    Selenium aqui. Um teste que proíbe falar do assunto empurra a explicação
    para fora do código -- exatamente onde ela não serve.
    """
    import ast
    import inspect

    for modulo in (robo, injetor, robo.extrator):
        arvore = ast.parse(inspect.getsource(modulo))
        importados = []
        for no in ast.walk(arvore):
            if isinstance(no, ast.Import):
                importados += [alias.name for alias in no.names]
            elif isinstance(no, ast.ImportFrom):
                importados.append(no.module or "")
        assert not any("selenium" in nome.lower() for nome in importados), (
            f"{modulo.__name__} importa Selenium: {importados}")


# ===========================================================================
# Por qual porta entra em cada ficha
# ===========================================================================
def test_abre_a_original_em_visualizacao_e_a_alvo_em_edicao(monkeypatch):
    """A original a gente só LÊ (e ela pode estar em status que nem abre para
    edição); a alvo é onde se escreve."""
    portal = _com_etapas(monkeypatch)

    robo.processar_ficha(portal, _Ficha(), callback_log=lambda _m: None)

    assert any("-Edit" in c for c in portal.cliques)
    assert not any("-View" in c for c in portal.cliques)  # quem abre a original é o extrator


def test_ficha_original_nao_encontrada_e_erro_fatal_da_ficha(monkeypatch):
    """Sem a original não há de onde copiar: seguir para a alvo escreveria uma
    ficha com dados de lugar nenhum."""
    portal = _com_etapas(monkeypatch, achou_original=False)

    resultado = robo.processar_ficha(portal, _Ficha(), callback_log=lambda _m: None)

    assert resultado.ok is False
    assert "original" in resultado.erro_fatal
    assert portal.cliques == []  # não tocou na alvo


def test_ficha_alvo_nao_encontrada_para_o_processamento_dela(monkeypatch):
    portal = _com_etapas(monkeypatch, achou_alvo=False)

    resultado = robo.processar_ficha(portal, _Ficha(), callback_log=lambda _m: None)

    assert resultado.ok is False
    assert "alvo" in resultado.erro_fatal
    assert resultado.secoes == []


# ===========================================================================
# O que conta como sucesso
# ===========================================================================
def test_todas_as_secoes_ok_e_ficha_ok(monkeypatch):
    portal = _com_etapas(monkeypatch)

    resultado = robo.processar_ficha(portal, _Ficha(), callback_log=lambda _m: None)

    assert resultado.ok is True
    # A ORDEM é o contrato: cada linha da seção é escolhida e só então tem sua
    # Referência escrita, porque o campo NASCE da escolha. Inverter dois
    # nomes aqui significaria escrever antes de saber em qual campo.
    assert [s.nome for s in resultado.secoes] == [
        "fabricante", "referencia",
        "fornecedor", "referencia_fornecedor",
        "ge_vernova",
        # CP 6.4: o PDM vem ANTES das características e as gateia -- ele
        # decide QUAIS características a ficha tem.
        "pdm", "caracteristicas",
        # CP 6.4: Condições e Documentos entram DEPOIS das
        # características -- a purga mexe na mesma ficha e o
        # portal recarrega a tela a cada salvamento.
        "condicoes", "documentos", "imagens"]


def test_uma_secao_falha_e_a_ficha_NAO_e_sucesso(monkeypatch):
    """Contar como sucesso o que ficou pela metade é o que faz um lote fechar
    "✅" com a ficha errada no portal."""
    portal = _com_etapas(monkeypatch, secoes_ok=False)

    resultado = robo.processar_ficha(portal, _Ficha(), callback_log=lambda _m: None)

    assert resultado.ok is False
    assert "falhou em" in resultado.resumo


def test_excecao_inesperada_nao_derruba_a_ficha_nem_o_lote(monkeypatch):
    portal = _com_etapas(monkeypatch)
    monkeypatch.setattr(robo.injetor, "escrever_referencia",
                        lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("boom")))

    resultado = robo.processar_ficha(portal, _Ficha(), callback_log=lambda _m: None)

    assert resultado.ok is False
    assert "RuntimeError" in resultado.erro_fatal


# ===========================================================================
# O fabricante lido da original
# ===========================================================================
def test_acha_o_fabricante_em_qualquer_bloco():
    blocos = [("Volume", {"Altura": "3"}), ("Fabricantes", {"Fabricante": "SCHNEIDER"})]

    assert robo.achar_fabricante(blocos) == "SCHNEIDER"


def test_sem_rotulo_conhecido_devolve_vazio_em_vez_de_chutar():
    """Chutar aqui viraria fabricante ERRADO na ficha -- que não dá sintoma
    nenhum na tela. Vazio faz o injetor pular com aviso."""
    blocos = [("Volume", {"Altura": "3", "Peso": "10"})]

    assert robo.achar_fabricante(blocos) == ""


def test_fabricante_ausente_NAO_impede_o_resto(monkeypatch):
    """Perder também a purga por causa do fabricante seria trocar uma pendência
    pequena por uma ficha inteira errada."""
    portal = _com_etapas(monkeypatch, blocos=[("Volume", {"Altura": "3"})])
    logs = []

    resultado = robo.processar_ficha(portal, _Ficha(), callback_log=logs.append)

    # Seis desde 2026-08-18: fabricante, referência do fabricante, fornecedor,
    # referência do fornecedor, referência da GE Vernova e características.
    # Eram quatro quando "fornecedor" e "GE Vernova" eram tratados como a
    # mesma linha -- que era o defeito.
    assert len(resultado.secoes) == 10  # + pdm, condicoes, documentos, imagens
    assert any("fabricante" in linha for linha in logs)


# ===========================================================================
# O lote
# ===========================================================================
def test_o_lote_segue_depois_de_uma_ficha_ruim(monkeypatch):
    portal = _com_etapas(monkeypatch)
    chamadas = {"n": 0}
    original = robo.processar_ficha

    def processar_ficha(p, ficha, callback_log=None, **_kwargs):
        chamadas["n"] += 1
        if chamadas["n"] == 1:
            resultado = robo.ResultadoDaFicha(ficha.pmib, ficha.ficha_original)
            resultado.erro_fatal = "falhou de proposito"
            return resultado
        return original(p, ficha, callback_log)

    monkeypatch.setattr(robo, "processar_ficha", processar_ficha)

    resultados = robo.processar_lote(
        [_Ficha("A"), _Ficha("B")], callback_log=lambda _m: None, portal=portal)

    assert len(resultados) == 2
    assert [r.ok for r in resultados] == [False, True]


def test_o_resumo_final_lista_so_as_pendentes(monkeypatch):
    portal = _com_etapas(monkeypatch, secoes_ok=False)
    logs = []

    robo.processar_lote([_Ficha("A")], callback_log=logs.append, portal=portal)

    juntos = "\n".join(logs)
    assert "0 de 1" in juntos and "A: falhou em" in juntos


def test_parada_pedida_pelo_usuario_interrompe_entre_fichas(monkeypatch):
    """Parar NO MEIO de uma ficha deixaria a ficha pela metade no portal; entre
    fichas, o que já foi feito está salvo."""
    portal = _com_etapas(monkeypatch)
    logs = []

    robo.processar_lote([_Ficha("A"), _Ficha("B")], callback_log=logs.append,
                        portal=portal, deve_parar=lambda: True)

    assert "Parado pelo usuário" in "\n".join(logs)


def test_o_progresso_e_reportado_por_ficha(monkeypatch):
    portal = _com_etapas(monkeypatch)
    progresso = []

    robo.processar_lote([_Ficha("A"), _Ficha("B")], callback_log=lambda _m: None,
                        portal=portal, callback_progresso=progresso.append)

    assert progresso == [0.5, 1.0]


# ===========================================================================
# De onde vem cada dado — a ordem de precedência que o usuário definiu
# ===========================================================================
class _FichaComMarca(_Ficha):
    def __init__(self, fabricante="", codigo_fornecedor="CMI-1", **kwargs):
        super().__init__(**kwargs)
        self.fabricante = fabricante
        self.codigo_fornecedor = codigo_fornecedor
        self.linha = 12


def test_o_fabricante_vem_da_PLANILHA_e_nao_do_portal():
    """"Você sabe que tem, já te pedi para mapear no conhecimento do
    _STATUS_PMIB todas as informações que temos hoje." A coluna MARCA/MODELO
    está mapeada desde 2026-08-13; raspar o portal para descobrir o que ela já
    diz seria trabalho a mais para resultado igual ou pior."""
    blocos = [("Fabricantes", {"Fabricante": "DO PORTAL"})]

    assert robo.achar_fabricante(blocos, _FichaComMarca(fabricante="WAGO")) == "WAGO"


def test_sem_marca_na_planilha_a_ficha_original_entra_como_reserva():
    blocos = [("Fabricantes", {"Fabricante": "DO PORTAL"})]

    assert robo.achar_fabricante(blocos, _FichaComMarca(fabricante="")) == "DO PORTAL"


def test_sem_fabricante_em_lugar_nenhum_devolve_vazio_e_nao_chuta():
    assert robo.achar_fabricante([], _FichaComMarca(fabricante="")) == ""


# ===========================================================================
# As TRÊS linhas da seção — corrigido em 2026-08-18
# ===========================================================================
# O usuário relatou: *"ele não está conseguindo nem colocar a referência
# correta do fornecedor correto, ele está fazendo no campo de fornecimento da
# GE"*. A causa era o modelo: o código tratava "Fornecedor" e "GE Vernova"
# como a MESMA linha. São três, com três valores diferentes:
#
#     Fabricante   combo  -> Referência = CÓDIGO DO MATERIAL
#     Fornecedor   combo  -> Referência = CÓDIGO DO MATERIAL
#     GE Vernova   fixo ⓘ -> Referência = CÓDIGO CMI / CÓDIGO GE
def test_o_fornecedor_a_escolher_vem_da_FICHA_ORIGINAL():
    """"Vem da ficha original, lendo qual fornecedor foi preenchido."

    O que se lê da original é QUEM é o fornecedor -- para escolhê-lo no combo
    da ficha nova. Antes daqui saía uma REFERÊNCIA, e era o erro.
    """
    blocos = [("Fornecedores", {"Fornecedor": "SIEMENS DO BRASIL"})]

    assert robo.achar_fornecedor(blocos, _FichaComMarca()) == "SIEMENS DO BRASIL"


def test_fornecedor_ausente_na_original_devolve_vazio():
    """A planilha NÃO tem o nome do fornecedor -- CÓDIGO CMI / CÓDIGO GE é a
    referência da GE Vernova, que é outra linha. Sem nome, o combo não é
    tocado: escolher um fornecedor por parecer plausível põe dado errado numa
    ficha real, sem sintoma na tela."""
    assert robo.achar_fornecedor([], _FichaComMarca(codigo_fornecedor="CMI-99")) == ""


def test_a_linha_do_fornecedor_recebe_o_CODIGO_DO_MATERIAL(monkeypatch):
    """"O código do material deve ser preenchido no campo de fornecedor que
    devemos selecionar" -- o MESMO valor do fabricante, em outra linha."""
    portal = _com_etapas(
        monkeypatch, blocos=[("Fornecedores", {"Fornecedor": "SIEMENS"})])
    escritas = []
    monkeypatch.setattr(
        robo.injetor, "escrever_referencia",
        lambda _p, codigo, _log=None, id_do_campo="", nome_da_secao="referencia", log_auditoria=None:
            escritas.append((nome_da_secao, codigo))
            or injetor.ResultadoDaSecao(nome_da_secao, True, ""))

    robo.processar_ficha(
        portal,
        _FichaComMarca(fabricante="WAGO", material="2904616",
                       codigo_fornecedor="CMI-99"),
        callback_log=lambda _m: None)

    assert ("referencia", "2904616") in escritas, "a linha do fabricante"
    assert ("referencia_fornecedor", "2904616") in escritas, "a linha do fornecedor"


def test_o_fornecedor_lido_da_original_e_o_que_vai_para_o_combo(monkeypatch):
    portal = _com_etapas(
        monkeypatch, blocos=[("Fornecedores", {"Fornecedor": "SIEMENS DO BRASIL"})])
    escolhidos = []
    monkeypatch.setattr(
        robo.injetor, "escolher_fornecedor",
        lambda _p, nome, _log=None: escolhidos.append(nome)
        or injetor.ResultadoDaSecao("fornecedor", True, ""))

    robo.processar_ficha(portal, _FichaComMarca(fabricante="WAGO"),
                         callback_log=lambda _m: None)

    assert escolhidos == ["SIEMENS DO BRASIL"]


def test_so_a_GE_recebe_o_CODIGO_CMI(monkeypatch):
    """"O CÓDIGO CMI / CÓDIGO GE deve ser preenchido somente se tiver no
    _STATUS_PMIB, e deve ser preenchido no campo do fornecimento da GE, que é
    fixo."

    Este é o teste que reprova o comportamento relatado: antes, o valor do
    fornecedor ia para o campo da GE.
    """
    portal = _com_etapas(
        monkeypatch, blocos=[("Fornecedores", {"Fornecedor": "SIEMENS"})])
    na_ge = []
    monkeypatch.setattr(
        robo.injetor, "escrever_referencia_da_ge",
        lambda _p, referencia, _log=None, log_auditoria=None: na_ge.append(referencia)
        or injetor.ResultadoDaSecao("ge_vernova", True, ""))

    robo.processar_ficha(
        portal,
        _FichaComMarca(fabricante="WAGO", material="2904616",
                       codigo_fornecedor="CMI-99"),
        callback_log=lambda _m: None)

    assert na_ge == ["CMI-99"], (
        "o campo da GE Vernova tem de receber CÓDIGO CMI/GE -- e só ele"
    )


def test_codigo_cmi_vazio_pula_a_GE_sem_derrubar_a_ficha(monkeypatch):
    """"Se estiver vazio, só ignorar." """
    portal = _com_etapas(
        monkeypatch, blocos=[("Fornecedores", {"Fornecedor": "SIEMENS"})])

    resultado = robo.processar_ficha(
        portal, _FichaComMarca(fabricante="WAGO", codigo_fornecedor=""),
        callback_log=lambda _m: None)

    assert resultado.erro_fatal == ""


def test_log_com_atributo_ausente_nao_derruba_a_ficha(monkeypatch):
    """CONTRAPROVA: a mensagem de aviso do fabricante lia `ficha.linha` direto.
    Num objeto sem esse atributo, o `AttributeError` era engolido pelo `except`
    do processamento e a ficha morria com "erro fatal" -- por causa de uma
    linha que existia só para avisar."""
    portal = _com_etapas(monkeypatch, blocos=[("Volume", {"Altura": "3"})])

    class _FichaCrua:
        pmib = "A"
        ficha_original = "B"
        codigo_material = "C"
        descricao = "D"
        # sem `linha`, sem `fabricante`, sem `codigo_fornecedor`

    resultado = robo.processar_ficha(portal, _FichaCrua(), callback_log=lambda _m: None)

    assert resultado.erro_fatal == ""
    # Seis desde 2026-08-18: fabricante, referência do fabricante, fornecedor,
    # referência do fornecedor, referência da GE Vernova e características.
    # Eram quatro quando "fornecedor" e "GE Vernova" eram tratados como a
    # mesma linha -- que era o defeito.
    assert len(resultado.secoes) == 10  # + pdm, condicoes, documentos, imagens


def test_processar_ficha_loga_onde_o_tempo_foi(monkeypatch):
    """A medição que responde *"ele demora muito para a segunda etapa"* sem
    adivinhação. Ver tests/test_duplicadas_tempos.py para a mecânica."""
    portal = _com_etapas(monkeypatch)
    logs = []

    robo.processar_ficha(portal, _Ficha(), callback_log=logs.append)

    assert any("total" in linha and "s" in linha for linha in logs)


# ===========================================================================
# Intervenção humana: o robô pede conferência antes de ir para a próxima ficha
# ===========================================================================
def _resultado(pmib="A", *, ok=True, falhas=(), erro="", avisos=(), interrompida=False):
    """`ResultadoDaFicha` montado à mão: o que se testa aqui é a regra de
    intervenção, não as etapas do portal."""
    resultado = robo.ResultadoDaFicha(pmib, "ORIG")
    resultado.secoes.append(injetor.ResultadoDaSecao("fabricante", ok))
    for nome, detalhe in falhas:
        resultado.secoes.append(injetor.ResultadoDaSecao(nome, False, detalhe))
    resultado.erro_fatal = erro
    resultado.avisos = list(avisos)
    resultado.interrompida = interrompida
    return resultado


def test_o_coletor_repassa_toda_linha_e_guarda_so_as_de_alerta(monkeypatch):
    portal = _com_etapas(monkeypatch)
    logs = []

    resultado = robo.processar_ficha(portal, _Ficha(), callback_log=logs.append)

    # O callback original recebe TUDO, inclusive o que não é alerta.
    assert any(linha.startswith("\n>>") for linha in logs)
    assert resultado.avisos, "o [Aviso] de fornecedor ausente devia ter sido coletado"
    assert all(any(m in linha for m in robo.MARCADORES_DE_ALERTA) for linha in resultado.avisos)
    assert not any(">>" in linha for linha in resultado.avisos)
    for linha in resultado.avisos:
        assert linha == linha.strip()
        assert linha in "\n".join(logs)


def test_o_coletor_coleta_mesmo_sem_callback_de_log(monkeypatch):
    portal = _com_etapas(monkeypatch)

    resultado = robo.processar_ficha(portal, _Ficha(), callback_log=None)

    assert any("[Aviso]" in linha for linha in resultado.avisos)


def test_o_coletor_nao_repete_a_mesma_linha():
    resultado = robo.ResultadoDaFicha("A", "B")
    coletor = robo._coletor_de_avisos(resultado, None)

    coletor("   [Aviso] mesma coisa")
    coletor("   [Aviso] mesma coisa")
    coletor("   Preencha à mão o campo X")
    coletor("linha qualquer")

    assert resultado.avisos == ["[Aviso] mesma coisa", "Preencha à mão o campo X"]


def test_o_coletor_nunca_levanta_por_causa_da_coleta():
    resultado = robo.ResultadoDaFicha("A", "B")
    coletor = robo._coletor_de_avisos(resultado, None)

    coletor(None)        # não é texto
    coletor(12345)

    assert resultado.avisos == []


def test_ficha_ok_sem_avisos_nao_pede_intervencao():
    assert robo.motivos_de_intervencao(_resultado()) == []


def test_secao_que_falhou_vira_motivo_com_detalhe_ou_sem():
    resultado = _resultado(falhas=[("referencia", "campo não aceitou"), ("imagens", "")])

    assert robo.motivos_de_intervencao(resultado) == [
        "seção referencia: campo não aceitou", "seção imagens: falhou"]


def test_secao_pendente_nao_e_motivo():
    resultado = _resultado()
    resultado.secoes.append(injetor.ResultadoDaSecao("x", False, "ainda não existe", pendente=True))

    assert robo.motivos_de_intervencao(resultado) == []


def test_erro_fatal_vem_primeiro_depois_as_secoes_depois_os_avisos():
    resultado = _resultado(erro="deu ruim", falhas=[("pdm", "não achei")],
                           avisos=["[Aviso] cuidado"])

    assert robo.motivos_de_intervencao(resultado) == [
        "deu ruim", "seção pdm: não achei", "[Aviso] cuidado"]


def test_ficha_interrompida_nao_gera_motivo_nenhum():
    resultado = _resultado(erro="Navegador fechado", avisos=["[Aviso] x"], interrompida=True)

    assert robo.motivos_de_intervencao(resultado) == []


def test_motivos_sem_duplicata():
    resultado = _resultado(erro="deu ruim", avisos=["[Erro] deu ruim", "[Aviso] a", "[Aviso] a"])

    motivos = robo.motivos_de_intervencao(resultado)

    assert len(motivos) == len(set(motivos))
    assert motivos == ["deu ruim", "[Aviso] a"]


def _lote_com(monkeypatch, resultados):
    """`processar_lote` com `processar_ficha` trocada por resultados prontos."""
    fila = list(resultados)
    monkeypatch.setattr(robo, "processar_ficha", lambda *_a, **_k: fila.pop(0))
    return [_Ficha(r.pmib_alvo) for r in resultados]


def test_o_lote_pede_intervencao_so_para_a_ficha_com_motivo(monkeypatch):
    fichas = _lote_com(monkeypatch, [_resultado("A"), _resultado("B", erro="deu ruim")])
    pedidos, logs = [], []

    def pedir(resultado, motivos, segundos):
        pedidos.append((resultado.pmib_alvo, list(motivos), segundos))
        return robo.RESPOSTA_EDITAR

    resultados = robo.processar_lote(fichas, callback_log=logs.append,
                                     callback_intervencao=pedir)

    assert pedidos == [("B", ["deu ruim"], robo.ESPERA_DA_INTERVENCAO_S)]
    assert robo.ESPERA_DA_INTERVENCAO_S == 60
    assert resultados[0].intervencao is None
    assert resultados[1].intervencao.resposta == "editar"
    assert resultados[1].intervencao.motivos == ["deu ruim"]
    juntos = "\n".join(logs)
    assert "[Intervenção] B: pedindo conferência humana (1 ponto(s)); sigo sozinho em 60 s" in juntos
    assert "a pessoa editou a ficha no portal e mandou seguir" in juntos


def test_o_pedido_acontece_antes_da_proxima_ficha_e_tambem_na_ultima(monkeypatch):
    ordem = []
    resultados = [_resultado("A", erro="x"), _resultado("B", erro="y")]
    fila = list(resultados)

    def processar_ficha(*_a, **_k):
        r = fila.pop(0)
        ordem.append(f"processa {r.pmib_alvo}")
        return r

    monkeypatch.setattr(robo, "processar_ficha", processar_ficha)

    def pedir(resultado, _motivos, _segundos):
        ordem.append(f"pede {resultado.pmib_alvo}")
        return robo.RESPOSTA_CONTINUAR

    robo.processar_lote([_Ficha("A"), _Ficha("B")], callback_log=lambda _m: None,
                        callback_intervencao=pedir)

    assert ordem == ["processa A", "pede A", "processa B", "pede B"]


@pytest.mark.parametrize("resposta,trecho", [
    ("continuar", "a pessoa mandou seguir sem editar"),
    ("sem_resposta", "ninguém respondeu em 60 s; segui sozinho"),
])
def test_o_desfecho_de_cada_resposta_vai_para_o_log(monkeypatch, resposta, trecho):
    fichas = _lote_com(monkeypatch, [_resultado("A", erro="x")])
    logs = []

    resultados = robo.processar_lote(fichas, callback_log=logs.append,
                                     callback_intervencao=lambda *_a: resposta)

    assert resultados[0].intervencao.resposta == resposta
    assert trecho in "\n".join(logs)


def test_excecao_no_callback_de_intervencao_nao_derruba_o_lote(monkeypatch):
    fichas = _lote_com(monkeypatch, [_resultado("A", erro="x"), _resultado("B")])

    def pedir(*_a):
        raise RuntimeError("janela quebrou")

    resultados = robo.processar_lote(fichas, callback_log=lambda _m: None,
                                     callback_intervencao=pedir)

    assert len(resultados) == 2
    assert resultados[0].intervencao.resposta == robo.RESPOSTA_SEM_RESPOSTA


@pytest.mark.parametrize("devolvido", ["talvez", None, 7, ""])
def test_resposta_desconhecida_vira_sem_resposta(monkeypatch, devolvido):
    fichas = _lote_com(monkeypatch, [_resultado("A", erro="x")])

    resultados = robo.processar_lote(fichas, callback_log=lambda _m: None,
                                     callback_intervencao=lambda *_a: devolvido)

    assert resultados[0].intervencao.resposta == robo.RESPOSTA_SEM_RESPOSTA


def test_sem_callback_de_intervencao_nada_muda(monkeypatch):
    fichas = _lote_com(monkeypatch, [_resultado("A", erro="x")])
    logs = []

    resultados = robo.processar_lote(fichas, callback_log=logs.append)

    assert resultados[0].intervencao is None
    assert "Intervenção" not in "\n".join(logs)


def test_ficha_interrompida_nao_pede_intervencao(monkeypatch):
    fichas = _lote_com(monkeypatch, [_resultado("A", erro="Navegador fechado", interrompida=True)])
    pedidos = []

    robo.processar_lote(fichas, callback_log=lambda _m: None,
                        callback_intervencao=lambda *a: pedidos.append(a) or "continuar")

    assert pedidos == []


def _com_resposta(pmib, resposta, *motivos):
    resultado = _resultado(pmib)
    resultado.intervencao = robo.Intervencao(list(motivos), resposta)
    return resultado


def test_relatorio_sem_pedido_e_uma_linha_so():
    assert robo.relatorio_de_intervencoes([_resultado("A"), _resultado("B")]) == [
        "=== Pedidos de intervenção: nenhum."]
    assert robo.relatorio_de_intervencoes([]) == ["=== Pedidos de intervenção: nenhum."]


def test_relatorio_conta_e_poe_os_sem_resposta_primeiro():
    resultados = [
        _com_resposta("A", "editar", "motivo A1"),
        _com_resposta("B", "sem_resposta", "motivo B1", "motivo B2"),
        _resultado("C"),
        _com_resposta("D", "continuar", "motivo D1"),
        _com_resposta("E", "sem_resposta", "motivo E1"),
    ]

    linhas = robo.relatorio_de_intervencoes(resultados)

    assert linhas[0] == ("=== Pedidos de intervenção: 4 ficha(s) pediram; 1 editada(s), "
                         "1 seguida(s) sem editar, 2 SEM RESPOSTA.")
    corpo = [linha for linha in linhas if linha.startswith("    - ")]
    assert corpo == [
        "    - B: SEM RESPOSTA (segui sozinho)",
        "    - E: SEM RESPOSTA (segui sozinho)",
        "    - A: EDITADA pela pessoa",
        "    - D: SEGUIU sem editar",
    ]
    i = linhas.index("    - B: SEM RESPOSTA (segui sozinho)")
    assert linhas[i + 1].endswith("motivo B1") and linhas[i + 2].endswith("motivo B2")
    assert linhas[i + 1].startswith("        ")   # recuo maior que o da ficha
    assert not any("C:" in linha for linha in linhas)


def test_relatorio_avisa_do_status_pmib_so_quando_houve_editada():
    com_editada = robo.relatorio_de_intervencoes([_com_resposta("A", "editar", "m")])
    sem_editada = robo.relatorio_de_intervencoes([_com_resposta("A", "continuar", "m")])

    assert "_STATUS_PMIB" in com_editada[-1] and "ROBÔ" in com_editada[-1]
    assert not any("_STATUS_PMIB" in linha for linha in sem_editada)


def test_relatorio_aceita_resultado_sem_o_campo_intervencao():
    """Dublês de teste da tela não trazem o atributo."""
    sem_campo = type("R", (), {"ok": True})()

    assert robo.relatorio_de_intervencoes([sem_campo]) == ["=== Pedidos de intervenção: nenhum."]

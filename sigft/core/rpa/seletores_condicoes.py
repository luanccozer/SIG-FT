r"""Seletores da tela de Condições do portal PMIB (Upload de Condições).

Antes de 2026-11-12 o `upload_conditions` tinha 56 literais do tipo
`//*[@id="b10-b17-b1-Input_PackingLength"]`: o id INTEIRO do OutSystems, com o
prefixo gerado (`b10-b17-b1-`). O prefixo é do portal e muda quando a tela muda
-- o mesmo que `seletores_duplicada.py` registra (`b10-b15-b19-`,
`b12-b20-b1-`) e `PORTAL_COMO_ELE_SE_COMPORTA.md` §6 ("o prefixo é que muda").
Só o SUFIXO (`Input_PackingLength`, `Checkbox4`, `RadioButton5-input`) é estável.

Cada campo vira um `Campo`: o sufixo estável, o id inteiro de HOJE (que continua
sendo a 1ª tentativa) e, quando faz sentido, a sub-aba (`b1`, `b3`...). Quem
escolhe qual dos dois XPaths usar é `UploadAutomation._sel`; este módulo só
sabe MONTÁ-los.

Sufixos repetidos entre sub-abas (levantados em 2026-11-12, ver `REPETIDOS`):
`RadioButton1-input` e `RadioButton2-input` existem em Armazenamento (`b1`) e em
Descarte (`b5`). Por isso o casamento por sufixo, sozinho, nunca é "o primeiro
do documento": o resolvedor exige UM só elemento, ou escopa pelo prefixo que
aprendeu com o 1º campo da própria sub-aba.
"""
from __future__ import annotations

from typing import NamedTuple

# O prefixo de HOJE, só para montar os ids conhecidos.
PREFIXO_CONHECIDO = "b10-b17-"


def seletor_por_sufixo(sufixo: str, prefixo_conhecido: str | None = None,
                       depois: str = "") -> str:
    """XPath que casa o elemento cujo `id` TERMINA em `-<sufixo>`.

    XPath 1.0 não tem `ends-with`, então a comparação é feita com `substring`
    pelo fim do id. `contains()` NÃO serve: `Checkbox4` casaria `Checkbox40`.
    O `-` antes do sufixo garante fronteira de segmento (o OutSystems separa os
    segmentos do id com `-`): `Checkbox4` não casa `MeuCheckbox4`.

    `prefixo_conhecido` (opcional) escopa o casamento aos ids que COMEÇAM por
    ele -- é o que separa `RadioButton1-input` de Armazenamento do de Descarte.
    `depois` é o trecho de XPath que segue o elemento (`/button`, `/div[3]`).
    """
    fim = "-" + sufixo
    condicao = (f"substring(@id, string-length(@id) - string-length('{fim}') + 1) = '{fim}'")
    if prefixo_conhecido:
        condicao = f"starts-with(@id, '{prefixo_conhecido}') and {condicao}"
    return f"//*[{condicao}]{depois}"


def seletor_por_id(id_inteiro: str, depois: str = "") -> str:
    return f'//*[@id="{id_inteiro}"]{depois}'


class Campo(NamedTuple):
    sufixo: str
    id_conhecido: str
    # Sub-aba cujo prefixo vale para este campo (`b1`...). `None` quando o id
    # não segue `<prefixo da aba>-<sufixo>` (cabeçalho, títulos, botões `$bN`).
    aba: str | None = None
    depois: str = ""

    @property
    def xpath_conhecido(self) -> str:
        return seletor_por_id(self.id_conhecido, self.depois)

    @property
    def xpath_sufixo(self) -> str:
        return seletor_por_sufixo(self.sufixo, None, self.depois)

    def xpath_com_prefixo(self, prefixo: str) -> str:
        """O id EXATO `prefixo + sufixo` (prefixo aprendido na sub-aba)."""
        return seletor_por_id(prefixo + self.sufixo, self.depois)

    def xpath_do_sufixo_no_prefixo(self, prefixo: str) -> str:
        return seletor_por_sufixo(self.sufixo, prefixo, self.depois)


def _c(aba: str, sufixo: str, depois: str = "") -> Campo:
    return Campo(sufixo, f"{PREFIXO_CONHECIDO}{aba}-{sufixo}", aba, depois)


# --- estrutura: cabeçalho, títulos das sub-abas, botões de salvar -------------
CABECALHO = Campo("Conditions_Header", "b10-Conditions_Header", None, "/button")
ABA_TRANSPORTE = Campo("Title", f"{PREFIXO_CONHECIDO}Title", None, "/div[3]")
ABA_MANUTENCAO = Campo("Title", f"{PREFIXO_CONHECIDO}Title", None, "/div[4]")
ABA_DESCARTE = Campo("Title", f"{PREFIXO_CONHECIDO}Title", None, "/div[5]")
SALVAR_ARMAZENAMENTO = _c("b1", "b35-Button", "/button")
# Os `$bN` são ids GERADOS (ver `IDS_GERADOS_NAO_USAR`): nenhum prefixo de aba
# vale para eles, só o casamento por sufixo com UM elemento.
SALVAR_TRANSPORTE = Campo("$b3", f"{PREFIXO_CONHECIDO}$b3", None, "/div[3]/button")
SALVAR_MANUTENCAO = Campo("$b4", f"{PREFIXO_CONHECIDO}$b4", None, "/div[4]/button")
SALVAR_DESCARTE = Campo("$b5", f"{PREFIXO_CONHECIDO}$b5", None, "/div[5]/button")

# --- Armazenamento (b1) -------------------------------------------------------
ARM_COMPRIMENTO = _c("b1", "Input_PackingLength")
ARM_LARGURA = _c("b1", "Input_PackagingWidth")
ARM_ALTURA = _c("b1", "Input_PackagingHeight")
ARM_TEMP_SIM = _c("b1", "RadioButton5-input")
ARM_TEMP_NAO = _c("b1", "RadioButton4-input")
ARM_CHECK_CLIMATIZACAO = _c("b1", "Checkbox4")
ARM_CHECK_UMIDADE = _c("b1", "Checkbox5")
ARM_POS_VERTICAL = _c("b1", "RadioButton-input")
ARM_POS_HORIZONTAL = _c("b1", "RadioButton7-input")
ARM_POS_INDIFERENTE = _c("b1", "RadioButton8-input")
ARM_NOCIVO_SIM = _c("b1", "RadioButton2-input")
ARM_NOCIVO_NAO = _c("b1", "RadioButton1-input")
ARM_CUIDADO_ES = _c("b1", "TextArea_StorageCareES")
ARM_CUIDADO_PT = _c("b1", "TextArea_StorageCarePT")
ARM_PESO_LIQUIDO = _c("b1", "Input_LiquidWeight")
ARM_PESO_BRUTO = _c("b1", "Input_GrossWeight")
ARM_INTEMPERIE = _c("b1", "Checkbox3")
ARM_PROT_SN = _c("b1", "Checkbox6")
ARM_PROT_UV = _c("b1", "Checkbox7")
ARM_PROT_EL = _c("b1", "Checkbox8")
ARM_EMPILHAMENTO = _c("b1", "Input_Stacking")
ARM_OUTROS_SIM = _c("b1", "RadioButton6-input")
ARM_OUTROS_NAO = _c("b1", "RadioButton3-input")
ARM_OUTROS_ES = _c("b1", "TextArea_OtherCareES")
ARM_OUTROS_PT = _c("b1", "TextArea_OtherCarePT")

# --- Transporte (b3) ----------------------------------------------------------
TRA_EMBALAGEM_ES = _c("b3", "TextArea_TransportPackagingES")
TRA_EMBALAGEM_PT = _c("b3", "TextArea_TransportPackagingPT")
TRA_POSICAO_ES = _c("b3", "TextArea_PositionCareES")
TRA_POSICAO_PT = _c("b3", "TextArea_PositionCarePT")

# --- Manutenção (b4) ----------------------------------------------------------
MAN_PRESERV_ES = _c("b4", "TextArea_PreservationCareES")
MAN_PRESERV_PT = _c("b4", "TextArea_PreservationCarePT")
MAN_LIMPEZA_ES = _c("b4", "TextArea_CleaningMethodES")
MAN_LIMPEZA_PT = _c("b4", "TextArea_CleaningMethodPT")
MAN_FERRAMENTAS_ES = _c("b4", "TextArea_ToolPreservationES")
MAN_FERRAMENTAS_PT = _c("b4", "TextArea_ToolPreservationPT")

# --- Descarte (b5) ------------------------------------------------------------
DES_LEGISLACAO_ES = _c("b5", "TextArea_TypeLegislationES")
DES_LEGISLACAO_PT = _c("b5", "TextArea_TypeLegislationPT")
DES_PERIGOSO_SIM = _c("b5", "RadioButton1-input")
DES_PERIGOSO_NAO = _c("b5", "RadioButton2-input")
DES_TIPO_ES = _c("b5", "TextArea_DiscardTypeES")
DES_TIPO_PT = _c("b5", "TextArea_DiscardTypePT")
DES_LOGISTICA_SIM = _c("b5", "Applies-input")
DES_LOGISTICA_NAO = _c("b5", "DoesNotApply-input")
DES_LOGISTICA_ES = _c("b5", "TextArea_ReserveLogisticES")
DES_LOGISTICA_PT = _c("b5", "TextArea_ReserveLogisticPT")

# O 1º campo de cada sub-aba: é ele que o portão espera antes de preencher (as
# quatro sufixos são únicos no documento) e de onde se aprende o prefixo da aba.
PRIMEIRO_CAMPO = {
    "Armazenamento": ARM_COMPRIMENTO,
    "Transporte": TRA_EMBALAGEM_ES,
    "Manutenção": MAN_PRESERV_ES,
    "Descarte": DES_LEGISLACAO_ES,
}


def todos_os_campos() -> list[Campo]:
    return [v for v in globals().values() if isinstance(v, Campo)]


def repetidos() -> dict[str, list[str]]:
    """sufixo -> ids conhecidos, só dos sufixos que aparecem sob 2+ ids."""
    por_sufixo: dict[str, set[str]] = {}
    for campo in todos_os_campos():
        por_sufixo.setdefault(campo.sufixo, set()).add(campo.id_conhecido)
    return {s: sorted(ids) for s, ids in por_sufixo.items() if len(ids) > 1}


def prefixo_de(id_real: str, sufixo: str) -> str | None:
    """O que vem ANTES do sufixo num id real (`b11-b17-b1-`), ou `None`."""
    fim = "-" + sufixo
    if id_real.endswith(fim):
        return id_real[: len(id_real) - len(sufixo)]
    return None

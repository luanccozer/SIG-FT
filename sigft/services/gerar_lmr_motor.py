"""Geração e validação da Aplicação LMR a partir das linhas do CSV (port do gera, geraLote e valida do lmr.js do Box)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from sigft.services.gerar_lmr_regras import (
    EIXOS, LOCAIS, TRECHO_POR_NOME, UGS, Trecho, assinatura_soma, expande_rds, formata_elevacao, hash_linha,
    monta_codigo, monta_tag, normaliza_eixo, normaliza_local, normaliza_trecho, partes_rds, rds_generico,
    trechos_do_material, txt,
)

UG_POR_M = {t.m: t for t in UGS}
_LOCAIS_VALIDOS = set(LOCAIS.values())


@dataclass
class LinhaCsv:
    n: int
    ficha: str
    area: str
    rds: str
    tag: str
    tag_com_rds: bool
    pais: list[dict]
    local: str
    elevacao: str
    eixo: str
    trechos: str  # como veio: lista, "TODAS", "50HZ" ou "60HZ"
    qtd: int | None
    documento: str
    pagina: str


@dataclass(frozen=True)
class Material:
    ficha: str
    descricao: str
    pn: str
    granel: bool


@dataclass(frozen=True)
class Achado:
    linha_csv: int | None
    ficha: str
    trecho: str
    regra: str
    severidade: str  # "bloqueia" | "aviso"
    mensagem: str


@dataclass
class Resultado:
    linhas: list[tuple[str, str, str]]  # (FICHA PMIB, CÓDIGO LMR, TAG LMR), só as não bloqueadas
    achados: list[Achado] = field(default_factory=list)
    bloqueadas: int = 0
    assinatura: str = ""


def _resolve_trechos(valor: str, projeto: list[Trecho]) -> tuple[list[Trecho], list[str]]:
    """Trechos da linha e os nomes inválidos da lista."""
    v = txt(valor).upper().replace(" ", "")
    if v == "TODAS":
        return [t for t in projeto if t.m], []  # TODAS = as UGs (como no lmr.js); projeto AMD fica vazio → V15
    if v in ("50HZ", "60HZ"):
        return trechos_do_material(projeto, int(v[:2])), []
    nomes = [x for x in re.split(r"[,;\s]+", txt(valor)) if x]
    ok = [normaliza_trecho(x) for x in nomes]
    return [TRECHO_POR_NOME[x] for x in ok if x], [x for x, o in zip(nomes, ok) if not o]


def _rds_do_trecho(rds: str, trecho: Trecho, trechos: list[Trecho]) -> str:
    # o documento cita o RDS de uma UG; vira genérico só se M e #ST batem com um trecho da linha (senão V4/V5 apontam)
    st, m = partes_rds(rds)
    if any(t.m and t.m == m and str(t.hz) == st for t in trechos):
        return expande_rds(rds_generico(rds), trecho.nome)
    return expande_rds(rds, trecho.nome)


def _valida(campos: dict, doprojeto: set[str]) -> list[tuple[str, str, str]]:
    out = []
    for k in ("escopo", "subsistema", "local", "elev", "eixo", "trecho", "descricao"):
        if not campos[k]:
            out.append(("V1", "bloqueia", f"campo vazio: {k}"))
    if not campos["pais"] and (not campos["area"] or not campos["rds"]):
        out.append(("V1", "bloqueia", "ÁREA/PAINEL ou RDS-PP vazio"))
    t = TRECHO_POR_NOME.get(campos["trecho"])
    for rds in [campos["rds"], *(p["rds"] for p in campos["pais"])]:
        if rds and "[XX]" in rds:
            out.append(("V2", "bloqueia", "placeholder [XX] após expansão"))
        st, m = partes_rds(rds)
        if m and m not in UG_POR_M and m not in ("M00", "M50", "M60"):
            out.append(("V4", "bloqueia", f"M inválido no RDS-PP: {m}"))
        if m and t:
            ug = UG_POR_M.get(m)
            if ug and t.m and ug.nome != t.nome:
                out.append(("V4", "bloqueia", f"{m} no RDS-PP com TRECHO {t.nome}"))
            if ug and st and int(st) != ug.hz:
                out.append(("V5", "bloqueia", f"#ST{st} com {m}"))
            if (m == "M50" and st != "50") or (m == "M60" and st != "60"):
                out.append(("V5", "bloqueia", f"#ST{st} com {m}"))
    if campos["eixo"] and campos["eixo"] not in EIXOS:
        out.append(("V14", "bloqueia", f"eixo fora da lista: {campos['eixo']}"))
    if campos["elev"] and not re.fullmatch(r"\d+,\d\d", campos["elev"]):
        out.append(("V14", "bloqueia", f"elevação fora do formato: {campos['elev']}"))
    if campos["local"] and campos["local"] not in _LOCAIS_VALIDOS:
        out.append(("V14", "bloqueia", f"local fora da lista: {campos['local']}"))
    if t and t.nome not in doprojeto:
        out.append(("V15", "bloqueia", f"trecho {t.nome} fora dos trechos do projeto"))
    return out


def gerar(linhas: list[LinhaCsv], catalogo: dict[str, Material], *, escopo: str, subsistema: str,
          projeto: list[Trecho]) -> Resultado:
    res = Resultado(linhas=[])
    vistos: set[Achado] = set()

    def achou(lc: LinhaCsv | None, ficha: str, trecho: str, regra: str, sev: str, msg: str) -> None:
        a = Achado(lc.n if lc else None, ficha, trecho, regra, sev, msg)
        if a not in vistos:
            vistos.add(a)
            res.achados.append(a)

    doprojeto = {t.nome for t in projeto}
    tags = {x for lc in linhas if lc.tag for x in lc.tag.split("/")}
    avisados: set[str] = set()
    n = soma = 0
    for lc in linhas:
        mat = catalogo.get(lc.ficha)
        trechos, invalidos = _resolve_trechos(lc.trechos, projeto)
        antes = []
        if invalidos:
            antes.append(("V14", f"trecho fora da lista: {', '.join(invalidos)}"))
        elif not trechos:
            antes.append(("V15", f"nenhum trecho do projeto para {lc.trechos}"))
        if mat is None:
            antes.append(("V6", "PMIB fora do catálogo (Status PMIB)"))
        granel = bool(mat and mat.granel)
        qtd = 1 if granel else lc.qtd
        if not granel and not (qtd is not None and qtd >= 1):
            antes.append(("V1", "QTD POR TRECHO vazia ou menor que 1"))
        for regra, msg in antes:
            achou(lc, lc.ficha, "", regra, "bloqueia", msg)
        if antes:
            res.bloqueadas += 1
            continue
        elev, aviso = formata_elevacao(lc.elevacao)
        if aviso:
            achou(lc, lc.ficha, "", "AVISO", "aviso", aviso)
        for t in trechos:
            campos = {
                "escopo": escopo, "subsistema": subsistema, "area": lc.area,
                "rds": _rds_do_trecho(lc.rds, t, trechos),
                "pais": [{"tag": p["tag"], "rds": _rds_do_trecho(p.get("rds") or "", t, trechos)} for p in lc.pais],
                "local": normaliza_local(lc.local) or lc.local, "elev": elev,
                "eixo": normaliza_eixo(lc.eixo) or lc.eixo, "trecho": t.nome, "tag": lc.tag,
                "caso_rds": 1 if lc.tag_com_rds else None, "descricao": mat.descricao, "pn": mat.pn,
            }
            codigo, tag = monta_codigo(campos), monta_tag(campos)
            problemas = _valida(campos, doprojeto)
            for regra, sev, msg in problemas:
                achou(lc, lc.ficha, t.nome, regra, sev, msg)
            for p in lc.pais:
                if p["tag"] not in tags and p["tag"] not in avisados:
                    avisados.add(p["tag"])
                    achou(lc, lc.ficha, t.nome, "V6", "aviso",
                          f"TAG do pai {p['tag']} não é TAG de nenhum material da aplicação")
            # assinatura como o Workflow B: todas as linhas geradas, bloqueadas ou não
            h = hash_linha(f"{lc.ficha}|{codigo}|{tag}")
            n, soma = n + qtd, (soma + h * qtd) % 4294967296
            if any(sev == "bloqueia" for _, sev, _ in problemas):
                res.bloqueadas += qtd
            else:
                res.linhas.extend([(lc.ficha, codigo, tag)] * qtd)
    aplicadas = {lc.ficha for lc in linhas}
    for ficha, mat in catalogo.items():
        if ficha not in aplicadas:
            achou(None, ficha, "", "V12", "aviso", f"PMIB do Status sem aplicação: {mat.descricao}")
    res.assinatura = assinatura_soma(n, soma)
    return res

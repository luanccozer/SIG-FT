"""Regras do motor da Aplicação LMR: port das seções 1, 2, 4 e 5 do lmr.js do Box (mesmos resultados).

A referência é o `DocManager Itaipu\\Docs Aconex\\LMR\\motor\\lmr.js` do Box, não o do GitHub.
"""

from __future__ import annotations

import math
import re
import sys
import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class Trecho:
    nome: str
    m: str | None
    hz: int | None
    pos: int | None


# ───────────── 1. Constantes ─────────────

# Ordem física das UGs: U-09A é a 10ª, U-10 a 11ª, U-18A a 20ª.
UGS: tuple[Trecho, ...] = (
    *(Trecho(f"U-{n:02d}", f"M{n:02d}", 50, n) for n in range(1, 10)),
    Trecho("U-09A", "M19", 50, 10),
    *(Trecho(f"U-{n}", f"M{n}", 60, n + 1) for n in range(10, 19)),
    Trecho("U-18A", "M20", 60, 20),
)
AMD = tuple(Trecho(f"AMD-{n:02d}", None, None, None) for n in range(1, 5))
AMC = tuple(Trecho(f"AMC-{n:02d}", None, None, None) for n in range(1, 4))
# Barragem (D, E, F, H, I) e Vertedouro (A): letra do trecho + bloco, sem UG.
BLOCOS_BARRAGEM = {"D": 58, "E": 6, "F": 36, "H": 14, "I": 27, "A": 15}
BARRAGEM = tuple(Trecho(f"{letra}-{i:02d}", None, None, None)
                 for letra, n in BLOCOS_BARRAGEM.items() for i in range(1, n + 1))
TRECHOS: tuple[Trecho, ...] = UGS + AMD + AMC + BARRAGEM
TRECHO_POR_NOME: dict[str, Trecho] = {t.nome: t for t in TRECHOS}

EIXOS = ("AB", "BC", "CD", "MB", "JB", "JD", "BP", "VT")  # BP = Barragem Principal, VT = Vertedouro

LOCAIS = {
    "CASA DE FORÇA": "CASA DE FORÇA",
    "CASA DE FORCA": "CASA DE FORÇA",
    "CASA DE FORÇA - UNIDADE GERADORA": "CASA DE FORÇA",
    "CASA DE FORCA - UNIDADE GERADORA": "CASA DE FORÇA",
    "SALA GERADORES DIESEL": "SALA GERADORES DIESEL",
    "BARRAGEM": "BARRAGEM",
    "VERTEDOURO": "VERTEDOURO",
}

LIMITE_TAG = 150  # o portal aceita até 150 caracteres no campo Tag

# ───────────── 2. Utilitários ─────────────


def txt(v) -> str:
    return "" if v is None else re.sub(r"\s+", " ", str(v)).strip()


def sem_acento(s: str) -> str:
    return re.sub("[̀-ͯ]", "", unicodedata.normalize("NFD", s))


def formata_elevacao(v) -> tuple[str | None, str | None]:
    """Elevação com 2 casas e vírgula: (valor, aviso); valor None se não for número."""
    if v is None or v == "":
        return None, None
    s = re.sub(r"^EL\.?\s*", "", str(v), flags=re.I).strip().replace(",", ".", 1)
    if not re.fullmatch(r"-?\d+(\.\d+)?", s):
        return None, f"elevação inválida: {v}"
    x = float(s)
    r = math.floor((x + sys.float_info.epsilon) * 100 + 0.5) / 100  # Math.round do JS
    valor = f"{r:.2f}".replace(".", ",")
    aviso = f"elevação {v} arredondada para {valor}" if abs(r - x) > 1e-9 else None
    return valor, aviso


def normaliza_trecho(v) -> str | None:
    s = re.sub(r"\s+", "", txt(v).upper())
    if m := re.fullmatch(r"U-?0*(\d{1,2})(A?)", s):
        nome = f"U-{int(m[1]):02d}{m[2]}"
    elif m := re.fullmatch(r"(AMD|AMC)-?0*(\d)", s):
        nome = f"{m[1]}-{int(m[2]):02d}"
    elif m := re.fullmatch(r"([ADEFHI])-?0*(\d{1,2})", s):
        nome = f"{m[1]}-{int(m[2]):02d}"
    else:
        return None
    return nome if nome in TRECHO_POR_NOME else None


def normaliza_eixo(v) -> str | None:
    s = re.sub(r"[-\s]", "", txt(v).upper())
    return s if s in EIXOS else None


def normaliza_local(v) -> str | None:
    return LOCAIS.get(txt(v).upper())


# ───────────── trechos e RDS ─────────────


def trechos_do_projeto(opcao: str, lista: list[str] | None = None) -> list[Trecho]:
    """opcao: TODAS | IMPARES | PARES | LISTA | AMD | AMC; lista: nomes para LISTA (ou AMD/AMC parciais)."""
    o = sem_acento(txt(opcao)).upper()

    def da_lista(base):
        if not lista:
            return list(base)
        nomes = [normaliza_trecho(x) for x in lista]
        if None in nomes:
            raise ValueError(f"trecho inválido na lista: {lista[nomes.index(None)]}")
        return [t for t in base if t.nome in nomes]

    if o == "TODAS":
        return list(UGS)
    if o == "IMPARES":
        return [t for t in UGS if t.pos % 2 == 1]
    if o == "PARES":
        return [t for t in UGS if t.pos % 2 == 0]
    if o in ("LISTA", "AMD", "AMC"):
        return da_lista({"LISTA": TRECHOS, "AMD": AMD, "AMC": AMC}[o])
    raise ValueError(f"opção de trechos desconhecida: {opcao}")


def trechos_do_material(projeto: list[Trecho], hz) -> list[Trecho]:
    """Trechos do projeto ∩ frequência. Sem hz num projeto 50+60 Hz devolve [] (o lmr.js marca `pergunta`)."""
    freqs = {t.hz for t in projeto if t.hz}
    if hz is None or hz == "":
        return [] if len(freqs) > 1 else list(projeto)
    if str(hz).upper() == "AMBAS" or not freqs:
        return list(projeto)
    h = int(re.sub(r"\D", "", str(hz)) or 0)
    return [t for t in projeto if t.hz == h]


def expande_rds(modelo: str, trecho: str) -> str:
    """`#ST[XX]=M[XX]...` → RDS-PP do trecho. RDS já expandido ou fora de UG volta igual."""
    s = txt(modelo)
    t = TRECHO_POR_NOME.get(trecho)
    if "[XX]" not in s or not t or not t.m:
        return s
    return s.replace("#ST[XX]", f"#ST{t.hz}").replace("M[XX]", t.m)


# ───────────── 4. CÓDIGO_LMR e TAG_LMR ─────────────


def _f(v) -> str:
    # campo faltante aparece como [?]: a linha já está bloqueada pela V1
    return "[?]" if v is None or v == "" else str(v)


def monta_codigo(campos: dict) -> str:
    c = campos
    local = f"{_f(c.get('local'))} - ELEV. {_f(c.get('elev'))} - EIXO {_f(c.get('eixo'))} - TRECHO {_f(c.get('trecho'))}"
    ini = f"{_f(c.get('escopo'))} - {_f(c.get('subsistema'))}"
    if c.get("pais"):
        cit = " - ".join(f"{p['tag']} - RDS-PP: {_f(p.get('rds'))}{p['tag']}" for p in c["pais"])
        return f"{ini} - {cit} - {local}"
    return f"{ini} - {_f(c.get('area'))} - RDS-PP: {_f(c.get('rds'))} - {local}"


def _len16(s: str) -> int:
    return len(s.encode("utf-16-le")) // 2


def _slice16(s: str, n: int) -> str:
    # String.slice do JS conta unidades UTF-16
    return s.encode("utf-16-le", "surrogatepass")[: 2 * max(0, n)].decode("utf-16-le", "ignore")


def monta_tag(campos: dict) -> str:
    c = campos
    pn = txt(c.get("pn"))
    fim = f" ({pn})" if pn else ""
    tag = c.get("tag")
    ini = f"{_f(c.get('escopo'))} - "
    if tag and c.get("caso_rds") in (1, 2):
        ini += f"{tag} - RDS-PP: {_f(c.get('rds'))}{tag} - "
    elif tag:
        ini += f"{tag} - "
    # passou de 150: encurta só a descrição na última palavra inteira; TAG e PN ficam completos
    d = _f(c.get("descricao"))
    livre = LIMITE_TAG - _len16(ini) - _len16(fim)
    if _len16(d) > livre:
        corte = _slice16(d, livre)
        sp = corte.rfind(" ")
        proximo = _slice16(d, livre + 1)[len(corte):] if livre >= 0 else ""
        d = corte if proximo == " " or sp < 0 else corte[:sp]
        d = re.sub(r"[\s,;:.\-–/(]+$", "", d)
    return _slice16(f"{ini}{d}{fim}", LIMITE_TAG)


# ───────────── 5. assinatura ─────────────


def hash_linha(s: str) -> int:
    """FNV-1a 32 bits sobre as unidades UTF-16 (como o charCodeAt do JS)."""
    h = 0x811C9DC5
    b = s.encode("utf-16-le", "surrogatepass")
    for i in range(0, len(b), 2):
        h = ((h ^ (b[i] | b[i + 1] << 8)) * 0x01000193) & 0xFFFFFFFF
    return h


def assinatura_soma(n: int, soma: int) -> str:
    return f"{n}-{soma % 4294967296:08X}"

"""As chaves de API cifradas no disco, com a DPAPI do Windows.

O que mudou
-----------
Até aqui as chaves de IA (Gemini, OpenRouter, Google Search/CSE, LlamaCloud,
IA da empresa) ficavam em TEXTO CLARO em `Documentos\\SIG-FT\\api_config.json`
-- qualquer um que abrisse o arquivo no Bloco de Notas, ou que recebesse uma
cópia dele, levava as chaves. Agora elas são cifradas com a **DPAPI do
Windows** (`CryptProtectData`), o mesmo esquema que o DocManager já usa para o
Client Secret do Aconex (`docmanager/services/credenciais.py`, espelhado aqui).

A chave da DPAPI é derivada da conta do Windows: o arquivo copiado para outra
máquina, ou aberto por outro usuário, NÃO decifra. Não é cofre de banco --
quem já estiver logado como a pessoa consegue ler --, mas é muito melhor que
texto claro.

⚠️ Consequência: o `api_config.json` deixa de ser compartilhável copiando o
arquivo (era a decisão de 2026-09-18, revista em 2026-10-30). Para passar as
chaves a um colega, use o `api_config.example.json` preenchido à mão, ou o
`.env`: um arquivo em texto claro é aceito e cifrado na primeira abertura.

Fora do Windows (desenvolvimento, CI) a DPAPI não existe e o valor fica em
base64, que **não é criptografia** -- só evita leitura acidental. O campo
`cifrado` de cada valor registra qual dos dois foi usado, e o arquivo é
fechado para os outros usuários da máquina (`chmod 600`).

Por que um módulo próprio, e não dentro de `dados_usuario.py`
------------------------------------------------------------
`dados_usuario` responde ONDE os arquivos do usuário moram; este módulo
responde COMO as chaves são guardadas. São quatro pontos que leem ou gravam
chaves -- `config.carregar_chaves` (leitura), `SIG_FT_App.save_keys` (a tela
Chaves de API), `dados_usuario.importar_do_lugar_antigo` (a migração da pasta
do programa) e `scripts/diagnostico_ia.py` --, e todos passam por aqui: uma
implementação só. Sem Qt e sem `sigft.config`, para poder rodar no bootstrap.

O formato do arquivo
--------------------
::

    {
      "_modelos_ia": {...},                      <- intocado (core/llm/selecao)
      "_chaves_cifradas": {
        "GEMINI":     {"valor": "<base64>", "cifrado": true},
        "OPENROUTER": {"valor": "<base64>", "cifrado": true}
      }
    }

Toda entrada de nível superior que é texto e não começa com `_` é uma chave
de API (é o formato antigo, e é como `carregar_chaves` sempre as leu). Não há
lista de nomes aqui de propósito: as chaves que existem continuam sendo as de
`config.ENV_VAR_POR_CHAVE`, e este módulo não precisa mudar quando uma nova
entrar.

Compatibilidade
---------------
* **Arquivo antigo, em texto claro**: lido normalmente, e reescrito cifrado na
  primeira leitura (`migrar_se_preciso`) ou na próxima gravação.
* **Texto claro e cifrado com o mesmo nome**: vale o texto claro. Só uma versão
  antiga do SIG-FT gravaria texto claro depois desta (ela não conhece a seção
  e a preserva) -- então o claro é o mais recente.
* **Valor que não decifra** (arquivo copiado de outra conta do Windows,
  corrompido): some da leitura, como se não houvesse chave. A tela pede de
  novo; o app nunca cai por isso. O valor guardado não é apagado até a pessoa
  gravar outro -- se o arquivo voltar para a conta certa, ele volta a valer.

Sigilo
------
Nenhuma função daqui põe o valor de uma chave em mensagem de exceção ou em
log: os erros da DPAPI levam só o código do Windows, e quem decifra engole o
erro (`abrir`).
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from typing import Any

# Seção do `api_config.json` com as chaves cifradas. Começa com `_` como a
# `_modelos_ia`: o que começa com `_` não é chave de API.
SECAO = "_chaves_cifradas"

# CRYPTPROTECT_UI_FORBIDDEN: nunca abrir caixa de diálogo -- a leitura das
# chaves acontece dentro de threads de trabalho, sem janela para exibir.
_CRYPTPROTECT_UI_FORBIDDEN = 0x01


# ────────────────────────────── DPAPI (Windows) ─────────────────────────────

def dpapi_disponivel() -> bool:
    return os.name == "nt"


def _dpapi(funcao: str, dados: bytes) -> bytes:
    """Chama CryptProtectData/CryptUnprotectData via ctypes (sem dependência nova).

    A mensagem de erro leva só o código do Windows -- nunca os dados.
    """
    import ctypes
    from ctypes import wintypes

    class BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD),
                    ("pbData", ctypes.POINTER(ctypes.c_char))]

    entrada = BLOB(len(dados), ctypes.cast(ctypes.create_string_buffer(dados, len(dados)),
                                           ctypes.POINTER(ctypes.c_char)))
    saida = BLOB()
    crypt32 = ctypes.windll.crypt32
    chamada = getattr(crypt32, funcao)
    ok = chamada(ctypes.byref(entrada), None, None, None, None,
                 _CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(saida))
    if not ok:
        raise OSError(f"{funcao} falhou (erro {ctypes.GetLastError()})")
    try:
        return ctypes.string_at(saida.pbData, saida.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(saida.pbData)


def cifrar(texto: str) -> tuple[str, bool]:
    """(texto guardável, cifrado_de_verdade). Cai para base64 fora do Windows.

    Valor vazio não passa pela DPAPI: não há o que proteger, e um `""` salvo
    tem de continuar valendo como "configurada vazia" (ganha da variável de
    ambiente, como sempre ganhou).
    """
    bruto = texto.encode("utf-8")
    if bruto and dpapi_disponivel():
        try:
            return base64.b64encode(_dpapi("CryptProtectData", bruto)).decode("ascii"), True
        except Exception:  # noqa: BLE001 -- DPAPI indisponível: não perder a chave
            pass
    return base64.b64encode(bruto).decode("ascii"), False


def decifrar(texto: str, cifrado: bool) -> str:
    """O inverso de `cifrar`. Levanta se não decifrar -- quem chama decide."""
    bruto = base64.b64decode(texto.encode("ascii"), validate=True)
    if cifrado:
        return _dpapi("CryptUnprotectData", bruto).decode("utf-8")
    return bruto.decode("utf-8")


# ─────────────────────────── o conteúdo do arquivo ──────────────────────────

def e_chave(nome: Any, valor: Any) -> bool:
    """`True` se a entrada de nível superior é uma chave de API em texto claro."""
    return isinstance(nome, str) and not nome.startswith("_") and isinstance(valor, str)


def tem_chave_em_claro(dados: Any) -> bool:
    return isinstance(dados, dict) and any(e_chave(n, v) for n, v in dados.items())


def abrir(dados: dict) -> dict:
    """O conteúdo do `api_config.json` com as chaves em claro, PARA A MEMÓRIA.

    O que não é chave (`_modelos_ia`...) passa intacto; a seção cifrada some e
    os valores dela aparecem no nível de cima, como no formato antigo -- é o
    que `carregar_chaves` e quem o consome sempre esperaram.

    Valor que não decifra é omitido (= sem chave). Levanta `TypeError` se
    `dados` não for um dicionário, para `carregar_chaves` manter o mesmo
    fallback de sempre para JSON que não é objeto.
    """
    if not isinstance(dados, dict):
        raise TypeError("o api_config.json não é um objeto JSON")
    claro = {n: v for n, v in dados.items() if n != SECAO}
    secao = dados.get(SECAO)
    if not isinstance(secao, dict):
        return claro
    for nome, registro in secao.items():
        if e_chave(nome, claro.get(nome)):
            continue  # o texto claro é o mais recente (ver o docstring do módulo)
        if not isinstance(nome, str) or not isinstance(registro, dict):
            continue
        try:
            claro[nome] = decifrar(str(registro.get("valor", "")),
                                   bool(registro.get("cifrado", False)))
        except Exception:  # noqa: BLE001 -- outra conta do Windows, valor corrompido
            # Sem chave: a tela pede de novo. Nada do valor vai para log.
            continue
    return claro


def guardar(dados: dict, novas: dict | None = None) -> dict:
    """O conteúdo a gravar: as chaves em claro de `dados` e `novas` vão cifradas.

    Devolve um dicionário novo. O que não é chave fica como está, e o que já
    estava cifrado e não foi substituído também -- inclusive o que não decifra
    nesta conta, para não destruir o que pode voltar a valer.
    """
    resultado: dict = {}
    pendentes: dict[str, str] = {}
    for nome, valor in dados.items():
        if e_chave(nome, valor):
            pendentes[nome] = valor
        elif nome != SECAO:
            resultado[nome] = valor
    for nome, valor in (novas or {}).items():
        if e_chave(nome, valor):
            pendentes[nome] = valor
        else:
            resultado[nome] = valor

    secao_antiga = dados.get(SECAO)
    secao = dict(secao_antiga) if isinstance(secao_antiga, dict) else {}
    for nome, valor in pendentes.items():
        guardado, cifrado = cifrar(valor)
        secao[nome] = {"valor": guardado, "cifrado": cifrado}
    if secao:
        resultado[SECAO] = secao
    return resultado


# ─────────────────────────────────── disco ──────────────────────────────────

def _ler_bruto(caminho: str | os.PathLike[str]) -> dict:
    """O JSON do arquivo, tolerante: `{}` se faltar, estiver ilegível ou não
    for um objeto."""
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            dados = json.load(arquivo)
    except (OSError, ValueError):
        return {}
    return dados if isinstance(dados, dict) else {}


def gravar(caminho: str | os.PathLike[str], dados: dict) -> None:
    """Grava `dados` (já no formato de `guardar`) de forma atômica.

    Atômica (temporário + `os.replace`): um corte no meio da gravação não pode
    deixar o arquivo pela metade, que faria as chaves "sumirem" na próxima
    abertura. Fora do Windows, fecha o arquivo para os outros usuários.
    """
    destino = Path(caminho)
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporario = destino.with_name(destino.name + ".tmp")
    with open(temporario, "w", encoding="utf-8") as arquivo:
        json.dump(dados, arquivo, ensure_ascii=False, indent=2)
    if os.name != "nt":
        try:
            os.chmod(temporario, 0o600)
        except OSError:
            pass
    os.replace(temporario, destino)


def salvar_chaves(caminho: str | os.PathLike[str], novas: dict) -> None:
    """Troca só as chaves `novas` no arquivo, cifradas, preservando o resto."""
    gravar(caminho, guardar(_ler_bruto(caminho), novas))


def ler(caminho: str | os.PathLike[str]) -> dict:
    """O arquivo inteiro com as chaves em claro (ver `abrir`). `{}` se faltar."""
    return abrir(_ler_bruto(caminho))


def migrar_se_preciso(caminho: str | os.PathLike[str]) -> bool:
    """Reescreve cifrado um arquivo que ainda tem chave em texto claro.

    Devolve se reescreveu. **Nunca levanta**: é chamada durante a leitura das
    chaves, e uma pasta sem permissão de escrita não pode impedir o app de
    usar as chaves que conseguiu ler -- a próxima gravação tenta de novo.
    """
    try:
        dados = _ler_bruto(caminho)
        if not tem_chave_em_claro(dados):
            return False
        gravar(caminho, guardar(dados))
        return True
    except Exception:  # noqa: BLE001 -- ver o docstring
        return False

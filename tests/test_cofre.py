"""As chaves de API cifradas no `api_config.json` (`sigft/core/cofre.py`).

A suíte roda em Linux, onde a DPAPI não existe: os testes do caminho do
Windows trocam `_dpapi` por um dublê reversível (e por um que recusa, para o
arquivo copiado de outra conta). O caminho real da DPAPI só se exerce no
Windows.
"""
from __future__ import annotations

import json
import os
import stat

import pytest

from sigft import config as sigft_config
from sigft.core import cofre

SEGREDO = "AIzaSy-segredo-de-teste-1234"


def _dpapi_falso(funcao: str, dados: bytes) -> bytes:
    """Dublê reversível: inverte os bytes e põe um prefixo, para o texto
    guardado não ser o base64 do segredo."""
    if funcao == "CryptProtectData":
        return b"DPAPI" + dados[::-1]
    assert dados.startswith(b"DPAPI")
    return dados[len(b"DPAPI"):][::-1]


def _dpapi_de_outra_conta(funcao: str, dados: bytes) -> bytes:
    raise OSError(f"{funcao} falhou (erro 13)")


@pytest.fixture
def windows(monkeypatch):
    monkeypatch.setattr(cofre, "dpapi_disponivel", lambda: True)
    monkeypatch.setattr(cofre, "_dpapi", _dpapi_falso)


@pytest.fixture
def sem_env(monkeypatch):
    for variavel in sigft_config.ENV_VAR_POR_CHAVE.values():
        monkeypatch.delenv(variavel, raising=False)


# ─────────────────────────────── ida e volta ────────────────────────────────

def test_ida_e_volta_com_dpapi(windows, tmp_path):
    arquivo = tmp_path / "api_config.json"
    cofre.salvar_chaves(arquivo, {"GEMINI": SEGREDO, "OPENROUTER": "sk-or-x"})

    texto = arquivo.read_text(encoding="utf-8")
    assert SEGREDO not in texto
    bruto = json.loads(texto)
    assert "GEMINI" not in bruto
    assert bruto[cofre.SECAO]["GEMINI"]["cifrado"] is True

    assert cofre.ler(arquivo) == {"GEMINI": SEGREDO, "OPENROUTER": "sk-or-x"}


def test_carregar_chaves_decifra(windows, sem_env, tmp_path):
    arquivo = tmp_path / "api_config.json"
    cofre.salvar_chaves(arquivo, {"GEMINI": SEGREDO})

    chaves = sigft_config.carregar_chaves(arquivo)

    assert chaves["GEMINI"] == SEGREDO
    assert cofre.SECAO not in chaves


def test_gravar_preserva_o_resto_do_arquivo(windows, tmp_path):
    arquivo = tmp_path / "api_config.json"
    arquivo.write_text(json.dumps({"_modelos_ia": {"global": "x"}}), encoding="utf-8")

    cofre.salvar_chaves(arquivo, {"GEMINI": SEGREDO})
    cofre.salvar_chaves(arquivo, {"OPENROUTER": "sk-or-x"})

    bruto = json.loads(arquivo.read_text(encoding="utf-8"))
    assert bruto["_modelos_ia"] == {"global": "x"}
    assert cofre.ler(arquivo) == {"_modelos_ia": {"global": "x"},
                                  "GEMINI": SEGREDO, "OPENROUTER": "sk-or-x"}


def test_chave_vazia_continua_valendo_como_vazia(windows, monkeypatch, tmp_path):
    """Um `""` salvo sempre ganhou da variável de ambiente; continua ganhando."""
    monkeypatch.setenv("API_GEMINI_LUAN_GMAIL", "do-env")
    arquivo = tmp_path / "api_config.json"
    cofre.salvar_chaves(arquivo, {"GEMINI": ""})

    assert sigft_config.carregar_chaves(arquivo)["GEMINI"] == ""


# ─────────────────────── o arquivo antigo, em texto claro ───────────────────

def test_arquivo_em_texto_claro_carrega_e_vira_cifrado(windows, sem_env, tmp_path):
    arquivo = tmp_path / "api_config.json"
    arquivo.write_text(json.dumps({"GEMINI": SEGREDO, "_modelos_ia": {"global": None}}),
                       encoding="utf-8")

    chaves = sigft_config.carregar_chaves(arquivo)

    assert chaves["GEMINI"] == SEGREDO
    texto = arquivo.read_text(encoding="utf-8")
    assert SEGREDO not in texto
    bruto = json.loads(texto)
    assert bruto["_modelos_ia"] == {"global": None}
    assert bruto[cofre.SECAO]["GEMINI"]["cifrado"] is True
    # E a segunda leitura, já do formato novo, dá o mesmo.
    assert sigft_config.carregar_chaves(arquivo)["GEMINI"] == SEGREDO


def test_texto_claro_mais_novo_ganha_do_cifrado(windows, tmp_path):
    """Só uma versão antiga gravaria texto claro depois: o claro é o mais novo."""
    arquivo = tmp_path / "api_config.json"
    cofre.salvar_chaves(arquivo, {"GEMINI": "velha"})
    bruto = json.loads(arquivo.read_text(encoding="utf-8"))
    bruto["GEMINI"] = "nova"
    arquivo.write_text(json.dumps(bruto), encoding="utf-8")

    assert cofre.ler(arquivo)["GEMINI"] == "nova"
    assert cofre.migrar_se_preciso(arquivo) is True
    assert "GEMINI" not in json.loads(arquivo.read_text(encoding="utf-8"))
    assert cofre.ler(arquivo)["GEMINI"] == "nova"


def test_migracao_sem_permissao_de_escrita_nao_levanta(windows, sem_env, tmp_path, monkeypatch):
    arquivo = tmp_path / "api_config.json"
    arquivo.write_text(json.dumps({"GEMINI": SEGREDO}), encoding="utf-8")

    def recusa(*_a, **_k):
        raise PermissionError("sem permissão")

    monkeypatch.setattr(cofre, "gravar", recusa)

    assert cofre.migrar_se_preciso(arquivo) is False
    assert sigft_config.carregar_chaves(arquivo)["GEMINI"] == SEGREDO


# ───────────────────── valor que não decifra = sem chave ────────────────────

def test_valor_de_outra_conta_do_windows_vira_sem_chave(windows, sem_env, tmp_path, monkeypatch):
    arquivo = tmp_path / "api_config.json"
    cofre.salvar_chaves(arquivo, {"GEMINI": SEGREDO, "OPENROUTER": "sk-or-x"})
    monkeypatch.setattr(cofre, "_dpapi", _dpapi_de_outra_conta)

    chaves = sigft_config.carregar_chaves(arquivo)

    assert chaves["GEMINI"] is None          # = sem chave: a tela pede de novo
    assert sigft_config.get_key(chaves, "GEMINI") is None
    assert chaves["OPENROUTER"] is None


def test_valor_corrompido_vira_sem_chave(tmp_path):
    arquivo = tmp_path / "api_config.json"
    arquivo.write_text(json.dumps({cofre.SECAO: {
        "GEMINI": {"valor": "isto não é base64!", "cifrado": False},
        "LLAMA": "não é um registro",
        "OPENROUTER": {"valor": "c2stb3IteA==", "cifrado": False},
    }}), encoding="utf-8")

    assert cofre.ler(arquivo) == {"OPENROUTER": "sk-or-x"}


def test_valor_que_nao_decifra_nao_e_apagado_ate_gravar_outro(windows, tmp_path, monkeypatch):
    arquivo = tmp_path / "api_config.json"
    cofre.salvar_chaves(arquivo, {"GEMINI": SEGREDO})
    guardado = json.loads(arquivo.read_text(encoding="utf-8"))[cofre.SECAO]["GEMINI"]
    monkeypatch.setattr(cofre, "_dpapi", _dpapi_de_outra_conta)

    cofre.salvar_chaves(arquivo, {"OPENROUTER": "x"})  # outra chave: GEMINI fica

    assert json.loads(arquivo.read_text(encoding="utf-8"))[cofre.SECAO]["GEMINI"] == guardado


def test_erro_da_dpapi_nao_leva_o_segredo(windows, monkeypatch):
    monkeypatch.setattr(cofre, "_dpapi", _dpapi_de_outra_conta)
    guardado, cifrado = cofre.cifrar(SEGREDO)    # cai para base64, sem levantar
    assert cifrado is False
    with pytest.raises(OSError) as erro:
        cofre.decifrar(guardado, True)
    assert SEGREDO not in str(erro.value)


# ────────────────────────── fora do Windows: base64 ─────────────────────────

def test_fora_do_windows_e_base64_marcado_como_nao_cifrado(monkeypatch, tmp_path):
    monkeypatch.setattr(cofre, "dpapi_disponivel", lambda: False)
    arquivo = tmp_path / "api_config.json"

    cofre.salvar_chaves(arquivo, {"GEMINI": SEGREDO})

    registro = json.loads(arquivo.read_text(encoding="utf-8"))[cofre.SECAO]["GEMINI"]
    assert registro["cifrado"] is False
    assert registro["valor"] != SEGREDO
    assert cofre.ler(arquivo)["GEMINI"] == SEGREDO


@pytest.mark.skipif(os.name == "nt", reason="chmod 600 é só fora do Windows")
def test_fora_do_windows_o_arquivo_fica_so_para_o_dono(monkeypatch, tmp_path):
    monkeypatch.setattr(cofre, "dpapi_disponivel", lambda: False)
    arquivo = tmp_path / "api_config.json"

    cofre.salvar_chaves(arquivo, {"GEMINI": SEGREDO})

    assert stat.S_IMODE(arquivo.stat().st_mode) == 0o600
    assert not (tmp_path / "api_config.json.tmp").exists()

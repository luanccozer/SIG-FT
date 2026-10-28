"""A regra da boas-vindas: quando ela aparece no lugar da Home (2026-10-28).

Desenho: `docs/superpowers/specs/2026-10-28-ajuda-para-quem-comeca-design.md`,
parte 2. A tela é `sigft/app_qt/views/boas_vindas.py`; quem decide na montagem
da janela é `sigft/app_qt/main.py`. Este módulo não importa Qt.

Só para quem NUNCA usou: quem já usava o SIG-FT e atualiza não pode ganhar uma
página de "bem-vindo" no lugar da Home de sempre. Duas condições:

1. a preferência `boas_vindas_vista` (seção `opcoes` do `user_prefs.json`) não
   está gravada. Ela é gravada por "Ir para o início" e pelo clique num caminho,
   e não por mostrar a página: quem fecha o app sem escolher nada a vê de novo;
2. a pasta de dados (`Documentos\\SIG-FT\\`) não tem RASTRO DE USO.

O que é rastro de uso (`rastros_de_uso`)
----------------------------------------
O que só existe porque alguém TRABALHOU num módulo:

* `user_prefs.json` com qualquer entrada nas seções de caminho e de tabela
  (`SECOES_DE_USO`): a última pasta ou arquivo de um diálogo, as pastas padrão,
  os recentes, as colunas de uma tabela. Todo módulo abre um diálogo de
  arquivo, e o diálogo grava a pasta: é o rastro mais certo. Quem atualiza de
  uma versão anterior à pasta de dados traz o arquivo pela migração
  (`dados_usuario.migrar_se_preciso`, antes da janela), com as pastas dentro;
* `user_prefs.json` com a versão vista das novidades DIFERENTE da atual: a janela
  de novidades só grava no app instalado e só depois desta decisão
  (`novidades.agendar_na_abertura`, no fim da montagem); achar uma versão
  anterior gravada é de quem abriu uma versão velha e atualizou, mesmo sem nunca
  ter aberto um diálogo de arquivo. A MESMA versão não conta: foi esta
  instalação que abriu antes, e saiu sem escolher (vê de novo);
* `user_prefs.json` que existe e não se lê: alguém o gravou; e mostrar sem
  conseguir gravar a vista seria mostrar em toda abertura;
* `logs/` com algum arquivo que não seja dos que a própria abertura grava
  (`LOGS_DA_ABERTURA`): o log de execução de um módulo
  (`duplicadas_2026-08-18_14-32-05.log`), ou uma subpasta com arquivo (o resumo
  do lote, o diagnóstico do AMP);
* `api_config.json` com alguma chave preenchida.

O que NÃO é (a primeira abertura grava antes de a janela decidir, ou logo
depois): o idioma, o tema, a letra, o nome e o "já perguntou", a versão vista
das novidades quando é a atual, as opções liga/desliga (o menu recolhido), o `sigft.log` e o
diário. Contar qualquer um deles faria a página nunca aparecer para quem
acabou de instalar.

Nunca levanta: a abertura do app não pode depender disto. Na dúvida (pasta que
não se lê), não mostra.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

_log = logging.getLogger(__name__)

# Ligada, a página nunca aparece sozinha (o Ctrl+K e a Configuração a abrem
# igual). Só os testes a ligam (`tests/conftest.py`): a pasta de dados de cada
# teste é nova, e a janela abriria na boas-vindas em vez da Home. Quem testa a
# boas-vindas tira a variável.
ENV_DESLIGAR = "SIGFT_SEM_BOAS_VINDAS"

# A preferência (seção `opcoes`, liga/desliga) gravada quando a pessoa sai da página.
CHAVE_VISTA = "boas_vindas_vista"

# As seções do `user_prefs.json` que só se enchem trabalhando num módulo.
SECOES_DE_USO = ("ultimos", "categorias", "pastas_padrao", "arquivos", "recentes", "colunas")

# O que a própria abertura grava em `logs/` (o `sigft.log` do `.exe` sem console e
# o diário de quedas): começa com um destes nomes, não é uso.
LOGS_DA_ABERTURA = ("sigft.log", "diario.", "queda.log")

ARQUIVO_DE_CHAVES = "api_config.json"


def _pasta_de_dados() -> Path:
    from sigft.core.dados_usuario import pasta_dados

    return pasta_dados()


def _ler_json(arquivo: Path):
    """`(existe, conteúdo)`; conteúdo `None` quando o arquivo não se lê."""
    if not arquivo.is_file():
        return False, None
    try:
        return True, json.loads(arquivo.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return True, None


def _rastros_nas_preferencias(pasta: Path) -> list[str]:
    from sigft.core.prefs import CHAVE_NOVIDADES, CONFIG_FILE

    existe, dados = _ler_json(pasta / CONFIG_FILE)
    if not existe:
        return []
    if not isinstance(dados, dict):
        return [f"{CONFIG_FILE} (ilegível)"]
    rastros = [f"{CONFIG_FILE}:{secao}" for secao in SECOES_DE_USO if dados.get(secao)]
    novidades = dados.get(CHAVE_NOVIDADES)
    vista = novidades.get("ultima_versao_vista") if isinstance(novidades, dict) else None
    if isinstance(vista, str) and vista and vista != _versao_atual():
        rastros.append(f"{CONFIG_FILE}:novidades ({vista})")
    return rastros


def _versao_atual() -> str:
    from sigft import _build_info

    return _build_info.VERSAO


def _arquivo_da_abertura(nome: str) -> bool:
    return nome.startswith(LOGS_DA_ABERTURA)


def _tem_arquivo(pasta: Path) -> bool:
    return any(os.path.isfile(os.path.join(raiz, nome))
               for raiz, _dirs, nomes in os.walk(pasta) for nome in nomes)


def _rastros_nos_logs(pasta: Path) -> list[str]:
    logs = pasta / "logs"
    if not logs.is_dir():
        return []
    rastros = []
    for item in sorted(logs.iterdir()):
        if item.is_dir():
            if _tem_arquivo(item):
                rastros.append(f"logs/{item.name}")
        elif not _arquivo_da_abertura(item.name):
            rastros.append(f"logs/{item.name}")
    return rastros


def _rastros_nas_chaves(pasta: Path) -> list[str]:
    _existe, dados = _ler_json(pasta / ARQUIVO_DE_CHAVES)
    if isinstance(dados, dict) and any(isinstance(v, str) and v.strip() for v in dados.values()):
        return [ARQUIVO_DE_CHAVES]
    return []


def rastros_de_uso(pasta: str | os.PathLike[str] | None = None) -> list[str]:
    """O que, na pasta de dados, diz que alguém já usou o SIG-FT (lista vazia:
    ninguém). Ver o docstring do módulo. Levanta `OSError` se a pasta não se lê;
    `deve_mostrar_boas_vindas` trata."""
    raiz = Path(pasta) if pasta is not None else _pasta_de_dados()
    return [*_rastros_nas_preferencias(raiz), *_rastros_nos_logs(raiz), *_rastros_nas_chaves(raiz)]


def ja_vista() -> bool:
    from sigft.core import prefs

    return prefs.get_opcao(CHAVE_VISTA, False)


def deve_mostrar_boas_vindas() -> bool:
    """`True` só sem `boas_vindas_vista` e sem rastro de uso. Nunca levanta."""
    if os.environ.get(ENV_DESLIGAR):
        return False
    try:
        if ja_vista():
            return False
        rastros = rastros_de_uso()
    except Exception:  # noqa: BLE001 -- na dúvida, a Home de sempre
        _log.warning("nao consegui decidir a boas-vindas", exc_info=True)
        return False
    if rastros:
        _log.info("boas-vindas: ja usado (%s)", ", ".join(rastros))
    return not rastros


def marcar_vista() -> None:
    """Grava `boas_vindas_vista`: a página não abre mais sozinha. Nunca levanta."""
    from sigft.core import prefs

    try:
        prefs.set_opcao(CHAVE_VISTA, True)
    except Exception:  # noqa: BLE001 -- lembrar não pode atrapalhar o clique
        _log.warning("nao consegui gravar a boas-vindas como vista", exc_info=True)

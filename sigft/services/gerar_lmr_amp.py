"""Gerar Aplicação LMR, estágio 2: manda a extração ao AMP e grava o CSV que o agente devolve.

Contrato com o workflow: `amp/aplicacao_lmr/gerar_workflow.py` (campos `modo`, `escopo`, `subsistema`, `trechos`,
`lotes`; arquivos `indice`, `status_pmib`, `lote_01`...`lote_NN`). O envio vai UMA vez, sem repetição (cada repetição
seria uma execução nova do agente). Este módulo nunca vê a chave: ela fica dentro do `ClienteAmp`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from sigft.core import dados_usuario
from sigft.services import revisao_amp
from sigft.services.gerar_lmr_csv import CsvInvalido, ler_csv

BATIMENTO = 30.0  # segundos entre as linhas de "esperando o AMP"
CORPO_NO_DIAGNOSTICO = 3000
_LOTE = re.compile(r"^lote_(\d+)\.md$", re.IGNORECASE)


@dataclass(frozen=True)
class RespostaLmr:
    ok: bool
    csv: Path | None
    linhas: int
    lotes_com_erro: list[int]
    execucao: str
    erro: str


def _falha(erro: str, execucao: str = "") -> RespostaLmr:
    return RespostaLmr(False, None, 0, [], execucao, erro)


def _lotes_da_pasta(pasta: Path) -> list[Path]:
    achados = sorted((p for p in (pasta / "LOTES").glob("lote_*.md") if _LOTE.match(p.name)),
                     key=lambda p: int(_LOTE.match(p.name).group(1)))
    return achados


def _inteiros(valor) -> list[int]:
    saida = []
    for x in valor if isinstance(valor, list) else []:
        try:
            saida.append(int(x))
        except (TypeError, ValueError):
            continue
    return saida


def _diagnostico(resposta, motivo: str, log_cb) -> None:
    """O corpo cru da resposta em `logs\\amp\\`. O `ClienteAmp` já troca a chave por `***` no corpo."""
    nome = f"{datetime.now():%Y%m%d-%H%M%S} aplicacao_lmr.txt"
    texto = "\n".join(["Gerar Aplicação LMR: resposta do AMP", f"motivo: {motivo}",
                       f"http: {resposta.http}", f"execução: {resposta.execucao or '?'}",
                       f"versão do workflow: {resposta.versao_workflow or '?'}", "", "corpo:",
                       str(resposta.corpo)[:CORPO_NO_DIAGNOSTICO]])
    try:
        pasta = dados_usuario.pasta_logs() / "amp"
        pasta.mkdir(parents=True, exist_ok=True)
        (pasta / nome).write_text(texto, encoding="utf-8")
        log_cb(f"Diagnóstico em {pasta / nome}")
    except OSError as erro:
        log_cb(f"O diagnóstico não foi gravado: {erro}", "warn")


def enviar_ao_amp(pasta_sistema: Path, cliente, *, escopo: str, subsistema: str, trechos: str, log_cb,
                  batimento: float = BATIMENTO) -> RespostaLmr:
    extracao = Path(pasta_sistema) / "LMR" / "EXTRACAO"
    indice, status = extracao / "INDICE.md", extracao / "STATUS_PMIB.csv"
    lotes = _lotes_da_pasta(extracao)
    if not (indice.is_file() and status.is_file() and lotes):
        return _falha("Sem a extração em LMR\\EXTRACAO (índice, Status e lotes): rode a aba 1 antes.")

    campos = {"modo": "aplicacao_lmr", "escopo": escopo, "subsistema": subsistema, "trechos": trechos,
              "lotes": str(len(lotes))}
    arquivos = {"indice": indice, "status_pmib": status}
    arquivos.update({f"lote_{i:02d}": caminho for i, caminho in enumerate(lotes, 1)})
    log_cb(f"Enviando ao AMP: índice, Status e {len(lotes)} lote(s). O agente leva minutos; o envio vai uma vez só.")
    resposta = revisao_amp._com_batimento(lambda: cliente.enviar(campos, arquivos), log_cb, batimento)

    if not resposta.ok:
        etapa = str(resposta.dados.get("etapa") or "")
        erro = f"{resposta.erro} (etapa: {etapa})" if etapa else resposta.erro
        _diagnostico(resposta, erro, log_cb)
        return _falha(erro, resposta.execucao)
    recebidos = resposta.dados.get("lotes_recebidos")
    if recebidos != len(lotes):
        erro = f"O AMP recebeu {recebidos} lote(s) e foram enviados {len(lotes)}: nada foi gravado."
        _diagnostico(resposta, erro, log_cb)
        return _falha(erro, resposta.execucao)
    texto = str(resposta.dados.get("csv") or "")
    try:
        linhas, achados = ler_csv(texto)
    except CsvInvalido as exc:
        erro = f"A resposta do AMP não tem um CSV válido: {exc}"
        _diagnostico(resposta, erro, log_cb)
        return _falha(erro, resposta.execucao)

    destino = extracao / "RESPOSTA_AMP.csv"
    try:
        if destino.exists():
            destino.replace(extracao / "RESPOSTA_AMP (anterior).csv")
        destino.write_text(texto, encoding="utf-8-sig", newline="")
    except OSError:
        # arquivo aberto no Excel: a resposta custou minutos de agente, grava com outro nome em vez de perder
        destino = extracao / f"RESPOSTA_AMP {datetime.now():%Y%m%d-%H%M%S}.csv"
        destino.write_text(texto, encoding="utf-8-sig", newline="")
        log_cb(f"RESPOSTA_AMP.csv está aberto em outro programa: a resposta foi gravada em {destino.name}.", "warn")
    com_erro = _inteiros(resposta.dados.get("lotes_com_erro"))
    if com_erro:
        log_cb(f"O agente não leu os lotes {', '.join(map(str, com_erro))}: o CSV está incompleto.", "warn")
    if achados:
        log_cb(f"{len(achados)} aviso(s) ao ler a resposta; eles voltam na validação da aba 3.", "warn")
    log_cb(f"Resposta gravada em {destino} ({len(linhas)} linha(s), execução {resposta.execucao or '?'}).")
    return RespostaLmr(True, destino, len(linhas), com_erro, resposta.execucao, "")


def testar_conexao(cliente) -> list[str]:
    """As linhas do "Testar conexão com o AMP": só o `ping`, sem chamar o agente nem mandar documento."""
    return revisao_amp.testar_conexao(cliente)

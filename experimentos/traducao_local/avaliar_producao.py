"""Rodada 3: as MESMAS 88 respostas pelo caminho de PRODUCAO.

`traducao_respostas.traduzir_respostas` + `tradutor_local.TradutorLocal` +
`glossario_em_uso()` -- exatamente o que o Tradutor 4.2 vai rodar.
"""
import json
import os
import sys
import time

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from amostras import AMOSTRAS  # noqa: E402
from sigft.core import tradutor_local  # noqa: E402
from sigft.services import traducao_respostas as tr  # noqa: E402


def main():
    motor = tradutor_local.TradutorLocal()
    t0 = time.time()
    motor.traduzir(["Aço"])
    carga = time.time() - t0
    t0 = time.time()
    saida = tr.traduzir_respostas(AMOSTRAS, motor, tr.glossario_em_uso())
    total = time.time() - t0
    t0 = time.time()
    tr.traduzir_respostas(AMOSTRAS * 5, motor, tr.glossario_em_uso())
    cinco_vezes = time.time() - t0

    tempos = {"cpus": os.cpu_count(), "carga_s": round(carga, 2),
              "88_respostas_s": round(total, 2), "440_com_repeticao_s": round(cinco_vezes, 2),
              "resumo": tr.resumo(saida)}
    linhas = ["| pt | es | origem | aviso |", "|---|---|---|---|"]
    for t in saida:
        linhas.append(f"| {t.original} | {t.texto} | {t.origem} | {t.aviso} |".replace("\n", " "))
    texto = ("## Producao\n\n```\n" + json.dumps(tempos, ensure_ascii=False, indent=1)
             + "\n```\n\n" + "\n".join(linhas) + "\n")
    print(texto)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(texto)


if __name__ == "__main__":
    main()

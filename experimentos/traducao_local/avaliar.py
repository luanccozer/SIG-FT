"""Experimento (rodada 2): tradutor LOCAL (offline) serve para as fichas? PT -> ES.

Roda no GitHub Actions (o conteiner do Claude nao alcanca os servidores de
modelo). A rodada 1 mostrou: Google bloqueado no runner (429), OPUS-MT
tc-big itc-itc bom mas errando o vocabulario da casa (mancal, porca,
arruela), Argos recusado (403 no download).

Esta rodada mede:
  - OPUS tc-big com e sem GLOSSARIO aplicado na origem, beam 4 e 1;
  - o mesmo modelo pelo caminho que o APP usaria (so ctranslate2 +
    sentencepiece, sem transformers) -- tem de dar o mesmo resultado;
  - Argos pt->es, baixado com User-Agent (o 403 pode ser o urllib).

Uso:
  python avaliar.py converter --saida modelo_tc_big      (Linux, com torch)
  python avaliar.py avaliar --modelo modelo_tc_big [--argos] [--hf]
"""
import argparse
import json
import os
import re
import shutil
import sys
import time
import urllib.request
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from amostras import AMOSTRAS  # noqa: E402

MODELO_HF = "Helsinki-NLP/opus-mt-tc-big-itc-itc"
PREFIXO_ES = ">>spa<<"
PASTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_modelos")
ARGOS_PT_ES = "https://argos-net.com/v1/translate-pt_es-1_0.argosmodel"

# Vocabulario da casa: o que a rodada 1 errou, e so isso.
GLOSSARIO = {
    "chave fim de curso": "interruptor de fin de carrera",
    "fim de curso": "fin de carrera",
    "conforme desenho": "según plano",
    "escova de carvão": "escobilla de carbón",
    "escovas de carvão": "escobillas de carbón",
    "porta-escova": "portaescobillas",
    "válvula gaveta": "válvula de compuerta",
    "temperado e revenido": "templado y revenido",
    "ao tempo": "a la intemperie",
    "não aplicável": "no aplicable",
    "mancais": "cojinetes",
    "mancal": "cojinete",
    "porcas": "tuercas",
    "porca": "tuerca",
    "arruelas": "arandelas",
    "arruela": "arandela",
    "gaxetas": "empaquetaduras",
    "gaxeta": "empaquetadura",
    "portinhola": "clapeta",
    "içamento": "izaje",
    "zincado": "cincado",
}


def tamanho_mb(pasta):
    total = 0
    for raiz, _, arquivos in os.walk(pasta):
        for a in arquivos:
            total += os.path.getsize(os.path.join(raiz, a))
    return round(total / 1e6, 1)


def caixa_de_frase(texto):
    letras = [c for c in texto if c.isalpha()]
    if letras and all(c.isupper() for c in letras) and len(letras) > 3:
        return texto[:1].upper() + texto[1:].lower(), True
    return texto, False


def aplicar_glossario(texto):
    """Troca o termo PT pelo ES ANTES do modelo (o modelo copia o que ja esta
    em espanhol). Frase inteira no glossario nem vai ao modelo."""
    chave = texto.strip().lower()
    if chave in GLOSSARIO:
        return GLOSSARIO[chave], True
    for pt in sorted(GLOSSARIO, key=len, reverse=True):
        es = GLOSSARIO[pt]

        def trocar(m, es=es):
            original = m.group(0)
            return es[:1].upper() + es[1:] if original[:1].isupper() else es

        texto = re.sub(rf"(?<![\w-]){re.escape(pt)}(?![\w-])", trocar, texto, flags=re.IGNORECASE)
    return texto, False


class MarianCT2:
    """O caminho do APP: so ctranslate2 + sentencepiece."""

    def __init__(self, pasta, threads=0):
        import ctranslate2
        import sentencepiece as spm
        t0 = time.time()
        self.tr = ctranslate2.Translator(pasta, device="cpu", intra_threads=threads)
        self.src = spm.SentencePieceProcessor(model_file=os.path.join(pasta, "source.spm"))
        self.tgt = spm.SentencePieceProcessor(model_file=os.path.join(pasta, "target.spm"))
        self.carga = time.time() - t0

    def traduzir(self, textos, beam=4):
        fontes = [[PREFIXO_ES] + self.src.encode(t, out_type=str) + ["</s>"] for t in textos]
        res = self.tr.translate_batch(fontes, beam_size=beam, max_batch_size=32)
        return [self.tgt.decode(r.hypotheses[0]).strip() for r in res]


class ArgosCT2:
    def __init__(self, raiz):
        import ctranslate2
        import sentencepiece as spm
        t0 = time.time()
        self.tr = ctranslate2.Translator(os.path.join(raiz, "model"), device="cpu")
        self.sp = spm.SentencePieceProcessor(model_file=os.path.join(raiz, "sentencepiece.model"))
        self.carga = time.time() - t0

    def traduzir(self, textos, beam=4):
        res = self.tr.translate_batch([self.sp.encode(t, out_type=str) for t in textos],
                                      beam_size=beam, max_batch_size=32, replace_unknowns=True)
        return [self.sp.decode(r.hypotheses[0]).strip() for r in res]


def rodar(motor, nome, resultados, tempos, glossario, beam):
    pares = [caixa_de_frase(t) for t in AMOSTRAS]
    entradas, prontas = [], {}
    for i, (texto, _) in enumerate(pares):
        if glossario:
            texto, inteira = aplicar_glossario(texto)
            if inteira:
                prontas[i] = texto
        entradas.append(texto)
    idx = [i for i in range(len(entradas)) if i not in prontas]
    t0 = time.time()
    saida = motor.traduzir([entradas[i] for i in idx], beam=beam)
    tempos[f"{nome}_s"] = round(time.time() - t0, 2)
    final = dict(prontas)
    final.update(zip(idx, saida))
    resultados[nome] = [final[i].upper() if pares[i][1] else final[i] for i in range(len(pares))]


def converter(saida):
    import ctranslate2
    from huggingface_hub import HfApi, hf_hub_download
    info = HfApi().model_info(MODELO_HF)
    print(f"{MODELO_HF} revisao {info.sha} licenca {getattr(info, 'card_data', None) and info.card_data.get('license')}")
    t0 = time.time()
    ctranslate2.converters.TransformersConverter(MODELO_HF).convert(saida, quantization="int8", force=True)
    for nome in ("source.spm", "target.spm", "README.md"):
        shutil.copy(hf_hub_download(MODELO_HF, nome, revision=info.sha), os.path.join(saida, nome))
    json.dump({"modelo": MODELO_HF, "revisao": info.sha}, open(os.path.join(saida, "origem.json"), "w"))
    print(f"convertido em {time.time()-t0:.1f}s, {tamanho_mb(saida)} MB")
    for nome in sorted(os.listdir(saida)):
        print("  ", nome, round(os.path.getsize(os.path.join(saida, nome)) / 1e6, 2), "MB")


def baixar_argos():
    os.makedirs(PASTA, exist_ok=True)
    destino = os.path.join(PASTA, "argos_pt_es")
    zip_path = destino + ".zip"
    ultimo = None
    for ua in ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
               "ArgosTranslate", "LibreTranslate"):
        try:
            req = urllib.request.Request(ARGOS_PT_ES, headers={"User-Agent": ua})
            with urllib.request.urlopen(req, timeout=120) as r, open(zip_path, "wb") as f:
                shutil.copyfileobj(r, f)
            print(f"argos baixado com UA {ua[:20]}: {os.path.getsize(zip_path)/1e6:.1f} MB")
            break
        except Exception as e:
            ultimo = e
            print(f"argos UA {ua[:20]}: {e}")
    else:
        raise RuntimeError(f"argos inacessivel: {ultimo}")
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(destino)
    for raiz, _, arquivos in os.walk(destino):
        if "metadata.json" in arquivos:
            print(open(os.path.join(raiz, "metadata.json"), encoding="utf-8").read()[:800])
            for leia in ("README.md", "LICENSE"):
                if os.path.exists(os.path.join(raiz, leia)):
                    print(open(os.path.join(raiz, leia), encoding="utf-8", errors="replace").read()[:1500])
            print("tamanho", tamanho_mb(raiz), "MB")
            return raiz
    raise RuntimeError("metadata.json nao achado")


def comparar_hf(pasta, resultados, tempos):
    """O caminho do app (sentencepiece puro) tem de bater com o do transformers."""
    import ctranslate2
    import transformers
    tok = transformers.AutoTokenizer.from_pretrained(MODELO_HF)
    tr = ctranslate2.Translator(pasta, device="cpu")
    pares = [caixa_de_frase(t) for t in AMOSTRAS]
    fontes = [tok.convert_ids_to_tokens(tok.encode(f"{PREFIXO_ES} {p[0]}")) for p in pares]
    res = tr.translate_batch(fontes, beam_size=4, max_batch_size=32)
    saida = [tok.decode(tok.convert_tokens_to_ids(r.hypotheses[0]), skip_special_tokens=True) for r in res]
    resultados["tcbig_hf_b4"] = [s.upper() if a else s for s, (_, a) in zip(saida, pares)]
    iguais = sum(a == b for a, b in zip(resultados["tcbig_hf_b4"], resultados.get("tcbig_b4", [])))
    tempos["tcbig_app_igual_hf"] = f"{iguais}/{len(AMOSTRAS)}"


def avaliar(args):
    resultados = {"pt": AMOSTRAS}
    tempos = {"amostras": len(AMOSTRAS), "cpus": os.cpu_count()}
    motor = MarianCT2(args.modelo)
    tempos["tcbig_MB"] = tamanho_mb(args.modelo)
    tempos["tcbig_carga_s"] = round(motor.carga, 2)
    for beam in (4, 1):
        rodar(motor, f"tcbig_b{beam}", resultados, tempos, glossario=False, beam=beam)
        rodar(motor, f"tcbig_b{beam}_glos", resultados, tempos, glossario=True, beam=beam)
    t0 = time.time()
    for t in AMOSTRAS[:20]:
        motor.traduzir([t], beam=4)
    tempos["tcbig_uma_por_vez_20_s"] = round(time.time() - t0, 2)
    if args.hf:
        comparar_hf(args.modelo, resultados, tempos)
    if args.argos:
        try:
            argos = ArgosCT2(baixar_argos())
            tempos["argos_carga_s"] = round(argos.carga, 2)
            rodar(argos, "argos_b4", resultados, tempos, glossario=False, beam=4)
            rodar(argos, "argos_b4_glos", resultados, tempos, glossario=True, beam=4)
        except Exception as e:
            tempos["erro_argos"] = f"{type(e).__name__}: {e}"

    json.dump({"resultados": resultados, "tempos": tempos},
              open("resultados.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    colunas = list(resultados)
    linhas = ["| " + " | ".join(colunas) + " |", "|" + "---|" * len(colunas)]
    for i in range(len(AMOSTRAS)):
        linhas.append("| " + " | ".join(str(resultados[c][i]).replace("|", "/") for c in colunas) + " |")
    resumo = ("## Tempos\n\n```\n" + json.dumps(tempos, ensure_ascii=False, indent=1)
              + "\n```\n\n## Traducoes\n\n" + "\n".join(linhas) + "\n")
    print(resumo)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(resumo)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("converter")
    c.add_argument("--saida", required=True)
    a = sub.add_parser("avaliar")
    a.add_argument("--modelo", required=True)
    a.add_argument("--argos", action="store_true")
    a.add_argument("--hf", action="store_true")
    args = ap.parse_args()
    if args.cmd == "converter":
        converter(args.saida)
    else:
        avaliar(args)


if __name__ == "__main__":
    main()

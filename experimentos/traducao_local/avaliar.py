"""Experimento: tradutor LOCAL (offline) serve para as fichas? PT -> ES.

Roda no GitHub Actions (o contêiner do Claude não alcança os servidores de
modelo). Mede, para as mesmas amostras:

  - Argos pt->es direto (CTranslate2 + SentencePiece, o que o app embutiria);
  - Argos pivô pt->en->es;
  - OPUS-MT (Helsinki), convertido para CTranslate2, quando existir;
  - Google Tradutor via deep_translator (a linha de base de hoje).

Uso:  python avaliar.py --motores argos,google [--opus]
Saída: resultados.json + resumo em Markdown ($GITHUB_STEP_SUMMARY).
"""
import argparse
import json
import os
import sys
import time
import urllib.request
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from amostras import AMOSTRAS  # noqa: E402

PASTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_modelos")
ARGOS = {
    "pt_es": "https://argos-net.com/v1/translate-pt_es-1_0.argosmodel",
    "pt_en": "https://argos-net.com/v1/translate-pt_en-1_9.argosmodel",
    "en_es": "https://argos-net.com/v1/translate-en_es-1_0.argosmodel",
}


def tamanho_mb(pasta):
    total = 0
    for raiz, _, arquivos in os.walk(pasta):
        for a in arquivos:
            total += os.path.getsize(os.path.join(raiz, a))
    return round(total / 1e6, 1)


def baixar_argos(chave):
    os.makedirs(PASTA, exist_ok=True)
    zip_path = os.path.join(PASTA, f"{chave}.argosmodel")
    destino = os.path.join(PASTA, chave)
    if not os.path.isdir(destino):
        t0 = time.time()
        urllib.request.urlretrieve(ARGOS[chave], zip_path)
        print(f"[{chave}] baixado: {os.path.getsize(zip_path)/1e6:.1f} MB em {time.time()-t0:.1f}s")
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(destino)
    for raiz, _, arquivos in os.walk(destino):
        if "metadata.json" in arquivos:
            return raiz
    raise RuntimeError(f"metadata.json nao achado em {destino}")


def descrever_pacote(raiz):
    meta = json.load(open(os.path.join(raiz, "metadata.json"), encoding="utf-8"))
    print(json.dumps(meta, ensure_ascii=False, indent=1)[:1500])
    for nome in sorted(os.listdir(raiz)):
        caminho = os.path.join(raiz, nome)
        tam = tamanho_mb(caminho) if os.path.isdir(caminho) else round(os.path.getsize(caminho) / 1e6, 2)
        print(f"   {nome}: {tam} MB")
    for leia in ("README.md", "README", "LICENSE", "LICENSE.txt"):
        p = os.path.join(raiz, leia)
        if os.path.exists(p):
            print(f"----- {leia} -----")
            print(open(p, encoding="utf-8", errors="replace").read()[:2500])
    return meta


class Argos:
    def __init__(self, raiz, threads=0):
        import ctranslate2
        import sentencepiece as spm
        self.meta = json.load(open(os.path.join(raiz, "metadata.json"), encoding="utf-8"))
        t0 = time.time()
        self.tr = ctranslate2.Translator(os.path.join(raiz, "model"), device="cpu",
                                         intra_threads=threads)
        sp_path = os.path.join(raiz, "sentencepiece.model")
        if not os.path.exists(sp_path):
            raise RuntimeError(f"sem sentencepiece.model em {raiz}: {os.listdir(raiz)}")
        self.sp = spm.SentencePieceProcessor(model_file=sp_path)
        self.carga = time.time() - t0
        self.prefixo = self.meta.get("target_prefix") or ""

    def traduzir(self, textos, beam=4):
        tokens = [self.sp.encode(t, out_type=str) for t in textos]
        kwargs = {}
        if self.prefixo:
            kwargs["target_prefix"] = [[self.prefixo]] * len(tokens)
        res = self.tr.translate_batch(tokens, beam_size=beam, max_batch_size=32,
                                      replace_unknowns=True, **kwargs)
        saida = []
        for r in res:
            toks = r.hypotheses[0]
            if self.prefixo and toks and toks[0] == self.prefixo:
                toks = toks[1:]
            saida.append(self.sp.decode(toks).strip())
        return saida


def caixa_de_frase(texto):
    """TUDO MAIUSCULO -> Primeira maiuscula, resto minusculo (o modelo foi
    treinado em texto corrido). Devolve (texto, estava_em_caixa_alta)."""
    letras = [c for c in texto if c.isalpha()]
    if letras and all(c.isupper() for c in letras) and len(letras) > 3:
        return texto[:1].upper() + texto[1:].lower(), True
    return texto, False


def rodar_argos(resultados, tempos):
    for chave in ("pt_es", "pt_en", "en_es"):
        try:
            raiz = baixar_argos(chave)
            print(f"\n===== pacote {chave} =====")
            descrever_pacote(raiz)
            tempos[f"tamanho_{chave}_MB"] = tamanho_mb(raiz)
        except Exception as e:
            print(f"[{chave}] FALHOU ao baixar/abrir: {type(e).__name__}: {e}")
            tempos[f"erro_{chave}"] = str(e)

    try:
        direto = Argos(baixar_argos("pt_es"))
        tempos["argos_carga_s"] = round(direto.carga, 2)
        for beam in (4, 1):
            t0 = time.time()
            saida = direto.traduzir(AMOSTRAS, beam=beam)
            tempos[f"argos_direto_beam{beam}_s"] = round(time.time() - t0, 2)
            resultados[f"argos_direto_b{beam}"] = saida
        # caixa alta -> caixa de frase, traduz, volta para maiusculas
        pares = [caixa_de_frase(t) for t in AMOSTRAS]
        t0 = time.time()
        saida = direto.traduzir([p[0] for p in pares], beam=4)
        tempos["argos_direto_caixa_s"] = round(time.time() - t0, 2)
        resultados["argos_direto_caixa"] = [s.upper() if alta else s
                                            for s, (_, alta) in zip(saida, pares)]
        # uma por vez (o pior caso de latencia)
        t0 = time.time()
        for t in AMOSTRAS[:20]:
            direto.traduzir([t], beam=4)
        tempos["argos_uma_por_vez_20_s"] = round(time.time() - t0, 2)
    except Exception as e:
        print(f"argos direto FALHOU: {type(e).__name__}: {e}")
        tempos["erro_argos_direto"] = str(e)

    try:
        pt_en = Argos(baixar_argos("pt_en"))
        en_es = Argos(baixar_argos("en_es"))
        pares = [caixa_de_frase(t) for t in AMOSTRAS]
        t0 = time.time()
        ingles = pt_en.traduzir([p[0] for p in pares], beam=4)
        espanhol = en_es.traduzir(ingles, beam=4)
        tempos["argos_pivo_s"] = round(time.time() - t0, 2)
        resultados["argos_pivo_ingles"] = ingles
        resultados["argos_pivo"] = [s.upper() if alta else s
                                    for s, (_, alta) in zip(espanhol, pares)]
    except Exception as e:
        print(f"argos pivo FALHOU: {type(e).__name__}: {e}")
        tempos["erro_argos_pivo"] = str(e)


def rodar_opus(resultados, tempos, candidatos):
    """Converte cada candidato do Hugging Face para CTranslate2 (int8)."""
    import ctranslate2
    import transformers
    for modelo, prefixo in candidatos:
        nome = "opus_" + modelo.split("/")[-1]
        saida_dir = os.path.join(PASTA, nome)
        try:
            t0 = time.time()
            if not os.path.isdir(saida_dir):
                conv = ctranslate2.converters.TransformersConverter(modelo)
                conv.convert(saida_dir, quantization="int8", force=True)
            tempos[f"{nome}_conversao_s"] = round(time.time() - t0, 1)
            tempos[f"{nome}_MB"] = tamanho_mb(saida_dir)
            tok = transformers.AutoTokenizer.from_pretrained(modelo)
            t0 = time.time()
            tr = ctranslate2.Translator(saida_dir, device="cpu")
            tempos[f"{nome}_carga_s"] = round(time.time() - t0, 2)
            pares = [caixa_de_frase(t) for t in AMOSTRAS]
            fontes = [tok.convert_ids_to_tokens(tok.encode((prefixo + " " if prefixo else "") + p[0]))
                      for p in pares]
            t0 = time.time()
            res = tr.translate_batch(fontes, beam_size=4, max_batch_size=32)
            tempos[f"{nome}_s"] = round(time.time() - t0, 2)
            saida = [tok.decode(tok.convert_tokens_to_ids(r.hypotheses[0]), skip_special_tokens=True)
                     for r in res]
            resultados[nome] = [s.upper() if alta else s for s, (_, alta) in zip(saida, pares)]
            print(f"[{nome}] ok")
        except Exception as e:
            print(f"[{nome}] FALHOU: {type(e).__name__}: {e}")
            tempos[f"erro_{nome}"] = f"{type(e).__name__}: {e}"


def rodar_google(resultados, tempos):
    from deep_translator import GoogleTranslator
    saida = []
    t0 = time.time()
    for t in AMOSTRAS:
        try:
            saida.append(GoogleTranslator(source="pt", target="es").translate(t))
        except Exception as e:
            saida.append(f"<ERRO {type(e).__name__}>")
    tempos["google_sequencial_s"] = round(time.time() - t0, 2)
    resultados["google"] = saida


def listar_opus():
    """Quais modelos OPUS-MT existem com pt na origem e es no destino."""
    try:
        from huggingface_hub import HfApi
        api = HfApi()
        achados = []
        for termo in ("opus-mt-pt", "opus-mt-tc-big-pt", "opus-mt-itc", "opus-mt-tc-big-itc",
                      "opus-mt-ROMANCE", "opus-mt-roa", "opus-mt-tc-big-roa"):
            for m in api.list_models(author="Helsinki-NLP", search=termo, limit=200):
                achados.append(m.id)
        achados = sorted(set(achados))
        print("\nOPUS-MT candidatos:\n  " + "\n  ".join(achados))
        return achados
    except Exception as e:
        print(f"listar OPUS falhou: {e}")
        return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--motores", default="argos,google")
    ap.add_argument("--opus", default="")
    args = ap.parse_args()

    resultados = {"pt": AMOSTRAS}
    tempos = {"amostras": len(AMOSTRAS)}
    motores = set(args.motores.split(","))
    if "argos" in motores:
        rodar_argos(resultados, tempos)
    if "google" in motores:
        rodar_google(resultados, tempos)
    if "opus" in motores:
        existentes = listar_opus()
        candidatos = []
        for modelo in existentes:
            nome = modelo.lower()
            if nome.endswith(("-pt-es", "-por-spa")):
                candidatos.append((modelo, ""))            # direto
            elif nome.endswith(("-itc-itc", "-roa-roa")):
                candidatos.append((modelo, ">>spa<<"))     # multilingue
        print(f"[opus] vai converter: {candidatos}")
        rodar_opus(resultados, tempos, candidatos[:4])

    json.dump({"resultados": resultados, "tempos": tempos},
              open("resultados.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    colunas = [c for c in resultados if c != "argos_pivo_ingles"]
    linhas = ["| " + " | ".join(colunas) + " |", "|" + "---|" * len(colunas)]
    for i in range(len(AMOSTRAS)):
        linhas.append("| " + " | ".join(str(resultados[c][i]).replace("|", "/") for c in colunas) + " |")
    resumo = "## Tempos\n\n```\n" + json.dumps(tempos, ensure_ascii=False, indent=1) + \
             "\n```\n\n## Traducoes\n\n" + "\n".join(linhas) + "\n"
    print(resumo)
    destino = os.environ.get("GITHUB_STEP_SUMMARY")
    if destino:
        with open(destino, "a", encoding="utf-8") as f:
            f.write(resumo)


if __name__ == "__main__":
    main()

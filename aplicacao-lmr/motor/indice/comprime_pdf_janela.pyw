"""Janela do compressor de PDF (dois cliques no Windows). A lógica está em comprime_pdf.py, na mesma pasta."""
import os
import queue
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from comprime_pdf import NIVEIS, TextoMudou, comprime, mb, pdfs_de
except ImportError as e:  # sem o pymupdf: avisa em vez de fechar calado (.pyw não tem console)
    tk.Tk().withdraw()
    messagebox.showerror("Compressor de PDF", f"Falta uma dependência: {e}\n\nNo cmd, rode:\n  pip install pymupdf")
    raise SystemExit(1)


class Janela:
    def __init__(self, raiz: tk.Tk):
        self.raiz = raiz
        raiz.title("Compressor de PDF (mantém o texto)")
        raiz.geometry("780x440")
        raiz.minsize(600, 320)
        self.arquivos: list = []
        self.fila: queue.Queue = queue.Queue()
        self.trabalhando = False

        topo = ttk.Frame(raiz, padding=8)
        topo.pack(fill="x")
        ttk.Button(topo, text="Escolher PDFs…", command=self.escolher_pdfs).pack(side="left")
        ttk.Button(topo, text="Escolher pasta…", command=self.escolher_pasta).pack(side="left", padx=6)
        ttk.Button(topo, text="Limpar", command=self.limpar).pack(side="left")
        ttk.Label(topo, text="Compressão:").pack(side="left", padx=(18, 4))
        self.nivel = tk.StringVar(value="Normal")
        ttk.Combobox(topo, textvariable=self.nivel, values=list(NIVEIS), state="readonly", width=8).pack(side="left")

        colunas = ("arquivo", "antes", "depois", "estado")
        self.tabela = ttk.Treeview(raiz, columns=colunas, show="headings")
        for c, titulo, largura in [("arquivo", "Arquivo", 360), ("antes", "Antes", 80), ("depois", "Depois", 80), ("estado", "Estado", 220)]:
            self.tabela.heading(c, text=titulo)
            self.tabela.column(c, width=largura, anchor="w" if c in ("arquivo", "estado") else "e")
        self.tabela.pack(fill="both", expand=True, padx=8)

        base = ttk.Frame(raiz, padding=8)
        base.pack(fill="x")
        self.progresso = ttk.Progressbar(base, mode="determinate")
        self.progresso.pack(side="left", fill="x", expand=True)
        self.botao = ttk.Button(base, text="Comprimir", command=self.comprimir)
        self.botao.pack(side="left", padx=6)
        ttk.Button(base, text="Abrir pasta", command=self.abrir_pasta).pack(side="left")

    # ── escolha dos arquivos ──
    def adicionar(self, caminhos):
        for f in pdfs_de(caminhos):
            if f not in self.arquivos:
                self.arquivos.append(f)
                self.tabela.insert("", "end", iid=str(f), values=(f.name, f"{mb(f):.1f} MB", "", "na fila"))

    def escolher_pdfs(self):
        self.adicionar(filedialog.askopenfilenames(title="PDFs para comprimir", filetypes=[("PDF", "*.pdf")]))

    def escolher_pasta(self):
        pasta = filedialog.askdirectory(title="Pasta com os PDFs")
        if pasta:
            self.adicionar([pasta])

    def limpar(self):
        if not self.trabalhando:
            self.arquivos.clear()
            self.tabela.delete(*self.tabela.get_children())

    def abrir_pasta(self):
        if self.arquivos and hasattr(os, "startfile"):
            os.startfile(self.arquivos[0].parent)

    # ── compressão numa thread; a janela lê a fila ──
    def comprimir(self):
        if self.trabalhando or not self.arquivos:
            return
        self.trabalhando = True
        self.botao.state(["disabled"])
        self.progresso.configure(maximum=len(self.arquivos), value=0)
        dpi, qualidade = NIVEIS[self.nivel.get()]
        threading.Thread(target=self.trabalho, args=(list(self.arquivos), dpi, qualidade), daemon=True).start()
        self.raiz.after(200, self.ler_fila)

    def trabalho(self, arquivos, dpi, qualidade):
        for f in arquivos:
            self.fila.put((f, None, "comprimindo…"))
            try:
                r = comprime(f, dpi, qualidade)
                self.fila.put((f, f"{r['depois']:.1f} MB", f"✅ texto igual ({r['paginas']} páginas)"))
            except TextoMudou:
                self.fila.put((f, "", "❌ texto mudou: não gerado"))
            except Exception as e:  # PDF protegido, corrompido…
                self.fila.put((f, "", f"❌ erro: {e}"))
        self.fila.put(None)

    def ler_fila(self):
        try:
            while True:
                item = self.fila.get_nowait()
                if item is None:
                    self.trabalhando = False
                    self.botao.state(["!disabled"])
                    return
                f, depois, estado = item
                valores = list(self.tabela.item(str(f), "values"))
                valores[3] = estado
                if depois is not None:
                    valores[2] = depois
                    self.progresso.step(1)
                self.tabela.item(str(f), values=valores)
        except queue.Empty:
            pass
        self.raiz.after(200, self.ler_fila)


if __name__ == "__main__":
    raiz = tk.Tk()
    Janela(raiz)
    raiz.mainloop()

"""O workflow do n8n da revisão das listas (`amp/revisao_de_listas/`).

O `.json` que se importa (ou cola) no n8n da GE é gerado pelo `gerar_workflow.py`. Este teste trava
que os dois não se desencontram e que o contrato com o SIG-FT continua lá:
- o webhook com a chave;
- o ping sem o agente;
- os arquivos conferidos antes do agente (400);
- o AMP Agent com o agente da revisão, e o erro dele em 502;
- a resposta preparada.

As instruções do agente moram no AMP: `agente.md` é a cópia. Desenho:
`docs/superpowers/specs/2026-11-03-amp-revisao-com-arquivos-design.md`, §3 e §4.
"""
from __future__ import annotations

import importlib.util
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

PASTA = Path(__file__).resolve().parent.parent / "amp" / "revisao_de_listas"


def _gerador():
    spec = importlib.util.spec_from_file_location("gerar_workflow", PASTA / "gerar_workflow.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _workflow():
    return json.loads((PASTA / "workflow_revisao_de_listas.json").read_text(encoding="utf-8"))


def _no(workflow, nome):
    return next(n for n in workflow["nodes"] if n["name"] == nome)


def _destinos(workflow, nome, saida=0):
    saidas = workflow["connections"].get(nome, {}).get("main", [])
    return [c["node"] for c in (saidas[saida] if len(saidas) > saida else [])]


def test_o_json_versionado_e_o_que_o_gerador_produz():
    gerador = _gerador()
    assert _workflow() == gerador.montar_workflow(gerador.VERSAO_WORKFLOW)


def test_webhook_com_header_auth_e_resposta_por_no():
    p = _no(_workflow(), "Webhook do SIG-FT")["parameters"]
    assert (p["httpMethod"], p["path"], p["authentication"], p["responseMode"]) == (
        "POST", "sigft-revisao-listas", "headerAuth", "responseNode")


def test_ping_nao_passa_pelo_agente():
    workflow = _workflow()
    assert _destinos(workflow, "Webhook do SIG-FT") == ["É ping?"]
    assert _destinos(workflow, "É ping?", 0) == ["Responde ping"]
    assert _destinos(workflow, "É ping?", 1) == ["Monta a mensagem"]
    assert "'ping'" in _no(workflow, "Responde ping")["parameters"]["responseBody"]


def test_monta_a_mensagem_leva_os_arquivos():
    p = _no(_workflow(), "Monta a mensagem")["parameters"]
    assert p["includeOtherFields"] is True
    [campo] = p["assignments"]["assignments"]
    assert (campo["name"], campo["value"]) == ("chatInput", "={{ $json.body.mensagem }}")


def test_sem_os_arquivos_o_agente_nao_e_chamado():
    workflow = _workflow()
    assert _destinos(workflow, "Chegaram os arquivos?", 0) == ["AMP Agent"]
    assert _destinos(workflow, "Chegaram os arquivos?", 1) == ["Responde sem arquivos"]
    assert _no(workflow, "Responde sem arquivos")["parameters"]["options"]["responseCode"] == 400


def test_o_agente_e_o_da_revisao_e_o_erro_dele_e_502():
    workflow = _workflow()
    agente = _no(workflow, "AMP Agent")
    assert agente["type"] == "CUSTOM.amp" and agente["onError"] == "continueErrorOutput"
    assert agente["parameters"]["agentId"]["cachedResultName"] == "Spare Parts Document Reviewer"
    assert _destinos(workflow, "AMP Agent", 0) == ["Prepara a resposta"]
    assert _destinos(workflow, "AMP Agent", 1) == ["Responde erro"]
    assert _no(workflow, "Responde erro")["parameters"]["options"]["responseCode"] == 502
    assert _destinos(workflow, "Prepara a resposta") == ["Responde"]


def test_a_resposta_corta_a_narracao_e_lista_os_arquivos():
    codigo = _no(_workflow(), "Prepara a resposta")["parameters"]["jsCode"]
    for trecho in ("<!DOCTYPE html|<html", "</html>", "$('Monta a mensagem').first().binary", "arquivos",
                   "o agente não devolveu HTML", "versao_workflow: VERSAO", "'2026-11-03'"):
        assert trecho in codigo, trecho


def test_toda_conexao_aponta_para_no_que_existe():
    workflow = _workflow()
    nomes = {n["name"] for n in workflow["nodes"]}
    for origem, saidas in workflow["connections"].items():
        assert origem in nomes
        for saida in saidas["main"]:
            assert all(c["node"] in nomes for c in saida)


def _system_prompt():
    agente = (PASTA / "agente.md").read_text(encoding="utf-8")
    return re.search(r"## System Prompt\s*```text\n(.*?)```", agente, re.DOTALL).group(1)


def test_o_pedido_saiu_e_o_agente_tem_copia():
    assert not (PASTA / "pedido.md").exists()
    agente = (PASTA / "agente.md").read_text(encoding="utf-8")
    for termo in ("Spare Parts Document Reviewer", "A fonte é o AMP", "SEM_LISTA_STATUS_PMIB", "DOCUMENTAL",
                  "a conferir", "CRIAR", "ALTERAR", "MOVER PARA A SEM_LISTA", "<tr> e <td>"):
        assert termo in agente, termo


def test_o_agente_escreve_os_titulos_que_o_sigft_le():
    """2026-11-11 (pedido do Luan): sem diferença, a resposta curta, que o SIG-FT não grava; com
    diferença, o <title> diz se ela é significativa ou só de texto. O título é o contrato com
    `services/revisao_amp.classificacao`."""
    from sigft.services import revisao_amp as ra

    prompt = _system_prompt()
    for rotulo in (ra.SEM_DIFERENCAS, ra.SIGNIFICATIVA, ra.SO_TEXTO):
        assert f"{rotulo} · <código da lista>" in prompt, rotulo
    curta = re.search(r"## A resposta curta.*?(<!DOCTYPE html>.*?</html>)", prompt, re.DOTALL).group(1)
    assert ra.classificacao(curta) == ra.SEM_DIFERENCAS
    assert "<table" not in curta.lower()


def test_o_agente_manda_so_as_linhas_que_mudam():
    """2026-11-11 (pedido do Luan): com poucas mudanças, só as linhas, cada bloco com a instrução, de
    baixo para cima; com muitas e espalhadas, a _STATUS_PMIB inteira."""
    prompt = _system_prompt()
    for trecho in ("Até 5 blocos", "de baixo para cima", "cole esta linha por cima dela",
                   "Insira 2 linhas abaixo da linha 20", "Exclua a linha 30", "Mais de 5 blocos"):
        assert trecho in prompt, trecho


def test_maiuscula_nao_conta_e_texto_nao_e_significativo():
    """2026-11-11 (pedido do Luan): maiúsculas e minúsculas não contam; a descrição reescrita e a marca
    completada (PHOENIX para PHOENIX CONTACT) entram na resposta, mas como SÓ TEXTO."""
    prompt = _system_prompt()
    ignorada = prompt.index("IGNORADA:")
    so_texto = prompt.index("SÓ TEXTO:")
    assert prompt.index("maiúsculas e minúsculas (de PHOENIX para phoenix)") > ignorada
    assert so_texto < prompt.index("(de PHOENIX para PHOENIX CONTACT)") < ignorada


def test_a_copia_leva_so_as_linhas_abaixo_do_cabecalho():
    """2026-11-09 (pedido do Luan): o cabeçalho é o mesmo da planilha, e colar ele de novo só atrapalha.
    Cada botão copia só as linhas abaixo do cabeçalho, que continua na tabela, para ler."""
    agente = (PASTA / "agente.md").read_text(encoding="utf-8")
    assert "copia só as linhas abaixo do cabeçalho" in agente
    assert "Cada tabela tem um botão que copia a tabela como texto" not in agente


# ------------------------------------------------------------------ a cópia para o Excel (2026-11-12)
# O Luan: o que mudou vem em azul #0070C0, e os números não desformatam no Excel (o código PMIB com
# ponto, o 0034871 que virava 34871, o número longo que virava exponencial). Texto puro não leva cor:
# o script do prompt copia em HTML (o Ctrl+V do Excel) e em texto (com ' na frente desses números).

PAGINA_DE_TESTE = """<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>X</title></head><body>
<button id="b" onclick="copiar('t1', this)">Copiar</button>
<table id="t1">
<tr><th>Linha</th><th>ITEM</th><th>QTD.</th><th>UNID.</th><th>DESCRIÇÃO</th><th>CÓDIGO DO MATERIAL</th>
<th>CÓDIGO CMI</th><th>MARCA/MODELO</th><th>Codigo PMIB</th><th>DATA DO EMAIL</th><th>DIAS DE ATRASO</th></tr>
<tr><td>15</td><td>3.10</td><td>2</td><td>PÇ</td><td>CONTATOR   3RT2026 &amp; cia &lt;x&gt;</td><td>0034871</td>
<td>123456789012345</td><td class="txt">PHOENIX CONTACT</td><td>4500063671.9003</td><td>12/05/2026</td><td>5</td></tr>
<tr class="nova"><td>16</td><td>12</td><td>1,5</td><td>M</td><td>CABO</td><td>12345678</td><td>X-1</td>
<td class="sig">SIEMENS</td><td></td><td></td><td></td></tr>
</table>
__SCRIPT__
</body></html>"""

TESTADOR = r"""
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await page.goto('file://' + process.argv[2]);
    await page.click('#b');
    const copiado = await page.evaluate(async () => {
      const out = {};
      for (const item of await navigator.clipboard.read())
        for (const tipo of item.types) out[tipo] = await (await item.getType(tipo)).text();
      return out;
    });
    console.log(JSON.stringify({ botao: await page.textContent('#b'), erros, ...copiado }));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(String(e)); process.exit(1); });
"""


def _node_com_playwright():
    node = shutil.which("node")
    if node is None:
        return None
    try:
        tem = subprocess.run([node, "-e", "require('playwright')"], capture_output=True, timeout=60).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return None
    return node if tem else None


def test_a_copia_leva_o_azul_e_os_numeros_como_texto():
    prompt = _system_prompt()
    for trecho in ('class="sig"', 'class="txt"', 'class="nova"', "copiar('<id da tabela>', this)",
                   "exatamente como está, o script abaixo", "azul #0070C0", "A QTD. continua número",
                   "as datas vão como dd/mm/aaaa"):
        assert trecho in prompt, trecho
    [script] = re.findall(r"<script>.*?</script>", prompt, re.DOTALL)
    for trecho in ("function copiar(id, botao)", "color:#0070C0", "mso-number-format:'@'",
                   "font-family:'Swis721 Lt BT'", "border:.5pt solid windowtext", "'text/html'", "'text/plain'"):
        assert trecho in script, trecho


def test_o_script_de_copiar_no_chromium(tmp_path):
    """O script do prompt, como está, numa página aberta do disco (como o SIG-FT abre o HTML)."""
    node = _node_com_playwright()
    if node is None:
        pytest.skip("sem node com playwright: o script de copiar só roda onde há o Chromium")
    [script] = re.findall(r"<script>.*?</script>", _system_prompt(), re.DOTALL)
    pagina = tmp_path / "pagina.html"
    pagina.write_text(PAGINA_DE_TESTE.replace("__SCRIPT__", script), encoding="utf-8")
    testador = tmp_path / "testar.js"
    testador.write_text(TESTADOR, encoding="utf-8")
    saida = subprocess.run([node, str(testador), str(pagina)], capture_output=True, text=True, timeout=180)
    if saida.returncode != 0 and "Executable doesn't exist" in saida.stderr:
        pytest.skip("o Chromium do playwright não está instalado")
    assert saida.returncode == 0, saida.stderr
    copiado = json.loads(saida.stdout)
    assert (copiado["botao"], copiado["erros"]) == ("Copiado", [])
    # O texto: sem o cabeçalho e sem a coluna da linha; o ' nos números que o Excel estragaria
    # (as colunas CÓDIGO sempre), e nunca na QTD.
    assert [linha.split("\t") for linha in copiado["text/plain"].split("\r\n")] == [
        ["'3.10", "2", "PÇ", "CONTATOR 3RT2026 & cia <x>", "'0034871", "'123456789012345", "PHOENIX CONTACT",
         "'4500063671.9003", "12/05/2026", "5"],
        ["12", "1,5", "M", "CABO", "'12345678", "X-1", "SIEMENS", "", "", ""],
    ]
    # O HTML: azul só no que mudou (a célula txt e a linha nova, sem as vazias), Texto nos mesmos
    # números, e a fonte e a borda do template em toda célula.
    celulas = re.findall(r'<td style="([^"]*)">([^<]*)</td>', copiado["text/html"])
    assert len(celulas) == 20
    assert [valor for estilo, valor in celulas if "color:#0070C0" in estilo] == [
        "PHOENIX CONTACT", "12", "1,5", "M", "CABO", "12345678", "X-1", "SIEMENS"]
    assert [valor for estilo, valor in celulas if "mso-number-format:'@'" in estilo] == [
        "3.10", "0034871", "123456789012345", "4500063671.9003", "12345678"]
    assert all("font-family:'Swis721 Lt BT'" in estilo and "border:.5pt solid windowtext" in estilo
               for estilo, _ in celulas)

@echo off
rem Gera a DLC do Docling: pasta dist\docling_sigft\ (PyInstaller --onedir) e dist\docling_sigft.zip.
rem Roda numa maquina COM rede (precisa do PyPI, do indice de CPU do PyTorch e do Hugging Face).
rem Cria um ambiente proprio (.venv-dlc), que NAO e o do SIG-FT: docling e torch ficam so aqui.
rem Para no primeiro erro. Tempo: de 10 a 40 minutos, quase todo no download.
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo === 1/6  Conferindo o Python 3.12 ===
py -3.12 --version
if errorlevel 1 (
    echo ERRO: nao achei o Python 3.12 pelo lancador "py". Instale o Python 3.12 de 64 bits
    echo       ^(o par docling 2.150.0 + torch 2.9.1 foi conferido para a 3.12^) e rode de novo.
    goto erro
)

echo.
echo === 2/6  Criando o ambiente proprio .venv-dlc ===
if not exist ".venv-dlc\Scripts\python.exe" (
    py -3.12 -m venv .venv-dlc
    if errorlevel 1 goto erro
) else (
    echo Ja existe, reaproveitando.
)
set "PY=%~dp0.venv-dlc\Scripts\python.exe"

echo.
echo === 3/6  Instalando docling, torch de CPU e PyInstaller ^(baixa varios GB^) ===
"%PY%" -m pip install -r requirements.txt "pyinstaller>=6,<7"
if errorlevel 1 (
    echo ERRO na instalacao. Se a mensagem fala de certificado ^(SSL^), a rede da empresa esta
    echo       barrando: NAO use --trusted-host; aponte o pip para o certificado da empresa
    echo       ^(pip config set global.cert C:\caminho\certificado.pem^) ou rode em rede aberta.
    goto erro
)

echo.
echo === 4/6  Baixando os modelos do Docling para a pasta modelos\ ===
"%~dp0.venv-dlc\Scripts\docling-tools.exe" models download layout tableformer rapidocr -o modelos
if errorlevel 1 (
    echo ERRO ao baixar os modelos ^(vem do Hugging Face e do ModelScope^). Veja a mensagem acima.
    goto erro
)

echo.
echo === 5/6  Montando o pacote com o PyInstaller ^(demora^) ===
"%PY%" -m PyInstaller --noconfirm --clean --distpath dist --workpath build docling_sigft.spec
if errorlevel 1 goto erro
rem O programa procura modelos\ ao lado do .exe; o PyInstaller poria so dentro de _internal.
robocopy modelos dist\docling_sigft\modelos /E /NFL /NDL /NJH /NJS /NP
if errorlevel 8 goto erro

echo.
echo === 6/6  Conferindo o executavel e fazendo o zip ===
dist\docling_sigft\docling_sigft.exe --versao
if errorlevel 1 (
    echo ERRO: o executavel nao abriu.
    goto erro
)
if exist dist\docling_sigft.zip del dist\docling_sigft.zip
tar -a -cf dist\docling_sigft.zip -C dist docling_sigft
if errorlevel 1 goto erro

echo.
echo Tamanhos ^(anote no LEIA-ME^):
powershell -NoProfile -Command "$p=(Get-ChildItem dist\docling_sigft -Recurse -File | Measure-Object Length -Sum).Sum; $z=(Get-Item dist\docling_sigft.zip).Length; 'Pasta: {0:N2} GB   Zip: {1:N2} GB' -f ($p/1GB),($z/1GB)"
echo.
echo PRONTO: dist\docling_sigft\docling_sigft.exe e dist\docling_sigft.zip
echo Proximo passo: a sonda sem rede, no LEIA-ME.md.
endlocal
exit /b 0

:erro
echo.
echo *** PARADO: o passo acima falhou. Nada depois dele foi feito. ***
endlocal
exit /b 1

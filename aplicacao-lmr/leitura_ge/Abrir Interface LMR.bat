@echo off
rem Abre a interface do gerador LMR (precisa de Python com openpyxl, pymupdf e PyQt6; Node para o Workflow B)
cd /d "%~dp0"
start "" pyw -X utf8 interface_lmr.py

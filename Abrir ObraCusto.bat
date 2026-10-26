@echo off
rem Abre o ObraCusto em http://localhost:8765, sem deixar janelas abertas.
rem O servidor (servidor.py) roda escondido e so atende este computador.
rem Para encerrar o servidor: "Fechar ObraCusto.bat" (ou desligar/reiniciar o computador).

cd /d "%~dp0"

where pythonw >nul 2>nul
if errorlevel 1 (
  powershell -NoProfile -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Python nao encontrado neste computador. Sem ele o login do Google nao funciona. Abra o index.html direto e use Carregar arquivo .xlsx.', 'ObraCusto')" >nul
  exit /b 1
)

start "" pythonw "%~dp0servidor.py"

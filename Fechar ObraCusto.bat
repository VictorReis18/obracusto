@echo off
rem Encerra o servidor do ObraCusto (porta 8765), que roda escondido depois de abrir o app.
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue; if ($c) { $c | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }; Write-Host 'ObraCusto encerrado.' } else { Write-Host 'O ObraCusto nao estava aberto.' }; Start-Sleep -Seconds 2"

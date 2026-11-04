@echo off
cd /d "C:\Github\Equipos"
set "PATH=C:\Users\JaimeRebolledoCarvaj\AppData\Local\Programs\nodejs;%PATH%"
echo [CRON 4AM] Ejecutando sincronizacion diaria: %date% %time% >> "C:\Github\Equipos\telemetria_sync.log"
node "C:\Github\Equipos\scripts\sync-telemetria-diaria.js" >> "C:\Github\Equipos\telemetria_sync.log" 2>&1
echo [CRON 4AM] Finalizado: %date% %time% >> "C:\Github\Equipos\telemetria_sync.log"


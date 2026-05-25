@echo off
setlocal
cd /d "%~dp0"
powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File ".\start-wings-of-world-autostart.ps1"

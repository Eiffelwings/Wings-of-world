@echo off
setlocal
cd /d "%~dp0"
node ".\scripts\wings-cli.mjs" %*

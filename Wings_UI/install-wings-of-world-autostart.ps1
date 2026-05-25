$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$startupFolder = [Environment]::GetFolderPath("Startup")
$targetBat = Join-Path $projectRoot "Start Wings Of World Auto.bat"
$startupBat = Join-Path $startupFolder "Start Wings Of World Auto.bat"

if (-not (Test-Path -LiteralPath $targetBat)) {
  throw "Missing startup launcher: $targetBat"
}

Copy-Item -LiteralPath $targetBat -Destination $startupBat -Force

Write-Host "Installed Wings Of World autostart launcher:"
Write-Host $startupBat

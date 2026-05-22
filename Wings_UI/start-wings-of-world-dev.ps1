$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $projectRoot "data"

if (-not (Test-Path -LiteralPath $dataDir)) {
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

$env:WINGS_OF_WORLD_DATA_DIR = $dataDir
$env:WINGS_DATA_DIR = $dataDir

Set-Location $projectRoot
Write-Host "WINGS_OF_WORLD_DATA_DIR=$env:WINGS_OF_WORLD_DATA_DIR"
Write-Host "Starting Wings Of World dev server..."
& pnpm dev

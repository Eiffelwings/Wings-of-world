param(
  [int]$Port = 3000,
  [switch]$NoBuild,
  [switch]$Detached
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $projectRoot "data"
$logDir = Join-Path $projectRoot "logs"
$logStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stdoutLog = Join-Path $logDir "wings-of-world-prod-$logStamp.out.log"
$stderrLog = Join-Path $logDir "wings-of-world-prod-$logStamp.err.log"

function Normalize-ProcessPathEnvironment {
  $canonicalPath = [Environment]::GetEnvironmentVariable("Path", "Process")
  if (-not $canonicalPath) {
    $canonicalPath = [Environment]::GetEnvironmentVariable("PATH", "Process")
  }
  [Environment]::SetEnvironmentVariable("PATH", $null, "Process")
  if ($canonicalPath) {
    [Environment]::SetEnvironmentVariable("Path", $canonicalPath, "Process")
  }
}

if (-not (Test-Path -LiteralPath $dataDir)) {
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$env:WINGS_OF_WORLD_DATA_DIR = $dataDir
$env:WINGS_DATA_DIR = $dataDir
$env:NODE_ENV = "production"
$env:HOST = "127.0.0.1"
$env:PORT = [string]$Port

Set-Location $projectRoot
Write-Host "WINGS_OF_WORLD_DATA_DIR=$env:WINGS_OF_WORLD_DATA_DIR"
Write-Host "HOST=$env:HOST"
Write-Host "PORT=$env:PORT"

if (-not $NoBuild) {
  Write-Host "Building Wings Of World..."
  & pnpm build
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} elseif (-not (Test-Path -LiteralPath (Join-Path $projectRoot "dist\index.js"))) {
  Write-Host "dist/index.js is missing; running build even though -NoBuild was requested."
  & pnpm build
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

if ($Detached) {
  Normalize-ProcessPathEnvironment
  $nodePath = Join-Path $env:ProgramFiles "nodejs\node.exe"
  if (-not (Test-Path -LiteralPath $nodePath)) {
    $nodePath = "node"
  }
  Write-Host "Starting Wings Of World production server in background..."
  Write-Host "URL=http://127.0.0.1:$Port"
  Write-Host "STDOUT=$stdoutLog"
  Write-Host "STDERR=$stderrLog"
  Start-Process `
    -FilePath $nodePath `
    -ArgumentList @("dist/index.js") `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog
  exit 0
}

Write-Host "Starting Wings Of World production server..."
Write-Host "URL=http://127.0.0.1:$Port"
& node dist/index.js

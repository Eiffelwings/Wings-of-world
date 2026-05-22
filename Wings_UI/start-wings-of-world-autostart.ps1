$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $projectRoot "data"
$logDir = Join-Path $projectRoot "logs"
$startupStatusLog = Join-Path $logDir "wings-of-world-autostart-status.log"
$port = 3000
$startupDelaySeconds = 12
$logStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$startupOutLog = Join-Path $logDir "wings-of-world-autostart-$logStamp.out.log"
$startupErrLog = Join-Path $logDir "wings-of-world-autostart-$logStamp.err.log"

function Write-StartupStatus([string]$message) {
  try {
    "[$([DateTime]::Now.ToString('s'))] $message" | Add-Content -LiteralPath $startupStatusLog
  } catch {}
}

function Test-WingsAlive {
  try {
    $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/api/system/health" -TimeoutSec 3
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Test-PortListening([int]$portToCheck) {
  try {
    $line = netstat -ano | Select-String -Pattern "127\.0\.0\.1:$portToCheck|0\.0\.0\.0:$portToCheck|\[::1\]:$portToCheck|\[::\]:$portToCheck" | Select-Object -First 1
    return $null -ne $line
  } catch {
    return $false
  }
}

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

if ((Test-PortListening $port) -or (Test-WingsAlive)) {
  Write-StartupStatus "Wings Of World is already reachable on port $port. Skipping autostart."
  exit 0
}

Start-Sleep -Seconds $startupDelaySeconds

if ((Test-PortListening $port) -or (Test-WingsAlive)) {
  Write-StartupStatus "Wings Of World became reachable during login delay. Skipping duplicate launch."
  exit 0
}

$env:WINGS_OF_WORLD_DATA_DIR = $dataDir
$env:WINGS_DATA_DIR = $dataDir
$env:NODE_ENV = "production"

Set-Location $projectRoot

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "dist\\index.js"))) {
  Write-StartupStatus "dist/index.js missing. Running build before autostart."
  & pnpm build *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-StartupStatus "Build failed during autostart."
    exit $LASTEXITCODE
  }
}

Write-StartupStatus "Starting Wings Of World autostart process."

Normalize-ProcessPathEnvironment
$nodePath = Join-Path $env:ProgramFiles "nodejs\node.exe"
if (-not (Test-Path -LiteralPath $nodePath)) {
  $nodePath = "node"
}

Start-Process `
  -FilePath $nodePath `
  -ArgumentList @("dist/index.js") `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $startupOutLog `
  -RedirectStandardError $startupErrLog

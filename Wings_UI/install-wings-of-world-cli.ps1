$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$binDir = Join-Path $env:USERPROFILE "wings-of-world-cli\bin"
$cmdPath = Join-Path $binDir "wings-of-world.cmd"
$ps1Path = Join-Path $binDir "wings-of-world.ps1"
$legacyCmdPath = Join-Path $binDir "wings.cmd"
$legacyPs1Path = Join-Path $binDir "wings.ps1"

New-Item -ItemType Directory -Force -Path $binDir | Out-Null

$cmdContent = @"
@echo off
node "$projectRoot\scripts\wings-cli.mjs" %*
"@

$ps1Content = @"
& node "$projectRoot\scripts\wings-cli.mjs" @args
"@

Set-Content -Path $cmdPath -Value $cmdContent -Encoding ascii
Set-Content -Path $ps1Path -Value $ps1Content -Encoding ascii
Set-Content -Path $legacyCmdPath -Value $cmdContent -Encoding ascii
Set-Content -Path $legacyPs1Path -Value $ps1Content -Encoding ascii

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathEntries = @()
if ($userPath) {
  $pathEntries = $userPath.Split(";") | Where-Object { $_.Trim() }
}

if ($pathEntries -notcontains $binDir) {
  $nextPath = if ($userPath) { "$userPath;$binDir" } else { $binDir }
  [Environment]::SetEnvironmentVariable("Path", $nextPath, "User")
  Write-Host "Added to user PATH: $binDir"
} else {
  Write-Host "Already in user PATH: $binDir"
}

Write-Host ""
Write-Host "Wings Of World CLI installed."
Write-Host "Open a new terminal and run:"
Write-Host "  wings-of-world help"
Write-Host ""
Write-Host "Compatibility alias also installed:"
Write-Host "  wings help"

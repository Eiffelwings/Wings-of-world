$ErrorActionPreference = "Stop"

$startupFolder = [Environment]::GetFolderPath("Startup")
$startupBat = Join-Path $startupFolder "Start Wings Of World Auto.bat"

if (Test-Path -LiteralPath $startupBat) {
  Remove-Item -LiteralPath $startupBat -Force
  Write-Host "Removed Wings Of World autostart launcher:"
  Write-Host $startupBat
} else {
  Write-Host "No Wings Of World autostart launcher found."
}

param(
  [int[]]$Ports = @(3000, 3001, 5173),
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$stopped = @()
$skipped = @()

function Test-WingsHealthOnPort {
  param([int]$Port)
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/system/health" -TimeoutSec 2
    return ($health.ok -eq $true -and $null -ne $health.provider)
  } catch {
    return $false
  }
}

foreach ($port in $Ports) {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $processId = [int]$listener.OwningProcess
    if ($processId -le 0) {
      continue
    }

    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    $commandLine = ""
    if ($processInfo -and $processInfo.CommandLine) {
      $commandLine = [string]$processInfo.CommandLine
    }
    $belongsToProject = $commandLine.Contains($projectRoot) -or (Test-WingsHealthOnPort -Port $port)

    if (-not $belongsToProject -and -not $Force) {
      $skipped += [pscustomobject]@{
        Port = $port
        Pid = $processId
        Reason = "process command line is outside this Wings_UI folder"
      }
      continue
    }

    Stop-Process -Id $processId -Force
    $stopped += [pscustomobject]@{
      Port = $port
      Pid = $processId
      Name = $processInfo.Name
    }
  }
}

if ($stopped.Count -gt 0) {
  Write-Host "Stopped Wings Of World listeners:"
  $stopped | Format-Table -AutoSize
} else {
  Write-Host "No Wings Of World listeners were stopped."
}

if ($skipped.Count -gt 0) {
  Write-Host ""
  Write-Host "Skipped listeners not owned by this project folder. Re-run with -Force only after verifying them:"
  $skipped | Format-Table -AutoSize
}

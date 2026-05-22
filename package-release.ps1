param(
  [string]$Destination
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$projectName = Split-Path -Leaf $projectRoot

if (-not $Destination) {
  $Destination = Join-Path (Split-Path -Parent $projectRoot) "Wings_Of_World_release.zip"
}

$excludedDirs = @(
  ".git",
  ".github",
  ".agent",
  ".agents",
  ".corepack",
  ".codex-logs",
  ".pnpm-store",
  ".manus-logs",
  ".webdev",
  ".pi",
  ".vscode",
  "__MACOSX",
  "node_modules",
  "dist",
  "dist-runtime",
  "build",
  "coverage",
  "playwright-report",
  "test-results",
  ".playwright-data",
  "data",
  "logs",
  "git-hooks",
  "Other_Projects_And_Archive"
)

$excludedRelativeDirs = @(
  "Wings_Backend/bin",
  "Wings_Backend/test-fixtures",
  "Wings_Backend/vendor",
  "Wings_Backend/Swabble"
)

$excludedDirPatterns = @(
  "data-*",
  "logs-*",
  "tmp",
  "temp"
)

$excludedFiles = @(
  ".env",
  ".env.local",
  ".DS_Store",
  ".secrets.baseline",
  "package-lock.json",
  "fly.private.toml",
  "out.txt",
  "temp-config.json",
  "Wings_Of_World_release.zip"
)

$excludedRelativeFiles = @(
  "Wings_Backend/.detect-secrets.cfg",
  "Wings_Backend/.jscpd.json",
  "Wings_Backend/.mailmap",
  "Wings_Backend/.markdownlint-cli2.jsonc",
  "Wings_Backend/.oxfmtrc.jsonc",
  "Wings_Backend/.oxlintrc.json",
  "Wings_Backend/.pre-commit-config.yaml",
  "Wings_Backend/.shellcheckrc",
  "Wings_Backend/.swiftformat",
  "Wings_Backend/.swiftlint.yml",
  "Wings_Backend/AGENTS.md",
  "Wings_Backend/appcast.xml",
  "Wings_Backend/CHANGELOG.md",
  "Wings_Backend/Dockerfile.sandbox",
  "Wings_Backend/Dockerfile.sandbox-browser",
  "Wings_Backend/Dockerfile.sandbox-common",
  "Wings_Backend/docker-setup.sh",
  "Wings_Backend/docs.acp.md",
  "Wings_Backend/fix_syntax.mjs",
  "Wings_Backend/mechanical-wings.podman.env",
  "Wings_Backend/setup-podman.sh",
  "Wings_Backend/zizmor.yml"
)

$excludedPatterns = @(
  "*.log",
  "*.tmp",
  "._*",
  "gemini-code-*.py"
)

function Test-ExcludedFile {
  param([System.IO.FileInfo]$File)

  $relative = $File.FullName.Substring($projectRoot.Length).TrimStart("\", "/")
  $relativeNormalized = $relative -replace "\\", "/"
  $segments = $relative -split "[\\/]+"

  foreach ($dir in $excludedRelativeDirs) {
    if ($relativeNormalized -eq $dir -or $relativeNormalized.StartsWith("$dir/")) {
      return $true
    }
  }

  foreach ($segment in $segments) {
    if ($excludedDirs -contains $segment) {
      return $true
    }

    foreach ($pattern in $excludedDirPatterns) {
      if ($segment -like $pattern) {
        return $true
      }
    }
  }

  if ($excludedFiles -contains $File.Name) {
    return $true
  }

  if ($excludedRelativeFiles -contains $relativeNormalized) {
    return $true
  }

  foreach ($pattern in $excludedPatterns) {
    if ($File.Name -like $pattern) {
      return $true
    }
  }

  return $false
}

$destinationFull = [System.IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $destinationFull) {
  Remove-Item -LiteralPath $destinationFull -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($destinationFull, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  $count = 0
  Get-ChildItem -LiteralPath $projectRoot -Recurse -File -Force | ForEach-Object {
    if (Test-ExcludedFile $_) {
      return
    }

    $relative = $_.FullName.Substring($projectRoot.Length).TrimStart("\", "/")
    $entryName = "$projectName/$($relative -replace "\\", "/")"
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip,
      $_.FullName,
      $entryName,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
    $count += 1
  }
} finally {
  $zip.Dispose()
}

Write-Host "Created $destinationFull"
Write-Host "Files packaged: $count"

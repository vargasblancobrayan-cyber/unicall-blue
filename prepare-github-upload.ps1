$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$Dest = Join-Path $Root "unicall-blue-listo-github"
$ZipPath = Join-Path $Root "unicall-blue-listo-github.zip"
$StatusPath = Join-Path $Root "prepare-status.json"
$InstallLog = Join-Path $Root "prepare-install.log"
$BuildLog = Join-Path $Root "prepare-build.log"

function Write-Status($data) {
  $data | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $StatusPath -Encoding UTF8
}

function Get-TailText($path, $lines = 120) {
  if (Test-Path -LiteralPath $path) {
    return ((Get-Content -LiteralPath $path -Tail $lines) -join "`n")
  }
  return ""
}

function Assert-InRoot($path) {
  $full = [System.IO.Path]::GetFullPath($path)
  $base = [System.IO.Path]::GetFullPath($Root)
  if (-not $full.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Ruta fuera del area segura: $full"
  }
}

$sourceCandidates = @(
  "C:\Users\varga\Desktop\unicall-blue-definitivo",
  "C:\Users\varga\Documents\Codex\unicall-blue-final",
  "C:\Users\varga\Documents\Codex\unicall-blue-repo",
  $Root
)

$Source = $null
foreach ($candidate in $sourceCandidates) {
  if ((Test-Path -LiteralPath (Join-Path $candidate "package.json")) -and (Test-Path -LiteralPath (Join-Path $candidate "src"))) {
    $Source = (Resolve-Path -LiteralPath $candidate).Path
    break
  }
}

if (-not $Source) {
  Write-Status @{
    ok = $false
    step = "buscar fuente"
    message = "No encontre una carpeta Next.js valida con package.json y src."
  }
  throw "No encontre una carpeta Next.js valida."
}

Assert-InRoot $Dest
Assert-InRoot $ZipPath

if (Test-Path -LiteralPath $Dest) {
  Remove-Item -LiteralPath $Dest -Recurse -Force
}
if (Test-Path -LiteralPath $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}

New-Item -ItemType Directory -Path $Dest | Out-Null

$robocopyArgs = @(
  $Source,
  $Dest,
  "/MIR",
  "/XD", "node_modules", ".next", ".git", ".vercel", ".turbo", "out",
  "/XF", ".env", ".env.local", ".env.development", ".env.production", "*.zip", "*.rar", "*.7z", "*.log",
  "/NFL", "/NDL", "/NJH", "/NJS", "/NP"
)
& robocopy @robocopyArgs | Out-Null
$robocopyCode = $LASTEXITCODE
if ($robocopyCode -gt 7) {
  Write-Status @{
    ok = $false
    step = "copiar archivos"
    source = $Source
    destination = $Dest
    robocopyCode = $robocopyCode
  }
  throw "Robocopy fallo con codigo $robocopyCode"
}

$duplicateFiles = Get-ChildItem -LiteralPath $Dest -Recurse -Force -File |
  Where-Object { $_.Name -match " \(\d+\)\." }
$removedDuplicates = @()
foreach ($file in $duplicateFiles) {
  $removedDuplicates += $file.FullName.Substring($Dest.Length).TrimStart("\")
  Remove-Item -LiteralPath $file.FullName -Force
}

$sensitiveFiles = Get-ChildItem -LiteralPath $Dest -Recurse -Force -File |
  Where-Object { $_.Name -match "^\.env" -or $_.FullName -match "\\node_modules\\" -or $_.FullName -match "\\\.next\\" }

if ($sensitiveFiles.Count -gt 0) {
  foreach ($file in $sensitiveFiles) {
    Remove-Item -LiteralPath $file.FullName -Force
  }
}

Push-Location $Dest
try {
  & npm.cmd install --no-audit --no-fund > $InstallLog 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Status @{
      ok = $false
      step = "npm install"
      source = $Source
      destination = $Dest
      removedDuplicates = $removedDuplicates
      installLog = Get-TailText $InstallLog
    }
    exit 1
  }

  & npm.cmd run build > $BuildLog 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Status @{
      ok = $false
      step = "npm run build"
      source = $Source
      destination = $Dest
      removedDuplicates = $removedDuplicates
      buildLog = Get-TailText $BuildLog
    }
    exit 1
  }
}
finally {
  Pop-Location
}

foreach ($folder in @("node_modules", ".next", ".turbo")) {
  $path = Join-Path $Dest $folder
  if (Test-Path -LiteralPath $path) {
    Assert-InRoot $path
    Remove-Item -LiteralPath $path -Recurse -Force
  }
}

Compress-Archive -LiteralPath (Join-Path $Dest "*") -DestinationPath $ZipPath -Force

$zipInfo = Get-Item -LiteralPath $ZipPath
$fileCount = (Get-ChildItem -LiteralPath $Dest -Recurse -Force -File | Measure-Object).Count

Write-Status @{
  ok = $true
  source = $Source
  destination = $Dest
  zip = $ZipPath
  zipMB = [math]::Round($zipInfo.Length / 1MB, 2)
  files = $fileCount
  removedDuplicates = $removedDuplicates
  checked = @{
    npmInstall = $true
    npmBuild = $true
    nodeModulesRemoved = -not (Test-Path -LiteralPath (Join-Path $Dest "node_modules"))
    nextRemoved = -not (Test-Path -LiteralPath (Join-Path $Dest ".next"))
    envRemoved = -not (Get-ChildItem -LiteralPath $Dest -Recurse -Force -File | Where-Object { $_.Name -match "^\.env" } | Select-Object -First 1)
  }
}

Write-Output "OK"

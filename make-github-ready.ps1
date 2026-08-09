$ErrorActionPreference = "Stop"

$root = (Resolve-Path ".").Path
$outDir = Join-Path $root "unicall-blue-listo-github"
$zipPath = Join-Path $root "unicall-blue-listo-github.zip"
$statusPath = Join-Path $root "make-github-ready-status.json"
$logPath = Join-Path $root "make-github-ready.log"
$installLog = Join-Path $root "npm-install.log"
$buildLog = Join-Path $root "npm-build.log"

function Write-Log {
  param([string]$Message)
  Add-Content -LiteralPath $logPath -Value ("[{0}] {1}" -f (Get-Date -Format "s"), $Message)
}

Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $statusPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $installLog -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $buildLog -Force -ErrorAction SilentlyContinue

$candidates = @(
  "C:\Users\varga\Desktop\unicall-blue-definitivo",
  "C:\Users\varga\Documents\Codex\unicall-blue-final",
  "C:\Users\varga\Documents\Codex\unicall-blue-repo",
  $root
)

$source = $null
foreach ($candidate in $candidates) {
  if ((Test-Path -LiteralPath (Join-Path $candidate "package.json")) -and (Test-Path -LiteralPath (Join-Path $candidate "src"))) {
    $source = (Resolve-Path -LiteralPath $candidate).Path
    break
  }
}

if (-not $source) {
  throw "No encontre una carpeta valida con package.json y src."
}

Write-Log "Fuente seleccionada: $source"

if (Test-Path -LiteralPath $outDir) {
  $resolvedOut = (Resolve-Path -LiteralPath $outDir).Path
  if (-not $resolvedOut.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Ruta de salida insegura: $resolvedOut"
  }
  Remove-Item -LiteralPath $resolvedOut -Recurse -Force
}

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

$excludeDirs = @(".git", "node_modules", ".next", ".vercel", ".turbo", "out", "dist", ".cache")
$excludeFiles = @(
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  "*.log",
  "*.zip",
  "make-github-ready.ps1",
  "prepare-github-upload.ps1",
  "make-github-ready-status.json"
)

$robocopyArgs = @($source, $outDir, "/E", "/XD") + $excludeDirs + @("/XF") + $excludeFiles + @("/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS", "/NP")
& robocopy @robocopyArgs | Out-Null
$robocopyExit = $LASTEXITCODE
if ($robocopyExit -gt 7) {
  throw "Robocopy fallo con codigo $robocopyExit"
}

Write-Log "Copia creada en: $outDir"

$duplicateFiles = @(Get-ChildItem -LiteralPath $outDir -Recurse -File | Where-Object { $_.Name -match ' \(\d+\)\.' })
foreach ($file in $duplicateFiles) {
  Remove-Item -LiteralPath $file.FullName -Force
}
Write-Log "Archivos duplicados eliminados: $($duplicateFiles.Count)"

Get-ChildItem -LiteralPath $outDir -Recurse -File -Force |
  Where-Object { $_.Name -like ".env*" -or $_.Extension -eq ".log" -or $_.Extension -eq ".zip" } |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }

$installExit = $null
$buildExit = $null

Push-Location $outDir
try {
  Write-Log "Ejecutando npm install para validar dependencias."
  & npm.cmd install --no-audit --no-fund *> $installLog
  $installExit = $LASTEXITCODE

  if ($installExit -eq 0) {
    Write-Log "Ejecutando npm run build para validar compilacion."
    & npm.cmd run build *> $buildLog
    $buildExit = $LASTEXITCODE
  } else {
    Write-Log "npm install fallo con codigo $installExit."
  }
} finally {
  Pop-Location
}

foreach ($generatedDir in @("node_modules", ".next", ".turbo")) {
  $generatedPath = Join-Path $outDir $generatedDir
  if (Test-Path -LiteralPath $generatedPath) {
    Remove-Item -LiteralPath $generatedPath -Recurse -Force
  }
}

Compress-Archive -Path (Join-Path $outDir "*") -DestinationPath $zipPath -Force

$status = [ordered]@{
  source = $source
  destination = $outDir
  zip = $zipPath
  duplicateFilesRemoved = $duplicateFiles.Count
  npmInstallExit = $installExit
  npmBuildExit = $buildExit
  zipBytes = (Get-Item -LiteralPath $zipPath).Length
  createdAt = (Get-Date).ToString("s")
}

$status | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8

Write-Output "READY"
Write-Output $statusPath

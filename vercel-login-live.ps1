$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$env:NPM_CONFIG_CACHE = Join-Path $root ".npm-cache-vercel"
$env:APPDATA = Join-Path $root ".vercel-appdata"
$env:LOCALAPPDATA = Join-Path $root ".vercel-localappdata"
$env:NO_UPDATE_NOTIFIER = "1"
& npx.cmd --yes vercel@latest login 2>&1 | Tee-Object -FilePath (Join-Path $root "vercel-login-live.log")

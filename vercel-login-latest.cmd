@echo off
cd /d "%~dp0"
set npm_config_cache=%CD%\.npm-cache-vercel
set VERCEL_NO_UPDATE_NOTIFIER=1
set NO_UPDATE_NOTIFIER=1
set APPDATA=%CD%\.vercel-appdata
set LOCALAPPDATA=%CD%\.vercel-localappdata
set USERPROFILE=%CD%\.vercel-cli-home
set HOME=%CD%\.vercel-cli-home
npx --cache .\.npm-cache-vercel --yes vercel@latest whoami --scope team_0EspGAof6WEjHc75tjxT5ZmC > vercel-login-latest.out.log 2> vercel-login-latest.err.log

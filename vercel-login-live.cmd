@echo off
cd /d "%~dp0"
set npm_config_cache=%CD%\.npm-cache-vercel
set VERCEL_NO_UPDATE_NOTIFIER=1
set NO_UPDATE_NOTIFIER=1
set APPDATA=%CD%\.vercel-appdata
set LOCALAPPDATA=%CD%\.vercel-localappdata
set USERPROFILE=%CD%\.vercel-cli-home
set HOME=%CD%\.vercel-cli-home
echo. | npx --cache .\.npm-cache-vercel --yes vercel@39.1.1 login > vercel-login-live.out.log 2> vercel-login-live.err.log

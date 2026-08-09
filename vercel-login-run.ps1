$env:LOCALAPPDATA='C:\Users\varga\Documents\Codex\2026-06-08\https-www-rocket-new-6a272aa1c3197700144d3616-type\.vercel-localappdata'
$env:APPDATA='C:\Users\varga\Documents\Codex\2026-06-08\https-www-rocket-new-6a272aa1c3197700144d3616-type\.vercel-localappdata'
$env:USERPROFILE='C:\Users\varga\Documents\Codex\2026-06-08\https-www-rocket-new-6a272aa1c3197700144d3616-type'
$env:VERCEL_NO_UPDATE_NOTIFIER='1'
$env:NO_UPDATE_NOTIFIER='1'
Set-Location 'C:\Users\varga\Documents\Codex\2026-06-08\https-www-rocket-new-6a272aa1c3197700144d3616-type'
npx.cmd --cache .\.npm-cache vercel@latest login *> vercel-login.out.txt

Set-Location "$HOME\.claudia"
Write-Host "Starting Claudia..." -ForegroundColor Cyan

# Ensure "Claudia's Chrome" is running — Debug Profile with CDP port 9222
# Chrome 146 requires a separate --user-data-dir for the debug port to bind
$DebugProfileDir = "$env:LOCALAPPDATA\Google\Chrome\Debug Profile"
$cdpOk = $false
try {
    $cdpCheck = Invoke-WebRequest -Uri "http://localhost:9222/json/version" -TimeoutSec 2 -ErrorAction Stop
    $cdpOk = $true
} catch {}

if (-not $cdpOk) {
    Write-Host "Starting Claudia's Chrome (Debug Profile, port 9222)..." -ForegroundColor Yellow
    # Use & operator (not Start-Process) to reliably launch separate Chrome instance
    # --new-window ensures it doesn't merge into Kurt's personal Chrome
    Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222","--remote-allow-origins=*","--user-data-dir=`"$DebugProfileDir`"","--new-window","--restore-last-session"
    Start-Sleep -Seconds 8
    try {
        $cdpCheck = Invoke-WebRequest -Uri "http://localhost:9222/json/version" -TimeoutSec 3 -ErrorAction Stop
        Write-Host "Claudia's Chrome running on port 9222." -ForegroundColor Green
    } catch {
        Write-Host "WARNING: Chrome started but CDP port 9222 not responding." -ForegroundColor Red
    }
} else {
    Write-Host "Claudia's Chrome already running on port 9222." -ForegroundColor Green
}

# Start mail service if not already running
$mailPort = Get-NetTCPConnection -LocalPort 18791 -ErrorAction SilentlyContinue | Where-Object OwningProcess -ne 0
if (-not $mailPort) {
    Write-Host "Starting mail service..." -ForegroundColor Yellow
    Start-Process -NoNewWindow -FilePath "node" -ArgumentList "$HOME\.claudia\tools\email\mail-service\server.mjs" -WorkingDirectory "$HOME\.claudia\tools\email\mail-service"
    Start-Sleep -Seconds 5
    $mailCheck = Get-NetTCPConnection -LocalPort 18791 -ErrorAction SilentlyContinue | Where-Object OwningProcess -ne 0
    if ($mailCheck) {
        Write-Host "Mail service started on port 18791." -ForegroundColor Green
    } else {
        Write-Host "WARNING: Mail service may not have started. Check manually." -ForegroundColor Red
    }
} else {
    Write-Host "Mail service already running on port 18791." -ForegroundColor Green
}
# Enable telegram polling so the bot receives messages (not just tools-only mode)
$env:TELEGRAM_POLLING_ENABLED = "1"

# Signal autonomous boot — SessionStart hook checks this before injecting "boot"
"auto" | Out-File -FilePath "C:\Users\kurtw\.claudia\.needs-boot" -Force

# NOTE: Keep these flags in sync with watchdog-claudia.ps1
# --channels is REQUIRED for Telegram connectivity
# No --plugin-dir: let auto-discovery find the current plugin version
& "C:\Users\kurtw\.local\bin\claude.exe" `
  --channels plugin:telegram@claude-plugins-official `
  --dangerously-skip-permissions `
  --model claude-opus-4-6
Write-Host "Session ended." -ForegroundColor Yellow

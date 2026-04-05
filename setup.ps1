# Claudia Setup Script
# Creates symlink, desktop shortcut, startup entry, and required directories.
# Run from the repo root: powershell -ExecutionPolicy Bypass -File setup.ps1

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
if (-not $repoRoot) { $repoRoot = (Get-Location).Path }

$symlinkPath = "$env:USERPROFILE\.claudia"
$desktopBat = "$env:USERPROFILE\Desktop\Start Claudia.bat"
$startupVbs = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\claudia-watchdog.vbs"

Write-Host "Claudia Setup" -ForegroundColor Cyan
Write-Host "Repo: $repoRoot"
Write-Host ""

# --- 1. Create ~/.claudia symlink ---
if (Test-Path $symlinkPath) {
    $existing = Get-Item $symlinkPath -Force
    if ($existing.LinkType -eq "SymbolicLink") {
        $target = $existing.Target
        if ($target -eq $repoRoot) {
            Write-Host "[OK] Symlink already exists: $symlinkPath -> $repoRoot" -ForegroundColor Green
        } else {
            Write-Host "[WARN] Symlink exists but points to: $target" -ForegroundColor Yellow
            Write-Host "       Expected: $repoRoot" -ForegroundColor Yellow
            Write-Host "       Remove it manually and re-run setup if you want to update it." -ForegroundColor Yellow
        }
    } else {
        Write-Host "[WARN] $symlinkPath exists but is not a symlink (it's a real directory)." -ForegroundColor Yellow
        Write-Host "       Back it up and remove it, then re-run setup." -ForegroundColor Yellow
    }
} else {
    Write-Host "Creating symlink: $symlinkPath -> $repoRoot"
    New-Item -ItemType SymbolicLink -Path $symlinkPath -Target $repoRoot | Out-Null
    Write-Host "[OK] Symlink created" -ForegroundColor Green
}

# --- 2. Desktop shortcut (bat file) ---
$batContent = @"
@echo off
cd /d $repoRoot
powershell.exe -ExecutionPolicy Bypass -NoExit -File "$repoRoot\infra\launchers\watchdog-claudia.ps1"
"@

Set-Content -Path $desktopBat -Value $batContent -Encoding ASCII
Write-Host "[OK] Desktop shortcut: $desktopBat" -ForegroundColor Green

# --- 3. Startup watchdog VBS ---
$vbsContent = @"
Set objShell = CreateObject("WScript.Shell")
objShell.Run "powershell.exe -ExecutionPolicy Bypass -File $repoRoot\infra\launchers\claudia-watchdog.ps1", 0, False
"@

Set-Content -Path $startupVbs -Value $vbsContent -Encoding ASCII
Write-Host "[OK] Startup entry: $startupVbs" -ForegroundColor Green

# --- 4. Create gitignored directories ---
$dirs = @("logs", "tmp", "data", "credentials", "secrets", "media", "memories\entries", "schedule\cycles\events")
foreach ($d in $dirs) {
    $fullPath = Join-Path $repoRoot $d
    if (-not (Test-Path $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        Write-Host "[OK] Created: $d\" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Copy claudia.json.example to claudia.json and fill in your API keys"
Write-Host "  2. Install tool dependencies (npm install in tools/email/mail-service, tools/browser, tools/twitter)"
Write-Host "  3. Double-click 'Start Claudia' on your Desktop"

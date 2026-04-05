# Ensures ~/.claudia is a junction to the repo.
# Uses Junction (not SymbolicLink) because junctions don't need admin on Windows.
# Called by Start Claudia.bat before launching the watchdog.
# Safe to run repeatedly - no-ops if junction already exists.

$junctionPath = "$env:USERPROFILE\.claudia"
$repoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$backupPath = "$env:USERPROFILE\.claudia-backup"

$item = Get-Item $junctionPath -Force -ErrorAction SilentlyContinue

if ($item -and $item.LinkType) {
    # Already a junction or symlink - verify target
    if ($item.Target -ne $repoRoot) {
        Write-Host "[WARN] Link points to $($item.Target), expected $repoRoot" -ForegroundColor Yellow
    }
    exit 0
}

if ($item -and -not $item.LinkType) {
    # Real directory - rename to backup
    Write-Host "Backing up $junctionPath -> $backupPath" -ForegroundColor Yellow
    if (Test-Path $backupPath) {
        Write-Host "[SKIP] Backup already exists at $backupPath. Remove it first." -ForegroundColor Red
        exit 1
    }
    Rename-Item -Path $junctionPath -NewName ".claudia-backup" -Force
    Write-Host "[OK] Backed up old directory" -ForegroundColor Green
}

# Create junction (no admin required, unlike SymbolicLink)
New-Item -ItemType Junction -Path $junctionPath -Target $repoRoot | Out-Null
Write-Host "[OK] Junction created: $junctionPath -> $repoRoot" -ForegroundColor Green

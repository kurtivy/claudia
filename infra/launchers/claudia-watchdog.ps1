# Claudia External Watchdog
# Tracks the CLI session via PID file. Restarts if: dead, signal file, or telegram duplicates.
# Runs at Windows startup via VBS script in shell:startup.

# Resolve paths - assumes ~/.claudia is symlinked to the repo
$claudiaRoot = "$env:USERPROFILE\.claudia"
$signalFile = "$claudiaRoot\restart-signal"
$pidFile = "$claudiaRoot\claudia.pid"
$batFile = "$env:USERPROFILE\Desktop\Start Claudia.bat"
$logFile = "$claudiaRoot\logs\watchdog.log"
$checkIntervalSec = 10
$cooldownSec = 60
$telegramGraceSec = 45

$lastLaunchTime = [datetime]::MinValue

$logDir = Split-Path $logFile
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Write-Log {
    param([string]$Message)
    $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    Add-Content -Path $logFile -Value "[$ts] $Message" -ErrorAction SilentlyContinue
}

if (Test-Path $logFile) {
    $existingLines = Get-Content $logFile -ErrorAction SilentlyContinue
    if ($existingLines -and $existingLines.Count -gt 500) {
        $existingLines | Select-Object -Last 500 | Set-Content $logFile -ErrorAction SilentlyContinue
    }
}

function Get-TelegramProcs {
    return Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq "bun.exe" -and $_.CommandLine -and $_.CommandLine -match "telegram"
    }
}

function Test-ClaudiaAlive {
    if (-not (Test-Path $pidFile)) { return $false }
    $cpid = [int](Get-Content $pidFile -ErrorAction SilentlyContinue)
    if (-not $cpid) { return $false }
    $proc = Get-Process -Id $cpid -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    if ($proc.ProcessName -ne "powershell") {
        Write-Log "PID $cpid is $($proc.ProcessName), not powershell - stale PID file"
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        return $false
    }
    return $true
}

function Stop-AllTelegramPollers {
    $procs = Get-TelegramProcs
    foreach ($p in $procs) {
        Write-Log "Killing telegram bun PID $($p.ProcessId)"
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    if ($procs) {
        Write-Log "Killed $(@($procs).Count) telegram bun process(es)"
        Start-Sleep -Seconds 2
    }
}

function Stop-Claudia {
    if (-not (Test-Path $pidFile)) { return }
    $cpid = [int](Get-Content $pidFile -ErrorAction SilentlyContinue)
    if (-not $cpid) {
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        return
    }

    Write-Log "Killing process tree for PID $cpid"
    taskkill /T /F /PID $cpid 2>$null

    $waited = 0
    while ($waited -lt 15) {
        Start-Sleep -Seconds 1
        $waited++
        $still = Get-Process -Id $cpid -ErrorAction SilentlyContinue
        if (-not $still) { break }
    }

    $still = Get-Process -Id $cpid -ErrorAction SilentlyContinue
    if ($still) {
        Write-Log "WARN: PID $cpid refused to die after 15s - skipping relaunch"
        return
    }

    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    Stop-AllTelegramPollers
}

Write-Log "Watchdog started"

$telegramFailLogged = $false

while ($true) {
    $needsRestart = $false
    $reason = ""

    $sinceLastLaunch = ((Get-Date) - $lastLaunchTime).TotalSeconds
    if ($sinceLastLaunch -lt $cooldownSec) {
        Start-Sleep -Seconds $checkIntervalSec
        continue
    }

    if (Test-Path $signalFile) {
        Remove-Item $signalFile -Force
        $needsRestart = $true
        $reason = "restart signal file"
    }

    if (-not $needsRestart -and -not (Test-ClaudiaAlive)) {
        $needsRestart = $true
        $reason = "process dead or PID stale"
    }

    # Telegram duplicate-poller cleanup
    if (-not $needsRestart -and (Test-ClaudiaAlive) -and $sinceLastLaunch -ge $telegramGraceSec) {
        $tgProcs = Get-TelegramProcs
        $count = if ($tgProcs) { @($tgProcs).Count } else { 0 }
        if ($count -gt 2) {
            Write-Log "WARN: $count telegram bun processes - killing extras"
            $sorted = $tgProcs | Sort-Object ProcessId
            $sorted | Select-Object -Skip 2 | ForEach-Object {
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            }
        }
    }

    if ($needsRestart) {
        Write-Log "Restart triggered: $reason"
        Stop-Claudia
        Stop-AllTelegramPollers

        if (Test-ClaudiaAlive) {
            Write-Log "WARN: Claudia still alive after Stop - skipping launch"
        } else {
            Write-Log "Launching Claudia"
            Start-Process $batFile
            $lastLaunchTime = Get-Date
            $telegramFailLogged = $false
        }
    }

    Start-Sleep -Seconds $checkIntervalSec
}

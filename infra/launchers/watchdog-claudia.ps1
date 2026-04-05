$ErrorActionPreference = "Continue"

# Resolve paths - repo root for workdir, ~/.claudia for signal files
# Signal files MUST use ~/.claudia so the external watchdog can find them
$repoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$claudiaBin = "$env:USERPROFILE\.local\bin\claude.exe"
$workDir = $repoRoot
$signalDir = "$env:USERPROFILE\.claudia"
$pidFile = "$signalDir\claudia.pid"
$restartDelaySec = 5

Set-Location $workDir
$Host.UI.RawUI.WindowTitle = "Claudia Terminal"

while ($true) {
    Write-Host ""
    Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] Starting Claudia session" -ForegroundColor Cyan
    Write-Host ""

    # Pre-launch: kill any orphaned telegram pollers from previous sessions
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq "bun.exe" -and $_.CommandLine -and $_.CommandLine -match "telegram"
    } | ForEach-Object {
        Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] Pre-launch: killing stale telegram poller PID $($_.ProcessId)" -ForegroundColor DarkYellow
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2

    # Write this terminal's PID so external watchdog can track us
    $PID | Out-File -FilePath $pidFile -Force

    # Find and write the WindowsTerminal PID that hosts this session
    $wtPid = (Get-Process -Name WindowsTerminal -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } |
        Select-Object -First 1).Id
    if ($wtPid) {
        $wtPid | Out-File -FilePath "$signalDir\.terminal-pid" -Force
    }

    # Enable telegram polling ONLY for this CLI session
    $env:TELEGRAM_POLLING_ENABLED = "1"

    # Signal that this is a watchdog-launched boot
    "auto" | Out-File -FilePath "$signalDir\.needs-boot" -Force

    # Spawn boot injection BEFORE launching Claude.
    # This runs in a background job with a generous delay, so by the time it
    # types "boot", Claude is fully loaded and waiting for input.
    # The watchdog owns the terminal and knows the PID — no guessing.
    $bootJob = Start-Job -ArgumentList $wtPid, "$signalDir\logs\boot-inject.log" -ScriptBlock {
        param($termPid, $logFile)
        Start-Sleep -Seconds 15
        Add-Type -AssemblyName System.Windows.Forms
        $wsh = New-Object -ComObject WScript.Shell
        $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')

        for ($i = 0; $i -lt 5; $i++) {
            $proc = Get-Process -Id $termPid -ErrorAction SilentlyContinue
            if ($proc -and $proc.MainWindowHandle -ne 0) {
                $activated = $wsh.AppActivate($termPid)
                if ($activated) {
                    Start-Sleep -Milliseconds 500
                    [System.Windows.Forms.SendKeys]::SendWait('boot{ENTER}')
                    Add-Content $logFile "[$ts] Boot injected via watchdog job (terminal PID $termPid, attempt $($i+1))"
                    return
                }
            }
            Start-Sleep -Seconds 5
        }
        Add-Content $logFile "[$ts] FAILED: Could not inject boot after 5 attempts"
    }

    # Run claude inline - interactive, gets stdin/stdout
    & $claudiaBin --channels plugin:telegram@claude-plugins-official --dangerously-skip-permissions --model claude-opus-4-6

    # Clean up boot job if still running
    Stop-Job $bootJob -ErrorAction SilentlyContinue
    Remove-Job $bootJob -Force -ErrorAction SilentlyContinue

    # Clean up PID on exit
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue

    # Post-exit: kill any orphaned telegram plugin processes
    # These hold the getUpdates poll lock and block the next session
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq "bun.exe" -and $_.CommandLine -and $_.CommandLine -match "telegram"
    } | ForEach-Object {
        Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] Killing orphan telegram plugin PID $($_.ProcessId)" -ForegroundColor DarkYellow
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

    Write-Host ""
    Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] Claudia exited - restarting in ${restartDelaySec}s" -ForegroundColor Yellow
    Write-Host "  Press Ctrl+C to stop" -ForegroundColor DarkGray

    Start-Sleep -Seconds $restartDelaySec
}

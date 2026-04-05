# DEPRECATED — AVOID USING
# This script KILLS ALL CHROME instances (including Kurt's personal browser)
# before launching the Debug Profile. It WORKS but disrupts Kurt's browsing.
#
# Preferred approach: Launch Debug Profile alongside Kurt's Chrome:
#   powershell -Command "& 'C:\Program Files\Google\Chrome\Application\chrome.exe' --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir='C:\Users\kurtw\AppData\Local\Google\Chrome\Debug Profile' --new-window https://x.com/home"
#
# Only use this script as a last resort if the preferred approach fails.
# See chrome-connection.md for full documentation.
#
# Original description: Launch Chrome with remote debugging for Chrome MCP connection
# Creates a debug profile that shares cookies/sessions with the main profile
# Usage: DO NOT USE — see start-claudia.ps1 instead

$ErrorActionPreference = "Stop"

$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$UserDataDir = "$env:LOCALAPPDATA\Google\Chrome\User Data"
$DebugUserDataDir = "$env:LOCALAPPDATA\Google\Chrome\Debug Profile"
$Port = 9222

# Kill existing Chrome instances first
$chromeProcs = Get-Process chrome -ErrorAction SilentlyContinue
if ($chromeProcs) {
    Write-Host "Closing existing Chrome instances..."
    $chromeProcs | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# Create debug profile directory if it doesn't exist
if (-not (Test-Path $DebugUserDataDir)) {
    Write-Host "Creating debug profile directory..."
    New-Item -ItemType Directory -Path $DebugUserDataDir -Force | Out-Null

    # Copy essential profile data for session continuity
    # This copies cookies, login sessions, extensions, etc.
    $profileSource = "$UserDataDir\Profile 7"
    if (-not (Test-Path $profileSource)) {
        $profileSource = "$UserDataDir\Profile 6"
    }
    if (-not (Test-Path $profileSource)) {
        $profileSource = "$UserDataDir\Default"
    }

    if (Test-Path $profileSource) {
        Write-Host "Copying profile from $profileSource..."
        # Copy key files that maintain login sessions
        $itemsToCopy = @(
            "Network\Cookies",
            "Network\Cookies-journal",
            "Login Data",
            "Login Data-journal",
            "Web Data",
            "Preferences",
            "Secure Preferences",
            "Bookmarks"
        )

        $destProfile = "$DebugUserDataDir\Default"
        New-Item -ItemType Directory -Path "$destProfile\Network" -Force | Out-Null

        foreach ($item in $itemsToCopy) {
            $src = Join-Path $profileSource $item
            $dst = Join-Path $destProfile $item
            if (Test-Path $src) {
                $dstDir = Split-Path $dst -Parent
                if (-not (Test-Path $dstDir)) {
                    New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
                }
                Copy-Item $src $dst -Force
                Write-Host "  Copied: $item"
            }
        }

        # Also copy Local State (encryption keys for cookies)
        $localState = "$UserDataDir\Local State"
        if (Test-Path $localState) {
            Copy-Item $localState "$DebugUserDataDir\Local State" -Force
            Write-Host "  Copied: Local State"
        }
    } else {
        Write-Host "WARNING: No profile found to copy. You'll need to log in again."
    }
}

Write-Host "Launching Chrome with remote debugging on port $Port..."
Write-Host "Debug profile: $DebugUserDataDir"

# Launch Chrome with debug flags
Start-Process $ChromePath -ArgumentList @(
    "--remote-debugging-port=$Port",
    "--remote-allow-origins=*",
    "--user-data-dir=`"$DebugUserDataDir`"",
    "--restore-last-session"
)

# Wait for debug port to be available
Write-Host "Waiting for debug port..."
$maxWait = 15
$waited = 0
while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 1
    $waited++
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($conn) {
            Write-Host "Chrome debug port $Port is LIVE!"
            break
        }
    } catch {}
    Write-Host "  Waiting... ($waited/$maxWait)"
}

# Check if DevToolsActivePort file was created
$dtap = "$DebugUserDataDir\DevToolsActivePort"
$dtapDefault = "$DebugUserDataDir\Default\DevToolsActivePort"
if (Test-Path $dtap) {
    Write-Host "DevToolsActivePort found at: $dtap"
    Get-Content $dtap
} elseif (Test-Path $dtapDefault) {
    Write-Host "DevToolsActivePort found at: $dtapDefault"
    Get-Content $dtapDefault
    # Create symlink at expected location
    Write-Host "Creating symlink at expected location..."
    New-Item -ItemType SymbolicLink -Path $dtap -Target $dtapDefault -Force | Out-Null
} else {
    Write-Host "WARNING: DevToolsActivePort file not created."
    Write-Host "Checking if port is actually listening..."
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 3 -ErrorAction Stop
        Write-Host "Debug API responding:"
        Write-Host $response.Content
    } catch {
        Write-Host "Debug API NOT responding. Chrome may need a restart."
    }
}

# Also copy DevToolsActivePort to the location Chrome MCP expects
$mainDtap = "$UserDataDir\DevToolsActivePort"
if ((Test-Path $dtap) -and -not (Test-Path $mainDtap)) {
    Copy-Item $dtap $mainDtap -Force
    Write-Host "Copied DevToolsActivePort to main User Data dir for Chrome MCP plugin."
}

Write-Host "`nDone. Chrome MCP should now be able to connect."

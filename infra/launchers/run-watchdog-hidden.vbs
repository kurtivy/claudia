Set objShell = CreateObject("WScript.Shell")
objShell.Run "powershell.exe -ExecutionPolicy Bypass -File C:\Users\kurtw\.claudia\infra\launchers\claudia-watchdog.ps1", 0, False

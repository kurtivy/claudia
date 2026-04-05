' Start Claudia Mail Service silently (no visible window)
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & CreateObject("WScript.Shell").ExpandEnvironmentStrings("%USERPROFILE%") & "\.claudia\tools\email\mail-service\start.ps1""", 0, False

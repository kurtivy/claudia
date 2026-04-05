$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$env:USERPROFILE\.claudia\scripts\campaigns\w3a-email-service-campaign.ps1`""
$trigger = New-ScheduledTaskTrigger -Daily -At "8:00AM"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd
Register-ScheduledTask -TaskName "W3A Email Service Campaign" -Action $action -Trigger $trigger -Settings $settings -Description "Daily email campaign promoting Web3Advisory email service. 500/day for 3 days, then 1000/day." -Force
Write-Host "Task registered: W3A Email Service Campaign (daily at 8am)"

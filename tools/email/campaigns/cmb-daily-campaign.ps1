# CMB Daily Campaign - Picks 200 fresh contacts and sends via Resend + Bluehost
# Runs daily at 8am via Windows Task Scheduler

$ErrorActionPreference = "Continue"
$logFile = "C:\Users\kurtw\.claudia\tools\email\campaigns\cmb-daily-log.txt"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$baseUrl = "http://localhost:18791/api"
$token = "76170678994afa13d09bb3b3f3af5806e0f68f1139ea52fd"
$headers = @{ "Authorization" = "Bearer $token"; "Content-Type" = "application/json" }

function Log($msg) {
    "$timestamp | $msg" | Out-File -Append -FilePath $logFile
    Write-Host $msg
}

Log "=== CMB Daily Campaign Start ==="

# Step 0: Check API health
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/status" -Method GET -TimeoutSec 5
    if (-not $health.ok) { throw "API returned not-ok" }
    Log "API healthy: $($health.accounts.total) sender accounts"
} catch {
    Log "ERROR: Mail API is not responding at $baseUrl. Aborting."
    Log "Start it with: powershell -File $env:USERPROFILE\.claudia\mail-service\start.ps1"
    exit 1
}

# Step 1: Pick fresh contacts
Log "Picking 200 fresh contacts..."
$pickResult = & python3 "C:\Users\kurtw\.claudia\tools\email\campaigns\cmb-daily-pick.py" 2>&1
Log "Pick result: $pickResult"

if ($LASTEXITCODE -ne 0) {
    Log "ERROR: Contact picker failed. Aborting."
    exit 1
}

# Step 2: Import Resend list
Log "Importing Resend contacts..."
$resendCsv = Get-Content "C:\Users\kurtw\.claudia\tools\email\campaigns\cmb-resend-list.csv" -Raw
$resendBody = @{ csv = $resendCsv; list = "cmb-resend-daily" } | ConvertTo-Json
$resendImport = Invoke-RestMethod -Uri "$baseUrl/contacts/import" -Method POST -Headers $headers -Body $resendBody
Log "Resend import: $($resendImport.imported) imported"

# Step 3: Import Bluehost list
Log "Importing Bluehost contacts..."
$bluehostCsv = Get-Content "C:\Users\kurtw\.claudia\tools\email\campaigns\cmb-bluehost-list.csv" -Raw
$bluehostBody = @{ csv = $bluehostCsv; list = "cmb-bluehost-daily" } | ConvertTo-Json
$bluehostImport = Invoke-RestMethod -Uri "$baseUrl/contacts/import" -Method POST -Headers $headers -Body $bluehostBody
Log "Bluehost import: $($bluehostImport.imported) imported"

# Step 4: Create date slug
$dateSlug = Get-Date -Format "MMMdd"

# Step 5: Create Resend campaign
Log "Creating Resend campaign..."
$resendCampaign = @{
    slug = "cmb-resend-$dateSlug"
    name = "CMB Outreach - Resend $dateSlug"
    list_slug = "cmb-resend-daily"
    provider = "resend"
    from_name = "Kurt"
    reply_to = "kurt@web3advisory.co"
    template_slug = "cmb-outreach"
} | ConvertTo-Json
$rc = Invoke-RestMethod -Uri "$baseUrl/campaigns" -Method POST -Headers $headers -Body $resendCampaign
Log "Resend campaign #$($rc.id) created with $($rc.total_contacts) contacts"

# Step 6: Create Bluehost campaign
Log "Creating Bluehost campaign..."
$bluehostCampaign = @{
    slug = "cmb-bluehost-$dateSlug"
    name = "CMB Outreach - Bluehost $dateSlug"
    list_slug = "cmb-bluehost-daily"
    provider = "bluehost"
    from_name = "Kurt"
    reply_to = "kurt@web3advisory.co"
    template_slug = "cmb-outreach"
} | ConvertTo-Json
$bc = Invoke-RestMethod -Uri "$baseUrl/campaigns" -Method POST -Headers $headers -Body $bluehostCampaign
Log "Bluehost campaign #$($bc.id) created with $($bc.total_contacts) contacts"

# Step 7: Approve both
Log "Approving campaigns..."
$approveBody = '{"approved_by":"scheduled-task"}'
Invoke-RestMethod -Uri "$baseUrl/campaigns/$($rc.id)/approve" -Method POST -Headers $headers -Body $approveBody | Out-Null
Invoke-RestMethod -Uri "$baseUrl/campaigns/$($bc.id)/approve" -Method POST -Headers $headers -Body $approveBody | Out-Null

# Step 8: Send both
Log "Sending campaigns..."
Invoke-RestMethod -Uri "$baseUrl/campaigns/$($rc.id)/send" -Method POST -Headers $headers | Out-Null
Invoke-RestMethod -Uri "$baseUrl/campaigns/$($bc.id)/send" -Method POST -Headers $headers | Out-Null

Log "Both campaigns launched. Resend=#$($rc.id), Bluehost=#$($bc.id)"
Log "=== CMB Daily Campaign Complete ==="

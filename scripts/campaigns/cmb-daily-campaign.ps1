# CMB Daily Campaign - Winner (Variant A)
# Scheduled task: runs daily at 8am
# Picks 200 contacts, sends all through winning template A
# A/B test concluded 2026-03-30: A=23.0%/4.2% vs B=19.2%/2.9% (616 emails, 4 days)

$ErrorActionPreference = "Stop"

$CLAUDIA_HOME = "$env:USERPROFILE\.claudia"
$BASE_URL = "http://localhost:18791/api"
$CONFIG = Get-Content "$CLAUDIA_HOME\claudia.json" | ConvertFrom-Json
$TOKEN = $CONFIG.gateway.token
$AUTH = @{ "Authorization" = "Bearer $TOKEN"; "Content-Type" = "application/json" }

$CAMPAIGNS_DIR = "$CLAUDIA_HOME\tools\email\campaigns"
$LOG_FILE = "$CAMPAIGNS_DIR\daily-campaign.log"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts  $msg" | Tee-Object -Append -FilePath $LOG_FILE
}

# Step -1: Ensure mail service is running
Log "=== Starting daily campaign ==="
$mailPort = Get-NetTCPConnection -LocalPort 18791 -ErrorAction SilentlyContinue | Where-Object OwningProcess -ne 0
if (-not $mailPort) {
    Log "Mail service not running. Starting..."
    Start-Process -NoNewWindow -FilePath "node" -ArgumentList "$CLAUDIA_HOME\tools\email\mail-service\server.mjs" -WorkingDirectory "$CLAUDIA_HOME\tools\email\mail-service"
    Start-Sleep -Seconds 5
    $mailPort = Get-NetTCPConnection -LocalPort 18791 -ErrorAction SilentlyContinue | Where-Object OwningProcess -ne 0
    if (-not $mailPort) {
        Log "ERROR: Mail service failed to start. Aborting."
        exit 1
    }
    Log "Mail service started."
}

# Step 0: Idempotency check — skip if today's campaigns already exist
$dateSlug = Get-Date -Format "yyyy-MM-dd"
try {
    $existingCampaigns = Invoke-RestMethod -Uri "$BASE_URL/campaigns" -Headers $AUTH
    $todayCampaigns = $existingCampaigns.campaigns | Where-Object {
        $_.created_at -and $_.created_at.StartsWith($dateSlug) -and $_.sent -gt 0
    }
    if ($todayCampaigns -and $todayCampaigns.Count -gt 0) {
        $totalSent = ($todayCampaigns | Measure-Object -Property sent -Sum).Sum
        Log "SKIP: $($todayCampaigns.Count) campaigns already sent today ($totalSent emails). Exiting."
        exit 0
    }
} catch {
    Log "WARNING: Could not check existing campaigns: $($_.Exception.Message). Proceeding anyway."
}

# Step 1: Pick contacts
Log "Running contact picker..."

$pickResult = python "$CAMPAIGNS_DIR\cmb-daily-pick.py" 2>&1
Log $pickResult

if ($LASTEXITCODE -ne 0) {
    Log "ERROR: Contact picker failed (exit code $LASTEXITCODE). Aborting."
    exit 1
}

$resendCsv = "$CAMPAIGNS_DIR\cmb-resend-list.csv"
$bluehostCsv = "$CAMPAIGNS_DIR\cmb-bluehost-list.csv"

if (-not (Test-Path $resendCsv) -or -not (Test-Path $bluehostCsv)) {
    Log "ERROR: CSV files not generated. Aborting."
    exit 1
}

# Step 2: Read CSVs, merge all contacts, split for A/B test
# All sends go through Bluehost (Resend has 0% deliverability for cold email)
$resendContacts = Import-Csv $resendCsv
$bluehostContacts = Import-Csv $bluehostCsv
$allContacts = @($resendContacts) + @($bluehostContacts)

if ($allContacts.Count -lt 2) {
    Log "ERROR: Only $($allContacts.Count) contacts picked. Need at least 2. Aborting."
    exit 1
}

Log "Total contacts: $($allContacts.Count) (all via Bluehost)"

# A/B test complete — all contacts go through winning template A
$contactsA = $allContacts

# Bluehost sender rotation (10 accounts, split across A and B)
$bluehostSenders = @(
    "kurt@web3advisory.co",
    "admin@web3advisory.co",
    "contact@web3advisory.co",
    "hello@web3advisory.co",
    "info@web3advisory.co",
    "maria@web3advisory.co",
    "marketing@web3advisory.co",
    "outreach@web3advisory.co",
    "partnerships@web3advisory.co",
    "pr@web3advisory.co"
)

function Send-CampaignBatch($contacts, $provider, $template, $variant, $fromEmail) {
    $listName = "cmb-daily-$dateSlug-$variant-$provider"

    # Build CSV string for import
    $csvLines = @("email,name")
    foreach ($c in $contacts) {
        $email = $c.email -replace '"', ''
        $name = $c.name -replace '"', ''
        $csvLines += "$email,$name"
    }
    $csvString = $csvLines -join "`n"

    # Import contacts
    $importBody = @{ csv = $csvString; list = $listName } | ConvertTo-Json
    $importResult = Invoke-RestMethod -Uri "$BASE_URL/contacts/import" -Method POST -Headers $AUTH -Body $importBody
    Log "[$variant/$provider] Imported: $($importResult.imported) contacts to list $listName"

    # Create campaign
    $campaignBody = @{
        name = "CMB Daily $dateSlug $variant ($provider)"
        list_slug = $listName
        template_slug = $template
        provider = $provider
        from_name = "Kurt"
    } | ConvertTo-Json

    $campaign = Invoke-RestMethod -Uri "$BASE_URL/campaigns" -Method POST -Headers $AUTH -Body $campaignBody
    $campaignId = $campaign.id
    Log "[$variant/$provider] Campaign created: ID $campaignId"

    # Approve and send
    Invoke-RestMethod -Uri "$BASE_URL/campaigns/$campaignId/approve" -Method POST -Headers $AUTH | Out-Null
    Invoke-RestMethod -Uri "$BASE_URL/campaigns/$campaignId/send" -Method POST -Headers $AUTH | Out-Null
    Log "[$variant/$provider] Campaign $campaignId approved and sending"

    return $campaignId
}

try {
    # All sends via Bluehost, split across 10 sender accounts (~20 contacts each)
    $senderIdx = 0
    $bhChunkSize = [math]::Max(1, [math]::Ceiling($contactsA.Count / 10))

    for ($i = 0; $i -lt $contactsA.Count; $i += $bhChunkSize) {
        $chunk = $contactsA[$i..([math]::Min($i + $bhChunkSize - 1, $contactsA.Count - 1))]
        $sender = $bluehostSenders[$senderIdx % $bluehostSenders.Count]
        Send-CampaignBatch $chunk "bluehost" "cmb-outreach-a" "A-bh$senderIdx" $sender
        $senderIdx++
    }

    Log "=== Daily campaign complete. All Bluehost. Variant A (winner). ==="

    # Wait for campaigns to finish sending, then run health check
    Log "Waiting 5 minutes for campaigns to complete, then running health check..."
    Start-Sleep -Seconds 300
    $healthCheck = node "$CLAUDIA_HOME\tools\email\campaign-health-check.mjs" --telegram --min-sent 100 2>&1
    Log "Health check: $healthCheck"
}
catch {
    Log "ERROR: $($_.Exception.Message)"
    Log $_.ScriptStackTrace
    # Still try to send alert on failure
    node "$CLAUDIA_HOME\tools\email\campaign-health-check.mjs" --telegram 2>&1 | Out-Null
    exit 1
}

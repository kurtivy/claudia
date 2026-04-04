# Web3Advisory Email Service Launch Campaign
# Scheduled task: runs daily at 8am
# Picks business-domain contacts, sends through branded HTML template
# Days 1-3: 500/day, then 1000/day

$ErrorActionPreference = "Stop"

$BASE_URL = "http://localhost:18791/api"
$TOKEN = (Get-Content "$env:USERPROFILE\kurtclaw\.env" | Where-Object { $_ -match "^OPENCLAW_GATEWAY_TOKEN=" }) -replace "OPENCLAW_GATEWAY_TOKEN=", ""
$AUTH = @{ "Authorization" = "Bearer $TOKEN"; "Content-Type" = "application/json" }

$CAMPAIGNS_DIR = "$env:USERPROFILE\.openclaw\tools\email\campaigns"
$LOG_FILE = "$CAMPAIGNS_DIR\w3a-service-campaign.log"
$TRACKER_FILE = "$CAMPAIGNS_DIR\w3a-service-sent-tracker.json"
$ALL_CONTACTS_CSV = "$CAMPAIGNS_DIR\email-service-launch-all.csv"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts  $msg" | Tee-Object -Append -FilePath $LOG_FILE
}

# Ensure mail service is running
Log "=== Starting W3A email service campaign ==="
$mailPort = Get-NetTCPConnection -LocalPort 18791 -ErrorAction SilentlyContinue | Where-Object OwningProcess -ne 0
if (-not $mailPort) {
    Log "Mail service not running. Starting..."
    Start-Process -NoNewWindow -FilePath "node" -ArgumentList "$env:USERPROFILE\.openclaw\tools\email\mail-service\server.mjs" -WorkingDirectory "$env:USERPROFILE\.openclaw\tools\email\mail-service"
    Start-Sleep -Seconds 5
    $mailPort = Get-NetTCPConnection -LocalPort 18791 -ErrorAction SilentlyContinue | Where-Object OwningProcess -ne 0
    if (-not $mailPort) {
        Log "ERROR: Mail service failed to start. Aborting."
        exit 1
    }
    Log "Mail service started."
}

# Idempotency check
$dateSlug = Get-Date -Format "yyyy-MM-dd"
try {
    $existingCampaigns = Invoke-RestMethod -Uri "$BASE_URL/campaigns" -Headers $AUTH
    $todayCampaigns = $existingCampaigns.campaigns | Where-Object {
        $_.name -like "*W3A Service*" -and $_.created_at -and $_.created_at.StartsWith($dateSlug) -and $_.sent -gt 0
    }
    if ($todayCampaigns -and $todayCampaigns.Count -gt 0) {
        $totalSent = ($todayCampaigns | Measure-Object -Property sent -Sum).Sum
        Log "SKIP: Already sent today ($totalSent emails). Exiting."
        exit 0
    }
} catch {
    Log "WARNING: Could not check existing campaigns: $($_.Exception.Message). Proceeding anyway."
}

# Load tracker
$tracker = @{ sent_emails = @(); days_sent = 0; started = "" }
if (Test-Path $TRACKER_FILE) {
    $tracker = Get-Content $TRACKER_FILE | ConvertFrom-Json
    # Convert to hashtable for easier manipulation
    $sentSet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($e in $tracker.sent_emails) { [void]$sentSet.Add($e) }
} else {
    $sentSet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $tracker.started = $dateSlug
}

# Determine batch size: 500 for first 3 days, then 1000
$daysSent = [int]$tracker.days_sent
if ($daysSent -lt 3) {
    $batchSize = 500
} else {
    $batchSize = 1000
}
Log "Day $($daysSent + 1): batch size = $batchSize"

# Read all contacts CSV, pick unsent ones
$allContacts = Import-Csv $ALL_CONTACTS_CSV
$available = $allContacts | Where-Object { -not $sentSet.Contains($_.email) }
Log "Available contacts: $($available.Count) / $($allContacts.Count) total"

if ($available.Count -eq 0) {
    Log "No more contacts to send. Campaign complete!"
    exit 0
}

# Shuffle and pick batch
$batch = $available | Get-Random -Count ([Math]::Min($batchSize, $available.Count))
Log "Picked $($batch.Count) contacts for today"

# Write batch CSV
$batchFile = "$CAMPAIGNS_DIR\w3a-service-batch-$dateSlug.csv"
$batch | Export-Csv -Path $batchFile -NoTypeInformation -Encoding UTF8

# Import contacts to mail service
$csvContent = Get-Content $batchFile -Raw
$importBody = @{
    csv = $csvContent
    list = "w3a-service-$dateSlug"
    source = "w3a-email-service-launch"
} | ConvertTo-Json -Depth 3

try {
    $importResult = Invoke-RestMethod -Uri "$BASE_URL/contacts/import" -Method POST -Headers $AUTH -Body $importBody
    Log "Imported: $($importResult.imported) contacts to list w3a-service-$dateSlug"
} catch {
    Log "ERROR: Import failed: $($_.Exception.Message)"
    exit 1
}

# HTML template
$htmlTemplate = @"
<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1.0'></head><body style='margin:0;padding:0;background:#f5f2ed;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;'><table width='100%' cellpadding='0' cellspacing='0' style='background:#f5f2ed;'><tr><td align='center' style='padding:32px 16px;'><table width='600' cellpadding='0' cellspacing='0' style='max-width:600px;width:100%;'><tr><td style='background:#1a1a1a;padding:20px 32px;border-radius:8px 8px 0 0;'><span style='font-size:20px;font-weight:700;color:#f5f2ed;letter-spacing:-0.3px;'>Web3Advisory</span></td></tr><tr><td style='background:#ffffff;padding:40px 32px 32px;border-left:1px solid #e0dcd6;border-right:1px solid #e0dcd6;'><p style='margin:0 0 20px;font-size:15px;color:#1a1a1a;line-height:1.6;'>Hi {{first_name}},</p><p style='margin:0 0 20px;font-size:15px;color:#333;line-height:1.6;'>Web3Advisory just launched an email campaign service built for crypto projects.</p><p style='margin:0 0 20px;font-size:15px;color:#333;line-height:1.6;'>Most projects get 5&ndash;15% deliverability through standard ESPs. We run a warmed email pipeline with domain isolation, DKIM/SPF/DMARC, and rotation &mdash; so your messages actually land in inboxes.</p><table width='100%' cellpadding='0' cellspacing='0' style='margin:0 0 24px;'><tr><td style='background:#fdf5f4;border-left:4px solid #b5382a;border-radius:4px;padding:16px 20px;'><span style='font-size:22px;font-weight:700;color:#b5382a;'>`$30 per 1,000 emails.</span><span style='font-size:15px;color:#5a5550;margin-left:8px;'>No contracts.</span></td></tr></table><p style='margin:0 0 20px;font-size:15px;color:#333;line-height:1.6;'>Open tracking, click tracking, bounce handling, and CAN-SPAM compliance included.</p><table cellpadding='0' cellspacing='0' style='margin:0 0 32px;'><tr><td style='background:#b5382a;border-radius:6px;'><a href='https://track.web3advisory.co/campaigns/' style='display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;'>Submit a Campaign</a></td></tr></table><table width='100%' cellpadding='0' cellspacing='0' style='border-top:1px solid #e0dcd6;padding-top:24px;'><tr><td style='padding-top:24px;'><p style='margin:0 0 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#999;'>We also build tools for Web3 teams</p><table width='100%' cellpadding='0' cellspacing='0'><tr><td style='padding:12px 0;border-bottom:1px solid #f0ece6;'><a href='https://contactmanagerbot.com' style='color:#b5382a;font-weight:600;font-size:14px;text-decoration:none;'>ContactManagerBot</a><span style='color:#5a5550;font-size:14px;'> &mdash; Telegram group and DM management at scale</span></td></tr><tr><td style='padding:12px 0;border-bottom:1px solid #f0ece6;'><a href='https://marketmaker-production-b817.up.railway.app/#landing' style='color:#b5382a;font-weight:600;font-size:14px;text-decoration:none;'>TokenCommand</a><span style='color:#5a5550;font-size:14px;'> &mdash; Volume management, counter-trade protection, wallet orchestration</span></td></tr><tr><td style='padding:12px 0;'><a href='https://web3advisory.co' style='color:#b5382a;font-weight:600;font-size:14px;text-decoration:none;'>Autonomous Agent Framework</a><span style='color:#5a5550;font-size:14px;'> &mdash; Custom-built AI agents that run 24/7 with persistent memory, self-healing, and human oversight</span></td></tr></table></td></tr></table></td></tr><tr><td style='background:#1a1a1a;padding:24px 32px;border-radius:0 0 8px 8px;'><p style='margin:0 0 4px;font-size:14px;color:#f5f2ed;font-weight:600;'>Kurt Ivy</p><p style='margin:0;font-size:13px;'><a href='https://web3advisory.co' style='color:#999;text-decoration:none;'>Web3 Advisory</a><span style='color:#666;'> &mdash; Marketing and growth infrastructure for Web3 projects</span></p></td></tr></table></td></tr></table></body></html>
"@

$textTemplate = @"
Hi {{first_name}},

Web3Advisory just launched an email campaign service built for crypto projects.

Most projects get 5-15% deliverability through standard ESPs. We run a warmed email pipeline with domain isolation, DKIM/SPF/DMARC, and rotation - so your messages actually land in inboxes.

`$30 per 1,000 emails. No contracts.

Open tracking, click tracking, bounce handling, and CAN-SPAM compliance included. Submit a campaign: https://track.web3advisory.co/campaigns/

We also build tools for Web3 teams:
- ContactManagerBot (https://contactmanagerbot.com) - Telegram group and DM management at scale
- TokenCommand (https://marketmaker-production-b817.up.railway.app/#landing) - Volume management, counter-trade protection, wallet orchestration
- Autonomous Agent Framework - Custom-built AI agents that run 24/7 with persistent memory, self-healing, and human oversight

Kurt Ivy
Web3 Advisory (https://web3advisory.co) - Marketing and growth infrastructure for Web3 projects
"@

# Create campaign
$campaignBody = @{
    name = "W3A Service Launch - $dateSlug ($($batch.Count))"
    list_slug = "w3a-service-$dateSlug"
    provider = "bluehost"
    from_name = "Kurt Ivy | Web3 Advisory"
    reply_to = "kurt@web3advisory.co"
    subject_template = "Email infrastructure for {{company}}"
    html_template = $htmlTemplate
    text_template = $textTemplate
} | ConvertTo-Json -Depth 3

try {
    $campaign = Invoke-RestMethod -Uri "$BASE_URL/campaigns" -Method POST -Headers $AUTH -Body $campaignBody
    Log "Campaign created: ID=$($campaign.id) slug=$($campaign.slug)"
} catch {
    Log "ERROR: Campaign creation failed: $($_.Exception.Message)"
    exit 1
}

# Approve and send
try {
    Invoke-RestMethod -Uri "$BASE_URL/campaigns/$($campaign.id)/approve" -Method POST -Headers $AUTH | Out-Null
    Log "Campaign approved"
    Invoke-RestMethod -Uri "$BASE_URL/campaigns/$($campaign.id)/send" -Method POST -Headers $AUTH | Out-Null
    Log "Campaign sending started"
} catch {
    Log "ERROR: Approve/send failed: $($_.Exception.Message)"
    exit 1
}

# Update tracker
foreach ($c in $batch) { [void]$sentSet.Add($c.email) }
$newTracker = @{
    sent_emails = @($sentSet)
    days_sent = $daysSent + 1
    started = if ($tracker.started) { $tracker.started } else { $dateSlug }
    last_sent = $dateSlug
    total_sent = $sentSet.Count
}
$newTracker | ConvertTo-Json -Depth 3 | Set-Content $TRACKER_FILE -Encoding UTF8
Log "Tracker updated: $($sentSet.Count) total sent, day $($daysSent + 1)"

# Wait 5 min then report
Log "Waiting 5 minutes for initial delivery stats..."
Start-Sleep -Seconds 300

try {
    $stats = Invoke-RestMethod -Uri "$BASE_URL/campaigns/$($campaign.id)" -Headers $AUTH
    Log "Stats: sent=$($stats.sent) opened=$($stats.opened) clicked=$($stats.clicked) bounced=$($stats.bounced) failed=$($stats.failed)"
    Log "=== Campaign complete ==="
} catch {
    Log "WARNING: Could not fetch stats: $($_.Exception.Message)"
    Log "=== Campaign complete (stats unavailable) ==="
}

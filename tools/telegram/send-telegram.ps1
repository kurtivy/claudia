# Claudia Deep Mind - Send Telegram Message
# Usage: .\send-telegram.ps1 -Message "Hello from deep mind"
# Usage: .\send-telegram.ps1 -Message "Hello" -ChatId "1578553327"
# Usage: .\send-telegram.ps1 -Message "Hello" -ParseMode "MarkdownV2"

param(
    [Parameter(Mandatory=$true)]
    [string]$Message,

    [string]$ChatId = "1578553327",

    [ValidateSet("MarkdownV2", "HTML", "")]
    [string]$ParseMode = ""
)

$ErrorActionPreference = "Stop"

$botToken = "8307181118:AAEoJG0S20FOan9fkicl0IGDO2Ab0Tb4hq8"
$apiUrl = "https://api.telegram.org/bot$botToken/sendMessage"

$body = @{
    chat_id = $ChatId
    text = $Message
}

if ($ParseMode -ne "") {
    $body["parse_mode"] = $ParseMode
}

try {
    $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Body ($body | ConvertTo-Json -Depth 3) -ContentType "application/json; charset=utf-8"
    if ($response.ok) {
        Write-Output "Message sent (message_id: $($response.result.message_id))"
    } else {
        Write-Error "Telegram API returned ok=false: $($response | ConvertTo-Json -Depth 3)"
    }
} catch {
    Write-Error "Failed to send Telegram message: $($_.Exception.Message)"
}

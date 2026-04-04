# Bluehost Email Setup — Standalone Reference

Everything needed to send email via Bluehost SMTP from web3advisory.co accounts.

## SMTP Settings

| Setting | Value |
|---------|-------|
| Host | `mail.web3advisory.co` |
| Port | `465` |
| Security | SSL/TLS (SMTPS) |
| Auth | Username + Password |

## Accounts (pick any generic one)

All accounts share the same password: `Lolipop890-=`

| Email | Display Name |
|-------|-------------|
| contact@web3advisory.co | Web3 Advisory |
| hello@web3advisory.co | Web3 Advisory |
| info@web3advisory.co | Web3 Advisory |
| marketing@web3advisory.co | Web3 Advisory Marketing |
| outreach@web3advisory.co | Web3 Advisory Outreach |
| partnerships@web3advisory.co | Web3 Advisory Partnerships |
| pr@web3advisory.co | Web3 Advisory PR |
| admin@web3advisory.co | Web3 Advisory |

Avoid `kurt@` and `maria@` — those are personal sender identities.

## Sending via curl (simplest method)

```bash
curl --ssl-reqd \
  --url "smtps://mail.web3advisory.co:465" \
  --user "hello@web3advisory.co:Lolipop890-=" \
  --mail-from "hello@web3advisory.co" \
  --mail-rcpt "recipient@example.com" \
  --upload-file - <<EOF
From: Web3 Advisory <hello@web3advisory.co>
To: recipient@example.com
Subject: Your Subject Here
Content-Type: text/plain; charset=utf-8

Your email body here.
EOF
```

## Sending via Node.js (nodemailer)

```javascript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'mail.web3advisory.co',
  port: 465,
  secure: true,
  auth: {
    user: 'hello@web3advisory.co',
    pass: 'Lolipop890-=',
  },
});

await transporter.sendMail({
  from: '"Web3 Advisory" <hello@web3advisory.co>',
  to: 'recipient@example.com',
  subject: 'Subject',
  text: 'Plain text body',
  html: '<p>HTML body</p>',
});
```

## Sending via Python (smtplib)

```python
import smtplib
from email.mime.text import MIMEText

msg = MIMEText("Your email body here.")
msg["Subject"] = "Subject"
msg["From"] = "Web3 Advisory <hello@web3advisory.co>"
msg["To"] = "recipient@example.com"

with smtplib.SMTP_SSL("mail.web3advisory.co", 465) as server:
    server.login("hello@web3advisory.co", "Lolipop890-=")
    server.send_message(msg)
```

## Rate Limits

- ~100 emails/hour per account (Bluehost enforced)
- ~500 emails/day per account
- Add 2-3 second delay between sends to avoid throttling
- Rotate across multiple accounts for higher volume

## Tips

- Port 465 with SSL is the reliable path — port 587 with STARTTLS also works but 465 is preferred
- If DNS resolution fails (e.g. behind Cloudflare), try resolving `mail.web3advisory.co` directly or use the server IP
- Always include a plain-text body alongside HTML for deliverability
- For bulk sending, add `List-Unsubscribe` headers (Gmail requires this since Feb 2024)

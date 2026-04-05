#!/bin/bash
# A/B Test Report — pulls campaign stats and compares variants
# Usage: bash ab-test-report.sh [date]
# Default: today's date. Pass YYYY-MM-DD for a specific day.

DATE=${1:-$(date +%Y-%m-%d)}
TOKEN=$(grep "^CLAUDIA_GATEWAY_TOKEN=" ~/Desktop/claudia/.env | cut -d= -f2-)
BASE_URL="http://localhost:18791/api"

if [ -z "$TOKEN" ]; then
  echo "ERROR: CLAUDIA_GATEWAY_TOKEN not found in ~/Desktop/claudia/.env"
  exit 1
fi

CAMPAIGNS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/campaigns" 2>/dev/null)

if [ -z "$CAMPAIGNS" ]; then
  echo "ERROR: Could not reach mail service at $BASE_URL"
  exit 1
fi

echo "=== A/B Test Report — $DATE ==="
echo ""

# Filter campaigns by date and extract A vs B variants
python3 -c "
import json, sys

data = json.loads('''$CAMPAIGNS''')
campaigns = data.get('campaigns', [])
date = '$DATE'

# Find campaigns matching the date
day_campaigns = [c for c in campaigns if c.get('created_at', '').startswith(date)]

if not day_campaigns:
    print(f'No campaigns found for {date}.')
    print(f'Available dates: {sorted(set(c[\"created_at\"][:10] for c in campaigns))}')
    sys.exit(0)

# Group by variant
variants = {}
for c in day_campaigns:
    name = c['name']
    # Detect variant from campaign name
    if '-A' in name or ' A ' in name or name.endswith(' A'):
        variant = 'A'
    elif '-B' in name or ' B ' in name or name.endswith(' B'):
        variant = 'B'
    else:
        variant = 'other'

    if variant not in variants:
        variants[variant] = {'sent': 0, 'opened': 0, 'clicked': 0, 'bounced': 0, 'failed': 0, 'campaigns': []}
    v = variants[variant]
    v['sent'] += c.get('sent', 0)
    v['opened'] += c.get('opened', 0)
    v['clicked'] += c.get('clicked', 0)
    v['bounced'] += c.get('bounced', 0)
    v['failed'] += c.get('failed', 0)
    v['campaigns'].append(c['name'])

for variant in sorted(variants.keys()):
    v = variants[variant]
    sent = v['sent']
    open_rate = (v['opened'] / sent * 100) if sent > 0 else 0
    click_rate = (v['clicked'] / sent * 100) if sent > 0 else 0
    bounce_rate = (v['bounced'] / sent * 100) if sent > 0 else 0

    print(f'--- Variant {variant} ---')
    print(f'  Campaigns: {len(v[\"campaigns\"])}')
    print(f'  Sent: {sent}  |  Failed: {v[\"failed\"]}')
    print(f'  Opened: {v[\"opened\"]} ({open_rate:.1f}%)')
    print(f'  Clicked: {v[\"clicked\"]} ({click_rate:.1f}%)')
    print(f'  Bounced: {v[\"bounced\"]} ({bounce_rate:.1f}%)')
    print()

# Winner call (if both A and B exist)
if 'A' in variants and 'B' in variants:
    a_rate = (variants['A']['opened'] / variants['A']['sent'] * 100) if variants['A']['sent'] > 0 else 0
    b_rate = (variants['B']['opened'] / variants['B']['sent'] * 100) if variants['B']['sent'] > 0 else 0
    diff = abs(a_rate - b_rate)

    if diff < 2:
        print(f'Result: Too close to call (A: {a_rate:.1f}% vs B: {b_rate:.1f}%, delta {diff:.1f}pp). Need more data.')
    elif a_rate > b_rate:
        print(f'Result: Variant A leads ({a_rate:.1f}% vs {b_rate:.1f}%, +{diff:.1f}pp)')
    else:
        print(f'Result: Variant B leads ({b_rate:.1f}% vs {a_rate:.1f}%, +{diff:.1f}pp)')
"

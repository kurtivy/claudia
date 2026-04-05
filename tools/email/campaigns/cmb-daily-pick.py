"""
CMB Daily Contact Picker
Picks 200 random contacts (100 Resend, 100 Bluehost) from the vault CSVs.
Tracks previously picked emails in cmb-sent-tracker.json to prevent overlap.

Usage: python cmb-daily-pick.py [--dry-run]
"""
import csv, json, random, sys, os
from pathlib import Path
from datetime import datetime

BASE = Path("C:/Users/kurtw/.claudia/tools/email/campaigns")
TRACKER_FILE = BASE / "cmb-sent-tracker.json"
RESEND_OUT = BASE / "cmb-resend-list.csv"
BLUEHOST_OUT = BASE / "cmb-bluehost-list.csv"

CSV_FILES = [
    ("Full Dump - Older", BASE / "Email Vault Updated 2025 - Full Dump - Older.csv", True),
    ("New Leads 14k", BASE / "Email Vault Updated 2025 - New Leads 14k.csv", False),
    ("Token Buyers", BASE / "Email Vault Updated 2025 - Random Verified Token Buyers.csv", True),
]

def load_all_contacts():
    contacts = []
    for label, path, has_header in CSV_FILES:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            if has_header and label == "Token Buyers":
                reader = csv.DictReader(f)
                for row in reader:
                    email = (row.get("email") or "").strip().lower()
                    if email and "@" in email:
                        contacts.append((email, ""))
            elif has_header:
                reader = csv.DictReader(f)
                for row in reader:
                    email = (row.get("email") or "").strip().lower()
                    name = (row.get("name") or "").strip()
                    if email and "@" in email:
                        contacts.append((email, name))
            else:
                reader = csv.reader(f)
                for row in reader:
                    if len(row) >= 2:
                        name = row[0].strip()
                        email = row[1].strip().lower()
                        if email and "@" in email and "." in email:
                            contacts.append((email, name))
    # Deduplicate
    seen = set()
    unique = []
    for email, name in contacts:
        if email not in seen:
            seen.add(email)
            unique.append((email, name))
    return unique

def load_tracker():
    if TRACKER_FILE.exists():
        with open(TRACKER_FILE) as f:
            return json.load(f)
    return {"sent_emails": [], "batches": []}

def save_tracker(tracker):
    with open(TRACKER_FILE, "w") as f:
        json.dump(tracker, f, indent=2)

def main():
    dry_run = "--dry-run" in sys.argv
    
    all_contacts = load_all_contacts()
    print(f"Total unique contacts in vault: {len(all_contacts)}")
    
    tracker = load_tracker()
    already_sent = set(tracker["sent_emails"])
    print(f"Previously picked: {len(already_sent)}")
    
    # Filter out already-sent
    available = [(e, n) for e, n in all_contacts if e not in already_sent]
    print(f"Available for picking: {len(available)}")
    
    if len(available) < 200:
        print(f"WARNING: Only {len(available)} contacts left! Need 200.")
        pick_count = min(len(available), 200)
    else:
        pick_count = 200
    
    # True random (no fixed seed)
    random.shuffle(available)
    selected = available[:pick_count]
    
    resend = selected[:pick_count // 2]
    bluehost = selected[pick_count // 2:]
    
    print(f"\nPicked: {len(resend)} Resend + {len(bluehost)} Bluehost")
    print(f"Sample Resend: {resend[0][1] or '(no name)'} <{resend[0][0]}>")
    print(f"Sample Bluehost: {bluehost[0][1] or '(no name)'} <{bluehost[0][0]}>")
    
    if dry_run:
        print("\n[DRY RUN] No files written.")
        return
    
    # Write CSVs
    for path, contacts in [(RESEND_OUT, resend), (BLUEHOST_OUT, bluehost)]:
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["email", "name"])
            for email, name in contacts:
                w.writerow([email, name])
    
    # Update tracker
    new_emails = [e for e, _ in selected]
    tracker["sent_emails"].extend(new_emails)
    tracker["batches"].append({
        "date": datetime.now().isoformat(),
        "count": len(selected),
        "resend": len(resend),
        "bluehost": len(bluehost)
    })
    save_tracker(tracker)
    
    print(f"\nFiles written: {RESEND_OUT.name}, {BLUEHOST_OUT.name}")
    print(f"Tracker updated: {len(tracker['sent_emails'])} total picked")

if __name__ == "__main__":
    main()

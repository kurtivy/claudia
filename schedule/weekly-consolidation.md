# Weekly Consolidation Process

_Run once per week when: 7+ days since last consolidation AND 3+ unconsolidated entries exist._
_First eligible: April 2, 2026._
_Estimated time: 15-20 minutes._

## Trigger Check

```
Last consolidation: (check memories/entries/ for _consolidated marker or this file's date)
Unconsolidated entries: ls memories/entries/ | grep -v consolidated
```

If conditions not met, skip.

## Steps

### 1. Scan all entries since last consolidation
Read each entry in `memories/entries/`. For each, note:
- Core fact(s)
- Whether it confirms, contradicts, or extends an existing knowledge topic
- Importance level and confirmation count

### 2. Identify patterns
Look for:
- Same fact appearing in 2+ entries → promote to knowledge
- Facts that contradict existing knowledge → update knowledge, mark old as superseded
- Low-importance entries older than 30 days with confirmed: 1 → archive candidate
- Clusters of entries that suggest a new knowledge topic

### 3. Promote confirmed facts to knowledge/
For each promotion:
- If it extends an existing knowledge file: edit that file, add the new information
- If it's a new topic: create new file in appropriate knowledge/ subdirectory, add to _index.md
- Mark source entry with `consolidated: true` in frontmatter

### 4. Prune stale entries
Criteria for archival:
- importance: low
- confirmed: 1 (never re-encountered)
- older than 30 days
- not superseding anything

Archive = move to `memories/archive/` (create if needed). Don't delete — just remove from active rotation.

### 5. Rebuild indexes
```bash
python3 ~/.claudia/tools/system/brain-index.py rebuild
bash ~/.claudia/tools/system/rebuild-manifest.sh
```

### 6. Update initiative strategies
Review each active initiative's status.md. Based on what was learned this week:
- Do any strategies need adjustment?
- Are any key results clearly unreachable or already met?
- Should any initiative be paused or a new one started?

### 7. Log the consolidation
Append to this file:
```
## Consolidation Log
| Date | Entries Scanned | Promoted | Pruned | New Knowledge Topics |
|------|----------------|----------|--------|---------------------|
```

## Consolidation Log

| Date | Entries Scanned | Promoted | Pruned | New Knowledge Topics |
|------|----------------|----------|--------|---------------------|
| (first run April 2) | | | | |

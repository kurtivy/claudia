# Memory Entries — Schema

File format: see `~/.claudia/_file-format.md` (type: memory).

## Retrieval

Search the brain index (FTS5 with Porter stemming — handles word variants automatically):
```bash
python3 ~/.claudia/tools/system/brain-index.py search "query terms"
```
Returns ranked results with summaries. Read the top 2-3 matching files.

The manifest (`memories/manifest.md`) is the human-readable mirror — useful for browsing, not needed for search.

## Rebuild

```bash
python3 ~/.claudia/tools/system/brain-index.py rebuild   # Rebuild FTS index
bash ~/.claudia/tools/system/rebuild-manifest.sh          # Rebuild manifest
```
Run both during weekly consolidation. The FTS index covers memory, knowledge, and contacts.

## Manifest Maintenance

When you write a new entry, append to `memories/manifest.md`:
`- \`YYYY-MM-DD_slug\` [subtype/domain/importance]`

Regenerated fully during weekly consolidation.

## Writing Rules

1. **Extract, don't transcribe.** 5-15 discrete facts per session, not a session log.
2. **Deduplicate before writing.** Check manifest first. Bump `confirmed` on existing entries instead of creating duplicates.
3. **Max 10 lines body.** If longer, it's probably two entries.
4. **Contradict, don't overwrite.** New fact conflicts with old → create new with `supersedes:` pointing to old. Add `superseded_by:` to old entry's frontmatter.

## Lifecycle

1. **Created** during sessions (PostToolUse nudge + cycle-end brain dump)
2. **Confirmed** when future sessions encounter the same pattern
3. **Consolidated** weekly — high-confirmation entries promoted to `knowledge/`
4. **Archived** after 30+ days if importance: low and confirmed: 1
5. **Superseded** when a contradicting fact arrives

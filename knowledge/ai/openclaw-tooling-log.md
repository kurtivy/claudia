---
title: OpenClaw Tooling Log — Consolidation Tools and Fixes
type: knowledge
domain: ai/infrastructure
consolidated_from: [consolidation-check-slug-bug-fixed, consolidation-merge-tool-built]
last_updated: 2026-03-30
scope: [self-evolution]
---

# OpenClaw Tooling Log — Consolidation Tools

*Created: 2026-04-01. Covers: 2026-03-30 tooling work.*

## consolidation-merge.mjs

Smart knowledge file generator that replaces the old `consolidation-draft.mjs` (which produced raw concatenation with duplicate headings and redundant content).

- Extracts discrete facts from memory entries (bullets, paragraphs, table rows, numbered lists)
- Deduplicates via Jaccard similarity + substring containment
- Groups facts by topic using heading-based clustering with similar-heading merging
- Outputs structured knowledge draft with frontmatter
- Usage: `node consolidation-merge.mjs <keyword> [--output=path] [--dry-run] [--threshold=0.55]`

## consolidation-check.mjs — Slug Matching Bug Fix

Three locations had `src.includes(cf)` instead of `cf.includes(src)` -- comparing short slugs (e.g., `agent-identity-standards-race`) against full filenames (e.g., `2026-03-27_agent-identity-standards-race`). Short string can never contain the long one, so matches always failed.

**Fix:** Added `isCovered()` helper that strips date prefixes before matching. False positive "NEEDS CONSOLIDATION" clusters dropped from 4 to 1 (the remaining one was a genuine gap -- pumpfun entries covered by a knowledge file missing frontmatter).

---

*Source: Memory entries from 2026-03-30.*

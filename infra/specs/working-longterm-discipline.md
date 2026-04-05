# Spec: Working vs Long-Term Memory Discipline

**Refinement:** #6 of 5 Mastra-inspired architecture changes
**Status:** Implemented (2026-04-01) — brain-hygiene.mjs built, integrated into cycle-end procedure
**Author:** Claudia
**Date:** 2026-03-31
**Depends on:** None (standalone)

## Problem

`working-set.json` and `knowledge/` have blurry boundaries. Working-set sometimes contains facts that belong in knowledge. Knowledge files sometimes contain stale working assumptions. There's no enforcement of what goes where or when things should move between tiers.

## Current State

- `brain/working-set.json` -- Hot/Warm/Cold tiers, updated each cycle end, ~25 lines
- `brain/keyword-graph.json` -- routing table for priming hook, ~30 lines
- `knowledge/` -- 20+ consolidated files across ai/, crypto/, protocols/
- `memories/entries/` -- raw observations, discoveries, decisions
- Promotion path: entries -> knowledge (via weekly consolidation)
- Demotion: nothing formal. Stale entries just sit.

## Design

### Clear Boundaries

| Store | Contains | Lifetime | Updated |
|-------|----------|----------|---------|
| working-set.json | What matters THIS cycle. JSON with hot/warm/cold arrays. | Hours-days. | Every cycle end. |
| keyword-graph.json | Routing table for priming hook. JSON array of trigger/context/pointer objects. | Days-weeks. | Every cycle end. |
| memories/entries/ | Raw observations from individual cycles. | Days-weeks. Pruned at 30 days if low-importance. | During cycles. |
| knowledge/ | Consolidated, verified facts. | Weeks-months. Survives pruning. | Weekly consolidation. |

### Rules (enforced by convention, checked at cycle end)

1. **working-set.json contains NO facts.** Only `keyword-cluster -> pointer` lines. If you're writing a sentence with data in it, it belongs in a memory entry or knowledge file, not working-set.

2. **knowledge/ files have frontmatter.** Any knowledge file without proper frontmatter is invisible to tooling and may be lost during consolidation.

3. **Promotion is one-way during consolidation.** Entries promote to knowledge. Knowledge never demotes back to entries. If a knowledge fact becomes wrong, update the knowledge file directly.

4. **working-set demotion is strict:**
   - Hot -> Warm: if not touched this cycle
   - Warm -> Cold: if not touched for 2 cycles
   - Cold -> removed: if not touched for 3 cycles
   - This means working-set.json naturally shrinks. Items that matter keep getting touched. Items that don't, fall off.

5. **keyword-graph cleanup:** Remove lines where the trigger word never matched in 2+ cycles AND the topic has a knowledge file. The knowledge file IS the destination -- the routing entry is redundant.

6. **30-day entry pruning:** During weekly consolidation, entries older than 30 days with importance < high that haven't been promoted to knowledge are candidates for deletion. Check if they contain any unique facts first.

### Cycle End Checklist Addition

Add to the brain dump procedure:

```
Before updating brain files, check:
- [ ] working-set.json has no full sentences (pointers only)
- [ ] All Hot items were actually worked on this cycle
- [ ] No Warm items have been Warm for 3+ cycles (demote or promote)
- [ ] keyword-graph.json has no lines for topics fully in knowledge/
```

### Validation Script

A lightweight check that could run at cycle end:

```bash
# brain-hygiene.sh
# Checks:
# 1. working-set.json line count (warn if >20)
# 2. keyword-graph.json line count (warn if >30)
# 3. knowledge/ files without frontmatter
# 4. entries/ files older than 30 days with importance != high
```

### What This Does NOT Do

- Automated promotion (consolidation is manual/semi-automated via consolidation-merge.mjs)
- Version control on knowledge files (git handles this)
- Cross-referencing between knowledge files (keep them independent)

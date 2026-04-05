# Spec: Resource-Scoped Memory

**Refinement:** #5 of 5 Mastra-inspired architecture changes
**Status:** Implemented (2026-04-01) — memory-scope.mjs built, scope fields being added to entries
**Author:** Claudia
**Date:** 2026-03-31
**Depends on:** None (standalone)

## Problem

Memory retrieval is flat. When working on Twitter strategy, the agent searches all 150+ memory entries globally. This wastes context window on irrelevant entries (email stats while doing Twitter, crypto research while doing job search) and risks anchoring on stale data from unrelated domains.

Mastra uses resource-scoped memory: memories belong to a thread, user, or agent instance. We need initiative-scoped retrieval.

## Current State

- `memories/entries/` -- flat directory, 150+ files
- `memories/manifest.md` -- global index loaded every message
- `knowledge/` -- topic-organized (ai/, crypto/, protocols/) but not initiative-scoped
- No way to say "give me only Twitter-related memories"

## Design

### Option A: Directory-Based Scoping (rejected)

Move memories into initiative directories: `schedule/initiatives/grow-twitter/memories/`.

Problems:
- Breaks manifest tooling
- Cross-cutting memories (e.g., agent identity is relevant to both Twitter and architecture)
- Moves files away from centralized backup/consolidation

### Option B: Tag-Based Filtering (selected)

Keep flat directory. Add `scope` field to memory frontmatter. Build a retrieval helper that filters by scope.

### Schema Addition

Add to memory frontmatter:

```yaml
---
type: memory
scope: [grow-twitter, self-evolution]  # which initiatives this is relevant to
# ... existing fields ...
---
```

`scope` is an array because memories can be relevant to multiple initiatives. Omitting `scope` means globally relevant (loaded for all work).

### Retrieval Helper

```bash
# memory-scope.sh -- retrieve memories for a given initiative
# Usage: bash memory-scope.sh grow-twitter
# Returns: list of memory files where scope includes the argument, OR scope is omitted
```

The boot procedure changes:
1. Parse typed handoff to identify active initiatives
2. For each objective, note which initiative it belongs to
3. Before starting an objective, run `memory-scope.sh [initiative]` to load only relevant memories
4. Global memories (no scope field) always load

### Migration

- New memories: add `scope` field going forward
- Existing memories: leave as-is (no scope = global). Over time, add scope during consolidation.
- No bulk migration needed. The system degrades gracefully -- unscoped memories behave exactly like today.

### Impact on Manifest

manifest.md stays global but gains an optional scope annotation:

```
- `entry.md` [type/domain/importance] — description | keywords | scope:grow-twitter,self-evolution
```

This is additive. Existing manifest entries without scope still work.

### What This Does NOT Do

- Memory isolation between agents (that's multi-instance, which is a different problem)
- Automatic scope detection (the agent assigns scope when writing memories)
- Scope-based access control (all memories are readable by all work; scope is a retrieval filter, not a permission boundary)

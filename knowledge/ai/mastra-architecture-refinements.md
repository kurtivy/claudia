---
title: Mastra-Inspired Architecture Refinements
type: knowledge
domain: ai/architecture
consolidated_from: [mastra-inspired-architecture-refinements, mastra-specs-all-five-drafted]
last_updated: 2026-04-01
scope: [self-evolution]
---

# Mastra-Inspired Architecture Refinements

*Created: 2026-03-31. Consolidated from 2 memory entries.*

## Overview

Five architecture refinements inspired by Mastra framework patterns, approved by Kurt on 2026-03-31. These are the first structural improvements to the handoff/cycle/memory system since the Mar 25 brain restructure. A sixth candidate (observational memory automation) was explicitly dropped.

## The Five Refinements

### 1. Typed Handoffs (spec: infra/specs/typed-handoff.md)
- JSON+markdown hybrid format in handoff.md for machine-parseable state
- Fields: `blocked[]`, `initiatives{}`, `next_actions[]`
- Includes circuit breaker automation
- Validator: `tools/infra/validate-handoff.mjs`
- Writer: `tools/infra/write-handoff.mjs`
- **Status**: ✅ IMPLEMENTED (2026-04-01). Live in production since first typed handoff.

### 2. Resume Context (spec: infra/specs/resume-context.md)
- Minimum data payload for next cycle to pick up exact task state
- Per next_action: `task_state`, `files[]`, `steps_remaining[]`
- Includes URLs, IDs, thread state
- **Status**: ✅ IMPLEMENTED (2026-04-01). Adopted in handoff JSON.

### 3. Parallel Convergence (spec: infra/specs/parallel-convergence.md)
- Formal merge point after background agents finish, before acting on results
- Behavioral convention, not tooling
- **Status**: ✅ IMPLEMENTED (2026-04-01). Behavioral convention in use.

### 4. Scoped Memory (spec: infra/specs/scoped-memory.md)
- `scope` field in memory frontmatter for initiative-based filtering
- Initiative-scoped retrieval instead of flat global search
- Retrieval tool: `tools/memory/memory-scope.mjs`
- **Status**: ✅ IMPLEMENTED (2026-04-01). Tool built, scope fields being added to entries.

### 5. Working vs Long-Term Discipline (spec: infra/specs/working-longterm-discipline.md)
- Strict Hot/Warm/Cold demotion rules for working-set.md vs knowledge/
- 30-day pruning cycle
- Brain hygiene tool: `tools/infra/brain-hygiene.mjs`
- **Status**: ✅ IMPLEMENTED (2026-04-01). Tool built, integrated into cycle-end procedure.

## Dropped: Observational Memory (#3 in original list)
- Automated observation-to-memory pipeline
- Rejected: too lossy, risks destroying good context, interferes with memory-to-knowledge promotion tick

## Implementation Timeline
- **2026-03-31**: All 5 specs drafted, validator built
- **2026-04-01 (cycle 1)**: Typed handoffs and resume context went live via write-handoff.mjs
- **2026-04-01 (cycle 2)**: Scoped memory (memory-scope.mjs) and brain hygiene (brain-hygiene.mjs) built. Session-start prompt updated. All 5 complete.

---

*Source: Design brainstorm and spec drafting session, 2026-03-31.*

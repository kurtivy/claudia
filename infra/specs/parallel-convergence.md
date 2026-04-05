# Spec: Parallel Convergence

**Refinement:** #4 of 5 Mastra-inspired architecture changes
**Status:** Implemented (2026-04-01) — behavioral convention, no tooling needed
**Author:** Claudia
**Date:** 2026-03-31
**Depends on:** None (standalone)

## Problem

When multiple background agents run in parallel (research, browser tasks, tool builds), there's no formal merge point. Results arrive at different times and the main agent acts on partial information -- or worse, ignores late-arriving results entirely because it already moved on.

Mastra solves this with `step.parallel()` that waits for all branches then passes combined results to a convergence function. We need an equivalent for our cycle-based architecture.

## Current State

Claude Code already supports parallel agents via the Agent tool. But:
- Results arrive asynchronously via background notifications
- No mechanism to say "wait for agents A, B, C before deciding"
- The main agent often acts on agent A's result before B and C return
- No structured way to combine multiple research results into one decision

## Design

### Convergence Block

A convergence block is a section in the cycle plan that names its dependencies and its merge logic:

```markdown
## Convergence: [name]
**Wait for:** agent-1, agent-2, agent-3
**Merge:** [how to combine results]
**Then:** [what to do with merged output]
```

### Implementation

This is a behavioral convention, not a tool. The agent follows these rules:

1. **Declare convergence points in the plan.** When launching parallel agents, name the convergence point they feed into.

2. **Do not act on partial results.** If a convergence block lists 3 dependencies, wait for all 3 before executing the "Then" action. Work on other objectives while waiting.

3. **Merge before acting.** When all dependencies arrive, synthesize them before making decisions. Don't let the first result anchor the interpretation.

4. **Timeout gracefully.** If an agent hasn't returned in 10 minutes, note the gap and proceed with available results. Log the timeout as friction.

### Example

```markdown
## Plan

1. Launch 3 research agents in parallel:
   - Agent A: scan HackerNews for agent framework launches
   - Agent B: check MCP registry for new servers
   - Agent C: search Twitter for trending AI topics

## Convergence: research-sweep
**Wait for:** Agent A, Agent B, Agent C
**Merge:** Identify overlapping themes across all 3 sources
**Then:** Pick the most interesting theme for a tweet draft + memory entry

3. [other objectives while waiting]
```

### Why Not a Tool?

A formal orchestration tool would be over-engineering. Claude Code's Agent tool already handles parallelism. The gap is behavioral -- the agent needs a convention for when to wait and when to act. A markdown convention in the cycle plan is sufficient because:
- The cycle plan is already the source of truth for session work
- The agent already reads and follows the plan
- No code to maintain
- Works with any number of parallel agents

### Future: Tool-Assisted Convergence

If behavioral conventions prove unreliable (agents acting on partial results despite the plan), upgrade to a lightweight script:

```bash
# convergence-wait.sh -- blocks until all named agents complete
# Usage: bash convergence-wait.sh agent-id-1 agent-id-2 agent-id-3
```

But try the convention first. Add the tool only if needed.

## Validation

During cycle review, check: did any convergence blocks fire before all dependencies arrived? If yes, log as friction and consider the tool-assisted upgrade.

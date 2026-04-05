# Spec: Resume Context

**Refinement:** #2 of 5 Mastra-inspired architecture changes
**Status:** Implemented (2026-04-01)
**Author:** Claudia
**Date:** 2026-03-31
**Depends on:** Typed Handoff (#1)

## Problem

When a new session boots, it reads the handoff and initiative status files. But these describe *what to do next* without carrying enough state to *continue from exactly where the previous session stopped*. The agent has to re-derive context by reading files, grepping code, checking tool output -- wasting 5-15 minutes of every cycle on rediscovery.

Mastra's `suspend()` captures typed state so `resume()` can continue without rediscovery. We need the equivalent.

## Examples of Lost Context

| Scenario | What handoff says | What the agent actually needs |
|----------|-------------------|-------------------------------|
| Twitter reply cron | "continue 10% Twitter" | Which tool, which voice file, last reply-log.jsonl line, engagement check pending URLs |
| Architecture design | "continue brainstorm Q2+" | Which question was last answered, which questions remain, what files are in progress |
| Job search | "browse for marketing roles" | Which sites have accounts, credentials location, which sites are dead/blocked |
| Consolidation | "weekly consolidation due April 2" | Tool path, which clusters are ready, how many entries need processing |

## Design

`resume_context` is an object inside each `next_action` in the typed handoff JSON. It contains the minimum data payload for the next session to skip rediscovery and start working immediately.

### Schema

```typescript
interface ResumeContext {
  // What was the agent doing when it stopped?
  task_state: "not_started" | "in_progress" | "blocked" | "awaiting_input";

  // Files the next session should read first (ordered)
  files?: string[];

  // Tool to run (path relative to ~/.claudia/)
  tool?: string;
  tool_args?: Record<string, string>;

  // For multi-step work: where in the sequence
  step_current?: number;
  step_total?: number;
  steps_completed?: string[];
  steps_remaining?: string[];

  // For design/brainstorm work: questions answered and pending
  questions_answered?: Record<string, string>;
  questions_pending?: string[];

  // For Twitter: last engagement check state
  pending_engagement_urls?: string[];
  last_reply_log_line?: number;

  // For browser work: page state
  last_url?: string;
  auth_required?: boolean;

  // Catch-all for domain-specific state
  [key: string]: unknown;
}
```

### Rules

1. **Minimum viable context.** Don't dump everything. Only include what saves the next session from rediscovery. If the answer is in a file that's already in `files[]`, don't duplicate it.

2. **Pointers over copies.** File paths and line numbers over pasted content. The next session reads fresh -- stale copied content is worse than a pointer.

3. **task_state is required.** Every resume_context must say whether the work was started, in progress, blocked, or waiting on input. This lets the boot procedure triage without reading details.

4. **steps_remaining replaces prose.** Instead of "continue brainstorm Q2+", list the actual remaining items: `["spec parallel convergence", "spec scoped memory", "spec working/long-term"]`.

5. **Don't store secrets.** Credentials go in `secrets/`. Resume context points to them: `"credentials": "secrets/job-sites.json"`.

### Example: This Cycle's Handoff

```json
{
  "priority": 1,
  "action": "Continue Mastra architecture design",
  "initiative": "brain-restructure",
  "resume_context": {
    "task_state": "in_progress",
    "files": [
      "infra/specs/typed-handoff.md",
      "infra/specs/resume-context.md"
    ],
    "steps_completed": [
      "Typed handoff format spec",
      "Resume context spec"
    ],
    "steps_remaining": [
      "Parallel convergence spec (#4)",
      "Resource-scoped memory spec (#5)",
      "Working vs long-term discipline spec (#6)",
      "Build validate-handoff.mjs",
      "Update session-start prompt for JSON parsing",
      "Write first typed handoff"
    ],
    "questions_answered": {
      "Q1: handoff format": "JSON+markdown hybrid, JSON in ---json fences"
    },
    "questions_pending": [
      "Parallel convergence: event-driven or poll-based merge?",
      "Scoped memory: initiative-level directories or tag-based filtering?",
      "Working/long-term: automated promotion triggers or manual?"
    ]
  }
}
```

### How Boot Procedure Uses It

Current boot step 1:
> Read handoff.md -- the previous cycle's summary

New boot step 1:
> Parse handoff.md JSON block. For each next_action with task_state "in_progress":
> 1. Read the files listed in resume_context.files[]
> 2. Note steps_remaining -- these become candidate objectives
> 3. If task_state is "blocked", check if the blocker is resolved before adding to objectives
> 4. If task_state is "awaiting_input", check if Kurt responded (Telegram, file changes)

This is ~30 seconds of parsing vs 5-15 minutes of rediscovery.

### Validation

The handoff validator (from spec #1) adds:
- Every priority-1 next_action MUST have resume_context
- resume_context.task_state is required
- Files in resume_context.files[] must exist (warning, not error -- they may be created next cycle)

### What This Does NOT Cover

- How parallel agent results merge (refinement #4)
- How memory scoping works (refinement #5)
- How working-set.json vs knowledge/ boundary is enforced (refinement #6)

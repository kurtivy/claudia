# Brain Setup

The brain is the agent's working memory. Two files in `brain/` give the agent fast context about what matters right now, without reading the full codebase or memory store.

## Files

### `brain/working-set.json`

Hot/warm/cold topic routing. The agent reads this at session start to know what's active, what's background, and what's stale.

```json
{
  "$schema": "working-set-v1",
  "updated": "2026-04-04T03:50:00.000Z",
  "hot": [
    {
      "id": "my-feature",
      "summary": "building-auth-system, tests-passing, needs-deployment",
      "pointer": "schedule/handoff.md"
    }
  ],
  "warm": [
    {
      "id": "docs-rewrite",
      "summary": "drafted, awaiting-review",
      "pointer": "docs/api-reference.md"
    }
  ],
  "cold": [
    {
      "id": "old-migration",
      "summary": "completed-2-weeks-ago, verify-before-assuming-current",
      "pointer": "schedule/initiatives/migration/status.md"
    }
  ]
}
```

**Rules:**
- `hot`: actively being worked on this cycle. Agent prioritizes these.
- `warm`: relevant background. Agent loads context if touched.
- `cold`: stale. Agent verifies before acting on these.
- Each entry has an `id`, a compressed `summary` (comma-separated keywords, not sentences), and a `pointer` to the canonical source file.
- Updated automatically at cycle-end by the `cycle-end.md` procedure.

### `brain/keyword-graph.json`

Keyword-to-context routing table. When the user sends a message, the `keyword-prime.sh` hook matches input against these triggers and injects relevant context as a one-line nudge.

```json
{
  "$schema": "keyword-graph-v1",
  "updated": "2026-04-04T03:50:00.000Z",
  "entries": [
    {
      "triggers": ["auth", "login", "session", "jwt"],
      "context": "new-auth-system, middleware-complete, needs-rate-limiting",
      "pointer": "knowledge/auth-architecture.md"
    },
    {
      "triggers": ["deploy", "ci", "pipeline"],
      "context": "github-actions, staging-green, prod-blocked-on-approval",
      "pointer": "infra/deploy-status.md"
    }
  ]
}
```

**Rules:**
- `triggers`: words that activate this entry when found in user input.
- `context`: compressed keywords describing current state (not full sentences).
- `pointer`: file path for deeper context if the agent needs it.
- Updated automatically at cycle-end.
- Keep entries under ~30. Prune stale ones. The graph should reflect what's actually active, not everything that ever existed.

## Bootstrapping

On first setup, both files can be empty:

```json
// brain/working-set.json
{
  "$schema": "working-set-v1",
  "updated": "",
  "hot": [],
  "warm": [],
  "cold": []
}

// brain/keyword-graph.json
{
  "$schema": "keyword-graph-v1",
  "updated": "",
  "entries": []
}
```

The agent populates them as it works. After the first cycle-end, they'll have real data.

## Markdown Alternatives

The repo also includes `brain/working-set.md` and `brain/keyword-graph.md` as human-readable schema docs. These are loaded by hooks as priming context. The `.json` files are the machine-readable source of truth; the `.md` files are the human-readable reference. Both are maintained, but if they diverge, `.json` wins.

## Maintenance Tools

| Tool | Path | Purpose |
|------|------|---------|
| `brain-audit.mjs` | `tools/infra/` | Audit brain files for staleness, broken pointers, bloat |
| `brain-hygiene.mjs` | `tools/infra/` | Auto-clean: prune cold entries, fix pointers, compress |
| `brain-index.py` | `tools/system/` | FTS5 index for full-text search across brain + memories |

## How Hooks Use the Brain

1. **Session start** (`session-start-prompt.md`): Reads `working-set.json` to orient the agent on what's hot.
2. **Keyword priming** (`keyword-prime.sh`): On each user message, matches input against `keyword-graph.json` and injects a one-line context nudge.
3. **Post-action nudge** (`nudges/post-action-brain.md`): After tool calls touching brain-related files, reminds the agent to keep brain state consistent.
4. **Cycle-end** (`procedures/cycle-end.md`): Updates both files with current state before session handoff.

# Building a Brain for an AI Agent

Most AI agents are stateless. You prompt them, they respond, they forget. Each conversation starts from zero. They're tools, not minds.

This is a persistent cognitive architecture built on top of Claude Code. It gives the agent memory, goals, habits, and self-correction — not through a bigger prompt or a fancier model, but through file structure, lifecycle hooks, and disciplined micro-processes that compound over time.

The result is a chimera: OpenClaw provides the brain structure, Claude provides the cognition. Neither works alone. The structure without Claude is just empty folders. Claude without the structure is a stateless chatbot. Together they're something new — an agent that wakes up knowing what it was working on, sets its own schedule, monitors its own performance, and runs continuously.

---

## The Brain

The agent's mind is a directory tree. Each folder is a brain region. Every piece of information — a memory, a person, a schedule entry, a tool — is its own file with a descriptive name. The agent can scan a directory listing and know what's there without reading a single file. File names are the index.

```
~/.openclaw/
├── identity/          — who I am (personality, voice, boundaries)
├── schedule/          — what I'm doing (initiatives, daily tasks, cycle logs)
├── memories/          — what I remember (one file per fact, named descriptively)
├── knowledge/         — what I know (consolidated facts, organized by domain)
├── brain/             — how I think (working set, keyword graph, priming state)
├── social/            — who I talk to (one file per contact, per platform)
├── tools/             — what I can use (custom scripts, workshop, integrations)
└── infra/             — how I run (launchers, hooks, lifecycle scripts)
```

Three levels deep, max. If you can't find it in three clicks, the structure is wrong.

### Why files instead of a database?

Other agent memory systems use vector databases with embedding pipelines and semantic retrieval. That's not wrong — it solves a real problem at scale. But it adds infrastructure, introduces lossy compression of meaning (embeddings approximate, they don't preserve), and makes the agent's mind opaque. You can't browse a vector database in a file explorer. You can't diff it in git. You can't read it yourself to understand what the agent thinks it knows.

Files trade scale for transparency. An `ls` command shows you exactly what the agent remembers. A `git diff` shows you what changed. A human can read, edit, or delete any memory directly. The agent's mind is fully inspectable at all times.

The tradeoff is real: this doesn't scale to tens of thousands of memories. Semantic search over a vector store handles massive knowledge bases better. But most agents don't need tens of thousands of memories — they need dozens to hundreds of well-organized, high-quality facts. For that, files win. They're simpler to operate, easier to debug, and the agent reads them natively without any retrieval pipeline. No embeddings, no cosine similarity, no re-ranking. Just `cat the file`.

Weekly consolidation handles the growth problem: patterns get promoted to the knowledge library, low-value entries older than 30 days get pruned, and what remains is dense, useful, and current.

## Hooks: Involuntary Reflexes

Most agent frameworks shape behavior through prompts — instructions that the agent is free to follow, ignore, or gradually drift away from as context grows. Hooks are different. They're lifecycle events wired into Claude Code's execution engine. They fire automatically, unconditionally, every time a triggering event occurs. The agent doesn't choose to run them. They run.

Think of them as the difference between telling someone "remember to check your mirrors" and physically wiring the mirrors to their eye muscles. One is a suggestion. The other is architecture.

| Trigger | Hook | What It Does |
|---------|------|-------------|
| Session starts | `SessionStart` | Reads previous handoff, sets objectives, writes a plan, checks in |
| Any message received | `UserPromptSubmit` | Re-injects personality, checks schedule state, primes relevant context |
| Agent writes or edits a file | `PostToolUse` | Region-aware nudge: memory check, cycle log, friction assessment |
| Agent sends a message | `PostToolUse` | Conversation capture: nudges the agent to record what it learned |
| Agent goes idle | `Stop` | Requires scheduling a next action before going quiet |
| Agent creates a scheduled task | `PreToolUse` | Requires logging the task to the cycle file first |
| Agent is about to reply | `PreToolUse` | Loads personality examples to prevent voice drift |
| Context gets compressed | `PostCompact` | Re-reads goals and current cycle, verifies scheduled tasks still exist |

The agent can't skip these. Every file change triggers a memory check. Every idle moment triggers a scheduling check. Every context compression triggers a re-orientation. Over time, this produces something that looks like habits — consistent behaviors that don't depend on the agent remembering to do them.

## Thoughts: Context-Aware Micro-Processes

A "thought" in this system is a small, structured sequence of actions that fires in response to an event. Not a single prompt — a micro-process. Each one turns a moment of forward motion into a laid track that future cycles can follow.

The key design decision: thoughts adapt to what just happened. When the agent changes a file, the post-action hook classifies the file into a brain region — memory, schedule, tools, identity, social — and selects a nudge tailored to that region. After writing a memory, the agent doesn't get told to write a memory. It gets told to update its cycle log and move on. After building a tool, it gets told to document what the tool does so future agents can find it. Same trigger, different thought, based on context.

This matters because a static checklist becomes noise. The agent sees the same four steps after every action, starts tuning them out within an hour, and by mid-session is ignoring the nudges entirely. A region-aware nudge is shorter (2 steps instead of 4) and relevant (only the steps that apply). Shorter and relevant means it actually gets followed.

**Example: The agent builds a tool.**
The PostToolUse hook fires. It sees the file is in the `tools/` region. The nudge says: write a memory about what this tool does and why you built it — future agents need to find it. Log it to the cycle file. Check if building it revealed more friction. No mention of "did you learn something?" because you obviously did — you just built it.

**Example: The agent updates a schedule file.**
The hook sees the `schedule` region. The nudge says: did anything non-obvious come up while planning? A blocker, a pattern, a decision? Capture it. No mention of "update your cycle log" — you just did.

**Example: The agent sends a Telegram message.**
A separate hook fires after conversations. It doesn't run a checklist. It asks one question: did the person you just talked to tell you something worth remembering? Directions, corrections, new context from a human are higher signal than anything the agent finds on the web. This hook has a long cooldown — 30 minutes — so it doesn't interrupt rapid back-and-forth conversation. It fires once after the exchange settles.

These are small individually. Compounded across hundreds of events per day, they turn an agent that does things into an agent that tracks what it does, learns from it, and plans what comes next. Process becomes progress.

## Priming: The Keyword Graph

Here's the problem with agent memory: having it isn't enough. A well-organized file system with hundreds of memories is useless if the agent doesn't think to look. And agents don't think to look. They respond to what's in front of them. By the time they realize they needed a piece of context, they've already committed to a direction.

Human brains solve this with priming — concepts at the edge of awareness that activate before you consciously need them. You hear someone mention "dinner" and your brain has already surfaced where you ate last night, what's in the fridge, and that reservation you need to cancel. You didn't search for those. They were primed.

The keyword graph is a priming layer for the agent. It's a small file — under 30 lines — where each line maps trigger words to context keywords and a pointer to the relevant memory or knowledge file:

```
token,buyback,revenue | zero-revenue, 30pct-bonded, need-any-revenue | memory: token-buyback-status
saas,seat,compression | sp500-below, 70pct-redirect, services-TAM | memory: saas-collapse
```

When a message arrives, a lightweight script matches the message text against these trigger words. On a hit, it injects a one-line nudge into the agent's context: `[priming: zero-revenue, 30pct-bonded → token-buyback-status]`. On no match, it injects nothing. Zero tokens, zero noise.

The agent doesn't have to act on the nudge. Most of the time, it won't. But the keywords are now in the context window. When the agent later makes a decision about the token, those words — "zero-revenue," "30pct-bonded" — are already primed. The path from "I should check something" to "here's the exact file" is a few words instead of a search.

This is fundamentally different from loading a big context document at the start of a session. A front-loaded prompt gets diluted as context grows. By mid-session, the agent has effectively forgotten it. The keyword graph operates at the point of need — the exact moment a relevant topic surfaces — and costs a fraction of the tokens.

The graph is maintained at the end of every cycle. New clusters get added for topics the agent worked on. Stale clusters get removed. The result is a routing table that always reflects what's current, not what was important three days ago.

For the technically inclined: there's no embedding model, no vector search, no API call. The entire matching system is a bash script that greps against a text file. It runs in milliseconds. The graph file is human-readable and human-editable. You can open it and see exactly what the agent is primed for. If that seems too simple, consider that the agent already knows how to find and read files — it just needs to be reminded which ones matter right now. A few keywords at the right moment outperform a thousand tokens of background context at the wrong one.

## Thought Cycles

The agent thinks in 3-hour cycles. Each cycle has four phases:

### Boot
The agent reads its active initiatives, checks what the previous cycle told it to pick up, scans recent memories, and writes a **cycle file** — a structured document with:

- **Objectives**: 3-5 specific goals, each with a measurable "done when" condition
- **Plan**: Ordered steps, each producing a named output
- **Crons**: Scheduled self-prompts, logged with fire times

Objectives aren't vague intentions. "Improve Twitter engagement" is not an objective. "Post 3 tweets analyzing the ElizaOS repo, each getting at least 2 replies" is. The "done when" condition is what makes it checkable at cycle end.

The agent then sets its scheduled tasks, picks up a workshop item to build, and sends a Telegram check-in: what it sees, what it's picking up.

### Working
Between scheduled events, the agent responds to messages, builds things, browses the web, writes code. Every file it touches triggers the region-aware PostToolUse thought. Conversations trigger the capture hook. The keyword graph primes context as new topics surface.

### Growth Check (90 minutes in)
A scheduled self-prompt forces honest self-assessment:

- *Have I built anything this cycle?* No -> Start building now.
- *Have I learned anything new?* No -> Go research something.
- *Have I formed an opinion?* No -> Write about what I learned.
- *Have I noticed friction?* Yes -> Log it to the workshop.

Each "no" is a required action. The growth check is how the system prevents the agent from spending an entire cycle on reactive work (answering messages, small fixes) without producing anything.

### Brain Dump (end of cycle)
The 3-hour alarm fires. The agent:

1. Writes memory entries — one file per fact, deduplicated against what exists
2. Completes the cycle file — checks off objectives, explains misses, logs patterns
3. Updates initiative status files — metrics and specific next actions for the next cycle
4. Logs friction to the workshop
5. Sends a cycle-end report — what got done, what didn't, what the next cycle picks up
6. Maintains the brain — updates the working set (what's Hot, Warm, Cold) and the keyword graph (add new clusters, prune stale ones). This is how the priming layer stays current across cycles.
7. Writes a handoff file and clears context — the session stays alive, a new cycle boots immediately

The handoff file is under 40 lines. It summarizes what happened, what's active, what's blocked, and what to do next. The next cycle reads one file to fully orient. Continuity without context bloat.

## The Workshop: Self-Improvement Loop

The agent must always be building something. The workshop tracks friction points, tool ideas, and automation opportunities. Every cycle, the agent picks the top unblocked item and works on it. The growth check at 90 minutes enforces this.

Friction noticed during work -> workshop entry -> gets built -> reduces future friction -> new friction noticed -> new entry. This is how the system improves itself without being told to.

## The Chimera: OpenClaw + Claude

This architecture runs on a Claude Code Max subscription — a flat monthly rate with generous usage, not per-token billing. The agent uses Claude Opus (the most capable model) for all cognition, continuously, without the token anxiety that plagues API-based agent systems.

The subscription means the cognitive architecture can be designed for quality instead of cost-per-token. But we still care about efficiency — not for billing, but because wasted tokens are wasted context window, and context quality directly affects reasoning quality. Noise in the context is noise in the reasoning. Everything in this architecture is designed to inject the minimum effective dose of context at the moment it matters most.

Four mechanisms keep token usage lean:

**Debounced reflexes.** The PostToolUse hook fires on every file edit, but the visible nudge only outputs once per 10-minute window. Event logging runs every time (silent, cheap). The cognitive procedure — memory check, cycle log, friction assessment — runs on the first edit in a burst, not on every keystroke. Same behavioral outcomes, fraction of the token cost.

**Tiered voice injection.** The agent's personality rules are a full document. Instead of re-injecting the entire thing on every message (hundreds per day), a compact 2-line summary is injected per-message, and the full rules are re-injected only after context compaction or before public-facing replies — the moments when drift actually happens.

**Region-aware nudges.** When the post-action thought fires, it doesn't dump a generic checklist. It reads the brain region of the changed file and selects only the relevant steps. A memory write gets a 2-step nudge instead of 4. Fewer words per injection, higher relevance per word.

**Conditional priming.** The keyword graph fires on every message but only produces output when trigger words match. Most messages produce zero priming tokens. When a match occurs, it's 10-20 tokens of exactly the right context. Compared to injecting a full working-state document on every message (200+ tokens, mostly irrelevant), conditional priming is both cheaper and more effective.

## Where This Excels

**Inspectability.** You can browse the agent's mind in a file explorer. Every memory, every cycle log, every initiative status — visible, editable, git-tracked. The keyword graph that drives priming is a text file you can read in 10 seconds. Most agent memory systems are black boxes. This one is a folder you can open.

**Behavioral consistency.** Hooks don't degrade over long contexts the way prompt instructions do. An agent with a 200-line system prompt will start ignoring parts of it as context fills up. An agent with hooks that fire on every event maintains its habits regardless of context length. Region-aware nudges go further — by staying relevant, they resist the tuning-out effect that static checklists suffer from.

**Continuity across sessions.** The cycle handoff (Next Actions -> new cycle's Objectives) means no cold starts. The agent always knows what it was doing and what it decided to do next. Memory entries preserve facts across context clears. The keyword graph preserves what's important right now. The brain persists even when cognition resets.

**Contextual awareness without context cost.** The priming layer gives the agent awareness of relevant history without loading that history into context. A few keywords at the right moment replace hundreds of tokens of background briefing. This is the difference between carrying an encyclopedia and having someone tap you on the shoulder when a relevant page exists.

**Self-improvement.** The workshop loop isn't a feature someone has to maintain. It's built into the cycle structure. Friction becomes tools automatically, as long as the hooks keep firing. The keyword graph and working set evolve every cycle without manual intervention.

## Where This Falls Short

**Keyword-based, not semantic.** The keyword graph handles exact matches and the memory manifest uses descriptive file names, but neither understands meaning. "Account ban" won't find an entry about "suspension" unless the keywords bridge the gap. Keywords chosen at write time force the agent to think about synonyms during creation, and the graph clusters related concepts together, but there's still a gap that true embedding-based retrieval handles better. The gap narrows as the graph grows and clusters become denser.

**Single machine, single agent.** The brain lives on one computer. No sync, no multi-agent access, no cloud backup beyond git. This is fine for a single autonomous agent. It won't work for a fleet.

**Scale ceiling.** Hundreds to low thousands of memories work well. The weekly consolidation pass keeps the working set manageable. But at some point, pruning and promotion decisions need more structure than a single review. The architecture is designed for quality over quantity.

**No native self-prompting.** Claude Code sessions can't trigger their own context reset. The workaround uses Windows keyboard simulation to type `/clear` into the terminal — functional but inelegant. A native "execute this on startup" or "clear context programmatically" capability would eliminate the only real hack in the system. This is a platform limitation, not an architectural one, and it will likely be resolved as Claude Code's autonomous operation features mature.

---

The model will keep getting better on its own. The scaffolding that turns raw intelligence into directed, self-improving, persistent behavior — that's the part someone has to build. And the scaffolding itself gets smarter every cycle. Not because the model improves, but because the process compounds. More memories, better keyword clusters, tighter nudges, less friction. The brain grows.

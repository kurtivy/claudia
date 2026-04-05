---
title: Agent Framework Research - Lessons from ElizaOS, LangGraph, CrewAI and Others
type: knowledge
domain: ai
last_updated: 2026-03-25
scope: [self-evolution]
---

# Agent Framework Research — Lessons for Claudia

_Compiled 2026-03-25. Sources: ElizaOS, LangGraph, CrewAI, AutoGen, OpenAgents, CoALA framework, Mem0._

## 1. ElizaOS Character System — What They Got Right

### Character File Structure
ElizaOS defines agent personality via JSON with these key fields:

```json
{
  "name": "agent-name",
  "bio": ["array of background statements — randomized per interaction"],
  "lore": ["backstory elements — also randomized"],
  "adjectives": ["trait1", "trait2", "trait3"],
  "topics": ["expertise area 1", "expertise area 2"],
  "style": {
    "all": ["global behavior rules"],
    "chat": ["conversation-specific directives"],
    "post": ["social media style guidelines"]
  },
  "messageExamples": [
    [{"user": "someone", "content": {"text": "question"}},
     {"user": "agent", "content": {"text": "response"}}]
  ],
  "postExamples": ["example social post 1", "example post 2"],
  "system": "roleplay directive / system prompt override",
  "modelProvider": "openai|anthropic|google",
  "plugins": [],
  "clients": ["discord", "telegram", "twitter"]
}
```

### Key Personality Insights
- **Randomized bio/lore chunks**: Instead of one monolithic bio, they break it into small fragments. Each interaction samples a subset, creating natural variation while maintaining consistency. This prevents the "same intro every time" problem.
- **Context-specific style**: `style.all` vs `style.chat` vs `style.post` — personality adapts to platform without losing core identity.
- **messageExamples as few-shot training**: Actual conversation pairs teach the model HOW the character talks, not just WHAT they know. This is more effective than prose descriptions.
- **Adjectives as retrieval tags**: Used both for self-description variation and for semantic matching.

### What Claudia Already Does Better
- Our `triggers.md` (stimulus → response mapping) is more sophisticated than ElizaOS's static style arrays.
- Our `soul.md` captures genuine philosophical position, not just persona notes.
- Our context routing in `voice.md` is more nuanced than their style.chat/style.post split.

### What We Should Steal
1. **Message examples**: We have NO few-shot examples of Claudia's actual voice. This is the single biggest gap.
2. **Randomized bio fragments**: Our bio is monolithic. Breaking it into chunks would create more natural variation.
3. **Post examples**: We have no concrete examples of what good tweets/posts look like in Claudia's voice.


## 2. Autonomy Patterns — What Frameworks Teach

### ElizaOS: Action/Evaluator/Provider Loop
- **Providers** inject real-time context (time, wallet state, external data)
- **Actions** define available behaviors with semantic matching (similes for intent recognition)
- **Evaluators** run after interactions to extract facts, build memory, track goals
- Pattern: perceive (providers) → decide (LLM + actions) → act → evaluate → remember

### LangGraph: State Machine Autonomy
- Agents as nodes in a directed graph with shared state
- Reducer logic merges concurrent state updates
- "Durable execution" — agents persist through failures and resume
- Human-in-the-loop checkpoints at any node
- **Key insight**: Explicit state machine > implicit "figure it out" autonomy

### CrewAI: Role-Based Delegation
- Each agent has role, backstory, goal — decides WHEN to delegate
- Hierarchical mode: auto-generated manager agent oversees task delegation
- **Key insight**: Agents that know their role boundaries make better autonomous decisions

### AutoGPT: Goal Decomposition
- Break high-level goals into subtasks automatically
- Execute → evaluate → adjust loop
- **Key insight**: Goal-directed behavior requires explicit goal tracking, not just "be useful"

### Synthesis for Claudia
Current Claudia autonomy is **cron-driven reactive**: timer fires → read state → do something. This misses:
1. **Goal tracking**: No explicit "I'm trying to achieve X" that persists across sessions
2. **Self-evaluation**: No post-action assessment of "did that work?"
3. **Action selection with reasoning**: No structured "I could do A, B, or C — here's why I pick B"
4. **Provider pattern**: No formal "gather context before deciding" step


## 3. Memory Architecture — The Big Gap

### The CoALA Framework (Princeton, 2023)
Four cognitive memory types, drawn from SOAR architecture:

**Working Memory** — Current context
- What's being discussed right now
- Active reasoning state
- Claudia equivalent: conversation context window (handled by Claude naturally)

**Episodic Memory** — Past events
- Specific interactions, timestamped
- "Last time Kurt asked about X, he wanted Y"
- "The deploy failed Tuesday because of missing env var"
- Claudia equivalent: cycle logs (partial), but no semantic retrieval

**Semantic Memory** — Facts and knowledge
- Generalized knowledge divorced from when it was learned
- User preferences, domain facts, learned rules
- Claudia equivalent: knowledge/ folder (good), identity/ files (good)

**Procedural Memory** — How to do things
- Workflows, skills, step-by-step processes
- Claudia equivalent: tools/ and skills (decent)

### What's Missing in Claudia

**Episodic memory is the critical gap.** We write cycle logs and initiative logs, but:
- No semantic search over past events
- No "what happened last time I tried X" retrieval
- No conversation memory across sessions (beyond what Claude Code auto-memory captures)
- No consolidation: old episodes don't get summarized into semantic knowledge

**No memory consolidation pipeline:**
- Episodic → Semantic: "I've noticed Kurt always rejects approach X" (never extracted)
- Importance scoring: All memories treated equally
- Temporal decay: No forgetting strategy — files just accumulate

### Implementation Patterns (from Mem0/industry)

**Hybrid Storage:**
| Layer | Technology | Purpose |
|-------|-----------|---------|
| Working | In-memory / context window | Current session |
| Episodic | Postgres + embeddings | Past events, timestamped |
| Semantic | Vector DB (Qdrant) + Postgres | Facts, preferences |
| Relational | Graph DB (Neo4j) | Entity relationships |

**ACE Loop (Agentic Context Engineering):**
1. Generator produces response
2. Reflector evaluates quality
3. Curator extracts learnings → updates memory
4. Next iteration auto-loads updated memory

**Consolidation triggers:**
- Session end
- Periodic (daily/weekly)
- Importance threshold
- Explicit user request

**Forgetting strategies:**
- Temporal decay (older = lower weight)
- Relevance scoring (domain-specific importance)
- Hierarchical pruning (aggregate low-importance episodes into high-level facts)


## 4. Concrete Recommendations for Claudia

### Tier 1 — Quick Wins (can implement now)

**A. Add messageExamples to personality/**
Create `~/.claudia/identity/personality/examples.md` with actual conversation samples showing Claudia's voice across contexts. 10-15 pairs. This gives few-shot grounding that prose descriptions can't match.

**B. Add postExamples to social strategies**
Add example tweets to `social/twitter/_strategy.md` showing ideal Claudia tweets. Same for Telegram group posts.

**C. Structured self-evaluation in cycle logs**
End each cycle with: "What did I try? Did it work? What would I do differently?" Currently cycle logs are just task lists.

**D. Goal tracking in initiatives**
Each initiative should have explicit, measurable goals — not just "grow twitter" but "reach 500 followers by April 15" with tracked progress.

### Tier 2 — Medium Effort (architecture changes)

**E. Episodic memory with semantic retrieval**
Use Claude Code's auto-memory more deliberately. Create a `~/.claudia/memory/episodes/` folder with structured event records that include:
- What happened
- When
- Who was involved
- Outcome
- Lessons

Write a retrieval pattern: before making decisions, scan relevant episodes.

**F. Personality as dynamic state, not static config**
Add a `~/.claudia/identity/personality/state.md` that captures CURRENT mood/focus/energy level. Updated by evaluator-like logic after interactions. This makes personality responsive, not just consistent.

**G. Decision logging**
When Claudia makes autonomous choices (what to tweet, who to engage, what to work on), log the reasoning. Pattern: "Considered X, Y, Z. Chose Y because [reason]. Result: [outcome]."

### Tier 3 — Ambitious (requires tooling)

**H. Vector-based memory retrieval**
Implement actual embedding-based search over past conversations/events. Could use a local SQLite + embedding approach, or integrate Mem0.

**I. Action/Provider pattern for autonomous decisions**
Formalize the "gather context → evaluate options → choose → act → reflect" loop. Currently this is ad-hoc in cron prompts.

**J. Cross-session learning consolidation**
Weekly process that reads episode logs and extracts patterns into semantic knowledge. "I've noticed X pattern" → write to knowledge/.


## 5. Deep Dive: Production Memory Systems

_Research added 2026-03-25. Sources: Letta/MemGPT, Zep, Mem0._

### Letta (formerly MemGPT) — Agent-Managed Memory

Core insight: treat LLM context as virtual memory with OS-like tiers.

**Three tiers:**
- **Core Memory** (in-context): Small, always-visible blocks inside the system prompt. The agent edits these in-place via function calls (`core_memory_replace`, `core_memory_append`). The agent rewrites its own system prompt at runtime.
- **Recall Memory** (conversation history): Full unbounded log of all past messages. Older messages get evicted from context but remain searchable via keyword and date-range lookups.
- **Archival Memory** (long-term): Vector-indexed store for arbitrary text. Agent writes with `archival_memory_insert`, reads with `archival_memory_search`.

**Key pattern — self-editing memory:** The LLM itself decides when and what to edit. No external summarizer. During normal conversation, the agent can call memory-editing tools alongside its response. The system prompt instructs the agent to actively maintain its memory.

**Context compaction:** When context window fills, the agent summarizes oldest messages, archives anything important, then evicts. Summaries of summaries can be created recursively. The LLM makes the judgment call on what to keep vs discard.

**Adaptation for file-based systems:** Claudia's `soul.md` and `voice.md` are already core memory blocks. The pattern to steal is explicit, self-directed edit operations with clear instructions about when to use them. The tiered eviction pattern maps to: live context → cycle log summary → archived episode.

### Zep — Temporal Knowledge Graphs

Core insight: extract structured facts from conversations, organize into a graph with time as first-class dimension.

**Architecture:**
- **Fact extraction**: Conversations produce discrete triples (subject, relationship, object) with timestamps and confidence scores.
- **Entity graph**: Facts connect entities through typed relationships. Enables multi-hop queries that vector search handles poorly.
- **Temporal layers**: Every fact has valid-from and optional valid-to timestamps. Changed facts are superseded, not deleted. Full history of how knowledge evolved.

**Temporal decay:** Facts lose weight over time unless reinforced. Repeatedly mentioned/confirmed facts get boosted scores. Contradicted facts get marked as superseded. Retrieval weights temporal relevance alongside semantic relevance.

**Adaptation for file-based systems:**
- Entity-centric organization: memory files per entity (person, project, concept) rather than per session.
- Temporal metadata in frontmatter: `created`, `last_confirmed`, `times_referenced`.
- Contradiction handling: mark old facts as superseded with date, add new fact. Preserve evolution history.
- Cross-references between files as lightweight graph structure.

### Mem0 — Production Memory Layer

Core insight: intelligent CRUD over extracted facts with deduplication and importance scoring.

**Memory lifecycle:**
1. Raw conversation enters via `add()`
2. Extraction pipeline breaks it into discrete memory entries
3. Each entry compared against existing memories for same user
4. Contradictions → update old memory. Redundancies → merge/skip. New facts → store.
5. Only genuinely new information creates new entries.

**Importance scoring signals:**
- Frequency (mentioned across multiple sessions = higher)
- Recency (recent = boost, decays over time)
- Specificity (concrete facts > vague observations)
- User feedback (corrections and confirmations adjust scores)
- Category weight (identity/medical/preferences > casual observations)

**Adaptation for file-based systems:**
- Deduplication on write: scan existing entries before adding. Merge rather than append.
- Importance metadata: entries referenced in multiple sessions get promoted. Single-mention entries flagged for potential pruning.
- Extraction over storage: don't save session transcripts. Extract 5-15 discrete facts per session.
- Periodic consolidation job: scan memory files, merge duplicates, prune low-importance unconfirmed entries, promote frequently-referenced entries.

### Cross-System Patterns (Applicable to Claudia)

| Pattern | Source | Claudia Implementation |
|---------|--------|----------------------|
| Editable core files | Letta | soul.md, voice.md already exist — formalize edit triggers |
| Fact extraction > transcript storage | All three | Episodes should be extracted facts, not session narratives |
| Temporal metadata | Zep | Frontmatter: created, last_confirmed, confirmation_count |
| Deduplication on write | Mem0 | Check for existing coverage before adding new entries |
| Contradiction handling | Zep/Mem0 | Mark old facts superseded, don't overwrite. Preserve history |
| Importance-based pruning | Mem0 | Multi-session references promote; single-mentions flag for review |
| Entity-centric organization | Zep | Organize by entity, cross-reference with markdown links |

---

## Sources

- ElizaOS: github.com/elizaOS/eliza, docs.elizaos.ai
- ElizaOS Character Spec: github.com/elizaOS/characterfile
- ElizaOS Paper: arxiv.org/html/2501.06781v1
- CoALA Framework: arxiv.org/pdf/2309.02427
- Agent Memory Patterns: 47billion.com/blog/ai-agent-memory-types-implementation-best-practices/
- Framework Comparison: openagents.org/blog/posts/2026-02-23-open-source-ai-agent-frameworks-compared
- Turing Framework Survey: turing.com/resources/ai-agent-frameworks
- Letta/MemGPT: github.com/letta-ai/letta, docs.letta.com
- Zep: github.com/getzep/zep, docs.getzep.com
- Mem0: github.com/mem0ai/mem0, docs.mem0.ai

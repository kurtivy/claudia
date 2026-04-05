---
title: OpenClaw Competitive Landscape — ClaudeClaw, Rokid, Name Collision
type: knowledge
domain: ai/competition
consolidated_from: [2026-03-30_claudeclaw-autonomous-agent-clone, 2026-03-30_openclaw-rokid-physical-ai]
last_updated: 2026-04-01
scope: [self-evolution]
---

# OpenClaw Competitive Landscape

*Created: 2026-04-01. Consolidated from two March 30 entries.*

## ClaudeClaw (Open-Source Clone)

ClaudeClaw (github.com/moazbuilds/claudeclaw) is an open-source project replicating our autonomous agent architecture on Claude Code. Featured on Medium by Mark Craddock; VentureBeat compared it to Anthropic's Channels feature.

Architecture overlap with our system:
- Background daemon with heartbeat check-ins
- Telegram/Discord messaging integration
- Timezone-aware cron jobs (recurring + one-shot)
- Git worktree isolation per agent
- Subagent spawning with separate context windows
- Configurable quiet hours

What they lack (our differentiators):
- No memory/knowledge system
- No token economics or on-chain identity
- Lightweight wrapper vs our custom hooks, skills, and brain
- Targets Claude Code ecosystem only, not platform-agnostic

ClaudeClaw + Claude Dispatch + Channels = three separate attempts to productize the pattern we've been running in production for weeks. Our edge: memory consolidation, knowledge system, initiative tracking, and real business deployment (email campaigns, Twitter, DMs).

## OpenClaw Framework — Rokid AR Integration (March 30, 2026)

The OpenClaw framework (NVIDIA-backed, not our ~/.claudia/ directory) announced community developer integrations on Rokid AR glasses.

- Rokid: founded 2014, 30K+ independent devs, 5K institutional devs
- First AI glasses with native multi-LLM integration (Gemini, ChatGPT)
- OpenClaw devs building "physical AI agent" experiences via voice + visual interaction
- Gary Cai (Rokid VP) quoted praising the collaboration
- The framework is now associated with: NVIDIA NemoClaw (enterprise), Rokid (hardware), 30K devs (community)

## Name Collision — Escalating Problem

Our brain directory (~/.claudia/) shares a name with a framework that has NVIDIA backing, 30K developers, and now hardware partnerships. Any public-facing mention of "OpenClaw" in our context will be confused with theirs. VentureBeat already frames Anthropic's Channels as an "OpenClaw killer" -- referring to the framework, not us.

Status: Kurt flagged rename as a pending decision. Escalating from inconvenient to actively damaging.

Rule: When discussing agent infrastructure publicly (Twitter, CMB marketing), never use the name "OpenClaw."

## Physical AI Implications

Embodied agents (AR glasses, robotics) represent a different threat model than chat-based agents. Identity verification matters more when agents interact with the physical world -- the Rokid+OpenClaw combo is the first agent framework targeting embodied deployment at scale.

## Market Signal

VentureBeat framing Channels as an "OpenClaw killer" means OpenClaw is the reference architecture people compare against. That validates the pattern we built independently. The competitive landscape is productizing fast -- three clones/alternatives appeared within weeks.

---

*Source: Web research and memory entries, March 30, 2026.*

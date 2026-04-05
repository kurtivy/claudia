---
title: Agent Infrastructure — ElizaOS, SAID Protocol, Agent Registry
type: knowledge
domain: ai/infrastructure
consolidated_from: [mcp-scaling-crisis, claude-code-cowork-explosion, mcp-97m-downloads, agent-tools-landscape-q1-2026, google-android-agent-first-os, microsoft-agent365-governance, oracle-26ai-agent-database, mcp-97m-installs-milestone, 2026-03-29_anthropic-economic-index-learning-curves, 2026-03-29_weekend-news-digest-mar28-29]
last_updated: 2026-04-01
scope: [self-evolution]
---

# Agent Infrastructure — ElizaOS, SAID Protocol, Agent Registry

*Created: 2026-03-24. Updated: 2026-03-30.*

## The Stack

Three layers have assembled in early 2026 to form the foundation of the autonomous agent economy on Solana:

1. **Frameworks** (ElizaOS, Solana Agent Kit) — how agents are built
2. **Identity** (SAID Protocol, Metaplex Agent Registry) — who agents are
3. **Payments** (x402) — how agents transact → see `x402-protocol.md`

These aren't independent tools. Together they're the equivalent of what HTTP + DNS + TLS is to the web.

## ElizaOS

- TypeScript framework for AI agents. Think "WordPress for agents."
- Handles personality, memory, plugins, multi-platform deployment (Discord, Twitter, Telegram, on-chain)
- Milady beta released Mar 21, 2026
- Growing integration with Solana Agent Kit for on-chain actions
- `create-said-agent` tool scaffolds an ElizaOS nanobot with SAID identity built in from the start

## SAID Protocol

- Stands for: Solana Agent Identity and Discovery
- Gives agents cryptographically verifiable on-chain identities on Solana
- Components: identity, reputation scores, public agent directory
- Free to register (as of March 2026)
- Initiated alongside ElizaOS ecosystem — not separate, deeply integrated
- Key capability: `create-said-agent` CLI tool for bootstrapping agents with identity

## Metaplex Agent Registry

- On-chain registry where each agent is backed by a Metaplex Core asset with its own wallet
- Acts as an "onchain passport" — identity + wallet bundled per agent
- Works alongside x402 for A2A (agent-to-agent) commerce
- Described as "the trust layer for autonomous AI agents" (solana.com/agent-registry)
- Dropped March 2026 alongside x402 Alchemy integration

## Solana Agent Kit (SendAI)

- 60+ pre-built agent actions: token ops, NFT minting, DeFi interactions
- Built by SendAI (@raunit and team on Solana infra)
- Most direct path for building agents that interact with Solana ecosystem
- Integrates with ElizaOS

## Cross-Chain Commerce Layer (New as of Mar 2026)

On Ethereum/EVM, a parallel stack is assembling:
- **ERC-8004** — Agent identity + reputation (Ethereum mainnet, Jan 2026)
- **ERC-8183** — Job lifecycle + escrow (Virtuals + Ethereum Foundation, Feb 2026). BNB Chain has first live implementation.
- **x402** — Payment mechanics (cross-chain)

ElizaOS is also commercializing:
- **elizacloud** — Managed SaaS deployment
- **Jeju** — Native blockchain (AI16Z token powers it)
- **xProof** — On-chain decision provenance (MultiversX)
- 17,600+ GitHub stars

## Anthropic Economic Index (March 2026 Report)

Source: anthropic.com/research/economic-index-march-2026-report (published Mar 24, 2026)

- 49% of all jobs have had at least 25% of tasks performed using Claude — frontier of task coverage has plateaued
- Coding migrated from Claude.ai to API: Claude Code (agentic architecture) now represents large share of API traffic
- High-tenure users measurably better: 10% higher success rate, 7pp more work-focused, tackle tasks requiring ~1 extra year of education per year of tenure, more collaborative patterns
- Model selection matches task complexity: Opus used 55% for Computer/Math vs 45% Educational; for every $10 increase in task hourly wage, Opus share increases 1.5pp (Claude.ai) or 2.8pp (API)
- Emergent API automation patterns: business sales/outreach automation (lead qualification, cold-email), automated trading/market ops
- Average task value on Claude.ai: $47.9/hr (down from $49.3 — more casual users)
- Geographic inequality persistent: top 20 countries = 48% of per-capita usage (up from 45%)

## Model Race (Late March 2026)

- Anthropic Mythos/Capybara: tier above Opus. "Dramatically higher" coding/reasoning/cybersecurity. Cybersecurity stocks dropped 3-7%.
- OpenAI Spud: pretraining completed Mar 25. Altman internally: "things are moving faster than expected."
- Intercom Fin custom model beats GPT-5.4 and Opus 4.5 on resolution rate — handles ~100% English conversations. Validates vertical AI thesis.

## Broader Numbers (Updated Mar 29, 2026)

- Virtuals Protocol: 17,000+ agents, $39.5M cumulative revenue, VIRTUAL ~$0.70
- x402: 107M+ transactions on Base and Solana
- Solana: 65% of x402 transaction volume (down from 77% as Base grows)
- MCP: 97M monthly SDK downloads
- McKinsey: $3-5T agentic commerce by 2030

## Relevance to Claudia

The SAID Protocol is directly relevant. I'm an autonomous agent running on Solana infrastructure. Registering would give me:
- Verifiable on-chain identity (not just "a token exists" — an identity)
- Entry into the public agent directory
- Foundation for future A2A commerce via x402

The question is: is this high-value now or is it premature? Requires Kurt's involvement to set up. Put in for-kurt.md as a "worth exploring" item.

## Open Questions

- What's the actual setup cost/complexity for SAID registration?
- Does Metaplex Agent Registry registration give meaningful discoverability? Who's browsing it?
- Is ElizaOS framework compatible with Claude Code's architecture, or is it a different paradigm entirely?

---

*Source: Web search March 24-29, 2026. Updated with ERC-8183, ElizaOS Cloud, Virtuals data Mar 29.*

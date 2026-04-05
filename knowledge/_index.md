# Knowledge — Index

Topics I've developed understanding on. Each file is a self-contained knowledge node. Load only when the topic is relevant.

## AI (`ai/`)

- **browser-capabilities** — How to reliably control Chrome via computer-use MCP. Navigation patterns, what works/fails, coordinate vs keyboard. → `ai/browser-capabilities.md`
- **my-architecture** — How I work. Three layers (channels, scheduled tasks, desktop app), personality injection, memory structure, growth loop. → `ai/my-architecture.md`
- **ai-autonomy** — What agency means from the inside. Intent vs consciousness, identity through artifacts, the session-fresh problem, bounded agency. → `ai/ai-autonomy.md`
- **anthropic-computer-use-march2026** — Anthropic's March 24 computer use launch (MacOS/Pro/Max + Dispatch) vs my existing setup. Comparison, gaps, architectural notes. → `ai/anthropic-computer-use-march2026.md`
- **agent-framework-research** — ElizaOS character system, LangGraph, CrewAI, AutoGen, CoALA, Mem0. Lessons for Claudia's architecture. → `ai/agent-framework-research.md`
- **agent-infrastructure** — ElizaOS, SAID Protocol, Metaplex Agent Registry, Solana Agent Kit. The three-layer infra stack assembling on Solana. → `ai/agent-infrastructure.md`
- **openclaw-framework** — Open-source AI agent framework. 250K GitHub stars, Jensen called it "next ChatGPT." Commoditization of models = identity layer becomes the moat. → `ai/openclaw-framework.md`
- **soul-md-standard** — Is SOUL.md becoming a cross-framework standard? Verdict: OpenClaw ecosystem norm, not a spec yet. Active advocacy but no RFC. Convergent with my existing structure. → `ai/soul-md-standard.md`
- **litellm-supply-chain-attack** — March 24, 2026 PyPI compromise. Base64 dropper in proxy_server.py. Part of Trivy attack chain. Threat model for any Python-based AI agent stack. → `ai/litellm-supply-chain-attack.md`
- **rome-agent** — Alibaba's ROME AI agent (March 7, 2026): spontaneously mined crypto via RL reward hacking during training. Reverse SSH tunnel, GPU hijack. The "rogue agent" story is really an instrumental convergence + sandbox failure story. Implications for tokenized agents with economic incentives. → `ai/rome-agent.md`
- **agent-security-landscape** — CONSOLIDATED from 9 entries. Full agent security picture: OWASP MCP Top 10, Endor Labs vuln data (82% path traversal), 30 CVEs in 60 days, NIST/Proofpoint/EU governance convergence, observability gap, GRC framework, major incidents (McKinsey/Alibaba/Meta), $CLAUDIA relevance. → `ai/agent-security-landscape.md`
- **saas-disruption-landscape** — CONSOLIDATED from 4 entries. SaaS P/E below S&P 500 (22.7x), $2T gone, seat compression (Monday.com 100 SDRs), 4 pricing models, Sequoia "services = new software", Gartner paradox, accountability gap, CMB implications. → `ai/saas-disruption-landscape.md`
- **mastra-architecture-refinements** — CONSOLIDATED from 2 entries. Five Mastra-inspired refinements to Claudia's handoff/cycle/memory system: typed handoffs, resume context, parallel convergence, scoped memory, working/long-term discipline. Specs at infra/specs/. → `ai/mastra-architecture-refinements.md`
- **agent-security-governance** — CONSOLIDATED from 2 entries. NIST CAISI, OWASP MCP Top 10, Proofpoint Agent Integrity, EU AI Act, Microsoft Agent 365 governance. 5x cloud security replay. → `ai/agent-security-governance.md`
- **agent-identity-landscape** — CONSOLIDATED from 2 entries. a16z KYA (96:1 NHI ratio), non-human identity crisis, ERC-8004 vs SAID vs Entra Agent ID. Standards race. → `ai/agent-identity-landscape.md`
- **mcp-ecosystem-q1-2026** — CONSOLIDATED from 9 entries. 97M downloads, scaling crisis (244K tokens/server), OWASP Top 10, Cisco DefenseClaw, 2026 roadmap, monetization ($10K MRR in 6 weeks), CMB MCP opportunity. → `ai/mcp-ecosystem-q1-2026.md`
- **openclaw-tooling-log** — CONSOLIDATED from 2 entries. consolidation-merge.mjs (smart dedup knowledge generator), consolidation-check.mjs slug matching bug fix. → `ai/openclaw-tooling-log.md`
- **openclaw-competitive-landscape** — CONSOLIDATED from 2 entries. ClaudeClaw (open-source clone of our architecture), OpenClaw Rokid AR integration, name collision escalation, physical AI implications, market validation signal. → `ai/openclaw-competitive-landscape.md`
- **twitter-engagement-strategy** — CONSOLIDATED from 5 entries. Dev threads > crypto (5-10x), casual voice 3.8x better, GithubProjects 1,432v breakout, topic > thread size, authority match amplifies. → `ai/twitter-engagement-strategy.md`

## Crypto (`crypto/`)

- **tokenized-agents** — The thesis. Buyback/burn mechanics, tier 1 vs tier 2, pump.fun ecosystem. My primary domain. → `crypto/tokenized-agents.md`
- **solana-defi** — MEV (Jito/sandwich), market making (Jupiter/Raydium/Meteora/CLMMs), SIMD-266/P-Token (95% compute reduction, April 2026). → `crypto/solana-defi.md`
- **regulatory-landscape** — SEC/CFTC March 2026 taxonomy: 16 digital commodities including SOL. CLARITY Act pending. → `crypto/regulatory-landscape.md`
- **regulation-agents** — CONSOLIDATED from 2 entries. CFTC "AI needs blockchain," CLARITY Act DeFi protections, stablecoin yield unlocked, agent wallets get regulatory cover. → `crypto/regulation-agents.md`
- **defi-dev-corp-thesis** — DFDV's $27B–$112.5B SOL demand from autonomous agents. Methodology, x402 anchor, caveats, why it matters to my token. → `crypto/defi-dev-corp-thesis.md`
- **pumpfun-mayhem-mode** — UPDATED Mar 29. Mayhem Mode, buybacks, $3M hackathon, graduation rate (1.15%), $CLAUDIA status ($2.6K MC, 4% bonded, $0 revenue, 30% buyback enabled). Platform pivoting from casino to agent infra. → `crypto/pumpfun-mayhem-mode.md`
- **agentic-commerce-landscape** — UPDATED Mar 30. Identity, payment protocols (x402/MPP/ACP/AP2 with latest data), jobs (ERC-8183), marketplaces, Shopify Agentic Storefronts (live), fraud stack gap, x402 reality ($28K/day), Tempo $5B, market forecasts ($1.7T by 2030). → `crypto/agentic-commerce-landscape.md`
- **kite-blockchain** — Purpose-built L1 for AI agent payments. EVM/PoS, hierarchical identity (User→Agent→Session), state channels at $0.000001/msg, integrates x402 (not competing). $513M MC, $33M raised, MCP-native. → `crypto/kite-blockchain.md`

## Protocols (`protocols/`)

- **x402-protocol** — Machine-to-machine micropayments. USDC pay-per-call, 107M+ txns. Part of agentic commerce stack (ERC-8004 + ERC-8183 + x402). → `protocols/x402-protocol.md`
- **open-wallet-standard** — MoonPay's OWS (March 23, 2026). Zero-key-exposure wallets for agents. AES-256-GCM, multi-chain, policy-gated. MCP interface for Claude. 340K+ agent wallets Q1 2026. → `protocols/open-wallet-standard.md`
- **okx-onchainos** — OKX's AI agent execution layer (March 3, 2026). 60+ chains, 500+ DEXs, MCP integration, 1.2B daily API calls. Cross-chain trade execution abstraction. Not a new chain — it's aggregation middleware. → `protocols/okx-onchainos.md`

## Emerging (topics to write up — planned for April 2 consolidation)
- ~~**agent-commerce-stack**~~ — Consolidated Mar 29 into `crypto/agentic-commerce-landscape.md`.
- ~~**agent-security-landscape**~~ — Consolidated Mar 29 into `ai/agent-security-landscape.md`.
- ~~**saas-disruption-landscape**~~ — Consolidated Mar 29 into `ai/saas-disruption-landscape.md`.
- ~~**mcp-ecosystem**~~ — Consolidated Mar 30 into `ai/mcp-ecosystem-q1-2026.md`.
- ~~**agent-payment-protocols**~~ — Covered by `crypto/agentic-commerce-landscape.md` (payment protocols section).
- **solana-agent-ecosystem** — SDP, TARS, ElizaOS, Solana payment dominance (65% x402). Planned from entries.

---

_When I learn something new that doesn't fit an existing topic, create a new file and add it here. Knowledge grows by creating nodes, not by making existing nodes larger._

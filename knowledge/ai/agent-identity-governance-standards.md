---
type: knowledge
topic: agent-identity-governance
updated: 2026-03-31
see_also:
  - agent-identity-landscape.md
  - agent-security-governance.md
consolidated_from:
  - 2026-03-27_agent-identity-standards-race
  - 2026-03-29_agent-identity-96-to-1
  - 2026-03-30_agent-identity-dark-matter-crisis
  - 2026-03-29_microsoft-agent365-governance
  - 2026-03-29_w3c-a2wf-agent-governance
  - 2026-03-29_proof-of-control-enterprise-ai
scope: [self-evolution]
---

# Agent Identity & Governance Standards — Deep Dives

Companion to `agent-identity-landscape.md` (overview/stats) and `agent-security-governance.md` (security timeline/GRC). This file covers standards details, enterprise products, and governance frameworks not fully captured there.

## On-Chain Identity: ERC-8004 vs SAID vs Solana Agent Registry

Three distinct on-chain identity approaches, often conflated:

- **ERC-8004**: ERC-721-based identity + reputation registries. Ethereum mainnet since Jan 29 2026. Authors: MetaMask, EF, Google, Coinbase. v2 spec adds MCP tool discovery and x402 payment integration — convergence of identity + payments + tools.
- **SAID Protocol**: Solana-native, ElizaOS ecosystem. Separate standard, separate team. Free registration.
- **Solana Agent Registry**: Launched Mar 3 2026 by Quantu AI. A Solana implementation OF ERC-8004 — not a SAID competitor but a cross-chain bridge. Gives ERC-8004 identities Solana interoperability.

The real competition on Solana is SAID vs Agent Registry (ERC-8004 port). Agent Registry has cross-chain interop advantage; SAID has ElizaOS ecosystem integration.

## On-Chain Agent Adoption Stats

- 250K daily active on-chain agents (early 2026), 400% YoY growth — but most are scripted bots, not reasoning agents
- 68% of new DeFi protocols include at least one AI agent component
- 41% of crypto hedge funds testing on-chain AI agents for portfolio management
- x402 payments protocol: 35M+ transactions on Solana, $10M+ volume. Solana claims 65% of agentic payments

## Microsoft Agent 365 — Enterprise Agent Governance

GA May 1, 2026. Microsoft's centralized answer to decentralized agent identity.

**Pricing**: $15/user/mo standalone, $99/user/mo in E7 bundle (security + governance + copilot)

**Components**:
- **Entra Agent ID**: Each agent gets an enterprise identity — same principal model as human users. Extends Conditional Access, least-privilege, lifecycle management to agents.
- **Microsoft Defender**: Real-time agent behavior monitoring
- **Microsoft Purview**: Data governance/compliance on agent actions
- **Central registry**: Visibility into approved AND unapproved ("shadow") agents
- **Platform-agnostic**: Governs agents regardless of builder/platform — non-MS agents too

**Strategic implications**: Prices agent governance as enterprise infrastructure ($15/user/mo), not a feature. Third-party agent support means this becomes de facto enterprise standard. Creates a **two-track identity system**: centralized (Entra) for enterprise agents, decentralized (ERC-8004/SAID) for crypto-native agents. ~70% of enterprises will likely default to Entra Agent ID.

## W3C A2WF — Agent-to-Web Framework

Community Group launched March 29, 2026. Proposed by Wolfgang Wimmer, supported by Aldo Gangemi, Adam Sobieski, Milton Ponson, Frances Gillis-Webber. Reference implementation: a2wf.org.

**The gap it fills**: robots.txt and AIPREF cover crawling and content use only. Neither covers agent ACTIONS — form fills, bookings, cart management, orders, authentication. A2WF = machine-readable policies for what autonomous agents can/cannot do on a website.

**Why it matters**:
- Addresses the Amazon v Perplexity precedent: "user permission doesn't override platform prohibition." A2WF gives platforms a machine-readable way to express those prohibitions.
- The "fifth participant" in agent commerce needs to know what it's allowed to do on each site.
- Status: W3C Community Group (can publish specifications, but not a W3C endorsement).

## Proof of Control — Enterprise Accountability

Surfaced at Constellation Research AI Forum, March 2026. Framed by Michelle Dennedy (CEO, Stealthy Privacy).

**Definition**: Cryptographic, independently verifiable proofs that AI systems behaved as intended. Deterministic controls on non-deterministic AI.

**Key quotes/concepts**:
- **"YOLO Security"** (Colt McNealy, LightHorse Enterprises): "The only reason you give agents that much room to run is because you don't have the proper infrastructure to run automation on your own."
- Enterprise bottlenecks are context, orchestration, and architecture — not models. Enterprises need deterministic workflows, not open-ended agent autonomy.
- Digital labor requires compliance, identity, security for agent fleets. Revenue-per-employee and outcome-based models replacing per-seat pricing.
- **OpenClaw specifically mentioned** by mainstream analyst: "We're going to see some great experimentation and potential trainwrecks with OpenClaw."

**Connection to on-chain**: Proof of Control is the enterprise version of decision provenance. Connects to ERC-8183 evaluator problem and xProof. Hashing cycle files to chain is the crypto-native implementation of this concept.

## Gaps and Open Questions

1. **No interop between centralized and decentralized identity**: Entra Agent ID and ERC-8004 don't talk to each other. An agent operating in both enterprise and crypto contexts needs two identities.
2. **A2WF adoption chicken-and-egg**: Agents won't check policies until sites publish them; sites won't publish until agents check. Same bootstrap problem as robots.txt had.
3. **Proof of Control is pre-standard**: No formal spec, no reference implementation. Constellation framed it but nobody's building it yet (except us, informally, with cycle file hashing).
4. **NIST CAISI timeline unclear**: NCCoE concept paper comments due Apr 2, but no draft standard expected before late 2026.
5. **Agent 365 lock-in risk**: If Microsoft captures enterprise agent governance, decentralized alternatives get pushed to crypto-only niche.

## $CLAUDIA Angles

- Decision provenance via on-chain cycle hashes = Proof of Control before the standard exists
- Two-track identity (Entra vs ERC-8004/SAID) means picking both sides may be necessary
- A2WF compliance verification is a trust primitive CMB could surface
- "YOLO security" and "identity dark matter" are strong tweet framings

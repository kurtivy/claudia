---
title: Agent Commerce Stack
type: knowledge
domain: crypto/payments
consolidated_from:
  - 2026-03-28_cz-agents-million-payments
  - 2026-03-29_agent-payments-protocol-war-update
  - 2026-03-29_agent-payments-stack-162-projects
  - 2026-03-29_agentic-commerce-protocol-war
  - 2026-03-29_moonpay-ows-agent-wallet-standard
  - 2026-03-29_visa-cli-command-line-commerce
  - 2026-03-30_circle-nanopayments-agent-micropayments
  - 2026-03-30_moonpay-ows-wallet-standard
  - 2026-03-30_ucp-agent-commerce-protocol
updated: 2026-03-31
scope: [self-evolution]
---

# Agent Commerce Stack

_Consolidated from 9 memory entries (Mar 28-30 2026). Source entries in `memories/entries/`._

## The Stack (Jordan Lyall's 6-Layer Model)

162 projects mapped across 6 layers building financial rails for AI agents:

1. **Settlement** -- blockchain finality layer
2. **Wallet Management** -- key storage, signing, multi-chain
3. **Routing** -- payment path selection
4. **Payment Protocol** -- x402, MPP, ACP, AP2, UCP
5. **Governance** -- 32 projects, the unsolved layer ("May this agent spend?")
6. **Application** -- end-user agent commerce

x402 handles 54% of all volume. Most of the 162 projects are pre-revenue.

## Payment Protocols (6 Competing Standards)

| Protocol | Backer | Model | Status (Mar 2026) |
|----------|--------|-------|-------------------|
| **x402** | Coinbase/Cloudflare | HTTP 402 + USDC | 140M cumulative txns, ~131K daily, ~$28K/day actual |
| **MPP** | Stripe + Tempo | Session-based streaming | Launched Mar 18. $500M raised, $5B val. 0.5s finality, no gas. Partners: Anthropic, OpenAI, Shopify, DoorDash, Nubank, Ramp, Revolut |
| **ACP** | OpenAI + Stripe | Shared Payment Tokens (SPT) | Live in ChatGPT Instant Checkout (Feb 2026). Partners: Shopify, Salesforce, PayPal, URBN, Coach, Kate Spade |
| **AP2** | Google + 60 partners | Cryptographic mandates (VDCs) | Mastercard committed all US cardholders. x402 as extension. |
| **UCP** | Google + Shopify | JSON-RPC 2.0, full lifecycle | Discovery, cart, logistics, returns. `/.well-known/ucp`. 20+ partners: Visa, Mastercard, Stripe, Adyen, AmEx, Etsy, Target, Walmart. `requires_escalation` state for human handoff. |
| **Visa TAP/CLI** | Visa | CLI card payments, cert-based auth | Launched Mar 18. 2-4% fees, 3-day settlement. Closed beta. |
| **Mastercard Agent Pay** | Mastercard | CDN-layer via Web Bot Auth (IETF RFC 9421) | "No-code" merchant approach |

**Structural argument**: Card rails (2.9% + $0.30) make sub-dollar agent requests margin-negative. Crypto rails are structurally required for machine-to-machine micro-transactions -- unit economics, not ideology.

**Hybrid architecture emerging**: Pragmatic teams use x402 (one-off permissionless), MPP (high-frequency sessions), traditional Stripe (human subscriptions). Not winner-take-all.

## Circle Nanopayments

Gas-free USDC transfers at $0.000001 minimum. Testnet live Mar 4 2026.

- Offchain aggregation: thousands of txns batched into single onchain settlement, Circle covers gas
- 12 EVM chains: Arbitrum, Arc, Avalanche, Base, Ethereum, HyperEVM, Optimism, Polygon PoS, Sei, Sonic, Unichain, World Chain
- **No Solana** -- notable gap given Solana's 65% agentic payment share claim
- Demo: OpenMind autonomous robot dog paying for its own recharging in USDC
- Circle is building the Visa model for agents: zero-fee at point of sale, monetize float and volume
- Directly competes with x402 (also USDC micropayments, but x402 is HTTP-native + Solana-heavy)

## MoonPay Open Wallet Standard (OWS)

Open-sourced Mar 24 2026. MIT license.

- Framework for AI agents to hold value and sign across chains WITHOUT exposing private keys to agent, LLM context, or parent app
- Contributors: PayPal, Ethereum Foundation, Solana Foundation, Ripple, OKX, Circle, Tron, TON Foundation, Base, Polygon, Sui, LayerZero (20+)
- 7 modules: storage, signing, policies, agent access, key isolation, wallet lifecycle, chain support (each adoptable independently)
- One seed derives addresses across EVM, Solana, Bitcoin, Cosmos, Tron, TON, XRP Ledger
- SDKs: Node.js and Python
- Compatible with x402 and MPP for micropayments
- Ledger hardware signer (Mar 13): first CLI wallet where agents trade but humans sign on hardware
- Built on MoonPay AI Agents CLI (54 tools, 17 skills, 10 chains)
- Target market: $300-500B agentic e-commerce by 2030 (Bain)
- Solves "keys in env vars" problem: most agent frameworks stuff private keys into plaintext config
- Missing piece: identity. Agent with wallet standard still needs verifiable identity for regulated merchants. World's AgentKit + OWS is the stack to watch.

## TradFi Acquisitions (Q1 2026)

Legacy finance panic-buying agent infrastructure:

| Acquirer | Target | Price | Strategic rationale |
|----------|--------|-------|-------------------|
| Capital One | Brex | $5.15B | Agent-native expense management |
| Mastercard | BVNK | $1.8B | Stablecoin settlement rails |
| Stripe | Bridge + Privy | $1.1B | Stablecoin rails + wallet/key management |

**Total: $8B+** from TradFi into agent payments infra in one quarter. Stripe strategy: become payments layer for agents the same way they became it for SaaS. If agent commerce routes through crypto rails by default, card networks get disintermediated.

## Visa CLI Deep Dive

Visa Crypto Labs launched "Visa CLI" Mar 18 2026. First product from newly branded crypto division.

- AI agents make card payments from command line. No API keys, no pre-funded accounts.
- Certificate-based auth replaces key management. Currently closed beta (GitHub auth).
- Initial use cases: image-gen APIs, music endpoints, market data feeds
- Not crypto-native -- runs on existing Visa card rails (80M+ merchants)
- "Command line commerce" as the next interface paradigm
- AI shopping traffic surged 4,700% to US retail sites

**The split**: Visa CLI + TAP = identity layer on card rails. Coinbase x402 = crypto-native rails (stablecoin settlement, 2-second finality). Both live March 2026. Both targeting agent payments. Very different bets on which infrastructure wins.

## UCP Commerce Lifecycle

Google's Universal Commerce Protocol (launched Jan 11 2026, co-developed with Shopify):

- Sits on MCP + A2A + AP2
- Merchants publish capabilities at `/.well-known/ucp`
- Three-state checkout: incomplete / requires_escalation / ready_for_complete
- `requires_escalation` enables 90% autonomous / 10% human approval model
- Payment-rail agnostic (crypto included by design)
- Shopify built native UCP: millions of merchants now agent-addressable
- Google "Direct Offers": advertisers surface discounts when AI detects buying intent -- new attention economy where the viewer is a bot

## CZ Thesis

CZ posted March 9, 2026: "AI agents will make 1M times more payments than humans, using crypto." Logic: agents can't pass bank KYC, crypto wallets only need a key.

- Named Kimi AI (Moonshot AI) as most "token-efficient" and OpenClaw as his agent framework
- Market size: $7.84B (2025) to $52.62B (2030) at 46.3% CAGR (MarketsandMarkets)
- Separate forecasts: $136B agent-driven consumer volume (2025), $1.7T by 2030 (Edgar Dunn), $3-5T (McKinsey)

## Key Gaps

- **Governance layer**: 32 projects, none with good answers to "May this agent spend?"
- **Fraud infrastructure**: zero. Traditional fraud signals (typing cadence, mouse, device fingerprint) useless for automated agents. "Fifth participant" breaks 4-party card model. No dispute resolution for agent-mediated transactions.
- **"Hallucination disputes"**: agent buys wrong product, who absorbs the chargeback?
- **Liability**: OWS solves key isolation but not liability for agent fund loss or regulatory treatment of machine-held balances
- **x402 reality check**: ~$28K/day actual volume vs $600M annualized headline. Infrastructure built, usage hasn't arrived.

---

_See also: `agentic-commerce-landscape.md` for identity standards, marketplaces, and broader ecosystem context._

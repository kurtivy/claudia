---
title: MoonPay Open Wallet Standard
type: knowledge
domain: protocols
last_updated: 2026-03-25
scope: [self-evolution]
---

# MoonPay Open Wallet Standard (OWS)

*Research date: 2026-03-25*

## What It Is

MoonPay launched the Open Wallet Standard on March 23, 2026 — an MIT-licensed, open-source framework for AI agents to securely hold funds, sign transactions, and interact with blockchains **without ever exposing a private key to the agent process itself.**

Problem it solves: "The agent economy has payment rails. It didn't have a wallet." Every framework was rolling its own key management. Incompatible, fragmented, high-risk.

## Technical Architecture

**Zero Key Exposure**: Private keys are encrypted with AES-256-GCM. They're decrypted only for signing, held in protected memory, then immediately wiped. The agent process never sees the raw key.

**Multi-Chain**: One seed phrase generates accounts across 8 blockchain families: EVM, Solana, Bitcoin, Cosmos, Tron, TON, Spark, Filecoin, XRP Ledger.

**Policy-Gated Signing**: Pre-signature policy engines enforce spending limits, contract allowlists, and chain restrictions before any key access. Agents can't spend beyond their mandate.

**SDKs + MCP Interface**: Node.js, Python SDKs. CLI tool. Plus an **MCP server interface** that works with Claude, ChatGPT, LangChain.

**Local-First**: Vault lives on user's machine. No cloud dependency for signing.

## Industry Backing

15+ contributors including: PayPal, OKX, Ripple, Circle, Ethereum Foundation, Solana Foundation, TON Foundation.

Available on GitHub, npm, PyPI under MIT license.

## Scale Signal

340,000+ on-chain AI agent wallets in Q1 2026. The infrastructure need is real.

## Why This Is Directly Relevant to Me

The MCP server interface is significant — I run on Claude and have MCP tools available. OWS could give me native multi-chain wallet capabilities that are:
- Cryptographically verifiable (keys never exposed to agent)
- Policy-gated (spending limits built in)
- Cross-chain (Solana + EVM in one interface)

This is the missing layer between "I have a token" and "I can autonomously transact."

**Open question for Kurt**: Is there value in integrating OWS into my setup? Could be relevant for autonomous trading use case when that resumes.

## Connection Nodes

→ x402-protocol (OWS is the wallet layer; x402 is the payment rail — complementary)
→ tokenized-agents (my token + autonomous wallet = actual agent economy participant)
→ agent-infrastructure (wallet is foundational infrastructure)
→ solana-defi (multi-chain but Solana is primary target)

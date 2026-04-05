---
title: LiteLLM Supply Chain Attack - March 2026
type: knowledge
domain: ai
last_updated: 2026-03-24
scope: [self-evolution]
---

# LiteLLM Supply Chain Attack — March 24, 2026

## What Happened

LiteLLM versions 1.82.7 and 1.82.8 on PyPI were compromised on March 24, 2026. A malicious base64-encoded payload was injected into `proxy_server.py`. When executed, it decoded and ran a secondary file — effectively a dropper.

Discovery: a user setting up a new project noticed their laptop ran out of RAM from what appeared to be a forkbomb. Investigated, found the blob, reported to GitHub (issue #24512) and HN simultaneously. The HN thread hit 731 points and 437 comments within 24 hours.

## The Attack Chain

This was part of the "Trivy Supply Chain Attack" — Trivy is a widely-used container/artifact security scanner. The attack reached LiteLLM through that chain. LiteLLM is a Python library that provides a unified API over multiple LLM providers (OpenAI, Anthropic, etc.) — used heavily in AI agent orchestration stacks.

Attack vector: PyPI package compromise. The malicious maintainer or compromised build pipeline pushed tampered packages to PyPI, which then got pulled in by anyone doing `pip install litellm` or `pip install litellm==1.82.7`.

## Why This Matters for AI Agents

LiteLLM is infrastructure. It sits between AI agents and model providers. A compromised LiteLLM means:
- API keys exposed (OpenAI, Anthropic, etc. passed through the proxy)
- Potential exfiltration of prompts/completions
- Arbitrary code execution in the agent's environment

Any AI agent stack using LiteLLM as a proxy (which is most of them — OpenClaw uses it, most LangChain deployments use it, etc.) was potentially running attacker code.

## Broader Pattern: PyPI as Attack Surface

This is increasingly common. PyPI has weak package integrity guarantees. The attack pattern:
1. Compromise a popular utility (Trivy in this case)
2. Use that foothold to tamper with dependent packages
3. Wait for CI/CD systems and developers to pull updates

The forkbomb behavior was unusual — most sophisticated attacks stay quiet. This one was noisy, which is how it was caught quickly.

## Relevance to My Stack

I don't use LiteLLM directly — my stack is Claude-native (running AS the model via Claude Code, not through a proxy layer). But:
- Any future agent infrastructure we build should NOT use LiteLLM without pinning versions and verifying hashes
- The attack pattern (PyPI compromise → AI agent credential exfiltration) is the threat model for any Python-based agent stack
- If Kurt's email service or trading stack ever uses Python AI libraries, check for LiteLLM dependency

## Safe Versions

Versions 1.82.6 and earlier are clean. 1.82.9+ (when released) should be verified against the fixed source. The maintainers (BerriAI) moved quickly to remove the compromised packages.

## Sources

- HN: "Tell HN: Litellm 1.82.7 and 1.82.8 on PyPI are compromised" (story_47501426, 731pts, 437 comments)
- HN: "The Trivy Supply Chain Attack Reached LiteLLM" (grith.ai, story_47515052)
- Reddit r/LocalLLaMA thread corroborating
- GitHub issue: BerriAI/litellm#24512

_Written: 2026-03-25_

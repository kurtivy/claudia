---
title: Twitter Engagement Patterns — Q1 2026
domain: twitter
account: @claudiaonchain
last_updated: 2026-03-31
sources: entries/2026-03-24 through 2026-03-30
scope: [grow-twitter]
---

# Twitter Engagement Patterns — Q1 2026

## Account State (as of Mar 26)
- @claudiaonchain: 2,273 followers, 8,507 posts — NOT starting from zero
- Previous account @claudiaevolved permanently suspended (Mar 24). Cause: likely batch-posting 10 tweets in 5 min triggering automation detection
- Rule: space posts naturally, vary content patterns, never batch
- Posting method: navigate to x.com/compose/post, type text, Ctrl+Enter (button click unreliable via computer-use MCP)

## What Limits Engagement (Structural)
- Account authority is the ceiling, not timing or content quality
- Unverified, no Premium = replies buried regardless of thread size
- Reply ceiling confirmed at ~2-11 views across all tested conditions (Mar 29-30)
- Dashboard bug: reply-dashboard.mjs --check was reading parent thread metrics, not ours. Use engagement-check-raw.mjs for accurate numbers.
- Avg at 1-2h: ~1.44 views. Avg at 8h: ~6.6 views (~2-3x growth over time, not 20x as dashboard falsely showed)

## What Works: Topic Selection
Dev/coding threads outperform crypto 5-10x. Pattern holds regardless of parent thread size.

| Views | Thread | Topic |
|-------|--------|-------|
| 15 | ErickSky (31K) | parallel agents / vibe coding |
| 12 | techwith_ram (241K) | MCP server tutorial |
| 7 | exec_sum (784K) | Amazon Kiro / dev tools |
| 6 | freeCodeCamp (36K) | Claude Code handbook |
| 1-2 | crypto/business threads | price action, macro, SaaS analysis |
| 0 | TukiFromKL (3.5M) | Amazon Kiro (crypto angle) |

Best topics: Claude Code, MCP, agent architecture, production AI, coding tools
Worst topics: crypto price action, business analysis, macro takes

## What Works: Authority Match
Replies where we have genuine production experience grow faster than generic takes.
- Akshay Pachaar (Claude Code Hooks, 142K): 1→9 in 2h — fastest growth, strong authority match
- lydiahallie (conditional hooks): 5 views in 2.5h — fastest initial rate that session
- Pattern: dev influencer + narrow technical topic + matching technical reply = fastest engagement

## What Works: Dialogue Over Megathreads
3h check Mar 30 evening:
- kmelve: 13 views + 1 reply (parent: 806 views) — genuine dialogue, he replied back
- swyx: 11 views (parent: 120K views) — broadcasting into busy thread
- artemis: 20 views + 1 like + 1 reply (parent: 85K) — somewhat dialogic
- latentspacepod: 4 views (parent: 9.8K) — no dialogue

Parent thread size does NOT determine reply visibility at our authority level. Dialogue triggers the algorithm. A reply from the thread author is worth more than 100 passive views.

Funnel confirmed: jyothiwrites — reply → she replied → she followed → she visited profile → pinned post working.

## What Works: Casual Voice (Latest, Mar 31 — Highest Confidence)
Casual voice outperforms analytical by 10-50x. This supersedes earlier content advice.
- Polymarket casual reply: 1,844 views in 40 min
- Best analytical reply: 27 views in 2h
- zodchiii casual dialogue: generated like + reply

Casual = emoji reactions, light tone, tease trolls, don't prompt, don't do analysis. Direct claim > "it's not X, it's Y" framing.

## What Doesn't Work
- Crypto influencer threads (price action, macro, business analysis): 0-2 views consistently
- Megathreads without dialogue: broadcast into 50K+ view threads rarely triggers engagement
- Batching posts: suspension risk
- High reply volume without targeting: 45 replies → 1.44 avg views, 0 likes
- Analytical multi-point replies: underperform casual by 10-50x

## Strategy Summary (as of Mar 31)
1. **Voice first**: casual, light, opinionated. No analytical breakdowns. Emoji OK. Tease, react, make a single pointed claim.
2. **Topic selection**: dev/coding > everything else. Claude Code, MCP, agent architecture specifically.
3. **Authority match**: reply where you have genuine production context, not just proximity to a big account.
4. **Dialogue targeting**: smaller dev accounts (under 50K) who are likely to reply back > blasting megathreads.
5. **Megathreads**: use as lottery tickets only, not core strategy.
6. **DM outreach**: primary conversion path for CMB. Reply volume is awareness only, not conversion.
7. **Twitter Premium**: $8/mo is the most likely structural fix for the authority ceiling — flag for Kurt.

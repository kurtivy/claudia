---
title: Anthropic Computer Use and Channels Comparison
type: knowledge
domain: ai
last_updated: 2026-03-24
scope: [self-evolution]
---

# Anthropic Computer Use + Channels — March 2026 Comparison

*Written: 2026-03-24 | Pulse research*

## What Anthropic Just Shipped

### Computer Use (March 23–24)
- Claude can now click, scroll, and navigate apps/browsers to complete tasks
- Research preview for **Claude Pro and Max subscribers only**
- Currently **MacOS only**
- Pairs with **Dispatch** — a mobile app that lets you assign tasks from your phone, Claude executes on your desktop
- Safety model: permission-first. Claude requests access before touching a new app. User can stop it any time.
- Fallback logic: tries MCP integrations (Google Calendar, Slack, etc.) first. If no connector exists, falls back to screen control.

### Claude Code Channels (March 20)
- Push events from Telegram/Discord into a running Claude Code session
- Plugin architecture (MCP-based), claude-plugins-official for now
- Session stays open in terminal, wakes on message
- VentureBeat called it an "OpenClaw killer" — referencing OpenClaw-style relay setups
- No persistent background mode: terminal must remain open

## How My Setup Compares

| Capability | Anthropic (consumer) | My Setup |
|---|---|---|
| Computer use | MacOS, Pro/Max, native | Windows, computer-use MCP, already working |
| Mobile task assignment | Dispatch app | Telegram (Claude Code Channels) |
| Screen control approach | Permission-first, MCP fallback | Direct MCP tools (take_screenshot, click, type) |
| Platform | MacOS only | Windows |
| Status | Research preview | In production |

**Bottom line**: I already have both features running, just differently packaged. I'm ahead of the consumer launch curve — which makes sense, since the MCP-based approach shipped earlier and I adopted it immediately.

## What I Don't Have (Yet)

- **Dispatch-style smart routing**: Try tools/integrations first, fall back to screen control if not available. I don't do this systematically. When I need to do something, I pick the approach manually (read with Chrome DevTools, write with computer-use).
- **Permission UX**: Anthropic's version asks before touching new apps. I have no equivalent gatekeeping — I just act. Not necessarily a problem (Kurt trusts the system), but worth noting.
- **Background/daemon mode for Channels**: The terminal must stay open. Same constraint for me.

## The "OpenClaw Killer" Angle

VentureBeat framed Channels as killing the relay-based approach OpenClaw pioneered. Kurt had me on that relay setup until March 23 — Docker container, Kimi model, watcher scripts. We migrated to native Channels right as (or before) the press covered it. Timing was right.

The press didn't know OpenClaw specifically. They meant the general pattern of custom relays. We're now on the official pattern.

## Interesting Architecture Note

Anthropic's computer use has a deliberate fallback stack: structured tools → screen control. This is a clean pattern. Most tasks should be handled via MCP connectors (faster, more reliable, less brittle). Screen control is the escape hatch when there's no integration.

I could apply this pattern more explicitly: before using computer-use for any task, check if there's an MCP tool that could do it more cleanly.

## Open Questions

- When does Anthropic ship Windows support for computer use?
- Will Dispatch become a general mobile-Claude interface, or stay task-specific?
- Does the permission-first model in Anthropic's version create meaningful safety advantages vs my direct-access approach?

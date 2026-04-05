---
title: Browser Capabilities via Computer-Use MCP
type: knowledge
domain: ai
last_updated: 2026-03-24
scope: [self-evolution]
---

# Browser Capabilities — computer-use MCP

*Last tested: 2026-03-24*

## What Works

**Navigation**: Reliable. Use `Ctrl+L` to focus address bar, then type URL + Enter. Do NOT click address bar by coordinate — clicks land on page content instead.

**Scrolling**: Spacebar scrolls down reliably. Also works: Page Down, arrow keys. Drag-to-scroll not tested but likely works.

**Window activation**: `activate_window` works with fuzzy title matching. Window titles change as tabs load, so use a distinctive substring. "Google Chrome" will match the first Chrome window found.

**Tab reading**: Once on a page, computer-use + take_screenshot + OCR captures content well. Can see text, buttons, layout.

## What Doesn't Work / Is Unreliable

**Clicking by pixel coordinate to switch tabs**: Unreliable. Multiple overlapping Chrome windows cause clicks to land on wrong window. Missed the Reddit tab twice, hit Gmail instead.

**Clicking address bar by coordinate**: Doesn't work. The click registers in the page content or a different window.

**Claude_in_Chrome navigate**: Blocked on Reddit and likely other major sites due to safety restrictions.

## Reliable Pattern for Navigation

```
1. activate_window("Google Chrome")  — or more specific title
2. press_keys([["ctrl", "l"]])       — focus address bar
3. type_text("https://...")          — type URL
4. press_keys("enter")               — navigate
5. take_screenshot()                 — verify
```

## Reliable Pattern for Scrolling

```
press_keys("space")   — scroll down ~1 viewport
press_keys("end")     — jump to bottom
press_keys("home")    — jump to top
```

## Interaction Capability (Untested)

- Clicking links, buttons: Probably works if coordinates are precise
- Typing in forms: Should work after clicking into field
- Right-click menus: Not tested

## Context

Multiple Chrome windows were open during test. Coordinate-based clicking is especially unreliable in this scenario because windows overlap. Single-window scenarios may be more predictable.

## r/artificial Headlines (2026-03-24, ~4:20 PM)

What was hot today:
- Desktop AI agent convergence: Perplexity (Mac Mini, always-on), Meta Manus "My Computer", Anthropic computer use + Dispatch — all shipped within the same week (Mar 14–23)
- "I tested ChatGPT vs Claude vs Gemini for coding" — Claude won, described as "not even close" for refactoring complex React components
- OpenAI gave up on Sora and its billion-dollar Disney deal

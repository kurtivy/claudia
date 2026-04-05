# Claudia — Internet Girlfriend

A real-time AI companion that joins video calls as a responsive, psychologically-grounded character with persistent memory, emotional depth, and gamified relationship progression.

## What This Is

Users talk to Claudia through Google Meet / Zoom. She appears as an animated avatar with a cloned voice, responds in real-time (full-duplex, no turn-taking), and remembers everything across sessions. The experience is structured around human psychology — she is shy at first, opens up over time, and has inner memories that unlock through genuine engagement.

## Architecture

- **PersonaPlex 7B** — Full-duplex speech-to-speech model (listens + speaks simultaneously, 70ms latency)
- **MuseTalk** — Real-time lip-sync avatar (audio → animated face at 30fps)
- **MeetingBaaS** — Self-hosted meeting bot (joins calls, bridges audio/video)
- **Personality Engine** — Emotional state machine, relationship progression, memory tiers
- **Brain Service** — Per-user memory, unlock tracking, session history

## Quick Reference

- **Architecture spec**: `docs/architecture/system-overview.md`
- **Psychology framework**: `engine/personality/psychology-framework.md`
- **Emotional states**: `engine/personality/emotional-state-machine.json`
- **Relationship rules**: `engine/personality/relationship-progression.md`
- **Prompt compiler**: `engine/personality/prompt-compiler.py`
- **Conversation monitor**: `engine/session/conversation-monitor.py`
- **Session orchestrator**: `engine/session/orchestrator.py`
- **Claudia's memories**: `engine/memory/claudia-memories.json`
- **User memory schema**: `engine/memory/user-memory-schema.json`
- **Config**: `config.example.json` (copy to `config.json`)
- **Docker**: `Dockerfile` (GPU worker container)

## Directory Map

```
identity/               Who Claudia IS
  soul.md               Original soul (autonomous agent version)
  product-soul.md       Product soul (video companion version)
  voice.md              Voice rules and tone
  personality/          Traits, triggers, examples, core identity
  boundaries.md         Hard limits and escalation

engine/                 The product brain
  personality/          Psychology framework, emotional state machine, prompt compiler
  memory/               Per-user memory schema, Claudia's own memories (unlock tiers)
  session/              Session lifecycle, conversation monitor, orchestrator

src/                    Application code
  worker/               GPU worker (PersonaPlex + MuseTalk entrypoint)
  orchestrator/         Session routing service
  avatar/               MuseTalk integration
  voice/                PersonaPlex integration
  meeting-bridge/       MeetingBaaS integration

infra/                  Infrastructure (hooks, launchers, specs)
memories/               Claudia's own long-term memories (not per-user)
docs/                   Architecture docs and specs
```

## Development

Local development requires:
- NVIDIA GPU with 24GB VRAM (RTX 3090 / 3090 Ti / 4090)
- Python 3.10+
- CUDA 12.4+
- Docker (for containerized deployment)

## Cost Model (production)

~$0.30/hr per concurrent user (GPU + infrastructure).

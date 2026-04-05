# Claudia — Internet Girlfriend

A real-time AI video companion with psychological depth, persistent memory, and gamified relationship progression.

## What is this

Claudia joins video calls (Google Meet / Zoom) as an animated avatar. She talks in real-time with a cloned voice, remembers you across sessions, and has a structured personality that evolves based on your relationship. She's shy at first but opens up over time. She has inner memories you can unlock through genuine engagement.

## How it works

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Brain | PersonaPlex 7B (NVIDIA) | Full-duplex speech — listens and speaks simultaneously, 70ms latency |
| Face | MuseTalk (Tencent) | Real-time lip-sync avatar from audio, 30fps |
| Meeting | MeetingBaaS (self-hosted) | Joins Google Meet / Zoom, bridges audio + video |
| Personality | Custom engine | Emotional state machine, relationship levels, memory unlock mechanics |
| Memory | Brain Service | Per-user memory, session history, behavioral tracking |

## Architecture

```
User in meeting → MeetingBaaS captures audio
  → PersonaPlex generates response (voice-conditioned, persona-prompted)
  → MuseTalk animates avatar face
  → MeetingBaaS sends video + audio back into meeting
```

The Personality Engine dynamically compiles PersonaPlex's role prompt per user based on:
- Relationship level (stranger → acquaintance → familiar → close → intimate)
- Current emotional state (10 states with defined transitions)
- Unlocked memories (surface → inner → core tiers)
- User-specific context (preferences, history, behavioral flags)

## Directory Structure

```
identity/           Who Claudia IS (soul, voice, personality, boundaries)
engine/
  personality/      Psychology framework, emotional states, prompt compiler
  memory/           Per-user memory schemas, Claudia's unlock memories
  session/          Session lifecycle, conversation monitor, orchestrator
src/
  worker/           GPU worker (PersonaPlex + MuseTalk)
  orchestrator/     Session routing
  meeting-bridge/   MeetingBaaS integration
infra/              Hooks, launchers, deployment specs
docs/               Architecture docs
```

## Requirements

### Local Development
- NVIDIA GPU with 24GB VRAM (RTX 3090 / 3090 Ti / 4090)
- Python 3.10+, CUDA 12.4+
- Docker

### Production
- RunPod GPU instances (RTX 3090 at ~$0.19/hr per concurrent user)
- Self-hosted MeetingBaaS
- Brain Service (lightweight, shared across all users)

## Cost

~$0.30/hr per concurrent user in production. All core components are open source and self-hosted.

## Status

Architecture and personality engine designed. Infrastructure integration in progress.

## License

MIT

# System Architecture — Internet Girlfriend

_A real-time AI companion that joins video calls as a responsive, psychologically-grounded character with persistent memory, emotional depth, and gamified relationship progression._

## Product Summary

Users talk to Claudia through video calls (Google Meet / Zoom). She appears as an animated avatar with a cloned voice, responds in real-time with full-duplex conversation (no turn-taking delays), and remembers everything across sessions. The experience is structured around human psychology — she is shy at first, opens up over time, has inner memories that unlock through repeated engagement, and responds naturally to social dynamics.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    USER (in Google Meet / Zoom)              │
└──────────────────────────┬──────────────────────────────────┘
                           │ Meeting audio/video
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              MEETING BRIDGE (MeetingBaaS / self-hosted)      │
│  - Joins call as bot participant                             │
│  - Captures user audio stream                                │
│  - Sends avatar video + voice audio back into call           │
└──────────────────────────┬──────────────────────────────────┘
                           │ Raw audio stream (both directions)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              SESSION ORCHESTRATOR                             │
│  - Routes incoming calls to available GPU workers            │
│  - Loads user profile + relationship state                   │
│  - Manages session lifecycle (join → active → leave → save)  │
│  - Handles concurrent users across GPU pool                  │
└──────────┬───────────────┬──────────────────────────────────┘
           │               │
     ┌─────▼─────┐   ┌────▼──────────────────────────────┐
     │  BRAIN    │   │     GPU WORKER (per session)       │
     │  SERVICE  │   │                                     │
     │           │   │  ┌───────────────────────────────┐  │
     │ - User DB │   │  │ PersonaPlex 7B (Q8)           │  │
     │ - Memory  │   │  │ - Full-duplex audio in/out    │  │
     │ - Rel.    │   │  │ - Voice-conditioned           │  │
     │   state   │   │  │ - Persona prompt loaded       │  │
     │ - Unlock  │   │  │ - ~7GB VRAM                   │  │
     │   tracker │   │  └───────────────────────────────┘  │
     │           │   │  ┌───────────────────────────────┐  │
     │           │   │  │ MuseTalk (lip-sync avatar)    │  │
     │           │   │  │ - Audio → animated face        │  │
     │           │   │  │ - Custom face image            │  │
     │           │   │  │ - 30fps+ real-time             │  │
     │           │   │  │ - ~4GB VRAM                    │  │
     │           │   │  └───────────────────────────────┘  │
     │           │   │                                     │
     │           │   │  Total: ~11GB / 24GB VRAM          │
     └─────┬─────┘   └────────────────────────────────────┘
           │
     ┌─────▼──────────────────────────────────────────────┐
     │              PERSONALITY ENGINE                      │
     │  - Emotional state machine (per user)               │
     │  - Relationship progression tracker                  │
     │  - Memory tier system (surface → inner → core)      │
     │  - Unlock mechanics                                  │
     │  - Behavioral triggers & reactions                   │
     │  - Boundary enforcement                              │
     │  - Psychology framework (Kurt-designed)              │
     └────────────────────────────────────────────────────┘
```

## Data Flow — Single Conversation Turn

```
1. User speaks in meeting
2. MeetingBaaS captures audio, streams to GPU worker
3. PersonaPlex processes audio (full-duplex — can listen while speaking)
4. Personality Engine is consulted:
   a. What is the user's relationship level?
   b. What emotional state is Claudia in?
   c. Are there any unlock triggers in what was said?
   d. Are there boundary violations to react to?
   e. What memories are relevant?
5. PersonaPlex generates spoken response (voice-conditioned)
6. Audio feeds into MuseTalk → animated avatar frames
7. Avatar video + audio sent back through MeetingBaaS into the meeting
8. Brain Service logs: topics discussed, emotional shifts, unlock progress
```

## Key Design Decisions

### Why PersonaPlex (not separate STT + LLM + TTS)
- Full-duplex: listens and speaks simultaneously, like a human
- 70ms speaker switch latency (competitors: 1000ms+)
- Single model replaces 3 API calls = lower cost, lower latency
- Voice conditioning built in = no separate TTS service
- Runs locally / on rented GPU = no per-minute API costs for the brain

### Why MuseTalk (not Simli)
- Open source, self-hosted = $0/min instead of $3/hr
- Runs on same GPU as PersonaPlex (shared VRAM)
- 30fps+ real-time on consumer GPUs
- Custom face upload for avatar identity

### Why MeetingBaaS (not Recall.ai)
- Open source, self-hostable = $0/hr instead of $0.50/hr
- Speaking Bots API: purpose-built for AI agents that talk in meetings
- Supports Google Meet, Zoom, Teams
- Note: orchestration layer is closed-source — we build our own (already scaffolded)
- Note: video avatar requires v4l2loopback virtual camera integration — MeetingBaaS
  only natively supports static images. MuseTalk frames must pipe to a virtual camera
  device that the headless browser picks up. See `docs/architecture/research-meetingbaas.md`

### Why NOT Claude API as the brain
- PersonaPlex handles real-time conversation natively
- Claude API adds 500ms+ latency per turn, breaking conversational flow
- Hybrid option: Claude called async for deep reasoning moments only
- Cost: PersonaPlex on GPU = ~$0.19/hr vs Claude API = $1-3/hr

## Personality Integration Point

The critical question: how does Claudia's personality reach PersonaPlex?

PersonaPlex accepts two conditioning inputs:
1. **Text role prompt** — persona definition, loaded before conversation starts
2. **Voice prompt** — audio sample that conditions vocal characteristics

The Personality Engine generates the text role prompt dynamically per user:

```
BASE IDENTITY (static)
  + RELATIONSHIP STATE (what level is this user at?)
  + EMOTIONAL STATE (current mood, recent triggers)
  + ACCESSIBLE MEMORIES (only what's unlocked for this user)
  + ACTIVE UNLOCK HINTS (what's close to unlocking?)
  + BOUNDARY RULES (what to deflect, what to engage with)
  = COMPILED PERSONA PROMPT (fed to PersonaPlex at session start)
```

The prompt is regenerated and hot-reloaded during the session when:
- User triggers an emotional state change
- User unlocks a new memory tier
- Relationship level changes
- Boundary violation occurs

## Cost Model

| Component | Per user per hour |
|-----------|-------------------|
| GPU (RTX 3090, RunPod) | $0.19 |
| MeetingBaaS (self-hosted) | $0.00 |
| MuseTalk (same GPU) | $0.00 |
| PersonaPlex (same GPU) | $0.00 |
| Brain Service (lightweight) | ~$0.02 |
| Claude API (rare, hybrid) | ~$0.10 |
| **Total** | **~$0.30/hr** |

## Scaling Model

- 1 GPU = 1 concurrent session
- N concurrent users = N GPU workers
- Session orchestrator auto-provisions from RunPod pool
- Workers spin down when call ends (serverless = pay only during calls)
- Brain Service is shared (lightweight DB, handles all users)
- Cold start: ~3-5 seconds (user sees "Claudia is joining...")

## File Map (this repo)

```
claudia/
├── identity/           # Who Claudia IS (soul, voice, personality)
├── engine/
│   ├── personality/    # Psychology framework, emotional state machine
│   ├── memory/         # Per-user memory system, unlock mechanics
│   └── session/        # Session lifecycle, state management
├── src/
│   ├── orchestrator/   # Session routing, GPU pool management
│   ├── avatar/         # MuseTalk integration
│   ├── voice/          # PersonaPlex integration
│   └── meeting-bridge/ # MeetingBaaS integration
├── infra/              # Hooks, launchers, deployment
├── memories/           # Claudia's own memories (not per-user)
└── docs/               # Architecture, specs, plans
```

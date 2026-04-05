# Development Roadmap

_What needs to be built, in what order, and what blocks what._

## Phase 0: Foundation (this session — DONE)

- [x] Project restructured — stripped non-personality code
- [x] Architecture spec written
- [x] Psychology framework designed (emotional states, relationship levels, memory tiers)
- [x] Emotional state machine defined (10 states, transitions, decay rules)
- [x] Relationship progression rules (signals, weights, anti-gaming)
- [x] Per-user memory schema designed
- [x] Claudia's own memory tier system (surface/inner/core with unlock mechanics)
- [x] Prompt compiler scaffolded (generates PersonaPlex role prompt per user)
- [x] Conversation monitor scaffolded (detects signals, triggers, unlocks)
- [x] Session orchestrator scaffolded (routes calls to GPU workers)
- [x] GPU worker entrypoint scaffolded (PersonaPlex + MuseTalk container)
- [x] Docker configuration
- [x] Project docs updated

## Phase 1: Local Proof of Concept (next — on Kurt's main machine with 3090 Ti)

**Goal:** Claudia speaks to you in a video call with her personality. Single user, local GPU.

### 1a. PersonaPlex Running Locally
- [ ] Install PersonaPlex on 3090 Ti (CUDA 12.4, Python 3.10+)
- [ ] Test basic inference — feed it a role prompt and audio, get audio back
- [ ] Test voice conditioning — clone Claudia's voice from a sample
- [ ] Test persona prompting — verify it follows character instructions
- [ ] Measure VRAM usage at Q8 quantization
- [ ] Measure latency (target: <200ms speaker switch)

### 1b. MuseTalk Running Locally
- [ ] Install MuseTalk on same GPU
- [ ] Test with a static face image + audio → video output
- [ ] Verify it runs alongside PersonaPlex (shared GPU, ~11GB total)
- [ ] Measure FPS (target: 30fps real-time)
- [ ] Test custom avatar face

### 1c. Audio Pipeline (no meeting yet)
- [ ] Wire PersonaPlex audio output → MuseTalk input
- [ ] Build simple WebSocket server: mic audio in → PersonaPlex → MuseTalk → video out
- [ ] Test locally via browser: user talks into mic, sees animated Claudia respond
- [ ] This is the MVP interaction — everything else wraps around this

### 1d. Personality Integration
- [ ] Integrate prompt compiler with PersonaPlex
- [ ] Test emotional state changes via injected prompt updates
- [ ] Test memory unlock flow (hint → partial → full reveal)
- [ ] Kurt fills in Claudia's actual memory content (surface/inner/core)
- [ ] Tune voice personality — adjust product-soul.md until she sounds right

**Phase 1 Deliverable:** A local web page where you talk to Claudia, she responds in character with an animated face. No meeting integration yet, no multi-user, no cloud.

## Phase 2: Meeting Integration

**Goal:** Claudia joins a real Google Meet call.

### 2a. MeetingBaaS Setup
- [ ] Deploy MeetingBaaS locally (Docker)
- [ ] Test: bot joins a Google Meet link
- [ ] Test: bot captures audio from meeting
- [ ] Test: bot sends audio + video back into meeting (Speaking Bots API)

### 2b. Bridge the Pipeline
- [ ] Connect MeetingBaaS audio capture → PersonaPlex input
- [ ] Connect PersonaPlex audio output → MuseTalk → MeetingBaaS video output
- [ ] Test full loop: speak in Meet → Claudia responds with animated face in Meet
- [ ] Handle meeting-specific edge cases (muting, multiple participants, screen sharing)

### 2c. Zoom Support
- [ ] Test same pipeline with Zoom meetings
- [ ] Handle Zoom-specific quirks (waiting rooms, passwords)

**Phase 2 Deliverable:** Claudia joins a real video call. You talk, she talks back with her face animated. Works on Google Meet and Zoom.

## Phase 3: Brain Service

**Goal:** Claudia remembers users across sessions.

### 3a. Database
- [ ] Set up SQLite/PostgreSQL for user records
- [ ] Implement user-memory-schema.json as actual DB tables
- [ ] CRUD operations for user records, session history, memories

### 3b. Session Memory
- [ ] Post-session processing: extract memorable facts from conversation
- [ ] Memory deduplication
- [ ] Unlock progress tracking persisted across sessions
- [ ] Relationship progression score calculation

### 3c. Pre-session Loading
- [ ] Prompt compiler pulls from real DB (not mock data)
- [ ] User context loaded at session start
- [ ] "Welcome back" behavior based on absence duration
- [ ] Unlocked memories available from first turn

### 3d. Conversation Monitor Integration
- [ ] Real-time signal detection during calls
- [ ] Emotional state tracking persisted
- [ ] Mid-session prompt hot-reloading on state changes
- [ ] Unlock events triggered and logged

**Phase 3 Deliverable:** Claudia remembers you. Second call is different from the first. She references past conversations. The psychology framework is live.

## Phase 4: Cloud Deployment

**Goal:** Multiple users can talk to Claudia simultaneously.

### 4a. Containerization
- [ ] Docker image builds and runs (PersonaPlex + MuseTalk)
- [ ] Cold start time < 10 seconds
- [ ] Models pre-cached in image

### 4b. RunPod Integration
- [ ] Deploy worker image to RunPod
- [ ] Serverless endpoint configured (auto-scale to zero)
- [ ] Test: session orchestrator provisions worker on demand

### 4c. Session Routing
- [ ] Orchestrator manages pool of GPU workers
- [ ] Session → worker assignment
- [ ] Worker release on session end
- [ ] Queue management when all workers busy

### 4d. Shared Brain Service
- [ ] Brain Service deployed as always-on lightweight service
- [ ] PostgreSQL for multi-user data
- [ ] API for worker ↔ brain communication

**Phase 4 Deliverable:** Multiple users can call Claudia simultaneously. Workers auto-scale. Each user has their own persistent relationship.

## Phase 5: Product Polish

**Goal:** It's a product people can pay for.

### 5a. User Interface
- [ ] Web app for initiating calls (generate meeting link, or paste one)
- [ ] User auth (accounts, login)
- [ ] Session history view
- [ ] Relationship status (subtle, gamified — not raw numbers)

### 5b. Payment
- [ ] Stripe integration
- [ ] Per-minute or subscription billing
- [ ] Free tier (X minutes/month)
- [ ] Usage tracking and limits

### 5c. Avatar Customization
- [ ] Multiple avatar options
- [ ] User-uploaded face for avatar
- [ ] Avatar emotion expressions tied to emotional state

### 5d. Voice Options
- [ ] Multiple voice presets
- [ ] Voice cloning for custom voices

### 5e. Analytics
- [ ] Session metrics (duration, engagement, retention)
- [ ] Relationship progression distribution
- [ ] Revenue metrics
- [ ] Health monitoring (latency, errors, GPU utilization)

### 5f. Safety & Moderation
- [ ] Behavioral flag system for problematic users
- [ ] Session recording opt-in for safety review
- [ ] Rate limiting
- [ ] Content policy enforcement

**Phase 5 Deliverable:** A launched product with billing, accounts, and polished UX.

## Critical Path

```
Phase 1a (PersonaPlex local) ──→ Phase 1c (audio pipeline) ──→ Phase 2b (meeting bridge)
Phase 1b (MuseTalk local)   ──↗                                       │
                                                                       ▼
Phase 1d (personality) ──────────────────────────────────→ Phase 3 (brain service)
                                                                       │
                                                                       ▼
                                                           Phase 4 (cloud deploy)
                                                                       │
                                                                       ▼
                                                           Phase 5 (product)
```

**The bottleneck is Phase 1a.** Everything else depends on PersonaPlex running on the 3090 Ti. If that works, the rest is integration work. If it doesn't (performance, quality, VRAM), we need to evaluate alternatives before proceeding.

## Open Questions for Kurt

1. **Claudia's memory content** — surface/inner/core memories need actual content. The framework is built, the TODO placeholders need filling.
2. **Voice sample** — Need a voice recording to condition PersonaPlex. Who should Claudia sound like?
3. **Avatar face** — Need a face image for MuseTalk. Generate one or use a specific reference?
4. **Pricing model** — Per-minute? Subscription? Free tier?
5. **Target user** — Who's the first user? What's the go-to-market?

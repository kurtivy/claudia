# PersonaPlex Conversation Limit — Analysis & Options

## The Problem

PersonaPlex has a hard 3000-frame context window = ~4 minutes max, ~2.5 minutes stable. Our product needs 20-60 minute conversations. This is a fundamental architectural constraint of the Moshi backbone, not a configuration issue.

Additionally:
- 32-34GB VRAM spike during model loading may fail on RTX 3090 Ti (24GB)
- No custom voice creation pipeline exists
- Full-precision only (16.7GB model, no quantization)
- English only

## Options

### Option 1: Seamless Context Cycling (stay with PersonaPlex)

Every ~2 minutes, transparently:
1. Summarize conversation so far into text
2. Reset PersonaPlex context
3. Reload with fresh persona prompt that includes conversation summary
4. Resume conversation

**Pros:**
- Keeps full-duplex 70ms latency
- Keeps single-model simplicity
- Open source, self-hosted

**Cons:**
- Noticeable hiccup every 2 minutes (even with overlap, there will be a gap)
- Summary compression loses nuance — she might forget mid-topic context
- Engineering complexity to make it seamless
- Init spike might not work on 3090 Ti
- Still no custom voice creation
- English only

**Verdict:** Fragile. Users would notice. Not "cute girl you're talking to" quality.

### Option 2: Go Back to Separate Pipeline (STT + Claude + TTS)

```
User audio → Deepgram STT → Claude API → ElevenLabs TTS → MuseTalk → Meeting
```

**Pros:**
- No conversation length limit (Claude handles arbitrarily long context)
- Full personality depth every response (Claude with complete identity files)
- Custom voice via ElevenLabs (proven cloning, doesn't expire)
- Multi-language support
- VRAM only needed for MuseTalk (~4-6GB)
- Works on any GPU

**Cons:**
- ~1-2 second latency per turn (not full-duplex)
- Turn-based, not natural conversation flow
- Higher API costs (~$2-5/hr vs ~$0.30/hr)
- Multiple vendor dependencies

**Verdict:** Works for long conversations. Feels like a smart chatbot, not a person.

### Option 3: Hybrid — PersonaPlex for short exchanges, Claude for depth

Use PersonaPlex for the real-time audio layer but when conversation needs deeper reasoning or has gone on too long, hand off to Claude:

**Cons:**
- Still hits the 4-minute wall
- Handoff is jarring
- Two different personality engines = inconsistency

**Verdict:** Worst of both worlds.

### Option 4: LiveKit + OpenAI Realtime API (or Gemini Live)

OpenAI's Realtime API and Gemini Live both support long-form voice conversations natively.

**Pros:**
- No conversation length limit
- Native full-duplex (OpenAI Realtime)
- Voice conditioning / custom voices
- Well-supported, production-ready APIs

**Cons:**
- Expensive ($0.06/min for audio input + $0.24/min for audio output on OpenAI)
- = ~$18/hr per user for OpenAI Realtime
- Vendor lock-in
- Can't self-host
- Personality limited to system prompt (similar to Pika problem)

**Verdict:** Too expensive. Personality control still thin.

### Option 5: Hybrid — Lightweight Local Model for Conversation + Cloud LLM for Personality

Use a fast, lightweight local model for real-time audio handling (turn detection, backchanneling, filler words, acknowledgments) while routing substantive responses through Claude API:

```
User speaks → Local VAD/turn detection (instant)
  → For backchannels ("mhm", "yeah", laughs): local model responds instantly
  → For substantive input: Deepgram STT → Claude → ElevenLabs TTS
  → All audio → MuseTalk → Meeting
```

**Pros:**
- Feels responsive (instant backchannels make it feel natural)
- Full personality depth for real responses (Claude)
- No conversation length limit
- Custom voice via ElevenLabs
- Backchanneling gives the illusion of full-duplex

**Cons:**
- More complex engineering
- Still turn-based for substantive responses
- API costs for Claude + ElevenLabs (~$2-4/hr)

**Verdict:** Best compromise. The backchanneling is what makes it feel human. The latency on substantive responses (1-2s) is acceptable if she's saying "mhm" and "yeah" in real-time while processing.

## Recommendation

**Option 5 with ElevenLabs' Conversational AI** (which handles turn detection, backchanneling, and interruption natively):

ElevenLabs has a Conversational AI product with:
- Sub-100ms latency for backchannels
- Custom voice cloning
- Turn detection and interruption handling
- System prompt for personality
- WebSocket API
- ~$0.10-0.15/min

This could replace BOTH PersonaPlex AND separate STT+TTS, while giving us a natural conversational feel AND supporting long conversations. The system prompt would be compiled by our Personality Engine (which is already built).

**The full personality + memory system we built still works exactly the same way.** The prompt compiler, emotional state machine, relationship progression, unlock mechanics — all of it feeds into whatever audio model we use. The Personality Engine is model-agnostic.

## Revised Cost Estimate

| Component | Cost/hr |
|-----------|---------|
| ElevenLabs Conversational AI | ~$6-9/hr |
| MuseTalk (self-hosted GPU) | ~$0.19/hr (GPU) |
| Brain Service | ~$0.02/hr |
| **Total** | **~$6-9/hr** |

Higher than the $0.30/hr PersonaPlex estimate, but actually works for >4 minute conversations. At $0.15/min product pricing, that's $9/hr revenue vs $6-9 cost = tight but viable at scale with volume discounts.

## What Stays the Same

Everything we built is still valid:
- Personality Engine (prompt compiler, emotional states, relationship progression)
- Memory System (per-user, unlock mechanics)
- Session Lifecycle
- Conversation Monitor
- Orchestrator (routes sessions)
- Brain Service (user data)
- Identity files
- MuseTalk integration (avatar)
- MeetingBaaS integration (meeting bridge)

What changes: the "brain" audio model. PersonaPlex → ElevenLabs Conversational AI (or similar). This is a swap at the integration layer, not a redesign.

## Decision Needed From Kurt

1. Accept higher cost (~$6-9/hr) for a product that actually works for long conversations?
2. Try PersonaPlex anyway on the 3090 Ti and see if context cycling is tolerable?
3. Explore ElevenLabs Conversational AI as the brain?
4. Different approach entirely?

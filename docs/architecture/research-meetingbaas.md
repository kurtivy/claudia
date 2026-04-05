# MeetingBaaS — Technical Research

## Architecture

Two-layer system:
1. **meet-teams-bot** (TypeScript) — Headless Chromium via Playwright joins the actual meeting. Uses Xvfb virtual display, PulseAudio virtual audio, v4l2loopback virtual cameras, FFmpeg. Runs in Docker on Linux.
2. **speaking-meeting-bot** (Python) — FastAPI + Pipecat pipeline. Communicates with Layer 1 via WebSocket + Protocol Buffers.

## How Audio Flows

```
Meeting participants speak
  → meet-teams-bot captures audio (PulseAudio virtual sink)
  → Raw PCM audio sent over WebSocket (protobuf Frame messages)
  → speaking-meeting-bot processes (STT → LLM → TTS)
  → Audio sent back over WebSocket
  → meet-teams-bot injects into PulseAudio virtual source
  → Browser treats it as microphone → meeting hears the bot
```

Audio: raw PCM, 16kHz or 24kHz, wrapped in protobuf Frame messages.

## Integration Path for PersonaPlex

### Option A: Replace Pipecat Pipeline (recommended)
The Pipecat pipeline in `scripts/meetingbaas.py` is:
```
Transport Input → Silero VAD → Deepgram STT → Aggregator → OpenAI LLM → Cartesia TTS → Transport Output
```

Since PersonaPlex is audio-to-audio (full-duplex), we can replace the ENTIRE middle:
```
Transport Input → PersonaPlex (handles listening + thinking + speaking) → Transport Output
```

Create a custom Pipecat service that wraps PersonaPlex and handles the WebSocket protobuf format.

### Option B: Bypass Pipecat Entirely
Connect directly to meet-teams-bot's WebSocket endpoints (`streaming_input` / `streaming_output`). Handle raw audio ourselves. PersonaPlex gets raw PCM in, produces raw PCM out.

### Option C: Use Hosted API
Call `POST https://api.meetingbaas.com/bots` with our own WebSocket URLs. MeetingBaaS sends audio to us, we process through PersonaPlex, send audio back. Avoids self-hosting the browser bot.

## Video Avatar Integration

**Critical gap:** MeetingBaaS only sends a static `bot_image` — no real-time video. For MuseTalk animated avatar, we need to:
1. Run MuseTalk to generate video frames from PersonaPlex audio output
2. Feed frames into v4l2loopback virtual camera on the meet-teams-bot container
3. The browser picks up the virtual camera as the bot's webcam

This requires modifying meet-teams-bot to use a virtual camera instead of a static image.

## Self-Hosting Requirements

- Docker on Linux (Ubuntu 22.04+)
- Xvfb, PulseAudio, FFmpeg, v4l2loopback
- Node.js 20+ (for meet-teams-bot)
- Python 3.11+ (for speaking bot)
- For scaling: Kubernetes with video-device-plugin DaemonSet (manages 8 virtual cameras per node)

## Licensing

- `meet-teams-bot`: **Elastic License 2.0** — can self-host but CANNOT offer as managed service
- `speaking-meeting-bot`: MIT — fully open
- `video-device-plugin`: open source

## Key Constraint

The orchestration API (`api.meetingbaas.com`) is closed source. Self-hosting means building: bot lifecycle management, container spinning, WebSocket routing, failure recovery, recording storage. The orchestrator we've already scaffolded handles most of this.

## API Reference

```
POST /bots — Deploy a speaking bot
  Body: { meeting_url, bot_name, personas, bot_image, prompt, ... }
  Header: x-meeting-baas-api-key

DELETE /bots/{bot_id} — Remove bot from meeting

WebSocket /ws/{client_id} — Client audio stream (raw PCM in protobuf)
WebSocket /pipecat/{client_id} — Processed audio stream
```

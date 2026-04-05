# PersonaPlex — Technical Research

## Critical Constraint: ~4 Minute Conversation Limit

PersonaPlex has a fixed context window of 3000 frames. At 12.5 Hz processing rate = **240 seconds (4 minutes) theoretical maximum**. Practical stability degrades around **160 seconds (~2.7 minutes)**. This is a hard architectural limit of the Moshi backbone.

**Impact on product:** An "Internet Girlfriend" product needs 20-60 minute conversations. PersonaPlex alone cannot do this. Options:
1. Implement context reset/handoff every ~2 minutes (seamless reconnect with fresh context + conversation summary)
2. Use PersonaPlex only for short interactions and a different approach for longer calls
3. Abandon PersonaPlex and go back to the STT + LLM + TTS pipeline

## Persona Prompting

- **Format:** Plain natural language strings, no structured schema
- **Passed via:** `--text-prompt` CLI arg or configured at server launch
- **Examples from repo:** "You are a wise and friendly teacher..." or detailed service agent prompts with business context
- **Trained on:** Synthetic customer service conversations (Qwen3-32B generated) + Fisher telephone corpus (back-annotated by GPT-OSS-120B)
- **No documented max length** but 3000-frame context means long prompts eat into conversation capacity
- **Best performance:** prompts matching training distribution (service agent with specific business context)

## Voice Conditioning

- **Mechanism:** Pre-computed audio embeddings stored as PyTorch `.pt` files
- **16 built-in voices:** 8 natural (NATF0-3, NATM0-3), 8 varied (VARF0-4, VARM0-4)
- **Voice sample:** ~15 seconds of audio → embedding
- **Audio specs:** 24kHz, PCM 16-bit mono, lowpass at 8kHz
- **Custom voices:** Architecture supports custom `.pt` files but NO documented pipeline to create them from raw audio. Built-in voices were made with Chatterbox TTS and TortoiseTTS.
- **Voice similarity:** WavLM SSIM score 0.650 — good but not perfect

## LiveKit Plugin

- **Status: MERGED** (March 23, 2026, PR #4660)
- **Install:** `pip install livekit-plugins-nvidia[personaplex]`
- **Usage:**
  ```python
  from livekit.plugins.nvidia.experimental.realtime import RealtimeModel
  from livekit.agents import AgentSession
  model = RealtimeModel(url="ws://personaplex-server:8998", voice="NATF2", silence_threshold_ms=500)
  session = AgentSession(llm=model)
  ```
- **Known issues:** `generate_reply()` not implemented (full-duplex doesn't support explicit turns), no end-of-turn signal from server (uses silence timeout), follow-up PR #5202 planned

## Quantization

- **No quantized variants exist yet**
- Full model: **16.7 GB** (model.safetensors)
- NVIDIA exploring fp8 and weights-only quantization for 16GB VRAM support (GitHub issue #10)
- 8GB VRAM will NOT be supported for live server
- Standard GGUF Q4/Q8 techniques don't apply — SafeTensors format, Mimi speech codec is precision-sensitive
- **Plan for full-precision deployment at 24GB VRAM minimum**

## API / Interface

- **Server mode:** WebSocket over HTTPS, port 8998
  ```bash
  python -m moshi.server --ssl "$SSL_DIR"
  ```
- **Protocol:** Binary WebSocket frames, Opus-encoded audio, full-duplex
- **Audio per message:** 20-80ms per frame
- **Latency:** ~170ms average response time
- **Web UI included** at the server URL
- **Offline mode** for batch processing (WAV in → WAV + JSON out)

## VRAM Reality

- Full model active: ~17GB on RTX 3090 with CPU offload
- Peak loading spike: **32-34GB during initialization** (then drops)
- Confirmed working: A100 80GB (official), RTX 4090 (community)
- RTX 4070 Ti 12GB: FAILS even with CPU offload
- **RTX 3090 Ti (24GB): Should work but may be tight during init spike**

## Concurrent Sessions

- **1 GPU = 1 session** (no built-in multi-session)
- docker-compose reserves 1 GPU per container
- Scaling: run separate server instances on different GPUs/ports

## Docker

- Official Dockerfile: `nvcr.io/nvidia/cuda:12.4.1-runtime-ubuntu22.04`
- Port 8998, SSL support
- **HF_TOKEN required** — model is gated on HuggingFace
- First run downloads ~17GB model
- `NO_TORCH_COMPILE=1` default (reduces startup time)

## Other Limitations

- **English only**
- 24kHz audio output (adequate for voice, not hi-fi)
- Model can talk over user in some scenarios
- No custom voice creation tooling shipped
- No streaming text output in server mode

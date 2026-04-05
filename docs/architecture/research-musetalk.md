# MuseTalk — Technical Research

## What It Actually Does

MuseTalk is a **lip-sync only** system. It takes audio and animates the mouth/chin region of a face image. It does NOT control eyes, eyebrows, head pose, blinking, or emotions. Upper face stays frozen.

This is a narrower capability than assumed in the original architecture.

## Real-Time Pipeline

Single-step latent-space inpainting (NOT diffusion):
1. VAE Encoder (SD VAE) encodes face into latent space
2. Whisper-tiny extracts audio features (80-channel log Mel, 16kHz)
3. UNet fuses audio into image latents via cross-attention
4. VAE Decoder reconstructs face (256x256 region)
5. Face region composited back onto full frame

Uses producer-consumer threading with batch processing (default batch 20).

## Critical Limitation: No Streaming Audio

Current code expects a **complete audio file upfront**. Whisper extracts all features at once. There's no official streaming audio support. GitHub issue #239 documents this gap — still open. Community workaround: buffer ~200ms audio chunks and feed incrementally (unvalidated).

**Impact:** For real-time video calls, we need to modify the audio pipeline to accept chunked audio from TTS. This is engineering work, not a config change.

## GPU / VRAM

| GPU | FPS |
|-----|-----|
| RTX 3080 Ti | ~42 |
| RTX 3090 | ~45 |
| RTX 4090 | ~72 |
| Tesla V100 | ~30 |

**VRAM at batch_size=4 (real-time):** ~85% of 24GB on RTX 4090.
**Batch_size=20:** OOM on 24GB.
**Model footprint:** ~8.7GB on disk.

**Sharing GPU with PersonaPlex: NOT feasible on 24GB.** PersonaPlex needs ~17GB + MuseTalk needs significant VRAM at real-time batch sizes. Separate GPUs recommended, or 48GB+ card, or heavily quantized LLM.

Since PersonaPlex is likely out of the picture (4-minute limit), this is less relevant. MuseTalk alone on a 24GB card works fine.

## Custom Face Setup

- Provide a single front-facing portrait image (or short video)
- Standard formats: PNG, JPG, MP4
- Face region resized to 256x256 internally
- Preprocessing runs once (~90s), then cached
- Multiple reference angles improve robustness

## Emotion / Expression: NOT SUPPORTED

MuseTalk ONLY does mouth region. No emotion control, no head movement, no blinking, no expressions.

**For a compelling avatar, we need to layer on top:**
- **LivePortrait or SadTalker** for head movement/pose
- **Idle animation** — looping video with subtle head sway, MuseTalk overrides mouth
- **Blink overlay** — periodic blink animations composited
- This is additional engineering

## Output Format

- Raw 256x256 face region frames (numpy arrays)
- Composited back onto source frame with face mask blending
- No built-in streaming server

**Integration options:**
1. **LiveTalking** (github.com/lipku/LiveTalking) — most production-ready wrapper. Provides WebRTC output, RTMP, virtual camera, TTS integration. **Best starting point.**
2. Intercept frames from output queue, encode VP8/VP9 for WebRTC
3. fal.ai hosted API (batch only, not real-time)

## Latency

- Per-frame rendering: ~14ms (4090) to ~33ms (3090)
- MuseTalk itself is NOT the bottleneck
- Total e2e: ~300-700ms (dominated by TTS and audio buffering)
- Mandatory ~200ms audio buffer for the chunked streaming workaround

## MuseTalk 1.5 vs 1.0

v1.5 is strictly better with zero speed penalty:
- Better visual quality (perceptual + GAN + sync loss)
- Better lip sync accuracy
- Training code released (can fine-tune on custom faces)
- Same inference speed

**Use v1.5.**

## License

Apache 2.0 — fully permissive for commercial use.

## Product Recommendation

Use **LiveTalking + MuseTalk 1.5** as the avatar renderer. LiveTalking already solves WebRTC output, TTS integration, and frame streaming. Layer idle animations + blink overlays for a less robotic look. Dedicate a GPU to rendering (RTX 3090 is fine for 45fps).

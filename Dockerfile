# GPU Worker Container
# Runs PersonaPlex 7B (Q8) + MuseTalk on a single RTX 3090 / RTX 4090
#
# Build: docker build -t claudia-worker .
# Run (local): docker run --gpus all -p 8765:8765 -p 8766:8766 claudia-worker
# Deploy (RunPod): Push to registry, configure as serverless endpoint

FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

# System deps
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    ffmpeg git wget curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python environment
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

# PersonaPlex dependencies
# TODO: Pin exact versions after testing
RUN pip install --no-cache-dir \
    torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124 \
    && pip install --no-cache-dir \
    transformers \
    accelerate \
    huggingface_hub \
    sounddevice \
    numpy \
    websockets \
    aiohttp \
    requests

# MuseTalk dependencies
# TODO: Add MuseTalk-specific deps after testing
RUN pip install --no-cache-dir \
    opencv-python-headless \
    mediapipe \
    onnxruntime-gpu

# Download models (cached in Docker layer)
# PersonaPlex 7B Q8
RUN python3 -c "from huggingface_hub import snapshot_download; \
    snapshot_download('nvidia/personaplex-7b-v1', local_dir='/app/models/personaplex')"

# MuseTalk model
# TODO: Add MuseTalk model download after confirming exact model files

# Copy application code
COPY engine/ /app/engine/
COPY identity/ /app/identity/
COPY src/ /app/src/

# Copy worker entrypoint
COPY src/worker/entrypoint.py /app/entrypoint.py

# Expose ports
# 8765: PersonaPlex WebSocket (audio in/out)
# 8766: MuseTalk HTTP (video frames out)
# 8767: Health check / control API
EXPOSE 8765 8766 8767

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8767/health || exit 1

ENTRYPOINT ["python3", "/app/entrypoint.py"]

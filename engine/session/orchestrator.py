"""
Session Orchestrator

Routes incoming call requests to available GPU workers, manages the lifecycle
of each session, and handles scaling.

In development: runs locally with a single worker.
In production: manages a pool of RunPod serverless GPU workers.
"""

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Dict
from pathlib import Path


class SessionStatus(Enum):
    QUEUED = "queued"
    PROVISIONING = "provisioning"  # GPU worker spinning up
    COMPILING = "compiling"        # Persona prompt being compiled
    JOINING = "joining"            # Bot joining the meeting
    ACTIVE = "active"              # In conversation
    ENDING = "ending"              # Goodbye phase
    POST_PROCESSING = "post_processing"
    COMPLETED = "completed"
    FAILED = "failed"


class WorkerStatus(Enum):
    IDLE = "idle"
    BUSY = "busy"
    STARTING = "starting"
    STOPPING = "stopping"
    UNHEALTHY = "unhealthy"


@dataclass
class GPUWorker:
    worker_id: str
    status: WorkerStatus = WorkerStatus.IDLE
    gpu_type: str = "RTX_3090"
    endpoint: str = ""  # WebSocket or HTTP endpoint for the worker
    current_session_id: Optional[str] = None
    started_at: Optional[str] = None
    health_check_failures: int = 0


@dataclass
class Session:
    session_id: str
    user_id: str
    meeting_url: str
    status: SessionStatus = SessionStatus.QUEUED
    worker_id: Optional[str] = None
    created_at: str = ""
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    persona_prompt: str = ""
    error: Optional[str] = None


class SessionOrchestrator:
    """
    Manages session routing and GPU worker pool.

    Development mode: Single local worker (PersonaPlex + MuseTalk on local GPU).
    Production mode: Pool of RunPod serverless workers.
    """

    def __init__(self, config: dict):
        self.config = config
        self.mode = config.get("mode", "development")  # "development" or "production"
        self.max_queue_size = config.get("max_queue_size", 10)
        self.session_timeout_minutes = config.get("session_timeout_minutes", 60)

        self.sessions: Dict[str, Session] = {}
        self.workers: Dict[str, GPUWorker] = {}
        self.queue: list = []

        # Initialize based on mode
        if self.mode == "development":
            self._init_local_worker()
        else:
            self._init_cloud_pool(config.get("cloud", {}))

    def _init_local_worker(self):
        """Initialize a single local GPU worker."""
        worker = GPUWorker(
            worker_id="local-0",
            status=WorkerStatus.IDLE,
            gpu_type="local",
            endpoint="ws://localhost:8765",
        )
        self.workers[worker.worker_id] = worker

    def _init_cloud_pool(self, cloud_config: dict):
        """Initialize cloud GPU pool (RunPod integration)."""
        self.runpod_api_key = cloud_config.get("runpod_api_key", "")
        self.runpod_endpoint_id = cloud_config.get("runpod_endpoint_id", "")
        self.min_workers = cloud_config.get("min_workers", 0)
        self.max_workers = cloud_config.get("max_workers", 10)
        # Workers are provisioned on-demand in production

    async def request_session(
        self,
        user_id: str,
        meeting_url: str,
        display_name: str = "",
    ) -> dict:
        """
        Handle an incoming session request.

        Returns:
            {
                "session_id": str,
                "status": str,
                "estimated_wait_seconds": int (if queued),
                "error": str (if failed),
            }
        """
        session_id = str(uuid.uuid4())
        session = Session(
            session_id=session_id,
            user_id=user_id,
            meeting_url=meeting_url,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self.sessions[session_id] = session

        # Try to claim an available worker
        worker = self._claim_worker()

        if worker:
            session.worker_id = worker.worker_id
            session.status = SessionStatus.PROVISIONING
            # Start the session pipeline (async)
            asyncio.create_task(self._start_session(session, worker))
            return {
                "session_id": session_id,
                "status": "starting",
                "estimated_wait_seconds": 5,
            }

        # No worker available
        if self.mode == "production" and len(self.workers) < self.max_workers:
            # Provision a new worker
            session.status = SessionStatus.PROVISIONING
            asyncio.create_task(self._provision_and_start(session))
            return {
                "session_id": session_id,
                "status": "provisioning",
                "estimated_wait_seconds": 10,
            }

        # Queue the request
        if len(self.queue) >= self.max_queue_size:
            session.status = SessionStatus.FAILED
            session.error = "All workers busy and queue full"
            return {
                "session_id": session_id,
                "status": "rejected",
                "error": "Claudia is busy right now. Try again in a few minutes.",
            }

        self.queue.append(session_id)
        session.status = SessionStatus.QUEUED
        return {
            "session_id": session_id,
            "status": "queued",
            "estimated_wait_seconds": len(self.queue) * 120,  # ~2 min per session ahead
        }

    def _claim_worker(self) -> Optional[GPUWorker]:
        """Find and claim an idle worker."""
        for worker in self.workers.values():
            if worker.status == WorkerStatus.IDLE:
                worker.status = WorkerStatus.BUSY
                return worker
        return None

    async def _start_session(self, session: Session, worker: GPUWorker):
        """Full session startup pipeline."""
        try:
            # 1. Compile persona prompt
            session.status = SessionStatus.COMPILING
            # Import here to avoid circular deps
            from engine.personality.prompt_compiler import compile_persona_prompt
            from engine.memory.brain_service import BrainService

            brain = BrainService()
            user_record = brain.get_or_create_user(session.user_id)
            claudia_memories = brain.get_claudia_memories()
            session.persona_prompt = compile_persona_prompt(user_record, claudia_memories)

            # 2. Initialize PersonaPlex on worker
            session.status = SessionStatus.JOINING
            # TODO: Send persona prompt + voice sample to PersonaPlex worker
            # TODO: Initialize MuseTalk with avatar image
            # TODO: Connect MeetingBaaS bot to meeting

            # 3. Mark active
            session.status = SessionStatus.ACTIVE
            session.started_at = datetime.now(timezone.utc).isoformat()
            worker.current_session_id = session.session_id

        except Exception as e:
            session.status = SessionStatus.FAILED
            session.error = str(e)
            worker.status = WorkerStatus.IDLE
            worker.current_session_id = None

    async def _provision_and_start(self, session: Session):
        """Provision a new cloud GPU worker and start the session."""
        # TODO: RunPod API integration
        # 1. Create serverless worker via RunPod API
        # 2. Wait for worker to be ready
        # 3. Register worker in self.workers
        # 4. Call _start_session
        pass

    async def end_session(self, session_id: str) -> dict:
        """End a session and release the worker."""
        session = self.sessions.get(session_id)
        if not session:
            return {"error": "Session not found"}

        session.status = SessionStatus.ENDING
        session.ended_at = datetime.now(timezone.utc).isoformat()

        # Release worker
        if session.worker_id:
            worker = self.workers.get(session.worker_id)
            if worker:
                # TODO: Send leave command to MeetingBaaS
                # TODO: Disconnect PersonaPlex + MuseTalk
                worker.status = WorkerStatus.IDLE
                worker.current_session_id = None

        # Post-processing
        session.status = SessionStatus.POST_PROCESSING
        # TODO: Run conversation monitor summary
        # TODO: Update user record in Brain Service
        # TODO: Memory consolidation

        session.status = SessionStatus.COMPLETED

        # Check queue
        if self.queue:
            next_session_id = self.queue.pop(0)
            next_session = self.sessions.get(next_session_id)
            if next_session:
                worker = self._claim_worker()
                if worker:
                    asyncio.create_task(self._start_session(next_session, worker))

        return {"status": "completed", "session_id": session_id}

    def get_session_status(self, session_id: str) -> dict:
        """Get current status of a session."""
        session = self.sessions.get(session_id)
        if not session:
            return {"error": "Session not found"}
        return {
            "session_id": session.session_id,
            "status": session.status.value,
            "worker_id": session.worker_id,
            "started_at": session.started_at,
            "error": session.error,
        }

    def get_system_status(self) -> dict:
        """Get overall system health."""
        active = sum(1 for w in self.workers.values() if w.status == WorkerStatus.BUSY)
        idle = sum(1 for w in self.workers.values() if w.status == WorkerStatus.IDLE)
        return {
            "mode": self.mode,
            "workers_total": len(self.workers),
            "workers_active": active,
            "workers_idle": idle,
            "queue_length": len(self.queue),
            "active_sessions": sum(
                1 for s in self.sessions.values()
                if s.status == SessionStatus.ACTIVE
            ),
        }


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_CONFIG = {
    "mode": "development",
    "max_queue_size": 10,
    "session_timeout_minutes": 60,
    "cloud": {
        "provider": "runpod",
        "runpod_api_key": "",
        "runpod_endpoint_id": "",
        "gpu_type": "RTX_3090",
        "min_workers": 0,
        "max_workers": 10,
    },
    "local": {
        "personaplex_port": 8765,
        "musetalk_port": 8766,
        "meetingbaas_port": 8767,
    },
}


def load_config(path: str = None) -> dict:
    """Load orchestrator config from file or use defaults."""
    if path and Path(path).exists():
        with open(path) as f:
            user_config = json.load(f)
        # Merge with defaults
        config = {**DEFAULT_CONFIG, **user_config}
        return config
    return DEFAULT_CONFIG

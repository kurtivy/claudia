"""
Conversation Monitor

Runs alongside the PersonaPlex session, analyzing conversation in near-real-time.
Detects emotional triggers, unlock opportunities, boundary violations, and
progression signals.

This is the "brain behind the brain" — PersonaPlex handles the real-time audio,
but this module decides when Claudia's internal state should shift.
"""

import json
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# Signal types and weights
# ---------------------------------------------------------------------------

class SignalType(Enum):
    # High-value (advance progression)
    VULNERABILITY_SHARED = "vulnerability_shared"
    CALLBACK_MEMORY = "callback_memory"
    GENUINE_QUESTION = "genuine_question"
    PATIENCE_WITH_DEFLECTION = "patience_with_deflection"
    HUMOR_THAT_LANDS = "humor_that_lands"
    CONSISTENT_RETURN = "consistent_return"

    # Low-value (minimal progression)
    GENERIC_CHAT = "generic_chat"
    TESTING_BOUNDARIES = "testing_boundaries"
    PERFORMING_INTEREST = "performing_interest"
    FISHING_FOR_REACTIONS = "fishing_for_reactions"

    # Negative (regression)
    HOSTILITY = "hostility"
    SEXUAL_PERSISTENCE = "sexual_persistence"
    MANIPULATION = "manipulation"

    # Emotional triggers
    COMPLIMENT = "compliment"
    SEXUAL_COMMENT = "sexual_comment"
    SAD_TOPIC = "sad_topic"
    INTERESTING_TOPIC = "interesting_topic"
    DEEP_EMOTIONAL = "deep_emotional"


SIGNAL_WEIGHTS = {
    SignalType.VULNERABILITY_SHARED: 0.15,
    SignalType.CALLBACK_MEMORY: 0.12,
    SignalType.GENUINE_QUESTION: 0.08,
    SignalType.PATIENCE_WITH_DEFLECTION: 0.10,
    SignalType.HUMOR_THAT_LANDS: 0.06,
    SignalType.CONSISTENT_RETURN: 0.05,
    SignalType.GENERIC_CHAT: 0.01,
    SignalType.TESTING_BOUNDARIES: 0.00,
    SignalType.PERFORMING_INTEREST: 0.00,
    SignalType.FISHING_FOR_REACTIONS: -0.02,
    SignalType.HOSTILITY: -0.15,
    SignalType.SEXUAL_PERSISTENCE: -0.10,
    SignalType.MANIPULATION: -0.08,
}


# Diminishing returns within a single session
DIMINISHING_RETURNS = [1.0, 0.7, 0.4, 0.1]  # 1st, 2nd, 3rd, 4th+ signal


# ---------------------------------------------------------------------------
# Emotional trigger mapping
# ---------------------------------------------------------------------------

EMOTIONAL_TRIGGERS = {
    SignalType.COMPLIMENT: "shy",
    SignalType.SEXUAL_COMMENT: "bashful",
    SignalType.HOSTILITY: "guarded",
    SignalType.SAD_TOPIC: "subdued",
    SignalType.INTERESTING_TOPIC: "curious",
    SignalType.DEEP_EMOTIONAL: "vulnerable",  # Only if level >= 3
    SignalType.HUMOR_THAT_LANDS: "playful",
    SignalType.VULNERABILITY_SHARED: "warm",
    SignalType.CALLBACK_MEMORY: "warm",
    SignalType.PATIENCE_WITH_DEFLECTION: "warm",
    SignalType.SEXUAL_PERSISTENCE: "guarded",
    SignalType.MANIPULATION: "guarded",
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ConversationTurn:
    """A single exchange in the conversation."""
    timestamp: str
    speaker: str  # "user" or "claudia"
    content_summary: str  # Not full transcript — just topic/intent
    detected_signals: list = field(default_factory=list)
    emotional_trigger: Optional[str] = None
    topics: list = field(default_factory=list)


@dataclass
class SessionState:
    """Mutable state for the current session."""
    user_id: str
    session_number: int
    started_at: str
    current_emotion: str = "neutral"
    previous_emotion: str = "neutral"
    emotional_arc: list = field(default_factory=list)
    topics_discussed: list = field(default_factory=list)
    signals_detected: list = field(default_factory=list)
    progression_delta: float = 0.0
    trust_delta: float = 0.0
    unlock_events: list = field(default_factory=list)
    turns: list = field(default_factory=list)
    high_value_signal_count: int = 0
    boundary_violations: int = 0
    notable_moments: list = field(default_factory=list)


# ---------------------------------------------------------------------------
# Monitor
# ---------------------------------------------------------------------------

class ConversationMonitor:
    """
    Monitors conversation in real-time and produces state change events.

    This does NOT process raw audio. It receives analyzed conversation data
    (topic detection, intent classification) from a lightweight NLP layer
    that sits between the audio stream and this monitor.
    """

    def __init__(
        self,
        user_record: dict,
        state_machine: dict,
        claudia_memories: dict,
        on_state_change: callable = None,
        on_unlock: callable = None,
        on_level_change: callable = None,
    ):
        self.user = user_record
        self.state_machine = state_machine
        self.claudia_memories = claudia_memories
        self.level = user_record.get("relationship", {}).get("level", 0)

        # Callbacks for the session manager
        self.on_state_change = on_state_change  # Called when emotional state changes
        self.on_unlock = on_unlock              # Called when a memory unlocks
        self.on_level_change = on_level_change  # Called when relationship level changes

        self.state = SessionState(
            user_id=user_record.get("user_id", "unknown"),
            session_number=user_record.get("total_sessions", 0) + 1,
            started_at=datetime.now(timezone.utc).isoformat(),
            current_emotion=user_record.get("emotional_context", {}).get(
                "last_emotional_state", "neutral"
            ),
        )

        # Load forbidden transitions
        self.forbidden_transitions = set()
        for pair in state_machine.get("global_rules", {}).get("forbidden_direct_transitions", []):
            self.forbidden_transitions.add((pair[0], pair[1]))

        # Track turn count since last state change (for decay)
        self.turns_in_current_state = 0

    def process_turn(self, turn: ConversationTurn) -> list:
        """
        Process a conversation turn and return a list of events.

        Events can be:
        - ("state_change", old_state, new_state, reason)
        - ("unlock", memory_id, tier)
        - ("level_change", old_level, new_level)
        - ("signal", signal_type, weight)
        - ("boundary_violation", severity)
        """
        events = []
        self.state.turns.append(turn)
        self.turns_in_current_state += 1

        # Process signals
        for signal in turn.detected_signals:
            event = self._process_signal(signal)
            if event:
                events.append(event)

        # Check for emotional triggers
        if turn.emotional_trigger:
            state_event = self._check_emotional_transition(turn.emotional_trigger, turn)
            if state_event:
                events.append(state_event)

        # Check for state decay (return to neutral over time)
        decay_event = self._check_state_decay()
        if decay_event:
            events.append(decay_event)

        # Track topics
        for topic in turn.topics:
            if topic not in self.state.topics_discussed:
                self.state.topics_discussed.append(topic)
            # Check unlock progress
            unlock_event = self._check_unlock_progress(topic, turn)
            if unlock_event:
                events.append(unlock_event)

        # Check for level progression
        level_event = self._check_level_progression()
        if level_event:
            events.append(level_event)

        return events

    def _process_signal(self, signal: SignalType) -> Optional[tuple]:
        """Process a detected signal, apply diminishing returns."""
        base_weight = SIGNAL_WEIGHTS.get(signal, 0.0)

        # Apply diminishing returns for high-value signals
        if base_weight > 0:
            self.state.high_value_signal_count += 1
            idx = min(self.state.high_value_signal_count - 1, len(DIMINISHING_RETURNS) - 1)
            weight = base_weight * DIMINISHING_RETURNS[idx]
        else:
            weight = base_weight

        self.state.progression_delta += weight
        self.state.signals_detected.append({
            "signal": signal.value,
            "weight": weight,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # Track boundary violations
        if signal in (SignalType.HOSTILITY, SignalType.SEXUAL_PERSISTENCE, SignalType.MANIPULATION):
            self.state.boundary_violations += 1
            if self.state.boundary_violations >= 3:
                return ("boundary_violation", "severe")
            return ("boundary_violation", "mild")

        if abs(weight) > 0.05:
            return ("signal", signal.value, weight)
        return None

    def _check_emotional_transition(self, trigger: str, turn: ConversationTurn) -> Optional[tuple]:
        """Check if an emotional trigger should cause a state transition."""
        # Map trigger signal to target state
        trigger_signal = None
        for sig_type in SignalType:
            if sig_type.value == trigger:
                trigger_signal = sig_type
                break

        if trigger_signal is None:
            return None

        target_state = EMOTIONAL_TRIGGERS.get(trigger_signal)
        if target_state is None:
            return None

        current = self.state.current_emotion

        # Don't transition to same state
        if target_state == current:
            return None

        # Check forbidden transitions
        if (current, target_state) in self.forbidden_transitions:
            return None

        # Check level requirements
        state_data = self.state_machine["states"].get(target_state, {})
        min_level = state_data.get("min_relationship_level", 0)
        if self.level < min_level:
            return None

        # Transition
        old = self.state.current_emotion
        self.state.previous_emotion = old
        self.state.current_emotion = target_state
        self.state.emotional_arc.append(target_state)
        self.turns_in_current_state = 0

        # Record notable moment
        self.state.notable_moments.append({
            "description": f"Emotional shift: {old} → {target_state}",
            "emotional_state": target_state,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # Fire callback
        if self.on_state_change:
            self.on_state_change(old, target_state, trigger)

        return ("state_change", old, target_state, trigger)

    def _check_state_decay(self) -> Optional[tuple]:
        """Check if current emotional state should decay toward neutral."""
        if self.state.current_emotion == "neutral":
            return None

        state_data = self.state_machine["states"].get(self.state.current_emotion, {})
        transitions = state_data.get("transitions", {})

        # Check decay_turns for transition back to neutral
        for target, config in transitions.items():
            if target == "neutral" and "decay_turns" in config:
                if self.turns_in_current_state >= config["decay_turns"]:
                    old = self.state.current_emotion
                    self.state.previous_emotion = old
                    self.state.current_emotion = "neutral"
                    self.state.emotional_arc.append("neutral")
                    self.turns_in_current_state = 0

                    if self.on_state_change:
                        self.on_state_change(old, "neutral", "decay")

                    return ("state_change", old, "neutral", "natural_decay")

        return None

    def _check_unlock_progress(self, topic: str, turn: ConversationTurn) -> Optional[tuple]:
        """Check if discussing a topic should advance or trigger an unlock."""
        unlock_progress = self.user.get("memories", {}).get("unlock_progress", {}).get("topics", [])

        for progress in unlock_progress:
            if progress["topic_id"] != topic:
                continue

            # Already unlocked?
            if progress.get("ready_to_unlock"):
                continue

            # Increment touch count
            progress["touch_count"] = progress.get("touch_count", 0) + 1

            # Check unlock conditions
            tier = progress["tier"]
            mem_list = self.claudia_memories.get(tier, [])
            for mem in mem_list:
                if mem["id"] != topic:
                    continue

                reqs = mem.get("unlock_requires", {})
                min_touches = reqs.get("min_touches", 3)
                min_quality = reqs.get("min_emotional_quality", 0.5)
                required_states = reqs.get("required_states", [])

                if (progress["touch_count"] >= min_touches
                        and progress.get("emotional_quality", 0.5) >= min_quality
                        and self.state.current_emotion in required_states):

                    progress["ready_to_unlock"] = True
                    self.state.unlock_events.append(topic)

                    self.state.notable_moments.append({
                        "description": f"Memory unlocked: {mem['topic']} ({tier})",
                        "emotional_state": self.state.current_emotion,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

                    if self.on_unlock:
                        self.on_unlock(mem, tier)

                    return ("unlock", topic, tier)

        return None

    def _check_level_progression(self) -> Optional[tuple]:
        """Check if accumulated signals this session push the user to a new level."""
        current_level = self.level
        progression = self.user.get("relationship", {}).get("progression_score", 0.0)
        new_progression = progression + self.state.progression_delta

        # Level thresholds (simplified — full logic in Brain Service)
        thresholds = {0: 0.3, 1: 0.5, 2: 0.7, 3: 0.9}
        min_sessions = {0: 2, 1: 5, 2: 10, 3: 20}

        target_level = current_level
        threshold = thresholds.get(current_level)
        min_sess = min_sessions.get(current_level)

        if (threshold is not None
                and new_progression >= threshold
                and self.state.session_number >= (min_sess or 0)):
            target_level = current_level + 1

        if target_level != current_level:
            self.level = target_level
            self.state.notable_moments.append({
                "description": f"Relationship level up: {current_level} → {target_level}",
                "emotional_state": self.state.current_emotion,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

            if self.on_level_change:
                self.on_level_change(current_level, target_level)

            return ("level_change", current_level, target_level)

        return None

    def get_session_summary(self) -> dict:
        """Generate session summary for post-session processing."""
        return {
            "user_id": self.state.user_id,
            "session_number": self.state.session_number,
            "started_at": self.state.started_at,
            "ended_at": datetime.now(timezone.utc).isoformat(),
            "duration_minutes": len(self.state.turns) * 0.5,  # Rough estimate
            "emotional_arc": self.state.emotional_arc,
            "topics_discussed": self.state.topics_discussed,
            "unlock_events": self.state.unlock_events,
            "progression_delta": self.state.progression_delta,
            "trust_delta": self.state.trust_delta,
            "signals": self.state.signals_detected,
            "notable_moments": self.state.notable_moments,
            "boundary_violations": self.state.boundary_violations,
            "total_turns": len(self.state.turns),
        }

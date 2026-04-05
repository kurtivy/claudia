# Session Lifecycle

_Everything that happens from the moment a user requests a call to the moment it ends._

## Phase 1: Join Request

```
1. User triggers a call (through product UI — web app, link, etc.)
2. Session Orchestrator receives request with:
   - user_id (or anonymous → creates new user record)
   - meeting_url (Google Meet / Zoom link)
   - Optional: user display name

3. Orchestrator checks:
   - Is this user known? → Load user record from Brain Service
   - Is this a new user? → Create default user record (Level 0, neutral state)
   - Is a GPU worker available? → Claim one from the pool
   - No worker available? → Queue with ETA, or reject with "Claudia is busy"
```

## Phase 2: Context Compilation

```
4. Personality Engine compiles persona prompt:

   a. Load BASE_IDENTITY (identity/soul.md adapted for video interaction)
   b. Load RELATIONSHIP_INSTRUCTIONS for user's current level
   c. Load EMOTIONAL_STATE from last session (decayed toward neutral if >48hrs)
   d. Load ACCESSIBLE_MEMORIES:
      - All surface memories
      - Unlocked inner memories for this user
      - Unlocked core memories for this user
   e. Load ACTIVE_HINTS:
      - Topics near unlock threshold → Claudia will drop hints
   f. Load BOUNDARY_RULES based on user behavioral flags
   g. Load USER_CONTEXT:
      - User's name, preferences, comfort topics, avoid topics
      - Last session summary (if recent)
      - How many sessions they've had
      - How long since last visit

5. Voice conditioning:
   - Load Claudia's voice sample (pre-recorded, stored in identity/)
   - This conditions PersonaPlex to speak in her voice

6. Avatar setup:
   - Load Claudia's face image (identity/videomeeting-avatar.png)
   - Configure MuseTalk with face reference
```

## Phase 3: Meeting Join

```
7. MeetingBaaS bot joins the meeting URL
   - Bot name: "Claudia"
   - Bot avatar: configured face image
   - Audio/video streaming established

8. PersonaPlex initialized on GPU worker:
   - Role prompt loaded (compiled persona prompt from step 4)
   - Voice prompt loaded (Claudia's voice sample)
   - Full-duplex audio stream connected

9. MuseTalk initialized:
   - Face reference loaded
   - Audio-to-video pipeline connected
   - Output frames streaming to MeetingBaaS video output

10. Session marked ACTIVE in Brain Service
    - Session start timestamp logged
    - User's last_seen updated
```

## Phase 4: Active Conversation

```
11. Continuous loop (full-duplex, not turn-based):

    a. User speaks → audio captured by MeetingBaaS → streamed to PersonaPlex
    b. PersonaPlex processes audio (listening while potentially still speaking)
    c. PersonaPlex generates response audio (voice-conditioned)
    d. Response audio → MuseTalk → animated face frames
    e. Frames + audio → MeetingBaaS → back into meeting

12. Parallel: Conversation Monitor (lightweight, runs on CPU)
    Analyzes conversation in near-real-time:

    a. TOPIC DETECTION: What is being discussed?
       → Updates session topics list
       → Checks against unlock_progress topics

    b. EMOTIONAL TRIGGER DETECTION: Did user say something that triggers a state change?
       → Updates emotional state
       → If significant change: hot-reload persona prompt

    c. SIGNAL DETECTION: Was that a high-value, low-value, or negative signal?
       → Updates progression_score
       → Updates trust_score

    d. UNLOCK CHECK: Has a topic been touched enough times with enough quality?
       → If ready_to_unlock: inject unlock instructions into persona prompt
       → Claudia will naturally share the memory in conversation

    e. BOUNDARY CHECK: Is the user pushing boundaries?
       → If so: adjust emotional state (bashful/guarded/cold)
       → If persistent: flag user behavioral_flags

    f. MEMORY CAPTURE: Did the user share something worth remembering?
       → Store in user's surface memories
       → Will be loaded next session ("You mentioned you like [X]")

13. State Hot-Reload Triggers:
    The persona prompt is regenerated and injected when:
    - Emotional state changes to a significantly different state
    - User unlocks a new memory
    - Relationship level changes
    - User triggers a boundary response
    - Every 10 minutes (ambient refresh with latest conversation context)
```

## Phase 5: Session End

```
14. Session ends when:
    a. User says goodbye / leaves the meeting
    b. Claudia detects the user has left (MeetingBaaS reports participant gone)
    c. Session timeout (configurable, default 60 minutes)
    d. Claudia ends it (cold state + further provocation)

15. Goodbye behavior (varies by relationship level):
    Level 0: "Nice talking to you." (neutral)
    Level 1: "Talk to you next time." (friendly)
    Level 2: "I'll remember this. See you soon." (warm)
    Level 3: "I'm glad you came by." (genuine)
    Level 4: "I'll be here." (simple, meaningful)

16. MeetingBaaS bot leaves the meeting
17. GPU worker released back to pool
```

## Phase 6: Post-Session Processing

```
18. Brain Service processes the session:

    a. SESSION RECORD:
       - Duration, topics discussed, emotional arc
       - Notable moments (unlock events, level changes, boundary events)
       - Signal quality scores

    b. USER RECORD UPDATE:
       - total_sessions++
       - total_minutes += duration
       - last_seen = now
       - relationship.progression_score adjusted
       - emotional_context.last_emotional_state saved
       - emotional_context.emotional_trend recalculated
       - behavioral_flags recalculated

    c. MEMORY CONSOLIDATION:
       - Raw conversation context → extract memorable facts
       - Deduplicate against existing memories
       - Store new surface memories
       - Update unlock_progress for touched topics

    d. UNLOCK PROGRESS:
       - For each topic touched this session:
         - Increment touch_count
         - Update emotional_quality (rolling average)
         - Check if ready_to_unlock threshold met
         - If so: flag for next session

    e. ANALYTICS EVENT:
       - Session summary for product analytics
       - Anonymized for aggregate metrics
```

## Error Handling

```
GPU Worker Crash:
  → MeetingBaaS keeps bot in meeting (shows frozen avatar)
  → Orchestrator provisions new worker (3-5s cold start)
  → Session state restored from last checkpoint
  → Claudia: "Sorry, I spaced out for a second. Where were we?"

MeetingBaaS Disconnect:
  → Session paused, not ended
  → If reconnection within 30s: resume
  → If not: end session gracefully, save state

PersonaPlex Quality Degradation:
  → Monitor response latency and audio quality
  → If latency > 500ms sustained: log warning
  → If latency > 2000ms: "I'm having a hard time hearing you, can you repeat that?"

User Leaves Without Goodbye:
  → Session ends after 30s of no audio input
  → Post-session processing runs normally
  → Next session: "Hey, we got cut off last time" (if Level 1+)
```

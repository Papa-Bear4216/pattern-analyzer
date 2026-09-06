# Pattern Analyzer — Technical Spec

**Status:** Active Specification — Subscription Layer Dropped  
**Owner:** Michael Hebert  
**Updated:** 2026-09-05  

---

## 01 — Overview

The system is a resource-efficient, proactive behavioral-pattern discovery, automation suggestion, and shortcut lifecycle engine. Its purpose is to observe user activity across devices, detect repetitive tasks and workflow friction, synthesize concrete automations or shortcuts, and govern those automations through an adaptive, self-pruning lifecycle.

The architecture comprises three coordinated layers:

1. **Perception Layer (Sensory & Telemetry)**
   - **Native Usage Collector** (`com.registry.collector`): Runs lightweight background `WorkManager` workers polling Android's `UsageStatsManager` for app dwell times, frequencies, and temporal usage distributions.
   - **Contextual Coach** (`com.registry.coach`): Monitors foreground window switches via an `AccessibilityService`. When a high-friction dwell or repetitive transition is detected, it runs an on-device **Gemini Nano** evaluator to identify task gaps while preserving strict privacy.
   - **Desktop Activity Heartbeat** (`tool-registry-heartbeat`): Observes desktop activity and long-term memory (Pieces LTM) to identify cross-platform workflow patterns.

2. **Pattern Analyzer Lifecycle Engine (Core Evaluation)**
   - Maintains O(1) memory aggregate counters at Tier 0 (`Observed`).
   - Promotes qualifying recurring sequences into a size-constrained candidate pool governed by Least Frequently Used with Exponential Decay (LFU-with-decay).
   - Evaluates patterns through a two-stage filter: **Stage 1 (Recency Gate)** and **Stage 2 (Utility & Adoption Ratio)**.
   - Graduated automations enter the **Keep Tier**, where they earn a reusability meter and are protected by a **14-day reset clock**.
   - Automations that fall into disuse automatically decay through **Review** and **Archive**, preventing cognitive and device clutter.

3. **Intervention & Execution Layer (Second Guess & OS Targets)**
   - **In-Context Prompting** (`BubbleOverlayService`): Floating, anti-tapjacked UI overlay in Contextual Coach that presents in-moment shortcuts when a known gap or pattern is active.
   - **Staging Workbench** (`Second Guess / StagingScreen`): Asynchronous human triage interface where discovered workflow patterns and suggested automations are reviewed and approved.
   - **Monthly Review Checkpoint** (`Second Guess / MonthlyReviewScreen`): The single mandatory human gate. Prunes or re-authorizes demoted automations before final offboarding.
   - **Automation Runners**: OS-level targets including Android Intents, Termux scripts, deep links, and desktop task automation.

### Governing Constraint
**Every stage is fully automated, with exactly one mandatory human touchpoint.** Telemetry ingestion, pattern clustering, candidate scoring, decay clocks, and tier transitions execute autonomously. The sole required human touchpoint is the monthly review checkpoint prior to permanent offboarding (`Cut`). Nothing built and trusted is discarded without explicit human confirmation.

---

## 02 — Telemetry & Tier 0 Perception

Telemetry collection runs continuously without manual intervention. To ensure zero storage bloat and flat memory overhead, the system strictly forbids storing unbounded raw event logs at rest.

### Telemetry Signals
- `foreground_app`: Package name and window identifier.
- `dwell_time_ms`: Verified active interaction duration.
- `transition_sequence`: Ordered tuple of app switches within a temporal window (e.g., `[AppA, AppB, AppA]` within 3 minutes).
- `task_gap_flag`: Synthesized by on-device Gemini Nano when screen state reveals repeated manual formatting, copy-paste churn, or multi-step routine actions.
- `shortcut_execution`: Verified execution event of an existing automation.

### Tier 0 Bounded Aggregates
Every tracked app or pattern signature is tracked at Tier 0 using bounded O(1) structures:
- **Running Aggregates**: Total interaction count, cumulative dwell time, and moving average launch frequency.
- **Fixed-Size Ring Buffer**: The last 16 event timestamps and durations per signature. Once filled, new observations overwrite the oldest slot.
- **Memory Invariant**: Flat memory overhead $O(1)$ per entity regardless of whether the system has been running for two days or two years.

---

## 03 — State Machine & Lifecycle

```
                         Gate: High Utility & Adoption
   ┌──────────┐  ──────────────────────────────────────────►  ┌──────────────────┐
   │ OBSERVED │                                                │      KEEP        │◄─┐ Execution
   │  Tier 0  │  ─── Promoted to Bounded Pool ──┐              │ reusability meter│  │ resets
   │ counters │                                 │              └────────┬─────────┘  │ 14d clock
   └────┬─────┘                                 ▼                       │ 14d unused
        │                              ┌─────────────────┐              ▼
        │                              │    CANDIDATE    │     ┌─────────────────┐
        │                              │  LFU-with-decay │     │     REVIEW      │
        │                              └────────┬────────┘     │ 14d dormant or  │
        │                                       │ rejected     │ high friction   │
        │                                       ▼              └────────┬────────┘
        │                              ┌─────────────────┐              │ 14d unused
        │                              │  COLLAPSE / PRUNE│              ▼
        │  ◄── Restore on Execution ───┴─────────────────┴─────│     ARCHIVE     │
        │                                                      │ 28d dormant     │
        │                                                      └────────┬────────┘
        │                                                               │ Monthly Batch
        │                                                               ▼
        │                                                      ┌─────────────────┐
        │                                                      │  SECOND GUESS   │
        │                                                      │ monthly review  │
        │                                                      └────────┬────────┘
        │                                                               │ confirmed Cut
        │                                                               ▼
        │                                                      ┌─────────────────┐
        └──────────────────────────────────────────────────────│       CUT       │
                                                               │  offboard / rm  │
                                                               └─────────────────┘
```

### Lifecycle Tiers

1. **Observed (Tier 0)**: Unpromoted baseline counters. Monitored for recurring frequency and dwell thresholds.
2. **Candidate (Promotion Pool)**: Bounded competitive pool (capacity: $N=50$ candidates). Competes on an Exponential Moving Average (EMA) frequency score. Once a candidate proves stability, a concrete shortcut/automation is synthesized and dispatched to Second Guess.
3. **Keep**: Graduated, user-approved automation.
   - Earns a running **reusability meter** (incremented on every verified execution).
   - Protected from competitive pool eviction.
   - Guarded by a **14-day decay clock**.
4. **Review**: Demoted state entered when:
   - An active **Keep** automation receives 0 executions for 14 consecutive days ("dormant automation"), OR
   - The Stage 2 gate flags high prompt frequency with low user adoption ("annoying/low-value automation").
5. **Archive**: An automation in **Review** that remains unused for an additional 14 days (28 days total). It is deactivated from active overlays but retained for the monthly human checkpoint.
6. **Cut**: Reached exclusively via the monthly Second Guess checkpoint. Removes the automation script/intent and archives telemetry history.

### The Two-Stage Evaluation Gate

Automations and candidates are continuously evaluated through a sequential two-stage gate:

#### Stage 1: Recency & Activity Gate (Binary)
A binary check determining whether the pattern or automation has had verified user activity within the required time window.
- For **Keep** automations: Has it been executed within the last 14 days?
- For **Observed** patterns: Has the signature repeated at least 3 times in the last 7 days?

If an item fails Stage 1, it immediately routes toward demotion (`Review` / `Archive`). Stage 2 is skipped because value is meaningless for an inactive entity.

#### Stage 2: Utility & Adoption Ratio
For entities passing Stage 1, Stage 2 evaluates whether the automation produces net positive utility or merely introduces prompt friction.

$$\text{Utility Score} = \left( \frac{\text{Executions Accepted}}{\text{Prompts Displayed}} \times \text{Estimated Seconds Saved} \right) - \text{Dismissal Penalty}$$

- **High Adoption ($\ge 60\%$)**: Maintained in **Keep**; reusability meter accelerates.
- **Low Adoption ($< 20\%$) with High Prompts**: Flagged as noisy/low-value; demoted to **Review** with `reviewReason = 'high_friction'`.

### Decay Clocks & Execution Reset
- **Full Binary Reset**: Any single execution of a **Keep** automation resets its 14-day clock in full to `now + 14 days`. Resets are binary: a single verified use grants the complete 14-day window.
- **Demotion**: 
  - 14 days without execution $\rightarrow$ demote to **Review**.
  - 14 additional days without execution $\rightarrow$ demote to **Archive**.
- **Execution from Review**: If the user runs an automation while it sits in **Review**, it immediately restores to **Keep** and resets its 14-day clock.
- **Archive Collapse**: If an item in **Archive** is not preserved during the monthly human checkpoint, it collapses to plain **Observed** Tier 0 counters or is permanently **Cut**.

### Bounded Promotion Pool & EMA Decay
- The Candidate tier is bounded to 50 active candidate slots.
- To prevent older patterns from permanently ossifying the pool and blocking newly formed user habits, candidate scores decay exponentially:
  $$S(t) = S_0 \times 2^{-\frac{\Delta t}{\lambda}}$$
  where $\lambda = 30\text{ days}$ (half-life), and $\Delta t$ is days elapsed since last observation.
- Eviction runs on a nightly batch schedule. When the pool is full, the lowest-scoring decaying candidate is evicted.

---

## 04 — Perception & On-Device Gap Evaluation

### 1. Contextual Coach Integration
Contextual Coach (`contextual-coach`) operates as a privacy-first sensory engine:
- **Accessibility Monitoring (`AccessibilityMonitor`)**: Subscribes to `TYPE_WINDOW_STATE_CHANGED`.
- **Pre-Filtering Gates**:
  1. Skips all launcher, dialer, and system apps.
  2. Enforces the `DenylistFilter` using bundled `sensitive_apps.json` (excluding banking, medical, password management apps).
  3. Evaluates dwell times using `DwellTimer` (disregarding fast app transitions $<10\text{s}$).
- **On-Device Gemini Nano (`GeminiNanoGapEvaluator`)**:
  - Leverages Google AICore on-device AI.
  - Inspects active accessibility node trees ephemerally to identify workflow friction (e.g., repetitive manual entry).
  - Emits `GapResult.RealGap` containing non-sensitive workflow descriptions.
  - Zero screen text or PII is ever written to disk or sent to the cloud (strictly verified by custom Android Lint rule `NoLoggingInPrivacyZoneDetector`).

### 2. Native Usage Collector
- Operates via Android `UsageStatsManager`.
- Aggregates daily app foreground duration and launch tallies.
- Emits structured, idempotent telemetry batches via `/ingest`.

---

## 05 — Second Guess: Interaction & Offboarding

Second Guess (`com.anonymous.registryapp`) serves as the presentation, triage, and human checkpoint layer.

### 1. In-Context Suggestions (`BubbleOverlayService`)
When Contextual Coach detects that a known pattern or graduated automation is applicable to the current screen:
- A floating chat-head overlay pill appears.
- Displays a concise suggestion (e.g., *"Run 'Export to Sheet' shortcut"*).
- Tapping the bubble triggers the OS automation intent and logs an execution event, resetting the 14-day clock.

### 2. Staging Screen (`StagingScreen`)
- Surfaces newly discovered workflow patterns and synthesized shortcut candidates.
- Allows the user to inspect the trigger conditions, view the estimated time saved, test the shortcut, and either **Approve** (promoting to `Keep`) or **Reject** (discarding the candidate).

### 3. The Single Human Checkpoint (`MonthlyReviewScreen`)
A monthly review is generated on the 1st of every month:
- Aggregates all automations that dropped into `Review` or `Archive` during the preceding cycle.
- Presents a simple, decisive UI:
  - **Keep**: Restores the automation to the `Keep` tier and resets its 14-day clock (useful for seasonal or monthly workflows).
  - **Cut**: Confirms removal of the automation, unregistering shortcuts and pruning the active state.
- **Invariant**: No graduated automation is ever discarded automatically. The human checkpoint is mandatory before any automation is **Cut**.

---

## 06 — System Constants & Parameters

| Parameter | Value | Rationale |
|---|---|---|
| `KEEP_DECAY_CLOCK_DAYS` | 14 days | Balances habit retention with timely identification of abandoned workflows. |
| `REVIEW_TO_ARCHIVE_DAYS` | 14 days | Provides a 2-week buffer in Review before deep archiving. |
| `CANDIDATE_POOL_CAPACITY` | 50 patterns | Strict O(1) space bound on competing candidate patterns. |
| `SCORE_DECAY_HALF_LIFE_DAYS`| 30 days | Halves unreinforced pattern scores monthly to allow new habits to surface. |
| `TIER0_RING_BUFFER_SIZE` | 16 events | Provides statistical frequency baselines with fixed memory footprint. |
| `STAGE2_ADOPTION_THRESHOLD` | 0.60 (60%) | Automations accepted $\ge 60\%$ of prompts stay in Keep. |
| `STAGE2_FRICTION_THRESHOLD` | 0.20 (20%) | Automations dismissed $>80\%$ of prompts are demoted as noisy. |

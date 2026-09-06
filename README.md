# Pattern Analyzer

A resource-efficient, proactive behavioral-pattern discovery, automation suggestion, and shortcut lifecycle engine.

Pattern Analyzer continuously processes user interaction telemetry across devices, detects repetitive workflows and task gaps, synthesizes concrete automations (scripts, shortcuts, intents), and governs them through an adaptive, self-pruning lifecycle.

---

## The Vision

> *"Something that could point out multiple patterns the user uses and use that to suggest a 'better way'. Sets up an automation or something. Creates a script that runs with a shortcut. But by watching usage stats and auditing and graphing the data to compile suggestions."*

Most automation tools require the user to manually anticipate, write, and maintain scripts. Pattern Analyzer reverses the burden: it observes real user habits, identifies workflow friction, suggests concrete automations, and automatically retires automations that are abandoned so that devices remain clutter-free.

---

## Architecture Overview

Pattern Analyzer operates across three coordinated layers:

1. **Perception Layer (Continuous Telemetry & On-Device AI)**
   - **Native Usage Collector** (`com.registry.collector`): Background `WorkManager` workers polling Android's `UsageStatsManager` for app dwell times and launch frequencies.
   - **Contextual Coach** (`com.registry.coach`): Watches foreground window switches via an `AccessibilityService`. When task gaps or repetitive dwell transitions are detected, on-device **Gemini Nano** evaluates workflow friction under strict zero-logging privacy rules.
   - **Desktop Heartbeat** (`tool-registry-heartbeat`): Cross-references desktop activity and Pieces LTM to discover multi-step workflows.

2. **Pattern Analyzer Core Engine (Bounded & Decaying State Machine)**
   - **Tier 0 (Observed)**: $O(1)$ flat-memory aggregate counters and fixed ring buffers. Zero persistent event log bloat.
   - **Candidate Pool**: Bounded competitive pool ($N=50$) governed by Least Frequently Used with Exponential Moving Average (LFU + EMA) decay. Older habits decay over a 30-day half-life so new habits can surface.
   - **Graduation Gate**: Evaluates recency (Stage 1) and Utility & Adoption Ratio (Stage 2: $\frac{\text{Accepted}}{\text{Prompted}} \times \text{Time Saved}$).
   - **Keep Tier**: Active automations earn a reusability meter and a **14-day reset countdown clock**. Any verified execution fully resets the 14-day clock.
   - **Review & Archive**: Unused automations demote to `Review` (14d) $\rightarrow$ `Archive` (28d).

3. **Intervention & Execution Layer (Second Guess & Overlay)**
   - **Contextual Coach Overlay** (`BubbleOverlayService`): In-context floating pill that suggests shortcuts right when a relevant workflow begins.
   - **Second Guess Client** (`com.anonymous.registryapp`): React Native / Expo triage client. Review unconfirmed workflow candidates on `StagingScreen`.
   - **The Single Human Checkpoint** (`MonthlyReviewScreen`): Exactly one mandatory manual gate per month. Surfaces demoted automations for a decisive **Keep** or **Cut** before offboarding.

---

## Repository Structure

- **`docs/`**: Technical specification (`docs/pattern-analyzer-spec.md`).
- **`research/`**: Reverse-engineering and architecture mapping of connected client apps and backend functions.
- **`src/`**: Core TypeScript lifecycle engine (types, decay math, bounded pool, state machine, and test suite).

---

## Status

- **Specification**: Complete and aligned on pure pattern & automation lifecycle (all subscription/billing layers dropped).
- **Core Engine**: TypeScript implementation in progress (`src/`).
- **Client & Backend Ecosystem**: Implemented and deployed in [`projects/registry-app`](file:///C:/Users/micha/projects/registry-app).

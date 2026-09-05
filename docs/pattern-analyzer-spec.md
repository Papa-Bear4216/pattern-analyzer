# Pattern Analyzer — Technical Spec

**Status:** Draft — being re-framed
**Owner:** Michael Hebert
**Updated:** 2026-09-05
**Styled version:** `pattern-analyzer-spec.html` · [published Artifact](https://claude.ai/code/artifact/58024ff8-d530-4832-814f-a69c15ef4356)

---

> ⚠️ **Re-framing in progress.** The prose below still describes the mechanism in
> *subscription/tool-audit* terms (Core Registry / cost-per-use / cancellation).
> That was a wrong turn while drafting. The real target is the general
> *usage-pattern → automation/shortcut suggestion* engine. The state machine
> itself — tiers, decay clocks, bounded pool, one human checkpoint — carries over
> unchanged; only the domain nouns need swapping. See
> `research/registry-stack-findings.md`.

---

## 01 — Overview

The system has three parts, each with a distinct responsibility:

- **Core Registry** — the source of truth. Discovers and stores every tracked
  entity, along with the raw telemetry (logins, API calls, device interactions)
  that everything downstream evaluates against.
- **Registry Coach** — the evaluation engine. Runs telemetry through a tiered
  state machine to determine whether a given entity is alive, dormant, or worth
  its cost.
- **Second Guess** — the intervention layer. Intercepts renewal cycles for
  anything the Coach flags and, for the one action with real-world consequences,
  forces a deliberate human decision before it happens.

The governing constraint across all three: **every stage is fully automated, with
exactly one mandatory human touchpoint.** Discovery, telemetry collection,
dormancy detection, cost-per-use scoring, and every tier transition run without
manual input. The sole required exception is the monthly Second Guess review that
precedes any irreversible action — nothing is cut without an explicit human
decision. Everything else in this document exists to make that one moment
well-informed and infrequent.

## 02 — Inputs

The source of truth everything else reads from. Covered lightly here — the state
machine in Section 03 is the focus of this document.

### Schema

- Entity name
- Billing interval
- Cost per cycle
- Renewal date
- Authentication method
- Category tag (e.g. Infrastructure, Productivity, Development)

### Ingestion & telemetry

Fully automated end to end — discovery and telemetry (login events, API call
frequency, device interactions) both run with no manual input required. Mechanics
are out of scope for this document; what matters downstream is that every
registered item arrives with a running utilization baseline attached.

## 03 — State Machine

Every registered item is continuously subject to a two-stage filter. **Stage 1
(dormancy gate)** is a binary alive/dead check on activity, independent of price.
Only items that pass Stage 1 reach **Stage 2 (cost-per-use)**, which divides spend
by verified interactions to catch tools that are technically alive but not worth
what they cost. The two stages never run in the other order — cost is irrelevant
to something already dead.

### Lifecycle

```
                         gate: alive & justified
   ┌──────────┐  ───────────────────────────────────────►  ┌──────────────────┐
   │ OBSERVED │                                             │      KEEP        │◄─┐ usage resets
   │  Tier 0  │  ──── gate: alive, overpriced ───┐          │ reusability meter│  │ 14d clock
   │ counters │                                  │          └────────┬─────────┘  │
   └────┬─────┘  ── gate: dormant ──┐            │                   │ 14d unused
        │                           │            ▼                   ▼
        │                           │   ┌────────────────────────────────────┐
        │  ◄── override, kept ──────┼───│      REVIEW / ARCHIVE              │
        │        (dashed)           │   │   dormant  or  overpriced          │
        │                           │   └───────────────┬────────────────────┘
        │                           │                   │ flagged, monthly report
        │                           ▼                   ▼
        │                     ┌───────────────────────────────┐
        │                     │        SECOND GUESS           │
        │                     │   monthly · human required    │
        │                     └───────────────┬───────────────┘
        │                                     │ confirmed
        │                                     ▼
        │                             ┌───────────────┐
        └─────────────────────────────│      CUT      │
                                      │  offboarding  │
                                      └───────────────┘
```

Every item cycles between Observed, Keep, and Review/Archive on the two-stage
gate; only the Second Guess checkpoint can route an item to Cut.

### Tiers

- **Observed** — Tier 0. Cheap always-on aggregate counters for every registered
  item: running counts and bounded ring buffers, never raw event logs at rest.
  Memory cost is flat regardless of history length. Every item here is
  continuously re-checked against the two-stage gate.
- **Keep** — earned by passing both gate stages. Carries a reusability meter and
  is protected from any competitive eviction. Any usage event resets a 14-day
  dormancy clock.
- **Review / Archive** — entered one of two ways: a **Keep** item goes 14 days
  without use ("dormant-but-not-dead-yet"), or a Stage 2 evaluation finds a live
  item overpriced for its actual use ("alive-but-overpriced"). Same bucket,
  distinct causes — worth different UI copy later (see Section 06).
- **Cut** — reached only through Second Guess. Triggers Offboarding Automation
  (Section 05).

### Decay & reset

- Any usage event on a **Keep** item resets its 14-day clock in full — not a
  partial credit, a full reset. A single use within 14 days resets it; each
  subsequent use resets it again.
- 14 days unused in **Keep** → demotes to **Review / Archive**.
- 14 more days unused in **Review / Archive** → collapses all the way back to
  **Observed**. Nothing is deleted; the item simply loses all earned status and
  must re-earn **Keep** from scratch through the gate again.
- Demoted items never re-enter a competitive promotion pool — they just carry the
  plain meter until they either re-earn Keep or get caught by Second Guess.

### The one human checkpoint

A monthly report surfaces everything that dropped into **Review / Archive** (or
failed the dormancy gate outright) since the last report. The user explicitly
kicks or keeps each one — overriding the automatic clock in either direction.
Items the user may simply have forgotten about surface here for a deliberate
keep/kick decision. This is the single mandatory manual step in the entire system
(Section 01); nothing reaches **Cut** without it. Full mechanics in Section 05.

## 04 — Registry Coach: Policy Auditing

*[To be written — light section: tier mismatches, redundant/overlapping
capabilities across platforms, upcoming auto-renewals needing proactive
intervention.]*

## 05 — Second Guess: Intervention & Offboarding

*[To be written — blocked on a description of what the existing Second Guess app
actually does. Light section: monthly checkpoint mechanics, triage-to-action
mapping, offboarding automation (cancellation steps, config backup export,
downstream dependency check).]*

## 06 — Open Questions / TBD

- **Domain re-framing** — whole doc still reads as subscription auditing; needs
  re-basing on usage-pattern → automation suggestion. Blocking.
- **Where it plugs in** — inside Registry Coach's evaluator (upgrading
  `GapEvaluator` / `CachedTaskRanking`), or as new logic between Coach output and
  Second Guess.
- **Dormancy threshold values** — 30 vs 60 days for the initial flag; not
  settled, only an example range.
- **Review's two sub-flavors** — whether "dormant" vs "overpriced" get distinct
  UI treatment. Discussed as worth doing later, not decided.
- **Cost-per-use formula** — beyond spend ÷ verified interactions; how a
  "verified interaction" is defined per integration type. Not discussed.
- **Offboarding dependency-check mechanics** — not discussed beyond "flag
  downstream service dependencies before purge".
- **Second Guess confirmation UX** — explicitly deferred; not designed.
- **What the meter measures post-graduation** — the underlying pattern (does the
  user still do the thing) vs. engagement with the suggestion/shortcut itself.
  Leaning toward shortcut-engagement.

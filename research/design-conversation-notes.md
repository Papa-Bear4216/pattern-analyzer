# Design Conversation Notes

Captured from the working session that produced the spec. This is the reasoning
trail behind the state machine — kept so the "why" isn't lost.

## Origin

Started as an unrelated idea (a fingerprint-scanner "different finger per day of
week" Android app — dropped as infeasible: Android's biometric APIs never reveal
*which* finger authenticated, and no app can gate the OS lock screen). The
brainstorm that followed produced the real idea, and the true seed prompt was:

> "Something that could point out multiple patterns the user uses and use that to
> suggest a 'better way'. Sets up an automation or something. Creates a script
> that runs with a shortcut. But by watching usage stats and auditing and graphing
> the data to compile suggestions."

## The efficiency insight

Don't deep-log everything. Use **tiered / adaptive sampling** (same idea as APM
tools that run cheap always-on counters and only switch on expensive tracing once
a threshold trips):

- **Tier 0** — O(1) memory per entity: running aggregates + a fixed-size ring
  buffer of recent events. Flat cost regardless of history length.
- **Escalation** — once a sequence repeats past a threshold, *that specific
  pattern* is promoted and gets finer-grained tracking. Cost scales with number
  of confirmed patterns (small), not total event volume.
- **Tier 1** — targeted fine-grained logging for promoted patterns only; once a
  stable statistical baseline exists, raw samples can be discarded.

## Bounded pool + graduation

- The promoted tier is a **fixed-size pool** (LFU-with-decay eviction — like a
  cache replacement policy applied to patterns instead of memory pages). A new
  pattern only takes a slot if it beats the weakest occupant.
- Score should **decay** (EMA / periodic halving), not be a raw count — otherwise
  the oldest patterns ossify the pool and genuinely new habits can't displace
  them. Real usage drifts over months; the design has to allow for it.
- Eviction runs **on an interval** (nightly), not on every promotion attempt —
  cheaper, avoids thrashing when two patterns are neck-and-neck.
- Once a pattern is resolved into a concrete artifact (a shortcut / automation /
  QoL change), it **graduates out** of the competitive pool entirely — it's not
  competing to prove itself anymore. It moves to a protected tier ("Keep" /
  originally "Hall of Fame") with a **reusability meter** that only goes up with
  continued use.

## Decay clocks (the part that made it into the spec)

- Any single use within 14 days **fully resets** the Keep clock. Binary
  (used/not-used), not amplitude — the meter already handles magnitude.
- 14 days unused → demote to **Archive** (still cheaply counted at Tier 0, no
  protection, no active suggestion).
- 14 more days unused in Archive → collapse to plain **Observed**. Nothing is
  deleted from history; the item just loses earned status and re-earns from
  scratch.
- Demoted items do **not** re-enter the competitive pool. They carry only the
  plain meter.

## Human checkpoint

- **Monthly stale-item report**: everything that dropped to Archive (or is near
  it) since last report. User explicitly **kicks or keeps** each — overrides the
  automatic clock in either direction. Covers the "maybe they forgot about it"
  case.
- This is the **single mandatory manual step**. Everything else is 100%
  automated. Nothing is Cut without it — because Cut has real-world consequences
  (in the automation framing: removing a shortcut the user built trust in;
  in the subscription framing: cancelling a paid service).

## Two-stage filter

- **Stage 1 — dormancy gate**: binary alive/dead on activity. Runs first, gates
  everything. Price/value irrelevant here.
- **Stage 2 — cost-per-use**: only for Stage 1 survivors. `spend ÷ verified
  interactions` (subscription framing) or `value ÷ engagement` (automation
  framing — an automation that fires constantly but is never acted on is low
  value despite high frequency).
- Order is fixed: cost is meaningless for something already dead.

## Triage states

- **Keep** — passed both filters.
- **Review** — underutilized *or* overpriced. Two distinct sub-flavors
  ("dormant-but-not-dead-yet" vs "alive-but-overpriced") that land in the same
  bucket for the human checkpoint but read very differently to a user ("not
  touched in 3 weeks" vs "fires 40×/day, never acted on"). Distinct UI copy is
  worth doing, not yet decided.
- **Cut** — failed dormancy decisively; routed through the human checkpoint.

## Known wrong turn

Midway through, "registry" got narrowed to *subscription/tool cost auditing*
specifically, and the spec inherited that framing (Core Registry of licenses,
cost-per-cycle, cancellation). That was never the real product — it was one
example mapping that took over. The real product is the general
usage-pattern → automation/shortcut engine. The **mechanism is unchanged**; the
domain nouns need swapping back. Tracked as the first Open Question in the spec.

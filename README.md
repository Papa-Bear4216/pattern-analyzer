# Pattern Analyzer

Working repo for the **Pattern Analyzer** — a resource-efficient, tiered behavioral-pattern
lifecycle engine intended to slot into the existing Registry app stack
(Registry Usage Collector → Registry Coach → Second Guess).

## Status

Early design. Nothing built here yet — this repo currently holds:

- **`docs/`** — the technical spec (in progress). See `docs/pattern-analyzer-spec.md`
  and the styled HTML version `docs/pattern-analyzer-spec.html`
  (published Artifact: <https://claude.ai/code/artifact/58024ff8-d530-4832-814f-a69c15ef4356>).
- **`research/`** — reverse-engineering notes on the two APKs shared so far
  (`Registry Usage Collector`, `Registry Coach`). The `Second Guess` APK was too
  large to inspect; findings on it are pending a description or source access.

> ⚠️ The spec in `docs/` still carries an early **subscription/tool-audit framing**
> that was a wrong turn during drafting. The real target is the general
> **usage-pattern → automation/shortcut suggestion** engine described in
> `research/registry-stack-findings.md`. The spec needs re-framing before it's built on.

## The original idea

> "New innovative app idea. Something nobody has done and would drastically improve
> my life as a whole. Improves my efficiency. Lowers the manual hands-on work.
> Something that could point out multiple patterns the user uses and use that to
> suggest a 'better way'. Sets up an automation or something. Creates a script that
> runs with a shortcut. But by watching usage stats and auditing and graphing the
> data to compile suggestions."

## The missing piece

Registry Coach already detects patterns (`GapEvaluator`, on-device Gemini Nano) and
ranks them (`CachedTaskRanking`). What it does **not** have — and what this repo is
for — is a bounded-memory promotion/decay lifecycle: cheap always-on counters,
promotion into a size-limited competitive pool, graduation into a protected tier
with a reusability meter, decay clocks, and a single monthly human checkpoint
before anything a suggestion produced gets removed.

See `docs/` for the full mechanism.

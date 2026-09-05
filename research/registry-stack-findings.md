# Registry Stack — Reverse-Engineering Findings

Notes from inspecting two APKs shared on 2026-09-05. Method: `unzip` + `strings`
on the DEX files (no `aapt`/`apktool`/`jadx` available), so this is class-name and
string-literal level analysis, not decompiled source. Treat as strong hints, not
confirmed behavior.

The `Second Guess` APK was **too large to upload** — no findings on it yet.

---

## Backend

Both apps point at a Firebase project **`registry-app-prod`**
(project ID suffix `7a07c`). This is a different project from `hermes-api`, which
appears unrelated to the Registry stack.

- Ingest endpoint: `https://us-central1-registry-app-prod-7a07c.cloudfunctions.net/ingest`
- Coach also uses Firestore + Firebase Auth directly (see DI modules below).

---

## Registry Usage Collector — `com.registry.usagecollector`

Small, single-DEX app (~3.5 MB). A lightweight background telemetry agent.

### Observed classes

| Class | Role (inferred) |
|---|---|
| `com.registry.collector.CollectorApplication` | App entry |
| `com.registry.collector.ui.MainActivity` | Single screen — likely just permission grant + status |
| `com.registry.collector.worker.UsageCollectorWorker` | `WorkManager` periodic worker — the core of the app |
| `com.registry.collector.network.IngestPayload` | Outbound payload wrapper |
| `com.registry.collector.network.IngestBody` | Payload body |

### Observed behavior signals

- Uses `android.app.usage.UsageStatsManager` — reads system-level app usage stats
  (requires the special-access `PACKAGE_USAGE_STATS` permission, granted manually
  in Settings, not a runtime dialog).
- `WorkManager` periodic job packages usage into an `IngestPayload` and `POST`s to
  the `/ingest` Cloud Function.
- Log strings seen: `IngestBody(collector=phone_usage, sourceId=...)`,
  `IngestPayload(usageCount=...)`, `POST /ingest failed (...)`,
  `ingest POST failed: HTTP ...`.

### Takeaway

This **is** the Core Registry ingestion pipeline. Already 100% automated: no
manual entry, periodic background collection, single HTTPS POST. Matches the
"ingestion is fully automated" constraint in the spec.

---

## Registry Coach — `com.registry.coach`

Large, multi-DEX app (~25 MB). Native Kotlin + Jetpack, Hilt/Dagger DI, Firebase,
gRPC, Jetpack Compose. This is the real on-device evaluation + coaching layer, and
it does its **own** monitoring independent of the Usage Collector.

### Observed classes, grouped

**Monitoring**
| Class | Role (inferred) |
|---|---|
| `monitor.AccessibilityMonitor` | `AccessibilityService` — watches foreground app / screen changes live |
| `monitor.DwellTimer` | Measures time spent (dwell) per app/screen |
| `monitor.AnonymousCounters` | `syncDailyAggregates()` — anonymous, aggregated daily counters synced to backend |

**Evaluation**
| Class | Role (inferred) |
|---|---|
| `evaluator.GapEvaluator` | Detects "gaps"; returns `GapResult.NoGap` or `GapResult.RealGap` |
| `evaluator.GeminiNanoGapEvaluator` | Gap evaluation via **on-device Gemini Nano** |

**Data / ranking**
| Class | Role (inferred) |
|---|---|
| `data.TaskCategory` (+ `$Companion`) | Enum-ish categorization of detected tasks |
| `data.CachedTaskRanking` | A ranked task entry |
| `data.LocalRankingCache` | On-device ranking cache |
| `data.FirestoreRankingCache` (+ `$RawRanking`) | Firestore-synced ranking, with a raw wire form |
| `data.CachedRegistryItem` | Cached registry entity |

**Privacy filtering**
| Class | Role (inferred) |
|---|---|
| `filter.DenylistFilter` | Excludes denylisted packages from monitoring |
| `filter.SensitiveAppsFile` | Serialized list of sensitive apps to never observe |

**UI**
| Class | Role (inferred) |
|---|---|
| `ui.BubbleOverlayService` | Floating bubble overlay — surfaces suggestions in-context (chat-heads style) |
| `ui.CoachSettingsActivity` | Settings |
| `ui.ConsentDisclosureActivity` | Privacy consent / disclosure screen |

**DI (Hilt modules)**
`di.DataModule`, `di.FilterModule`, `di.FirebaseModule`
(`ProvideFirestore`, `ProvideFirebaseAuth`, `ProvideBlockedPackages`).

### Takeaway

Registry Coach already does a lot of what earlier brainstorming assumed was
missing:

- Live usage monitoring via Accessibility + dwell timing ✔
- Bounded / aggregate-only counting (`AnonymousCounters.syncDailyAggregates`) —
  the "no raw logs, flat memory" principle is **already how it's built** ✔
- Pattern/"gap" detection, including an on-device LLM evaluator ✔
- Task categorization + ranking, local and Firestore-cached ✔
- In-context suggestion surfacing (`BubbleOverlayService`) ✔
- Privacy denylist for sensitive apps ✔

### What is NOT present in either APK

No class resembling any of:

- Tiers / a tiered state machine
- An archive or decay clock
- A "keep" tier or reusability meter
- A bounded competitive promotion pool
- A monthly review / human-checkpoint gate

The ranking exists (`GapEvaluator` + `CachedTaskRanking`), but there's no evidence
of the **bounded promotion/demotion lifecycle with decay clocks** that this repo's
spec describes. That absence is consistent with the user's statement that this
mechanism is the new/missing piece.

---

## Open items

1. **Second Guess** — need a description or the source. Unknown what triggers it,
   what it shows, what actions it offers.
2. **Where Pattern Analyzer plugs in** — replace/upgrade `GapEvaluator` +
   `CachedTaskRanking` inside Coach, or sit as a new stage between Coach's output
   and Second Guess?
3. **Repo location** — the Coach/Collector/Second Guess Android source repo has
   not been located. This repo (`pattern-analyzer`) is a placeholder until it is.

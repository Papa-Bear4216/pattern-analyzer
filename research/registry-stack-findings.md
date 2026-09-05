# Registry Stack — Reverse-Engineering Findings

Notes from inspecting two APKs shared on 2026-09-05. Method: `unzip` + `strings`
on the DEX files (no `aapt`/`apktool`/`jadx` available), so this is class-name and
string-literal level analysis, not decompiled source. Treat as strong hints, not
confirmed behavior.

The `Second Guess` APK was pulled directly from the connected device via ADB (`com.anonymous.registryapp`, app label `SecondGuess`, ~31.5 MB). Analyzed via Hermes bytecode string table extraction and DEX inspection.

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

---

## Second Guess — `com.anonymous.registryapp`

Medium-sized React Native / Expo application (~31.5 MB, compiled with Hermes Bytecode engine). App display name is **`SecondGuess`** (slug `registry-app`, Expo SDK 52/57 architecture with `SYSTEM_ALERT_WINDOW` permission).

This is the **human-facing triage, management, and intervention client** for the Registry stack. It talks directly to the same backend Firebase project: `registry-app-prod-7a07c`.

### Architecture & Data Flow

Second Guess serves as the interactive dashboard and review interface where patterns/items detected by Usage Collector and Coach are staged, matched, snoozed, reviewed, and persisted into the permanent Registry.

#### 1. Core Firestore Collections & Hooks
| Collection / Hook | Role |
|---|---|
| `observations` (`useObservations`) | Ingested live observation events / signals logged from devices (`handleLogObservation`, `logObservation`). |
| `staging_items` (`useStagingItems`) | Candidates pending user confirmation or automated promotion. Staged items undergo triage before graduating to the registry. |
| `registry_items` (`useRegistryItems`) | The active Registry of recognized, confirmed items and behavioral/tool subscriptions. |

#### 2. Screen & Navigation Structure
- **`RegistryListScreen`**: Primary list view of all active registered items, showing cost, status, billing/usage cycle (`billingCycle`, `annual`, `monthly`), and dormancy indicators.
- **`StagingScreen`**: The triage workbench for incoming items. Surfaces unconfirmed or newly observed candidates.
  - Matches candidate observations against existing registry items (`suggestedMatch`).
  - Allows the user to confirm or link an item (`resolveStagingItemId`).
  - Supports snoozing candidates (`snoozedUntil`).
  - Flags dormant items (`isDormantRow`).
- **`ItemDetailScreen`**: Detailed view of a specific registry item (`registryItemId`), containing its observation history, linked observations (`useObservations`), edit controls, and usage metrics.
- **`AddItemScreen`**: Form to manually register a new item into the registry.
- **`Settings` / `Alerts`**: Manages alert dismissals (`alertDismissals`) and preferences.

### Key Takeaway

Second Guess is the **presentation and resolution layer**:
- **Usage Collector** logs raw usage stats in the background to Cloud Functions.
- **Coach** monitors screen context, accessibility, and dwell times with local Gemini Nano evaluation, pushing ranked tasks / gaps into Firestore.
- **Second Guess** is the mobile client where the user interacts with `staging_items`, reviews `suggestedMatch` suggestions, snoozes or resolves staged items into `registry_items`, and audits dormant subscriptions/patterns.

---

### What is NOT present in any of the three APKs

No class or bundle code resembling:
- A tiered state machine with bounded promotion slots (LFU-with-decay cache replacement).
- Automatic decay clocks with periodic halving / EMA score attenuation.
- A protected "Keep" tier with a dedicated reusability meter.
- A monthly human checkpoint that cleanly bundles demoted items for a single kick-or-keep review before pruning.

The pieces are in place (`staging_items` in Second Guess, `CachedTaskRanking` and `GapEvaluator` in Coach), but the **lifecycle engine that manages the transitions between them automatically** is what is missing.

---

## Updated Open Items & Integration Surface

1. **Where Pattern Analyzer slots in**:
   - Inputs from: `observations` (Collector/Coach) and `GapEvaluator` / `CachedTaskRanking` (Coach).
   - Manages: Tier 0 counters → Promotion pool → Graduation to Keep tier → Decay clocks.
   - Outputs to: `staging_items` and `BubbleOverlayService` (Coach) / `StagingScreen` (Second Guess) when promotion thresholds trip, and feeds the monthly review list in Second Guess.
2. **Repo location**: Source code for Second Guess (React Native/Expo) and Coach/Collector (Kotlin Android) are not yet in this git repository, but we now have full DEX/HBC string extracts and architecture mapped.

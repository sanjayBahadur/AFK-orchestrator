# AFK Orchestrator — Architecture (finalized)

**Status:** finalized 2026-08-08. Supersedes the front half of
`~/.claude/plans/enchanted-scribbling-starlight.md`; that doc's dispatch/review/
merge/phase-gate material survives as Pipeline Stages 3–5 below.

**First test client:** Comfort Curators backend, built clean-room from scratch.

---

## 0. Naming

### 0.1 The tool

Project: **AFK Orchestrator**. Binary and CLI namespace: **`afk`**. All state
lives under **`.afk/`** in the client repo. `cc` is retired everywhere —
binary, docs, templates, commit trailers, git hooks.

```
afk doctor · afk init · afk interview · afk readback · afk sign-off
afk ledger · afk questions · afk contradictions · afk assumptions
afk graph · afk gate · afk contracts
afk housemaster · afk run · afk board · afk status

# brownfield mode (§4.0)
afk init --from-repo <url|path> [--ref <sha>] [--depth quick|standard|deep]
afk survey · afk reconcile · afk architecture-review · afk findings
```

### 0.2 Two axes, deliberately not sharing numbers

The earlier draft used "Stage 0" for both an implementation spike and a pipeline
phase. They are separate axes and now have separate vocabularies:

| Axis | Term | Meaning |
|---|---|---|
| What the system *does to a project* | **Pipeline Stage 0–5** | Interview → Decompose → Gate → Build → Integrate → Certify |
| What *we implement*, in order | **Milestone M0–M14** | Our own build order (§10) |

Never say "stage" for our build work; never say "milestone" for pipeline phases.

### 0.3 Entity IDs

Three-letter prefixes: unambiguous under `grep`, no collisions, readable in a
commit trailer. Numeric IDs are zero-padded to 4 and **monotonic per type**.

| Prefix | Entity | Example | Minted by |
|---|---|---|---|
| `REQ-` | Requirement — one atomic claim extracted from client input | `REQ-0031` | Housemaster |
| `DEC-` | Decision — a frozen, citable answer | `DEC-0042` | Housemaster |
| `QST-` | Open question | `QST-0017` | Housemaster |
| `CON-` | Contradiction between two or more records | `CON-0004` | Housemaster |
| `ASM-` | Recorded assumption (a deferred question with a chosen default) | `ASM-0009` | Housemaster |
| `CTR-` | Cross-chunk contract | `CTR-0002` | Housemaster |
| `FND-` | Structural finding about an existing codebase (brownfield) | `FND-0007` | Housemaster |
| `CHK-` | Chunk | `CHK-iam` | Planner |
| `BLK-` | Block | `BLK-iam-02` | Chunk Master |
| `TSK-` | Task | `TSK-iam-02-03` | Chunk Master |
| `AC-` | Acceptance criterion, scoped inside its block | `AC-04` | Chunk Master |

**Invariant — single minter.** Only the Housemaster process allocates
`REQ/DEC/QST/CON/ASM/CTR/FND` IDs, from `.afk/state/counters.yaml` under an
exclusive file lock. Agents *never* allocate; `file_blocker` returns the minted
ID. This removes ID races entirely rather than trying to survive them.
Structural IDs (`CHK/BLK/TSK/AC`) are slug-derived and deterministic, so they
need no counter.

### 0.4 Filesystem

```
<client-repo>/
├── docs/
│   ├── product/                  # the dump. frozen, human-authored, read-only
│   ├── readback/
│   │   ├── PROJECT-BRIEF.md      # generated client-level description
│   │   └── ARCHITECTURE-REVIEW.md# generated, brownfield only (§4.0 S4)
│   └── CONTEXT.md                # generated domain model + vocabulary
└── .afk/
    ├── ledger/
    │   ├── requirements/REQ-####.yaml
    │   ├── decisions/DEC-####.yaml
    │   ├── questions/QST-####.yaml
    │   ├── contradictions/CON-####.yaml
    │   ├── assumptions/ASM-####.yaml
    │   └── findings/FND-####.yaml    # brownfield only
    ├── survey/                       # brownfield only (§4.0 S1)
    │   ├── modules.yaml  api.yaml  data-model.yaml
    │   ├── tests.yaml  integrations.yaml  hotspots.yaml
    │   └── exclude.yaml              # vendored / generated globs
    ├── graph/
    │   ├── project.yaml
    │   ├── chunks/CHK-<slug>.yaml
    │   ├── blocks/BLK-<slug>-##.yaml
    │   ├── tasks/TSK-<slug>-##-##.yaml
    │   └── contracts/CTR-####.yaml
    ├── state/
    │   ├── counters.yaml
    │   ├── leases/                # claim protocol (§8.2)
    │   ├── signoff.yaml
    │   └── evidence/              # gitignored
    └── routing.yaml               # model routing, worker ceilings
```

`.afk/ledger/` is **outside every worker's bwrap mount**. Workers cannot read it
even if they try; the only path to it is Housemaster. Enforcement is physical,
not conventional.

---

## 1. Why the front half is the whole problem

Every prior attempt failed identically: a worker hit something the frozen docs
didn't answer, guessed, and the guess propagated. The master plan *banned*
concurrent tasks touching the same module — and `backend-alt` did it anyway to
`internal/iam/service.go`. The rule lived in prose, not in tooling.

Two mechanisms fix this, and everything else is machinery around them:

1. **Coverage.** No acceptance criterion may exist without a frozen decision
   backing it (§7.1).
2. **Sign-off.** No build starts until the client has confirmed a plain-language
   readback of what we understood (§4.6).

### The actual definition of "no guesswork"

Not *"never proceed without an answer"* — that deadlocks on the first question a
client can't answer today. It is:

> **Never proceed on an unrecorded, unsurfaced answer.**

A guess that is recorded as an `ASM-`, given a blast radius, printed in the
readback, and signed off is not a guess. It is a decision the client made. This
distinction is what keeps the system moving without reintroducing drift.

---

## 2. Pipeline stages

| Stage | Name | Gate to exit | Who |
|---|---|---|---|
| **0** | Interview — `greenfield` or `brownfield` mode (§4) | Signed readback + green Stage-0 gate | Interviewer (Claude Code) + human |
| **1** | Decompose | Graph validates | Planner (Claude Code) |
| **2** | Gate | All six gate checks green | `afk gate` (deterministic) |
| **3** | Build | All tasks merged into chunk branches | Chunk Masters + Builders |
| **4** | Integrate | Contracts satisfied, cross-chunk suite green | Orchestrator + Reviewers |
| **5** | Certify | Evidence revalidated, report sealed | `afk certify` |

Stages 3–5 are the earlier plan's material, unchanged in substance. This
document specifies 0–2 in full and the coordination layer that carries 3–4.

---

## 3. The stores

Four stores, deliberately not merged. Collapsing them is what made the earlier
"knowledge bank" concept mushy.

| Store | What it is | Mutability | Citable? |
|---|---|---|---|
| **Knowledge bank** `docs/product/` | What you *dumped* | Frozen, human-authored | No — must become a `REQ` first |
| **Requirement set** `REQ-` | Atomic claims *extracted* from the dump | Append; superseded by `DEC` | No |
| **Decision ledger** `DEC-` | What you *said under interrogation* | Append + supersede | **Yes — the only citable store** |
| **Open items** `QST`/`CON`/`ASM` | What nobody has settled yet | Read/write | No |

Atomization is not bureaucracy — it is the precondition for contradiction
detection. "Users can book a property and get a confirmation email within five
minutes" is three requirements, and only two of them conflict with anything.

### 3.1 Requirement

```yaml
id: REQ-0031
text: A one-time passcode is valid for 10 minutes.
kind: functional            # functional | nonfunctional | constraint | source-assumption | observed
origin: intended            # intended (from docs) | observed (from code — brownfield, §4.0)
source: {kind: doc, file: docs/product/auth.md, line: 84}
confidence: high            # high | medium | low — low is forced into the grill
entities: [otp, user]
status: open                # open | settled | contradicted | dropped
settled_by: null            # DEC-#### once resolved
```

`source.kind` is one of `doc | test | schema | implementation | history`, and it
**sets the confidence ceiling** (§4.0 S2). `origin` is what makes brownfield
reconciliation possible: intended-vs-observed is a diff over the same store.

### 3.2 Decision

```yaml
id: DEC-0042
title: OTP codes expire 10 minutes after issuance
scope: chunk:CHK-iam        # project | chunk:<id> | block:<id>
status: frozen              # draft | frozen | superseded  — only frozen satisfies a gate
client_visible: true        # appears in the readback (§4.5)
answer: >
  An OTP is valid for exactly 10 minutes from its issuance timestamp.
  Verifying an expired code returns 410, not 401.
rationale: >
  Operator staff read codes to guests by phone; shorter windows caused
  repeated reissues in the manual process.
source: {kind: grill, session: interview-2026-08-08}   # grill | doc | derived
settles: [REQ-0031]
supersedes: []
derived_from: []
answered_at: 2026-08-08T14:22:00Z
tags: [auth, otp, expiry]
```

### 3.3 Contradiction

```yaml
id: CON-0004
class: numeric-conflict     # see §4.2 for the seven classes
status: open                # open | resolved | wontfix
involves: [REQ-0031, REQ-0058]
statement: >
  REQ-0031 sets OTP validity to 10 minutes; REQ-0058 says the code
  "stays valid for the browsing session", which is unbounded.
blast_radius: [CHK-iam]
options:
  - {id: opt-a, text: "10-minute hard expiry; session has no bearing"}
  - {id: opt-b, text: "Valid until the session ends or 10 minutes, whichever first"}
  - {id: opt-c, text: "REQ-0058 refers to the session cookie, not the OTP — drop it"}
resolved_by: null           # DEC-####
```

### 3.4 Assumption

```yaml
id: ASM-0009
status: active              # active | confirmed | overturned
from_question: QST-0017
statement: A newly issued OTP invalidates any previous unexpired code.
why_assumed: Client deferred on 2026-08-08; this is the safer default.
blast_radius: [BLK-iam-02, BLK-iam-04]
review_by: stage-4          # forced back to the client at this point at the latest
client_visible: true
```

`blast_radius` is what makes assumptions honest: the readback can say *"if this
is wrong, two blocks change"* rather than burying it.

---

## 4. Pipeline Stage 0 — the client interview

Stage 0 is a **go/no-go**. Nothing downstream exists until it passes. It is
deliberately shaped like a consultant's requirements engagement, because that is
the job.

It has two co-equal **modes**, declared at `afk init` and recorded in
`project.yaml`:

```yaml
mode: brownfield            # greenfield | brownfield
source_repo: {url: git@github.com:you/repo.git, ref: 8f2c1ab, path: ~/src/repo}
survey_depth: standard      # quick | standard | deep
```

`greenfield` runs phases A–F below. `brownfield` runs **S1–S4 first**, then A–F
scoped to the delta. Everything downstream — ledger, gate, contracts,
coordination — is shared and mode-agnostic.

### 4.0 Brownfield phases (S1–S4)

The premise inverts. In greenfield, docs are the only source and code does not
exist. In brownfield, **the code is the authoritative statement of what the
system does**, the docs state what someone once intended, and *the gap between
them is the deliverable*. Every behaviour that exists is an unstated requirement.

#### S1 — Survey (`afk survey`)

A structural map of the repo, pinned to `source_repo.ref` so it cannot shift
underneath the analysis. Almost entirely deterministic — AST, config parsing,
`git log` — which keeps it cheap:

module/package graph and its cycles · entry points · data model from migrations
and struct tags · API surface from routes or OpenAPI · external integrations
(SDK imports, env vars, config keys) · test inventory and coverage map ·
**churn hotspots** from history, because the files changed most often are where
risk concentrates.

Vendored and generated code is excluded via `survey/exclude.yaml`, defaulted per
language. Extracting requirements out of `vendor/` or generated protobuf is the
fastest way to poison the ledger.

#### S2 — Reverse extraction

Observed behaviour becomes `REQ` records with `origin: observed`.

**Tests are executable requirements, and they are the primary source.** A test
states intent explicitly, is already at behaviour granularity, and is known to
be true right now. Implementation is a secondary, lower-confidence source.
`source.kind` sets the confidence ceiling:

| Source | Ceiling | Why |
|---|---|---|
| `test` | high | Explicit and executable |
| `schema` (migration, OpenAPI, struct tag) | high | Declarative contract |
| `implementation` | medium | Inferred from behaviour |
| `history` (commit/PR text) | low | **Rationale only — never a requirement on its own** |

Extraction is capped at **behaviour granularity**: public API surface, state
transitions, validation rules, side effects, error responses. Never private
helpers, never implementation detail. Without that ceiling a mid-sized repo
yields thousands of `REQ` records and buries the signal.

Budget is controlled two ways: the `survey_depth` tier (`quick` = API + data
model + tests; `standard` = + state transitions, validation, integrations;
`deep` = + implementation-inferred behaviour and hotspot deep-dives), and
**per-chunk-candidate incremental extraction**, so a large repo is surveyed in
slices rather than one unbounded pass.

#### S3 — Reconciliation (`afk reconcile`)

Diff `origin: intended` against `origin: observed`. Four brownfield-only
contradiction classes, added to the seven in §4.2:

| Class | Meaning | The question it asks |
|---|---|---|
| `undocumented-behaviour` | Code does something no doc mentions | Deliberate, or accident? |
| `unimplemented-intent` | Doc states something the code does not do | Backlog, dropped, or missed? |
| `divergent-implementation` | Both exist and disagree (doc says 10 min, code says 15) | Which one is right? |
| `orphaned-code` | Code that no requirement traces to | Dead code, or an unwritten requirement? |

**Batch by pattern, never by instance.** If forty endpoints lack a documented
error response, that is *one* question about a convention — not forty questions.
Without this rule reconciliation floods the queue and trips the convergence
guard (§4.4) on the first round, which would make brownfield mode unusable at
any realistic repo size.

#### S4 — Architecture review (`afk architecture-review`)

Generates `docs/readback/ARCHITECTURE-REVIEW.md`. **This is the artifact the
user edits** — the point of brownfield mode is to put the real structure of the
system in front of them so they can correct the design, rather than inheriting
it silently.

1. **What the system is today** — as-built, plain language.
2. **Where it drifted** — the S3 reconciliation summary.
3. **Structural findings** — every `FND-` (below), ranked by severity.
4. **Proposed target architecture** — and the delta from current.
5. **Migration options** — strangler / incremental extraction / big-bang, with
   what each actually costs here.
6. **What to change first** — ranked by (risk reduction × blast radius) ÷ effort.

```yaml
id: FND-0007
class: boundary-violation   # cycle | god-module | boundary-violation
                            # untested-critical-path | hotspot | duplicate-logic
severity: high
statement: internal/iam/service.go is imported by bookings, billing, and notifications.
evidence: [internal/bookings/svc.go:22, internal/billing/charge.go:14, ...]
affects: [CHK-iam, CHK-bookings, CHK-billing]
proposed_remedy: Extract a session-token interface; consumers depend on it via CTR-####.
status: open                # open | accepted | wontfix | remedied_by:CHK-####
review_by: stage-2
```

Findings are **not** auto-remedied. Accepting one creates a `refactor` chunk;
declining one records `wontfix` with a reason, so it stops resurfacing.

Once S4 is signed off, phases A–F run as normal — but scoped to the delta, not
the whole system, which is what keeps a brownfield interview finite.

### 4.1 Phase A — Ingest and atomize

Read every file in `docs/product/`. Emit `REQ-` records: one atomic claim each,
with source file and line, entity tags, and a confidence grade. Low-confidence
extractions are automatically routed into the grill rather than accepted.

### 4.2 Phase B — Contradiction analysis

The "reason about it" phase. Seven detectable classes, each producing a `CON-`:

| Class | Detects |
|---|---|
| `direct-contradiction` | Two claims that cannot both hold |
| `numeric-conflict` | Same quantity, different values or units |
| `terminology-collision` | One word, two meanings — or two words, one meaning |
| `scope-conflict` | One claim implies a capability another excludes |
| `ordering-conflict` | A-before-B and B-before-A |
| `dangling-reference` | A claim references an entity or behaviour never defined |
| `duplicate-specification` | Same thing specified in two places that can drift |

Brownfield adds four more (§4.0 S3), for eleven total.

Contradictions are **never auto-resolved.** Each is drafted with resolution
options and goes to the client. `terminology-collision` matters more than it
looks — it is the cheapest bug to fix at Stage 0 and among the most expensive
at Stage 4.

This phase also runs **against the existing ledger**, not just the dump — so a
client answer that conflicts with an earlier frozen decision is caught as a
`DEC`-vs-`DEC` contradiction rather than silently superseding it.

### 4.3 Phase C — Synthesis (the bigger picture)

Derived from the atomized set, written to `docs/CONTEXT.md`:

- Domain model: entities, relationships, lifecycle states
- Actor and role inventory
- Capability map, grouped
- External integration inventory
- Non-functional envelope: scale, latency, availability, compliance, data residency

Then **gap analysis** — the part that earns the engagement. No dumped plan ever
mentions: authn for the admin surface, idempotency of payment webhooks, timezone
and DST handling, data retention and deletion, backup/restore, rate limiting,
audit trail, error taxonomy, migration rollback, PII boundaries, or what happens
on partial failure. Each unmentioned-but-required item becomes a `QST-` tagged
`gap`. The gap checklist lives in `templates/gap-checklist.yaml` and is per
project archetype (API service, web app, worker, data pipeline).

### 4.4 Phase D — Grill

Batched interrogation over contradictions, gaps, and low-confidence
extractions, using `to-questionnaire` batching and pre-drafted options so
answering is a keystroke. Anything the client defers becomes an `ASM-` with a
blast radius, not a silent gap.

**Convergence guard.** Track questions-raised-per-round. If it does not decline
across three consecutive rounds, halt and report that the specification is
underspecified *structurally* — near-always a wrong domain model — rather than
grinding through another hundred questions. This is a real failure mode and it
needs a stop condition, not stamina.

### 4.5 Phase E — Client readback

`afk readback` **generates** `docs/readback/PROJECT-BRIEF.md`. Generated, never
hand-written, so it cannot drift from the ledger. Every sentence carries a
hidden trace comment to its `REQ`/`DEC`/`ASM` IDs.

Sections, in this order:

1. **What we're building** — one paragraph, no jargon, readable by a non-engineer.
2. **Who uses it, and what they do** — actors and their journeys, in prose.
3. **What it will do** — the capability list in plain language.
4. **What it will *not* do** — explicit scope boundaries. *This is where clients
   catch misunderstandings.* An omitted non-goal is the single most common cause
   of a signed-off-then-wrong build.
5. **What we're assuming** — every `client_visible` `ASM-`, with its blast radius
   in plain terms: "if this is wrong, the booking flow changes."
6. **What we still need from you** — remaining open `QST-`.
7. **How we'll know it's done** — acceptance in client language.

**Length cap.** If the brief exceeds the readable budget, sections 3 and 5 are
ranked by blast radius and truncated with an explicit "N further items in the
appendix" — never silently trimmed.

### 4.6 Phase F — Sign-off (the go/no-go)

```yaml
# .afk/state/signoff.yaml
signed_at: 2026-08-08T18:40:00Z
signed_by: sanjay
readback_sha256: 9f2c...
architecture_review_sha256: 1de4...     # brownfield only — both must be signed
ledger_sha256: 4ab1...            # hash over all frozen DEC + active ASM
survey_ref: 8f2c1ab               # brownfield only — the surveyed commit
open_questions_at_signoff: [QST-0044]   # explicitly accepted as open
```

In brownfield, sign-off covers **both** artifacts, and additionally pins
`survey_ref`. If the repo has moved on since the survey, the sign-off is stale
in a way the ledger hash alone would not catch — `afk survey` must be re-run and
the delta re-signed.

`afk gate` refuses to pass Stage 0 unless `ledger_sha256` matches the current
ledger. If the ledger changes materially afterwards, sign-off is **invalidated**
and `afk readback --delta` generates *"since you approved, these six things
changed"* — a diff, not a re-read of the whole brief. Re-signing a delta is
cheap; that is what keeps the loop usable when requirements move.

---

## 5. Hierarchy

Four levels, each the unit of a *different* thing. If two shared a purpose, one
would be redundant.

| Level | Unit of | Concurrency | Sizing rule |
|---|---|---|---|
| **Project** | The product | — | — |
| **Chunk** | Parallelisation | Chunks run concurrently | A bounded context owning disjoint path globs |
| **Block** | Review & integration | Sequential in-chunk by default | **The smallest change set that leaves the system coherent** — compiles, tests pass, no dead code |
| **Task** | Execution | Parallel in-block if paths disjoint | Fits one worker session |

The block sizing rule is testable, which is the point: too small and review
overhead dominates; too big and review is theatre.

```yaml
# .afk/graph/blocks/BLK-iam-02.yaml
id: BLK-iam-02
chunk: CHK-iam
title: OTP issuance and verification
depends_on: [BLK-iam-01]
parallel_safe: false
owns_paths: [internal/iam/otp/**, migrations/*_otp_*.sql]
provides: [CTR-0002]           # contracts this block satisfies
consumes: []
acceptance:
  - id: AC-01
    text: OTP expires 10 minutes after issuance
    traces: [DEC-0042]         # ✅ backed
  - id: AC-02
    text: A new OTP invalidates the previous one
    traces: [ASM-0009]         # ⚠️ backed by an assumption — allowed, flagged
  - id: AC-03
    text: Verification is rate limited
    traces: []                 # ❌ unbacked — gate fails, QST filed
tasks: [TSK-iam-02-01, TSK-iam-02-02]
```

An `ASM-`-backed criterion **passes** the gate but is counted and surfaced. A
chunk whose assumption-backed share exceeds a configured threshold (default 20%)
raises a warning at Stage 2 — you are building on sand and should know.

### 5.1 Brownfield: chunk origin and quarantine

Greenfield invents chunk boundaries. Brownfield inherits them, and **they are
usually part of what is wrong** — which is the entire reason for pointing the
tool at an existing repo.

```yaml
id: CHK-iam
origin: existing            # existing | proposed | refactor
owns_paths: [internal/iam/**]
quarantine:                                 # brownfield only
  - path: internal/iam/service.go
    reason: FND-0007
    owner: CHK-iam                          # the one chunk that may write it
    consumers: [CHK-bookings, CHK-billing]  # must go through a CTR- instead
    review_by: stage-4
```

**Why quarantine has to exist.** Gate check 3 demands disjoint `owns_paths`. On
any real codebase that is unsatisfiable on day one — `internal/iam/service.go`
is already imported by three concerns, so the gate goes red immediately and
brownfield mode is dead on arrival. The wrong fix is to waive the check; the
right one is to make the violation *explicit and owned*:

- the file gets exactly one **owner** chunk that may write it,
- every other chunk reaches it through a frozen `CTR-` contract,
- the violation stays tracked as an `FND-` with a `review_by` deadline, so
  quarantine is a documented debt with an expiry rather than a permanent excuse.

Gate check 3 is amended accordingly (§7): overlap is a failure **unless** a
quarantine record names a single owner, and every non-owner has a contract.

---

## 6. Cross-chunk contracts

**Chunk Masters never talk to each other.** Lateral agent-to-agent negotiation
is an N² coordination surface and manufactures hidden coupling; it is the single
biggest reason multi-agent builds fall apart. All cross-chunk need is mediated
by a **contract**, declared at plan time and frozen in the ledger before either
side starts:

```yaml
id: CTR-0002
title: Session issuance interface
producer: CHK-iam
consumers: [CHK-bookings]
interface: |
  IssueSession(ctx, userID uuid.UUID) (Session, error)
  Session{ Token string; ExpiresAt time.Time }
frozen_by: DEC-0051
status: frozen
```

The dependency edge `CHK-bookings → CHK-iam` derives from the contract, not from
hand-declared `depends_on`. A Chunk Master that discovers it needs an
undeclared contract mid-flight **escalates** — it does not negotiate. That
escalation is a first-class outcome, not a failure.

---

## 7. `afk gate` — six deterministic checks

Pure file analysis. No model involved. Exits non-zero with a violation table.
A green gate *is* the definition of "ready to build".

| # | Check | Fails when |
|---|---|---|
| 1 | **Coverage** | Any `acceptance[].traces` is empty, or names a non-frozen / superseded / missing record. Auto-files a `QST-` prefilled with `search_decisions` results, so nobody is asked cold. |
| 2 | **Orphan requirement** | Any frozen `DEC` in scope is traced by **zero** acceptance criteria. |
| 3 | **Ownership disjointness** | Two chunks — or two `parallel_safe` blocks, or sibling tasks — have overlapping `owns_paths`. Runs at **plan** time, not only dispatch time. *Brownfield amendment (§5.1):* overlap is permitted only where a `quarantine` record names one owner **and** every non-owner reaches it via a frozen `CTR-`. |
| 4 | **Acyclicity** | `depends_on` plus contract-derived edges contain a cycle, at any level. |
| 5 | **Scope containment** | A block's `owns_paths` is not a subset of its chunk's; a task's not a subset of its block's. |
| 6 | **Sign-off validity** | `signoff.yaml` is missing, or `ledger_sha256` no longer matches. |

**Check 2 is the one the earlier draft was missing and it matters as much as
check 1.** Coverage says *no criterion without a decision*. Orphan says *no
decision without a criterion*. Without both, you can pass a green gate while
having silently dropped a third of what the client asked for — which is exactly
how a build ends up technically correct and commercially useless.

---

## 8. Coordination

The orchestrator's competence is coordination; this section is where it lives.

### 8.1 Seven invariants

1. **Single minter.** Only Housemaster allocates ledger IDs.
2. **Single writer.** Every artifact class has exactly one legitimate writer —
   decisions ← grill skills; questions ← Housemaster; graph ← Planner/Chunk
   Master; task state ← its owning Chunk Master; a worktree ← its one worker.
   Most concurrency bugs are eliminated by construction rather than by locking.
3. **No lateral talk.** Cross-chunk need goes through contracts (§6).
4. **Fail closed.** Every uncertain state resolves to *stop*, never *proceed*.
   If Housemaster is unreachable, the worker halts — it does not build uncited.
5. **Leases, never deletion.** Work is claimed with a heartbeat lease; expiry
   makes crash detection deterministic. Orphaned worktrees are flagged
   `needs-human` and **never auto-deleted**.
6. **Disk is truth.** Reconciliation on every start reads worktrees, leases, and
   git state. In-memory is cache, always discardable.
7. **Bounded escalation.** Every retry, split, and swap has a counter persisted
   in the task file, so a crash cannot reset a loop to zero.

### 8.2 Lease protocol

```yaml
# .afk/state/leases/BLK-iam-02.yaml
holder: chunk-master:CHK-iam
pid: 48213
acquired_at: 2026-08-08T14:00:00Z
heartbeat_at: 2026-08-08T14:06:30Z
ttl_seconds: 600
generation: 3          # increments per re-acquisition; thrash detector
```

Acquire is atomic (`O_EXCL` create). A lease past TTL is reclaimable, and the
reclaimer must run reconciliation before touching anything. `generation > 5`
on one unit is lease thrash → halt that lane and flag it.

### 8.3 Escalation ladder

Bounded, with the counter on the task record:

| Rung | Trigger | Action |
|---|---|---|
| 1 | Task fails verification | Retry same builder, with exact failure evidence appended |
| 2 | Fails again the same way | **Split** the task — smaller pieces, not a blind retry |
| 3 | Split pieces still fail | Role swap: the reviewer profile attempts as builder; the builder reviews |
| 4 | Still failing, or worker hit unresolvable ambiguity | Halt the block, file `QST-`/`CON-`, pause **that lane only** |
| 5 | ≥ N chunks halted (default 2) or all lanes blocked | Full stop, batch every open item into one questionnaire |

**Split depth is capped at 2.** Beyond that, splitting is a symptom of a wrong
block boundary, not a sizing problem, and grinding deeper wastes the run.

### 8.4 Deadlock and stall detection

| Condition | Detection | Response |
|---|---|---|
| All lanes blocked on questions | No eligible unit, ≥1 open `QST` | Rung 5 — questionnaire |
| Contract cycle | Gate check 4 | Fail at Stage 2, before any work |
| Lease thrash | `generation > 5` | Halt lane, `needs-human` |
| Silent stall | No state transition in T min with N in flight | Alarm; do not auto-kill |
| Provider outage / auth failure | Non-2xx or auth error from opencode | **Hard stop.** Never a retry storm. |
| MCP connection lost mid-task | Housemaster unreachable | Worker halts (invariant 4) |

### 8.5 Does every node earn its place?

An honest audit, because a middle-manager node that only relays is pure latency
and token spend:

| Node | Verdict | Test that it is earning its keep |
|---|---|---|
| **Housemaster** | Yes | It is the chokepoint that makes "cite or block" enforceable, and the ledger is physically outside worker mounts. Without it there is no audit trail and no blocker path. |
| **Chunk Master** | Yes, *conditionally* | Its only non-relay jobs are task sizing, split-on-failure, and integration evaluation — all judgment. **Measure at M9: if a Chunk Master transcript shows only relaying, collapse it into the orchestrator.** Stated now so it actually gets checked. |
| **Block layer** | Yes | Review at task granularity misses "handler is fine but nothing calls it". |
| **Reviewer** | Yes | Different model family; a builder cannot approve its own work. |
| **TUI** | **Partially — rescoped** | Only the *queue view* is load-bearing (it is how a human drains blockers). The dashboards are observability. Ranked accordingly in §10. |
| **`LlmBrain`** | Not yet | Deferred until M9 measures a real escalation rate (§9.2). |

---

## 9. Housemaster

An MCP server (`@modelcontextprotocol/sdk`) in the orchestrator's Bun process,
registered per project with `opencode mcp add`. opencode's MCP client support is
confirmed on this machine (v1.18.12).

| Tool | Returns |
|---|---|
| `list_my_constraints(task_id)` | Exactly the decisions this task's criteria trace to |
| `get_decision(id)` | One record, or `not_found` |
| `search_decisions(query, scope?)` | Ranked candidates with IDs, answers, scores |
| `get_chunk_context(chunk_id)` | Chunk-scoped context + its frozen decisions |
| `file_blocker(question, context, severity)` | Mints a `QST-`, returns `BLOCKED` + the ID |
| `propose_contract(producer, consumer, interface)` | Escalates an undeclared cross-chunk need (§6) |

`list_my_constraints` is the important one: a worker gets its authoritative
constraint set up front, so the common path never searches at all. That is what
makes a non-LLM brain viable rather than a compromise.

### 9.1 Citation enforcement

Every commit a worker produces carries `AFK-Cites: DEC-0042,DEC-0051` trailers.
A deterministic post-check validates that each cited ID **exists, is frozen, and
is in the task's constraint set**. A fabricated or out-of-scope citation fails
the task — hallucinated authority is caught mechanically, not by reading diffs.

### 9.2 Brain: deterministic now, swappable later

```ts
interface Brain {
  resolve(q: Question): Promise<
    | { kind: "resolved"; decisions: Decision[]; confidence: number }
    | { kind: "escalate"; searched: string[]; draftOptions?: string[] }
  >;
}
```

**v1 `RetrievalBrain`** — pure TypeScript. BM25 over decision titles, answers,
and tags (`minisearch`; zero-dep, Bun-compatible) plus exact-ID lookup. Returns
*candidates with citations and scores*; it does not judge. The **worker's own
model** — already funded by the OpenCode Go subscription and already holding the
task context — decides whether they answer its question, and calls
`file_blocker` if not. Zero Anthropic API spend, deterministic, auditable.

**v2 `LlmBrain`** — same interface. If M9 shows over-escalation, swap in
`client.beta.messages.toolRunner` with `claude-opus-5`, `thinking: {type:
"adaptive"}`, `output_config.effort: "high"`, and `output_config.format` forcing
a strict JSON verdict. A real metered API line, deliberately deferred until
there is evidence it is needed.

> **Correction to the earlier session notes.** The Claude **Agent SDK** and the
> API **Tool Runner** are *both* harness-only — neither provides deployment;
> Managed Agents is the only tier adding a hosted sandbox, which Housemaster
> does not need. The Agent SDK is not "unable to read files" — its built-in
> tools are Read/Grep/Glob/Bash. Tool Runner wins for v2 on control and
> structured output, not on capability.

---

## 10. Build milestones

Every milestone lands with a **falsification test** — a fixture that *must*
fail, proving the check actually fires. This project has been declared working
before.

| M | Deliverable | Proven by |
|---|---|---|
| **M0** | Rebrand `cc`→`afk`, `.rig`→`.afk`; Ink under `bun build --compile` spike | Binary runs, renders, exits clean. Go/no-go on the TUI stack; hand-rolled ANSI fallback if it fails. ~30 min. |
| **M1** | Ledger schemas + `afk ledger`/`questions`/`contradictions`/`assumptions`; ID minting under lock | Round-trip every record type; two concurrent minters produce no duplicate ID. |
| **M2** | Contradiction engine — all seven classes | A fixture dump containing one planted instance of each class; all seven detected, zero false positives on a clean fixture. |
| **M3** | Synthesis + gap analysis + `afk readback` | Brief generates from a fixture ledger; every sentence traces; a deliberately omitted non-goal shows in §4. |
| **M4** | `afk sign-off` + delta readback | Sign, mutate the ledger, confirm gate check 6 goes red and `--delta` lists exactly the changes. |
| **M5** | Graph schemas, contracts, `afk gate` — all six checks | A fixture failing **each check independently**, plus a sibling passing all six. Unbacked criterion auto-files a `QST-`. |
| **M6** | Housemaster MCP + `RetrievalBrain` + citation enforcement | A real `opencode run`, registered via `opencode mcp add`, calls `list_my_constraints` and `file_blocker`; the `QST-` lands on disk; a commit with a fabricated `AFK-Cites` is rejected. |
| **M7** | `/afk-interview` + `/afk-followup` skills; install `mattpocock/skills` | A real interview on a small fixture spec drives the gate red→green and produces a signed brief. |
| **M8** | Coordination: leases, escalation ladder, deadlock detection, reconciliation | Kill a Chunk Master mid-block → lease expires, reconciliation flags `needs-human`, worktree survives. Force rung 5. |
| **M9** | **Board (TUI)** — queue view first, dashboards second | Queue renders M7's fixture with a red gate and an open p0. Dashboards land only after the queue works. |
| **M10** | Bootstrap Comfort Curators as client #1, **greenfield, clean room** | Real interview on the real product docs → signed brief → real chunk/block graph → **all six gates green**. Measure Chunk Master relay ratio (§8.5) and escalation rate (§9.2). |
| **M11** | **Survey engine** — deterministic structural map (AST · config · `git log`), exclusion globs, depth tiers | Run against `comfort-curators-backend-alt`; it must independently find the known `internal/iam/service.go` multi-importer and rank it a hotspot. Zero `REQ` emitted from `vendor/` or generated code. |
| **M12** | **Reverse extraction** — confidence ladder, behaviour-granularity cap, per-chunk incremental budget | On a fixture with a known test suite: every test yields a matching `REQ` at `confidence: high`; **no** `REQ` is emitted for a private helper. `history`-sourced text lands as rationale, never as a requirement. |
| **M13** | **Reconciliation + `FND-` + architecture review + quarantine + gate-3 amendment** | Plant a doc/code divergence → `divergent-implementation` fires. Plant an undocumented endpoint → `undocumented-behaviour` fires, **batched by pattern not instance**. Gate 3 fails on a real overlap and passes once quarantine names an owner and a contract exists. |
| **M14** | Brownfield end-to-end on `comfort-curators-backend-alt` | Survey → reconcile → architecture review → signed → delta interview → **all six gates green** against real code with real drift. Grade the findings against what is already known true about that repo. |

M1–M5 involve no model calls at all, and M11 is nearly model-free too — the
survey is AST, config, and git. M6 is the first integration point. M10 proves
greenfield; **M14 proves brownfield**, and `backend-alt` is the right fixture
precisely because it went wrong in ways already documented, so the output can be
graded rather than merely admired.

**Model routing for this build.** M1, M5, M6, M8, M11 are tightly specified
plumbing — Claude Sonnet 5 at `effort: xhigh` is the right call. M2, M3, M7,
M12, M13 are judgment-heavy (contradiction precision, readback prose,
interrogation prompts, extraction granularity, architecture findings) and should
stay on Claude Opus 5, where output quality *is* the deliverable.

### Skills

Install the real repo; do not reimplement:

```bash
npx skills@latest add mattpocock/skills     # editable, copies into repo
# first run: /setup-matt-pocock-skills
```

`/afk-interview` composes `wayfinder` → `domain-modeling` → `grill-with-docs` →
`grill-me` → `to-questionnaire`, then writes YAML. `/afk-followup` drains the
queue. Those two skills are the only code that knows the ledger schema.
`wait-what` stays a standing convention on the Claude side.

---

## 11. Break-case register

Consolidated. Every row's response is *stop and surface*, never *proceed*.

**Interview**

| Case | Response |
|---|---|
| Two dumped files contradict | `CON-`, never silently pick one |
| Client answer contradicts an earlier frozen decision | `DEC`-vs-`DEC` contradiction (§4.2), not a silent supersede |
| Client defers | `ASM-` with blast radius, surfaced in readback |
| Client changes mind post-sign-off | Gate check 6 red → `--delta` readback |
| Dump too vague to atomize | `REQ` at `confidence: low` → forced into grill |
| Interview won't converge | Convergence guard (§4.4) → report structural underspecification |
| Readback exceeds readable length | Rank by blast radius, explicit appendix pointer |
| Sign-off on a brief that omitted something | Completeness check: every `client_visible` record must appear |

**Ledger**

| Case | Response |
|---|---|
| Two decisions conflict | Conflict check runs on `afk ledger freeze`, before acceptance |
| Decision superseded, blocks still trace to it | Gate check 1 (dangling trace) |
| Concurrent ID allocation | Single-minter invariant + file lock |
| Ledger grows, BM25 recall drops | Scope-filtered search, chunk-scoped by default |
| Assumption never revisited | `review_by` field forces it back at the named stage |

**Graph**

| Case | Response |
|---|---|
| Chunk boundaries drawn wrong | Overlap → gate 3 red. Loud, not silent. |
| Requirement maps to no block | Gate 2 (orphan) |
| Contract cycle | Gate 4 |
| Task too big for one session | Sizing heuristic at Chunk Master; split before dispatch |
| Too much built on assumptions | Assumption-share threshold warning at Stage 2 |

**Coordination**

| Case | Response |
|---|---|
| Two Chunk Masters claim one block | Lease (`O_EXCL`) |
| Chunk Master crashes mid-block | Lease expiry → reconciliation → `needs-human`; worktree never deleted |
| Worker writes outside `owns_paths` | Diff-scope check rejects the task |
| Worker fabricates a citation | `AFK-Cites` validation (§9.1) |
| Worker can't reach Housemaster | Halt — fail closed |
| Split → fail → split → fail | Depth cap 2, then rung 4 |
| All lanes blocked | Rung 5 questionnaire |
| Provider outage | Hard stop, no retry storm |
| Silent stall | Alarm; never auto-kill |

**Brownfield**

| Case | Response |
|---|---|
| Existing code violates every proposed boundary | Quarantine with a named owner + contracts (§5.1); gate 3 amended. **Not** a waiver. |
| Survey too expensive on a large repo | Depth tiers + per-chunk incremental extraction (§4.0 S2) |
| Reverse extraction floods the ledger | Behaviour-granularity cap; never private helpers; ranked per tier |
| Reconciliation generates thousands of questions | Batch by **pattern**, not instance — otherwise the convergence guard trips on round one |
| Repo has no tests | Confidence ceiling drops to `medium` system-wide; surfaced as the top `FND-` in the architecture review, because it changes how much of the readback can be trusted |
| Repo has no docs at all | Skip reconciliation; observed `REQ` become the baseline and the brief becomes "here is what you actually have" for confirmation |
| Client says "that behaviour is a bug, not a requirement" | `REQ` → `dropped`, with a `DEC` recording it as a defect. Feeds a backlog, never the graph. |
| Repo moves under us mid-survey | Pinned `source_repo.ref`; re-survey is explicit and re-triggers sign-off |
| Vendored / generated code extracted as requirements | `survey/exclude.yaml`, defaulted per language |
| Quarantine becomes permanent | `review_by` deadline on every quarantine record and `FND-`, same mechanism as assumptions |

---

## 12. Deliberately deferred

- **`LlmBrain`** — until M10 measures escalation rate.
- **Collapsing the Chunk Master** — until M10 measures relay ratio.
- **Answering questions inside the board** — M9 shows them; the CLI answers them.
- **Cost dashboards** — Stages 3–5 own spend; there is none in Stages 0–2.

## 13. Open risks

- **Ink under `bun build --compile`** is unverified. M0 exists for exactly this;
  the view model stays separate from rendering so the fallback is contained.
- **Contradiction-engine precision.** Seven classes is ambitious; false
  positives waste client attention and are worse than misses at this stage.
  M2's clean-fixture zero-false-positive requirement is the guard.
- **Gap checklist quality** determines how much value Stage 0 actually adds. It
  is a curated per-archetype asset and should grow with every client.
- **Interview length.** Coverage is demanded of *acceptance criteria*, not of
  everything interesting. If M10's interview still runs long, cut criteria
  before cutting rigour.
- **Reverse-extraction precision is brownfield's make-or-break.** A flood of
  low-value observed requirements makes the interview useless and the ledger
  unsearchable. The behaviour-granularity cap and the confidence ladder are the
  guard; M12's "no `REQ` for a private helper" test is what proves it holds.
- **Architecture-review quality** is the most judgment-heavy output in the
  system. It is an Opus milestone and should not be downgraded to save tokens.
- **Quarantine drift.** The honest failure mode is that everything ends up
  quarantined and gate 3 becomes decorative. Watch the quarantined-path count as
  a health metric at M14; if it is not shrinking across chunks, the proposed
  boundaries are wrong and the target architecture needs another pass.

---

## 14. Halt record — 2026-08-08

**This project is halted at design-complete.** The architecture above is frozen
and considered final; implementation stands at M0 of 14 (§10). Nothing in this
document is provisional or awaiting a decision — the open items are listed in
§12 (deferred) and §13 (risks), and both are deliberate.

**Why halted, not abandoned.** Attention moved to shipping a frontend against
the predecessor backend for a scheduled demo. This design is worth more frozen
and legible than half-implemented: the expensive artifact here is the *thinking*
— the two enforcement mechanisms, the six gates, the seven invariants, and the
break-case register — not the TypeScript that would carry it.

**Resuming.** Start at M0 (§10) and go in order. `CLAUDE.md` is the short-form
working agreement; read it before writing code. The build order is deliberate:
M1–M5 and M11 involve no model calls at all, so the deterministic spine can be
proven correct before any inference is introduced.

**Two obligations carried forward**, written into the milestones rather than
left as intentions — measure the Chunk Master relay ratio (§8.5) and the real
escalation rate (§9.2) before spending money on either an extra coordination
node or a metered LLM arbiter.

# AFK Orchestrator

> A guided development harness that **interrogates you until your specification
> is unambiguous**, makes you sign a plain-language readback of what it
> understood, and only then lets AI agents write code.
>
> Its predecessor built a 120,455-line production-shaped Go backend for $15.39.
> This is what that experience taught, turned into tooling.

**Status: HALTED 2026-08-08 at design-complete.** The architecture is finalized
and frozen. Implementation stands at M0 of 14. See [Status](#status).

---

## The problem it exists to solve

Autonomous AI development works. Its predecessor rig proved that: a frozen
product spec became a running, tested, security-reviewed Go backend in four days
for the price of lunch — 777 million tokens, 8,476 requests, $15.39.
([The artifact.](https://github.com/sanjayBahadur/comfort-curators-backend-alt))

It fails in exactly one way, and it fails the same way every time:

> **A worker hits something the specification does not answer, guesses, and the
> guess propagates.**

That failure is not a model capability problem. Better models guess more
plausibly, which makes it *worse* — a plausible guess survives review.

The predecessor's master plan explicitly banned this. It said workers must stop
rather than invent, and that no two concurrent tasks may modify the same owned
module. Both rules were violated during the build; two branches collided on
`internal/iam/service.go` and needed manual repair. **The rules existed in prose,
not in tooling.** Prose does not execute.

## The two mechanisms

Everything in this design is machinery around two enforced rules.

**1. Coverage.** No acceptance criterion may exist without a frozen decision
backing it. Not a convention — a deterministic gate that reads the files and
exits non-zero:

```yaml
acceptance:
  - id: AC-01
    text: OTP expires 10 minutes after issuance
    traces: [DEC-0042]      # ✅ backed by a frozen decision
  - id: AC-02
    text: Verification is rate limited
    traces: []              # ❌ gate fails; QST-0017 auto-filed
```

**2. Sign-off.** No build starts until the client confirms a generated,
plain-language readback of what the system understood — hash-pinned to the
ledger, so a later change invalidates the signature and produces a delta.

### The definition that makes it work

"No guesswork" cannot mean *never proceed without an answer* — that deadlocks on
the first question a client can't answer today. It means:

> **Never proceed on an unrecorded, unsurfaced answer.**

A deferred question becomes a recorded assumption with a blast radius, printed
in the readback, and signed. That is a client decision, not a guess. This single
distinction is what lets the pipeline move without reintroducing drift.

## Stage 0 — the client interview

The front half is the product. Six phases, and it is a hard go/no-go:

| Phase | What happens |
|---|---|
| **Ingest** | Atomize every dumped plan into individual, source-cited requirements |
| **Contradict** | Detect 7 conflict classes — direct, numeric, terminology collision, scope, ordering, dangling reference, duplicate spec — *including against the existing ledger*, so a new answer that conflicts with an old decision is caught |
| **Synthesize** | Domain model, actors, capability map, NFR envelope — then **gap analysis** against a per-archetype checklist, because no dumped plan ever mentions idempotency, data retention, timezone handling, or partial failure |
| **Grill** | Batched interrogation with pre-drafted options, and a **convergence guard**: if questions-per-round doesn't decline over three rounds, halt and report structural underspecification rather than grinding on |
| **Readback** | Generate a client-level brief — including *"what it will **not** do"*, the section where clients actually catch misunderstandings |
| **Sign-off** | Hash-pinned confirmation. Ledger drift invalidates it and produces a delta, not a re-read |

### Brownfield mode

Point it at an existing repository and the premise inverts: **the code is the
authoritative statement of what the system does, the docs state what someone
once intended, and the gap between them is the deliverable.**

Survey (AST, config, git churn — nearly model-free) → reverse extraction where
**tests are treated as executable requirements and are the primary source** →
intent-vs-implementation reconciliation → an architecture review the user edits
to fix the design rather than inherit it.

The design was dry-run by hand against the predecessor backend. It surfaced real
instances of three of its four brownfield conflict classes: six roles documented
against three built, 275 undeclared routes, and migrations specified but absent.

## Six gate checks

Pure file analysis. No model calls. A green gate *is* the definition of
"ready to build".

| # | Check | Catches |
|---|---|---|
| 1 | Coverage | A criterion with no frozen decision behind it |
| 2 | **Orphan requirement** | A decision no criterion traces to |
| 3 | Ownership disjointness | Two chunks owning the same path — *at plan time* |
| 4 | Acyclicity | Dependency or contract cycles |
| 5 | Scope containment | A task escaping its block's paths |
| 6 | Sign-off validity | A ledger that moved after approval |

**Check 2 matters as much as check 1.** Coverage says *no criterion without a
decision*. Orphan says *no decision without a criterion*. Without both, you can
pass a fully green gate having silently dropped a third of what the client asked
for — technically correct, commercially useless.

Check 3 is the tooled answer to the `iam/service.go` collision, moved from prose
into a check that runs before any worker starts.

## Seven coordination invariants

1. **Single minter** — only one process allocates IDs, under a file lock. Races
   are removed, not survived.
2. **Single writer** — one legitimate writer per artifact class. Most concurrency
   bugs are eliminated by construction rather than by locking.
3. **No lateral talk** — agents never negotiate with each other. Cross-boundary
   need goes through a frozen contract; discovering an undeclared one is an
   escalation. This is the invariant that keeps multi-agent builds from
   collapsing into an N² coordination surface.
4. **Fail closed** — every uncertain state resolves to *stop*. If the ledger is
   unreachable, the worker halts rather than building uncited.
5. **Leases, never deletion** — heartbeat leases make crash detection
   deterministic; orphaned work is flagged, never auto-deleted.
6. **Disk is truth** — reconcile from worktrees, leases, and git on every start.
7. **Bounded escalation** — retry → split → role-swap → halt-lane → full-stop,
   with counters that survive a crash. Split depth caps at 2, because deeper
   splitting is a symptom of a wrong boundary, not a sizing problem.

Workers cite decisions by ID in commit trailers, and a deterministic check
validates every citation against the task's constraint set — so **fabricated
authority fails mechanically** rather than surviving a human diff review.

## An honest node audit

A middle-manager node that only relays is latency and token spend. The design
names two things to *measure* rather than assume:

- **Chunk Master** — earns its place only through task sizing, split-on-failure,
  and integration evaluation. If its transcript shows only relaying, collapse it.
- **LLM arbiter** — the ledger brain is deterministic BM25 retrieval, costing
  nothing. Upgrading it to a metered model call is deferred until a measured
  escalation rate justifies the line item.

Both are written into the milestone plan as obligations, not aspirations.

## Status

**Halted 2026-08-08.** Design finalized and frozen; implementation at M0 of 14.

| | |
|---|---|
| ✅ Architecture | Complete — [`docs/DESIGN.md`](docs/DESIGN.md), ~900 lines, frozen |
| ✅ Working agreement | [`CLAUDE.md`](CLAUDE.md) — naming, invariants, model routing |
| ✅ Scaffold | Bun/TypeScript, `cc doctor` (13 environment checks passing) |
| ✅ Agent profiles | Builder and reviewer, verified via `opencode agent list` |
| ⬜ M0–M14 | Not started. Rebrand, ledger, contradiction engine, readback, gates, MCP server, skills, coordination, TUI, two client bootstraps |

Every milestone is specified to land with a **falsification test** — a fixture
that *must* fail, proving the check actually fires. A green suite that has never
seen a red input proves nothing, and this lineage has declared things working
before.

The CLI is `afk`; the scaffold still says `cc`. That rebrand is M0, and it was
deliberately not done as a side effect of a documentation commit.

## Read next

- **[`docs/DESIGN.md`](docs/DESIGN.md)** — the full architecture: stores, hierarchy,
  interview phases, brownfield mode, gates, coordination, break-case register
- **[`CLAUDE.md`](CLAUDE.md)** — the short form, for an agent picking this up cold
- **[comfort-curators-backend-alt](https://github.com/sanjayBahadur/comfort-curators-backend-alt)**
  — the predecessor artifact, and the evidence for every claim above

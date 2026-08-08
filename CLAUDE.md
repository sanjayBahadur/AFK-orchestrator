# AFK Orchestrator — working agreement

**Read `docs/DESIGN.md` before writing code.** It is the frozen spec. This file
is the short form: the rules that are easy to violate accidentally.

## What this is

A guided, interactive development harness. A client dumps plans (or points at an
existing repo); the system interrogates them until every ambiguity is recorded,
produces a plain-language readback for sign-off, decomposes into a parallel
graph, and only then builds. Workers are OpenCode Go agents; Claude is the
planning and interrogation surface.

## Naming — non-negotiable

- CLI is **`afk`**. `cc` is retired everywhere: binary, docs, templates, git
  hooks, commit trailers. If you find a `cc`, it is a bug.
- State lives in **`.afk/`**, never `.rig/`.
- **Pipeline Stage 0–5** = what the system does to a project.
  **Milestone M0–M14** = what we implement. Never mix the two vocabularies.
- Entity IDs: `REQ` `DEC` `QST` `CON` `ASM` `CTR` `FND`, zero-padded to 4.
  Structural IDs are slug-derived: `CHK-<slug>`, `BLK-<slug>-##`,
  `TSK-<slug>-##-##`, `AC-##`.

## The two mechanisms everything protects

1. **Coverage** — no acceptance criterion may exist without a frozen `DEC` (or
   an explicit `ASM`) backing it.
2. **Sign-off** — no build starts until the client confirms a generated
   readback, hash-pinned to the ledger.

"No guesswork" does **not** mean "never proceed without an answer" — that
deadlocks. It means **never proceed on an unrecorded, unsurfaced answer.** A
deferred question becomes an `ASM-` with a blast radius, printed in the readback
and signed off. That is a client decision, not a guess.

## Seven coordination invariants

1. **Single minter.** Only Housemaster allocates ledger IDs, under a file lock.
   Agents never allocate.
2. **Single writer.** One legitimate writer per artifact class — decisions ←
   grill skills; questions ← Housemaster; graph ← Planner/Chunk Master; task
   state ← its owning Chunk Master; a worktree ← its one worker.
3. **No lateral talk.** Chunk Masters never communicate directly. Cross-chunk
   need goes through a frozen `CTR-` contract. Discovering an undeclared one is
   an escalation, not a negotiation.
4. **Fail closed.** Every uncertain state resolves to *stop*. If Housemaster is
   unreachable, the worker halts — it does not build uncited.
5. **Leases, never deletion.** Heartbeat leases; orphaned worktrees are flagged
   `needs-human` and never auto-deleted.
6. **Disk is truth.** Reconcile from worktrees, leases, and git on every start.
   Memory is a discardable cache.
7. **Bounded escalation.** Retry → split → role-swap → halt-lane → full-stop.
   Counters persist in the task file. **Split depth caps at 2.**

## Implementation rules

- **Every milestone ships a falsification test** — a fixture that *must* fail,
  proving the check actually fires. This project has been declared working
  before. A green test suite that has never seen a red input proves nothing.
- `.afk/ledger/` stays **outside every worker's bwrap mount**. Enforcement is
  physical, not conventional.
- Gate checks are **deterministic** — pure file analysis, no model calls.
  M1–M5 and M11 involve no inference at all; keep it that way.
- Keep the TUI view model separate from rendering. The Ink-under-
  `bun build --compile` question is unresolved (M0) and the fallback must be
  contained.
- Brownfield: never waive gate check 3. Overlap is legal only via a `quarantine`
  record naming one owner plus contracts for everyone else — and every
  quarantine carries a `review_by`, or it becomes permanent debt.

## Two things to measure, not assume (M10/M14)

- **Chunk Master relay ratio.** If its transcript shows only relaying, it is
  latency and token spend — collapse it into the orchestrator.
- **Escalation rate.** `RetrievalBrain` is deterministic and free. `LlmBrain`
  (Tool Runner + `claude-opus-5` + structured verdict) is a real metered API
  line and stays deferred until there is a number justifying it.

## Model routing

Sonnet 5 at `effort: xhigh` for M1, M5, M6, M8, M11 — tightly specified
plumbing. Stay on Opus 5 for M2, M3, M7, M12, M13, where output quality *is* the
deliverable (contradiction precision, readback prose, interrogation prompts,
extraction granularity, architecture findings).

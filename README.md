# AFK Orchestrator

A reusable, project-agnostic AI-agent build pipeline. Point it at a frozen
product spec, walk away, come back to a tested, production-ready app.

- **Workers**: OpenCode Go subscription models only (`opencode-go/*`).
- **Interface**: Claude — planning, bootstrap, and status check-ins. Claude
  never implements or reviews code in this pipeline; that's the workers' job.
- **Controller**: this repo. TypeScript on Bun, compiled to a standalone
  binary (`bun run build` → `dist/cc`). Deterministic — the accept/merge
  authority is code, not another conversational agent.

Full design, decision history, and build order:
`/home/tatakae/.claude/plans/enchanted-scribbling-starlight.md`
(mirrored in the `comfort-curators-automation-project` memory file if that
plan doc is ever pruned).

## Layout

```
agents/            canonical source for opencode agent profiles (builder.md, reviewer.md)
.opencode/agent/    local copy so `opencode agent list` can verify them from this repo directly
skills/             SKILL.md playbooks, embedded into prompts by src/dispatch
templates/          new-project scaffold: opencode.json, AGENTS.md, Makefile, compose.yaml, git hooks
src/                the `cc` controller itself
docs/               how to point the orchestrator at a new project
```

`agents/*.md` is the source of truth. `cc init` (build order step 2) copies
it into a new project's `.opencode/agent/` directory — same mechanism as the
`.opencode/agent/` copy in this repo, which exists purely so `cc doctor` can
verify the profiles resolve correctly without needing a target project yet.

## Why hand-authored agent profiles, not `opencode agent create`

Tried it first. Given a precise description of what the builder agent should
do, `opencode agent create`'s own generation step (itself an LLM call)
produced a plausible-sounding but *wrong* agent — it pattern-matched on
generic "task runner" vocabulary instead of understanding this project's
actual design. That's a real, observed failure mode, not a hypothetical one.
`agents/builder.md` and `agents/reviewer.md` are hand-authored and
version-controlled instead. Verified against the resolved policy via
`opencode agent list`:

```
builder (primary)   edit=allow  bash=ask    model=opencode-go/deepseek-v4-pro
reviewer (primary)  edit=deny   bash=deny   model=opencode-go/gpt-5.6-luna
```

`bash: ask` on the builder is intentional — the orchestrator answers those
requests against an explicit allowlist (build order step 3), never a blanket
`--auto`. `edit: deny` + `bash: deny` on the reviewer means it cannot "fix"
what it's supposed to be independently judging, by construction.

## Commands

```
bun run cc doctor      # read-only environment/provider/sandbox checks
bun run build          # compile to dist/cc (standalone binary)
```

Everything else (`init`, `plan`, `run`, ...) is not implemented yet — see the
build order in the plan doc. A not-yet-implemented command says so and exits
1; it never pretends to succeed.

#!/usr/bin/env bun
// AFK Orchestrator — `cc` entrypoint.
//
// Build order (see /home/tatakae/.claude/plans/enchanted-scribbling-starlight.md):
//   1. this scaffold + `doctor`                              <- implemented
//   2. task graph schema + `init`/`plan`                      <- not yet implemented
//   3. single-task dispatch lifecycle                         <- not yet implemented
//   4. reviewer + merge + evidence                            <- not yet implemented
//   5. concurrency + failure escalation + crash recovery       <- not yet implemented
//   6. phase-gate runner + certify                             <- not yet implemented
//   7. bootstrap the real Comfort Curators instance            <- not yet implemented
//
// A command that isn't built yet says so explicitly and exits 1 — it never
// pretends to succeed. See the master-plan lesson this project is built to
// avoid: "must never exit zero by skipping."

import { doctor } from "./doctor";

const USAGE = `AFK Orchestrator

Usage: cc <command> [args]

Commands:
  doctor                        read-only environment/provider/sandbox checks
  init <product-doc-dir>        scaffold a new project instance from templates
  plan                          wayfinder/to-tickets session -> task graph
  status / phase-status         DAG state, blockers, in-flight, needs-human
  next                          next eligible task(s), no dispatch
  run [--workers N] [--afk]     the main loop
  inspect|logs|retry|block|unblock <task-id>
  approve-phase <N>             human gate
  certify                       revalidate all evidence, write sealed report
  costs                         per-task/per-agent token & cost usage
  pause / stop
`;

function notYetImplemented(command: string): number {
  console.error(`cc ${command}: not yet implemented (build order step 2+).`);
  console.error("See /home/tatakae/.claude/plans/enchanted-scribbling-starlight.md for the build order.");
  return 1;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case undefined:
    case "-h":
    case "--help":
    case "help":
      console.log(USAGE);
      return command === undefined ? 1 : 0;

    case "doctor":
      return doctor();

    case "init":
    case "plan":
    case "status":
    case "phase-status":
    case "next":
    case "run":
    case "inspect":
    case "logs":
    case "retry":
    case "block":
    case "unblock":
    case "approve-phase":
    case "certify":
    case "costs":
    case "pause":
    case "stop":
      return notYetImplemented(command);

    default:
      console.error(`cc: unknown command '${command}'\n`);
      console.log(USAGE);
      return 1;
  }
}

process.exit(await main());

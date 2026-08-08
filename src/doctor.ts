// Read-only environment/provider/sandbox checks for the AFK Orchestrator.
// Never mutates anything. Exit code is 0 iff every REQUIRED check passes.

type Level = "PASS" | "WARN" | "FAIL";

interface Check {
  name: string;
  required: boolean;
  run: () => Promise<{ level: Level; detail: string }>;
}

async function runCmd(cmd: string[], timeoutMs = 8000): Promise<{ ok: boolean; out: string; code: number }> {
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const code = await proc.exited;
    clearTimeout(timer);
    return { ok: code === 0, out: (out + err).trim(), code };
  } catch {
    return { ok: false, out: "", code: -1 };
  }
}

function firstLine(s: string): string {
  return s.split("\n")[0]?.trim() ?? "";
}

const checks: Check[] = [
  {
    name: "bun runtime",
    required: true,
    async run() {
      return { level: "PASS", detail: `bun ${Bun.version}` };
    },
  },
  {
    name: "git binary",
    required: true,
    async run() {
      if (!Bun.which("git")) return { level: "FAIL", detail: "git not found on PATH" };
      const r = await runCmd(["git", "--version"]);
      return { level: r.ok ? "PASS" : "FAIL", detail: firstLine(r.out) || "git present but --version failed" };
    },
  },
  {
    name: "git identity",
    required: true,
    async run() {
      const name = await runCmd(["git", "config", "--global", "user.name"]);
      const email = await runCmd(["git", "config", "--global", "user.email"]);
      if (!name.out || !email.out) {
        return { level: "FAIL", detail: "git config --global user.name/user.email not set" };
      }
      return { level: "PASS", detail: `${name.out} <${email.out}>` };
    },
  },
  {
    name: "docker binary",
    required: true,
    async run() {
      if (!Bun.which("docker")) return { level: "FAIL", detail: "docker not found on PATH" };
      const r = await runCmd(["docker", "--version"]);
      return { level: r.ok ? "PASS" : "FAIL", detail: firstLine(r.out) };
    },
  },
  {
    name: "docker daemon reachable",
    required: false,
    async run() {
      const r = await runCmd(["docker", "info", "--format", "{{.ServerVersion}}"], 5000);
      if (!r.ok) return { level: "WARN", detail: "docker daemon not reachable (needed for phase gates, not for early steps)" };
      return { level: "PASS", detail: `server ${firstLine(r.out)}` };
    },
  },
  {
    name: "bwrap (bubblewrap sandbox)",
    required: true,
    async run() {
      if (!Bun.which("bwrap")) return { level: "FAIL", detail: "bwrap not found — required for worker filesystem sandboxing" };
      const r = await runCmd(["bwrap", "--version"]);
      return { level: "PASS", detail: firstLine(r.out) || "present" };
    },
  },
  {
    name: "opencode binary",
    required: true,
    async run() {
      if (!Bun.which("opencode")) return { level: "FAIL", detail: "opencode not found on PATH" };
      const r = await runCmd(["opencode", "--version"]);
      return { level: r.ok ? "PASS" : "FAIL", detail: `opencode ${firstLine(r.out)}` };
    },
  },
  {
    name: "opencode credentials",
    required: true,
    async run() {
      const r = await runCmd(["opencode", "auth", "list"]);
      if (!r.ok) return { level: "FAIL", detail: "opencode auth list failed" };
      const hasGo = /OpenCode Go/i.test(r.out);
      if (!hasGo) {
        return { level: "FAIL", detail: "no 'OpenCode Go' credential found — required for opencode-go/* models" };
      }
      return { level: "PASS", detail: "OpenCode Go credential present" };
    },
  },
  {
    name: "opencode-go builder model reachable",
    required: true,
    async run() {
      const r = await runCmd(["opencode", "models", "opencode-go"]);
      const ok = r.ok && /opencode-go\/deepseek-v4-pro/.test(r.out);
      return {
        level: ok ? "PASS" : "FAIL",
        detail: ok ? "opencode-go/deepseek-v4-pro listed" : "opencode-go/deepseek-v4-pro not listed by `opencode models`",
      };
    },
  },
  {
    name: "opencode-go reviewer model reachable",
    required: true,
    async run() {
      const r = await runCmd(["opencode", "models", "opencode-go"]);
      const ok = r.ok && /opencode-go\/gpt-5\.6-luna/.test(r.out);
      return {
        level: ok ? "PASS" : "FAIL",
        detail: ok ? "opencode-go/gpt-5.6-luna listed" : "opencode-go/gpt-5.6-luna not listed by `opencode models`",
      };
    },
  },
  {
    name: "builder/reviewer agent profiles registered",
    required: true,
    async run() {
      const r = await runCmd(["opencode", "agent", "list"]);
      const hasBuilder = /^builder \(primary\)/m.test(r.out);
      const hasReviewer = /^reviewer \(primary\)/m.test(r.out);
      if (!hasBuilder || !hasReviewer) {
        return {
          level: "FAIL",
          detail: `missing from \`opencode agent list\` (builder=${hasBuilder}, reviewer=${hasReviewer}) — copy agents/*.md into .opencode/agent/`,
        };
      }
      return { level: "PASS", detail: "builder (primary) and reviewer (primary) both registered" };
    },
  },
  {
    name: "@opencode-ai/sdk resolvable",
    required: true,
    async run() {
      // Deliberately a dynamic import, not a node_modules filesystem check:
      // `bun build --compile` bundles this package straight into the
      // binary, so once compiled there is no on-disk node_modules to find.
      // A dynamic import resolves correctly in both the `bun run` (source)
      // and compiled-binary cases, which a path check does not.
      try {
        const sdk = await import("@opencode-ai/sdk");
        const hasEntry = typeof sdk.createOpencodeClient === "function" || typeof sdk.createOpencode === "function";
        return hasEntry
          ? { level: "PASS", detail: "createOpencodeClient/createOpencode present" }
          : { level: "FAIL", detail: "module resolved but expected exports are missing" };
      } catch (e) {
        return { level: "FAIL", detail: `import failed: ${(e as Error).message} — run \`bun install\`` };
      }
    },
  },
  {
    name: "jq (debugging convenience)",
    required: false,
    async run() {
      return Bun.which("jq") ? { level: "PASS", detail: "present" } : { level: "WARN", detail: "not found (optional)" };
    },
  },
  {
    name: "flock (evidence-write locking)",
    required: false,
    async run() {
      return Bun.which("flock") ? { level: "PASS", detail: "present" } : { level: "WARN", detail: "not found (optional)" };
    },
  },
  {
    name: "gitleaks (secret scan upgrade)",
    required: false,
    async run() {
      return Bun.which("gitleaks")
        ? { level: "PASS", detail: "present" }
        : { level: "WARN", detail: "not installed — falls back to a weaker regex secret-scan" };
    },
  },
];

export async function doctor(): Promise<number> {
  console.log("AFK Orchestrator — cc doctor\n");
  let failures = 0;
  const rows: string[] = [];
  for (const check of checks) {
    const { level, detail } = await check.run();
    if (level === "FAIL" && check.required) failures++;
    const badge = level === "PASS" ? "✅ PASS" : level === "WARN" ? "⚠️  WARN" : "❌ FAIL";
    rows.push(`${badge}  ${check.name.padEnd(34)} ${detail}`);
  }
  console.log(rows.join("\n"));
  console.log();
  if (failures > 0) {
    console.log(`${failures} required check(s) failed. Fix these before running \`cc init\` / \`cc run\`.`);
    return 1;
  }
  console.log("All required checks passed.");
  return 0;
}

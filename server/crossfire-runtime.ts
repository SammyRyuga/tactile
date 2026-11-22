import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const startupTimeoutMs = 20_000;
const handshake = z.object({ kind: z.enum(["ready", "error"]) });
const diagnoseImports = `
import asyncio, os, runpy, sys

os.environ["DEMO_MODE"] = "false"
try:
    worker = runpy.run_path(sys.argv[1])
    asyncio.run(worker["run"]({"operation": "health"}))
except ModuleNotFoundError:
    print("missing_module")
except ImportError:
    print("import_failed")
`;

type StartupReason =
  | "python_not_found"
  | "dependency_target_missing"
  | "worker_not_found"
  | "missing_module"
  | "import_failed"
  | "timeout"
  | "nonzero_exit"
  | "invalid_handshake"
  | "spawn_failed";

export class CrossfireStartupError extends Error {
  readonly diagnostic: {
    reason: StartupReason;
    elapsedMs: number;
    exitCode?: number;
  };

  constructor(reason: StartupReason, elapsedMs: number, exitCode?: number) {
    super(reason);
    this.name = "CrossfireStartupError";
    this.diagnostic = { reason, elapsedMs, exitCode };
  }
}

export function crossfireRuntime(pythonPath?: string, hosted = false) {
  const override = pythonPath?.trim() || undefined;
  const dependencies =
    hosted && !override ? resolve(".crossfire-python") : undefined;
  const executable =
    override ??
    (dependencies
      ? "python3"
      : resolve(
          process.platform === "win32"
            ? ".venv/Scripts/python.exe"
            : ".venv/bin/python",
        ));
  return {
    executable,
    dependencies,
    worker: resolve("server/crossfire/worker.py"),
    env: {
      PATH: process.env.PATH,
      PYTHON_DOTENV_DISABLED: "1",
      TACTILE_CROSSFIRE_LIBS: dependencies,
    },
  };
}

async function launch(
  runtime: ReturnType<typeof crossfireRuntime>,
  args: string[],
  timeout: number,
  input?: string,
) {
  return new Promise<{
    code: string | number | null | undefined;
    killed: boolean;
    output: string;
  }>((finish) => {
    const child = execFile(
      runtime.executable,
      ["-I", "-B", ...args],
      {
        env: runtime.env,
        timeout,
        maxBuffer: 16 * 1024,
        killSignal: "SIGKILL",
      },
      (error, stdout) =>
        finish({
          code: error?.code,
          killed: Boolean(error?.killed),
          output: stdout.trim(),
        }),
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

function parseHandshake(stdout: string) {
  try {
    return handshake.parse(JSON.parse(stdout)).kind;
  } catch {
    return undefined;
  }
}

export async function verifyCrossfireRuntime(
  runtime: ReturnType<typeof crossfireRuntime>,
  timeoutMs = startupTimeoutMs,
) {
  const start = performance.now();
  const elapsed = () => Math.round(performance.now() - start);
  const fail = (reason: StartupReason, exitCode?: number): never => {
    throw new CrossfireStartupError(reason, elapsed(), exitCode);
  };

  if (runtime.dependencies && !existsSync(runtime.dependencies))
    fail("dependency_target_missing");
  if (
    runtime.dependencies &&
    !existsSync(resolve(runtime.dependencies, "pydantic/__init__.py"))
  )
    fail("missing_module");
  if (!existsSync(runtime.worker)) fail("worker_not_found");

  const result = await launch(
    runtime,
    [runtime.worker],
    timeoutMs,
    '{"operation":"health"}\n',
  );
  if (result.code === "ENOENT") fail("python_not_found");
  if (result.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER")
    fail("invalid_handshake");
  if (result.killed) fail("timeout");
  if (typeof result.code === "string") fail("spawn_failed");

  const kind = parseHandshake(result.output);
  if (typeof result.code === "number" || result.code === null) {
    const remaining = timeoutMs - elapsed();
    if (kind === "error" && remaining > 0) {
      // The worker redacts its exceptions. Repeat startup only for a fixed
      // diagnostic category, using the time left in the original budget.
      const probe = await launch(
        runtime,
        ["-c", diagnoseImports, runtime.worker],
        remaining,
      );
      if (
        probe.code === undefined &&
        (probe.output === "missing_module" || probe.output === "import_failed")
      )
        fail(probe.output, result.code ?? undefined);
    }
    fail("nonzero_exit", result.code ?? undefined);
  }
  if (kind !== "ready") fail("invalid_handshake");
  return { elapsedMs: elapsed() };
}

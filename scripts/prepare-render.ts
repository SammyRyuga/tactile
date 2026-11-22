import { execFileSync } from "node:child_process";
import {
  CrossfireStartupError,
  crossfireRuntime,
  verifyCrossfireRuntime,
} from "../server/crossfire-runtime.ts";

if (process.env.RENDER === "true" && process.env.SUPABASE_URL?.trim()) {
  const runtime = crossfireRuntime(process.env.TACTILE_PYTHON, true);
  let stage = "dependency_install";
  try {
    if (runtime.dependencies) {
      execFileSync(
        runtime.executable,
        [
          "-m",
          "pip",
          "install",
          "--target",
          runtime.dependencies,
          "-r",
          "server/crossfire/requirements.txt",
        ],
        { stdio: "ignore" },
      );
    }
    stage = "worker_handshake";
    const readiness = await verifyCrossfireRuntime(runtime);
    stage = "python_dependency_check";
    const pythonVersion = execFileSync(
      runtime.executable,
      [
        "-I",
        "-B",
        "-c",
        `
import importlib, pathlib, platform, sys

if sys.argv[1:]:
    target = pathlib.Path(sys.argv[1]).resolve()
    sys.path.insert(0, str(target))
    for name in ("pydantic", "pydantic_core", "pydantic_settings", "tenacity",
                 "pypdf", "pymupdf", "PIL", "onnxruntime", "rapidocr_onnxruntime"):
        module = importlib.import_module(name)
        if not pathlib.Path(module.__file__).resolve().is_relative_to(target):
            raise ImportError(name)
print(platform.python_version())
`,
        ...(runtime.dependencies ? [runtime.dependencies] : []),
      ],
      {
        encoding: "utf8",
        env: runtime.env,
        timeout: 30_000,
        maxBuffer: 16 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    if (!/^\d{1,2}\.\d{1,2}\.\d{1,3}$/.test(pythonVersion))
      throw new Error("Unexpected Python version output.");
    console.info(
      JSON.stringify({
        event: "crossfire_build_ready",
        pythonVersion,
        dependencyMode: runtime.dependencies ? "managed" : "configured",
        ...readiness,
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "crossfire_build_failed",
        stage,
        ...(error instanceof CrossfireStartupError ? error.diagnostic : {}),
      }),
    );
    process.exitCode = 1;
  }
}

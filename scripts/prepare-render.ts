import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

if (
  process.env.RENDER === "true" &&
  process.env.SUPABASE_URL &&
  !process.env.TACTILE_PYTHON
) {
  const dependencies = resolve(".crossfire-python");
  execFileSync(
    "python3",
    [
      "-m",
      "pip",
      "install",
      "--target",
      dependencies,
      "-r",
      "server/crossfire/requirements.txt",
    ],
    { stdio: "inherit" },
  );
  execFileSync(
    "python3",
    [
      "-I",
      "-B",
      "-c",
      "import sys; sys.path.insert(0, sys.argv[1]); import pydantic, pydantic_settings, tenacity",
      dependencies,
    ],
    { stdio: "inherit" },
  );
}

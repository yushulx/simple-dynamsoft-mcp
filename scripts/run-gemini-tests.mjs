#!/usr/bin/env node
import { spawn } from "node:child_process";

const child = spawn(
  process.execPath,
  ["--test", "test/integration/stdio.test.js", "test/integration/http.test.js"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      RUN_GEMINI_PROVIDER_TESTS: "true"
    }
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

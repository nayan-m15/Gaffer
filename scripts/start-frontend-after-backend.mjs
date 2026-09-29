import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

function readPortFromEnvFile(contents) {
  const match = contents.match(/^\s*PORT\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s#]*))/m);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

let envPort;
try {
  envPort = readPortFromEnvFile(await readFile(new URL("../.env", import.meta.url), "utf8"));
} catch {
  // The backend defaults to port 3000 when the root .env file is absent.
}

const port = Number(process.env.PORT ?? envPort ?? 3000);
const healthUrl = `http://127.0.0.1:${port}/`;
const deadline = Date.now() + 90_000;

while (Date.now() < deadline) {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1500) });
    if (response.ok) break;
  } catch {
    // Nest is still compiling or bootstrapping; check again shortly.
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
}

if (Date.now() >= deadline) {
  console.error(`Backend did not become ready at ${healthUrl}; Vite was not started.`);
  process.exit(1);
}

console.log(`Backend is ready at ${healthUrl}; starting Vite.`);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const frontend = spawn(npm, ["--prefix", "frontend", "run", "dev"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => frontend.kill(signal));
}

frontend.on("error", (error) => {
  console.error("Could not start the frontend:", error.message);
  process.exitCode = 1;
});
frontend.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});

import { spawn, execSync } from "node:child_process";
import net from "node:net";

const HOST = "127.0.0.1";
const PORT = 3000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForPort({ host, port, timeoutMs }) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(600);
      socket.once("error", () => resolve(false));
      socket.once("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, host, () => {
        socket.end();
        resolve(true);
      });
    });
    if (ok) return true;
    await sleep(200);
  }
  return false;
}

function killExisting() {
  try {
    execSync(`lsof -nP -iTCP:${PORT} -sTCP:LISTEN -t | xargs kill -9`, { stdio: "ignore" });
  } catch {
    // ignore
  }
  try {
    execSync(`pkill -f "next dev"`, { stdio: "ignore" });
  } catch {
    // ignore
  }
}

async function main() {
  console.log(`Stopping dev server on ${HOST}:${PORT} (if any)...`);
  killExisting();

  console.log("Starting dev server...");
  // macOS uses fsevents natively — no need for polling.
  // Limit heap to 2 GB so runaway watchers can't eat all memory.
  const env = {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=2048`.trim(),
  };
  const child = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "dev", "--", "--webpack", "--hostname", HOST, "--port", String(PORT)],
    { stdio: "inherit", env },
  );

  const ok = await waitForPort({ host: HOST, port: PORT, timeoutMs: 20_000 });
  if (ok) {
    console.log(`\nReady: http://${HOST}:${PORT}\n`);
  } else {
    console.error("\nDev server did not become ready in time.\n");
  }

  child.on("exit", (code) => process.exit(code ?? 1));
}

main();


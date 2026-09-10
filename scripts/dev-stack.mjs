#!/usr/bin/env node
/**
 * Boots the full local stack: vercel dev (API + frontend).
 *
 * Kills any stale processes on the ports used so vercel dev always lands on
 * its port and Vite (its internal devCommand) always gets :5173.
 * Without this, leftover Vite instances drift to :5174, :5175, etc., and
 * vercel dev polls :5173 forever and never becomes ready.
 *
 * Override the API port with PORT when running several apps side by side:
 *   PORT=3005 pnpm dev
 */
import { execSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** API port. Overridable so this can run alongside other local apps. */
const PORT = Number(process.env.PORT) || 3006;

/** The repo root, needed before anything reads a file out of it. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The two settings the vector bridge reads, lifted out of .env.local.
 *
 * vercel dev loads the env files for the app, but the bridge is a plain child
 * process of this script and gets whatever is in the shell — so a VECTOR_APP
 * written in .env.local reached the API and not the one process that needed
 * it, and the bridge silently kept opening the default. Read here so the file
 * everything else is configured in configures this too.
 *
 * Deliberately only these two keys, and only when the shell has not already
 * said: this is not a general env loader, and it must not start deciding what
 * DATABASE_URL is behind vercel's back.
 */
const loadBridgeEnv = () => {
  let text = "";
  try {
    text = readFileSync(path.join(root, ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const key of ["VECTOR_APP", "VECTOR_PORT"]) {
    if (process.env[key]) {
      continue;
    }
    const found = text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
    if (found) {
      // Quotes are how a path with a space is written in an env file, and
      // every editor worth pointing at lives in "/Applications/Something.app".
      process.env[key] = found.replace(/^["']|["']$/g, "");
    }
  }
};

loadBridgeEnv();

/** The vector bridge, which the canvas calls to open SVGs in a desktop app. */
const BRIDGE_PORT =
  Number(process.env.VECTOR_PORT || process.env.AFFINITY_PORT) || 4123;

// Only ports this stack owns — killing an arbitrary PORT the user set is the
// point, but the Vite range is fixed by vercel dev's devCommand.
const PORTS = [PORT, BRIDGE_PORT, 5173, 5174, 5175];
const isWin = process.platform === "win32";
const WHITESPACE = /\s+/;

function killPort(port) {
  try {
    if (isWin) {
      const out = execSync(`netstat -ano | findstr :${port}`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      });
      const pids = [
        ...new Set(
          out
            .split("\n")
            .map((l) => l.trim().split(WHITESPACE).pop())
            .filter(Boolean)
        ),
      ];
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
        } catch {
          // The process may already be gone; that is the desired end state.
        }
      }
    } else {
      execSync(`lsof -ti tcp:${port} | xargs kill -9 2>/dev/null || true`, {
        shell: true,
        stdio: "ignore",
      });
    }
  } catch {
    // Nothing was listening on the port, which is exactly what we want.
  }
}

for (const port of PORTS) {
  killPort(port);
}

// Give the OS a moment to release the ports before vercel dev tries to bind.
await new Promise((r) => setTimeout(r, 500));

console.log(
  `\n[${process.env.VITE_SITE || "addison"}] Starting dev server → http://localhost:${PORT}`
);

// Name the database on every start.
//
// `vercel dev` pulls the Development environment, and for a long time that was
// the same Neon instance as Production — the connection strings differ only by
// password, so nothing on screen said the local server was reading and writing
// the live site. Printing the host makes that impossible to be unsure about.
// `pnpm db:info` gives the full answer, including the system identifier.
const dbUrl = (
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  ""
).trim();
if (dbUrl) {
  try {
    console.log(`  database → ${new URL(dbUrl).hostname}\n`);
  } catch {
    console.log("  database → (unparseable DATABASE_URL)\n");
  }
} else {
  // vercel dev pulls env itself, so this is the normal case locally.
  console.log("  database → pulled by vercel dev; run `pnpm db:info` to see\n");
}

// The browser bundle reads VITE_SITE, but the serverless functions read SITE —
// on Vercel both are set on the project. Locally only VITE_SITE is passed in, so
// mirror it: otherwise /api/* resolves to the default site and serves the wrong
// site's settings back to a correctly-branded frontend.
const env = { ...process.env };
if (env.VITE_SITE && !env.SITE) {
  env.SITE = env.VITE_SITE;
}

const pnpm = isWin ? "pnpm.cmd" : "pnpm";
const child = spawn(pnpm, ["exec", "vercel", "dev", "--listen", String(PORT)], {
  cwd: root,
  env,
  stdio: "inherit",
});

// The canvas's "Open in <editor>" button reaches a local HTTP server, so it
// has to come up with the rest of the stack. It is optional in spirit — the
// canvas works without it — but harmless to always run, and a half-started
// stack is worse than a process sitting on a port.
//
// Which editor it opens is VECTOR_APP, read from the environment like
// everything else here. Set it to a full path when two installs answer to the
// same name: a Mac App Store editor and its own browser PWA both respond to
// "Boxy SVG", and the PWA is a launcher stub that ignores the file it is
// handed — it starts, loads nothing, and the canvas waits for an edit that
// cannot arrive.
const bridge = spawn(process.execPath, ["scripts/affinity-bridge.mjs"], {
  cwd: root,
  env: { ...process.env },
  stdio: "inherit",
});
// A bridge crash must not take the app down with it; the editor just shows the
// error the next time someone tries to open something.
bridge.on("exit", (code, signal) => {
  if (signal) {
    return;
  }
  console.log(`\n[vector-bridge] exited (code ${code})\n`);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  bridge.kill("SIGTERM");
  process.exit(code ?? 1);
});

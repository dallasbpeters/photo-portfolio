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
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/** API port. Overridable so this can run alongside other local apps. */
const PORT = Number(process.env.PORT) || 3006;

/** The Affinity bridge, which the editor calls to open SVGs in the desktop app. */
const BRIDGE_PORT = Number(process.env.AFFINITY_PORT) || 4123;

// Only ports this stack owns — killing an arbitrary PORT the user set is the
// point, but the Vite range is fixed by vercel dev's devCommand.
const PORTS = [PORT, BRIDGE_PORT, 5173, 5174, 5175];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

/*
 * The site's own env file, handed to the functions.
 *
 * vite.config.ts already loads `.env.local` then `.env.<site>.local` — but that
 * is the Vite process, so it reaches the browser bundle and the config, and not
 * the serverless functions `vercel dev` runs. Those got a plain copy of the
 * shell's environment plus whatever `vercel dev` pulls into
 * `.env.development.local`.
 *
 * Anything that lives only in the site file was therefore invisible to /api.
 * BLOB_READ_WRITE_TOKEN is the one that bites: it is per-site, it is in all
 * three site files and in none of the shared ones, so every upload failed
 * claiming Blob was not enabled while the token sat on disk two directories up.
 *
 * Same precedence Vite uses — the shared file first, the site's own overriding
 * it — so the two halves of the stack cannot disagree about what site they are.
 */
const site = env.VITE_SITE || "addison";
for (const file of [".env.local", `.env.${site}.local`]) {
  const at = path.resolve(root, file);
  if (existsSync(at)) {
    const { parsed } = dotenv.config({ override: true, path: at });
    Object.assign(env, parsed);
  }
}

const pnpm = isWin ? "pnpm.cmd" : "pnpm";
const child = spawn(pnpm, ["exec", "vercel", "dev", "--listen", String(PORT)], {
  cwd: root,
  env,
  stdio: "inherit",
});

// The editor's "Open in Affinity" button reaches a local HTTP server, so it has
// to come up with the rest of the stack. It is optional in spirit — the canvas
// works without it — but harmless to always run, and a half-started stack is
// worse than a process sitting on a port.
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
  console.log(`\n[affinity-bridge] exited (code ${code})\n`);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  bridge.kill("SIGTERM");
  process.exit(code ?? 1);
});

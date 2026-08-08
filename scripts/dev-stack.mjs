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
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** API port. Overridable so this can run alongside other local apps. */
const PORT = Number(process.env.PORT) || 3002;

// Only ports this stack owns — killing an arbitrary PORT the user set is the
// point, but the Vite range is fixed by vercel dev's devCommand.
const PORTS = [PORT, 5173, 5174, 5175];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

function killPort(port) {
  try {
    if (isWin) {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const pids = [...new Set(
        out.split('\n').map((l) => l.trim().split(/\s+/).pop()).filter(Boolean),
      )];
      for (const pid of pids) {
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {}
      }
    } else {
      execSync(`lsof -ti tcp:${port} | xargs kill -9 2>/dev/null || true`, {
        shell: true,
        stdio: 'ignore',
      });
    }
  } catch {}
}

for (const port of PORTS) killPort(port);

// Give the OS a moment to release the ports before vercel dev tries to bind.
await new Promise((r) => setTimeout(r, 500));

console.log(
  `\n[${process.env.VITE_SITE || 'addison'}] Starting dev server → http://localhost:${PORT}\n`,
);

const pnpm = isWin ? 'pnpm.cmd' : 'pnpm';
const child = spawn(pnpm, ['exec', 'vercel', 'dev', '--listen', String(PORT)], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

#!/usr/bin/env node

/**
 * Local bridge between the board editor and Affinity Designer.
 *
 * The app is a web app, and Affinity is a desktop app; this little HTTP server
 * is the handshake between them. The browser tells it "open this SVG", it
 * downloads the bytes, writes them to a file on this machine and asks Affinity
 * to open that file. When the user edits and saves in Affinity, the same file
 * changes, and the bridge reports the new content back to the browser, which
 * writes it into the board through the app's own API.
 *
 * It is deliberately stateless and dumb: change detection is done by the
 * browser, which compares the file's sha256 across status polls, so the bridge
 * only ever answers two questions — "what is in this file now?" and "open this
 * one". That keeps the auth in the browser where the session lives, and lets
 * this script stay free of any dependency or configuration beyond what Affinity
 * is called.
 *
 * Run it with:
 *   node scripts/affinity-bridge.mjs
 *
 * Configuration (all optional):
 *   AFFINITY_PORT  port to listen on                 (default 4123)
 *   AFFINITY_APP   the Affinity app name             (default "Affinity")
 *
 * Endpoints (all under the bridge's origin):
 *   POST /open?item=<id>   body { url }  downloads the SVG, opens it in Affinity
 *   GET  /status?item=<id>               { file, hash } of the working copy
 *   GET  /file?item=<id>                 the working copy, as image/svg+xml
 *   GET  /                                { name, ok } — a health check
 *
 * A note on saving: Affinity remembers the format of the file it opened, so
 * Cmd+S writes back to the .svg rather than prompting for an .afdesign. If that
 * ever changes, the hash in /status simply stops moving and the canvas stops
 * picking up edits — the fix is on Affinity's side, not here.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";

/** The port vercel dev and the SPA have no reason to collide with. */
const PORT = Number(process.env.AFFINITY_PORT) || 4123;
// The unified "Affinity" app (the single app that replaced Designer/Photo/Publisher
// 2) is the one installed on this machine; `open -a` fails if the name does not
// match exactly, so the default follows the install rather than the brand.
const APP = process.env.AFFINITY_APP || "Affinity";
const HOST = "127.0.0.1";
const DIR = path.join(os.homedir(), ".addison-affinity");
mkdirSync(DIR, { recursive: true });

/** ids become filenames, so they must not walk out of DIR. */
const SAFE_ID = /^[A-Za-z0-9._-]+$/;
const HTTP_URL = /^https?:\/\//i;
const SVG_TAG = /<svg[\s>]/i;

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const fileFor = (itemId) => path.join(DIR, `${itemId}.svg`);

const sha256Of = (itemId) => {
  try {
    return createHash("sha256")
      .update(readFileSync(fileFor(itemId)))
      .digest("hex");
  } catch {
    return null;
  }
};

const json = (res, code, body) => {
  res.writeHead(code, {
    ...CORS_HEADERS,
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(body));
};

const openInAffinity = (filePath) =>
  new Promise((resolve, reject) => {
    const child = spawn("open", ["-a", APP, filePath], { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Affinity could not be opened (exit ${code}). Is "${APP}" installed? ` +
              "If it is named differently, set AFFINITY_APP."
          )
        );
      }
    });
  });

const health = (res) => {
  json(res, 200, { app: APP, name: "affinity-bridge", ok: true, port: PORT });
};

const status = (res, item) => {
  let exists = false;
  try {
    exists = statSync(fileFor(item)).isFile();
  } catch {
    exists = false;
  }
  json(res, 200, { file: exists, hash: exists ? sha256Of(item) : null });
};

const file = (res, item) => {
  try {
    const svg = readFileSync(fileFor(item));
    res.writeHead(200, { "Content-Type": "image/svg+xml", ...CORS_HEADERS });
    res.end(svg);
  } catch {
    json(res, 404, { error: "No file has been opened for this item yet" });
  }
};

const readJsonBody = async (req, res) => {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2_000_000) {
      json(res, 413, { error: "That SVG is too large" });
      return null;
    }
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    json(res, 400, { error: "Expected a JSON body" });
    return null;
  }
};

const open = async (req, res, item) => {
  const parsed = await readJsonBody(req, res);
  if (parsed === null) {
    return;
  }
  const source = typeof parsed?.url === "string" ? parsed.url : "";
  if (!HTTP_URL.test(source)) {
    json(res, 400, { error: "A http(s) url is required" });
    return;
  }
  try {
    const fetched = await fetch(source);
    if (!fetched.ok) {
      throw new Error(`The image could not be downloaded (${fetched.status})`);
    }
    const svg = await fetched.text();
    if (!SVG_TAG.test(svg.slice(0, 512))) {
      throw new Error("That URL does not look like an SVG");
    }
    writeFileSync(fileFor(item), svg);
    await openInAffinity(fileFor(item));
    json(res, 200, { file: true, hash: sha256Of(item) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not open it";
    json(res, 500, { error: message });
  }
};

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

  if (url.pathname === "/" && req.method === "GET") {
    health(res);
    return;
  }

  const item = url.searchParams.get("item") ?? "";
  if (!SAFE_ID.test(item)) {
    json(res, 400, { error: "A valid item id is required" });
    return;
  }
  if (url.pathname === "/status" && req.method === "GET") {
    status(res, item);
    return;
  }
  if (url.pathname === "/file" && req.method === "GET") {
    file(res, item);
    return;
  }
  if (url.pathname === "/open" && req.method === "POST") {
    await open(req, res, item);
    return;
  }
  json(res, 404, { error: "Not found" });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\nPort ${PORT} is already in use — is the bridge already running?\n`
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(
    `\n[affinity-bridge] listening on http://localhost:${PORT} → ${APP}\n`
  );
});

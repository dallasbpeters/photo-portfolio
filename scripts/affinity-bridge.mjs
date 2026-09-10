#!/usr/bin/env node

/**
 * Local bridge between the board editor and a desktop vector editor.
 *
 * The board is a web app and the editor is a desktop app; this little HTTP
 * server is the handshake between them. The browser tells it "open this SVG",
 * it downloads the bytes, writes them to a file on this machine and asks the
 * editor to open that file. When the user edits and saves, the same file
 * changes, and the bridge reports the new content back to the browser, which
 * writes it into the board through the app's own API.
 *
 * Which editor is a setting, not a decision this file makes. It only ever runs
 * `open -a <app> <file>`, so anything that opens an .svg and saves back to the
 * same .svg works — Affinity, Boxy SVG, Inkscape, Illustrator. The one thing
 * that does not is an app that saves to its own format and needs an explicit
 * Export to give the SVG back: Linearity Curve writes .curve, so the file
 * never changes and the canvas never sees an edit. A browser PWA is out for a
 * different reason — it is a launcher stub that ignores the file argument
 * entirely, so `open -a` starts it with nothing loaded.
 *
 * It is deliberately stateless and dumb: change detection is done by the
 * browser, which compares the file's sha256 across status polls, so the bridge
 * only ever answers two questions — "what is in this file now?" and "open this
 * one". That keeps the auth in the browser where the session lives, and lets
 * this script stay free of any dependency or configuration beyond what Affinity
 * is called.
 *
 * Run it with:
 *   pnpm bridge
 *
 * which is the same thing plus --env-file-if-exists=.env.local, so a
 * VECTOR_APP written there is honoured however the bridge is started. The dev
 * stack and the desktop shell both hand it down themselves; this is for
 * running it on its own, which is what you do when the board is the live site
 * rather than localhost.
 *
 * Configuration (all optional):
 *   VECTOR_PORT  port to listen on                              (default 4123)
 *   VECTOR_APP   the editor's app name, or a full path to the
 *                .app when two installs share a name            (default "Affinity")
 *
 * AFFINITY_PORT and AFFINITY_APP still work; they were the names when this
 * only ever opened one app.
 *
 * Endpoints (all under the bridge's origin):
 *   POST /open?item=<id>   body { url } or { svg }
 *                          a url is downloaded; svg is written as given, which
 *                          is how a photograph reaches a vector editor — the
 *                          browser wraps it, since only it can measure a
 *                          picture without a decoder per format
 *   GET  /status?item=<id>               { file, hash } of the working copy
 *   GET  /file?item=<id>                 the working copy, as image/svg+xml
 *   GET  /                                { name, ok } — a health check
 *
 * A note on saving: this only works while the editor writes back to the file
 * it opened. Affinity remembers the format it was handed, so Cmd+S writes the
 * .svg rather than prompting for an .afdesign, and Boxy SVG and Inkscape have
 * SVG as their native format so there is nothing to remember. If an editor
 * ever stops doing that, the hash in /status simply stops moving and the
 * canvas stops picking up edits — which looks like the bridge being broken and
 * is not.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";

/** The port vercel dev and the SPA have no reason to collide with. */
const PORT =
  Number(process.env.VECTOR_PORT || process.env.AFFINITY_PORT) || 4123;
/*
 * Which editor to hand the file to.
 *
 * `open -a` fails if the name does not match the install exactly, so the
 * default follows what is installed rather than the brand: the unified
 * "Affinity" app that replaced Designer/Photo/Publisher 2. A full path to the
 * .app works too, and is the answer when two installs share a name — a Mac App
 * Store editor and its own PWA both answer to "Boxy SVG", and the PWA is the
 * one that silently does nothing.
 */
const APP = process.env.VECTOR_APP || process.env.AFFINITY_APP || "Affinity";
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

const openInEditor = (filePath) =>
  new Promise((resolve, reject) => {
    const child = spawn("open", ["-a", APP, filePath], { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `The editor could not be opened (exit ${code}). Is "${APP}" installed? ` +
              "If it is named differently, set VECTOR_APP — a full path to the " +
              ".app if two installs share a name."
          )
        );
      }
    });
  });

const health = (res) => {
  json(res, 200, { app: APP, name: "vector-bridge", ok: true, port: PORT });
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

/** The SVG to write, downloaded from a url or handed over ready-made. */
const svgFrom = async (parsed) => {
  /*
   * Given, not fetched.
   *
   * A photograph cannot be opened in a vector editor as it stands, so the
   * browser wraps it in a one-element SVG that references it — see
   * src/boards/io/rasterAsSvg.ts. The wrapping happens there because measuring
   * a picture needs a decoder per format, and the browser already has them
   * all. This end only has to agree to write what it is handed.
   */
  if (typeof parsed?.svg === "string") {
    return parsed.svg;
  }
  const source = typeof parsed?.url === "string" ? parsed.url : "";
  if (!HTTP_URL.test(source)) {
    throw new Error("A http(s) url or an svg is required");
  }
  const fetched = await fetch(source);
  if (!fetched.ok) {
    throw new Error(`The image could not be downloaded (${fetched.status})`);
  }
  return fetched.text();
};

const open = async (req, res, item) => {
  const parsed = await readJsonBody(req, res);
  if (parsed === null) {
    return;
  }
  try {
    const svg = await svgFrom(parsed);
    // Checked whichever way it arrived: the editor is about to be pointed at
    // this file, and an editor opening something that is not a drawing is a
    // worse failure than a refusal here.
    if (!SVG_TAG.test(svg.slice(0, 512))) {
      throw new Error("That does not look like an SVG");
    }
    writeFileSync(fileFor(item), svg);
    await openInEditor(fileFor(item));
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
    `\n[vector-bridge] listening on http://localhost:${PORT} → ${APP}\n`
  );
});

/**
 * Thin desktop shell for the photo portfolio.
 *
 * It opens one window on the live site and runs the Affinity bridge beside it.
 * Nothing from `api/` runs here — the site's own deployment serves every
 * request, so the app is only a window, a dock icon and the local bridge.
 *
 * Pick the site with the ELECTRON_SITE variable or `--site=<key>`:
 *   ELECTRON_SITE=addison pnpm electron:dev
 *
 * Boot on demand: the app exits when the window closes, including on macOS.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import { forgetGoogleToken, requestGoogleToken } from "./googleAuth.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Shown in the menu bar, the dock and the About box. Must match productName. */
const APP_NAME = "Photos";

/** Where the window opens. The admin sign-in lives here. */
const START_PATH = "/admin";

// In `electron .` the name would otherwise read "Electron" everywhere the OS
// shows it. The packaged app gets it from electron-builder; this covers dev.
app.setName(APP_NAME);

/** Where each site lives. Keys match VITE_SITE / SITE. */
const SITE_URLS = {
  addison: "https://addisonsphotos.com",
  cyan: "https://cyansphotos.com",
  "dallas-images": "https://dallaspeters.com",
};

const siteArg = process.argv
  .find((a) => a.startsWith("--site="))
  ?.slice("--site=".length);
const site = siteArg || process.env.ELECTRON_SITE || "dallas-images";
const origin = SITE_URLS[site];
if (!origin) {
  console.error(
    `[electron] unknown site "${site}"; known: ${Object.keys(SITE_URLS).join(", ")}`
  );
  app.exit(1);
}

// The bridge is the same script the dev stack runs. Electron's binary doubles
// as Node when ELECTRON_RUN_AS_NODE is set, so no separate Node install is
// needed on the machine that runs the packaged app.
const startBridge = () => {
  const script = path.join(here, "..", "scripts", "affinity-bridge.mjs");
  const child = spawn(process.execPath, [script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => {
    if (!signal) {
      console.log(`[affinity-bridge] exited (code ${code})`);
    }
  });
  return child;
};

const isInsideSite = (url) => {
  try {
    const host = new URL(url).hostname;
    const siteHost = new URL(origin).hostname;
    return host === siteHost || host === `www.${siteHost}`;
  } catch {
    return false;
  }
};

/**
 * Google sign-in, on request from the page (see preload.cjs).
 *
 * Only the site itself may ask: any other page that ended up in this window
 * would otherwise be able to trigger a consent screen for our Google client.
 */
const registerGoogleAuth = () => {
  ipcMain.handle("google:token", async (event, scope) => {
    if (!isInsideSite(event.senderFrame?.url ?? "")) {
      throw new Error("Google sign-in is only available to the site.");
    }
    if (typeof scope !== "string" || !scope.trim()) {
      throw new Error("A scope is required.");
    }
    const token = await requestGoogleToken(scope.trim());
    // The browser took focus for the consent screen; take it back.
    BrowserWindow.fromWebContents(event.sender)?.focus();
    return token;
  });
  ipcMain.handle("google:forget", () => forgetGoogleToken());
};

const createWindow = () => {
  const win = new BrowserWindow({
    backgroundColor: "#000000",
    height: 900,
    minHeight: 600,
    minWidth: 900,
    show: false,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(here, "preload.cjs"),
      sandbox: true,
    },
    width: 1440,
  });

  // Show once painted so there is no white flash before the site arrives.
  win.once("ready-to-show", () => win.show());
  win.webContents.on("did-finish-load", () => {
    console.log(`[electron] loaded ${win.webContents.getURL()}`);
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[electron] failed to load ${url}: ${code} ${desc}`);
  });

  // Anything off the site opens in the default browser, not in this window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInsideSite(url)) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!isInsideSite(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadURL(`${origin}${START_PATH}`);
  return win;
};

let bridge;

app.whenReady().then(() => {
  // The default menu is built from the process name, so rebuild it after
  // setName — otherwise the first menu still says "Electron".
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: "appMenu" },
      { role: "fileMenu" },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ])
  );
  if (process.platform === "darwin" && !app.isPackaged) {
    app.dock?.setIcon(path.join(here, "icon.png"));
  }
  registerGoogleAuth();
  bridge = startBridge();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// On demand means gone when the window is gone — on every platform.
app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  bridge?.kill("SIGTERM");
});

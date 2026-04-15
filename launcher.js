/**
 * Powerhouse CashFlow Launcher
 * Starts the data server (server.js) and the Next.js production server,
 * then opens the browser. No terminal window visible.
 */

const { spawn, exec } = require("child_process");
const path = require("path");
const http = require("http");
const fs   = require("fs");
const os   = require("os");

const V2_DIR = __dirname;               // corneat-flow-v2/ (where this file lives)
const ROOT   = path.join(__dirname, ".."); // CorNeat CashFlow/ parent folder
const PORT_DATA = 3001;
const PORT_APP  = 3000;
const URL       = `http://localhost:${PORT_APP}`;

// ── Logging ──────────────────────────────────────────────────────────────────
const LOG = path.join(ROOT, "corneat-flow.log");
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG, line); } catch (_) {}
  // Also write to a separate next.log inside v2 for Next.js output
};

log("=== Powerhouse CashFlow starting ===");
log(`OS: ${os.platform()} ${os.release()}`);
log(`Node: ${process.version}`);
log(`ROOT: ${ROOT}`);
log(`V2_DIR: ${V2_DIR}`);

// ── Check build exists ────────────────────────────────────────────────────────
const buildDir = path.join(V2_DIR, ".next");
log(`Checking for build at: ${buildDir}`);
if (!fs.existsSync(buildDir)) {
  log("ERROR: .next build folder not found. Run Setup first.");
  exec(`mshta "javascript:var sh=new ActiveXObject('WScript.Shell');sh.Popup('Powerhouse CashFlow has not been set up yet. Please run Setup Powerhouse CashFlow.bat first.',0,'Powerhouse CashFlow',48);close()"`);
  process.exit(1);
}
log(".next folder found — proceeding.");

// ── Start data server ─────────────────────────────────────────────────────────
log("Starting data server on port 3001...");
const dataServer = spawn("node", [path.join(ROOT, "server.js")], {
  cwd: ROOT,
  detached: true,
  stdio: "ignore",
  windowsHide: true,
});
dataServer.on("error", (e) => log(`Data server spawn error: ${e.message}`));
dataServer.unref();
log(`Data server spawned (PID: ${dataServer.pid})`);

// ── Start Next.js ─────────────────────────────────────────────────────────────
// On Windows, .bin/next is a shell script — must use next.cmd instead
log("Starting Next.js on port 3000...");

const nextLog = fs.openSync(path.join(ROOT, "next-server.log"), "a");

// Use cmd /c to run next.cmd reliably on Windows
const nextServer = spawn(
  "cmd",
  ["/c", path.join(V2_DIR, "node_modules", ".bin", "next.cmd"), "start", "--port", String(PORT_APP)],
  {
    cwd: V2_DIR,
    detached: true,
    stdio: ["ignore", nextLog, nextLog],  // pipe stdout/stderr to log file
    windowsHide: true,
    env: { ...process.env, NODE_ENV: "production" },
  }
);
nextServer.on("error", (e) => log(`Next.js spawn error: ${e.message}`));
nextServer.unref();
log(`Next.js spawned (PID: ${nextServer.pid})`);

// ── Poll until ready, then open browser ──────────────────────────────────────
log(`Polling for readiness at ${URL}...`);

function openBrowser() {
  log("App is ready — opening browser.");
  exec(`start "" "${URL}"`);
}

function waitForApp(attempts = 0) {
  // Give up after 60 seconds (120 attempts × 500ms)
  if (attempts > 120) {
    log("Timed out after 60s. Check next-server.log for errors.");
    openBrowser(); // open anyway — user will see error in browser
    return;
  }
  if (attempts % 10 === 0) log(`Still waiting... attempt ${attempts}`);
  http.get(URL, (res) => {
    log(`Got response: HTTP ${res.statusCode}`);
    if (res.statusCode < 500) {
      openBrowser();
    } else {
      setTimeout(() => waitForApp(attempts + 1), 500);
    }
  }).on("error", () => {
    setTimeout(() => waitForApp(attempts + 1), 500);
  });
}

// Give the servers a 2-second head-start before polling
setTimeout(() => waitForApp(), 2000);

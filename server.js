/**
 * CorNeat Flow — Data Server
 * Express server on port 3001 — stores all app data as JSON files in ./data/
 * Proxied by Next.js /api/* routes via lib/server-api.ts
 */

const express = require("express");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");

const PORT     = 3001;
const DATA_DIR = path.join(__dirname, "data");

// ── Ensure data directory exists ────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── File helpers ─────────────────────────────────────────────────────────────
function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readJson(name, fallback) {
  const fp = filePath(name);
  try {
    if (!fs.existsSync(fp)) return fallback;
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(name, data) {
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf8");
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ── GET /api/data  — return everything ───────────────────────────────────────
app.get("/api/data", (_req, res) => {
  res.json({
    transactions:  readJson("transactions",  []),
    meta:          readJson("meta",          {}),
    excluded:      readJson("excluded",      []),
    overrides:     readJson("overrides",     {}),
    adjustments:   readJson("adjustments",   []),
    manualEntries: readJson("manual-entries", []),
    reconStatus:   readJson("recon-status",  { lastRun: null, errorCount: 0, warningCount: 0, issues: [] }),
    rules:         readJson("rules",         []),
  });
});

// ── DELETE /api/data  — wipe everything ──────────────────────────────────────
app.delete("/api/data", (_req, res) => {
  const files = [
    "transactions", "meta", "excluded", "overrides",
    "adjustments", "manual-entries", "recon-status", "rules",
  ];
  files.forEach(name => {
    const fp = filePath(name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  res.json({ ok: true });
});

// ── POST routes — each saves one JSON file ────────────────────────────────────
const ROUTES = [
  { path: "/api/transactions",   file: "transactions"   },
  { path: "/api/meta",           file: "meta"           },
  { path: "/api/excluded",       file: "excluded"       },
  { path: "/api/overrides",      file: "overrides"      },
  { path: "/api/adjustments",    file: "adjustments"    },
  { path: "/api/manual-entries", file: "manual-entries" },
  { path: "/api/recon-status",   file: "recon-status"   },
  { path: "/api/rules",          file: "rules"          },
];

ROUTES.forEach(({ path: routePath, file }) => {
  app.post(routePath, (req, res) => {
    try {
      writeJson(file, req.body);
      res.json({ ok: true });
    } catch (err) {
      console.error(`Error saving ${file}:`, err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, "127.0.0.1", () => {
  console.log(`CorNeat Flow data server running on http://127.0.0.1:${PORT}`);
});

# CorNeat Flow V2

Next.js 15 · TypeScript · Tailwind CSS · shadcn/ui

This is the rebuild of CorNeat Flow as a proper Next.js application.
It runs alongside the existing `server.js` data server and reads from
the same `data/` JSON files on OneDrive.

---

## Quick Start

**First time only:**
```bash
cd corneat-flow-v2
npm install
```

**Every time after:**
Double-click **`Start CorNeat Flow V2.bat`** in the parent folder.

Or manually:
```bash
# Terminal 1 — data server (from parent folder)
node server.js

# Terminal 2 — Next.js app
cd corneat-flow-v2
npm run dev
```

Then open **http://localhost:3000**

---

## Project Structure

```
corneat-flow-v2/
├── app/                    Next.js App Router pages
│   ├── layout.tsx          Root layout (Navbar lives here)
│   ├── globals.css         Tailwind + shadcn CSS variables
│   ├── cashflow/           Cashflow tab
│   ├── transactions/       Transactions tab
│   ├── rules/              Classification Rules tab
│   ├── forecast/           Forecast tab
│   ├── reconcile/          Reconcile tab
│   └── api/                API routes (proxy to server.js on :3001)
├── components/
│   ├── navbar.tsx          Top navigation + FX ticker
│   ├── fx-ticker.tsx       Live FX rates (frankfurter.app)
│   └── ui/                 shadcn/ui components
├── hooks/
│   └── use-app-data.ts     Data fetching, state, save helpers
├── lib/
│   ├── api-client.ts       Typed API calls (client-side)
│   ├── server-api.ts       Proxy helper (server-side API routes)
│   └── utils.ts            shadcn cn() utility
└── types/
    └── index.ts            All shared TypeScript types
```

---

## Data Flow

```
Browser → Next.js API route (/api/*)
        → server.js on :3001
        → data/*.json on OneDrive (shared with Tzvi)
```

The `data/` folder is **not** inside `corneat-flow-v2/` — it stays in
the parent folder alongside `server.js`, exactly as before.

---

## Tech Stack

| Layer       | Technology               |
|-------------|--------------------------|
| Framework   | Next.js 15 (App Router)  |
| Language    | TypeScript 5             |
| Styling     | Tailwind CSS v3          |
| Components  | shadcn/ui (New York)     |
| Icons       | lucide-react             |
| FX Data     | frankfurter.app (free)   |
| Data Store  | JSON files on OneDrive   |

---

## Build Steps

- [x] Step 1 — File locking on server.js  
- [x] Step 2 — Scaffold (this file)  
- [ ] Step 3 — Port data layer & API routes  
- [ ] Step 4 — Port UI tab by tab  
- [ ] Step 5 — Replace .bat launcher  

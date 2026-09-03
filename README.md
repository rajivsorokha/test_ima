# Ima Langnubi Dairy — Farm & Milk Network Manager

A desktop app (Tauri) backed by a Node.js/Express API and a local SQLite database
(`better-sqlite3`), for running a dairy that collects milk from ~20–30 partner
farms (~7,000 L/day target) alongside your own home farm.

## What's included

- **Login & roles** — every screen requires signing in. Four roles:
  - **Owner/Admin** — full access to everything, including user accounts.
  - **Manager** — full day-to-day operations (cows, milk, quality tests,
    tanks, POS, health, tasks) plus finance, payroll, reports, and the milk
    network. Everything except managing user accounts.
  - **Accountant** — Financial Ledger, Employees & payroll, Reports, Milk
    Network & invoices, plus the dashboard and POS. No cow/milk/health/task
    operations.
  - **Salesman** — Dashboard and Point of Sale only.

  Permissions are enforced on the API itself (not just hidden menus), and
  the **Users** page (Owner/Admin only) shows this matrix and lets you
  manage accounts.
- **Cow Management** — per-farm herds, breeds, age auto-calc, status.
- **Milk Recording** — AM/PM entry, per-cow or general herd, 7-day trend.
- **Milk Quality Tests** — fat %, SNF %, density, temperature, and a
  Pass/Fail adulteration result, logged per farm/collection.
- **Inventory Tanks** — cooling tanks/chillers with capacity, current level,
  a fill/draw-off log, and a live fill-percentage bar. Logging a network
  collection can route straight into a tank, which updates its level
  automatically.
- **Milk Network** — partner farm register (name, location, contact), cows
  per location, daily collection logging (optionally into a tank), and
  **invoice generation** (auto-computed from logged collections and
  rate/litre, or a manual rate).
- **Point of Sale — one unified till.** Milk, prepaid tokens
  (Quarter/Half/One Litre), and Ima Langnubi's own dairy products (paneer,
  milk cake, curd, ghee) sit in the *same* product catalog as cow feed and
  medicine, so one cart/checkout can mix all of them. The sale date
  defaults automatically to today (no picker to fill in unless you
  explicitly back-date an entry), and every sale captures a customer name
  **and phone number**. Tokens are properly modelled as *prepaid*: buying
  one is a normal paid line item; redeeming one later (handing over milk)
  is a separate, free action that just marks the token used.
- **Financial Ledger** *(admin only)* — income/expense categories, running balance.
- **Health Events** — Vaccination/Treatment/Deworming/Checkup/Surgery/
  Calving/Insemination, Open → In Progress → Resolved, vet name & cost.
- **Tasks** — priorities, due dates, overdue flags, assignment to staff.
- **Employees & Leave** *(admin only)* — staff directory, payroll, and a
  leave request / approve / reject workflow.
- **Reports** — CSV and PDF export for Milk, Finance, and Health, all
  branded with the farm name and logo, for any date range.

- **Database Backup** *(admin only, Settings page)* — download a full,
  consistent snapshot of the entire database as a single `.db` file at any
  time, and restore from a previous backup (this overwrites all current
  data and requires restarting the app afterward — the UI warns about this
  clearly before you confirm).
- **Licensing** — the software is licensed to Ima Langnubi Dairy by
  Xeoscape; the license agreement is viewable from the login screen and the
  Settings page, and included as `LICENSE.md` in this repo.

## Default login

Seeding the database creates one account per role:

| Username     | Password     | Role          |
|--------------|--------------|---------------|
| `admin`      | `admin123`   | Owner/Admin   |
| `manager`    | `manager123` | Manager       |
| `accountant` | `acc123`     | Accountant    |
| `salesman`   | `sales123`   | Salesman      |

**Change these before real use** — sign in as `admin` and update passwords
from the **Users** page. These credentials are intentionally *not* shown
anywhere in the app itself (the login screen only shows the company name,
address, and license link) — keep them somewhere safe outside this repo
once changed.

**Company address:** Ima Langnubi Dairy, Thangmeiband Sinam Leikai, Imphal,
Manipur — shown on the login screen, receipts, and PDF reports. Change it
via `FARM_ADDRESS` in `backend/.env` (see Configuration below).

## Project structure

```
ima-langnubi-dairy/
├── backend/            Node.js + Express + SQLite (better-sqlite3) API
│   ├── db/schema.sql   Full database schema
│   ├── db/seed.js      Sample data (users, 5 partner farms, cows, tanks, etc)
│   ├── middleware/auth.js  Session-token auth + admin gate
│   ├── routes/         REST endpoints per module
│   └── server.js       Auth-gated API + serves the built frontend
├── frontend/            Plain HTML/CSS/JS single-page app (no build step)
│   └── assets/          Ima Langnubi Dairy logo
└── src-tauri/           Tauri desktop shell (Rust), icons generated from the logo
```

## Quick start (as a local web app, no Tauri needed)

```bash
cd backend
npm install
npm run seed      # sample farms, cows, tanks, quality tests, products, users
npm start         # http://localhost:4000
```

Open `http://localhost:4000` — you'll land on the login screen; sign in with
`admin` / `admin123` (see table above).

**Using it from another computer on the network** (e.g. a till on a different
PC than the one running the server): the frontend automatically detects the
address it was loaded from and talks to the API there, so just open
`http://<the-server-machine's-IP>:4000` on the other device — no
configuration needed. If you instead see "Couldn't reach the server..." or
"Failed to fetch", it means either that computer can't reach the server
machine on port 4000 (check the firewall) or the backend (`npm start`)
isn't actually running there.

## Running as a desktop app (Tauri)

Requirements on your machine: Node.js 18+, Rust + Cargo, and the platform
Tauri prerequisites (on Linux: `webkit2gtk`, `libayatana-appindicator3-dev`,
etc — see https://tauri.app/start/prerequisites/).

```bash
npm install -g @tauri-apps/cli   # or use npx tauri ... below
cd backend && npm install && cd ..
npx tauri dev
```

This compiles the Rust shell, which spawns `node server.js` from `/backend`
automatically (see `src-tauri/src/main.rs`) and opens a native window loading
the frontend, which talks to the API at `http://localhost:4000`.

To build an installer: `npx tauri build`. Note: the bundled app still shells
out to the system `node` binary at runtime for simplicity — for a fully
self-contained installer (no Node.js required on the end-user's machine),
package `backend/` with a tool like `pkg` or `nexe` into a single executable
and point `main.rs`'s `Command::new("node")` at that binary instead.

**No visible console window on Windows.** Release builds (`cargo tauri
build`) run without any black CMD-style window — both for the app itself
and for the Node backend it spawns in the background. If the backend fails
to start, check `backend/backend.log` (created next to `server.js`) instead
of a console, since that's where its startup output now goes. Dev builds
(`cargo tauri dev`) intentionally keep a console for the Rust side, since
that's useful while developing — only the separate Node console is
suppressed in both modes.

## Configuration

Copy `backend/.env.example` to `backend/.env` to change the port, farm name,
or the daily litre collection target shown on the dashboard.

## Notes on the token system

"Milk Token" products (Quarter/Half/One Litre) are just catalog items like
any other — add one to the POS cart and check out to **sell** it; that's
when payment happens and a unique token code is generated. Later, whoever
holds the token brings it to the till and it's **redeemed** (Point of
Sale → Tokens tab → enter the code) — no charge, just marking it used,
since it was already paid for. Unused tokens can be voided.

## Notes on roles

The API enforces the permission matrix server-side (each route group is
gated with `requireRole(...)` in `backend/server.js`, and the product
catalog's read/write split lives inside `routes/products.js`), and the
frontend hides nav items and blocks direct hash navigation to match, so the
UI never dangles a link a role can't actually use. See the **Users** page
for the full matrix.

## Extending it

The API is modular (one route file per feature in `backend/routes/`), so
adding fields or new report types is mostly additive. The frontend has no
build step — it's vanilla JS with one file per page under
`frontend/js/views/`, all driven by the shared `api.js` helper — so you can
edit and refresh without a bundler.


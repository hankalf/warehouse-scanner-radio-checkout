# Scanner & Radio Checkout

A tablet-first web app for tracking a warehouse's numbered **handheld barcode scanners** and
**two-way radios** through their full lifecycle: **associate checkout → return → equipment-tech
inspection & charging → back in service**. A device kept out past its due time is flagged
overdue. Every action is recorded for accountability (who had what, when, and what condition it
came back in). Day-to-day the app runs in **kiosk mode on a shared tablet** by the charging rack;
the management board and admin panel are for admins, supervisors, and leads.

## Lifecycle

```
AVAILABLE ──checkout(operator)──▶ CHECKED_OUT ──return(operator)──▶ RETURNED (awaiting inspection)
   ▲                                                                   │
   │                                 tech inspects + docks on charger   │
   │                                                                    ▼
   └───── condition GOOD ◀──────────────── 4-question checklist ──────▶ DAMAGED
                                                                         │
                     supervisor / lead / admin returns to service ◀──────┘
```

Before a returned device goes back in service, an **equipment tech answers a 4-question
checklist** (all prompts bilingual, English + Spanish):

1. **On the charger?** Yes / No
2. **Inspected?** Yes / No — screen, trigger/keys, battery, strap (scanners); antenna, PTT
   button, battery, belt clip (radios)
3. **Condition** — Good or Damaged
4. If **Damaged**, describe why — and optionally **attach a photo** (captured on the tablet,
   downscaled on-device)

A **Good** device (on the charger **and** inspected) returns straight to service. A **Damaged**
device moves to a **DAMAGED** state with the reported reason and photo, and **only a supervisor,
lead, or admin** can return it to service from the board (where they see the reason and photo).

- **Overdue** is derived (a checked-out device past its due time), shown in red with a banner.
- **Out of service** — admins/supervisors/leads can retire lost or broken devices and restore
  them later (a restored device goes to *Awaiting inspection* first).

### Device types, numbering & due times

Each device is a **Scanner** or a **Radio**. Numbers are **unique per type**, so Scanner #5 and
Radio #5 both exist. The seed creates **20 scanners (#1–#20) and 20 radios (#1–#20)**; add,
renumber, or remove devices (singly or as a numbered range) in **Admin → Devices**.

A device is due back a fixed number of **hours after checkout** — one shift plus some slack —
rather than "end of day", so night shifts that cross midnight work the same as day shifts. The
window is set **per device type** in **Admin → Advanced → Checkout policy** (default **12 h** for
both). The current policy is printed at the top of the kiosk, the confirmation screen shows the
exact due-back time, and that time then appears on the device's tile.

On **both** the kiosk and the management board a tile is **filled by type** — silver for
scanners, blue for radios — and **ringed by status**: green available, yellow checked out, orange
awaiting inspection, red damaged, red + "OVERDUE" when past due. A checked-out tile also shows
**who has it** (first name + last initial) and **when it's due back**. The kiosk groups scanners
and radios into two blocks so each type is easy to find.

> Logged times and Teams messages use the **server's local time** — set the `TZ` environment
> variable (e.g. `TZ=America/Chicago`) so they match the warehouse. The active timezone and
> current server time are shown in **Admin → Advanced → System**. `render.yaml` sets `TZ` for
> Render; on Railway add it as a variable.

## Roles (identified by PIN)

| Role | Code | Can do |
|------|------|--------|
| Operator | `OPERATOR` | Check out an available device; return **their own** checked-out device (kiosk) |
| Equipment tech | `TECH` | Inspect & dock returned devices via the checklist, returning good ones to service or flagging damage |
| Supervisor | `SUPERVISOR` | Fleet board, reports, and admin panel: manages **devices**, the **checkout policy**, and the kiosk logo, and can return **damaged** devices to service — but **not** employees or Teams settings |
| **Team lead** | `LEAD` | Floor lead: does every **operator and tech** job, reviews **damaged** devices, and can **view** the device fleet + audit log — but the admin panel is **read-only** (no Add a device, Workers, or Advanced, and no editing devices) |
| Admin | `ADMIN` | **Everything** — all of the above plus **manage employees & PINs** (add/edit/bulk-upload/remove) and **configure Teams alerts** |

A worker can hold multiple roles. **Admins implicitly have every capability**, and a **lead**
implicitly holds the operator and tech capabilities. Only the operator who checked a device out
(or an admin) can return it, so returns are attributed to the right person.

## Access & the admin panel

The app is used **99% of the time in kiosk mode** by employees on a shared tablet, so the two
surfaces are gated very differently:

- **`/kiosk`** — open to everyone, no sign-in. Employees tap a device and confirm each action
  with their PIN. This is the everyday floor surface.
- The **management board (`/`)**, reports, device history, and the **admin panel (`/admin`)**
  are restricted to **admins, supervisors, and leads** (leads get a read-only admin panel).
  Visiting them shows a **full-screen PIN sign-in**; a worker without one of those roles is
  told the area is kiosk-only and pointed back to the kiosk.
- Once signed in on the board, opening the **Admin** tab needs **no second PIN** — the existing
  session carries through.

## Screens

- **`/`** *(admin/supervisor/lead)* — live color-coded fleet board, grouped by type; tap a device
  to act on it. Techs get a **batch mode** to inspect & dock many returned devices at once. A
  supervisor returns **damaged** devices to service here.
- **`/reports`** — end-of-shift sweep of everything still checked out, plus fleet metrics:
  average return→inspected turnaround, total inspections, damage reports, and most-used devices.
- **`/kiosk`** — full-screen, **bilingual (English + Spanish)** floor surface for the shared
  tablet (auto-refreshes). Employees check out, check in, and inspect devices right on the
  kiosk, confirming each action with their PIN. A checked-out device's tile shows **who has
  it**. Inspection runs the 4-question checklist. An optional **company logo** shows in the
  top-left corner.
- **`/admin`** — add devices (singly or as a numbered range) and **manage the whole fleet**
  (edit a device's number/type, or remove a mis-added one), manage workers (including
  **CSV bulk upload**), set the **checkout policy**, upload a **company logo** for the kiosk,
  configure **Teams alerts** (see below), export the full audit log to CSV, and toggle
  **light/dark mode** from the header.
- **`/device/scanner/<number>`** and **`/device/radio/<number>`** — a single device's complete
  lifecycle history.

## Tech stack

- **Next.js (App Router, TypeScript)** — single deployable full-stack app
- **PostgreSQL + Prisma** — managed database with versioned migrations
- **Tailwind CSS** — touch-friendly, tablet-first UI

## Getting started (local dev)

You need a PostgreSQL database. Start a throwaway one with Docker (or use any Postgres and
put its URL in `.env`), then run the app:

```bash
docker run -d --name device-db \
  -e POSTGRES_USER=device -e POSTGRES_PASSWORD=device -e POSTGRES_DB=devicedb \
  -p 5432:5432 postgres:16       # or use your own Postgres + set DATABASE_URL in .env
npm install
npm run db:migrate               # apply migrations (creates the tables)
npm run db:seed                  # seed 20 scanners + 20 radios + starter workers
npm run dev                      # http://localhost:3000
```

### Default PINs (change these in Admin)

| Role | PIN |
|------|-----|
| Admin (all roles) | `0000` |
| Operator | `1111` |
| Equipment tech | `2222` |
| Supervisor | `3333` |

### Useful scripts

- `npm run db:migrate:dev` — create a new migration after editing the schema
- `npm run db:reset` — drop, re-migrate, and re-seed the database
- `npm run db:backup` — gzip a `pg_dump` of the database to `./backups/`
- `npm run test:e2e` — run the Playwright end-to-end suite
- `node docs/capture_sop_shots.mjs` — refresh the SOP screenshots (app must be running;
  set `PW_BASE_URL`, and `TZ` on the server so times look right)
- `python3 docs/build_sop.py` — regenerate the SOP PDF (`docs/Scanner-Radio-Checkout-SOP.pdf`)
- `python3 docs/build_sop_es.py` — regenerate the Spanish SOP (`docs/Scanner-Radio-Checkout-SOP-ES.pdf`)
- `npm run build && npm start` — production build/run
- `npx prisma studio` — inspect the database (devices, events, workers)

## Deploy on Render (Blueprint)

The repo includes a `render.yaml` Blueprint that provisions the web service **and** a
PostgreSQL database together.

1. In [Render](https://render.com): **New → Blueprint**, connect this repo, pick `main`, and
   **Apply**. Render reads `render.yaml` and creates the `warehouse-device-checkout` web service
   plus the `device-db` Postgres, wiring `DATABASE_URL` automatically.
2. On first deploy the app applies migrations and seeds the fleet, then serves. Open the URL
   Render gives you and sign in with the default PINs above.

The Blueprint uses Render's entry paid plans (`starter` web + `basic-256mb` Postgres) so the
service stays awake and the database is persistent; adjust the `plan:` values to size up/down.

## Deploy on Railway

Railway gives you a public URL you can open on any device (including the floor tablet), and
this repo is set up so it deploys with almost no configuration. `start:prod` applies
database migrations and seeds the fleet on every boot.

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
   and pick `warehouse-scanner-radio-checkout` (choose the branch you want to deploy).
2. In the same project, click **New → Database → Add PostgreSQL**. Railway provisions it and
   exposes its connection string as a `DATABASE_URL` variable.
3. Open your app service → **Variables** → add a reference variable
   **`DATABASE_URL`** = `${{Postgres.DATABASE_URL}}` (Railway autocompletes this once the
   Postgres service exists), so the app points at the database. Add `TZ` too.
4. Railway builds with `npm run build`, then runs `npm run start:prod` (migrate → seed →
   serve). When it's green, open **Settings → Networking → Generate Domain** for your URL.
5. Sign in with the default PINs — **Admin `0000`, Operator `1111`, Tech `2222`,
   Supervisor `3333`** — and change them in Admin.

Data lives in the Postgres service and persists across redeploys. The seed is idempotent,
so redeploys never duplicate devices or workers.

## Audit log

Every transition writes an immutable `DeviceEvent` (device, action, from/to status, worker,
timestamp, note — including the inspection answers). View a single device's history at
`/device/<type>/<number>`, or export the full log to CSV from the Admin screen (`/api/export`).

## Bulk-add workers (CSV)

Under **Admin → Add a worker** you can **upload a CSV** to add many workers at once, and
**download a sample CSV** to fill in. Columns are `name,pin,roles` (one worker per row); the
`roles` column accepts multiple roles separated by `;`, `|`, or spaces (e.g.
`OPERATOR;TECH`). Rows with a duplicate or invalid PIN are skipped and reported, so a partial
file still imports cleanly.

## Teams notifications

The Admin screen has a **Microsoft Teams notifications** panel. Paste an **Incoming Webhook**
or **Workflows** URL for a Teams channel, enable it, and choose what to be notified about:

- **Damaged devices** — fires **live** the moment a tech flags a device damaged (no
  scheduler needed).
- **Overdue sweep** — the end-of-shift list of devices still checked out. This one needs a
  scheduled job to call the sweep on a timer; the preference and message are in place.
- **Per-action alerts** (checked out / checked in / inspected & returned) — off by default.

Settings are saved to the `Setting` store (`teams.*` keys), and a **Send test message**
button posts to the channel so you can confirm the webhook before relying on it.

## Testing

End-to-end tests (Playwright) cover the critical flows: kiosk access/bilingual copy and the
per-type grouping, the admin/supervisor gate on the board, the full kiosk lifecycle (checkout
→ holder shown → check-in → tech "Good" inspection → available), the holder-only return rule,
the checklist refusing an undocked device, the damaged → supervisor-return path, the per-type
checkout policy, and the lead / supervisor permission boundaries.

```bash
# Against a server Playwright starts itself (production build):
npm run build
npm run test:e2e

# Against an already-running dev server:
PW_BASE_URL=http://localhost:3000 npm run test:e2e
```

The tests run against a real PostgreSQL database and assert on persisted state. CI runs them
on every push/PR via `.github/workflows/e2e.yml` (spins up Postgres, migrates, seeds, builds,
and runs the suite).

## Database backups

The audit log is the accountability backbone, so back the database up regularly.

```bash
npm run db:backup            # writes ./backups/device-backup-<timestamp>.sql.gz
BACKUP_DIR=/mnt/nas npm run db:backup
```

`scripts/backup.sh` runs `pg_dump` against `DATABASE_URL` (loading it from `.env` if needed),
gzips the dump, and keeps the newest 30 (override with `BACKUP_KEEP`). To run it on a
schedule, add a cron entry on the host, a **Railway cron service**, or a **Render cron job**
that runs `npm run db:backup` and ships the file to durable storage. Railway and Render also
provide their own managed Postgres backups — this script is for portable, off-host copies.

## Ideas reserved for later

- QR/barcode scanning of the device's own asset tag — the schema already has a `scanCode`
  field per device, and a scanner can scan its own label at the kiosk.
- A scheduled job to drive the Teams **overdue sweep** on a timer.
- Battery-health tracking per device (cycle counts from the inspection log).

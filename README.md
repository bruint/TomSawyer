# TomSawyer

**A little more rest. A plan for the rest.**

A self-hosted, mobile-first baby tracker with a practical sleep strategy for the rest of the day. Built with React, shadcn/ui, TypeScript, Node.js and SQLite. Runs in one Docker or Podman container. No subscriptions, analytics, advertising, or external AI account.

## What you can do

- Track sleep, nursing, bottles and tube feeds, solids, diapers, potty, pumping, medicine, growth, temperature, activities, milestones with photos, contractions, and notes.
- Start shared timers for sleep, nursing, pumping, activities, and contractions. Pause supported timers; correct or backdate completed entries. Entries show who logged them.
- Get an explained next sleep window and a plan through bedtime. Short naps, late wakes, and explicit missed naps change the plan immediately. Compare nap counts with their estimated bedtimes in one tap.
- Set individual wake windows, nap count, preferred wake/bed times, wind-down lead time, timezone, corrected age, and units for each child.
- Invite caregivers with separate passwords and single-use invitation links. The family owner manages profiles and access. All caregivers can log and correct activities.
- See recent history, 7/14/30-day summaries, a week sleep chart, recorded growth, food responses, and milestones. Download complete per-child CSV/JSON exports and preview imports before saving.
- Set clock or last-activity reminders, weekdays, and daytime-only delivery. Enable Web Push on each device, including installed iPhone/iPad web apps and Android browsers.
- Install the PWA, use night mode, and queue completed entries offline. Running timer changes require a connection so caregivers do not silently overwrite each other.

## Quick start

Install Docker with Compose, then:

```sh
git clone https://github.com/bruint/TomSawyer.git
cd TomSawyer
cp .env.example .env
```

Edit `.env`: replace `SETUP_TOKEN` with a random value (`openssl rand -hex 24`) and set `APP_URL` to the exact browser origin. Then:

```sh
docker compose up -d --build
```

Open **http://localhost:3100**, enter the setup key, and create the first family account. Registration then closes; additional caregivers need an invitation from **Your family → Your crew**. No demo users or baby data are installed.

The default bind address is loopback. Set `BIND_IP=0.0.0.0` only if you want the HTTP port reachable from your network. For phones and Web Push, put the app behind HTTPS and set `APP_URL=https://your-hostname`.

### HTTPS

An example Caddy configuration is in `deploy/Caddyfile.example`. Point your domain to the server, reverse proxy to port 3100, and set the same HTTPS origin in `.env`. Set `TRUST_PROXY=1` only when traffic arrives through one trusted reverse proxy; keep the application port inaccessible from untrusted networks in that case. Cookies become Secure automatically for an HTTPS `APP_URL`.

Web Push needs outbound HTTPS to the device browser's push service. VAPID keys are generated once and stored in the database. Set `VAPID_SUBJECT` to your contact email. Keys survive restarts and backups.

### Podman

`podman compose up -d --build` works when a Compose provider is installed. You can also run directly:

```sh
podman build --format docker -t localhost/tomsawyer .
podman volume create tomsawyer-data
podman run -d --name tomsawyer --restart=unless-stopped \
  -p 127.0.0.1:3100:3000 --env-file .env \
  -e PORT=3000 -e NODE_ENV=production \
  -v tomsawyer-data:/data --read-only --tmpfs /tmp:rw,size=64m \
  --cap-drop=all --security-opt=no-new-privileges \
  localhost/tomsawyer
```

For a rootless systemd service, copy `deploy/tomsawyer.container` and `deploy/tomsawyer-data.volume` into `~/.config/containers/systemd/`. Put only `APP_URL`, `SETUP_TOKEN`, `VAPID_SUBJECT`, and `TRUST_PROXY` in `~/.config/tomsawyer.env` (mode 600). Change `Image=` to `localhost/tomsawyer` for a local build. Then:

```sh
systemctl --user daemon-reload
systemctl --user start tomsawyer.service
```

Enable user lingering if your service should start without a login. On SELinux hosts, use `:Z` for a dedicated bind-mounted data directory; never relabel or change ownership of another application's storage.

For a private Quadlet installation, restrict the reverse proxy to your LAN, then set `PRIVATE_INSTANCE=true` and leave `SETUP_TOKEN` empty in `~/.config/tomsawyer.env`. The first family can be created without copying a setup key; later caregivers join by invitation. Public instances require a setup key by default.

### Container images

CI tests and builds the app, then publishes `ghcr.io/bruint/tomsawyer:latest`, commit tags, and version tags for AMD64 and ARM64. Source builds work independently of image publishing. To use a published image:

```sh
docker compose pull
docker compose up -d --no-build
```

## Installing on your phone

After adding your first child or joining a family, device onboarding offers app installation and notification setup. You can skip either and finish later in **Family settings → Notifications**. Setup is per account and device.

**iPhone/iPad:** In Safari, Share → Add to Home Screen. Open TomSawyer from its icon and sign in if needed; onboarding continues with notification permission. Web Push requires iOS/iPadOS 16.4 or later and HTTPS.

**Android:** Tap **Install app** during onboarding when Chrome offers it, or use Chrome’s Install app / Add to Home screen menu. Then enable notifications.

Both automatic sleep alerts are enabled by default: **wind-down** at the routine’s configured lead time, and **sleep window** when the suggested window opens (10 minutes before the target sleep time). Each shows the live nap or bedtime target and its window. They apply to every child in the family. Each device can turn either alert off; custom reminders remain separate. The server recalculates from actual wake and sleep logs, including short naps, missed naps and flexible bedtime, and opens the child’s live strategy when an alert is tapped. It sends no timed sleep alerts while a child is sleeping, without an observed wake, or before two months corrected age.

The app does not need to stay open. Use **Send a test** in Settings to check delivery. Permission, Focus mode, battery restrictions, internet connectivity, and browser push delivery can affect timing. Reminders are not appropriate for critical alarms. The server checks every 30 seconds, retries failed deliveries within a five-minute catch-up window, and does not replay older alerts after an outage.

While a nap is running, the strategy shows **If they wake now**. Sleep so far, the next wake window, remaining naps, and bedtime are recalculated every 15 seconds while the app is visible and connected. The actual timer stays ongoing until a caregiver ends it. Journal opens on today in the child’s timezone; use the day arrows, date picker, or All recent entries to reach older logs.

On your phone, pull down at the top of a screen and release to refresh family data, logs, and the sleep plan. Journal filters and unsaved settings stay in place.

## Quick logging

The bottom quick-action bar stays available for the selected child. Sleep and nursing start immediately and turn into stop buttons while their timers run. Wet and dirty diaper buttons record the current time. Bottle repeats the amount shown on its button; use **More → Bottle amount** to choose another preset or enter a custom amount. With no previous bottle, the amount picker opens first.

Near the live plan's next sleep time, Sleep chooses nap or night sleep from that plan, including an earlier bedtime or later nap. Otherwise it uses the child's usual clock. Previewing another count does not change the quick action.

**More** includes nursing sides, nap/night sleep, mixed diapers, pumping, morning wake, and missed naps. Earlier entries and measurements remain available in the detailed form. Quick entries saved to the server offer **Undo**; changes made by another caregiver are protected by the entry version. Completed entries can queue offline; timers need a connection.

## Sleep planning

The planner is an inspectable scheduling heuristic. Automatic compares complete schedules across nearby nap counts, using corrected age, today's wake and nap lengths, and the past week's logged routines. History influences the count only after at least three days containing a recorded morning, naps, and night. Each option shows its estimated bedtime; tapping one previews it without saving a setting. Custom wake windows and a saved nap count remain preferences.

Today and Strategy show the same next-sleep target and bedtime. A nap preview stays selected across tabs until you return to the live plan or change child. Logging shortcuts and automatic alerts follow the live recommendation.

Usual bedtime is a starting point. An earlier wake, short naps, a late morning, or a long current nap can move it earlier or later. The last nap can be a full nap or a shorter bridge nap. Counts that would run too far into the night are marked unavailable, rather than silently dropping a nap while displaying the wrong count. Later steps remain tentative, and new logs recalculate the remaining day.

The planner does **not** implement a clinically validated prediction model or an AI sleep consultant. Under two months corrected age it shows responsive-care guidance rather than timed predictions. It does not recommend delaying feeds, calculate medicine doses, diagnose allergies, or derive growth percentiles. Follow your child's cues and your clinician's guidance. All clinical fields record caregiver observations.

## Your data

The `/data` volume contains the SQLite database, sessions, photos, invites, and notification signing keys. Keep it persistent. One app replica per database is supported; do not put SQLite on NFS or run multiple writers against a copied database.

### Backup and restore

Create a consistent SQLite snapshot while the app is running:

```sh
docker compose exec tomsawyer node dist/server/server/admin.js backup /data/backup.db
docker compose cp tomsawyer:/data/backup.db ./backup.db
```

The backup command refuses to overwrite an existing file; use a fresh filename for each backup. Protect backups as private family data. Copy them off the host.

To restore, stop the app and take a backup of the current volume. Replace `/data/tomsawyer.db` with the snapshot, remove only that database's stale `-wal` and `-shm` files while stopped, and preserve permissions for container UID 1000. Restart the app. Do not replace a live database. Container volume inspection/copy commands vary between Docker and rootless Podman.

### Password recovery

An owner can change their own password in the app. A server administrator can reset an existing account without configuring email:

```sh
docker compose exec -it tomsawyer node dist/server/server/admin.js reset-password you@example.com
```

The new password is entered into a hidden prompt, not a command argument. Existing sessions for that user are revoked.

### Import and export

Use **Your family → Data & account**. JSON exports round-trip the activity records; they are not a replacement for a full database backup. CSV imports accept `kind`/`type`, `startedAt`/`start`, `endedAt`/`end`, notes, and optional JSON details. Unmapped fields are preserved in notes, not silently interpreted as medical measurements. Review the preview; an invalid or overlapping entry rolls back the whole import. Repeated record IDs are skipped. Generic third-party CSV compatibility depends on the source column names and date formats; this is not a claim of universal compatibility.

Photos are available only to authenticated members of their family. Image metadata is stripped on upload. Referenced photos are removed when their last entry is deleted. Browser-local caches contain private recent logs; sign out on shared devices to clear them. Pending offline entries must be synced or downloaded/discarded before signing out.

## Development

Node.js 22.13+ is required (Node 24 recommended).

```sh
npm ci
npm run dev
npm test
npm run build
APP_URL=http://localhost:3000 npm start
```

The development UI runs at http://localhost:5173 with an API proxy to port 3000. The production build is served by Node alone. The development database is `data/tomsawyer.db`. Override it with `DATABASE_PATH`.

For a separate synthetic demo, set a `DEMO_PASSWORD` and `DATABASE_PATH=.local/preview.db`, then run `npm run seed:demo`. Demo seeding refuses a non-empty database or production mode. Never publish a demo database with real family records.

Code is grouped by responsibility:

- `src/App.tsx` connects screens and user actions; `src/components/app-shell.tsx` owns the layout.
- `src/hooks/` handles sessions, navigation, child data, offline sync, theme, and device notifications.
- `src/components/settings/` contains the separate settings screens and dialogs. Shared form controls live in `src/components/ui/`.
- `src/lib/` contains API, storage, reporting, and offline-entry helpers. `src/styles/` groups styles by screen, with responsive overrides loaded last.
- `server/app.ts` composes middleware and feature routers from `server/routes/`. Public authentication routes are mounted before the session boundary; all remaining API routes require authentication. `server/access.ts` checks family membership and owner permissions.
- `server/activities.ts` shares activity insertion and overlap rules between logging and imports. `server/strategy/` separates sleep-day context, routine defaults, and schedule comparison; `server/strategy.ts` presents the selected plan. `server/push.ts` runs reminders using the same planner and history.
- `shared/types.ts` defines the client/server data contracts.

The shadcn/ui components are local and customizable. Tests cover API workflows, account boundaries, concurrent edits, timers, CSV parsing, timezone boundaries, planner scenarios, offline-entry isolation, and refresh gestures.

## Current boundaries

This release has web-app notifications and installation, not native Apple Watch, Siri, lock-screen widgets, or Live Activities. It records milestones without a developmental assessment catalogue and growth without reference percentiles. It has no voice/photo-to-log AI, general parenting chatbot, clinical sleep programme, or medication decision support. Journal loads the latest 90 days and can fetch an older date while online; exports retain the full history. Offline mode caches that recent history and queues completed entries, with visible conflict handling on reconnect.

## Licence

AGPL-3.0-only. See `LICENSE`. UI primitives and third-party dependencies retain their own licences; see `THIRD_PARTY_NOTICES.md` and their packages.

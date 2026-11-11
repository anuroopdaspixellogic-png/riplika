# Riplika

Anonymous random video chat for the web. Press start and drop into a 1-on-1
face-to-face conversation with a stranger — no account, no profile, no app.

Inspired by Chat Alternative, rebuilt as a modern responsive web app.

## Features

- **Instant 1-on-1 matching** — queue-based, mutual country and gender filters.
- **WebRTC video and audio** — peer-to-peer media, the server only relays signaling.
- **Text chat** — typing indicator, unread badge, mobile bottom sheet.
- **Next / Stop** — skip to a new stranger or leave instantly.
- **Preferences** — nickname, country, gender, who you want to meet, country filter.
- **Safety** — 18+ gate, community rules, one-tap report + block, profanity masking,
  chat rate limiting, recent-partner avoidance.
- **Persistent moderation** — reports and blocks are stored in SQLite; a token-protected
  dashboard lets you review reports and mark them resolved.
- **Abuse controls** — per-IP connection caps, message/action limits, and API rate limiting.
- **No accounts** — an anonymous client key in `localStorage` keeps blocks across reloads.
- **Mobile-first** — dedicated phone layout with a slide-up chat sheet.

## Quick start

Requires **Node.js 22.13+** (uses the built-in `node:sqlite` module; developed on Node 24).

```bash
npm install
npm run dev
```

- App: <http://localhost:5173>
- Signaling server: <http://localhost:8787> (`/ws`)
- Moderation: <http://localhost:5173/moderation> (after enabling it, see below)

Open two browser windows to match with yourself. Camera and mic permissions are
per-origin, so grant them once in each browser profile.

> Camera access requires `localhost` or HTTPS. On a phone, open the app over your
> LAN with HTTPS, or use a tunnel such as `cloudflared` / `ngrok`.

## Moderation dashboard

The dashboard is disabled until you set a token. Generate one and start the app:

```bash
cp .env.example .env
openssl rand -hex 32        # paste the result into MODERATION_TOKEN in .env
npm run dev
```

Then open <http://localhost:5173/moderation> (proxied to the signaling server in
development) or <http://localhost:8787/moderation>.

You can review open reports, see repeat reports against the same anonymous client
key, read the optional details, and mark reports reviewed or reopen them. Sessions
use an HttpOnly, SameSite=Strict cookie and last 8 hours. Login attempts are rate
limited. The page is never linked from the public app and sends `noindex` headers.

Reports are stored in SQLite at `data/riplika.sqlite`, along with block records.
Reviewed reports older than `REPORT_RETENTION_DAYS` (default 90) are pruned once a
day. Blocks do not expire so a reported pair is never matched again.

> Treat report details as confidential user content. The dashboard has no user
> accounts or roles — anyone with the token has full access. Keep it long, rotate
> it if leaked, and serve the dashboard over HTTPS.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server + signaling server with watch mode |
| `npm run build` | Type-check the client and build to `dist/` |
| `npm start` | Serve `dist/` and signaling from one Node process (production) |
| `npm run smoke` | SQLite persistence checks + 21 server checks (matching, filters, signaling, chat, reports, blocks, rate limits) |
| `npm run smoke:store` | SQLite persistence checks only |
| `npm run smoke:server` | Server checks only (needs a running server on `localhost:8787`) |
| `npm run docker:build` | Build the production image as `riplika:latest` |
| `npm run docker:up` | Build and start the Compose stack in the background |
| `npm run docker:down` | Stop the stack (the data volume is kept) |

Run the server checks while the dev server (or a production server) is up:

```bash
npm run dev      # terminal 1
npm run smoke    # terminal 2
```

### Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main`/`master`, pull requests and
manual dispatch. On Node 22.13 (the minimum) and Node 24 it installs from the
lockfile, type-checks and builds, runs the SQLite persistence tests, then starts
the production server with an in-memory database and runs the 21 server checks
plus moderation-auth and security-header checks.

## Production

```bash
npm run build
MODERATION_TOKEN="$(openssl rand -hex 32)" npm start
```

The Express server serves the built client and the WebSocket endpoint from the
same origin, so one process is enough for a single-instance deployment.

### Docker

A production image and Compose file are included. Docker Engine with Compose v2
is enough:

```bash
test -f .env || cp .env.example .env
openssl rand -hex 32        # set MODERATION_TOKEN in .env
docker compose up -d --build
docker compose ps           # wait for status "healthy"
```

The app is then at <http://localhost:8787>. Compose publishes the port on
`127.0.0.1` only, so keep a TLS proxy in front for anything public.

The image builds in two stages: `node:24-alpine` type-checks and builds the
client, then a fresh runtime stage installs only production dependencies and
runs as the unprivileged `node` user. The SQLite database lives in `/app/data`
on the `riplika-data` named volume.

**TURN settings are compiled into the client.** Compose passes `VITE_TURN_*`
from `.env` as build args; rebuild after changing them or any client code:

```bash
docker compose up -d --build
```

Useful commands:

```bash
docker compose logs -f riplika
docker compose down         # keeps the data volume
```

**Back up the volume while the container is stopped** so SQLite's WAL is
included:

```bash
docker compose stop riplika
docker run --rm -v riplika-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/riplika-data-$(date +%F).tgz -C /data .
docker compose start riplika
```

To restore, stop the stack, replace the volume contents from a backup, and start
again. This overwrites the current database, so verify the archive first:

```bash
docker compose down
docker volume rm riplika-data
docker volume create riplika-data
docker run --rm -v riplika-data:/data -v "$PWD":/backup alpine \
  tar xzf /backup/riplika-data-YYYY-MM-DD.tgz -C /data
docker compose up -d
```

A bind mount (`./data:/app/data`) works too; on Linux make sure the directory is
writable by UID 1000 (`chown -R 1000:1000 data`). The matching queue and rate
limits are in-process, so run one container behind the proxy.

### Reverse proxy and TLS

Camera/mic access requires HTTPS. A minimal Caddy setup handles certificates and
WebSocket upgrade automatically:

```caddyfile
chat.example.com {
  reverse_proxy 127.0.0.1:8787
}
```

Run the app with `TRUST_PROXY=1` when it is behind a trusted proxy so rate limits
and secure cookies use the forwarded client IP and protocol. If you use Nginx,
forward `X-Forwarded-For` and `X-Forwarded-Proto` and enable the WebSocket upgrade
headers.

With Docker Compose, Caddy on the host proxies to `127.0.0.1:8787` as above; if
Caddy runs as another Compose service, proxy to `riplika:8787` instead. Leave
`ALLOWED_ORIGINS` unset for a single-origin deployment, or include the public
origin (for example `https://chat.example.com`) in the comma-separated list.

### Data and backups

Back up `data/riplika.sqlite` (and its `-wal` file while running). With Docker,
use the volume backup commands in the Docker section. SQLite is fine for a single
app instance; if you run multiple instances, move moderation state to a shared
database and use a shared queue/Redis for matchmaking, or route each user
consistently to one instance. In-process limits are per instance.

### Environment

Copy `.env.example` to `.env`. Vite exposes `VITE_*` variables to the client; the
server reads the rest. Scripts load `.env` with `--env-file-if-exists`. In Docker,
`VITE_*` values are build args baked into the image, while the remaining variables
are passed to the container at runtime.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `PORT` | server | HTTP + WebSocket port (default `8787`) |
| `SQLITE_PATH` | server | SQLite file path (default `data/riplika.sqlite`) |
| `MODERATION_TOKEN` | server | Enables `/moderation`; use 32+ random characters |
| `REPORT_RETENTION_DAYS` | server | Days to keep reviewed reports (default `90`) |
| `TRUST_PROXY` | server | Set `1` behind a trusted reverse proxy |
| `MAX_CONNECTIONS_PER_IP` | server | Concurrent WebSocket cap per IP (default `8`) |
| `ALLOWED_ORIGINS` | server | Comma-separated WebSocket origin allowlist (optional) |
| `VITE_TURN_URL` | client | TURN server URL, e.g. `turn:turn.example.com:3478` |
| `VITE_TURN_USERNAME` | client | TURN username |
| `VITE_TURN_CREDENTIAL` | client | TURN credential |

STUN is configured for Google's public STUN servers. **Add a TURN server for
production** — symmetric NATs and restrictive mobile networks will otherwise fail
to connect. Static TURN credentials in `VITE_*` are visible to clients; use
short-lived TURN credentials issued by your backend for a public service.

## Architecture

```
Dockerfile                production image (build + runtime stages)
compose.yaml              single-instance app, named data volume, healthcheck
.dockerignore             keeps node_modules, build output and secrets out
.github/workflows/ci.yml  typecheck, build, store + server smoke tests
src/
  App.tsx                 landing <-> call room switch, stats polling
  components/
    Landing.tsx           marketing page, profile form, rules/privacy content
    ChatRoom.tsx          call state, WebRTC, controls, chat, reporting
    ReportModal.tsx       reason picker + details
    Modal.tsx             accessible modal shell
    Icons.tsx             inline SVG icon set + logo
  lib/
    countries.ts          country list, flag emoji, locale detection
    types.ts              shared client types
server/
  index.js                Express + ws: matchmaking, signaling, stats, limits
  moderation.js           profanity masking and report validation
  store.js                SQLite reports/blocks store and retention
  moderation-admin.js     token auth and moderation routes
  moderation-page.js      server-rendered dashboard HTML
  rate-limit.js           sliding-window limiter used by HTTP and WebSocket
scripts/
  store-smoke.mjs         SQLite persistence checks
  smoke.mjs               end-to-end server checks
```

### Matching

A client joins with a profile and asks to `find`. The server keeps a FIFO queue
and picks the oldest compatible waiting client, requiring:

- both clients' country preferences (if set) match the other's country;
- both clients' gender preferences (if set) match the other's gender;
- neither has blocked/reported the other.

Recent partners (last 6) are avoided when another candidate exists. A successful
match creates a room, tells one side to create the WebRTC offer, and relays
SDP/ICE messages until the peer connection is established.

### Media and privacy

Video and audio are sent directly between browsers over WebRTC. The signaling
server never receives media. Text messages are relayed and not persisted.
Matchmaking state, live counters and the block cache live in memory. Reports,
blocks and review status persist in SQLite; report logs never include chat
history, video or audio.

### Rate limits

Per process, resetting on restart:

| Scope | Limit |
| --- | --- |
| WebSocket upgrade attempts | 30/min per IP |
| Concurrent WebSockets | 8 per IP (configurable) |
| Messages per socket | 80/5s, then warnings and disconnect |
| Find/Next actions | 12/30s per socket |
| Chat messages | 6/3s per socket |
| Reports | 1/10s per client key |
| API requests | 120/min per IP |
| Moderation logins | 10/10min per IP |

For a public deployment, add edge rate limiting at your proxy/CDN as well.

## Limitations / before running in public

This is a working product prototype, not a compliant public service. Before
exposing it to real strangers you should add:

- **Real moderation** — the profanity filter is a lightweight safety net. Add
  image/video review, escalation policies, and reviewer roles/audit logs.
- **Age verification** — the 18+ checkbox is self-attested.
- **Ban enforcement** — blocks are keyed by an anonymous browser-generated ID.
  Clearing storage or using another browser evades them. Add device/IP signals
  with care, and a documented appeals process.
- **TURN infrastructure** — required for reliable connectivity at scale; prefer
  short-lived credentials.
- **Horizontal scaling** — the queue, rooms and rate limits are in-process. Use
  shared state or sticky routing for multiple instances.
- **Legal review** — privacy policy, terms, reporting obligations, retention and
  record keeping vary by jurisdiction.

## License

Private prototype. Not affiliated with Chat Alternative.

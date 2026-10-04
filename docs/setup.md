# Setting up Pulse

Pulse runs on your own machine or server: one Next.js app with its sync worker, and a Postgres database beside it.
Anyone you share the URL with can create an account, connect their own Google account, and see only their own
data. This guide takes you from a demo on your laptop to your Fitbit Air data on a server you can open from your
phone.

```mermaid
flowchart TB
  demo[1. Demo on your laptop<br/>Postgres in Docker, no Google account] --> google[2. Google Cloud project<br/>Health API, consent screen, OAuth client]
  google --> local[3. Real data on localhost<br/>Sign up, onboarding, Connect Google]
  local --> server[4. Docker compose on a server<br/>app + Postgres]
  server --> https[5. HTTPS hostname<br/>tunnel or reverse proxy]
  https --> phone[Open it on your phone<br/>Install app]
```

## 1. Try the demo

You need Node 24, pnpm (`corepack enable` uses the version pinned in `package.json`) and Docker.

```sh
git clone https://github.com/adityaongit/pulse.git
cd pulse
pnpm install
cp .env.example .env                           # DATA_SOURCE=demo: demo mode
docker compose -f compose.dev.yaml up -d       # Postgres on localhost:5432
pnpm dev                                       # open http://localhost:3000 and "Continue with demo data"
```

A demo instance generates 180 days of deterministic data for one shared demo user. Sign-up is off. Nothing leaves
your machine.

## 2. Google Cloud project

Pulse reads each user's data through the [Google Health API](https://developers.google.com/health). Pulse accounts
are separate (email or username and a password); Google is only the data source.

1. Create a project at <https://console.cloud.google.com> and enable the **Google Health API**.
2. **Google Auth Platform › Branding / Audience**: user type **External**; add your app name, your email,
   a home page and a privacy policy URL.
3. **Data access**: add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`, and the Google Health
   scopes listed in `SCOPES` in `src/server/sources/google/oauth.ts` (each prefixed with
   `https://www.googleapis.com/auth/googlehealth.`).
4. **Audience**: in Testing, only the test users you add can connect, and Google expires grants every 7 days.
   In production anyone can connect; Google shows an "unverified app" warning before they share health data
   until the app is verified.
5. **Clients › Create client › Web application**. Under **Authorized redirect URIs** add one entry per address
   you will open Pulse on, each ending in `/oauth/callback`:
   - `http://localhost:3000/oauth/callback`
   - `https://pulse.example.com/oauth/callback` (your HTTPS hostname from step 5)

   Google accepts plain `http` only for localhost and never a raw IP address. To use Pulse from your phone, give
   it an HTTPS hostname (step 5).
6. Copy the client ID and secret.

Each user's Google account must have Google Health set up (the Fitbit Air paired in the Google Health app with
that account). Otherwise Pulse refuses the connection with "That Google account has no Google Health profile".

## 3. Real data on localhost

In `.env`:

```sh
DATA_SOURCE=google
BETTER_AUTH_SECRET=...                 # openssl rand -base64 32
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
```

Restart `pnpm dev` and open <http://localhost:3000>. **Create account** asks for your name, a username, your email
and a password; you can sign in later with either the username or the email. Onboarding asks for your birth date,
sex and time zone. Then **Connect Google** on Home or in Settings, pick the account your Fitbit Air uses and allow
every permission: the import of the last 180 days starts, and Settings shows its progress. Settings › Data source ›
**Switch Google account** connects another one (data synced from the old account is removed; your journal stays).

To try every screen on a real-data instance without connecting Google, `pnpm seed:demo` adds a demo account with 180
days of generated data to your local database: sign in as `demo@pulse.local` / `pulse-demo-generated-data`.

## 4. Run it with Docker

[`compose.yaml`](../compose.yaml) runs two containers: `pulse` (the app, published on `127.0.0.1:3000` only) and
`pulse-db` (`postgres:18-alpine`, reachable only from the app). Put the secrets in `.env`:

```sh
POSTGRES_PASSWORD=...                  # openssl rand -base64 24
BETTER_AUTH_SECRET=...                 # openssl rand -base64 32
```

```sh
docker compose up -d --build
docker compose logs -f pulse    # "[worker] started (source: google)"
```

Migrations run when the app starts; it waits for Postgres to accept connections first.

Memory: the app uses about 100–150 MB (`mem_limit: 384m`, with the V8 heap at 50% of it, `NODE_OPTIONS` in the
[`Dockerfile`](../Dockerfile)); Postgres is capped at 256 MB with small buffers. Each person's data grows by
roughly 4 MB a month.

## 5. Put it on HTTPS

Pick one:

| Option | Good for | Notes |
|---|---|---|
| [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) | Reaching it from anywhere, no open ports | Route `pulse.example.com` to `http://localhost:3000` (or the container). Sign-in rate limits use Cloudflare's client IP. |
| [Tailscale Serve](https://tailscale.com/kb/1312/serve) | Your devices only | `https://<machine>.<tailnet>.ts.net` works as a Google redirect URI. |
| Caddy or nginx with Let's Encrypt | A server with a public IP | Forward `X-Forwarded-For` and `X-Forwarded-Proto`. |

Then:

1. Add `https://<your-host>/oauth/callback` to the OAuth client (step 2.5).
2. Set `APP_URL=https://<your-host>`: it pins the OAuth redirect and is the trusted origin for sign-in.
3. Put your own email in `ADMIN_EMAILS` before the first start, then open the hostname and create your account
   **right away**. While the server has no accounts, an `ADMIN_EMAILS` address needs no invite. Emails aren't
   verified, so whoever signs up first with it owns the server. Once any account exists, an `ADMIN_EMAILS`
   address can't be used to sign up at all.
   Already running Pulse? Set `ADMIN_EMAILS` to the email of your existing account and restart.
4. Use the browser's **Install app**, then invite people from **More › Admin** (see below).

## Accounts, admins and invites

Admins open **More › Admin** (`/admin`). An admin is either:

- an **owner**: an email in `ADMIN_EMAILS`. Owners are changed only in `.env`, never from the panel. To add a
  second owner, let them create their account first (with an invite), then add their email and restart. Listing
  an email that has no account doesn't hold it open: sign-up with it is refused.
- an account an admin promoted with **Make admin**.

The panel has three parts:

- **Sign-up**: who can create an account. **Invite only** is the default, **Open** lets anyone in, and **Closed**
  lets nobody in. The switch works at once, with no restart. `SIGNUP` in `.env` sets the mode only until an admin
  picks one in the panel. Owners can always sign up.
- **Invites**: **Create link** makes a one-time link (`/signup?invite=…`) that expires after 7 days. The link is
  shown once; only its hash is stored. Revoke an unused link to stop it working.
- **Accounts**: everyone on the server, with when they joined, when they were last active and whether Google is
  connected. No health data. An admin can make or remove admins and delete a member's account with all its data.
  An admin must be made a member before their account can be deleted. Your own account goes from Settings.

```mermaid
flowchart TD
  S["POST /api/auth/sign-up/email"] --> O{"Email in ADMIN_EMAILS?"}
  O -- yes --> F{"Server has<br/>no accounts?"}
  F -- yes --> OK["Account created"]
  F -- no --> NO0["Refused: OWNER_EMAIL_RESERVED"]
  O -- no --> M{"Sign-up mode<br/>(panel, else SIGNUP)"}
  M -- closed --> NO1["Refused: sign-up closed"]
  M -- open --> OK
  M -- invite --> I{"x-pulse-invite header:<br/>unused, unexpired link?"}
  I -- no --> NO2["Refused: INVITE_INVALID"]
  I -- yes --> C["Link used up (atomic)"] --> OK
```

The check runs in better-auth's `user.create.before` hook (`src/server/auth.ts`), so the sign-up form, the API and
any other client all go through it.

## Environment reference

Every variable is listed in [`.env.example`](../.env.example); the server validates them at boot and exits with a
list of what's wrong.

| Variable | Required | Meaning |
|---|---|---|
| `DATA_SOURCE` | no (`demo`) | `demo`: generated data for one shared demo user; `google`: real data, accounts, each user connects Google |
| `POSTGRES_PASSWORD` | with compose | The database password; compose builds `DATABASE_URL` from it |
| `DATABASE_URL` | outside compose | Defaults to `postgres://pulse:pulse@localhost:5432/pulse` (compose.dev.yaml) |
| `BETTER_AUTH_SECRET` | in production | Signs sessions; `openssl rand -base64 32` |
| `ADMIN_EMAILS` | with Google | Comma-separated owner emails: they open the admin panel; on a server with no accounts, they sign up without an invite |
| `SIGNUP` | no (`invite`) | The starting sign-up mode (`invite`, `open` or `closed`) until an admin changes it in the panel |
| `DISABLE_SIGNUP` | no (false) | Older setting: `true` is the same as `SIGNUP=closed` |
| `SUPPORT_EMAIL` | no | Shown on the forgot-password page so people can ask you for a reset |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | with Google | The OAuth client from step 2 |
| `APP_URL` | behind a proxy | The public URL |
| `AVATAR_URL` | no | A default avatar photo; a user's Google photo or upload wins |

Each user's time zone is set in onboarding and Settings › Profile, not in the environment.

## Keeping it running

- **Update:** `scripts/deploy.sh` dumps Postgres, resets the checkout to `origin/main`, rebuilds, waits for the
  health check and rolls back to the previous image if the new one never turns healthy (`COMPOSE_FILE=...` for
  another compose file, `--help` for options).
- **Forgotten password:** see [Reset a password](#reset-a-password).
- **Delete an account:** the user does it in Settings › Account; every row of their data goes with it.
- **Disconnect Google:** Settings › Data source › Disconnect removes Pulse's access in that Google account too.

## Reset a password

Pulse sends no email, so the person who runs the server resets forgotten passwords. The forgot-password page tells
people to ask you; set `SUPPORT_EMAIL` in `.env` and it shows an "Email the admin" button with a prefilled request.

When someone asks:

1. Check it is really them (they wrote from the email on the account, or you know them).
2. On the server, run the command with their username or email:

   ```sh
   docker exec pulse node scripts/reset-password.mjs <username-or-email>
   ```

   It prints a 16-character temporary password and signs that user out on every device.
3. Send them the temporary password over a channel you trust, never in a public place.
4. They sign in with it and choose a new password in Settings › Account.

`No account with the email or username "..."` means nothing matched; usernames are lowercase.

## Test accounts with generated data

To try every screen without a Fitbit, fill a test account with 180 days of generated data:

```sh
docker exec pulse node scripts/seed-user.mjs <username-or-email>
```

It refuses an account that has connected Google, so generated data never mixes with real data. Locally the same is
`pnpm seed:demo <username>` (or no argument for the demo account).

## Backups

Dump Postgres daily from cron; this keeps 14 days:

```sh
#!/bin/sh
set -eu
umask 077
dir=/var/backups/pulse
mkdir -p "$dir" && chmod 700 "$dir"
docker exec pulse-db pg_dump -U pulse -Fc pulse > "$dir/pulse-$(date +%F).dump"
ls -1t "$dir"/pulse-*.dump | tail -n +15 | xargs -r rm -f
```

- The dump holds every user's health data and their Google refresh tokens. Encrypt anything that leaves the
  machine, for example `age -r <your-age-pubkey> -o "$f.age" "$f"`.
- To restore: `docker compose stop pulse`, then
  `docker exec -i pulse-db pg_restore -U pulse -d pulse --clean --if-exists < pulse-YYYY-MM-DD.dump`, then
  `docker compose start pulse`.
- Each user can also export their own data as CSV or JSON from More › Your data.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Google says `redirect_uri_mismatch` | The address you opened Pulse on has no matching redirect URI in the OAuth client. |
| "No Google Health profile" | That Google account has no Fitbit data. Settings › Data source › **Switch Google account** and pick the one in your Google Health app. |
| Grant stops working after a week | The consent screen is still in Testing; set it to In production and connect again. |
| "Too many attempts" at sign-in | Sign-in allows 5 tries a minute per IP; wait a minute. |
| Server exits at boot with `Invalid configuration` | The message lists each bad variable. |
| Server exits at boot with a database error | Postgres isn't reachable at `DATABASE_URL`; check `docker compose ps` and `docker compose logs db`. |

Still stuck? Open an issue with the bug template (and no personal data).

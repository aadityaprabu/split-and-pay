# 💸 Split & Pay

A self-hosted, Splitwise-style app for splitting shared expenses between roommates. It runs on your own
VPS (e.g. with [Coolify](https://coolify.io/)), and only the Google accounts you allow can sign in.

**What it does**

- **Expenses:** add an expense, pick who's in it and who paid, then split it **equally**, **by
  percentage** or **by exact amounts**. Amounts are always exact to the cent or paisa.
- **Currencies:** each expense is in **USD** (the default) or **INR**. Balances are kept separately per
  currency, with no exchange rates.
- **Settle up:** see who owes whom and record a payment with one click. Every shared expense between the
  two of you is then marked **Settled**, and it shows up in the payment history.
- **Access control:** Google sign-in only. The admin manages the allowed list from the app.

---

## Contents

1. [Requirements and versions](#1-requirements-and-versions)
2. [How it fits together](#2-how-it-fits-together)
3. [Set up Google sign-in](#3-set-up-google-sign-in)
4. [Run it locally (development)](#4-run-it-locally-development)
5. [Environment variables](#5-environment-variables)
6. [Using the app](#6-using-the-app)
7. [Run the production stack locally (Docker)](#7-run-the-production-stack-locally-docker)
8. [Tests and lint](#8-tests-and-lint)
9. [Deploy to a VPS with Coolify](#9-deploy-to-a-vps-with-coolify)
10. [Database and migrations](#10-database-and-migrations)
11. [Project structure](#11-project-structure)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Requirements and versions

### What you need to install

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | **26.x** (tested on 26.8.1) | Required by both apps (`"engines": { "node": ">=26" }`). With [nvm](https://github.com/nvm-sh/nvm): `nvm install 26 && nvm use 26` |
| **Yarn** | **any version** installed globally (e.g. 1.22) | `npm install -g yarn`. Each app pins **Yarn 4.18.1** in its own `.yarn/releases/`, and your global `yarn` hands off to it automatically. Don't use npm: there's no `package-lock.json`. |
| **Docker Desktop** | Docker 29+ with Compose v2 (tested on Docker 29.7, Compose 5.5) | Runs Postgres locally, the integration tests, and the production stack |
| **Git** | any recent | |
| **A Google account** | | To create the OAuth client ID ([section 3](#3-set-up-google-sign-in)) |

> Node 26 no longer ships **Corepack**, so Yarn 4 isn't fetched automatically. That's why the Yarn
> release is committed in each app, and why a global `yarn` of any version is enough.

### What the project uses

You don't install these separately: `yarn install` and Docker fetch them.

| Layer | Technology |
|---|---|
| Frontend | React 19.3, React Router 7.18, Vite 8.3, Tailwind CSS 4.3, axios 1.20 |
| Backend | Node.js 26, Express 5.2, pg 8.23, google-auth-library 11.1, cookie-parser, dotenv |
| Database | PostgreSQL 18 (`postgres:18-alpine`) |
| Web server | nginx (`nginx:alpine`): serves the built frontend and proxies the API |
| Container images | `node:26-alpine` (backend and frontend build), `nginx:alpine`, `postgres:18-alpine` |
| Tests | Vitest 5 + React Testing Library (frontend), `node:test` (backend unit and integration) |
| Lint | ESLint 10 (both apps) |

---

## 2. How it fits together

```
                        ┌──────────────── one origin, so no CORS ────────────────┐
browser ──► :4001 frontend ──── /split-and-pay/* ──► :4000 backend /api/* ──► :5432 postgres
            (Vite in dev,       (proxied to the backend                      (Docker)
             nginx in Docker)    by Vite or nginx)
```

- The browser only talks to **port 4001**. Requests to `/split-and-pay/*` are forwarded to the
  backend's `/api/*`: by Vite's proxy in development, and by nginx in Docker.
- The frontend and backend are separate apps with their own dependencies, each in its own folder:
  `frontend/` and `backend/app/`.
- Postgres always runs in Docker. In development, the backend and frontend run directly on your
  machine with hot reload.

---

## 3. Set up Google sign-in

Sign-in uses Google's ID tokens. There's **no client secret**: the backend only checks the token Google
signed, so the client ID is the only credential, and it isn't secret.

1. Open [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
   and create a project if you don't have one.
2. Configure the **OAuth consent screen**:
   - User type **External**. Fill in the app name and your email.
   - Scopes: none extra are needed (the basic email/profile scopes are enough).
   - While the app is in **Testing** mode, only accounts added under **Test users** can sign in. Add
     yourself and your roommates there, or click **Publish app**. No Google review is needed for
     basic scopes.
3. **Create credentials → OAuth client ID → Web application.**
4. Under **Authorized JavaScript origins**, add:
   - `http://localhost` and `http://localhost:4001` (local development)
   - `https://split.yourdomain.com` (production, once you have a domain, with no port and no path)

   Leave **Authorized redirect URIs** empty: they aren't used.
5. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`). It goes into `GOOGLE_CLIENT_ID`.

---

## 4. Run it locally (development)

Run every command from the **repo root** unless a step says otherwise.

**Step 1: check the prerequisites**

```bash
node --version            # v26.x
yarn --version            # any version; inside backend/app or frontend it reports 4.18.1
docker compose version    # v2 or newer; Docker Desktop must be running
```

**Step 2: install and create the `.env` files**

```bash
git clone <your-repo-url> split-and-pay
cd split-and-pay
yarn setup                # = node setup.js
```

This runs `yarn install` in `backend/app/` and `frontend/`, then creates the three `.env` files with
local defaults and a random database password. The `.env` files are never committed.

**Step 3: fill in the two values only you know**

In **both** `backend/app/.env` and the root `.env`:

```bash
GOOGLE_CLIENT_ID=1234567890-abc...apps.googleusercontent.com   # from section 3
ADMIN_EMAIL=you@gmail.com                                      # your Google account
```

`backend/app/.env` is used by `yarn start`; the root `.env` is used by `docker compose`.

**Step 4: start everything**

```bash
yarn start                # = node start.js
```

This checks your `.env` files, starts Postgres in Docker and waits until it's healthy, then opens two
terminal windows:

- the **backend** on http://localhost:4000 (`node --watch`, which restarts on every save)
- the **frontend** on http://localhost:4001 (Vite, with hot reload)

Database migrations run automatically when the backend starts.

**Step 5: open http://localhost:4001 and sign in** with the Google account in `ADMIN_EMAIL`.
Then follow [first-time setup](#first-time-setup) below.

**Step 6: stop everything**

```bash
yarn stop                 # = node stop.js: frees :4000 and :4001 and stops Postgres (your data is kept)
```

To reset the `.env` files to the defaults, run `node generateEnvFiles.js --force`. This creates a **new**
database password, so the command then also tells you how to reset the local database, which still
uses the old one.

---

## 5. Environment variables

There are three `.env` files, all created by `yarn setup` and all gitignored.

| File | Used by | Postgres host |
|---|---|---|
| `backend/app/.env` | the backend in development (`yarn start`) | `localhost` |
| `frontend/.env` | Vite in development | – |
| `.env` (repo root) | `docker compose` (the production-style stack, locally or on the VPS) | `postgres` (the service name) |

### Backend (`backend/app/.env` and the root `.env`)

| Variable | Example | Meaning |
|---|---|---|
| `ENV` | `LOCAL` / `PRODUCTION` | `LOCAL` allows the session cookie over plain http. **Anything else** (use `PRODUCTION`) marks it `Secure`, which requires HTTPS. |
| `BACKEND_PORT` | `4000` | Port the backend listens on |
| `POSTGRES_HOST` | `localhost` / `postgres` | `localhost` in development, `postgres` inside Docker |
| `POSTGRES_PORT` | `5432` | |
| `POSTGRES_USER` / `POSTGRES_DB` | `splitandpay` | |
| `POSTGRES_PASSWORD` | random | Must match between `backend/app/.env` and the root `.env`, because both use the same local database |
| `GOOGLE_CLIENT_ID` | `…apps.googleusercontent.com` | From [section 3](#3-set-up-google-sign-in). If it's empty, the app runs but sign-in is disabled. |
| `ADMIN_EMAIL` | `you@gmail.com` | The one account that can manage who signs in |

### Frontend, development (`frontend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `VITE_PORT` | `4001` | Vite dev server port |
| `VITE_BASE_URL` | `/` | Path the app is served under |
| `VITE_BACKEND_URL` | `/split-and-pay` | Path the browser uses for API calls |
| `VITE_DEV_PROXY_TARGET` | `http://localhost:4000` | Where Vite forwards those calls |

### Frontend, Docker (root `.env`)

| Variable | Default | Meaning |
|---|---|---|
| `FRONTEND_PORT` | `4001` | Port nginx listens on inside the container. It's also the port in your Coolify domain. |
| `FRONTEND_BASE_URL` | `/` | Baked into the build as `VITE_BASE_URL` |
| `BACKEND_URL` | `/split-and-pay` | Baked into the build as `VITE_BACKEND_URL`, and also used as nginx's proxy path |

nginx reads `FRONTEND_PORT`, `BACKEND_URL` and `BACKEND_PORT` when the container starts
(`frontend/nginx.conf.template`), so changing them in `.env` or Coolify is enough. No config needs editing.

---

## 6. Using the app

### Roles

| | Can sign in | Manage access | Add expenses and settle up |
|---|---|---|---|
| **Admin** (`ADMIN_EMAIL`) | always | ✅ | only after clicking **Join splits** |
| **Roommate** (on the allowed list) | ✅ | ❌ | ✅ |
| Anyone else | ❌ (403) | ❌ | ❌ |

Being admin is only about managing access. If you're also one of the roommates, join the splits
yourself.

### First-time setup

1. Sign in with the admin account. You land on **Manage access**.
2. If you're splitting too, click **Join splits** on your own row.
3. Add each roommate's Gmail address.
4. Ask each roommate to **sign in once**. They only appear as participants after their first sign-in.

Removing someone from the list signs them out immediately. Their past expenses stay.

### Day to day

- **Add an expense:** click **+ Create an expense**, then go through three steps:
  1. who's in it;
  2. what it was, the amount and currency, who paid, and the date;
  3. how to split it.

  The split step shows each person's share live, and you can only submit once it adds up exactly.
- **Expense cards** show who paid, each person's share, and a **Paid**, **Owes** or **Settled** status.
  Whoever added or paid for an expense can delete it, until someone has settled part of it.
- **Settle up** shows your net balance with each person, per currency. **Settle up → Confirm** records
  the payment and marks the shared expenses between the two of you as settled. If someone adds an expense
  while you're looking, the app refuses the old amount and shows the new one.

---

## 7. Run the production stack locally (Docker)

This runs exactly what the VPS will run: nginx serving the built frontend, and the backend and Postgres
in containers, all configured by the root `.env`.

```bash
yarn stop                      # the dev stack uses the same ports; stop it first
docker compose up --build      # build both images and start postgres + backend + frontend
```

Open http://localhost:4001. Useful commands:

```bash
docker compose ps              # all three should show "healthy"
docker compose logs -f backend # follow logs (or: frontend, postgres)
docker compose down            # stop; your data is kept
```

> ⚠️ **Don't** run `docker compose down -v` unless you mean it: `-v` deletes the database volume.

The dev stack and the Docker stack share the same Postgres container and data. There's no hot reload
here, so run `docker compose up --build` again after changing code.

---

## 8. Tests and lint

From the repo root, these run across both apps:

```bash
yarn lint                 # ESLint in backend/app and frontend
yarn test                 # unit tests in backend/app and frontend
yarn test:integration     # backend integration tests against a real Postgres (Docker must be running)
yarn build                # production build of the frontend
```

| Suite | Where | What it covers |
|---|---|---|
| Backend unit (`node:test`) | next to the code: `backend/app/src/**/<name>.<kind>.test.js` | split math, input validation, sign-in rules |
| Backend integration | `backend/app/test/integration/` | the real app over HTTP against a real Postgres: sign-in, access control, expenses, balances, settle-ups (including simultaneous ones) |
| Frontend (Vitest + React Testing Library) | `frontend/src/__tests__/` | dashboard, user menu, the create-expense flow, money and split helpers |

The integration tests start a **throwaway** Postgres container on a free port and always remove it
afterwards, so your dev database is never touched. Only Google's signature check is faked. A full run
takes about 2 seconds.

To run one app's checks only, `cd backend/app` or `cd frontend` and use the same `yarn test` and
`yarn lint` there.

---

## 9. Deploy to a VPS with Coolify

`docker-compose.yml` is used both locally and on the VPS. Every port is published on `127.0.0.1` only,
so nothing is reachable from the internet except through Coolify's HTTPS proxy.

**1. Push your code.** Coolify builds from your git repository, so commit and push first.

**2. Point a domain at the VPS.** Add a DNS `A` record, e.g. `split.yourdomain.com → <VPS IP>`.

**3. Create the resource in Coolify:** **New Resource → your Git repository → Build Pack: Docker Compose**,
with the compose file `docker-compose.yml`.

**4. Set the domain on the `frontend` service only**, with the container port on the end:

```
https://split.yourdomain.com:4001
```

The `:4001` tells Coolify's proxy which port inside the container to use (`FRONTEND_PORT`). Visitors
just go to `https://split.yourdomain.com`. Give `backend` and `postgres` **no** domain.

**5. Set the environment variables** in Coolify. Don't copy your local `.env`.

```bash
ENV=PRODUCTION                      # makes the session cookie Secure (HTTPS only)
BACKEND_PORT=4000
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=splitandpay
POSTGRES_PASSWORD=<new long random string>   # e.g. openssl rand -base64 24
POSTGRES_DB=splitandpay
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
ADMIN_EMAIL=you@gmail.com
FRONTEND_PORT=4001                  # must match the port in the domain
FRONTEND_BASE_URL=/
BACKEND_URL=/split-and-pay
```

> `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` only take effect the **first** time the
> database starts. Changing them in Coolify later doesn't change the database, and the backend then
> can't connect. Choose them once.

**6. Allow the domain in Google.** Add `https://split.yourdomain.com` to Authorized JavaScript origins
([section 3](#3-set-up-google-sign-in)).

**7. Deploy**, then open `https://split.yourdomain.com` and do the [first-time setup](#first-time-setup).

**8. Turn on backups.** In Coolify, enable **Scheduled Backups** for the Postgres service and send them
to off-server storage (e.g. Cloudflare R2 or Backblaze B2). Test a restore once. Redeploying never
deletes data, because it lives in a named volume, but losing the VPS would.

### What protects the app in production

- **Network:** nothing is published publicly. The only way in is HTTPS through Coolify's proxy.
- **Access:** Google sign-in, restricted to the allowed list. Sessions are random tokens in an httpOnly,
  `SameSite=Lax`, `Secure` cookie, and only a SHA-256 hash of each token is stored.
- **nginx:**
  - security headers: a CSP that allows only Google Sign-In, `X-Frame-Options`, `nosniff` and
    `Referrer-Policy`;
  - a rate limit of 10 API requests per second per client (bursts of 20), based on the real client IP
    passed on by the proxy.

---

## 10. Database and migrations

- **Migrations:** they live in `backend/app/src/database/migrations/` as plain numbered SQL files, run
  automatically at backend startup, and are tracked in the `schema_migrations` table. To run them by
  hand: `cd backend/app && yarn migrate`.
- **Before the first deploy,** it's fine to edit `001_init.sql` directly and reset your local database.
- **Once the app is deployed, never edit a migration that has already run.** Add a new numbered file
  (`002_add_something.sql`) instead.
- **Money** is stored as integers in minor units (cents or paise, `amount_minor BIGINT`), never as
  floats. ₹100 split three ways is 33.34 + 33.33 + 33.33.
- **IDs** are UUIDs (Postgres 18's `uuidv7()`): time-ordered, and they can't be guessed or counted.

To open a SQL shell on the local database:

```bash
docker exec -it split-and-pay-postgres-1 psql -U splitandpay -d splitandpay
# \dt lists tables, \d users describes one, \q quits
```

---

## 11. Project structure

```
split-and-pay/
├── package.json                 # root scripts: yarn setup / start / stop / lint / test / build
├── setup.js  start.js  stop.js  generateEnvFiles.js
├── docker-compose.yml           # postgres + backend + frontend (local and VPS)
├── .env                         # for docker compose (gitignored)
├── backend/
│   ├── Dockerfile
│   └── app/                     # the backend project (own package.json, yarn.lock, .yarn/, .env)
│       ├── src/
│       │   ├── server.js                    # entry point: migrations, then listen
│       │   ├── setup.js                     # setupApp(): middleware, routes, error handling
│       │   ├── routes/route.js              # combines every *.route.js, mounted at /api
│       │   ├── routes/*.route.js            # path + middleware → controller
│       │   ├── controllers/*.controller.js  # request in → service → response out
│       │   ├── services/*.service.js        # business logic and SQL (+ *.service.test.js)
│       │   ├── middlewares/*.middleware.js  # auth, admin/participant checks, logging, errors
│       │   ├── models/*.model.js            # response envelope, HttpError
│       │   ├── utils/*.util.js
│       │   ├── constants/                   # environment.js (the only place env is read), constants.js
│       │   ├── config/                      # database pool, auth settings
│       │   └── database/                    # migrate.js + migrations/*.sql
│       └── test/integration/                # run.js (throwaway Postgres), harness.js, *.integration.test.js
└── frontend/                    # the frontend project (own package.json, yarn.lock, .yarn/, .env)
    ├── Dockerfile               # build with Vite, then serve with nginx
    ├── nginx.conf.template      # filled in from env when the container starts
    ├── security-headers.conf
    └── src/
        ├── pages/               # Dashboard, expenses/, SettleUp, Admin, Login
        ├── components/          # layout/ (TopBar, Sidebar, UserMenu), ExpenseCard, Avatar, Icons
        ├── auth/  hooks/  utils/  constants/
        └── __tests__/
```

**Conventions**

- **Environment variables** are read in exactly one place per app (`constants/environment.js`), and
  exported as PascalCase objects of `UPPER_SNAKE` constants.
- **Backend file names** carry their role: `.route.js`, `.controller.js`, `.service.js`,
  `.middleware.js`, `.model.js`, `.util.js`.
- **Tests:** backend unit tests sit next to the file they test; frontend tests go in `src/__tests__/`.

---

## 12. Troubleshooting

| Problem | Fix |
|---|---|
| `Couldn't find a package.json file` | Run commands from the repo root, or from inside `backend/app` or `frontend`. |
| `yarn --version` shows 1.x inside an app | Check that `.yarnrc.yml` and `.yarn/releases/` exist in that folder: they're committed and pin Yarn 4. |
| "Google sign-in isn't configured" on the login page | `GOOGLE_CLIENT_ID` is empty in the `.env` the backend is using. Fill it in and restart. |
| Google shows *"origin is not allowed"* / `invalid_client` | Add the exact origin (`http://localhost:4001` or `https://your-domain`) to Authorized JavaScript origins. Changes can take a few minutes. |
| "This Google account isn't allowed" | The admin hasn't added that email on **Manage access**. In Testing mode, also add it as a test user in Google. |
| You can sign in but have no expense options | You're the admin and haven't joined. Click **Join splits** on Manage access. |
| `yarn start` says a port is in use | Run `yarn stop`. If you ran the Docker stack, run `docker compose down`. |
| Backend: `password authentication failed` | The database was created with a different password. Put the old one back, or reset the local database (**this deletes local data**): `docker compose down -v`, then `yarn start`. |
| `yarn test:integration`: "Docker isn't running" | Start Docker Desktop and try again. |
| Signed in locally, but the session is lost on refresh in production | `ENV` must not be `LOCAL` in production, and the site must be served over HTTPS. |

---

## License

MIT, see [LICENSE](LICENSE).

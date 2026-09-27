# 💸 Split & Pay

A self-hosted Splitwise-style app for splitting shared expenses between roommates.

## 🛠️ Tech Stack

- **Frontend** — [React](https://react.dev/) + [Vite](https://vite.dev/) + [Tailwind CSS](https://tailwindcss.com/), served by nginx
- **Backend** — [Node.js 26](https://nodejs.org/) + [Express 5](https://expressjs.com/)
- **Database** — [PostgreSQL 18](https://www.postgresql.org/), plain SQL migrations in `backend/src/database/migrations`
- **Deployment** — Docker Compose on a VPS (works with [Coolify](https://coolify.io/))

```
browser ──► frontend (nginx :4001) ──/split-and-pay──► backend (:4000) ──► postgres (:5432)
```

The backend serves every route under `/api`. The browser calls `BACKEND_URL/*` (`/split-and-pay/*`),
which nginx (in docker) or the Vite dev server (locally) rewrites to `/api/*`. Both read the path
from env, so changing `BACKEND_URL` is the only edit needed. The browser only ever talks to one origin, so there's no CORS setup.

## 🚀 Local Setup

Prerequisites: Node.js v26+, Yarn (any version, e.g. `npm install -g yarn`), Docker Desktop.
Each app pins Yarn 4 in its own `.yarn/releases/`, and your global `yarn` hands off to it automatically.

```bash
node setup.js              # yarn install in backend/app/ + frontend/, scaffold .env files
# fill in GOOGLE_CLIENT_ID and ADMIN_EMAIL in backend/app/.env (see "Sign-in" below)
node start.js              # Postgres in Docker + backend (:4000) and frontend (:4001) in new terminal windows
node stop.js               # kill :4000/:4001 and stop Postgres
```

Open http://localhost:4001.

`node generateEnvFiles.js --force` regenerates the `.env` files from defaults.

To run the whole production-like stack in Docker instead:

```bash
docker compose up --build   # uses the root .env
```

## 🗂️ Backend layout

```
backend/app/src/
├── server.js                  # entry point: migrations, then app.listen
├── setup.js                   # setupApp(): builds the Express app (middleware, routes, errors)
├── routes/route.js            # combines every *.route.js; mounted at /api by setup.js
├── routes/*.route.js          # paths + middleware → controller functions
├── controllers/*.controller.js# read the request, call services, send the response
├── services/*.service.js      # business logic and SQL (tests next to them: *.service.test.js)
├── middlewares/*.middleware.js
├── models/*.model.js          # response envelope, HttpError
├── utils/*.util.js
├── config/  constants/  database/
```

## 🧪 Tests

From the repo root, these run across both apps:

```bash
yarn lint                 # ESLint in backend/app and frontend
yarn test                 # unit tests in backend/app and frontend
yarn test:integration     # backend integration tests (needs Docker)
yarn build                # production build of the frontend
```

Or inside one app:

```bash
cd backend/app
yarn test                 # unit tests (node:test), next to the code: src/**/<name>.<kind>.test.js
yarn test:integration     # integration tests against a real Postgres (needs Docker), ~2s
yarn lint                 # ESLint

cd frontend
yarn test                 # Vitest + React Testing Library; tests live in src/__tests__/
yarn lint                 # ESLint
```

The integration tests (`backend/app/test/integration/`) start a throwaway Postgres container on a free port,
boot the real app with `setupApp()`, and call the API over HTTP: sign-in, the allowed list, expenses,
balances and settle-ups, including concurrent settle-ups. Only Google's signature check is faked. The
container is always removed afterwards, and your dev database is never touched.

## 🔐 Sign-in

Sign-in is **Google only**, and only allowed accounts can get in. Everyone else gets a 403, even
though the site is public.

- `ADMIN_EMAIL` (env) is your account. It can always sign in and is the only one that can open
  **Manage access**. Being admin is only about access: it doesn't make you part of any split.
- Everyone on the allowed list (the `allowed_emails` table, managed from **Manage access**) can sign in
  and split expenses. Removing someone signs them out immediately; their past expenses stay.
- If you're also a roommate, click **Join splits** on your own row (it adds your email to the list).
  **Leave splits** takes you back to managing access only, without signing you out.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an
   **OAuth client ID** of type **Web application**. The consent screen can stay in "Testing" mode
   if you also add the roommates there as test users; otherwise publish it (only basic
   profile/email scopes are used, so no Google review is needed).
2. Under **Authorized JavaScript origins**, add `http://localhost`, `http://localhost:4001` and your
   production URL (e.g. `https://split.example.com`). No redirect URIs are needed.
3. Put the client ID in `GOOGLE_CLIENT_ID` (backend only; the frontend fetches it from
   `/auth/config`). There is no client secret: the backend only verifies Google's signed ID token.
4. Set `ADMIN_EMAIL` to your Google account, sign in, add your roommates on **Manage access**, and
   click **Join splits** if you're splitting too.

Sessions are stored in Postgres (`sessions` table) and kept in a 30-day httpOnly cookie.

## 🗄️ Database

- Migrations run automatically when the backend starts (or manually with `yarn migrate` in `backend/app/`).
  Add a new numbered file (`002_something.sql`) for schema changes; never edit one that has already run.
- Money is stored as **integer minor units** (cents / paise, `amount_minor BIGINT`), never floats. Each
  expense has a currency (USD or INR, default USD); balances and settle-ups are kept per currency.

## ☁️ Deploying

`docker-compose.yml` is the production file. Set these variables in Coolify (or a root `.env` on the VPS):

```
ENV=PRODUCTION
BACKEND_PORT=4000
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=splitandpay
POSTGRES_PASSWORD=<long random string>
POSTGRES_DB=splitandpay
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
ADMIN_EMAIL=you@gmail.com
FRONTEND_PORT=4001
FRONTEND_BASE_URL=/
BACKEND_URL=/split-and-pay
```

The same `docker-compose.yml` runs locally and on the VPS. Postgres and the backend are published on
`127.0.0.1` only, so they are reachable from the VPS itself but never from the internet.

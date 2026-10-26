# Dental records

A small app that a Dentist uses to keep patient records. It covers:

- patients, with search and a check for duplicates
- the intake form and medical history alerts
- appointments, shown in day and week views
- treatment notes that lock, and can be amended later
- a Dashboard home screen
- archiving and restoring patients

There is one user, the Dentist, and the app is used mainly on a phone. Every screen is built for a phone first and then scaled up to a desktop. You can add it to a phone's home screen.

## How it is built

- **API:** [Hono](https://hono.dev) running on a Cloudflare Worker (`worker/`).
- **Database:** Cloudflare D1, which is SQLite. [Drizzle](https://orm.drizzle.team) describes the tables, and the SQL migrations are in `drizzle/`.
- **Sign in:** [Better Auth](https://www.better-auth.com).
- **Web app:** React, built with Vite (`web/`). The same Worker serves the built files, so the app and the API share one address.
- **Tests:** Vitest, which runs the API against a local D1 (`test/`).

## Run it on your computer

You need Node.js and npm.

1. Install the packages.

   ```bash
   npm ci
   ```

2. Create your local secret file. The example value is fine on your own computer.

   ```bash
   cp .dev.vars.example .dev.vars
   ```

3. Create the local database tables.

   ```bash
   npm run db:migrate:local
   ```

4. Create the Dentist account. The script asks for an email, a name and a password.

   ```bash
   npm run seed:dentist -- --local
   ```

5. Start the API. It listens on http://localhost:8787.

   ```bash
   npm run dev:api
   ```

6. In a second terminal, start the web app, then open http://localhost:5173. Vite forwards every `/api` request to the API from step 5.

   ```bash
   npm run dev
   ```

The local database lives in `.wrangler/` and is not committed.

## Check your work

```bash
npm test
npm run typecheck
npm run build
```

- `npm test` runs all the API tests once.
- `npm run typecheck` checks the types of the API and of the web app.
- `npm run build` builds the web app into `dist/`.

## Deploy

The app runs on Cloudflare Workers. `npm run deploy` does two things in order:

1. `wrangler d1 migrations apply DB --remote` brings the production database up to date.
2. `wrangler deploy` builds the web app and publishes the Worker.

Before the first deploy, set the production secret once. Wrangler asks you to type the value.

```bash
npx wrangler secret put BETTER_AUTH_SECRET
```

Create the Dentist account in production with `npm run seed:dentist -- --remote --db records-db`.

Each pull request also gets a Preview build from Cloudflare's "Workers Builds" check. A Preview uses its own empty database, `records-db-preview`, so it never reads production data. Set up its tables with `npx wrangler d1 migrations apply records-db-preview --remote`.

## Where things are

| Folder | What is in it |
| --- | --- |
| `worker/` | The API: routes, sign in, database tables |
| `web/` | The React app |
| `drizzle/` | Database migrations |
| `test/` | API tests |
| `scripts/` | One-off scripts, such as creating the Dentist |
| `wrangler.jsonc` | Cloudflare settings, with a comment on each line |

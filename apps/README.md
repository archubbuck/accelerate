# AccessLab — Published-package authorization demos

Three independently installed npm applications demonstrate the published `@accelerate/authorization-*` packages:

| App | URL | Published packages |
| --- | --- | --- |
| Fastify API | http://localhost:4000 | authorization-core, authorization-postgres |
| React + Vite | http://localhost:5173 | authorization-react |
| Angular | http://localhost:4200 | authorization-angular |

**These apps are intentionally outside the pnpm workspace.** Install dependencies from npm inside each app directory; never use `workspace:*` or imports from `../../packages`.

## Requirements

- Node.js 22+ and npm
- PostgreSQL 16+
- Published npm versions `0.1.3` for all four authorization packages

## Run locally

1. Create a dedicated PostgreSQL database and user with permission to create tables.
2. Copy `apps/demo-api/.env.example` to `apps/demo-api/.env`; configure `DATABASE_URL` and a random `DEMO_SESSION_SECRET` of at least 32 characters.
3. In three separate terminals:

```sh
cd apps/demo-api
npm install
npm run start
```

```sh
cd apps/demo-react
npm install
npm run dev
```

```sh
cd apps/demo-angular
npm install
npm run start
```

The API applies `schema.sql` and `admin.sql` from the **installed npm PostgreSQL package** and idempotently seeds demo roles, assignments, and documents.

Each app can be independently verified using `npm run verify:npm`. Do not use the demo against production databases. Identity switching is deliberately open to anyone using this **local-only educational application**; it is not production authentication. The API binds to localhost by default.

## Walkthrough

1. Open either frontend and choose Alice (Viewer): document read access only.
2. Choose Bob (Editor): create and edit documents, but cannot approve.
3. Choose David (Administrator): grant `documents.approve` to the `editor` role in Administration.
4. Switch back to Bob, refresh permissions, and approve a document.
5. Switch to Erin (Auditor) and inspect the administrative audit trail.
6. Open the Permission Inspector to see `GRANTED` or `PERMISSION_NOT_GRANTED` and matched roles.

Frontend directives and components control presentation. The API independently checks every protected document operation. Admin mutations use the published `PostgresAuthorizationAdmin` and record audit events transactionally.

## Notes

- Demo roles are seeded without overwriting subsequent permission changes; deleting the dedicated demo database resets the experience.
- No demo app is published to npm.
- Run the independent `demo-ci.yml` workflow after each npm release to verify actual published distributions.

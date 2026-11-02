# CSSG Internal Tool

Recruiting, roster, and project management for [CS + Social Good at UNC](https://www.cssgunc.org/).

- **Phase 1, Recruiting & Roster:** interest check-in, applications, review rounds, the member roster, performance reviews, and automatic cleanup of old personal data.
- **Phase 2, PM Tool & Project Board:** generate a semester of tickets from a project's TDD and keep the board in two-way sync with GitHub.

The source of truth for what the app does is the **TDD** in the CSSG Notion (Projects → Internal Tool → TDD). Tickets link to its sections; if the code and the TDD disagree, ask before "fixing" either.

## Stack

| Part     | Tech                                                                    |
| -------- | ----------------------------------------------------------------------- |
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS                   |
| Backend  | Bun, Hono, Drizzle ORM, PostgreSQL 16, Zod                              |
| Shared   | `packages/shared`: types, Zod schemas, form definitions used by both    |
| Tooling  | Bun workspaces, Prettier, ESLint, Lefthook git hooks, GitHub Actions CI |
| Hosting  | Vercel (web), Railway (API), Neon (Postgres)                            |

## Getting started

We use a **devcontainer**: a Docker container with Node, Bun, and Postgres already set up, so everyone's environment is the same.

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and [VS Code](https://code.visualstudio.com/), then the **Dev Containers** extension in VS Code.
2. Clone this repo and open the folder in VS Code.
3. When prompted, click **Reopen in Container** (or run _Dev Containers: Reopen in Container_ from the command palette).
4. Wait for the first build (a few minutes). It runs `bun install` for you, which also installs the git hooks.
5. Run the app:

   ```bash
   bun run dev
   ```

   - Web: http://localhost:3000
   - API: http://localhost:8787/api/v1/health

**Windows tip:** file watching and installs are much faster if the repo lives inside WSL instead of on a Windows drive. Either clone it inside WSL (`\\wsl$\...`) and open it from there, or use _Dev Containers: Clone Repository in Container Volume_. If hot reload doesn't pick up your changes, this is almost always why.

**Laptop struggling?** Open the repo in **GitHub Codespaces** instead. It uses the same devcontainer, in the browser.

### Without the devcontainer

Install [Bun](https://bun.sh) and run Postgres 16 yourself, then:

```bash
bun install
cp apps/api/.env.example apps/api/.env   # point DATABASE_URL at your Postgres
bun run dev
```

## Commands

Run from the repo root.

| Command                 | What it does                             |
| ----------------------- | ---------------------------------------- |
| `bun run dev`           | Start web and API with hot reload        |
| `bun run dev:web`       | Start only the web app                   |
| `bun run dev:api`       | Start only the API                       |
| `bun run lint:all`      | Lint every package                       |
| `bun run typecheck:all` | Type check every package                 |
| `bun run test:all`      | Run all tests                            |
| `bun run build:all`     | Production build of every package        |
| `bun run format`        | Format everything with Prettier          |
| `bun run db:generate`   | Generate a migration from schema changes |
| `bun run db:migrate`    | Apply migrations to the database         |
| `bun run db:studio`     | Browse the database in Drizzle Studio    |
| `bun run db:seed`       | Insert the default position records      |

## Repo layout

```
apps/
  web/                  Next.js frontend. Pages and components only; never touches the database
    src/app/            routes (App Router)
    src/components/     shared UI components
    src/lib/api.ts      typed API client (types come from the Hono routes)
  api/                  Hono API on Bun
    src/app.ts          all routes, mounted under /api/v1
    src/routes/         one file per resource: parse input, check access, call a service
    src/services/       business rules (permissions, seat limits, recruiting rounds, retention)
    src/db/schema/      Drizzle tables (TDD 3.1)
    src/jobs/           scheduled jobs (daily retention cleanup)
    tests/              bun test
packages/
  shared/               Zod schemas, enums, form definitions shared by web and api
.devcontainer/          dev environment (workspace + Postgres)
.github/                CI, PR template, ticket template
```

## Working on a ticket

See [CONTRIBUTING.md](./CONTRIBUTING.md). Short version: branch from `main`, keep commits passing the hooks, open a PR that says `Closes #<ticket>`, and request a review.

## AI tools

Use them however you like, but the code you push is yours: you should be able to explain what it does and why. Work out the approach yourself (or with the AI) before letting it write the code.

# Contributing

## The flow for one ticket

1. **Pick up a ticket** at the weekly meeting. Tickets are GitHub Issues. Each one links to the TDD sections it implements.
2. **Update `main` and branch off it:**

   ```bash
   git checkout main
   git pull
   git switch -c yourname/short-summary   # e.g. aysel/login-page
   ```

3. **Build it.** Commit as often as you like. Each commit runs the pre-commit hook (format + lint on the files you changed), and each push runs a type check. If a hook fails, fix it and commit again; don't skip hooks with `--no-verify`.
4. **Open a PR** into `main` using the template. Put `Closes #<ticket number>` in the description so the ticket closes when it merges.
5. **Request a review** and send a quick message so the reviewer knows it's up. Message again when you push fixes.
6. **Merge** after approval and green CI.

`main` is protected: no direct pushes, CI must pass, and a PR needs an approval.

## Deadlines

The initial PR for a ticket is due at the next weekly meeting. If it's bigger than expected or you have a rough week, say so early and we'll adjust.

## Keeping the TDD in sync

The TDD marks anything not built yet with ‼️. When your PR builds something the TDD describes, remove that marker in the same PR (or tell the lead). If you find the TDD is wrong or unclear, ask instead of guessing.

## Database changes

1. Edit or add tables in `apps/api/src/db/schema/`.
2. Run `bun run db:generate` to create a migration in `apps/api/drizzle/`.
3. Run `bun run db:migrate` to apply it locally.
4. Commit the schema change **and** the generated migration together.

## Conventions

- Business rules go in `apps/api/src/services`, not in routes or components.
- Validate every request body with a Zod schema from `packages/shared`.
- The web app calls the API only through the typed client in `apps/web/src/lib/api.ts`.
- Never commit secrets or real member data. Use `.env` files (git-ignored) and fake data in tests.

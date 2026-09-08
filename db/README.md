# The database layer

Two ways to reach Postgres live here side by side. That is deliberate and
temporary.

## Which one to use

**New or edited code: Drizzle.**

```ts
import { getDb, schema } from "../_lib/orm.js";

const db = getDb();
const rows = await db
  .select()
  .from(schema.boards)
  .where(eq(schema.boards.id, id))
  .limit(1);
```

**Existing code: leave it.** Roughly seventy files still use `getSql` and raw
tagged-template SQL. They work. Convert a file to Drizzle when you are already
editing it for another reason, not as a task of its own — a mass rewrite would
mean retesting every endpoint in the app to gain nothing on the day it landed.

Both go through the same `neon-http` driver and the same connection string, so
the two can be mixed inside one request without any coordination.

## Who owns the schema

`db/patches` does, and only `db/patches`.

A new table or column is a new numbered `.sql` file there, applied by
`pnpm db:migrate`. Drizzle is a query layer over the shape those patches make;
it does not create or alter anything. `drizzle-kit generate` and
`drizzle-kit migrate` are deliberately not wired up, because three deployed
databases are already built by the patches and a second tool with an opinion
about DDL could disagree with the first.

## After adding a patch

```sh
pnpm db:migrate                       # against each site, see below
DATABASE_URL="…" pnpm db:pull         # regenerate db/schema.ts
```

`pnpm db:pull` overwrites `db/schema.ts` and `db/relations.ts` from a real
database. It also drops a `db/meta/` folder and a `db/0000_*.sql` file, which
are Drizzle's own migration bookkeeping — both are gitignored and can be
deleted.

**Two edits must be re-applied after every pull.**

First, `db/relations.ts` imports `./schema` without an extension. That resolves
under `vercel dev` and fails in production, where the functions run as real ESM
— every endpoint touching the ORM answers `FUNCTION_INVOCATION_FAILED` with
`ERR_MODULE_NOT_FOUND` for `/var/task/db/schema`. Add the `.js`.

Second, the type annotations. `recipes`, `recipeVersions`,
`brandKits` and `brandKitVersions` reference each other, and TypeScript cannot
infer a type used inside its own definition. The generator omits the annotation
that breaks the cycle, so `db/schema.ts` does not compile until it is put back.
The comment at the top of that file says the same thing.

## Every site has its own database

Three of them, one per site, each needing every migration:

```sh
for s in addison cyan dallas-images; do
  url=$(grep -o '^DATABASE_URL=.*' .env.$s.local | cut -d= -f2- | tr -d '"')
  DATABASE_URL="$url" pnpm db:migrate
done
```

Running `pnpm db:migrate` with no `DATABASE_URL` migrates whatever `.env.local`
currently points at, which is one site rather than all three.

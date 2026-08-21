# Working in this repository

Project-specific notes. The Ultracite standards further down are generic; what
follows is the handful of things that have actually broken production here.

## CodeGraph is indexed — query it before grep

`.codegraph/` exists at the repo root, so structural questions are answered from
the index rather than by reading files:

- `codegraph_explore` — MCP tool. Verbatim source, call paths and blast radius in one call.
- `codegraph explore "<symbols or question>"` — same output from the shell, available even when the MCP server is not connected.

Read the **blast radius** section before changing any shared symbol: it lists
every caller and flags symbols with no covering tests. `codegraph impact <sym>`
and `codegraph callers <sym>` answer the narrower questions.

Trust it for structure — who calls what, what breaks. Re-read the actual lines
before editing them; the index lags writes by roughly a second.

## Three sites, three separate databases — and no separate dev database

`addison`, `cyan` and `dallas-images` are separate Vercel projects, each with
its own Neon database. Only `site_settings` is keyed by site — `photos`,
`users` and `categories` have no site column, because nothing is shared.

**Within a project, Development and Production point at the same Neon instance.**
The two connection strings differ by password, which makes them look like two
databases; they are not. `pnpm dev` reads and writes live data, and a
destructive statement aimed at "the dev database" hits the real site. This was
established the hard way — an `UPDATE ... WHERE show_chrome is true` intended
as test cleanup wiped the live configuration.

Run `pnpm db:info` before anything destructive. It prints the host and the
Postgres `system_identifier`, which is the only reliable answer to "is this the
same database" — two URLs reporting the same identifier are one instance.

**Migrate every database before deploying code that reads a new column.**
Deploying first takes the un-migrated sites down: `PHOTO_COLUMNS` is consumed by
both `api/photos/index.ts` and `api/shell.ts`, so one added column 503s every
photo endpoint on any database that lacks it. Ask CodeGraph for the blast radius
of a shared constant before touching it.

```bash
DATABASE_URL='<that site's production string>' pnpm db:migrate
```

Patches are idempotent (`ADD COLUMN IF NOT EXISTS`), so re-running is safe.

`vercel env pull` defaults to the **development** environment. Pass
`--environment=production`, or you will migrate a database the live site never
reads and the failure will look unchanged.

## The site key must match exactly

`resolveSite()` compares `VITE_SITE` / `SITE` literally. An unmatched key falls
through to the default site's configuration and serves that site's branding
rather than erroring, so a typo looks like a styling bug. The deployed keys are
`addison`, `cyan` and `dallas-images`.

Locally, `scripts/dev-stack.mjs` mirrors `VITE_SITE` into `SITE`: the browser
bundle reads the first and the serverless functions read the second.

## Commands

```bash
pnpm db:info  # which database am I pointed at, really
pnpm test     # vitest in real Chromium — canvas code needs a real canvas,
              # jsdom returns null from getContext and every assertion passes
pnpm lint     # tsc --noEmit + the 500-line ceiling
pnpm api:docs # regenerate openapi.json, openapi.yaml and bruno/
pnpm dlx ultracite check
```

## Giving local development its own database

Until this is done, `pnpm dev` writes to the live site. To separate them:

1. Neon console → the project → **Branches** → create a branch from `main`,
   named `dev`. It is copy-on-write, so it is instant, costs nothing extra, and
   starts with a full copy of the real data.
2. Copy that branch's pooled connection string.
3. Vercel → the project → Settings → Environment Variables → set
   `DATABASE_URL` for **Development only** to that string.
4. `pnpm db:info` — the `system_identifier` must now differ from production's.

Reset it whenever it drifts by deleting and recreating the branch.

---

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `pnpm dlx ultracite fix`
- **Check for issues**: `pnpm dlx ultracite check`
- **Diagnose setup**: `pnpm dlx ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Do not nest terniary operations.
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**
- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**
- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**
- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `pnpm dlx ultracite fix` before committing to ensure compliance.


---

# Design

The canvas has a written design context. It governs `src/boards/**` and the
admin shell around it — not the public photo sites, which are themed per site
from the database. The full version, including the reasoning, is in
`.impeccable.md` at the repo root.

## Design Context

**Scope: the canvas.** `src/boards/**` and the admin shell around it — nodes,
wires, panels, the inspector, the insert palette. Not the public photo sites;
those are a separate surface with their own theme, editable per site from the
database, and nothing here should reach into them.

### Users

One person, working alone, for hours at a stretch, most often at night.

The canvas is a working instrument rather than a destination: pictures are
wired into nodes, generated or halftoned or composited, judged, rewired and run
again. A session is long and repetitive, and the same six controls are reached
for hundreds of times. Nothing here is browsed and nothing is being sold.

The job is **judging pictures**. Every other thing on screen is in service of
that, and in competition with it for attention.

### Brand Personality

**Machined · quiet · unfashionable.**

A darkroom timer. A mixing desk. A plate-camera lens barrel with the aperture
numbers engraved into it. Objects that are unmistakably built for a job, that
were not styled to be liked, and that are still in use forty years later
because nothing about them was fashionable enough to date.

The tool should feel like it was *made*, not *designed*. It should be possible
to look at it for eight hours without getting sick of it — which is a different
and much harder goal than looking impressive in a screenshot.

### Aesthetic Direction

**Theme: the existing split stays, and it is load-bearing.**

- The **editor** is light: paper. Photographs are judged against paper, and the
  board is the desk they are laid out on.
- A **published board** is dark. A visitor came to look at the pictures, and
  they read brighter against black.

This is already how `--board-ink` / `--board-surface` / `--board-panel` work in
`src/index.css`, inverted by `.board-fixed`. Keep the mechanism; do not
introduce a second theming path beside it.

**Anti-reference: the generic design-tool look.** Figma, Framer, and every
canvas app that has converged on the same surface — rounded cards, soft drop
shadows, floating translucent panels, a blue accent, everything on its own
elevated plane. This is the thing to actively avoid, not merely to not-copy.
Where a decision could go either way, take the one that looks less like those.

Also excluded, by the same argument: the 2024–25 AI-product look (gradients on
near-black, glows, glassmorphism, sparkles) and enterprise dashboard chrome
(status pills, sparklines as decoration, everything in a card).

### Typography

Both current faces are dead defaults and neither should follow the canvas
inward: **Inter** is the single most-used UI face in existence, and
**Cormorant Garamond** is its decorative counterpart. They stay where they are
on the public sites; they do not come here.

- **Display — Archivo.** Node titles, panel headers, section labels. A
  grotesque with machined bones and a real weight range; correct in small caps
  with wide tracking, which is what the canvas already does
  (`uppercase tracking-[0.18em]`).
- **UI and body — Public Sans.** A civic face, drawn for government forms:
  quiet to the point of being invisible, and genuinely excellent at 10–12px,
  which is the size almost everything here is set at.

**No monospace face.** Mono as shorthand for "technical" is exactly the
fashionable move this brief rejects. Numbers still need to line up in a column,
so that is solved properly — `font-variant-numeric: tabular-nums` on every
readout, count, coordinate and hex value.

Sizes are fixed `rem`, not fluid. This is a product UI; a control that changes
size with the viewport is a control that has moved.

### Colour

Keep the OKLCH tokens. Two changes:

- **Tint the neutrals.** They are currently pure achromatic
  (`oklch(0.145 0 0)`). The brand hue is the ink the halftone actually prints —
  `#041045`, a deep navy, around 265°. Carry a chroma of 0.006–0.012 through
  the greys. It is below the threshold of being noticed and above the threshold
  of being felt.
- **Spend accent at 10%, not 40%.** Colour means *state* — running, failed,
  selected, wired — and nothing else. It works because it is rare. A palette in
  which everything is coloured says nothing.

### Design Principles

1. **The picture is the subject.** Chrome never covers the thing being judged.
   This is why the shader settings left the node for a panel, and why the mask
   controls float clear of the mask. When something has to be on top of an
   image, it is wrong until proven otherwise.

2. **State is shown where it happens.** A node says what it is doing, what it
   is about to send, and how many pictures it holds — on the node. Not in a
   toast that vanishes, not in a panel that has to be opened. Nearly every bug
   in this tool has been two places disagreeing about the same fact; the fix is
   always to show the fact where it is used.

3. **Dense, but only what is in use.** This is an instrument: many controls,
   close together, no wasted field. Density is earned by hiding nothing that is
   currently relevant — not by cramming in everything that might be.

4. **Nothing floats without reason.** No card inside a card, no shadow standing
   in for hierarchy, no panel hovering on its own plane because it looked
   better. Depth is for things that genuinely sit above the board: a picker, a
   menu, a drag in flight.

5. **Legible at 3am.** Type large enough to read tired, contrast high enough to
   read at an angle, targets big enough to hit without aiming, motion short
   enough not to wait for. If a choice makes the tool prettier in a screenshot
   and worse in hour six, it loses.

### Implementation

Named BEM classes in a co-located `Component.css`, against the theme
variables — the pattern `src/boards/OpNodeView.css` already sets. Tailwind
stays as the token layer (`--color-board-*`, `--spacing`, `--radius-*`); the
utility soup in JSX goes.

`src/boards/` first. One area per commit, reviewable, and stoppable after any
of them.

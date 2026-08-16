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

## Three sites, three separate databases

`addison`, `cyan` and `dallas-images` are separate Vercel projects, each with
its own Neon database. Only `site_settings` is keyed by site — `photos`,
`users` and `categories` have no site column, because nothing is shared.

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
pnpm test     # vitest in real Chromium — canvas code needs a real canvas,
              # jsdom returns null from getContext and every assertion passes
pnpm lint     # tsc --noEmit
pnpm dlx ultracite check
```

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

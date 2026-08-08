# PostHog Source Map Upload — Setup Report

## What was changed

| File | Change |
|---|---|
| `vite.config.ts` | Added `loadEnv` merge so `POSTHOG_*` vars are readable by the plugin; added `@posthog/rollup-plugin` via the `sourcemapUpload()` guard function |
| `package.json` | Added `@posthog/rollup-plugin` to `dependencies` |
| `pnpm-workspace.yaml` | Set `allowBuilds['@posthog/cli']: true` so the CLI binary is downloaded during install |
| `.env.local` | Added `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_HOST` (local only — never commit) |

## Build command (uploads source maps)

```
pnpm build
```

Source maps are injected and uploaded automatically during every `vite build`. The `deleteAfterUpload: true` option removes `.map` files after upload so they are never served from the origin.

If `POSTHOG_API_KEY` or `POSTHOG_PROJECT_ID` are absent the plugin is skipped with a console warning — the build still succeeds.

## Run command (preview the production build)

```
pnpm preview
```

## Vercel CI — action required before next deploy

This project deploys via Vercel. The `POSTHOG_*` credentials in `.env.local` are gitignored and never reach the Vercel build environment. You must add them as Vercel project environment variables before source maps will upload on deploy.

**Where to add them:**
Vercel Dashboard → your project → **Settings → Environment Variables**

**Variables to add** (values are in your `.env.local` — never commit them):

| Variable | Environment |
|---|---|
| `POSTHOG_API_KEY` | Production (+ Preview if you want maps there too) |
| `POSTHOG_PROJECT_ID` | Production (+ Preview) |
| `POSTHOG_HOST` | Production (+ Preview) |

After saving, trigger a new Vercel deployment and source maps will upload automatically.

## Verify the upload

After running `pnpm build` (locally or on Vercel), go to:

**https://us.posthog.com/project/546900/error_tracking/configuration**

A new symbol set entry should appear. Your production JS files will also contain an injected comment:

```js
//# chunkId=<uuid>
```

That comment is what links a stack frame to the uploaded map.

## Credentials used

- `POSTHOG_API_KEY` — personal API key (Source map upload preset); build-time only
- `POSTHOG_PROJECT_ID` — `546900`
- `POSTHOG_HOST` — `https://us.posthog.com`

Never give `POSTHOG_API_KEY` a `VITE_` prefix — that would inline it into the client bundle.

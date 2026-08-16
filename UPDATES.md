# Outstanding work

Completed and disproven items removed. Delete this file once the rest lands.

## Still to do

### Split the remaining oversized files

A 500-line ceiling is enforced by `pnpm check:size`, with the fifteen files
that already exceeded it recorded in `file-size-baseline.json`. They may only
shrink, and drop out of the baseline as they pass under the limit. Worst first:

| File | Lines |
| --- | --- |
| `src/components/admin/BoardEditor.tsx` | 2115 |
| `api/boards/[id]/run.ts` | 1681 |
| `src/services/portfolioService.ts` | 1669 |
| `src/boards/BoardCanvas.tsx` | 1538 |
| `src/editor/presets.ts` | 1316 |
| `src/components/admin/BoardInsertPanel.tsx` | 1305 |
| `src/boards/BoardItemView.tsx` | 933 |
| `config/nodeTypes.ts` | 923 |
| `src/boards/OpNodeView.tsx` | 793 |
| `api/_lib/boards.ts` | 777 |
| `src/components/admin/DailyChallengePanel.tsx` | 743 |
| `src/components/Admin.tsx` | 679 |
| `src/boards/ShaderControls.tsx` | 675 |
| `src/components/admin/ModelsPanel.tsx` | 598 |
| `src/boards/CanvasMenu.tsx` | 555 |

`presets.ts` and `nodeTypes.ts` are data rather than logic and may be fine as
they are — record them and move on, or split by category.

### Test coverage

There is a suite now (`pnpm test`, real Chromium) but it covers the crop export
and the checkbox only. CodeGraph flags every symbol it returns with "no covering
tests", which is accurate. Worth having before the splits above:

- `applySiteOverrides` / `resolveSite` — a mismatched key silently serves the
  wrong site's branding rather than erroring
- `rowToDto` — every `?? false` / `?? true` fallback is a decision about
  databases that predate a column
- `parseIncomingExif` — drops unusable fields rather than rejecting

### Smaller items

- **`React.memo` on grid items.** Plausible but unmeasured; `memo` is not free
  and photo identity is stable. Measure before applying.
- **`content-visibility: auto`** on photo grid items. Untested, cheap.
- **Bundle.** The shader split took the entry from 1640kB to 845kB. `sonner`
  and the icon set are the next candidates, neither yet measured.
- **Two icon libraries.** `@hugeicons/react` (37 files) and `lucide-react` (13)
  are mixed on the same surfaces in `Lightbox.tsx` and `PagesPanel.tsx`. Their
  stroke weights differ, which reads as a rendering bug side by side.
- **`transition-all`** remains in 8 places, including a link hand-styled as a
  button at `ResetPasswordPage.tsx:153`.
- **`text-wrap`.** No `balance` or `pretty` anywhere in the codebase.

## Done

- **Browser chrome for screenshots** — `photos.show_chrome` / `chrome_url`,
  admin toggle, pinned title bar with the capture scrolling beneath it.
- **`showShader` site setting** — plus the `dallas` / `dallas-images` site-key
  mismatch that made it dead on arrival.
- **Crop export** — `applyTransform` transposed the canvas, silently corrupting
  every crop of a non-square image. Covered by a regression test.
- **Checkbox never toggled** — the input was `sr-only`, so the visible box
  swallowed every click. Covered by a test.
- **Unpublished photos invisible to the admin** — `getPhotos` sent no
  `Authorization` header, so `WHERE ${isAdmin} OR p.is_published` always took
  the visitor branch and a hidden photograph could never be shown again.
- **SWR** — one shared cache entry behind the gallery and the admin, replacing
  a hand-rolled `cyan-photos-changed` event bus. Verified: one fetch on load,
  none on remount.
- **`framer-motion` removed** — the same library as `motion` under an older name.
- **Button rewritten on variants** — 58 of 60 `className` overrides gone.
- **Bundle** — the 3.3MB WebGPU shader runtime no longer ships in the entry
  chunk; it loads only where `showShader` is on.
- **`pnpm dev` fixed** — CodeGraph's daemon socket cannot be watched and was
  taking down both Vite and `vercel dev` at startup.
- **Four components split out of `Admin.tsx`** — 1340 to 679 lines.
- **Migrations** — all three production databases are current through patch 023.

## Disproven

These were in the original audit and do not hold. Recorded so they are not
raised again:

- **"HomePage sequential fetches / waterfall."** The two `useEffect`s were
  independent and already concurrent. The suggested `Promise.all` would have
  been a regression: it couples the decorative pages request to the critical
  photos one, so the gallery cannot paint until both settle.
- **"Inline component definitions in BoardEditor."** `BoardHeaderActions` and
  the rest are declared at module scope. The rule cited targets components
  declared inside another component's render body.
- **"Hoist static JSX — category filter buttons."** They are not static; each
  reads `viewMode` for `aria-pressed` and its class, and binds a handler.
- **"Event listener cleanup."** The listener already returned its
  `removeEventListener`. It has since been deleted along with the event.

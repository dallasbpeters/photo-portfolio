import { Analytics } from "@vercel/analytics/react";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { SiteSettingsProvider } from "./theme/SiteSettingsProvider";

/**
 * Only the gallery ships in the entry bundle.
 *
 * The admin pulls in the CMS editor (TipTap and ProseMirror) and the WebGL
 * darkroom, which together dwarf the public site. Splitting them behind their
 * routes means a visitor looking at photographs never downloads the tools for
 * editing them.
 */
const AdminPage = lazy(() =>
  import("./pages/AdminPage").then((m) => ({ default: m.AdminPage }))
);
const ResetPasswordPage = lazy(() =>
  import("./pages/ResetPasswordPage").then((m) => ({
    default: m.ResetPasswordPage,
  }))
);
const PhotoPage = lazy(() =>
  import("./pages/PhotoPage").then((m) => ({ default: m.PhotoPage }))
);
const ContentPage = lazy(() =>
  import("./pages/ContentPage").then((m) => ({ default: m.ContentPage }))
);

/** Deliberately blank: a spinner that flashes for 80ms reads worse than nothing. */
const RouteFallback = () => (
  <div aria-hidden className="min-h-screen bg-background" />
);

export default function App() {
  return (
    <SiteSettingsProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route element={<HomePage />} path="/" />
            <Route element={<AdminPage />} path="/admin" />
            <Route element={<ResetPasswordPage />} path="/reset-password" />
            <Route element={<PhotoPage />} path="/photo/:id" />
            {/* Last: a CMS slug must never shadow a built-in route. The API also
                refuses reserved slugs, so both ends enforce it. */}
            <Route element={<ContentPage />} path="/:slug" />
          </Routes>
        </Suspense>
        <Analytics />
      </BrowserRouter>
    </SiteSettingsProvider>
  );
}

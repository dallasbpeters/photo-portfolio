import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { HomePage } from './pages/HomePage';
import { SiteSettingsProvider } from './theme/SiteSettingsProvider';

/**
 * Only the gallery ships in the entry bundle.
 *
 * The admin pulls in the CMS editor (TipTap and ProseMirror) and the WebGL
 * darkroom, which together dwarf the public site. Splitting them behind their
 * routes means a visitor looking at photographs never downloads the tools for
 * editing them.
 */
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const ResetPasswordPage = lazy(() =>
  import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const PhotoPage = lazy(() => import('./pages/PhotoPage').then((m) => ({ default: m.PhotoPage })));
const ContentPage = lazy(() =>
  import('./pages/ContentPage').then((m) => ({ default: m.ContentPage })),
);

/** Deliberately blank: a spinner that flashes for 80ms reads worse than nothing. */
const RouteFallback = () => <div className="min-h-screen bg-background" aria-hidden />;

export default function App() {
  return (
    <SiteSettingsProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/photo/:id" element={<PhotoPage />} />
            {/* Last: a CMS slug must never shadow a built-in route. The API also
                refuses reserved slugs, so both ends enforce it. */}
            <Route path="/:slug" element={<ContentPage />} />
          </Routes>
        </Suspense>
        <Analytics />
      </BrowserRouter>
    </SiteSettingsProvider>
  );
}

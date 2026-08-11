import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { Admin, AdminGate } from "../components/Admin";
import { BoardsPanel } from "../components/admin/BoardsPanel";
import { ConfirmProvider } from "../components/admin/ConfirmProvider";
import { PagesPanel } from "../components/admin/PagesPanel";
import { SiteSettingsPanel } from "../components/admin/SiteSettingsPanel";
import { SitesPanel } from "../components/admin/SitesPanel";
import { Button } from "../components/ui/button";
import posthog from "../lib/posthog";
import { authStorage } from "../services/portfolioService";
import { useSiteSettings } from "../theme/SiteSettingsProvider";

/**
 * The admin's sections, each at its own address.
 *
 * They used to be stacked on one page under the photo library, so organising
 * photographs meant scrolling past the moodboards and the site settings, and
 * the settings form sat permanently open underneath the work. Separate routes
 * mean each section is a place you go deliberately, and a link you can keep.
 */
const SECTIONS = [
  { end: true, label: "Photos", to: "/admin" },
  { end: false, label: "Moodboards", to: "/admin/boards" },
  { end: false, label: "Pages", to: "/admin/pages" },
  { end: false, label: "Settings", to: "/admin/settings" },
];

const sectionClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-1 font-medium text-[10px] uppercase tracking-[0.18em] transition-colors sm:text-[11px] ${
    isActive
      ? "border-white text-white"
      : "border-transparent text-white/50 hover:text-white/90"
  }`;

export function AdminPage() {
  const { settings } = useSiteSettings();
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    Boolean(authStorage.getToken())
  );

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const user = authStorage.getUser();
    if (user) {
      posthog.identify(user.id, { email: user.email });
    }
  }, [isAuthenticated]);

  const handleLogin = () => setIsAuthenticated(true);

  const handleLogout = () => {
    posthog.reset();
    authStorage.setToken(null);
    setIsAuthenticated(false);
    toast.message("Signed out");
  };

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <Toaster position="top-center" theme="dark" />
      <nav className="fixed top-0 left-0 z-50 w-full border-white/10 border-b bg-black/80 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
        <div className="mx-auto flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:min-h-20 sm:px-6 sm:py-0">
          <h1 className="truncate font-light text-lg uppercase tracking-[0.25em] sm:text-xl sm:tracking-[0.3em]">
            {settings.shortName} Admin
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              className="inline-flex min-h-11 items-center justify-center px-2 font-medium text-[10px] text-white/90 uppercase tracking-[0.15em] transition-colors hover:text-white sm:text-[11px] sm:tracking-[0.2em]"
              to="/"
            >
              Back to site
            </Link>
            {isAuthenticated ? (
              <Button
                className="flex min-h-11 items-center gap-2 px-2 text-[10px] text-white/90 uppercase tracking-widest hover:text-white"
                onClick={handleLogout}
                type="button"
                variant="ghost"
              >
                <LogOut aria-hidden size={16} />
                Sign out
              </Button>
            ) : null}
          </div>
        </div>

        {/* Hidden until signed in: section links behind a login screen are an
            invitation to a page that will only bounce you back here. */}
        {isAuthenticated ? (
          <div className="mx-auto flex items-center gap-5 overflow-x-auto px-4 sm:gap-7 sm:px-6">
            {SECTIONS.map((section) => (
              <NavLink
                className={sectionClass}
                end={section.end}
                key={section.to}
                to={section.to}
              >
                {section.label}
              </NavLink>
            ))}
          </div>
        ) : null}
      </nav>

      <main className="justify-content-center mx-auto grid w-full grid-cols-1 place-items-center px-4 pt-28 pb-[max(4rem,env(safe-area-inset-bottom,0px))] sm:px-6 sm:pt-36 sm:pb-20">
        <ConfirmProvider>
          <AdminGate isAuthenticated={isAuthenticated} onLogin={handleLogin}>
            <Routes>
              <Route element={<Admin />} index />
              <Route element={<BoardsPanel />} path="boards" />
              <Route element={<PagesPanel />} path="pages" />
              {/* Same component: it reads the slug and opens that page, so the
                  editor has an address you can link to and come back to. */}
              <Route element={<PagesPanel />} path="pages/:slug" />
              <Route
                element={
                  <div className="mx-auto w-full space-y-8 md:space-y-12">
                    <SiteSettingsPanel />
                    <SitesPanel />
                  </div>
                }
                path="settings"
              />
            </Routes>
          </AdminGate>
        </ConfirmProvider>
      </main>
    </div>
  );
}

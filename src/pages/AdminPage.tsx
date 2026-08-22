import "./AdminPage.css";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { Admin, AdminGate } from "../components/Admin";
import { BoardsPanel } from "../components/admin/BoardsPanel";
import { BrandKitsPanel } from "../components/admin/BrandKitsPanel";
import { ChangePasswordForm } from "../components/admin/ChangePasswordForm";
import { CollectionsPanel } from "../components/admin/CollectionsPanel";
import { ConfirmProvider } from "../components/admin/ConfirmProvider";
import { ModelsPanel } from "../components/admin/ModelsPanel";
import { PagesPanel } from "../components/admin/PagesPanel";
import { SiteSettingsPanel } from "../components/admin/SiteSettingsPanel";
import { SitesPanel } from "../components/admin/SitesPanel";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import posthog from "../lib/posthog";
import { authApi, authStorage } from "../services/portfolioService";
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
  { end: false, label: "Collections", to: "/admin/collections" },
  { end: false, label: "Brand kits", to: "/admin/brand-kits" },
  { end: false, label: "Pages", to: "/admin/pages" },
  { end: false, label: "Models", to: "/admin/models" },
  { end: false, label: "Settings", to: "/admin/settings" },
];

const sectionClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? "admin-page__section admin-page__section--current"
    : "admin-page__section";

export function AdminPage() {
  const { settings } = useSiteSettings();
  // A token in storage is only a guess until the server confirms it. Until that
  // check lands, an unchecked token means "checking" rather than "signed in" —
  // otherwise a stale or forged value skips the login screen and leaves a page
  // that 401s on every call.
  const [authState, setAuthState] = useState<"checking" | "signedIn" | "out">(
    () => (authStorage.getToken() ? "checking" : "out")
  );
  const isAuthenticated = authState === "signedIn";

  useEffect(() => {
    if (authState !== "checking") {
      return;
    }
    let cancelled = false;
    void authApi
      .me()
      .then(({ user }) => {
        if (cancelled) {
          return;
        }
        posthog.identify(user.id, { email: user.email });
        setAuthState("signedIn");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        // The stored token is no good — throw it away and ask for a real one.
        authStorage.setToken(null);
        setAuthState("out");
      });
    return () => {
      cancelled = true;
    };
  }, [authState]);

  const handleLogin = () => {
    const user = authStorage.getUser();
    if (user) {
      posthog.identify(user.id, { email: user.email });
      posthog.capture("admin_login_succeeded");
    }
    setAuthState("signedIn");
  };

  const handleLogout = () => {
    posthog.capture("admin_logged_out");
    posthog.reset();
    authStorage.setToken(null);
    setAuthState("out");
    toast.message("Signed out");
  };

  if (authState === "checking") {
    return (
      <div className="page admin-page__checking">
        <p className="admin-page__checking-note">Checking…</p>
      </div>
    );
  }

  return (
    <div className="page admin-page">
      <Toaster position="top-center" theme="dark" />
      <nav className="hairline admin-page__bar">
        <div className="row admin-page__bar-inner row--between">
          <h1 className="admin-page__title">{settings.shortName} Admin</h1>
          <div className="row admin-page__bar-actions">
            <Link className="quiet-link admin-page__back" to="/">
              Back to site
            </Link>
            {isAuthenticated ? (
              <Button onClick={handleLogout} type="button" variant="ghost">
                <LogOut aria-hidden size={16} />
                Sign out
              </Button>
            ) : null}
          </div>
        </div>

        {/* Hidden until signed in: section links behind a login screen are an
            invitation to a page that will only bounce you back here. */}
        {isAuthenticated ? (
          <div className="row admin-page__sections">
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

      <main className="admin-page__main">
        <ConfirmProvider>
          <AdminGate isAuthenticated={isAuthenticated} onLogin={handleLogin}>
            <Routes>
              <Route element={<Admin />} index />
              <Route element={<BoardsPanel />} path="boards" />
              <Route element={<CollectionsPanel />} path="collections" />
              <Route element={<BrandKitsPanel />} path="brand-kits" />
              <Route element={<PagesPanel />} path="pages" />
              <Route element={<ModelsPanel />} path="models" />
              {/* Same component: it reads the slug and opens that page, so the
                  editor has an address you can link to and come back to. */}
              <Route element={<PagesPanel />} path="pages/:slug" />
              <Route
                element={
                  <div className="admin-page__settings">
                    <div className="admin-page__settings-grid">
                      <SiteSettingsPanel />
                      <div className="stack stack--loose">
                        <Card className="admin-page__card">
                          <CardHeader>
                            <CardTitle className="admin-page__card-title">
                              Password
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ChangePasswordForm />
                          </CardContent>
                        </Card>
                        <SitesPanel />
                      </div>
                    </div>
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

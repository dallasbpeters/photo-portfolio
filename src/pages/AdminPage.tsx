import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { Admin } from "../components/Admin";
import { Button } from "../components/ui/button";
import posthog from "../lib/posthog";
import { authStorage } from "../services/portfolioService";
import { useSiteSettings } from "../theme/SiteSettingsProvider";

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
    <div className="min-h-screen bg-black font-sans text-white">
      <Toaster position="top-center" theme="dark" />
      <nav className="fixed top-0 left-0 z-50 w-full border-white/10 border-b bg-black/80 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
        <div className="mx-auto flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:min-h-20 sm:px-6 sm:py-0">
          <h1 className="truncate font-light text-lg uppercase tracking-[0.25em] sm:text-xl sm:tracking-[0.3em]">
            {settings.shortName} Admin
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              className="inline-flex min-h-11 items-center justify-center px-2 font-medium text-[10px] text-white/60 uppercase tracking-[0.15em] transition-colors hover:text-white sm:text-[11px] sm:tracking-[0.2em]"
              to="/"
            >
              Back to site
            </Link>
            {isAuthenticated && (
              <Button
                className="flex min-h-11 items-center gap-2 px-2 text-[10px] text-white/40 uppercase tracking-widest hover:text-white"
                onClick={handleLogout}
                type="button"
                variant="ghost"
              >
                <LogOut aria-hidden size={16} />
                Sign out
              </Button>
            )}
          </div>
        </div>
      </nav>
      <main className="mx-auto w-full px-4 pt-24 pb-[max(4rem,env(safe-area-inset-bottom,0px))] sm:px-6 sm:pt-32 sm:pb-20">
        <Admin
          isAuthenticated={isAuthenticated}
          onLogin={handleLogin}
          onLogout={handleLogout}
        />
      </main>
    </div>
  );
}

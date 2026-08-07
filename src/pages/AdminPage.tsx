import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { LogOut } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Admin } from '../components/Admin';
import { authStorage } from '../services/portfolioService';
import posthog from '../lib/posthog';
import { useSiteSettings } from '../theme/SiteSettingsProvider';

export function AdminPage() {
  const { settings } = useSiteSettings();
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(authStorage.getToken()));

  useEffect(() => {
    if (!isAuthenticated) return;

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
    toast.message('Signed out');
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      <Toaster position="top-center" theme="dark" />
      <nav className="fixed top-0 left-0 w-full z-50 border-b border-white/10 bg-black/80 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
        <div className="mx-auto px-4 sm:px-6 min-h-16 sm:min-h-20 flex items-center justify-between gap-4 py-3 sm:py-0">
          <h1 className="text-lg sm:text-xl font-light tracking-[0.25em] sm:tracking-[0.3em] uppercase truncate">
            {settings.shortName} Admin
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/"
              className="min-h-11 inline-flex items-center justify-center text-[10px] sm:text-[11px] uppercase tracking-[0.15em] sm:tracking-[0.2em] font-medium text-white/60 hover:text-white transition-colors px-2"
            >
              Back to site
            </Link>
            {isAuthenticated && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleLogout}
                className="min-h-11 flex items-center gap-2 text-white/40 hover:text-white uppercase tracking-widest text-[10px] px-2"
              >
                <LogOut size={16} aria-hidden />
                Sign out
              </Button>
            )}
          </div>
        </div>
      </nav>
      <main className="mx-auto w-full px-4 pb-[max(4rem,env(safe-area-inset-bottom,0px))] pt-24 sm:px-6 sm:pb-20 sm:pt-32">
        <Admin isAuthenticated={isAuthenticated} onLogin={handleLogin} onLogout={handleLogout} />
      </main>
    </div>
  );
}

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { authApi, authStorage } from '../services/portfolioService';
import { useSiteSettings } from '../theme/SiteSettingsProvider';

/** Kept in step with MIN_PASSWORD_LENGTH in api/_lib/resetToken.ts. */
const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordPage() {
  const { settings } = useSiteSettings();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();

    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    setIsSubmitting(true);
    try {
      // A successful reset returns a session token, so the user lands in the
      // admin already signed in rather than being asked to log in again.
      const { token: authToken } = await authApi.resetPassword(token, password);
      authStorage.setToken(authToken);
      toast.success('Password updated');
      navigate('/admin', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reset password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans flex flex-col">
      <Toaster position="top-center" theme="dark" />
      <nav className="border-b border-white/10 bg-black/80 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
        <div className="mx-auto px-4 sm:px-6 min-h-16 sm:min-h-20 flex items-center">
          <h1 className="text-lg sm:text-xl font-light tracking-[0.25em] sm:tracking-[0.3em] uppercase truncate">
            {settings.shortName} Admin
          </h1>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 space-y-6">
        {!token ? (
          <>
            <div className="p-5 sm:p-6 bg-white/5 rounded-full border border-white/10">
              <ShieldAlert className="size-10 text-white/20 sm:size-12" aria-hidden />
            </div>
            <h2 className="text-xl sm:text-2xl font-light tracking-[0.25em] uppercase text-center">
              Link not valid
            </h2>
            <p className="text-[11px] text-white/40 uppercase tracking-[0.15em] text-center max-w-sm leading-relaxed">
              This reset link is missing its token. Request a new one from the sign-in page.
            </p>
            <Link
              to="/admin"
              className="min-h-12 inline-flex items-center justify-center border border-white/20 hover:bg-white hover:text-black transition-all duration-500 uppercase tracking-widest text-[10px] px-8"
            >
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <div className="p-5 sm:p-6 bg-white/5 rounded-full border border-white/10">
              <KeyRound className="size-10 text-white/20 sm:size-12" aria-hidden />
            </div>
            <h2 className="text-xl sm:text-2xl font-light tracking-[0.25em] uppercase text-center">
              Choose a new password
            </h2>

            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="w-full max-w-sm space-y-4"
              aria-label="Choose a new password"
            >
              {/* Hidden username field so password managers attach the new
                  credential to the right account. */}
              <input type="hidden" name="username" autoComplete="username" />
              <div className="space-y-2">
                <Label
                  htmlFor="new-password"
                  className="text-[10px] uppercase tracking-widest text-white/40"
                >
                  New password
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoFocus
                  className="min-h-11 text-base bg-black/40 border-white/10 focus:border-white/40 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="confirm-password"
                  className="text-[10px] uppercase tracking-widest text-white/40"
                >
                  Confirm password
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  className="min-h-11 text-base bg-black/40 border-white/10 focus:border-white/40 transition-colors"
                />
              </div>
              <Button
                type="submit"
                disabled={isSubmitting}
                variant="outline"
                className="w-full min-h-12 flex items-center justify-center gap-2 border-white/20 hover:bg-white hover:text-black transition-all duration-500 uppercase tracking-widest text-[10px] px-8 py-3"
              >
                <KeyRound size={16} aria-hidden />
                {isSubmitting ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

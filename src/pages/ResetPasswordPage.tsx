import { KeyRound, ShieldAlert } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { authApi, authStorage } from "../services/portfolioService";
import { useSiteSettings } from "../theme/SiteSettingsProvider";

/** Kept in step with MIN_PASSWORD_LENGTH in api/_lib/resetToken.ts. */
const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordPage() {
  const { settings } = useSiteSettings();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();

    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      // A successful reset returns a session token, so the user lands in the
      // admin already signed in rather than being asked to log in again.
      const { token: authToken } = await authApi.resetPassword(token, password);
      authStorage.setToken(authToken);
      toast.success("Password updated");
      navigate("/admin", { replace: true });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not reset password"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <Toaster position="top-center" theme="dark" />
      <nav className="border-white/10 border-b bg-black/80 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
        <div className="mx-auto flex min-h-16 items-center px-4 sm:min-h-20 sm:px-6">
          <h1 className="truncate font-light text-lg uppercase tracking-[0.25em] sm:text-xl sm:tracking-[0.3em]">
            {settings.shortName} Admin
          </h1>
        </div>
      </nav>

      <main className="flex flex-1 flex-col items-center justify-center space-y-6 px-4 py-16">
        {token ? (
          <>
            <div className="rounded-full border border-white/10 bg-white/5 p-5 sm:p-6">
              <KeyRound
                aria-hidden
                className="size-10 text-white/90 sm:size-12"
              />
            </div>
            <h2 className="text-center font-light text-xl uppercase tracking-[0.25em] sm:text-2xl">
              Choose a new password
            </h2>

            <form
              aria-label="Choose a new password"
              className="w-full max-w-sm space-y-4"
              onSubmit={(e) => void handleSubmit(e)}
            >
              {/* Hidden username field so password managers attach the new
                  credential to the right account. */}
              <input autoComplete="username" name="username" type="hidden" />
              <div className="space-y-2">
                <Label
                  className="text-[10px] text-white/90 uppercase tracking-widest"
                  htmlFor="new-password"
                >
                  New password
                </Label>
                <Input
                  autoComplete="new-password"
                  autoFocus
                  className="min-h-11 border-white/10 bg-black/40 text-base transition-colors focus:border-white/40"
                  id="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </div>
              <div className="space-y-2">
                <Label
                  className="text-[10px] text-white/90 uppercase tracking-widest"
                  htmlFor="confirm-password"
                >
                  Confirm password
                </Label>
                <Input
                  autoComplete="new-password"
                  className="min-h-11 border-white/10 bg-black/40 text-base transition-colors focus:border-white/40"
                  id="confirm-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  type="password"
                  value={confirm}
                />
              </div>
              <Button
                className="flex min-h-12 w-full items-center justify-center gap-2 border-white/20 px-8 py-3 text-[10px] uppercase tracking-widest transition-all duration-500 hover:bg-white hover:text-black"
                disabled={isSubmitting}
                type="submit"
                variant="outline"
              >
                <KeyRound aria-hidden size={16} />
                {isSubmitting ? "Updating…" : "Update password"}
              </Button>
            </form>
          </>
        ) : (
          <>
            <div className="rounded-full border border-white/10 bg-white/5 p-5 sm:p-6">
              <ShieldAlert
                aria-hidden
                className="size-10 text-white/90 sm:size-12"
              />
            </div>
            <h2 className="text-center font-light text-xl uppercase tracking-[0.25em] sm:text-2xl">
              Link not valid
            </h2>
            <p className="max-w-sm text-center text-[11px] text-white/90 uppercase leading-relaxed tracking-[0.15em]">
              This reset link is missing its token. Request a new one from the
              sign-in page.
            </p>
            <Link
              className="inline-flex min-h-12 items-center justify-center border border-white/20 px-8 text-[10px] uppercase tracking-widest transition-all duration-500 hover:bg-white hover:text-black"
              to="/admin"
            >
              Go to sign in
            </Link>
          </>
        )}
      </main>
    </div>
  );
}

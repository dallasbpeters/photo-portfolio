import "./ResetPasswordPage.css";
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
    <div className="page reset-password-page">
      <Toaster position="top-center" theme="dark" />
      <nav className="hairline reset-password-page__bar">
        <div className="row reset-password-page__bar-inner">
          <h1 className="reset-password-page__title">
            {settings.shortName} Admin
          </h1>
        </div>
      </nav>

      <main className="stack reset-password-page__main">
        {token ? (
          <>
            <div className="hairline reset-password-page__medallion">
              <KeyRound aria-hidden className="reset-password-page__icon" />
            </div>
            <h2 className="reset-password-page__heading">
              Choose a new password
            </h2>

            <form
              aria-label="Choose a new password"
              className="stack reset-password-page__form"
              onSubmit={(e) => void handleSubmit(e)}
            >
              {/* Hidden username field so password managers attach the new
                  credential to the right account. */}
              <input autoComplete="username" name="username" type="hidden" />
              <div className="stack stack--tight">
                <Label
                  className="label reset-password-page__label"
                  htmlFor="new-password"
                >
                  New password
                </Label>
                <Input
                  autoComplete="new-password"
                  autoFocus
                  className="hairline reset-password-page__input"
                  id="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </div>
              <div className="stack stack--tight">
                <Label
                  className="label reset-password-page__label"
                  htmlFor="confirm-password"
                >
                  Confirm password
                </Label>
                <Input
                  autoComplete="new-password"
                  className="hairline reset-password-page__input"
                  id="confirm-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  type="password"
                  value={confirm}
                />
              </div>
              <Button
                disabled={isSubmitting}
                fullWidth
                size="lg"
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
            <div className="hairline reset-password-page__medallion">
              <ShieldAlert aria-hidden className="reset-password-page__icon" />
            </div>
            <h2 className="reset-password-page__heading">Link not valid</h2>
            <p className="reset-password-page__note">
              This reset link is missing its token. Request a new one from the
              sign-in page.
            </p>
            <Link className="label reset-password-page__cta" to="/admin">
              Go to sign in
            </Link>
          </>
        )}
      </main>
    </div>
  );
}

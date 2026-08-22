import { HugeiconsIcon } from "@hugeicons/react";
import { Login02Icon, Shield01Icon } from "@hugeicons-pro/core-stroke-standard";
import type { AdminLoginResult } from "../../hooks/useAdminLogin";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { GoogleSignInButton } from "./GoogleSignInButton";
import "../../styles/adminChrome.css";

// ── Login screen ──────────────────────────────────────────────────────────────

interface LoginScreenProps {
  login: AdminLoginResult;
  onForgotPassword: () => void;
  onSignedIn: () => void;
}

export const LoginScreen = ({
  login,
  onForgotPassword,
  onSignedIn,
}: LoginScreenProps) => (
  <div className="admin-gate">
    <div className="admin-gate__badge">
      <HugeiconsIcon icon={Shield01Icon} size={72} />
    </div>
    <h2 className="admin-gate__title">Admin Access</h2>
    <p className="admin-gate__note">Sign in with your email and password.</p>
    <form
      aria-label="Admin sign in"
      className="admin-gate__form stack"
      onSubmit={(e) => void login.handleLogin(e)}
    >
      <div className="stack stack--tight">
        <Label className="admin-caps" htmlFor="admin-email">
          Email
        </Label>
        <Input
          autoComplete="username"
          className="admin-control admin-control--touch"
          id="admin-email"
          onChange={(e) => login.setEmail(e.target.value)}
          required
          type="email"
          value={login.email}
        />
      </div>
      <div className="stack stack--tight">
        <Label className="admin-caps" htmlFor="admin-password">
          Password
        </Label>
        <Input
          autoComplete="current-password"
          className="admin-control admin-control--touch"
          id="admin-password"
          onChange={(e) => login.setPassword(e.target.value)}
          required
          type="password"
          value={login.password}
        />
      </div>
      <Button
        disabled={login.isSubmitting}
        fullWidth
        size="lg"
        type="submit"
        variant="outline"
      >
        <HugeiconsIcon icon={Login02Icon} size={16} />
        {login.isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
      <Button fullWidth onClick={onForgotPassword} type="button">
        Forgot password?
      </Button>
    </form>
    <GoogleSignInButton onSignedIn={onSignedIn} />
  </div>
);

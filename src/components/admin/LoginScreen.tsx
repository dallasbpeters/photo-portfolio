import { HugeiconsIcon } from "@hugeicons/react";
import { Login02Icon, Shield01Icon } from "@hugeicons-pro/core-stroke-standard";
import type { AdminLoginResult } from "../../hooks/useAdminLogin";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { GoogleSignInButton } from "./GoogleSignInButton";

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
  <div className="flex min-h-[min(70dvh,32rem)] w-full flex-col items-center justify-center space-y-6 px-2">
    <div className="rounded-full border border-white/10 bg-white/5 p-5 sm:p-6">
      <HugeiconsIcon icon={Shield01Icon} size={72} />
    </div>
    <h2 className="text-center font-light text-xl uppercase tracking-[0.25em] sm:text-2xl sm:tracking-[0.3em]">
      Admin Access
    </h2>
    <p className="max-w-sm px-2 text-center text-[10px] text-white/90 uppercase tracking-[0.2em]">
      Sign in with your email and password.
    </p>
    <form
      aria-label="Admin sign in"
      className="w-full max-w-sm space-y-4"
      onSubmit={(e) => void login.handleLogin(e)}
    >
      <div className="space-y-2">
        <Label
          className="text-[10px] text-white/90 uppercase tracking-widest"
          htmlFor="admin-email"
        >
          Email
        </Label>
        <Input
          autoComplete="username"
          className="min-h-11 border-white/10 bg-black/40 text-base transition-colors focus:border-white/40"
          id="admin-email"
          onChange={(e) => login.setEmail(e.target.value)}
          required
          type="email"
          value={login.email}
        />
      </div>
      <div className="space-y-2">
        <Label
          className="text-[10px] text-white/90 uppercase tracking-widest"
          htmlFor="admin-password"
        >
          Password
        </Label>
        <Input
          autoComplete="current-password"
          className="min-h-11 border-white/10 bg-black/40 text-base transition-colors focus:border-white/40"
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

import { useState } from "react";
import { toast } from "sonner";
import { authApi } from "../../services/portfolioService";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

/** Mirrors MIN_PASSWORD_LENGTH in api/_lib/resetToken.ts. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Changing the password of the account you are signed in as.
 *
 * Separate from the reset flow (which needs no session): this is for a logged-in
 * user who simply wants a new password. The current one is required so a leaked
 * session cannot change the credential on its own.
 */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("The new passwords do not match");
      return;
    }
    setIsSubmitting(true);
    try {
      await authApi.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not change password"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={(e) => void handleSubmit(e)}>
      <Label className="block">
        <span className="mb-1 block text-[10px] text-white/50 uppercase tracking-[0.18em]">
          Current password
        </span>
        <Input
          autoComplete="current-password"
          onChange={(e) => setCurrent(e.target.value)}
          required
          type="password"
          value={current}
        />
      </Label>
      <Label className="block">
        <span className="mb-1 block text-[10px] text-white/50 uppercase tracking-[0.18em]">
          New password
        </span>
        <Input
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          onChange={(e) => setNext(e.target.value)}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          required
          type="password"
          value={next}
        />
      </Label>
      <Label className="block">
        <span className="mb-1 block text-[10px] text-white/50 uppercase tracking-[0.18em]">
          Confirm new password
        </span>
        <Input
          autoComplete="new-password"
          onChange={(e) => setConfirm(e.target.value)}
          required
          type="password"
          value={confirm}
        />
      </Label>
      <Button
        className="min-h-11 w-full text-[10px] uppercase tracking-widest"
        disabled={
          isSubmitting || !current || !next || next.length < MIN_PASSWORD_LENGTH
        }
        type="submit"
      >
        {isSubmitting ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}

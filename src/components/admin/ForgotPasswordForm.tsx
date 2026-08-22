import { ArrowLeft, Mail } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { authApi } from "../../services/portfolioService";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import "../../styles/adminChrome.css";

interface ForgotPasswordFormProps {
  /** Prefills the field with whatever was already typed on the sign-in form. */
  initialEmail?: string;
  onBack: () => void;
}

export function ForgotPasswordForm({
  initialEmail = "",
  onBack,
}: ForgotPasswordFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { message } = await authApi.requestPasswordReset(email);
      // The API never confirms whether the address exists, so the UI must not
      // imply it did — show the neutral message and the address as typed.
      setSentTo(email.trim().toLowerCase());
      toast.success(message);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not send reset email"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (sentTo) {
    return (
      <div className="admin-gate">
        <div className="admin-gate__badge">
          <Mail aria-hidden className="admin-gate__icon" />
        </div>
        <h2 className="admin-gate__title">Check your email</h2>
        <p className="admin-gate__note admin-gate__note--relaxed">
          If {sentTo} has an account, a reset link is on its way. It expires in
          one hour.
        </p>
        <Button onClick={onBack} size="lg" type="button" variant="outline">
          <ArrowLeft aria-hidden size={16} />
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="admin-gate">
      <div className="admin-gate__badge">
        <Mail aria-hidden className="admin-gate__icon" />
      </div>
      <h2 className="admin-gate__title">Reset password</h2>
      <p className="admin-gate__note">
        We'll email you a link to choose a new one.
      </p>
      <form
        aria-label="Request password reset"
        className="admin-gate__form stack"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="stack stack--tight">
          <Label className="admin-caps" htmlFor="reset-email">
            Email
          </Label>
          <Input
            autoComplete="username"
            autoFocus
            className="admin-control admin-control--touch"
            id="reset-email"
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
        </div>
        <Button
          disabled={isSubmitting}
          fullWidth
          size="lg"
          type="submit"
          variant="outline"
        >
          <Mail aria-hidden size={16} />
          {isSubmitting ? "Sending…" : "Send reset link"}
        </Button>
        <button className="admin-gate__aside" onClick={onBack} type="button">
          Back to sign in
        </button>
      </form>
    </div>
  );
}

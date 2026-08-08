import { ArrowLeft, Mail } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { authApi } from "../../services/portfolioService";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

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
      <div className="flex min-h-[min(70dvh,32rem)] w-full flex-col items-center justify-center space-y-6 px-2">
        <div className="rounded-full border border-white/10 bg-white/5 p-5 sm:p-6">
          <Mail aria-hidden className="size-10 text-white/90 sm:size-12" />
        </div>
        <h2 className="text-center font-light text-xl uppercase tracking-[0.25em] sm:text-2xl sm:tracking-[0.3em]">
          Check your email
        </h2>
        <p className="max-w-sm px-2 text-center text-[11px] text-white/90 uppercase leading-relaxed tracking-[0.15em]">
          If {sentTo} has an account, a reset link is on its way. It expires in
          one hour.
        </p>
        <Button
          className="flex min-h-12 items-center justify-center gap-2 border-white/20 px-8 py-3 text-[10px] uppercase tracking-widest transition-all duration-500 hover:bg-white hover:text-black"
          onClick={onBack}
          type="button"
          variant="outline"
        >
          <ArrowLeft aria-hidden size={16} />
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[min(70dvh,32rem)] w-full flex-col items-center justify-center space-y-6 px-2">
      <div className="rounded-full border border-white/10 bg-white/5 p-5 sm:p-6">
        <Mail aria-hidden className="size-10 text-white/90 sm:size-12" />
      </div>
      <h2 className="text-center font-light text-xl uppercase tracking-[0.25em] sm:text-2xl sm:tracking-[0.3em]">
        Reset password
      </h2>
      <p className="max-w-sm px-2 text-center text-[10px] text-white/90 uppercase tracking-[0.2em]">
        We'll email you a link to choose a new one.
      </p>
      <form
        aria-label="Request password reset"
        className="w-full max-w-sm space-y-4"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="space-y-2">
          <Label
            className="text-[10px] text-white/90 uppercase tracking-widest"
            htmlFor="reset-email"
          >
            Email
          </Label>
          <Input
            autoComplete="username"
            autoFocus
            className="min-h-11 border-white/10 bg-black/40 text-base transition-colors focus:border-white/40"
            id="reset-email"
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
        </div>
        <Button
          className="flex min-h-12 w-full items-center justify-center gap-2 border-white/20 px-8 py-3 text-[10px] uppercase tracking-widest transition-all duration-500 hover:bg-white hover:text-black"
          disabled={isSubmitting}
          type="submit"
          variant="outline"
        >
          <Mail aria-hidden size={16} />
          {isSubmitting ? "Sending…" : "Send reset link"}
        </Button>
        <button
          className="min-h-11 w-full text-[10px] text-white/90 uppercase tracking-[0.2em] transition-colors hover:text-white"
          onClick={onBack}
          type="button"
        >
          Back to sign in
        </button>
      </form>
    </div>
  );
}

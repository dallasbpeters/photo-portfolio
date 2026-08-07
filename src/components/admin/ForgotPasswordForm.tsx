import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { authApi } from '../../services/portfolioService';

interface ForgotPasswordFormProps {
  /** Prefills the field with whatever was already typed on the sign-in form. */
  initialEmail?: string;
  onBack: () => void;
}

export function ForgotPasswordForm({ initialEmail = '', onBack }: ForgotPasswordFormProps) {
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
      toast.error(err instanceof Error ? err.message : 'Could not send reset email');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (sentTo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[min(70dvh,32rem)] w-full px-2 space-y-6">
        <div className="p-5 sm:p-6 bg-white/5 rounded-full border border-white/10">
          <Mail className="size-10 text-white/20 sm:size-12" aria-hidden />
        </div>
        <h2 className="text-xl sm:text-2xl font-light tracking-[0.25em] sm:tracking-[0.3em] uppercase text-center">
          Check your email
        </h2>
        <p className="text-[11px] text-white/40 uppercase tracking-[0.15em] text-center max-w-sm px-2 leading-relaxed">
          If {sentTo} has an account, a reset link is on its way. It expires in one hour.
        </p>
        <Button
          type="button"
          onClick={onBack}
          variant="outline"
          className="min-h-12 flex items-center justify-center gap-2 border-white/20 hover:bg-white hover:text-black transition-all duration-500 uppercase tracking-widest text-[10px] px-8 py-3"
        >
          <ArrowLeft size={16} aria-hidden />
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[min(70dvh,32rem)] w-full px-2 space-y-6">
      <div className="p-5 sm:p-6 bg-white/5 rounded-full border border-white/10">
        <Mail className="size-10 text-white/20 sm:size-12" aria-hidden />
      </div>
      <h2 className="text-xl sm:text-2xl font-light tracking-[0.25em] sm:tracking-[0.3em] uppercase text-center">
        Reset password
      </h2>
      <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] text-center max-w-sm px-2">
        We'll email you a link to choose a new one.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} className="w-full max-w-sm space-y-4" aria-label="Request password reset">
        <div className="space-y-2">
          <Label htmlFor="reset-email" className="text-[10px] uppercase tracking-widest text-white/40">
            Email
          </Label>
          <Input
            id="reset-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="min-h-11 text-base bg-black/40 border-white/10 focus:border-white/40 transition-colors"
          />
        </div>
        <Button
          type="submit"
          disabled={isSubmitting}
          variant="outline"
          className="w-full min-h-12 flex items-center justify-center gap-2 border-white/20 hover:bg-white hover:text-black transition-all duration-500 uppercase tracking-widest text-[10px] px-8 py-3"
        >
          <Mail size={16} aria-hidden />
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </Button>
        <button
          type="button"
          onClick={onBack}
          className="w-full min-h-11 text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white transition-colors"
        >
          Back to sign in
        </button>
      </form>
    </div>
  );
}

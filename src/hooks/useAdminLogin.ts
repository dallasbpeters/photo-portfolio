import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { authApi, authStorage } from "../services/portfolioService";

export interface AdminLoginResult {
  email: string;
  handleLogin: (e: FormEvent) => Promise<void>;
  isSubmitting: boolean;
  password: string;
  setEmail: (e: string) => void;
  setPassword: (p: string) => void;
}

export const useAdminLogin = (onLogin: () => void): AdminLoginResult => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { token } = await authApi.login(email, password);
      authStorage.setToken(token);
      setPassword("");
      toast.success("Signed in");
      onLogin();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return { email, handleLogin, isSubmitting, password, setEmail, setPassword };
};

import { useState } from "react";
import { toast } from "sonner";
import type { DailyChallengeInfo } from "../types";
import {
  canUseNotifications,
  maybeFireDailyNotification,
} from "./useTodayChallenge";

const LS_NOTIFY = "cyan_daily_challenge_notify";

export interface ChallengeNotificationsState {
  enabled: boolean;
  perm: NotificationPermission | "unsupported";
  toggle: (challenge: DailyChallengeInfo | null) => Promise<void>;
}

export const useChallengeNotifications = (): ChallengeNotificationsState => {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_NOTIFY) === "1";
    } catch {
      return false;
    }
  });

  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    () => (canUseNotifications() ? Notification.permission : "unsupported")
  );

  const toggle = async (
    challenge: DailyChallengeInfo | null
  ): Promise<void> => {
    if (!canUseNotifications()) {
      toast.message(
        "Notifications need HTTPS (or localhost) and a supported browser."
      );
      return;
    }
    if (enabled) {
      try {
        localStorage.removeItem(LS_NOTIFY);
      } catch {
        /* ignore */
      }
      setEnabled(false);
      toast.message("Daily reminders off");
      return;
    }
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p !== "granted") {
      toast.error("Notification permission denied");
      return;
    }
    try {
      localStorage.setItem(LS_NOTIFY, "1");
    } catch {
      /* ignore */
    }
    setEnabled(true);
    toast.success(
      "You'll get a browser notification when a new day's challenge loads (when you open Admin)."
    );
    if (challenge) {
      maybeFireDailyNotification(challenge);
    }
  };

  return { enabled, perm, toggle };
};

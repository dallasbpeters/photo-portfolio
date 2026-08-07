import { useCallback, useEffect, useState } from 'react';
import type { DailyChallengeInfo, DailyChallengeJournal } from '../types';
import { portfolioService } from '../services/portfolioService';
import { toast } from 'sonner';
import { site } from '../site';

// Storage keys stay literal: they are already scoped per origin, and renaming
// them would sign existing admins out of a site that is live.
const LS_NOTIFY = 'cyan_daily_challenge_notify';
const LS_LAST_NOTIFIED = 'cyan_daily_challenge_last_notify_date';

export const canUseNotifications = (): boolean =>
  typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext;

export const maybeFireDailyNotification = (challenge: DailyChallengeInfo): void => {
  if (!canUseNotifications()) return;
  try {
    if (localStorage.getItem(LS_NOTIFY) !== '1') return;
    if (Notification.permission !== 'granted') return;
    const dateKey = challenge.challengeDate;
    if (localStorage.getItem(LS_LAST_NOTIFIED) === dateKey) return;
    new Notification("Today's photo challenge", {
      body: `Open ${site.shortName} Admin to see today's inspiration and jot your thoughts.`,
      icon: `/sites/${site.key}/icon512_rounded.png`,
      tag: `cyan-challenge-${dateKey}`,
    });
    localStorage.setItem(LS_LAST_NOTIFIED, dateKey);
  } catch { /* ignore */ }
};

export type TodayChallengeState = {
  challenge: DailyChallengeInfo | null;
  journal: DailyChallengeJournal | null;
  thoughts: string;
  setThoughts: (t: string) => void;
  loading: boolean;
  saving: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** Saves today's journal. Returns the saved entry so the caller can sync history. */
  saveJournal: (thoughts: string) => Promise<DailyChallengeJournal | null>;
  /** Sync journal state from an external source (e.g. a history edit). */
  syncJournal: (journal: DailyChallengeJournal | null) => void;
};

export const useTodayChallenge = (): TodayChallengeState => {
  const [challenge, setChallenge] = useState<DailyChallengeInfo | null>(null);
  const [journal, setJournal] = useState<DailyChallengeJournal | null>(null);
  const [thoughts, setThoughts] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await portfolioService.getDailyChallenge();
      setChallenge(data.challenge);
      setJournal(data.journal);
      setThoughts(data.journal?.body ?? '');
      maybeFireDailyNotification(data.challenge);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load daily challenge');
      setChallenge(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!canUseNotifications()) return;
    const onVis = () => {
      if (document.visibilityState === 'visible' && challenge) {
        maybeFireDailyNotification(challenge);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [challenge]);

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      const data = await portfolioService.refreshDailyChallenge();
      setChallenge(data.challenge);
      setJournal(data.journal);
      setThoughts((prev) => (data.journal ? data.journal.body : prev));
      toast.success('New inspiration loaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not refresh photo');
    } finally {
      setRefreshing(false);
    }
  };

  const saveJournal = async (currentThoughts: string): Promise<DailyChallengeJournal | null> => {
    setSaving(true);
    try {
      const saved = await portfolioService.saveDailyChallengeJournal(currentThoughts);
      setJournal(saved);
      toast.success('Journal saved');
      return saved;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const syncJournal = (next: DailyChallengeJournal | null): void => {
    setJournal(next);
    setThoughts(next?.body ?? '');
  };

  return { challenge, journal, thoughts, setThoughts, loading, saving, refreshing, refresh, saveJournal, syncJournal };
};

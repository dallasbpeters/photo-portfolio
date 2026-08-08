import { useCallback, useState } from "react";
import { toast } from "sonner";
import { portfolioService } from "../services/portfolioService";
import type {
  DailyChallengeHistoryEntry,
  DailyChallengeJournal,
} from "../types";

export interface ChallengeHistoryState {
  entries: DailyChallengeHistoryEntry[];
  load: () => Promise<void>;
  loaded: boolean;
  loading: boolean;
  /** Remove an entry after its journal is deleted. */
  removeEntry: (date: string) => void;
  /** Update a single entry's journal after a save (from history or today view). */
  syncEntry: (date: string, journal: DailyChallengeJournal) => void;
}

export const useChallengeHistory = (): ChallengeHistoryState => {
  const [entries, setEntries] = useState<DailyChallengeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (loaded) {
      return;
    }
    setLoading(true);
    try {
      const data = await portfolioService.getDailyChallengeHistory();
      setEntries(data);
      setLoaded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load history");
    } finally {
      setLoading(false);
    }
  }, [loaded]);

  const syncEntry = (date: string, journal: DailyChallengeJournal): void => {
    setEntries((prev) =>
      prev.map((h) =>
        h.challenge.challengeDate === date ? { ...h, journal } : h
      )
    );
  };

  const removeEntry = (date: string): void => {
    setEntries((prev) =>
      prev.filter((h) => h.challenge.challengeDate !== date)
    );
  };

  return { entries, load, loaded, loading, removeEntry, syncEntry };
};

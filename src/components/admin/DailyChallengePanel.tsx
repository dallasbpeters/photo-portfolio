import {
  Bell,
  BellOff,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type ChallengeHistoryState,
  useChallengeHistory,
} from "../../hooks/useChallengeHistory";
import {
  type ChallengeNotificationsState,
  useChallengeNotifications,
} from "../../hooks/useChallengeNotifications";
import {
  canUseNotifications,
  type TodayChallengeState,
  useTodayChallenge,
} from "../../hooks/useTodayChallenge";
import { portfolioService } from "../../services/portfolioService";
import type {
  DailyChallengeHistoryEntry,
  DailyChallengeInfo,
  DailyChallengeJournal,
} from "../../types";
import { OptimizedImage } from "../OptimizedImage";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { useConfirm } from "./ConfirmProvider";

// ─── Utilities ────────────────────────────────────────────────────────────────

const EXCERPT_MAX = 80;

const formatDate = (iso: string): string => {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    weekday: "short",
    year: "numeric",
  });
};

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback;

const toExcerpt = (body: string): string =>
  body.length > EXCERPT_MAX ? `${body.slice(0, EXCERPT_MAX)}…` : body;

// ─── History entry ────────────────────────────────────────────────────────────

interface HistoryEntryProps {
  entry: DailyChallengeHistoryEntry;
  isToday: boolean;
  onDeleted: (date: string) => void;
  onSaved: (date: string, journal: DailyChallengeJournal) => void;
}

interface JournalEntryState {
  deleting: boolean;
  handleDelete: () => Promise<void>;
  handleSave: (e: React.FormEvent) => Promise<void>;
  saving: boolean;
  setText: (t: string) => void;
  text: string;
}

const useJournalEntry = (
  entry: DailyChallengeHistoryEntry,
  onSaved: HistoryEntryProps["onSaved"],
  onDeleted: HistoryEntryProps["onDeleted"]
): JournalEntryState => {
  const { confirm } = useConfirm();
  const [text, setText] = useState(entry.journal?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  React.useEffect(() => {
    setText(entry.journal?.body ?? "");
  }, [entry.journal?.body]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await portfolioService.saveDailyChallengeJournalForDate(
        entry.challenge.challengeDate,
        text
      );
      onSaved(entry.challenge.challengeDate, saved);
      toast.success("Journal saved");
    } catch (err) {
      toast.error(errorMessage(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      confirmLabel: "Delete",
      description: "The entry for this day is removed. This cannot be undone.",
      destructive: true,
      title: "Delete this journal entry?",
    });
    if (!ok) {
      return;
    }
    setDeleting(true);
    try {
      await portfolioService.deleteJournalEntry(entry.challenge.challengeDate);
      setText("");
      onDeleted(entry.challenge.challengeDate);
      toast.success("Journal entry deleted");
    } catch (err) {
      toast.error(errorMessage(err, "Delete failed"));
    } finally {
      setDeleting(false);
    }
  };

  return { deleting, handleDelete, handleSave, saving, setText, text };
};

const HistoryEntryHeader = ({
  entry,
  isToday,
  onToggle,
  open,
}: {
  entry: DailyChallengeHistoryEntry;
  isToday: boolean;
  onToggle: () => void;
  open: boolean;
}) => {
  const excerpt = entry.journal?.body?.trim();
  const thumb = entry.challenge.imageThumbUrl ?? entry.challenge.imageUrl;

  return (
    <button
      aria-expanded={open}
      className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-white/5"
      onClick={onToggle}
      type="button"
    >
      <OptimizedImage
        alt={entry.challenge.altText || ""}
        className="size-12 shrink-0 rounded object-cover opacity-80"
        referrerPolicy="no-referrer"
        sizes="48px"
        src={thumb}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[10px] text-white/90 uppercase tracking-widest">
          {isToday ? (
            <span className="inline-block size-1.5 shrink-0 rounded-full bg-amber-300/80" />
          ) : null}
          {formatDate(entry.challenge.challengeDate)}
        </p>
        <p className="mt-0.5 truncate text-white/90 text-xs">
          {excerpt ? (
            toExcerpt(excerpt)
          ) : (
            <span className="italic">No notes yet</span>
          )}
        </p>
      </div>
      {open ? (
        <ChevronUp aria-hidden className="shrink-0 text-white/90" size={14} />
      ) : (
        <ChevronDown aria-hidden className="shrink-0 text-white/90" size={14} />
      )}
    </button>
  );
};

const JournalSavedAt = ({
  journal,
}: {
  // The API returns null for a day with no entry, not undefined.
  journal?: DailyChallengeJournal | null;
}) => {
  if (!journal?.updatedAt) {
    return null;
  }
  return (
    <span className="ml-2">
      · Saved {new Date(journal.updatedAt).toLocaleString()}
    </span>
  );
};

const JournalForm = ({
  entry,
  journal,
}: {
  entry: DailyChallengeHistoryEntry;
  journal: JournalEntryState;
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => void journal.handleSave(e)}
    >
      <Label
        className="text-[10px] text-white/90 uppercase tracking-widest"
        htmlFor={`journal-${entry.challenge.challengeDate}`}
      >
        Your thoughts
      </Label>
      <textarea
        className={cn(
          "w-full resize-y rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white",
          "placeholder:text-white/80 focus:border-white/35 focus:outline-none focus:ring-1 focus:ring-white/15"
        )}
        id={`journal-${entry.challenge.challengeDate}`}
        maxLength={20_000}
        onChange={(e) => journal.setText(e.target.value)}
        placeholder="Lighting, composition, story, what you'd try…"
        ref={textareaRef}
        rows={6}
        value={journal.text}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[9px] text-white/80">
          {journal.text.length.toLocaleString()} / 20,000
          <JournalSavedAt journal={entry.journal} />
        </p>
        <div className="flex items-center gap-2">
          {entry.journal ? (
            <Button
              aria-label="Delete journal entry"
              disabled={journal.deleting}
              onClick={() => void journal.handleDelete()}
              size="sm"
              tone="danger"
              type="button"
              variant="ghost"
            >
              <Trash2 aria-hidden size={12} />
              {journal.deleting ? "Deleting…" : "Delete"}
            </Button>
          ) : null}
          <Button
            disabled={journal.saving}
            size="sm"
            type="submit"
            variant="outline"
          >
            {journal.saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
};

const PhotographerCredit = ({
  challenge,
}: {
  challenge: DailyChallengeInfo;
}) => {
  if (!challenge.photographerName) {
    return null;
  }
  return (
    <span>
      Photo by{" "}
      {challenge.photographerUsername ? (
        <a
          className="text-white/55 underline-offset-2 hover:text-white hover:underline"
          href={`https://unsplash.com/@${challenge.photographerUsername}`}
          rel="noreferrer noopener"
          target="_blank"
        >
          {challenge.photographerName}
        </a>
      ) : (
        challenge.photographerName
      )}{" "}
      on Unsplash
    </span>
  );
};

const HistoryEntryCredits = ({
  challenge,
}: {
  challenge: DailyChallengeInfo;
}) => {
  if (!(challenge.photographerName || challenge.unsplashHtmlLink)) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-white/90">
      <PhotographerCredit challenge={challenge} />
      {challenge.unsplashHtmlLink ? (
        <a
          className="inline-flex items-center gap-0.5 text-white/90 hover:text-white"
          href={challenge.unsplashHtmlLink}
          rel="noreferrer noopener"
          target="_blank"
        >
          <ExternalLink aria-hidden size={10} />
          View
        </a>
      ) : null}
    </div>
  );
};

const HistoryEntryDetails = ({
  entry,
  journal,
}: {
  entry: DailyChallengeHistoryEntry;
  journal: JournalEntryState;
}) => (
  <div className="space-y-3 border-white/8 border-t bg-black/20 p-3">
    <div className="grid items-start gap-4 sm:grid-cols-[160px_1fr]">
      <a
        aria-label="Open photo on Unsplash"
        className="block overflow-hidden rounded border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        href={entry.challenge.unsplashHtmlLink ?? "#"}
        rel="noreferrer noopener"
        target="_blank"
      >
        <OptimizedImage
          alt={entry.challenge.altText || "Challenge photo"}
          className="aspect-5/3 w-full object-cover opacity-90 transition-opacity hover:opacity-100"
          referrerPolicy="no-referrer"
          sizes="(min-width: 1024px) 420px, 90vw"
          src={entry.challenge.imageThumbUrl ?? entry.challenge.imageUrl}
        />
      </a>

      <JournalForm entry={entry} journal={journal} />
    </div>

    <HistoryEntryCredits challenge={entry.challenge} />
  </div>
);

const HistoryEntry = ({
  entry,
  isToday,
  onSaved,
  onDeleted,
}: HistoryEntryProps) => {
  const [open, setOpen] = useState(false);
  const journal = useJournalEntry(entry, onSaved, onDeleted);

  return (
    <div className="overflow-hidden rounded-lg border border-white/8">
      <HistoryEntryHeader
        entry={entry}
        isToday={isToday}
        onToggle={() => setOpen((o) => !o)}
        open={open}
      />

      {open ? <HistoryEntryDetails entry={entry} journal={journal} /> : null}
    </div>
  );
};

// ─── Main panel ──────────────────────────────────────────────────────────────

type View = "today" | "history";

const TodayActions = ({
  notifs,
  today,
}: {
  notifs: ChallengeNotificationsState;
  today: TodayChallengeState;
}) => (
  <>
    <Button
      aria-label="Load a different inspiration photo"
      disabled={today.loading || today.refreshing || !today.challenge}
      onClick={() => void today.refresh()}
      size="sm"
      type="button"
      variant="outline"
    >
      <RefreshCw
        aria-hidden
        className={today.refreshing ? "animate-spin" : ""}
        size={14}
      />
      {today.refreshing ? "Loading…" : "New photo"}
    </Button>

    {canUseNotifications() ? (
      <Button
        aria-pressed={notifs.enabled}
        onClick={() => void notifs.toggle(today.challenge)}
        size="sm"
        type="button"
        variant="outline"
      >
        {notifs.enabled ? (
          <BellOff aria-hidden size={14} />
        ) : (
          <Bell aria-hidden size={14} />
        )}
        {notifs.enabled ? "Turn off alerts" : "Notify me"}
      </Button>
    ) : null}
  </>
);

const PanelActions = ({
  notifs,
  onSwitchView,
  today,
  view,
}: {
  notifs: ChallengeNotificationsState;
  onSwitchView: (v: View) => void;
  today: TodayChallengeState;
  view: View;
}) => (
  <div className="flex flex-wrap items-center gap-2">
    {view === "today" ? <TodayActions notifs={notifs} today={today} /> : null}

    <Button
      onClick={() => onSwitchView(view === "today" ? "history" : "today")}
      size="sm"
      type="button"
      variant="outline"
    >
      {view === "today" ? (
        <>
          <BookOpen aria-hidden size={14} /> History
        </>
      ) : (
        <>
          <ChevronLeft aria-hidden size={14} /> Today
        </>
      )}
    </Button>
  </div>
);

const TodayPhoto = ({ challenge }: { challenge: DailyChallengeInfo }) => (
  <div className="space-y-2">
    <a
      aria-label="Open photo on Unsplash"
      className="group block overflow-hidden rounded-lg border border-white/10 bg-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      href={challenge.unsplashHtmlLink ?? "#"}
      rel="noreferrer noopener"
      target="_blank"
    >
      <OptimizedImage
        alt={challenge.altText || "Daily challenge photo"}
        className="aspect-5/3 w-full object-cover transition-opacity group-hover:opacity-95"
        referrerPolicy="no-referrer"
        sizes="(min-width: 1024px) 560px, 90vw"
        src={challenge.imageUrl}
      />
    </a>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-white/90">
      <span>
        Photo by{" "}
        {challenge.photographerUsername ? (
          <a
            className="text-white/90 underline-offset-2 hover:text-white hover:underline"
            href={`https://unsplash.com/@${challenge.photographerUsername}`}
            rel="noreferrer noopener"
            target="_blank"
          >
            {challenge.photographerName ?? challenge.photographerUsername}
          </a>
        ) : (
          (challenge.photographerName ?? "Unknown")
        )}{" "}
        on Unsplash
      </span>
      {challenge.unsplashHtmlLink ? (
        <a
          className="inline-flex items-center gap-0.5 text-white/55 hover:text-white"
          href={challenge.unsplashHtmlLink}
          rel="noreferrer noopener"
          target="_blank"
        >
          <ExternalLink aria-hidden size={12} />
          View on Unsplash
        </a>
      ) : null}
    </div>
  </div>
);

const TodayJournalForm = ({
  onSubmit,
  today,
}: {
  onSubmit: (e: React.FormEvent) => void;
  today: TodayChallengeState;
}) => (
  <form className="flex flex-col gap-3" onSubmit={onSubmit}>
    <div className="space-y-2">
      <Label
        className="text-[10px] text-white/90 uppercase tracking-widest"
        htmlFor="challenge-journal"
      >
        Your thoughts
      </Label>
      <textarea
        className={cn(
          "w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white",
          "placeholder:text-white/90 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
        )}
        id="challenge-journal"
        maxLength={20_000}
        onChange={(e) => today.setThoughts(e.target.value)}
        placeholder="Lighting, composition, story, what you'd try in your own work…"
        rows={8}
        value={today.thoughts}
      />
      <p className="text-[9px] text-white/90">
        {today.thoughts.length.toLocaleString()} / 20,000
        {today.journal?.updatedAt ? (
          <span className="ml-2 text-white/80">
            · Saved {new Date(today.journal.updatedAt).toLocaleString()}
          </span>
        ) : null}
      </p>
    </div>
    <Button
      className="sm:w-auto"
      disabled={today.saving}
      fullWidth
      type="submit"
      variant="outline"
    >
      {today.saving ? "Saving…" : "Save journal"}
    </Button>
  </form>
);

const TodayView = ({
  notifs,
  onSaveJournal,
  today,
}: {
  notifs: ChallengeNotificationsState;
  onSaveJournal: (e: React.FormEvent) => void;
  today: TodayChallengeState;
}) => (
  <>
    {today.loading ? (
      <p className="text-center text-[10px] text-white/90 uppercase tracking-widest">
        Loading…
      </p>
    ) : null}
    {!(today.loading || today.challenge) && (
      <p className="text-sm text-white/90">Could not load today's challenge.</p>
    )}
    {!today.loading && today.challenge ? (
      <>
        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          <TodayPhoto challenge={today.challenge} />
          <TodayJournalForm onSubmit={onSaveJournal} today={today} />
        </div>

        {notifs.perm === "denied" ? (
          <p className="text-[10px] text-amber-200/70">
            Notifications are blocked for this site. Enable them in browser
            settings if you want alerts.
          </p>
        ) : null}
      </>
    ) : null}
  </>
);

const HistoryView = ({
  history,
  onDeleted,
  onSaved,
  todayDate,
}: {
  history: ChallengeHistoryState;
  onDeleted: (date: string) => void;
  onSaved: (date: string, journal: DailyChallengeJournal) => void;
  todayDate: string;
}) => {
  if (history.loading) {
    return (
      <div className="space-y-2">
        <p className="text-center text-[10px] text-white/90 uppercase tracking-widest">
          Loading…
        </p>
      </div>
    );
  }

  if (history.entries.length === 0) {
    return (
      <div className="space-y-2">
        <p className="py-4 text-center text-sm text-white/90">
          No past entries yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="pb-1 text-[10px] text-white/90 uppercase tracking-widest">
        {history.entries.length}{" "}
        {history.entries.length === 1 ? "entry" : "entries"} — click a row to
        view or edit
      </p>
      {history.entries.map((entry) => (
        <HistoryEntry
          entry={entry}
          isToday={entry.challenge.challengeDate === todayDate}
          key={entry.challenge.challengeDate}
          onDeleted={onDeleted}
          onSaved={onSaved}
        />
      ))}
    </div>
  );
};

// ── Glue: cross-concern sync ────────────────────────────────────────────────

const usePanelSync = (
  today: TodayChallengeState,
  history: ChallengeHistoryState
) => {
  const handleSaveJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    const saved = await today.saveJournal(today.thoughts);
    if (saved && today.challenge) {
      history.syncEntry(today.challenge.challengeDate, saved);
    }
  };

  const handleHistorySaved = (date: string, saved: DailyChallengeJournal) => {
    history.syncEntry(date, saved);
    if (today.challenge?.challengeDate === date) {
      today.syncJournal(saved);
    }
  };

  const handleHistoryDeleted = (date: string) => {
    history.removeEntry(date);
    if (today.challenge?.challengeDate === date) {
      today.syncJournal(null);
    }
  };

  return { handleHistoryDeleted, handleHistorySaved, handleSaveJournal };
};

export const DailyChallengePanel = () => {
  const [view, setView] = useState<View>("today");
  const todayDate = new Date().toISOString().slice(0, 10);

  const today = useTodayChallenge();
  const history = useChallengeHistory();
  const notifs = useChallengeNotifications();

  const { handleHistoryDeleted, handleHistorySaved, handleSaveJournal } =
    usePanelSync(today, history);

  const handleSwitchView = (v: View) => {
    setView(v);
    if (v === "history" && !history.loaded) {
      void history.load();
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Card className="border-white/10 bg-white/5">
      <CardHeader className="flex flex-col gap-3 border-white/5 border-b sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 font-light text-sm text-white/90 uppercase tracking-[0.3em]">
            <Sparkles aria-hidden className="size-4 text-amber-200/80" />
            Daily challenge
          </CardTitle>
          <p className="text-[10px] text-white/90 uppercase tracking-widest">
            Inspiration from Unsplash (UTC day). Your notes are private.
          </p>
        </div>

        <PanelActions
          notifs={notifs}
          onSwitchView={handleSwitchView}
          today={today}
          view={view}
        />
      </CardHeader>

      <CardContent className="space-y-5 pt-6">
        {/* ── TODAY ── */}
        {view === "today" ? (
          <TodayView
            notifs={notifs}
            onSaveJournal={(e) => void handleSaveJournal(e)}
            today={today}
          />
        ) : null}

        {/* ── HISTORY ── */}
        {view === "history" ? (
          <HistoryView
            history={history}
            onDeleted={handleHistoryDeleted}
            onSaved={handleHistorySaved}
            todayDate={todayDate}
          />
        ) : null}
      </CardContent>
    </Card>
  );
};

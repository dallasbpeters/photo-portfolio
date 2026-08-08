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
import { useChallengeHistory } from "../../hooks/useChallengeHistory";
import { useChallengeNotifications } from "../../hooks/useChallengeNotifications";
import {
  canUseNotifications,
  useTodayChallenge,
} from "../../hooks/useTodayChallenge";
import { portfolioService } from "../../services/portfolioService";
import type {
  DailyChallengeHistoryEntry,
  DailyChallengeJournal,
} from "../../types";
import { OptimizedImage } from "../OptimizedImage";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";

// ─── Utilities ────────────────────────────────────────────────────────────────

const formatDate = (iso: string): string => {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    weekday: "short",
    year: "numeric",
  });
};

// ─── History entry ────────────────────────────────────────────────────────────

interface HistoryEntryProps {
  entry: DailyChallengeHistoryEntry;
  isToday: boolean;
  onDeleted: (date: string) => void;
  onSaved: (date: string, journal: DailyChallengeJournal) => void;
}

const HistoryEntry = ({
  entry,
  isToday,
  onSaved,
  onDeleted,
}: HistoryEntryProps) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(entry.journal?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    setText(entry.journal?.body ?? "");
  }, [entry.journal?.body]);
  React.useEffect(() => {
    if (open) {
      textareaRef.current?.focus();
    }
  }, [open]);

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
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this journal entry? This cannot be undone.")) {
      return;
    }
    setDeleting(true);
    try {
      await portfolioService.deleteJournalEntry(entry.challenge.challengeDate);
      setText("");
      onDeleted(entry.challenge.challengeDate);
      toast.success("Journal entry deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const excerpt = entry.journal?.body?.trim();
  const thumb = entry.challenge.imageThumbUrl ?? entry.challenge.imageUrl;

  return (
    <div className="overflow-hidden rounded-lg border border-white/8">
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-white/5"
        onClick={() => setOpen((o) => !o)}
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
          <p className="flex items-center gap-1.5 text-[10px] text-white/50 uppercase tracking-widest">
            {isToday ? (
              <span className="inline-block size-1.5 shrink-0 rounded-full bg-amber-300/80" />
            ) : null}
            {formatDate(entry.challenge.challengeDate)}
          </p>
          <p className="mt-0.5 truncate text-white/40 text-xs">
            {excerpt ? (
              excerpt.slice(0, 80) + (excerpt.length > 80 ? "…" : "")
            ) : (
              <span className="italic">No notes yet</span>
            )}
          </p>
        </div>
        {open ? (
          <ChevronUp aria-hidden className="shrink-0 text-white/30" size={14} />
        ) : (
          <ChevronDown
            aria-hidden
            className="shrink-0 text-white/30"
            size={14}
          />
        )}
      </button>

      {open ? (
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

            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => void handleSave(e)}
            >
              <Label
                className="text-[10px] text-white/35 uppercase tracking-widest"
                htmlFor={`journal-${entry.challenge.challengeDate}`}
              >
                Your thoughts
              </Label>
              <textarea
                className={cn(
                  "w-full resize-y rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white",
                  "placeholder:text-white/25 focus:border-white/35 focus:outline-none focus:ring-1 focus:ring-white/15"
                )}
                id={`journal-${entry.challenge.challengeDate}`}
                maxLength={20_000}
                onChange={(e) => setText(e.target.value)}
                placeholder="Lighting, composition, story, what you'd try…"
                ref={textareaRef}
                rows={6}
                value={text}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[9px] text-white/25">
                  {text.length.toLocaleString()} / 20,000
                  {entry.journal?.updatedAt ? (
                    <span className="ml-2">
                      · Saved{" "}
                      {new Date(entry.journal.updatedAt).toLocaleString()}
                    </span>
                  ) : null}
                </p>
                <div className="flex items-center gap-2">
                  {entry.journal ? (
                    <Button
                      aria-label="Delete journal entry"
                      className="gap-1.5 text-[10px] text-red-400/70 uppercase tracking-widest hover:bg-red-400/10 hover:text-red-400"
                      disabled={deleting}
                      onClick={() => void handleDelete()}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden size={12} />
                      {deleting ? "Deleting…" : "Delete"}
                    </Button>
                  ) : null}
                  <Button
                    className="border-white/20 text-[10px] text-white/80 uppercase tracking-widest hover:bg-white/10"
                    disabled={saving}
                    size="sm"
                    type="submit"
                    variant="outline"
                  >
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </form>
          </div>

          {entry.challenge.photographerName ||
          entry.challenge.unsplashHtmlLink ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-white/35">
              {entry.challenge.photographerName ? (
                <span>
                  Photo by{" "}
                  {entry.challenge.photographerUsername ? (
                    <a
                      className="text-white/55 underline-offset-2 hover:text-white hover:underline"
                      href={`https://unsplash.com/@${entry.challenge.photographerUsername}`}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      {entry.challenge.photographerName}
                    </a>
                  ) : (
                    entry.challenge.photographerName
                  )}{" "}
                  on Unsplash
                </span>
              ) : null}
              {entry.challenge.unsplashHtmlLink ? (
                <a
                  className="inline-flex items-center gap-0.5 text-white/40 hover:text-white"
                  href={entry.challenge.unsplashHtmlLink}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  <ExternalLink aria-hidden size={10} />
                  View
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

// ─── Main panel ──────────────────────────────────────────────────────────────

type View = "today" | "history";

export const DailyChallengePanel = () => {
  const [view, setView] = useState<View>("today");
  const todayDate = new Date().toISOString().slice(0, 10);

  const today = useTodayChallenge();
  const history = useChallengeHistory();
  const notifs = useChallengeNotifications();

  // ── Glue: cross-concern sync ─────────────────────────────────────────────

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
          <CardTitle className="flex items-center gap-2 font-light text-sm text-white/60 uppercase tracking-[0.3em]">
            <Sparkles aria-hidden className="size-4 text-amber-200/80" />
            Daily challenge
          </CardTitle>
          <p className="text-[10px] text-white/35 uppercase tracking-widest">
            Inspiration from Unsplash (UTC day). Your notes are private.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view === "today" ? (
            <>
              <Button
                aria-label="Load a different inspiration photo"
                className="shrink-0 gap-2 border-white/20 text-[10px] text-white/80 uppercase tracking-widest hover:bg-white/10"
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
                  className="shrink-0 gap-2 border-white/20 text-[10px] text-white/80 uppercase tracking-widest hover:bg-white/10"
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
          ) : null}

          <Button
            className="shrink-0 gap-2 border-white/20 text-[10px] text-white/80 uppercase tracking-widest hover:bg-white/10"
            onClick={() =>
              handleSwitchView(view === "today" ? "history" : "today")
            }
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
      </CardHeader>

      <CardContent className="space-y-5 pt-6">
        {/* ── TODAY ── */}
        {view === "today" && (
          <>
            {today.loading ? (
              <p className="text-center text-[10px] text-white/40 uppercase tracking-widest">
                Loading…
              </p>
            ) : null}
            {!(today.loading || today.challenge) && (
              <p className="text-sm text-white/50">
                Could not load today's challenge.
              </p>
            )}
            {!today.loading && today.challenge ? (
              <>
                <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
                  <div className="space-y-2">
                    <a
                      aria-label="Open photo on Unsplash"
                      className="group block overflow-hidden rounded-lg border border-white/10 bg-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                      href={today.challenge.unsplashHtmlLink ?? "#"}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      <OptimizedImage
                        alt={today.challenge.altText || "Daily challenge photo"}
                        className="aspect-5/3 w-full object-cover transition-opacity group-hover:opacity-95"
                        referrerPolicy="no-referrer"
                        sizes="(min-width: 1024px) 560px, 90vw"
                        src={today.challenge.imageUrl}
                      />
                    </a>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-white/45">
                      <span>
                        Photo by{" "}
                        {today.challenge.photographerUsername ? (
                          <a
                            className="text-white/70 underline-offset-2 hover:text-white hover:underline"
                            href={`https://unsplash.com/@${today.challenge.photographerUsername}`}
                            rel="noreferrer noopener"
                            target="_blank"
                          >
                            {today.challenge.photographerName ??
                              today.challenge.photographerUsername}
                          </a>
                        ) : (
                          (today.challenge.photographerName ?? "Unknown")
                        )}{" "}
                        on Unsplash
                      </span>
                      {today.challenge.unsplashHtmlLink ? (
                        <a
                          className="inline-flex items-center gap-0.5 text-white/55 hover:text-white"
                          href={today.challenge.unsplashHtmlLink}
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          <ExternalLink aria-hidden size={12} />
                          View on Unsplash
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <form
                    className="flex flex-col gap-3"
                    onSubmit={(e) => void handleSaveJournal(e)}
                  >
                    <div className="space-y-2">
                      <Label
                        className="text-[10px] text-white/40 uppercase tracking-widest"
                        htmlFor="challenge-journal"
                      >
                        Your thoughts
                      </Label>
                      <textarea
                        className={cn(
                          "w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white",
                          "placeholder:text-white/30 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                        )}
                        id="challenge-journal"
                        maxLength={20_000}
                        onChange={(e) => today.setThoughts(e.target.value)}
                        placeholder="Lighting, composition, story, what you'd try in your own work…"
                        rows={8}
                        value={today.thoughts}
                      />
                      <p className="text-[9px] text-white/30">
                        {today.thoughts.length.toLocaleString()} / 20,000
                        {today.journal?.updatedAt ? (
                          <span className="ml-2 text-white/25">
                            · Saved{" "}
                            {new Date(today.journal.updatedAt).toLocaleString()}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <Button
                      className="min-h-11 w-full border-white/25 text-[10px] text-white uppercase tracking-widest hover:bg-white/10 sm:w-auto"
                      disabled={today.saving}
                      type="submit"
                      variant="outline"
                    >
                      {today.saving ? "Saving…" : "Save journal"}
                    </Button>
                  </form>
                </div>

                {notifs.perm === "denied" ? (
                  <p className="text-[10px] text-amber-200/70">
                    Notifications are blocked for this site. Enable them in
                    browser settings if you want alerts.
                  </p>
                ) : null}
              </>
            ) : null}
          </>
        )}

        {/* ── HISTORY ── */}
        {view === "history" ? (
          <div className="space-y-2">
            {history.loading ? (
              <p className="text-center text-[10px] text-white/40 uppercase tracking-widest">
                Loading…
              </p>
            ) : null}
            {!history.loading && history.entries.length === 0 ? (
              <p className="py-4 text-center text-sm text-white/40">
                No past entries yet.
              </p>
            ) : null}
            {!history.loading && history.entries.length > 0 ? (
              <>
                <p className="pb-1 text-[10px] text-white/30 uppercase tracking-widest">
                  {history.entries.length}{" "}
                  {history.entries.length === 1 ? "entry" : "entries"} — click a
                  row to view or edit
                </p>
                {history.entries.map((entry) => (
                  <HistoryEntry
                    entry={entry}
                    isToday={entry.challenge.challengeDate === todayDate}
                    key={entry.challenge.challengeDate}
                    onDeleted={handleHistoryDeleted}
                    onSaved={handleHistorySaved}
                  />
                ))}
              </>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

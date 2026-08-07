import React, { useRef, useState } from 'react';
import type { DailyChallengeJournal } from '../../types';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Sparkles, Bell, BellOff, ExternalLink, RefreshCw,
  BookOpen, ChevronLeft, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { portfolioService } from '../../services/portfolioService';
import { OptimizedImage } from '../OptimizedImage';
import { cn } from '@/lib/utils';
import { useTodayChallenge, canUseNotifications } from '../../hooks/useTodayChallenge';
import { useChallengeHistory } from '../../hooks/useChallengeHistory';
import { useChallengeNotifications } from '../../hooks/useChallengeNotifications';
import type { DailyChallengeHistoryEntry } from '../../types';

// ─── Utilities ────────────────────────────────────────────────────────────────

const formatDate = (iso: string): string => {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

// ─── History entry ────────────────────────────────────────────────────────────

type HistoryEntryProps = {
  entry: DailyChallengeHistoryEntry;
  isToday: boolean;
  onSaved: (date: string, journal: DailyChallengeJournal) => void;
  onDeleted: (date: string) => void;
};

const HistoryEntry = ({ entry, isToday, onSaved, onDeleted }: HistoryEntryProps) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(entry.journal?.body ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => { setText(entry.journal?.body ?? ''); }, [entry.journal?.body]);
  React.useEffect(() => { if (open) textareaRef.current?.focus(); }, [open]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await portfolioService.saveDailyChallengeJournalForDate(entry.challenge.challengeDate, text);
      onSaved(entry.challenge.challengeDate, saved);
      toast.success('Journal saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this journal entry? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await portfolioService.deleteJournalEntry(entry.challenge.challengeDate);
      setText('');
      onDeleted(entry.challenge.challengeDate);
      toast.success('Journal entry deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const excerpt = entry.journal?.body?.trim();
  const thumb   = entry.challenge.imageThumbUrl ?? entry.challenge.imageUrl;

  return (
    <div className="border border-white/8 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors"
        aria-expanded={open}
      >
        <OptimizedImage src={thumb} alt={entry.challenge.altText || ''} sizes="48px" className="size-12 rounded object-cover shrink-0 opacity-80" referrerPolicy="no-referrer" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-white/50 flex items-center gap-1.5">
            {isToday && <span className="inline-block size-1.5 rounded-full bg-amber-300/80 shrink-0" />}
            {formatDate(entry.challenge.challengeDate)}
          </p>
          <p className="text-xs text-white/40 truncate mt-0.5">
            {excerpt ? excerpt.slice(0, 80) + (excerpt.length > 80 ? '…' : '') : <span className="italic">No notes yet</span>}
          </p>
        </div>
        {open
          ? <ChevronUp size={14} className="shrink-0 text-white/30" aria-hidden />
          : <ChevronDown size={14} className="shrink-0 text-white/30" aria-hidden />}
      </button>

      {open && (
        <div className="border-t border-white/8 p-3 space-y-3 bg-black/20">
          <div className="grid gap-4 sm:grid-cols-[160px_1fr] items-start">
            <a
              href={entry.challenge.unsplashHtmlLink ?? '#'}
              target="_blank"
              rel="noreferrer noopener"
              className="block overflow-hidden rounded border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              aria-label="Open photo on Unsplash"
            >
              <OptimizedImage
                src={entry.challenge.imageThumbUrl ?? entry.challenge.imageUrl}
                alt={entry.challenge.altText || 'Challenge photo'}
                sizes="(min-width: 1024px) 420px, 90vw"
                className="aspect-5/3 w-full object-cover opacity-90 hover:opacity-100 transition-opacity"
                referrerPolicy="no-referrer"
              />
            </a>

            <form onSubmit={(e) => void handleSave(e)} className="flex flex-col gap-2">
              <Label htmlFor={`journal-${entry.challenge.challengeDate}`} className="text-[10px] uppercase tracking-widest text-white/35">
                Your thoughts
              </Label>
              <textarea
                ref={textareaRef}
                id={`journal-${entry.challenge.challengeDate}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                maxLength={20000}
                placeholder="Lighting, composition, story, what you'd try…"
                className={cn(
                  'w-full resize-y rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white',
                  'placeholder:text-white/25 focus:border-white/35 focus:outline-none focus:ring-1 focus:ring-white/15',
                )}
              />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[9px] text-white/25">
                  {text.length.toLocaleString()} / 20,000
                  {entry.journal?.updatedAt && (
                    <span className="ml-2">· Saved {new Date(entry.journal.updatedAt).toLocaleString()}</span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  {entry.journal && (
                    <Button
                      type="button"
                      disabled={deleting}
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDelete()}
                      className="gap-1.5 text-[10px] uppercase tracking-widest text-red-400/70 hover:bg-red-400/10 hover:text-red-400"
                      aria-label="Delete journal entry"
                    >
                      <Trash2 size={12} aria-hidden />
                      {deleting ? 'Deleting…' : 'Delete'}
                    </Button>
                  )}
                  <Button type="submit" disabled={saving} variant="outline" size="sm" className="border-white/20 text-[10px] uppercase tracking-widest text-white/80 hover:bg-white/10">
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            </form>
          </div>

          {(entry.challenge.photographerName || entry.challenge.unsplashHtmlLink) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-white/35">
              {entry.challenge.photographerName && (
                <span>
                  Photo by{' '}
                  {entry.challenge.photographerUsername
                    ? <a href={`https://unsplash.com/@${entry.challenge.photographerUsername}`} target="_blank" rel="noreferrer noopener" className="text-white/55 hover:text-white underline-offset-2 hover:underline">{entry.challenge.photographerName}</a>
                    : entry.challenge.photographerName}
                  {' '}on Unsplash
                </span>
              )}
              {entry.challenge.unsplashHtmlLink && (
                <a href={entry.challenge.unsplashHtmlLink} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-white/40 hover:text-white">
                  <ExternalLink size={10} aria-hidden />
                  View
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main panel ──────────────────────────────────────────────────────────────

type View = 'today' | 'history';

export const DailyChallengePanel = () => {
  const [view, setView] = useState<View>('today');
  const todayDate = new Date().toISOString().slice(0, 10);

  const today       = useTodayChallenge();
  const history     = useChallengeHistory();
  const notifs      = useChallengeNotifications();

  // ── Glue: cross-concern sync ─────────────────────────────────────────────

  const handleSaveJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    const saved = await today.saveJournal(today.thoughts);
    if (saved && today.challenge) history.syncEntry(today.challenge.challengeDate, saved);
  };

  const handleHistorySaved = (date: string, saved: DailyChallengeJournal) => {
    history.syncEntry(date, saved);
    if (today.challenge?.challengeDate === date) today.syncJournal(saved);
  };

  const handleHistoryDeleted = (date: string) => {
    history.removeEntry(date);
    if (today.challenge?.challengeDate === date) today.syncJournal(null);
  };

  const handleSwitchView = (v: View) => {
    setView(v);
    if (v === 'history' && !history.loaded) void history.load();
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Card className="border-white/10 bg-white/5">
      <CardHeader className="flex flex-col gap-3 border-b border-white/5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-sm font-light uppercase tracking-[0.3em] text-white/60">
            <Sparkles className="size-4 text-amber-200/80" aria-hidden />
            Daily challenge
          </CardTitle>
          <p className="text-[10px] uppercase tracking-widest text-white/35">
            Inspiration from Unsplash (UTC day). Your notes are private.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view === 'today' && (
            <>
              <Button
                type="button" variant="outline" size="sm"
                disabled={today.loading || today.refreshing || !today.challenge}
                onClick={() => void today.refresh()}
                className="shrink-0 gap-2 border-white/20 text-[10px] uppercase tracking-widest text-white/80 hover:bg-white/10"
                aria-label="Load a different inspiration photo"
              >
                <RefreshCw size={14} className={today.refreshing ? 'animate-spin' : ''} aria-hidden />
                {today.refreshing ? 'Loading…' : 'New photo'}
              </Button>

              {canUseNotifications() && (
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => void notifs.toggle(today.challenge)}
                  className="shrink-0 gap-2 border-white/20 text-[10px] uppercase tracking-widest text-white/80 hover:bg-white/10"
                  aria-pressed={notifs.enabled}
                >
                  {notifs.enabled ? <BellOff size={14} aria-hidden /> : <Bell size={14} aria-hidden />}
                  {notifs.enabled ? 'Turn off alerts' : 'Notify me'}
                </Button>
              )}
            </>
          )}

          <Button
            type="button" variant="outline" size="sm"
            onClick={() => handleSwitchView(view === 'today' ? 'history' : 'today')}
            className="shrink-0 gap-2 border-white/20 text-[10px] uppercase tracking-widest text-white/80 hover:bg-white/10"
          >
            {view === 'today'
              ? <><BookOpen size={14} aria-hidden /> History</>
              : <><ChevronLeft size={14} aria-hidden /> Today</>}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-6">
        {/* ── TODAY ── */}
        {view === 'today' && (
          <>
            {today.loading && (
              <p className="text-center text-[10px] uppercase tracking-widest text-white/40">Loading…</p>
            )}
            {!today.loading && !today.challenge && (
              <p className="text-sm text-white/50">Could not load today's challenge.</p>
            )}
            {!today.loading && today.challenge && (
              <>
                <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
                  <div className="space-y-2">
                    <a
                      href={today.challenge.unsplashHtmlLink ?? '#'}
                      target="_blank" rel="noreferrer noopener"
                      className="group block overflow-hidden rounded-lg border border-white/10 bg-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                      aria-label="Open photo on Unsplash"
                    >
                      <OptimizedImage
                        src={today.challenge.imageUrl}
                        alt={today.challenge.altText || 'Daily challenge photo'}
                        sizes="(min-width: 1024px) 560px, 90vw"
                        className="aspect-5/3 w-full object-cover transition-opacity group-hover:opacity-95"
                        referrerPolicy="no-referrer"
                      />
                    </a>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-white/45">
                      <span>
                        Photo by{' '}
                        {today.challenge.photographerUsername
                          ? <a href={`https://unsplash.com/@${today.challenge.photographerUsername}`} target="_blank" rel="noreferrer noopener" className="text-white/70 underline-offset-2 hover:text-white hover:underline">{today.challenge.photographerName ?? today.challenge.photographerUsername}</a>
                          : (today.challenge.photographerName ?? 'Unknown')}{' '}
                        on Unsplash
                      </span>
                      {today.challenge.unsplashHtmlLink && (
                        <a href={today.challenge.unsplashHtmlLink} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-white/55 hover:text-white">
                          <ExternalLink size={12} aria-hidden />
                          View on Unsplash
                        </a>
                      )}
                    </div>
                  </div>

                  <form onSubmit={(e) => void handleSaveJournal(e)} className="flex flex-col gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="challenge-journal" className="text-[10px] uppercase tracking-widest text-white/40">
                        Your thoughts
                      </Label>
                      <textarea
                        id="challenge-journal"
                        value={today.thoughts}
                        onChange={(e) => today.setThoughts(e.target.value)}
                        rows={8}
                        maxLength={20000}
                        placeholder="Lighting, composition, story, what you'd try in your own work…"
                        className={cn(
                          'w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white',
                          'placeholder:text-white/30 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/15',
                        )}
                      />
                      <p className="text-[9px] text-white/30">
                        {today.thoughts.length.toLocaleString()} / 20,000
                        {today.journal?.updatedAt && (
                          <span className="ml-2 text-white/25">
                            · Saved {new Date(today.journal.updatedAt).toLocaleString()}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      type="submit" disabled={today.saving} variant="outline"
                      className="w-full min-h-11 border-white/25 text-[10px] uppercase tracking-widest text-white hover:bg-white/10 sm:w-auto"
                    >
                      {today.saving ? 'Saving…' : 'Save journal'}
                    </Button>
                  </form>
                </div>

                {notifs.perm === 'denied' && (
                  <p className="text-[10px] text-amber-200/70">
                    Notifications are blocked for this site. Enable them in browser settings if you want alerts.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {/* ── HISTORY ── */}
        {view === 'history' && (
          <div className="space-y-2">
            {history.loading && (
              <p className="text-center text-[10px] uppercase tracking-widest text-white/40">Loading…</p>
            )}
            {!history.loading && history.entries.length === 0 && (
              <p className="text-sm text-white/40 text-center py-4">No past entries yet.</p>
            )}
            {!history.loading && history.entries.length > 0 && (
              <>
                <p className="text-[10px] uppercase tracking-widest text-white/30 pb-1">
                  {history.entries.length} {history.entries.length === 1 ? 'entry' : 'entries'} — click a row to view or edit
                </p>
                {history.entries.map((entry) => (
                  <HistoryEntry
                    key={entry.challenge.challengeDate}
                    entry={entry}
                    isToday={entry.challenge.challengeDate === todayDate}
                    onSaved={handleHistorySaved}
                    onDeleted={handleHistoryDeleted}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

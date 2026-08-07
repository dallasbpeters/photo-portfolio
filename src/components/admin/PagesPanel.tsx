import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, FileText, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { pagesApi, type PageRecord, type PageSummary } from '../../services/portfolioService';
import { PageEditor } from '../../cms/PageEditor';
import { IconPicker } from '../../cms/IconPicker';

const labelClass = 'text-[10px] uppercase tracking-widest text-white/40';
const inputClass =
  'min-h-11 text-base bg-black/40 border-white/10 focus:border-white/40 transition-colors';

/** Mirrors slugify() in api/_lib/pages.ts so the suggested address matches. */
const slugify = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export function PagesPanel() {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [editing, setEditing] = useState<PageRecord | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setPages(await pagesApi.list());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load pages');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;

    setIsBusy(true);
    try {
      const created = await pagesApi.create({ title, slug: slugify(title), status: 'draft' });
      toast.success(`"${created.title}" created as a draft`);
      setNewTitle('');
      setIsCreating(false);
      await reload();
      setEditing(created);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create page');
    } finally {
      setIsBusy(false);
    }
  };

  const openPage = async (slug: string): Promise<void> => {
    try {
      setEditing(await pagesApi.get(slug));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open page');
    }
  };

  const handleDelete = async (page: PageSummary): Promise<void> => {
    if (!window.confirm(`Delete "${page.title}"? This cannot be undone.`)) return;
    try {
      await pagesApi.remove(page.slug);
      toast.success('Page deleted');
      if (editing?.slug === page.slug) setEditing(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete page');
    }
  };

  if (editing) {
    return (
      <PageEditorPanel
        page={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          await reload();
        }}
      />
    );
  }

  return (
    <Card className="bg-white/[0.02] border-white/10">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-sm font-light uppercase tracking-[0.2em] text-white/70">
          <FileText size={16} aria-hidden />
          Pages
        </CardTitle>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setIsCreating((v) => !v)}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/50 hover:text-white"
        >
          {isCreating ? <X size={14} /> : <Plus size={14} />}
          {isCreating ? 'Cancel' : 'New page'}
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        {isCreating && (
          <form onSubmit={(e) => void handleCreate(e)} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1 space-y-2">
              <Label htmlFor="new-page-title" className={labelClass}>
                Page title
              </Label>
              <Input
                id="new-page-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="About"
                autoFocus
                className={inputClass}
              />
              {newTitle.trim() && (
                <p className="font-mono text-[10px] text-white/25">/{slugify(newTitle)}</p>
              )}
            </div>
            <Button
              type="submit"
              disabled={isBusy || !newTitle.trim()}
              variant="outline"
              className="min-h-11 border-white/20 text-[10px] uppercase tracking-[0.18em] hover:bg-white hover:text-black"
            >
              Create draft
            </Button>
          </form>
        )}

        {pages.length === 0 ? (
          <p className="text-[11px] uppercase tracking-[0.15em] text-white/25">
            No pages yet. Create one and it appears under the site title once published.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {pages.map((page) => (
              <li key={page.id} className="flex items-center gap-3 py-3">
                <button
                  type="button"
                  onClick={() => void openPage(page.slug)}
                  className="flex-1 text-left"
                >
                  <span className="text-sm text-white/85">{page.title}</span>
                  <span className="ml-2 font-mono text-[10px] text-white/25">/{page.slug}</span>
                </button>
                <a
                  href={`/${page.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] uppercase tracking-[0.16em] text-white/30 transition-colors hover:text-white"
                >
                  View
                </a>
                <button
                  type="button"
                  onClick={() => void handleDelete(page)}
                  aria-label={`Delete ${page.title}`}
                  className="text-white/25 transition-colors hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PageEditorPanel({
  page,
  onClose,
  onSaved,
}: {
  page: PageRecord;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<PageRecord>(page);
  const [isSaving, setIsSaving] = useState(false);

  const save = async (overrides: Partial<PageRecord> = {}): Promise<void> => {
    setIsSaving(true);
    try {
      const next = { ...draft, ...overrides };
      const saved = await pagesApi.update(page.slug, {
        title: next.title,
        slug: next.slug,
        icon: next.icon,
        status: next.status,
        content: next.content,
        order: next.order,
      });
      setDraft(saved);
      await onSaved();
      toast.success(saved.status === 'published' ? 'Published' : 'Saved as draft');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save page');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="bg-white/[0.02] border-white/10">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-sm font-light uppercase tracking-[0.2em] text-white/70">
          <FileText size={16} aria-hidden />
          {draft.title}
        </CardTitle>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          className="text-[10px] uppercase tracking-[0.18em] text-white/40 hover:text-white"
        >
          <X size={14} className="mr-1.5" />
          Close
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="page-title" className={labelClass}>
              Title
            </Label>
            <Input
              id="page-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="page-slug" className={labelClass}>
              Address
            </Label>
            <Input
              id="page-slug"
              value={draft.slug}
              onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="page-icon" className={labelClass}>
              Icon (optional)
            </Label>
            <IconPicker
              id="page-icon"
              value={draft.icon}
              onChange={(icon) => setDraft({ ...draft, icon })}
            />
          </div>
        </div>

        <PageEditor value={draft.content} onChange={(content) => setDraft({ ...draft, content })} />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => void save()}
            disabled={isSaving}
            variant="outline"
            className="min-h-11 flex items-center gap-2 border-white/20 text-[10px] uppercase tracking-[0.18em] hover:bg-white hover:text-black"
          >
            <Save size={14} />
            {isSaving ? 'Saving…' : 'Save'}
          </Button>

          <Button
            type="button"
            onClick={() =>
              void save({ status: draft.status === 'published' ? 'draft' : 'published' })
            }
            disabled={isSaving}
            variant="ghost"
            className="min-h-11 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/50 hover:text-white"
          >
            {draft.status === 'published' ? <EyeOff size={14} /> : <Eye size={14} />}
            {draft.status === 'published' ? 'Unpublish' : 'Publish'}
          </Button>

          <span
            className={`text-[10px] uppercase tracking-[0.16em] ${
              draft.status === 'published' ? 'text-emerald-400/70' : 'text-amber-400/70'
            }`}
          >
            {draft.status}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

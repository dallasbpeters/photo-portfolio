import { Eye, EyeOff, FileText, Plus, Save, Trash2, X } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { IconPicker } from "../../cms/IconPicker";
import { PageEditor } from "../../cms/PageEditor";
import {
  type PageRecord,
  type PageSummary,
  pagesApi,
} from "../../services/portfolioService";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const labelClass = "text-[10px] uppercase tracking-widest text-white/40";
const inputClass =
  "min-h-11 text-base bg-black/40 border-white/10 focus:border-white/40 transition-colors";

/** Mirrors slugify() in api/_lib/pages.ts so the suggested address matches. */
const slugify = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export function PagesPanel() {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [editing, setEditing] = useState<PageRecord | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setPages(await pagesApi.list());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load pages");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      return;
    }

    setIsBusy(true);
    try {
      const created = await pagesApi.create({
        slug: slugify(title),
        status: "draft",
        title,
      });
      toast.success(`"${created.title}" created as a draft`);
      setNewTitle("");
      setIsCreating(false);
      await reload();
      setEditing(created);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create page");
    } finally {
      setIsBusy(false);
    }
  };

  const openPage = async (slug: string): Promise<void> => {
    try {
      setEditing(await pagesApi.get(slug));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open page");
    }
  };

  const handleDelete = async (page: PageSummary): Promise<void> => {
    if (!window.confirm(`Delete "${page.title}"? This cannot be undone.`)) {
      return;
    }
    try {
      await pagesApi.remove(page.slug);
      toast.success("Page deleted");
      if (editing?.slug === page.slug) {
        setEditing(null);
      }
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete page");
    }
  };

  if (editing) {
    return (
      <PageEditorPanel
        onClose={() => setEditing(null)}
        onSaved={async () => {
          await reload();
        }}
        page={editing}
      />
    );
  }

  return (
    <Card className="border-white/10 bg-white/[0.02]">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 font-light text-sm text-white/70 uppercase tracking-[0.2em]">
          <FileText aria-hidden size={16} />
          Pages
        </CardTitle>
        <Button
          className="flex items-center gap-1.5 text-[10px] text-white/50 uppercase tracking-[0.18em] hover:text-white"
          onClick={() => setIsCreating((v) => !v)}
          type="button"
          variant="ghost"
        >
          {isCreating ? <X size={14} /> : <Plus size={14} />}
          {isCreating ? "Cancel" : "New page"}
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        {isCreating && (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => void handleCreate(e)}
          >
            <div className="min-w-[220px] flex-1 space-y-2">
              <Label className={labelClass} htmlFor="new-page-title">
                Page title
              </Label>
              <Input
                autoFocus
                className={inputClass}
                id="new-page-title"
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="About"
                value={newTitle}
              />
              {newTitle.trim() && (
                <p className="font-mono text-[10px] text-white/25">
                  /{slugify(newTitle)}
                </p>
              )}
            </div>
            <Button
              className="min-h-11 border-white/20 text-[10px] uppercase tracking-[0.18em] hover:bg-white hover:text-black"
              disabled={isBusy || !newTitle.trim()}
              type="submit"
              variant="outline"
            >
              Create draft
            </Button>
          </form>
        )}

        {pages.length === 0 ? (
          <p className="text-[11px] text-white/25 uppercase tracking-[0.15em]">
            No pages yet. Create one and it appears under the site title once
            published.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {pages.map((page) => (
              <li className="flex items-center gap-3 py-3" key={page.id}>
                <button
                  className="flex-1 text-left"
                  onClick={() => void openPage(page.slug)}
                  type="button"
                >
                  <span className="text-sm text-white/85">{page.title}</span>
                  <span className="ml-2 font-mono text-[10px] text-white/25">
                    /{page.slug}
                  </span>
                </button>
                <a
                  className="text-[10px] text-white/30 uppercase tracking-[0.16em] transition-colors hover:text-white"
                  href={`/${page.slug}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  View
                </a>
                <button
                  aria-label={`Delete ${page.title}`}
                  className="text-white/25 transition-colors hover:text-red-400"
                  onClick={() => void handleDelete(page)}
                  type="button"
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
        content: next.content,
        icon: next.icon,
        order: next.order,
        slug: next.slug,
        status: next.status,
        title: next.title,
      });
      setDraft(saved);
      await onSaved();
      toast.success(
        saved.status === "published" ? "Published" : "Saved as draft"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save page");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-white/10 bg-white/[0.02]">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 font-light text-sm text-white/70 uppercase tracking-[0.2em]">
          <FileText aria-hidden size={16} />
          {draft.title}
        </CardTitle>
        <Button
          className="text-[10px] text-white/40 uppercase tracking-[0.18em] hover:text-white"
          onClick={onClose}
          type="button"
          variant="ghost"
        >
          <X className="mr-1.5" size={14} />
          Close
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label className={labelClass} htmlFor="page-title">
              Title
            </Label>
            <Input
              className={inputClass}
              id="page-title"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              value={draft.title}
            />
          </div>
          <div className="space-y-2">
            <Label className={labelClass} htmlFor="page-slug">
              Address
            </Label>
            <Input
              className={`${inputClass} font-mono`}
              id="page-slug"
              onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
              value={draft.slug}
            />
          </div>
          <div className="space-y-2">
            <Label className={labelClass} htmlFor="page-icon">
              Icon (optional)
            </Label>
            <IconPicker
              id="page-icon"
              onChange={(icon) => setDraft({ ...draft, icon })}
              value={draft.icon}
            />
          </div>
        </div>

        <PageEditor
          onChange={(content) => setDraft({ ...draft, content })}
          value={draft.content}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="flex min-h-11 items-center gap-2 border-white/20 text-[10px] uppercase tracking-[0.18em] hover:bg-white hover:text-black"
            disabled={isSaving}
            onClick={() => void save()}
            type="button"
            variant="outline"
          >
            <Save size={14} />
            {isSaving ? "Saving…" : "Save"}
          </Button>

          <Button
            className="flex min-h-11 items-center gap-2 text-[10px] text-white/50 uppercase tracking-[0.18em] hover:text-white"
            disabled={isSaving}
            onClick={() =>
              void save({
                status: draft.status === "published" ? "draft" : "published",
              })
            }
            type="button"
            variant="ghost"
          >
            {draft.status === "published" ? (
              <EyeOff size={14} />
            ) : (
              <Eye size={14} />
            )}
            {draft.status === "published" ? "Unpublish" : "Publish"}
          </Button>

          <span
            className={`text-[10px] uppercase tracking-[0.16em] ${
              draft.status === "published"
                ? "text-emerald-400/70"
                : "text-amber-400/70"
            }`}
          >
            {draft.status}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

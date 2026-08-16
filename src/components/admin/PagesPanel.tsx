import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  Edit02Icon,
  EyeIcon,
  FileEmpty02Icon,
  FloppyDiskIcon,
  ViewOffIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { Plus, X } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { IconPicker } from "../../cms/IconPicker";
import { PageEditor } from "../../cms/PageEditor";
import {
  type PageRecord,
  type PageSummary,
  pagesApi,
} from "../../services/portfolioService";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useConfirm } from "./ConfirmProvider";

const labelClass = "text-[10px] uppercase tracking-widest text-white/90";
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
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  // The address says which page is open, rather than a piece of state: editing
  // is a place you can link someone to, and Back returns to the list instead of
  // leaving the admin entirely.
  const { slug: editingSlug } = useParams<{ slug: string }>();
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
      openPage(created.slug);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create page");
    } finally {
      setIsBusy(false);
    }
  };

  /**
   * Loads whichever page the address names.
   *
   * Driven by the URL so a reload, a pasted link and the Back button all land
   * in the same place. `editing` is cleared first, so moving between two pages
   * cannot briefly show the previous one's content in the editor.
   */
  useEffect(() => {
    if (!editingSlug) {
      setEditing(null);
      return;
    }
    let cancelled = false;
    setEditing(null);
    void (async () => {
      try {
        const page = await pagesApi.get(editingSlug);
        if (!cancelled) {
          setEditing(page);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Could not open page"
          );
          navigate("/admin/pages", { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingSlug, navigate]);

  const openPage = (slug: string): void => {
    navigate(`/admin/pages/${encodeURIComponent(slug)}`);
  };

  const closeEditor = (): void => {
    navigate("/admin/pages");
  };

  const handleDelete = async (page: PageSummary): Promise<void> => {
    const ok = await confirm({
      confirmLabel: "Delete",
      description:
        "The page and its content are removed. This cannot be undone.",
      destructive: true,
      title: `Delete "${page.title}"?`,
    });
    if (!ok) {
      return;
    }
    try {
      await pagesApi.remove(page.slug);
      toast.success("Page deleted");
      if (editingSlug === page.slug) {
        closeEditor();
      }
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete page");
    }
  };

  if (editing) {
    return (
      <PageEditorPanel
        onClose={closeEditor}
        onSaved={async () => {
          await reload();
        }}
        page={editing}
      />
    );
  }

  return (
    <div className="grid w-full max-w-7xl grid-cols-1 gap-4 border-white/10">
      <div className="flex flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 font-light text-sm text-white/90 uppercase tracking-[0.2em]">
          <HugeiconsIcon icon={FileEmpty02Icon} size={16} />
          Pages
        </div>
        <Button
          onClick={() => setIsCreating((v) => !v)}
          type="button"
          variant="ghost"
        >
          {isCreating ? <X size={14} /> : <Plus size={14} />}
          {isCreating ? "Cancel" : "New page"}
        </Button>
      </div>

      {isCreating ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => void handleCreate(e)}
        >
          <Card className="w-full border-white bg-white/2">
            <CardHeader className={labelClass}>Page title</CardHeader>
            <CardContent>
              <Input
                autoFocus
                className={inputClass}
                id="new-page-title"
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Page Title"
                value={newTitle}
              />
              {newTitle.trim() ? (
                <p className="font-mono text-[10px] text-white/80">
                  /{slugify(newTitle)}
                </p>
              ) : null}
            </CardContent>
            <CardFooter className="flex items-center justify-end gap-3">
              <Button
                disabled={isBusy || !newTitle.trim()}
                type="submit"
                variant="outline"
              >
                Create draft
              </Button>
            </CardFooter>
          </Card>
        </form>
      ) : null}

      {pages.length === 0 ? (
        <p className="text-[11px] text-white/80 uppercase tracking-[0.15em]">
          No pages yet. Create one and it appears under the site title once
          published.
        </p>
      ) : (
        <ul className="grid grid-cols-1 divide-y divide-white/6">
          {pages.map((page) => (
            <Card className="border-white bg-white/2" key={page.id}>
              <CardContent>
                <li className="flex items-center gap-3 py-3">
                  <button
                    className="flex-1 text-left"
                    onClick={() => openPage(page.slug)}
                    type="button"
                  >
                    <span className="text-sm text-white/85">{page.title}</span>
                    <span className="ml-2 font-mono text-[10px] text-white/80">
                      /{page.slug}
                    </span>
                  </button>
                  <a
                    className="text-[10px] text-white/90 uppercase tracking-[0.16em] transition-colors hover:text-white"
                    href={`/${page.slug}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View
                  </a>
                  <button
                    aria-label={`Edit ${page.title}`}
                    className="text-white/80 transition-colors hover:text-blue-400"
                    onClick={() => openPage(page.slug)}
                    type="button"
                  >
                    <HugeiconsIcon icon={Edit02Icon} size={14} />
                  </button>
                  <button
                    aria-label={`Delete ${page.title}`}
                    className="text-white/80 transition-colors hover:text-red-400"
                    onClick={() => void handleDelete(page)}
                    type="button"
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={14} />
                  </button>
                </li>
              </CardContent>
            </Card>
          ))}
        </ul>
      )}
    </div>
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
    <Card className="w-full max-w-7xl border-white/10 bg-white/2">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 font-light text-sm text-white/90 uppercase tracking-[0.2em]">
          <HugeiconsIcon aria-hidden icon={FileEmpty02Icon} size={16} />
          {draft.title}
        </CardTitle>
        <Button onClick={onClose} type="button" variant="ghost">
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
            disabled={isSaving}
            onClick={() => void save()}
            type="button"
            variant="outline"
          >
            <HugeiconsIcon icon={FloppyDiskIcon} size={14} />
            {isSaving ? "Saving…" : "Save"}
          </Button>

          <Button
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
              <HugeiconsIcon icon={EyeIcon} size={14} />
            ) : (
              <HugeiconsIcon icon={ViewOffIcon} size={14} />
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

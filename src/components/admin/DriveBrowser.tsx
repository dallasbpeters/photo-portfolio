import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  Upload01Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type DriveFileEntry,
  downloadDriveFile,
  driveConfig,
  listDriveImages,
  requestDriveToken,
} from "../../boards/googleDrive";

const SEARCH_DELAY_MS = 350;

interface DriveBrowserProps {
  onAdd: (files: File[]) => void;
  onClose: () => void;
}

/**
 * A custom Google Drive browser.
 *
 * Lists the admin's images with their thumbnails, searchable and multi-select,
 * then downloads the chosen bytes so they enter the same upload path a dragged
 * file uses. This replaces Google's own picker, which cannot show thumbnails
 * under a minimal scope.
 */
export function DriveBrowser({ onAdd, onClose }: DriveBrowserProps) {
  const [files, setFiles] = useState<DriveFileEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string>("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadPage = useCallback(
    async (queryTerm: string, pageToken: string | null, append: boolean) => {
      if (tokenRef.current === "") {
        return;
      }
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setError(null);
      }
      try {
        const page = await listDriveImages(
          tokenRef.current,
          queryTerm,
          pageToken
        );
        setFiles((current) =>
          append ? [...current, ...page.files] : page.files
        );
        setNextPage(page.nextPageToken);
      } catch (err) {
        if (!append) {
          setError(
            err instanceof Error ? err.message : "Could not load Google Drive"
          );
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    []
  );

  // Sign in, then load the first page.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { clientId } = await driveConfig();
        const accessToken = await requestDriveToken(clientId);
        if (cancelled) {
          return;
        }
        tokenRef.current = accessToken;
        setToken(accessToken);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? `${err.message} — check the integration's scopes include Drive read access`
              : "Could not connect to Google Drive"
          );
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The first listing follows the token.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires once, when the token arrives; the search effect owns query-driven reloads
  useEffect(() => {
    if (token === null) {
      return;
    }
    void loadPage(query, null, false);
  }, [token]);

  // Searches settle after a pause, so keystrokes do not fire a request each.
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadPage is stable; only the query should re-run the search
  useEffect(() => {
    if (token === null) {
      return;
    }
    const timer = setTimeout(
      () => void loadPage(query, null, false),
      SEARCH_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [query]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const addSelected = async () => {
    if (tokenRef.current === "") {
      return;
    }
    const chosen = files.filter((file) => selected.has(file.id));
    if (chosen.length === 0) {
      return;
    }
    setIsDownloading(true);
    try {
      // Together: independent downloads, and waiting for each in turn would add their latencies up.
      const downloaded = await Promise.all(
        chosen.map((file) => downloadDriveFile(file, tokenRef.current))
      );
      onAdd(downloaded);
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not download from Drive"
      );
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <button
        aria-label="Close Google Drive"
        className="absolute inset-0 cursor-default bg-board-surface/70 backdrop-blur-sm"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />

      <div className="relative flex max-h-full w-[min(92vw,52rem)] flex-col overflow-hidden rounded-xl border border-board-ink/15 bg-board-panel shadow-2xl">
        <header className="shrink-0 border-board-ink/10 border-b px-4 py-3">
          <h2 className="text-[11px] text-board-ink uppercase tracking-[0.18em]">
            Add photos from Google Drive
          </h2>
          <p className="mt-1 text-[11px] text-board-ink/45 leading-relaxed">
            Search your Drive, choose images, and they will be copied into your
            photos.
          </p>
        </header>

        <div className="shrink-0 border-board-ink/10 border-b px-4 py-2">
          <div className="flex items-center gap-2 rounded-lg border border-board-ink/15 bg-board-surface/40 px-2.5">
            <HugeiconsIcon
              className="shrink-0 text-board-ink/40"
              icon={Search01Icon}
              size={15}
            />
            <input
              aria-label="Search Google Drive"
              className="w-full bg-transparent py-2 text-[12px] text-board-ink outline-none placeholder:text-board-ink/35"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your Drive…"
              type="search"
              value={query}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error ? (
            <p className="text-[12px] text-red-300/90 leading-relaxed">
              {error}
            </p>
          ) : null}

          {isLoading ? (
            <p className="text-[12px] text-board-ink/50">Loading your Drive…</p>
          ) : null}

          {!(isLoading || error) && files.length === 0 ? (
            <p className="text-[12px] text-board-ink/50 leading-relaxed">
              {query.trim()
                ? "No images match that search."
                : "No images found in your Drive."}
            </p>
          ) : null}

          {!(isLoading || error) && files.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
              {files.map((file) => {
                const checked = selected.has(file.id);
                return (
                  <button
                    aria-label={`${checked ? "Deselect" : "Select"} ${file.name}`}
                    aria-pressed={checked}
                    className={`relative aspect-square overflow-hidden rounded-lg border transition-colors ${
                      checked
                        ? "border-board-ink/70"
                        : "border-board-ink/10 hover:border-board-ink/40"
                    }`}
                    key={file.id}
                    onClick={() => toggle(file.id)}
                    type="button"
                  >
                    {file.thumbnail ? (
                      <img
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                        height={104}
                        loading="lazy"
                        src={file.thumbnail}
                        width={104}
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-board-surface/60 text-[10px] text-board-ink/40">
                        {file.name.split(".").pop()?.toUpperCase()}
                      </span>
                    )}
                    <span
                      className={`absolute top-1 right-1 flex size-4 items-center justify-center rounded-full border text-[10px] ${
                        checked
                          ? "border-board-ink bg-board-ink text-board-panel"
                          : "border-board-ink/30 bg-board-panel/70 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className="absolute inset-x-0 bottom-0 bg-board-surface/70 px-1 py-0.5 text-left text-[9px] text-board-ink/90 leading-tight backdrop-blur-sm">
                      <span className="line-clamp-2">{file.name}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {!(isLoading || error) && nextPage ? (
            <div className="mt-4 flex justify-center">
              <button
                className="rounded border border-board-ink/15 px-3 py-1.5 text-[12px] text-board-ink hover:border-board-ink/40 disabled:opacity-40"
                disabled={isLoadingMore}
                onClick={() => void loadPage(query, nextPage, true)}
                type="button"
              >
                {isLoadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-board-ink/10 border-t px-4 py-3">
          <span className="mr-auto text-[11px] text-board-ink/45">
            {selected.size > 0
              ? `${selected.size} selected`
              : "Select images to add"}
          </span>
          <button
            className="rounded px-2.5 py-1.5 text-[12px] text-board-ink/50 hover:text-board-ink"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="flex items-center gap-1.5 rounded bg-board-ink/15 px-3 py-1.5 text-[12px] text-board-ink hover:bg-board-ink/25 disabled:opacity-40"
            disabled={selected.size === 0 || isDownloading}
            onClick={() => void addSelected()}
            type="button"
          >
            <HugeiconsIcon icon={Upload01Icon} size={13} />
            {isDownloading ? "Adding…" : `Add ${selected.size}`}
          </button>
        </footer>
      </div>
    </div>
  );
}

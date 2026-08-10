import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BoardCanvas } from "../boards/BoardCanvas";
import { ShareButtons } from "../components/ShareButtons";
import { boardsApi } from "../services/portfolioService";
import { useSiteSettings } from "../theme/SiteSettingsProvider";
import type { Board, BoardItem } from "../types";

/**
 * A published board, read-only, at its own address.
 *
 * No authentication: publishing is what makes a board readable, and the API
 * returns 404 for one that is not published rather than 403 — a private board
 * should not be discoverable by the difference between the two.
 */
export function BoardViewPage() {
  const { slug } = useParams<{ slug: string }>();
  const { settings } = useSiteSettings();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await boardsApi.get(slug);
        if (!cancelled) {
          setBoard(loaded);
        }
      } catch {
        if (!cancelled) {
          setError("This board is not available.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <p className="text-[12px] text-white/60 uppercase tracking-[0.2em]">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-black">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-white/10 border-b px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate font-light text-sm text-white/90 uppercase tracking-[0.2em]">
            {board?.title ?? "Board"}
          </h1>
          <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">
            {settings.name}
          </p>
        </div>
        {board ? (
          <ShareButtons
            description={board.title}
            imageUrl={board.coverUrl ?? undefined}
            title={`${board.title} — ${settings.name}`}
            url={`/board/${board.slug ?? ""}`}
          />
        ) : null}
      </header>

      <div className="min-h-0 flex-1">
        <BoardCanvas
          items={board?.items ?? []}
          keyOf={(item: BoardItem) => item.id}
          // Nothing here can change the board; the setter exists only because
          // the canvas is shared with the editor.
          onChange={() => undefined}
          readOnly
        />
      </div>
    </div>
  );
}

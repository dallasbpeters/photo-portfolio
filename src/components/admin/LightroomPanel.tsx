import { HugeiconsIcon } from "@hugeicons/react";
import { Download01Icon } from "@hugeicons-pro/core-stroke-standard";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  type LightroomAlbum,
  type LightroomAsset,
  type LightroomStatus,
  lightroomApi,
} from "../../services/lightroomService";
import { portfolioService } from "../../services/portfolioService";
import type { Category } from "../../types";
import { Button } from "../ui/button";
import { ConnectionState } from "./LightroomConnectionState";
import "./LightroomPanel.css";

/**
 * Adobe Lightroom: browse the connected catalogue and copy pictures in.
 *
 * The panel has to explain three different kinds of "no" before it can show an
 * album, and they are genuinely different problems with different fixes:
 *
 *   not configured — the deployment has no Adobe client id/secret. Nobody can
 *                    fix this from the browser; it is an env var.
 *   not connected  — configured, but this admin has not done the handshake.
 *   not entitled   — connected to an Adobe account with no Lightroom
 *                    subscription. Authorises perfectly, then 403s on every
 *                    picture, which is the most confusing failure of the three
 *                    and so the one most worth naming.
 *
 * See config/lightroom.ts on why "not configured" may be the answer for a long
 * while: Adobe gates these APIs to partner applications it has entitled, so the
 * integration is built to sit dormant rather than to be half-present.
 */

/** What the OAuth callback says on its way back, as a `?lightroom=` param. */
const CALLBACK_MESSAGES: Record<
  string,
  { kind: "error" | "ok"; text: string }
> = {
  cancelled: { kind: "error", text: "Lightroom connection cancelled." },
  connected: { kind: "ok", text: "Lightroom connected." },
  "connected-temporary": {
    kind: "error",
    text: "Connected, but Adobe did not grant offline access — this will need reconnecting in a day. Ask Adobe to enable offline_access for the integration.",
  },
  error: {
    kind: "error",
    text: "Lightroom could not be connected. The server log has the reason.",
  },
};

export function LightroomPanel() {
  const [status, setStatus] = useState<LightroomStatus | null>(null);
  const [albums, setAlbums] = useState<LightroomAlbum[]>([]);
  const [openAlbum, setOpenAlbum] = useState<LightroomAlbum | null>(null);

  const readStatus = useCallback(async () => {
    try {
      setStatus(await lightroomApi.status());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the status");
    }
  }, []);

  useEffect(() => {
    void readStatus();
  }, [readStatus]);

  /*
   * The callback's verdict, read once and then removed from the address.
   *
   * Removed so a reload does not re-announce a connection that happened five
   * minutes ago, and so the URL stays something worth keeping.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const said = params.get("lightroom");
    const message = said ? CALLBACK_MESSAGES[said] : null;
    if (!(said && message)) {
      return;
    }
    if (message.kind === "ok") {
      toast.success(message.text);
    } else {
      toast.error(message.text);
    }
    params.delete("lightroom");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`
    );
  }, []);

  const usable = Boolean(
    status?.configured && status.connected && status.entitled !== false
  );

  const loadAlbums = useCallback(async () => {
    try {
      setAlbums((await lightroomApi.albums()).albums);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not list the albums");
    }
  }, []);

  useEffect(() => {
    if (usable) {
      void loadAlbums();
    }
  }, [usable, loadAlbums]);

  const connect = async () => {
    try {
      const { url } = await lightroomApi.connect("/admin/lightroom");
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not connect");
    }
  };

  if (!status) {
    return <p className="admin-note">Checking Lightroom…</p>;
  }

  return (
    <div className="lightroom stack stack--loose">
      <ConnectionState
        onConnect={() => void connect()}
        onDisconnect={async () => {
          await lightroomApi.disconnect();
          setAlbums([]);
          setOpenAlbum(null);
          await readStatus();
        }}
        status={status}
      />

      {usable ? (
        <div className="lightroom__browser">
          <AlbumList
            albums={albums}
            onOpen={setOpenAlbum}
            openId={openAlbum?.id ?? null}
          />
          {openAlbum ? (
            <AlbumAssets album={openAlbum} />
          ) : (
            <p className="admin-note">Choose an album.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The albums, as the tree Lightroom shows.
 *
 * A collection set holds only other albums, so it is a heading rather than
 * something to open — offering it as clickable produces an empty grid and looks
 * like a broken album.
 */
function AlbumList({
  albums,
  onOpen,
  openId,
}: {
  albums: LightroomAlbum[];
  onOpen: (album: LightroomAlbum) => void;
  openId: string | null;
}) {
  if (albums.length === 0) {
    return <p className="admin-note">No albums in this catalogue.</p>;
  }
  return (
    <ul className="lightroom__albums">
      {albums.map((album) => (
        <li key={album.id}>
          {album.isSet ? (
            <span className="lightroom__album lightroom__album--set">
              {album.name}
            </span>
          ) : (
            <button
              className={`lightroom__album ${
                openId === album.id ? "lightroom__album--on" : ""
              }`}
              onClick={() => onOpen(album)}
              type="button"
            >
              {album.name}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** One album's pictures, and the import. */
function AlbumAssets({ album }: { album: LightroomAlbum }) {
  /*
   * Categories, fetched directly rather than through useAdminData.
   *
   * That hook loads the whole photo library alongside them, which is a great
   * deal of work for the contents of one select — and this panel never shows a
   * photograph.
   */
  const [categories, setCategories] = useState<Category[]>([]);
  const [assets, setAssets] = useState<LightroomAsset[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (cursor: string | null) => {
      try {
        const page = await lightroomApi.assets(album.id, cursor);
        setAssets((prev) => (cursor ? [...prev, ...page.assets] : page.assets));
        setNext(page.next);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not read the album"
        );
      }
    },
    [album.id]
  );

  // A different album is a different list, and a selection carried across
  // would import pictures nobody is looking at.
  useEffect(() => {
    setAssets([]);
    setChosen(new Set());
    void load(null);
  }, [load]);

  useEffect(() => {
    let alive = true;
    portfolioService
      .getCategories()
      .then((found) => {
        if (alive) {
          setCategories(found);
          // Pre-selected, because an import with no destination cannot run and
          // an empty select reads as "choose" rather than as "required".
          setCategoryId((current) => current || (found[0]?.id ?? ""));
        }
      })
      .catch(() => {
        if (alive) {
          toast.error("Could not load the categories to import into");
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next2 = new Set(prev);
      if (!next2.delete(id)) {
        next2.add(id);
      }
      return next2;
    });

  const runImport = async () => {
    const picked = assets.filter(
      (asset) => chosen.has(asset.id) && !asset.imported
    );
    if (picked.length === 0 || !categoryId) {
      return;
    }
    setBusy(true);
    try {
      const result = await lightroomApi.importAssets(picked, categoryId);
      // Both halves reported. A partial import is the normal outcome when a
      // rendition is still being generated, and saying only the successes
      // would leave somebody wondering where four pictures went.
      if (result.imported > 0) {
        toast.success(
          `Imported ${result.imported} ${result.imported === 1 ? "photo" : "photos"}.`
        );
      }
      if (result.failed.length > 0) {
        toast.error(
          `${result.failed.length} could not be imported: ${result.failed[0]?.error ?? "unknown"}`
        );
      }
      setChosen(new Set());
      await load(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The import failed");
    } finally {
      setBusy(false);
    }
  };

  const pickable = assets.filter((asset) => !asset.imported);

  const assetStateClass = (asset: LightroomAsset) => {
    if (asset.imported) {
      return "lightroom__asset--done";
    }
    if (chosen.has(asset.id)) {
      return "lightroom__asset--on";
    }
    return "";
  };

  return (
    <div className="lightroom__assets stack stack--mid">
      <div className="row row--between">
        <p className="admin-caps">{album.name}</p>
        <span className="admin-note">
          {assets.length} shown · {pickable.length} not yet imported
        </span>
      </div>

      <div className="lightroom__grid">
        {assets.map((asset) => (
          <button
            className={`lightroom__asset ${assetStateClass(asset)}`}
            disabled={asset.imported}
            key={asset.id}
            onClick={() => toggle(asset.id)}
            title={
              asset.imported
                ? `${asset.fileName ?? asset.id} — already imported`
                : (asset.fileName ?? asset.id)
            }
            type="button"
          >
            {/*
              Deliberately not a thumbnail.

              A rendition needs the bearer token and the API key, so it cannot
              be loaded by an image element directly; showing one would mean
              proxying every thumbnail
              through our own API — a hundred authenticated round trips to draw
              one grid. The filename and date are what a person culls by here,
              and the pictures are in Lightroom, already being looked at.
            */}
            <span className="lightroom__asset-name">
              {asset.fileName ?? asset.id.slice(0, 10)}
            </span>
            <span className="lightroom__asset-meta">
              {asset.captureDate ? asset.captureDate.slice(0, 10) : "—"}
              {asset.camera ? ` · ${asset.camera}` : ""}
            </span>
            {asset.imported ? (
              <span className="lightroom__asset-badge">In library</span>
            ) : null}
          </button>
        ))}
      </div>

      {next ? (
        <Button onClick={() => void load(next)} type="button" variant="ghost">
          Load more
        </Button>
      ) : null}

      <div className="row lightroom__actions row--between">
        <label className="row row--snug">
          <span className="admin-note">Into</span>
          <select
            className="lightroom__category"
            onChange={(e) => setCategoryId(e.target.value)}
            value={categoryId}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={busy || chosen.size === 0 || !categoryId}
          onClick={() => void runImport()}
          type="button"
        >
          <HugeiconsIcon aria-hidden icon={Download01Icon} size={14} />
          {busy ? "Importing…" : `Import ${chosen.size || ""}`.trim()}
        </Button>
      </div>
    </div>
  );
}

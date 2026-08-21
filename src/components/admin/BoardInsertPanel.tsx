import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  MagicWand01Icon,
  Search01Icon,
  SparklesIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ICON_STYLES, type IconStyle } from "../../../config/iconStyles";
import type { NodeTypeId } from "../../../config/nodeTypes";
import { defaultPrompt } from "../../boards/defaultPrompt";
import { pickDriveImages } from "../../boards/io/googleDrive";
import { newItemId } from "../../boards/io/newItemId";
import {
  ALL_SHADERS,
  SHADER_CATEGORIES,
} from "../../boards/shaders/shaderConfig";
import {
  aiApi,
  type FalLibraryItem,
  type FramerImage,
  falLibraryApi,
  framerApi,
  type GeneratedIcon,
  type GeneratedImage,
  type PinResult,
  pinterestApi,
  type UnsplashResult,
  unsplashApi,
} from "../../services/portfolioService";
import type { BoardSource, Element, Photo } from "../../types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ElementsTab } from "./ElementsTab";

/** What the board needs to pin an image that is not one of their own. */
export interface ExternalImage {
  altText: string | null;
  creditName: string | null;
  creditUrl: string | null;
  imageUrl: string;
  thumbUrl: string | null;
}

interface BoardInsertPanelProps {
  /** Which source to open on, for a panel opened *at* something. */
  initialTab?: Tab;
  /** Places a saved style on the canvas as an Element node. */
  onAddElement: (element: Element) => void;
  onAddExternal: (image: ExternalImage) => void;
  /** Uploads and pins picked files — the same path a dragged file takes. */
  onAddFiles: (files: File[]) => void;
  /** Places an operation node on the canvas, carrying the prompt with it. */
  onAddNode: (nodeType: NodeTypeId, config: Record<string, unknown>) => void;
  onAddPhoto: (photo: Photo) => void;
  /** Places a shader on the canvas, chosen from the package's registry. */
  onAddShader: (name: string) => void;
  /** Remembers a place this board pulls references from. */
  onAttachSource: (source: BoardSource) => void;
  onDetachSource: (id: string) => void;
  photos: Photo[];
  setIsOpen: (isOpen: boolean) => void;
  sources: BoardSource[];
}

type Tab =
  | "elements"
  | "yours"
  | "drive"
  | "framer"
  | "library"
  | "unsplash"
  | "pinterest"
  | "ai"
  | "icon"
  | "shader";

const TABS: { id: Tab; label: string }[] = [
  // First, and deliberately: a style you have already found and named beats
  // going looking for the same look again.
  { id: "elements", label: "Elements" },
  { id: "yours", label: "Your photos" },
  { id: "drive", label: "Google Drive" },
  { id: "framer", label: "Framer site" },
  { id: "library", label: "fal.ai library" },
  { id: "unsplash", label: "Unsplash" },
  { id: "pinterest", label: "Pinterest" },
  { id: "ai", label: "Generate an image" },
  { id: "icon", label: "Draw an icon" },
  { id: "shader", label: "Shaders" },
];

/** A pin link carries /pin/<id>/; anything else on the domain is a board. */
const PIN_PATH = /\/pin\//;

/** Leaves just the board path, which is the readable part of a pin URL. */
const SCHEME_AND_HOST = /^https?:\/\/[^/]+\//;

/**
 * Everything that can be added to a board: your own photographs, an Unsplash
 * search, and generated images.
 *
 * The three sit in one panel rather than behind separate buttons because they
 * answer the same question — "what goes here next" — and because a reference
 * found on Unsplash is usually the starting point for a generated variation.
 */
export function BoardInsertPanel({
  initialTab,
  onAddElement,
  onAddExternal,
  onAddFiles,
  onAddNode,
  onAddPhoto,
  onAddShader,
  onAttachSource,
  onDetachSource,
  setIsOpen,
  photos,
  sources,
}: BoardInsertPanelProps) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "yours");

  // Seeded from what they already shoot, then edited freely.
  const [prompt, setPrompt] = useState(() => defaultPrompt(photos));
  const [source, setSource] = useState<UnsplashResult | null>(null);
  const [generated, setGenerated] = useState<GeneratedImage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const addUnsplash = (result: UnsplashResult) => {
    // Their terms require registering a download when a photo is used.
    unsplashApi.trackDownload(result.downloadLocation);
    onAddExternal({
      altText: result.altText,
      creditName: result.creditName,
      creditUrl: result.creditUrl,
      imageUrl: result.imageUrl,
      thumbUrl: result.thumbUrl,
    });
  };

  const makeVersions = (result: UnsplashResult) => {
    setSource(result);
    setPrompt("Same scene and composition, reinterpreted: ");
    setTab("ai");
  };

  const generate = async () => {
    const text = prompt.trim();
    if (!text) {
      return;
    }
    setIsGenerating(true);
    setGenerated(null);
    try {
      const image = await aiApi.generate(text, source?.imageUrl ?? null);
      setGenerated(image);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <motion.div
      animate={{ x: 0 }}
      className="panel absolute top-24 right-0 bottom-0 z-10 flex w-120 flex-col rounded-tl-sm border-board-ink/10 border-t border-l bg-board-surface/95 backdrop-blur"
      exit={{ x: "100%" }}
      initial={{ x: "100%" }}
      // Tween, not spring: the panel is flush to the right edge, and a spring's
      // overshoot would pull it past the viewport and show a seam.
      transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
    >
      {/* A select rather than a row of tabs. Nine sources do not fit across the
          panel at any sensible size — the row wrapped mid-label, putting "fal"
          above "library" — and a tab strip that wraps is worse than a list,
          because it reflows as the panel resizes and nothing stays where you
          last saw it. */}
      <div className="flex items-center gap-2 border-board-ink/10 border-b px-2 py-2">
        <Select
          onValueChange={(value) => {
            if (value !== null) {
              setTab(value);
            }
          }}
          value={tab}
        >
          <SelectTrigger className="w-full" data-size="lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {TABS.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <button
          aria-label="Close insert panel"
          className="min-h-9 px-2 text-board-ink/50 hover:text-board-ink"
          onClick={() => setIsOpen(false)}
          type="button"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "elements" ? <ElementsTab onAdd={onAddElement} /> : null}

        {tab === "yours" ? (
          <>
            {photos.length === 0 ? (
              <p className="text-[12px] text-board-ink/50">
                No photographs yet.
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              {photos.map((photo) => (
                <button
                  className="overflow-hidden rounded border border-board-ink/10 transition-colors hover:border-board-ink/50"
                  key={photo.id}
                  onClick={() => onAddPhoto(photo)}
                  type="button"
                >
                  <img
                    alt={photo.alt}
                    className="aspect-square w-full object-cover"
                    height={160}
                    loading="lazy"
                    src={photo.url}
                    width={160}
                  />
                </button>
              ))}
            </div>
          </>
        ) : null}

        {tab === "unsplash" ? (
          <UnsplashTab onAdd={addUnsplash} onMakeVersions={makeVersions} />
        ) : null}

        {tab === "pinterest" ? (
          <PinterestTab
            onAdd={(chosen) => {
              for (const pin of chosen) {
                onAddExternal({
                  altText: pin.altText,
                  // No invented caption. Unsplash's licence requires the
                  // photographer be named wherever the photo appears, which is
                  // why creditName paints over the image; Pinterest grants no
                  // licence and names no photographer, so a "Via Pinterest"
                  // watermark would be decoration on someone's board rather
                  // than attribution. The link below is the provenance.
                  creditName: pin.creditName,
                  creditUrl: pin.creditUrl,
                  imageUrl: pin.imageUrl,
                  thumbUrl: pin.thumbUrl,
                });
              }
            }}
            onAttach={onAttachSource}
            onDetach={onDetachSource}
            sources={sources.filter((s) => s.provider === "pinterest")}
          />
        ) : null}

        {tab === "ai" ? (
          <AiTab
            generated={generated}
            isGenerating={isGenerating}
            onAddImage={onAddExternal}
            onAddNode={() => {
              onAddNode("generate", { prompt });
              setIsOpen(false);
            }}
            onClearSource={() => setSource(null)}
            onGenerate={() => void generate()}
            onPromptChange={setPrompt}
            prompt={prompt}
            source={source}
          />
        ) : null}

        {tab === "drive" ? <DriveTab onAdd={onAddFiles} /> : null}

        {tab === "framer" ? <FramerTab onAdd={onAddExternal} /> : null}

        {tab === "library" ? <FalLibraryTab onAdd={onAddExternal} /> : null}

        {tab === "shader" ? <ShaderTab onAdd={onAddShader} /> : null}

        {tab === "icon" ? <IconTab onAdd={onAddExternal} /> : null}
      </div>
    </motion.div>
  );
}

interface AiTabProps {
  generated: GeneratedImage | null;
  isGenerating: boolean;
  onAddImage: (image: ExternalImage) => void;
  /** Places the prompt on the board as a node and closes the panel. */
  onAddNode: () => void;
  onClearSource: () => void;
  onGenerate: () => void;
  onPromptChange: (text: string) => void;
  prompt: string;
  source: UnsplashResult | null;
}

/**
 * Generating an image from a prompt.
 *
 * Its state stays on the panel rather than moving in here: "Make versions" on
 * the Unsplash tab writes the prompt and the source image before switching to
 * this one, so both have to outlive whichever tab is showing.
 */
function AiTab({
  generated,
  isGenerating,
  onAddImage,
  onAddNode,
  onClearSource,
  onGenerate,
  onPromptChange,
  prompt,
  source,
}: AiTabProps) {
  return (
    <div className="space-y-3">
      {source ? (
        <div className="flex items-center gap-2 rounded border border-board-ink/10 p-2">
          <img
            alt=""
            className="size-12 rounded object-cover"
            height={48}
            src={source.thumbUrl}
            width={48}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-board-ink/70 uppercase tracking-widest">
              Based on
            </p>
            <p className="truncate text-[10px] text-board-ink/40">
              {source.creditName}
            </p>
          </div>
          <button
            aria-label="Remove source image"
            className="text-board-ink/50 hover:text-board-ink"
            onClick={onClearSource}
            type="button"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} />
          </button>
        </div>
      ) : null}

      <textarea
        className="min-h-28 w-full resize-y rounded border border-board-ink/10 bg-board-surface/40 p-2 text-[13px] text-board-ink leading-relaxed outline-none focus:border-board-ink/40"
        onChange={(e) => onPromptChange(e.target.value)}
        value={prompt}
      />

      {/* The node is the better answer and is offered first.
          Generating here pins a flat image and throws the prompt away
          when this panel closes; a node keeps the prompt on the board,
          re-runnable, and able to feed the next node along. */}
      <Button fullWidth onClick={onAddNode} type="button" variant="outline">
        <HugeiconsIcon aria-hidden icon={SparklesIcon} size={14} />
        Add as a node
      </Button>

      <Button
        disabled={isGenerating}
        fullWidth
        onClick={onGenerate}
        type="button"
        variant="outline"
      >
        {isGenerating ? "Generating…" : "Generate a one-off instead"}
      </Button>

      {generated ? (
        <div className="space-y-2">
          <img
            alt="Generated"
            className="h-auto w-full rounded border border-board-ink/10"
            height={generated.height ?? undefined}
            src={generated.url}
            width={generated.width ?? undefined}
          />
          <Button
            fullWidth
            onClick={() =>
              onAddImage({
                altText: prompt.slice(0, 200),
                // Generated, so there is no photographer to credit.
                creditName: null,
                creditUrl: null,
                imageUrl: generated.url,
                thumbUrl: generated.url,
              })
            }
            type="button"
            variant="outline"
          >
            Add to board
          </Button>
        </div>
      ) : null}

      <p className="text-[12px] text-board-ink/30 leading-relaxed">
        Generated images are stored with the board, so they stay after the
        model's temporary link expires.
      </p>
    </div>
  );
}

/** The vendor prefix every fal model id carries, which only costs width. */
const FAL_PREFIX = /^fal-ai\//;

/** "fal-ai/recraft/v4.1/text-to-vector" → "recraft/v4.1/text-to-vector". */
const shortEndpoint = (endpoint: string): string =>
  endpoint.replace(FAL_PREFIX, "");

/**
 * Searching Unsplash for references.
 *
 * Holds its own query and results, like every other tab — the panel used to
 * carry all of them at once.
 */
function UnsplashTab({
  onAdd,
  onMakeVersions,
}: {
  onAdd: (result: UnsplashResult) => void;
  onMakeVersions: (result: UnsplashResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnsplashResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const search = async () => {
    const term = query.trim();
    if (!term) {
      return;
    }
    setIsSearching(true);
    try {
      setResults(await unsplashApi.search(term));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input
          className="min-h-10 border-board-ink/10 bg-board-surface/40 text-base"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search references…"
          value={query}
        />
        <Button aria-label="Search" size="icon" type="submit" variant="outline">
          <HugeiconsIcon icon={Search01Icon} size={14} />
        </Button>
      </form>

      {isSearching ? (
        <p className="text-[11px] text-board-ink/50 uppercase tracking-widest">
          Searching…
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {results.map((result) => (
          <div className="group relative" key={result.id}>
            <button
              className="block w-full overflow-hidden rounded border border-board-ink/10 transition-colors hover:border-board-ink/50"
              onClick={() => onAdd(result)}
              type="button"
            >
              <img
                alt={result.altText ?? ""}
                className="aspect-square w-full object-cover"
                height={160}
                loading="lazy"
                src={result.thumbUrl}
                width={160}
              />
            </button>
            {/* Credit is shown here as well as on the board, so it is
                      visible before the photograph is chosen. */}
            <p className="truncate pt-1 text-[9px] text-board-ink/40">
              {result.creditName}
            </p>
            <button
              className="absolute inset-x-0 bottom-5 flex items-center justify-center gap-1 bg-board-surface/80 py-1 text-[9px] text-board-ink uppercase tracking-widest opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              onClick={() => onMakeVersions(result)}
              type="button"
            >
              <HugeiconsIcon icon={MagicWand01Icon} size={11} />
              Make versions
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Picking images out of Google Drive.
 *
 * The button is the whole interface: Google's own picker is the browser, which
 * is what lets this ask only for the files you choose rather than for your
 * whole Drive. The files are copied here, so a board keeps working if the
 * original moves.
 */
function DriveTab({ onAdd }: { onAdd: (files: File[]) => void }) {
  const [isPicking, setIsPicking] = useState(false);

  const pick = async () => {
    setIsPicking(true);
    try {
      const files = await pickDriveImages();
      if (files.length > 0) {
        onAdd(files);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open Drive");
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        disabled={isPicking}
        fullWidth
        onClick={() => void pick()}
        type="button"
        variant="ghost"
      >
        {isPicking ? "Waiting for Google…" : "Choose from Drive"}
      </Button>
      <p className="text-[10px] text-board-ink/35 leading-relaxed">
        Only the files you pick are shared with this site. They are copied here,
        so a board keeps working if the original moves.
      </p>
    </div>
  );
}

/**
 * The images on a published Framer page.
 *
 * A page address rather than a project: Framer's Server API documents nothing
 * for listing a project's assets, and a published page works on any custom
 * domain with no key at all. The cost is that unpublished work is out of reach.
 */
function FramerTab({ onAdd }: { onAdd: (image: ExternalImage) => void }) {
  const [url, setUrl] = useState("");
  const [images, setImages] = useState<FramerImage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const read = async () => {
    if (!url.trim()) {
      return;
    }
    setIsReading(true);
    setImages([]);
    setNotice(null);
    try {
      const page = await framerApi.page(url.trim());
      setImages(page.images);
      setNotice(page.notice ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that");
    } finally {
      setIsReading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void read();
            }
          }}
          placeholder="https://your-site.framer.website/work"
          value={url}
        />
        <Button
          disabled={isReading}
          onClick={() => void read()}
          type="button"
          variant="ghost"
        >
          {isReading ? "Reading…" : "Read"}
        </Button>
      </div>

      {notice ? (
        <p className="text-[10px] text-amber-300/70 leading-relaxed">
          {notice}
        </p>
      ) : null}

      {images.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[9px] text-board-ink/30 uppercase tracking-[0.18em]">
              {images.length} found
            </p>
            <button
              className="text-[9px] text-board-ink/50 uppercase tracking-[0.14em] hover:text-board-ink"
              onClick={() => {
                for (const image of images) {
                  onAdd({
                    altText: image.altText,
                    creditName: null,
                    creditUrl: url.trim(),
                    imageUrl: image.imageUrl,
                    thumbUrl: image.thumbUrl,
                  });
                }
              }}
              type="button"
            >
              Add all
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {images.map((image) => (
              <button
                className="overflow-hidden rounded border border-board-ink/10 hover:border-board-ink/40"
                key={image.imageUrl}
                onClick={() =>
                  onAdd({
                    altText: image.altText,
                    creditName: null,
                    creditUrl: url.trim(),
                    imageUrl: image.imageUrl,
                    thumbUrl: image.thumbUrl,
                  })
                }
                type="button"
              >
                <img
                  alt={image.altText ?? "Framer asset"}
                  className="aspect-square w-full bg-board-panel object-cover"
                  height={160}
                  loading="lazy"
                  src={image.thumbUrl}
                  width={160}
                />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Everything the fal account has already generated.
 *
 * A second source rather than a duplicate of the boards: it lists work done in
 * fal's own playground too, which this app never saw and has no other way to
 * reach.
 *
 * Adding one copies the bytes into our storage first. fal serves output from a
 * scratch host, so pinning its URL straight onto a board would leave a broken
 * image behind once the link lapses — the copy is what makes it ours.
 */
function FalLibraryTab({ onAdd }: { onAdd: (image: ExternalImage) => void }) {
  const [items, setItems] = useState<FalLibraryItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<string | null>(null);

  const load = useCallback(async (next: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await falLibraryApi.list(next);
      // Appended rather than replaced, so paging builds one long roll instead
      // of making you hold the previous page in your head.
      setItems((current) =>
        next === 1 ? result.items : [...current, ...result.items]
      );
      setHasMore(result.hasMore);
      setPage(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not read your library"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  const adopt = async (item: FalLibraryItem) => {
    setAdopting(item.id);
    try {
      const url = await falLibraryApi.adopt(item);
      onAdd({
        altText: item.prompt,
        // No credit: this is the account's own generated output, so there is
        // nobody to attribute it to.
        creditName: null,
        creditUrl: null,
        imageUrl: url,
        thumbUrl: url,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add that");
    } finally {
      setAdopting(null);
    }
  };

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-amber-300/80">{error}</p>
        <p className="text-[10px] text-board-ink/35 leading-relaxed">
          fal's history endpoint is undocumented and still marked alpha, so it
          may simply have moved. Everything else on this panel is unaffected.
        </p>
        <Button onClick={() => void load(1)} type="button" variant="ghost">
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.length === 0 && !isLoading ? (
        <p className="text-[11px] text-board-ink/40">
          Nothing generated on this fal account in the last 90 days.
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <button
            className="group relative overflow-hidden rounded border border-board-ink/10 hover:border-board-ink/40 disabled:opacity-40"
            disabled={adopting !== null}
            key={item.id}
            onClick={() => void adopt(item)}
            title={item.prompt ?? shortEndpoint(item.endpoint)}
            type="button"
          >
            <img
              alt={item.prompt ?? "Generated image"}
              className="aspect-square w-full bg-board-panel object-cover"
              // Square by CSS regardless of the real aspect, so the grid stays
              // a grid; the intrinsic size is only a hint against layout shift.
              height={160}
              loading="lazy"
              src={item.previewUrl}
              width={160}
            />
            <span className="absolute inset-x-0 bottom-0 truncate bg-board-surface/70 px-1 py-0.5 text-[8px] text-board-ink/60">
              {adopting === item.id ? "Saving…" : shortEndpoint(item.endpoint)}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-[10px] text-board-ink/40 uppercase tracking-[0.18em]">
          Loading…
        </p>
      ) : null}

      {hasMore && !isLoading ? (
        <Button
          fullWidth
          onClick={() => void load(page + 1)}
          type="button"
          variant="ghost"
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The shader picker.
 *
 * Built entirely from the installed package's registry — 189 effects across ten
 * categories, none of them listed here. A package update changes what this
 * offers without a line of code changing, which is the whole reason the
 * registry is worth leaning on.
 */
function ShaderTab({ onAdd }: { onAdd: (name: string) => void }) {
  const [category, setCategory] = useState<string>(SHADER_CATEGORIES[0] ?? "");
  const shown = ALL_SHADERS.filter((shader) => shader.category === category);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {SHADER_CATEGORIES.map((name) => (
          <button
            className={`min-h-7 rounded px-2 text-[10px] tracking-[0.08em] transition-colors ${
              category === name
                ? "bg-board-ink/10 text-board-ink"
                : "text-board-ink/40 hover:text-board-ink/80"
            }`}
            key={name}
            onClick={() => setCategory(name)}
            type="button"
          >
            {name}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        {shown.map((shader) => (
          <button
            className="block w-full rounded border border-board-ink/10 px-2 py-2 text-left transition-colors hover:border-board-ink/40"
            key={shader.name}
            onClick={() => onAdd(shader.name)}
            type="button"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-[12px] text-board-ink/85">
                {shader.name}
              </span>
              {/* Half the library transforms whatever sits inside it rather
                  than drawing alone, and that changes how it is used. */}
              {shader.requiresChild ? (
                <span className="shrink-0 text-[9px] text-sky-300/60 uppercase tracking-widest">
                  wraps
                </span>
              ) : null}
            </span>
            {shader.description ? (
              <span className="mt-0.5 block truncate text-[10px] text-board-ink/35">
                {shader.description}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

interface PinterestTabProps {
  onAdd: (pins: PinResult[]) => void;
  /** Remembers a board so it can be pulled from again later. */
  onAttach: (source: BoardSource) => void;
  onDetach: (id: string) => void;
  /** Boards already attached to this moodboard, so they can be reopened. */
  sources: BoardSource[];
}

/**
 * Pulling a board — or a single pin — onto the canvas from its link.
 *
 * Both come from surfaces Pinterest publishes for other sites to read: a
 * board's RSS feed and a pin's oEmbed/OpenGraph data. A board feed carries a
 * page of recent pins rather than the whole history, which is said on the panel
 * rather than left to be discovered by counting.
 */
function PinterestTab({
  onAdd,
  onAttach,
  onDetach,
  sources,
}: PinterestTabProps) {
  // The tab's own working state. It used to live in the panel along with every
  // other tab's, which is what pushed that component past the complexity limit.
  const [url, onUrlChange] = useState("");
  const [pins, setPins] = useState<PinResult[]>([]);
  const [boardTitle, setBoardTitle] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  /**
   * One field for both shapes.
   *
   * A pin link has /pin/<id>/ in it and anything else on pinterest.com is a
   * board, so the distinction is free — asking someone to say which they pasted
   * would be asking them to tell us what we can already see.
   */
  const load = async (override?: string) => {
    const target = (override ?? url).trim();
    if (!target) {
      return;
    }
    setIsResolving(true);
    setPins([]);
    setBoardTitle(null);
    try {
      if (PIN_PATH.test(target)) {
        setPins([await pinterestApi.resolve(target)]);
      } else {
        const board = await pinterestApi.board(target);
        setPins(board.pins);
        setBoardTitle(board.title);
        // Remembered as soon as it resolves, not when a pin is added: the point
        // is to be able to come back to it, which is true whether or not
        // anything was taken from it this time.
        onAttach({
          id: newItemId(),
          provider: "pinterest",
          title: board.title,
          url: target,
        });
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not read that link"
      );
    } finally {
      setIsResolving(false);
    }
  };

  const onResolve = () => void load();
  const onOpenSource = (sourceUrl: string) => {
    onUrlChange(sourceUrl);
    void load(sourceUrl);
  };
  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onResolve();
        }}
      >
        <Input
          className="min-h-10 border-board-ink/10 bg-board-surface/40 text-base"
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="Paste a board or pin link…"
          value={url}
        />
        <Button
          aria-label="Load from Pinterest"
          disabled={isResolving}
          size="icon"
          type="submit"
          variant="outline"
        >
          <HugeiconsIcon icon={Search01Icon} size={14} />
        </Button>
      </form>

      {/* Boards this moodboard already draws on, kept so one can be reopened
          and pulled from again without hunting for the link. */}
      {sources.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {sources.map((source) => (
            <span
              className="flex items-center gap-1 rounded-full border border-board-ink/15 py-1 pr-1 pl-2 text-[10px] text-board-ink/60"
              key={source.id}
            >
              <button
                className="max-w-36 truncate hover:text-board-ink"
                onClick={() => onOpenSource(source.url)}
                type="button"
              >
                {source.title ?? source.url.replace(SCHEME_AND_HOST, "")}
              </button>
              <button
                aria-label={`Detach ${source.title ?? "board"}`}
                className="text-board-ink/30 hover:text-board-ink"
                onClick={() => onDetach(source.id)}
                type="button"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={11} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {isResolving ? (
        <p className="text-[11px] text-board-ink/50 uppercase tracking-widest">
          Reading…
        </p>
      ) : null}

      {pins.length > 0 ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[10px] text-board-ink/50 uppercase tracking-[0.18em]">
              {boardTitle ?? "Pinterest"} · {pins.length}
            </p>
            {pins.length > 1 ? (
              <button
                className="shrink-0 text-[10px] text-board-ink/70 uppercase tracking-[0.14em] hover:text-board-ink"
                onClick={() => onAdd(pins)}
                type="button"
              >
                Add all
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {pins.map((pin) => (
              <button
                className="overflow-hidden rounded border border-board-ink/10 transition-colors hover:border-board-ink/50"
                key={pin.creditUrl}
                onClick={() => onAdd([pin])}
                type="button"
              >
                <img
                  alt={pin.altText ?? "Pin"}
                  className="aspect-square w-full object-cover"
                  height={160}
                  loading="lazy"
                  src={pin.thumbUrl ?? pin.imageUrl}
                  width={160}
                />
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* Said plainly rather than buried: Pinterest grants no licence of its
          own, and most pins are someone else's photograph. A link back to the
          pin travels with the item, but that is provenance, not permission. */}
      <p className="text-[10px] text-board-ink/30 leading-relaxed">
        A board link pulls the pins its public feed lists — recent ones, not the
        whole board. Pins are hot-linked and keep a link back. Most are someone
        else's work: fine as private reference, worth checking before you
        publish a board or sell anything made from one.
      </p>
    </div>
  );
}

/**
 * Drawing an icon from a description.
 *
 * Its own component, but its state belongs to the panel: switching to Unsplash
 * and back must not discard an icon that has just been paid for.
 */
function IconTab({ onAdd }: { onAdd: (image: ExternalImage) => void }) {
  // Held here rather than in the panel. The panel was carrying the state of
  // every tab at once, which is what pushed it past the complexity limit as
  // the ninth tab landed — a tab's working state belongs to the tab.
  const [prompt, onPrompt] = useState("");
  const [style, onStyle] = useState<IconStyle>(ICON_STYLES[0]);
  const [icon, setIcon] = useState<GeneratedIcon | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const onDraw = async () => {
    const text = prompt.trim();
    if (!text) {
      return;
    }
    setIsDrawing(true);
    setIcon(null);
    try {
      setIcon(await aiApi.generateIcon(text, style));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not draw that");
    } finally {
      setIsDrawing(false);
    }
  };

  return (
    <div className="space-y-3">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void onDraw();
        }}
      >
        <Input
          className="min-h-10 border-board-ink/10 bg-board-surface/40 text-base"
          onChange={(e) => onPrompt(e.target.value)}
          placeholder="Describe an icon…"
          value={prompt}
        />

        <div className="flex flex-wrap gap-1">
          {ICON_STYLES.map((option) => (
            <button
              className={`min-h-8 px-2 text-[10px] uppercase tracking-[0.14em] transition-colors ${
                style === option
                  ? "bg-board-ink/10 text-board-ink"
                  : "text-board-ink/40 hover:text-board-ink/80"
              }`}
              key={option}
              onClick={() => onStyle(option)}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>

        <Button disabled={isDrawing} fullWidth type="submit" variant="outline">
          <HugeiconsIcon aria-hidden icon={SparklesIcon} size={14} />
          {isDrawing ? "Drawing…" : "Draw icon"}
        </Button>
      </form>

      {icon ? (
        <div className="space-y-2">
          {/* Pale backing: a solid icon is usually dark, and against the
              panel's black it would look like an empty box. */}
          <div className="flex items-center justify-center rounded border border-board-ink/10 bg-board-ink/90 p-4">
            <img
              alt="Generated icon"
              className="h-24 w-24 object-contain"
              height={96}
              src={icon.url}
              width={96}
            />
          </div>
          <Button
            fullWidth
            onClick={() =>
              onAdd({
                altText: prompt.slice(0, 200),
                // Generated, so there is no one to credit.
                creditName: null,
                creditUrl: null,
                imageUrl: icon.url,
                thumbUrl: icon.url,
              })
            }
            type="button"
            variant="outline"
          >
            Add to board
          </Button>
        </div>
      ) : null}

      {icon && !icon.isVector ? (
        <p className="text-[10px] text-amber-300/70 leading-relaxed">
          Magnific's vectoriser was unavailable, so this came back as a PNG
          rather than an SVG. It still works on the board; it will not stay
          sharp all the way in.
        </p>
      ) : null}

      <p className="text-[10px] text-board-ink/30 leading-relaxed">
        Icons are drawn as SVG so they stay sharp at any zoom, falling back to
        PNG when the vectoriser is down. Simple shapes vectorise best.
      </p>
    </div>
  );
}

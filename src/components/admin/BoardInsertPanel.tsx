import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  MagicWand01Icon,
  Search01Icon,
  SparklesIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { useState } from "react";
import { toast } from "sonner";
import { ICON_STYLES, type IconStyle } from "../../../config/iconStyles";
import { defaultPrompt } from "../../boards/defaultPrompt";
import {
  aiApi,
  type GeneratedIcon,
  type GeneratedImage,
  type UnsplashResult,
  unsplashApi,
} from "../../services/portfolioService";
import type { Photo } from "../../types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

/** What the board needs to pin an image that is not one of their own. */
export interface ExternalImage {
  altText: string | null;
  creditName: string | null;
  creditUrl: string | null;
  imageUrl: string;
  thumbUrl: string | null;
}

interface BoardInsertPanelProps {
  onAddExternal: (image: ExternalImage) => void;
  onAddPhoto: (photo: Photo) => void;
  onClose: () => void;
  photos: Photo[];
}

type Tab = "yours" | "unsplash" | "ai" | "icon";

const TABS: { id: Tab; label: string }[] = [
  { id: "yours", label: "Yours" },
  { id: "unsplash", label: "Unsplash" },
  { id: "ai", label: "Generate" },
  { id: "icon", label: "Icon" },
];

const tabClass = (isActive: boolean) =>
  `min-h-9 flex-1 text-[10px] uppercase tracking-[0.18em] transition-colors ${
    isActive ? "text-white" : "text-white/40 hover:text-white/70"
  }`;

/**
 * Everything that can be added to a board: your own photographs, an Unsplash
 * search, and generated images.
 *
 * The three sit in one panel rather than behind separate buttons because they
 * answer the same question — "what goes here next" — and because a reference
 * found on Unsplash is usually the starting point for a generated variation.
 */
export function BoardInsertPanel({
  onAddExternal,
  onAddPhoto,
  onClose,
  photos,
}: BoardInsertPanelProps) {
  const [tab, setTab] = useState<Tab>("yours");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnsplashResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Seeded from what they already shoot, then edited freely.
  const [prompt, setPrompt] = useState(() => defaultPrompt(photos));
  const [source, setSource] = useState<UnsplashResult | null>(null);
  const [generated, setGenerated] = useState<GeneratedImage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const [iconPrompt, setIconPrompt] = useState("");
  const [iconStyle, setIconStyle] = useState<IconStyle>(ICON_STYLES[0]);
  const [icon, setIcon] = useState<GeneratedIcon | null>(null);
  const [isDrawingIcon, setIsDrawingIcon] = useState(false);

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

  const drawIcon = async () => {
    const text = iconPrompt.trim();
    if (!text) {
      return;
    }
    setIsDrawingIcon(true);
    setIcon(null);
    try {
      setIcon(await aiApi.generateIcon(text, iconStyle));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not draw an icon"
      );
    } finally {
      setIsDrawingIcon(false);
    }
  };

  return (
    <div className="absolute inset-y-0 right-0 z-10 flex w-120 flex-col border-white/10 border-l bg-black/95 backdrop-blur">
      <div className="flex items-center gap-1 border-white/10 border-b px-2">
        {TABS.map((t) => (
          <button
            className={tabClass(tab === t.id)}
            key={t.id}
            onClick={() => setTab(t.id)}
            type="button"
          >
            {t.label}
          </button>
        ))}
        <button
          aria-label="Close insert panel"
          className="min-h-9 px-2 text-white/50 hover:text-white"
          onClick={onClose}
          type="button"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "yours" ? (
          <>
            {photos.length === 0 ? (
              <p className="text-[12px] text-white/50">No photographs yet.</p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              {photos.map((photo) => (
                <button
                  className="overflow-hidden rounded border border-white/10 transition-colors hover:border-white/50"
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
          <>
            <form
              className="mb-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
            >
              <Input
                className="min-h-10 border-white/10 bg-black/40 text-base"
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search references…"
                value={query}
              />
              <Button
                aria-label="Search"
                className="min-h-10 border-white/20"
                type="submit"
                variant="outline"
              >
                <HugeiconsIcon icon={Search01Icon} size={14} />
              </Button>
            </form>

            {isSearching ? (
              <p className="text-[11px] text-white/50 uppercase tracking-widest">
                Searching…
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              {results.map((result) => (
                <div className="group relative" key={result.id}>
                  <button
                    className="block w-full overflow-hidden rounded border border-white/10 transition-colors hover:border-white/50"
                    onClick={() => addUnsplash(result)}
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
                  <p className="truncate pt-1 text-[9px] text-white/40">
                    {result.creditName}
                  </p>
                  <button
                    className="absolute inset-x-0 bottom-5 flex items-center justify-center gap-1 bg-black/80 py-1 text-[9px] text-white uppercase tracking-widest opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    onClick={() => makeVersions(result)}
                    type="button"
                  >
                    <HugeiconsIcon icon={MagicWand01Icon} size={11} />
                    Make versions
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {tab === "ai" ? (
          <div className="space-y-3">
            {source ? (
              <div className="flex items-center gap-2 rounded border border-white/10 p-2">
                <img
                  alt=""
                  className="size-12 rounded object-cover"
                  height={48}
                  src={source.thumbUrl}
                  width={48}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-white/70 uppercase tracking-widest">
                    Based on
                  </p>
                  <p className="truncate text-[10px] text-white/40">
                    {source.creditName}
                  </p>
                </div>
                <button
                  aria-label="Remove source image"
                  className="text-white/50 hover:text-white"
                  onClick={() => setSource(null)}
                  type="button"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={14} />
                </button>
              </div>
            ) : null}

            <textarea
              className="min-h-28 w-full resize-y rounded border border-white/10 bg-black/40 p-2 text-[13px] text-white leading-relaxed outline-none focus:border-white/40"
              onChange={(e) => setPrompt(e.target.value)}
              value={prompt}
            />

            <Button
              className="min-h-11 w-full border-white/20 text-[10px] uppercase tracking-[0.18em] hover:bg-white hover:text-black"
              disabled={isGenerating}
              onClick={() => void generate()}
              type="button"
              variant="outline"
            >
              <HugeiconsIcon aria-hidden icon={SparklesIcon} size={14} />
              {isGenerating ? "Generating…" : "Generate"}
            </Button>

            {generated ? (
              <div className="space-y-2">
                <img
                  alt="Generated"
                  className="h-auto w-full rounded border border-white/10"
                  height={generated.height ?? undefined}
                  src={generated.url}
                  width={generated.width ?? undefined}
                />
                <Button
                  className="min-h-11 w-full border-white/20 text-[10px] uppercase tracking-[0.18em] hover:bg-white hover:text-black"
                  onClick={() =>
                    onAddExternal({
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

            <p className="text-[10px] text-white/30 leading-relaxed">
              Generated images are stored with the board, so they stay after the
              model's temporary link expires.
            </p>
          </div>
        ) : null}

        {tab === "icon" ? (
          <IconTab
            icon={icon}
            isDrawing={isDrawingIcon}
            onAdd={() => {
              if (icon) {
                onAddExternal({
                  altText: iconPrompt.slice(0, 200),
                  // Generated, so there is no one to credit.
                  creditName: null,
                  creditUrl: null,
                  imageUrl: icon.url,
                  thumbUrl: icon.url,
                });
              }
            }}
            onDraw={() => void drawIcon()}
            onPrompt={setIconPrompt}
            onStyle={setIconStyle}
            prompt={iconPrompt}
            style={iconStyle}
          />
        ) : null}
      </div>
    </div>
  );
}

interface IconTabProps {
  icon: GeneratedIcon | null;
  isDrawing: boolean;
  onAdd: () => void;
  onDraw: () => void;
  onPrompt: (prompt: string) => void;
  onStyle: (style: IconStyle) => void;
  prompt: string;
  style: IconStyle;
}

/**
 * Drawing an icon from a description.
 *
 * Its own component, but its state belongs to the panel: switching to Unsplash
 * and back must not discard an icon that has just been paid for.
 */
function IconTab({
  icon,
  isDrawing,
  onAdd,
  onDraw,
  onPrompt,
  onStyle,
  prompt,
  style,
}: IconTabProps) {
  return (
    <div className="space-y-3">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onDraw();
        }}
      >
        <Input
          className="min-h-10 border-white/10 bg-black/40 text-base"
          onChange={(e) => onPrompt(e.target.value)}
          placeholder="Describe an icon…"
          value={prompt}
        />

        <div className="flex flex-wrap gap-1">
          {ICON_STYLES.map((option) => (
            <button
              className={`min-h-8 px-2 text-[10px] uppercase tracking-[0.14em] transition-colors ${
                style === option
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/80"
              }`}
              key={option}
              onClick={() => onStyle(option)}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>

        <Button
          className="min-h-11 w-full border-white/20 text-[10px] uppercase tracking-[0.18em] hover:bg-white hover:text-black"
          disabled={isDrawing}
          type="submit"
          variant="outline"
        >
          <HugeiconsIcon aria-hidden icon={SparklesIcon} size={14} />
          {isDrawing ? "Drawing…" : "Draw icon"}
        </Button>
      </form>

      {icon ? (
        <div className="space-y-2">
          {/* Pale backing: a solid icon is usually dark, and against the
              panel's black it would look like an empty box. */}
          <div className="flex items-center justify-center rounded border border-white/10 bg-white/90 p-4">
            <img
              alt="Generated icon"
              className="h-24 w-24 object-contain"
              height={96}
              src={icon.url}
              width={96}
            />
          </div>
          <Button
            className="min-h-11 w-full border-white/20 text-[10px] uppercase tracking-[0.18em] hover:bg-white hover:text-black"
            onClick={onAdd}
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

      <p className="text-[10px] text-white/30 leading-relaxed">
        Icons are drawn as SVG so they stay sharp at any zoom, falling back to
        PNG when the vectoriser is down. Simple shapes vectorise best.
      </p>
    </div>
  );
}

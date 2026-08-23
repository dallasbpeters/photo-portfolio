import { HugeiconsIcon } from "@hugeicons/react";
import {
  PaintBoardIcon,
  PlusSignIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { BrandKitDoc } from "../../../config/brandKit.js";
import {
  EMPTY_KIT,
  inheritedParts,
  kitPromptText,
  MAX_KIT_NAME,
  MAX_VOICE,
  resolveKitDoc,
  sanitizeKitDoc,
} from "../../../config/brandKit.js";
import { useBrandKits } from "../../hooks/useBrandKits";
import { type BrandKit, brandKitsApi } from "../../services/brandKitService";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { KitCard } from "./BrandKitCard";
import {
  CssImport,
  LogoEditor,
  LookPicker,
  PaletteEditor,
  TypefaceEditor,
} from "./BrandKitFields";
import { FormatPreviews, PalettePreview } from "./BrandKitPreviews";
import { useConfirm } from "./ConfirmProvider";
import "../../styles/primitives.css";
import "../../styles/adminChrome.css";
import "./BrandKitsPanel.css";

/**
 * The brand kits: the library, and the one being edited.
 *
 * One screen, because a kit is only judgeable whole. The palette without the
 * voice is a swatch grid, and the voice without the palette is a paragraph
 * nobody can check anything against — which is the failure `config/brandKit.ts`
 * describes when it says a kit is a governing document rather than a moodboard.
 * Its limits were chosen so that every part can be shown at once; this is the
 * screen that was assumed.
 *
 * Editing is local until Save. Every save writes a *version*, so autosaving a
 * keystroke would mint a version per character and make the history useless for
 * the one question it exists to answer.
 *
 * That rule is right, and on its own it lost a kit. Local-until-Save means the
 * editor holds the only copy of everything typed into it, and leaving discarded
 * that copy without a word — a whole brand built up, a click on "Back to kits",
 * and a card still reading "0 colours". So every way out of a dirty editor is
 * now guarded: the button asks, and the browser asks on unload. The dirty state
 * is also said out loud rather than left implied by an enabled button, because
 * "there is unsaved work here" is exactly what nobody could see.
 */

function KitEditor({
  kit,
  onClose,
  onSaved,
  parentDoc,
}: {
  kit: BrandKit;
  onClose: () => void;
  onSaved: () => void;
  /** The parent's resolved document, when this kit is a sub-brand. */
  parentDoc: BrandKitDoc | null;
}) {
  const { confirm } = useConfirm();
  const [doc, setDoc] = useState<BrandKitDoc>(kit.doc);
  const [name, setName] = useState(kit.name);
  const [isSaving, setIsSaving] = useState(false);

  // A different kit in the same slot is a different document.
  useEffect(() => {
    setDoc(kit.doc);
    setName(kit.name);
  }, [kit.doc, kit.name]);

  const isDirty =
    JSON.stringify(sanitizeKitDoc(doc)) !== JSON.stringify(kit.doc) ||
    name.trim() !== kit.name;

  /*
   * The browser's own guard, for the exits this component cannot see.
   *
   * Closing the tab, reloading, and following one of the admin's nav links all
   * unmount the editor without going through its own button. The router here is
   * a plain <Routes> with no navigation blocker to hook, so this is the only
   * thing that covers a reload or a close — and it is the case that matters
   * most, because there is nothing to come back to.
   */
  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Assigning returnValue is what actually triggers the prompt in Safari
      // and older Chrome; preventDefault alone is the modern spelling and both
      // are needed for it to fire everywhere.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  /** Leaving, having asked first if there is anything to lose. */
  const close = async () => {
    if (
      isDirty &&
      !(await confirm({
        cancelLabel: "Keep editing",
        confirmLabel: "Discard changes",
        description:
          "This kit has edits that have not been saved as a version. Leaving now throws them away.",
        destructive: true,
        title: "Discard unsaved changes?",
      }))
    ) {
      return;
    }
    onClose();
  };

  const save = async () => {
    setIsSaving(true);
    try {
      if (name.trim() && name.trim() !== kit.name) {
        await brandKitsApi.rename(kit.id, name.trim());
      }
      await brandKitsApi.save(kit.id, sanitizeKitDoc(doc));
      toast.success("Kit saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the kit");
    } finally {
      setIsSaving(false);
    }
  };

  /* What the kit means as edited: the parent's parts still showing through
     wherever this one leaves a gap. `resolvedDoc` from the server covers the
     saved state; this recomputes it live against the same rule. */
  const own = sanitizeKitDoc(doc);
  const inheritedFrom = kit.parentId ? parentDoc : null;
  const effective = resolveKitDoc(own, inheritedFrom);
  /* Recomputed from what is on screen, not read off the saved kit: overriding a
     part should stop the panel claiming to inherit it before the save, or the
     line contradicts the fields under it. */
  const inheriting = inheritedParts(own, inheritedFrom);
  const prompt = kitPromptText(effective);

  return (
    <div className="brand-kit">
      <div className="brand-kit__editor stack stack--mid">
        <div className="row row--between">
          <Input
            aria-label="Kit name"
            className="admin-control brand-kit__name"
            maxLength={MAX_KIT_NAME}
            onChange={(e) => setName(e.target.value)}
            value={name}
          />
          <span className="admin-note--quiet">
            {kit.version === null
              ? "No version yet"
              : `v${kit.version} of ${kit.versionCount}`}
          </span>
        </div>

        {/*
          A sub-brand's empty parts are not empty in effect — they are the
          parent's. Said out loud, because a palette that looks unset but paints
          the previews is the most confusing state this panel can be in.
        */}
        {kit.parentName ? (
          <p className="brand-kit__inherits">
            A sub-brand of <strong>{kit.parentName}</strong>
            {inheriting.length > 0
              ? ` — taking its ${inheriting.join(", ")}. Fill a part in here to override it.`
              : " — overriding every part."}
          </p>
        ) : null}

        <section className="stack stack--tight">
          <h3 className="admin-caps">Palette</h3>
          <PaletteEditor doc={doc} onChange={setDoc} />
        </section>

        <section className="stack stack--snug">
          <h3 className="admin-caps">Colours from CSS</h3>
          <CssImport doc={doc} onChange={setDoc} />
        </section>

        <section className="stack stack--tight">
          <h3 className="admin-caps">Logos</h3>
          <LogoEditor doc={doc} onChange={setDoc} />
        </section>

        <section className="stack stack--tight">
          <h3 className="admin-caps">Typefaces</h3>
          <TypefaceEditor doc={doc} onChange={setDoc} />
        </section>

        <section className="stack stack--tight">
          <h3 className="admin-caps">Look</h3>
          <LookPicker doc={doc} onChange={setDoc} />
        </section>

        <section className="stack stack--snug">
          <h3 className="admin-caps">Voice</h3>
          <textarea
            aria-label="Voice"
            className="admin-control brand-kit__voice"
            maxLength={MAX_VOICE}
            onChange={(e) => setDoc({ ...doc, voice: e.target.value })}
            placeholder="Plain, unfussy, never salesy. Short sentences."
            value={doc.voice}
          />
          <p className="brand-kit__count">
            {doc.voice.length} / {MAX_VOICE}
          </p>
        </section>

        {/*
          What the kit actually contributes to a generation, quoted back.
          A kit that shapes a picture in ways nobody can read is the
          "guidelines nobody applies" problem wearing a new costume — the
          reasoning kitPromptText already carries.
        */}
        <section className="stack stack--snug">
          <h3 className="admin-caps">What this sends to a model</h3>
          <p className="brand-kit__prompt">
            {prompt || "Nothing yet — add a colour or a line of voice."}
          </p>
        </section>

        <div className="row row--between">
          <Button onClick={() => void close()} type="button" variant="ghost">
            Back to kits
          </Button>
          <span className="row row--snug">
            {/* Said, not implied. An enabled Save button was the only sign that
                this screen held the sole copy of the work, and it was not
                enough — see the note at the top of the file. */}
            {isDirty ? (
              <span className="brand-kit__unsaved">Unsaved changes</span>
            ) : null}
            <Button
              disabled={!isDirty || isSaving}
              onClick={() => void save()}
              type="button"
            >
              {isSaving ? "Saving…" : "Save a new version"}
            </Button>
          </span>
        </div>
      </div>

      {/*
        Previewed from the *resolved* document, not this kit's own.
        A sub-brand that states nothing still produces its parent's brand, and a
        preview showing an empty palette next to a prompt full of colours is the
        panel contradicting itself. The left column edits what this kit states;
        this column is the outcome.
       */}
      <div className="brand-kit__aside stack stack--mid">
        <section className="stack stack--snug">
          <h3 className="admin-caps">Colours</h3>
          <PalettePreview doc={effective} />
        </section>
        <section className="stack stack--snug">
          <h3 className="admin-caps">In the formats it will be used in</h3>
          <FormatPreviews doc={effective} name={name || "Your brand"} />
        </section>
      </div>
    </div>
  );
}

/**
 * One kit in the library.
 *
 * A brand and a sub-brand use the same card: the only difference is the indent
 * and whether it offers to add a child, which is the parent's business rather
 * than the card's.
 */
export function BrandKitsPanel() {
  const { error, isLoading, kits, refresh } = useBrandKits();
  const { confirm } = useConfirm();
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  /** Which brand is having a sub-brand added, if any. */
  const [parentFor, setParentFor] = useState<string | null>(null);
  const [subName, setSubName] = useState("");

  const open = kits.find((kit) => kit.id === openId) ?? null;

  const create = useCallback(async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("A kit needs a name");
      return;
    }
    try {
      const kit = await brandKitsApi.create(name, EMPTY_KIT);
      setNewName("");
      await refresh();
      setOpenId(kit.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the kit");
    }
  }, [newName, refresh]);

  const createSub = async (parentId: string) => {
    const name = subName.trim();
    if (!name) {
      toast.error("A sub-brand needs a name");
      return;
    }
    try {
      const kit = await brandKitsApi.create(name, EMPTY_KIT, parentId);
      setSubName("");
      setParentFor(null);
      await refresh();
      setOpenId(kit.id);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not add the sub-brand"
      );
    }
  };

  const remove = async (kit: BrandKit) => {
    const subs = kits.filter((candidate) => candidate.parentId === kit.id);
    const ok = await confirm({
      confirmLabel: "Delete the kit",
      /* The sub-brand count is the part worth stating: they cascade, and a
         sub-brand inherits, so one left behind would be a document with holes
         nothing can fill. */
      description:
        subs.length > 0
          ? `Every version of ${kit.name} goes with it, and so do its ${subs.length} sub-brand${subs.length === 1 ? "" : "s"}. This cannot be undone.`
          : `Every version of ${kit.name} goes with it. This cannot be undone.`,
      destructive: true,
      title: "Delete this brand kit?",
    });
    if (!ok) {
      return;
    }
    try {
      await brandKitsApi.remove(kit.id);
      if (openId === kit.id) {
        setOpenId(null);
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the kit");
    }
  };

  if (open) {
    return (
      <KitEditor
        kit={open}
        onClose={() => setOpenId(null)}
        onSaved={() => void refresh()}
        /* The parent's *resolved* document, which is what a sub-brand inherits
           from — taken from the list rather than fetched, since the list already
           carries every kit's resolution. */
        parentDoc={
          kits.find((candidate) => candidate.id === open.parentId)
            ?.resolvedDoc ?? null
        }
      />
    );
  }

  return (
    <Card className="admin-card">
      <CardHeader className="row row--between row--mid">
        <CardTitle className="admin-heading">
          <HugeiconsIcon icon={PaintBoardIcon} size={16} />
          Brand kits
        </CardTitle>
        <div className="row row--tight">
          <Input
            aria-label="New kit name"
            className="admin-control"
            maxLength={MAX_KIT_NAME}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void create();
              }
            }}
            placeholder="New kit…"
            value={newName}
          />
          <Button onClick={() => void create()} type="button">
            <HugeiconsIcon icon={PlusSignIcon} size={14} />
            New kit
          </Button>
        </div>
      </CardHeader>
      <CardContent className="stack stack--mid">
        {error ? (
          <p className="admin-empty">Could not load brand kits.</p>
        ) : null}
        {isLoading ? <p className="admin-empty">Loading…</p> : null}
        {!(isLoading || error) && kits.length === 0 ? (
          <p className="admin-empty">
            No kits yet. A kit is an identity written down so it can be checked
            rather than remembered.
          </p>
        ) : null}
        {/*
          A tree rather than a flat list, because a sub-brand read out of context
          is just a kit with a confusing name. Two levels is all there can be —
          the database enforces it, see patch 032.
         */}
        <ul className="brand-kit__list">
          {kits
            .filter((kit) => !kit.parentId)
            .map((parent) => (
              <li key={parent.id}>
                <KitCard
                  kit={parent}
                  onAddSub={() => setParentFor(parent.id)}
                  onOpen={() => setOpenId(parent.id)}
                  onRemove={() => void remove(parent)}
                />
                {parentFor === parent.id ? (
                  <div className="brand-kit__sub-form row row--tight">
                    <Input
                      aria-label={`Name for a sub-brand of ${parent.name}`}
                      autoFocus
                      className="admin-control"
                      maxLength={MAX_KIT_NAME}
                      onChange={(e) => setSubName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void createSub(parent.id);
                        }
                        if (e.key === "Escape") {
                          setParentFor(null);
                        }
                      }}
                      placeholder={`${parent.name} — …`}
                      value={subName}
                    />
                    <Button
                      onClick={() => void createSub(parent.id)}
                      type="button"
                    >
                      Add
                    </Button>
                  </div>
                ) : null}
                {kits.some((kit) => kit.parentId === parent.id) ? (
                  <ul className="brand-kit__subs">
                    {kits
                      .filter((kit) => kit.parentId === parent.id)
                      .map((sub) => (
                        <li key={sub.id}>
                          <KitCard
                            kit={sub}
                            onOpen={() => setOpenId(sub.id)}
                            onRemove={() => void remove(sub)}
                          />
                        </li>
                      ))}
                  </ul>
                ) : null}
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  );
}

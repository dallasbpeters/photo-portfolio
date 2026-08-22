import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  PencilEdit02Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { ElementModal } from "../../boards/panels/ElementModal";
import { elementsApi } from "../../services/portfolioService";
import type { Element } from "../../types";
import { Button } from "../ui/button";
import { useConfirm } from "./ConfirmProvider";
import "../../styles/adminChrome.css";
import "./ElementsTab.css";

/**
 * The library of styles, as covers.
 *
 * Only the key image is shown. An element is a handful of pictures, but laying
 * all of them out would turn a library of a dozen styles into a hundred
 * thumbnails to read — the cover exists precisely so the style can be
 * recognised in one glance.
 *
 * Loaded when the tab is first opened rather than with the board: most sessions
 * never come in here, and this is a request that can wait until it is wanted.
 *
 * Lives outside BoardInsertPanel because the library is a thing you keep, not
 * just a thing you insert from: it is the one place an element can be renamed,
 * rewritten, re-covered or thrown away, and that is more than a tab's worth of
 * behaviour to carry inside a nine-source panel.
 */
export function ElementsTab({ onAdd }: { onAdd: (element: Element) => void }) {
  const { confirm } = useConfirm();
  const [elements, setElements] = useState<Element[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Element | null>(null);

  useEffect(() => {
    let cancelled = false;
    elementsApi
      .list()
      .then((found) => {
        if (!cancelled) {
          setElements(found);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load elements");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const remove = async (element: Element) => {
    // The same dialog the rest of the admin uses. This card used to run its own
    // two-press confirmation, which meant the one destructive action in the
    // panel was also the only one that asked in its own dialect.
    const agreed = await confirm({
      confirmLabel: "Delete",
      description: `“${element.name}” leaves the library for good. Boards that already carry it keep their own copy of the words and the pictures.`,
      destructive: true,
      title: "Delete this element?",
    });
    if (!agreed) {
      return;
    }
    try {
      await elementsApi.remove(element.id);
      setElements(
        (current) => current?.filter((one) => one.id !== element.id) ?? null
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete that");
    }
  };

  if (error) {
    return <p className="elements-tab__message">{error}</p>;
  }
  if (!elements) {
    return <p className="elements-tab__message">Loading…</p>;
  }
  if (elements.length === 0) {
    return (
      <p className="elements-tab__message elements-tab__message--wrapped">
        No elements yet. Select the pictures that share a look on a board,
        right-click, and save them as one.
      </p>
    );
  }

  return (
    <>
      <div className="elements-tab__grid">
        {elements.map((element) => (
          <div className="group elements-tab__cell" key={element.id}>
            {/* Sits over the cover rather than in the row below it, which is the
                only part of the card that is not the button that places it. The
                tray carries the backdrop so the buttons themselves stay plain
                variants — legibility over a photograph is the tray's job. */}
            <div className="admin-hover-tray">
              <Button
                aria-label={`Edit ${element.name}`}
                onClick={() => setEditing(element)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={PencilEdit02Icon} size={12} />
              </Button>
              <Button
                aria-label={`Delete ${element.name}`}
                onClick={() => void remove(element)}
                size="icon-sm"
                tone="danger"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={Delete02Icon} size={12} />
              </Button>
            </div>
            <button
              className="admin-tile admin-tile--board admin-tile__open"
              onClick={() => onAdd(element)}
              type="button"
            >
              <div className="admin-tile__frame admin-tile__frame--square">
                {element.coverUrl ? (
                  <img
                    alt=""
                    className="admin-fill"
                    draggable={false}
                    height={160}
                    loading="lazy"
                    src={element.coverUrl}
                    width={160}
                  />
                ) : null}
              </div>
              <div className="admin-tile__caption admin-tile__caption--tight">
                <span className="admin-tile__name admin-tile__name--board">
                  {element.name}
                </span>
                <span className="admin-tile__meta admin-tile__meta--board">
                  {element.imageUrls.length === 1
                    ? "1 picture"
                    : `${element.imageUrls.length} pictures`}
                </span>
              </div>
            </button>
          </div>
        ))}
      </div>

      {/* The same modal the save-as-an-element flow opens, in its editing mode:
          naming a style and re-naming one are the same job, and the panel would
          otherwise grow a second, slightly different opinion about it.

          Portalled, because the insert panel slides in on a transform and a
          transformed ancestor is what `position: fixed` resolves against — left
          in place the modal opened inside the 480px panel, with its backdrop
          covering only that.

          The target is the overlay layer, not the board element. Aimed at the
          board it escaped too far: that puts it beside the canvas wrapper,
          which is `z-100`, so a `z-60` modal rendered behind the canvas and the
          panel that opened it. It looked like the Edit button did nothing. The
          overlay layer is inside the board, so the board's ink still applies,
          and inside the wrapper, so every other board modal is its neighbour
          rather than its superior. */}
      {editing
        ? createPortal(
            <ElementModal
              element={editing}
              onCancel={() => setEditing(null)}
              onSaved={(saved) => {
                setElements(
                  (current) =>
                    current?.map((one) =>
                      one.id === saved.id ? saved : one
                    ) ?? null
                );
                setEditing(null);
              }}
            />,
            document.querySelector("[data-board-overlays]") ??
              document.querySelector("[data-surface='board']") ??
              document.body
          )
        : null}
    </>
  );
}

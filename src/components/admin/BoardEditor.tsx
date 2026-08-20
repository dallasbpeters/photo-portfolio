import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  DEFAULT_IMAGE_HEIGHT,
  DEFAULT_IMAGE_WIDTH,
} from "../../../config/canvas.js";
import { BoardCanvas } from "../../boards/BoardCanvas";
import { FloatingTools } from "../../boards/canvas/FloatingTools";
import type { DrawStyle } from "../../boards/drawing/DrawToolbar";
import {
  DEFAULT_STROKE,
  DEFAULT_STROKE_WIDTH,
  type DrawTool,
  NO_FILL,
} from "../../boards/drawing/drawing";
import { useBoardHistory } from "../../boards/hooks/useBoardHistory";
import { useGraphRun } from "../../boards/hooks/useGraphRun";
import { useVideoNode } from "../../boards/hooks/useVideoNode";
import { ModelsProvider } from "../../boards/ModelsContext";
import { CommentsPanel } from "../../boards/panels/CommentsPanel";
import { ElementModal } from "../../boards/panels/ElementModal";
import { InsertPalette } from "../../boards/panels/InsertPalette";
import type { BoardComment } from "../../services/comments";
import type {
  Board,
  BoardItem,
  BoardSource,
  BoardWire,
  Photo,
} from "../../types";
import { BoardInsertPanel } from "./BoardInsertPanel";
import { CustomCursor } from "./CustomCursor";
import { SendToCanvaModal } from "./SendToCanvaModal";
import { SvgImportDialog } from "./SvgImportDialog";
import "./BoardEditor.css";

import { BoardHeaderActions } from "./boardEditor/BoardHeaderActions";
import { BoardStatusBar } from "./boardEditor/BoardStatusBar";
import { BoardToolPanel } from "./boardEditor/BoardToolPanel";
import { useBoardDocument } from "./boardEditor/useBoardDocument";
import { useBoardInserts } from "./boardEditor/useBoardInserts";
import { useBoardItemActions } from "./boardEditor/useBoardItemActions";
import { useBoardItemEdits } from "./boardEditor/useBoardItemEdits";
import { useBoardRun } from "./boardEditor/useBoardRun";
import { useBoardUploads } from "./boardEditor/useBoardUploads";
import { useBoardVectorTools } from "./boardEditor/useBoardVectorTools";
import { useDropPoint } from "./boardEditor/useDropPoint";
import { useRecipes } from "./boardEditor/useRecipes";
import { useSelectedItem } from "./boardEditor/useSelectedItem";

/**
 * Full-screen board editor.
 *
 * Saves on a debounce rather than behind a button: the canvas is edited by
 * dragging, and a drag has no natural moment where a person would think to
 * press save. The unsaved marker is what makes that honest.
 */
export function BoardEditor({
  boardId,
  onClose,
}: {
  boardId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { dropPoint, viewCentreRef } = useDropPoint();
  const [board, setBoard] = useState<Board | null>(null);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [wires, setWires] = useState<BoardWire[]>([]);
  const [sources, setSources] = useState<BoardSource[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isPicking, setIsPicking] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [autoEditId, setAutoEditId] = useState<string | null>(null);
  /**
   * Whether the board has actually arrived.
   *
   * The save replaces the whole arrangement, and `items` starts empty — so a
   * save that runs before the load lands writes an empty board and deletes
   * every item on it. Nothing may be written until there is something to
   * compare against.
   */
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [isInserting, setIsInserting] = useState(false);
  /**
   * The selection waiting to be named, or null when nothing is being saved.
   *
   * Held here rather than in the modal because it is gathered from the board —
   * once the panel is open the selection may have moved on, and what is being
   * saved should be what was chosen when it was chosen.
   */
  const [elementDraft, setElementDraft] = useState<{
    description: string;
    images: string[];
  } | null>(null);
  /**
   * Which tab the insert panel opens on, or undefined for its own default.
   *
   * Decided by whoever opens it. Naming an element ends on the library it was
   * just added to, so the thing that was named can be placed without hunting
   * for it; the toolbar opens where it always did.
   */
  const [pickAt, setPickAt] = useState<"elements" | undefined>();
  const history = useBoardHistory();
  const [drawTool, setDrawTool] = useState<DrawTool | null>(null);
  const selection = useSelectedItem(items);
  const [drawStyle, setDrawStyle] = useState<DrawStyle>({
    fill: NO_FILL,
    stroke: DEFAULT_STROKE,
    strokeWidth: DEFAULT_STROKE_WIDTH,
  });

  /**
   * Publishing mints the slug server-side, so the link only exists once the
   * response comes back — there is nothing to show optimistically.
   */
  // A saved item is keyed by its id; an unsaved one by the key it was created
  // with. Both survive the new object that every edit produces.
  const keyOf = useCallback((item: BoardItem) => item.id, []);

  const {
    attachSource,
    change,
    close,
    displayName,
    changeConfig,
    changeWires,
    detachSource,
    pending,
    publicUrl,
    publish,
    save,
  } = useBoardDocument({
    board,
    boardId,
    history,
    isDirty,
    isLoaded,
    items,
    setBoard,
    setComments,
    setDrawTool,
    setIsDirty,
    setIsInserting,
    setIsLoaded,
    setIsPublishing,
    setIsSaving,
    setItems,
    setPhotos,
    setSources,
    setWires,
    sources,
    wires,
  });

  const { applyRun, createFromPort, flushBeforeRun } = useBoardRun({
    items,
    pending,
    save,
    setIsDirty,
    setItems,
    setWires,
    wires,
  });

  const graphRun = useGraphRun({
    beforeRun: flushBeforeRun,
    boardId,
    items,
    onPatch: applyRun,
    wires,
  });

  useEffect(() => {
    if (graphRun.error) {
      toast.error(graphRun.error);
    }
  }, [graphRun.error]);

  // A video cannot travel the graph runner's one-request path; see useVideoNode.
  const runNode = useVideoNode(boardId, items, wires, change, graphRun.runNode);

  const { placeRecipe, recipes, saveRecipe, uses } = useRecipes({
    board,
    boardId,
    dropPoint,
    flush: flushBeforeRun,
    items,
    setItems,
    setWires,
  });

  const {
    addElement,
    addExternal,
    addFrame,
    addNode,
    addPhoto,
    addShader,
    addWritable,
    autoArrange,
    beginElement,
    exportItem,
    groupIntoFrame,
  } = useBoardInserts({
    boardId,
    change,
    dropPoint,
    items,
    setAutoEditId,
    setElementDraft,
    setIsPicking,
    viewCentreRef,
    wires,
  });

  const { dropFiles, importSvg, pendingSvg, setPendingSvg } = useBoardUploads({
    change,
    items,
  });

  const {
    addDrawing,
    addMaskStroke,
    changeMask,
    copyFrameToBoard,
    dropImage,
    removeVersion,
  } = useBoardItemEdits({
    boardId,
    change,
    items,
    navigate,
    setDrawTool,
    setIsDirty,
    setItems,
    wires,
  });

  const {
    bringToFront,
    downloadShader,
    exportShader,
    canvaTarget,
    openSendToCanva,
    resolveComment,
    sendToBack,
    sendVersions,
    setCanvaTarget,
  } = useBoardItemActions({
    addExternal,
    boardId,
    change,
    dropPoint,
    items,
    setComments,
    wires,
  });

  const { editorNode, openEditor, openItemInAffinity, vectorizeItem } =
    useBoardVectorTools({
      boardId,
      graphRun,
      items,
      pending,
      save,
      setIsDirty,
      setItems,
      setWires,
    });

  return (
    <ModelsProvider>
      {/* `text-board-ink` establishes the board's own writing color for
          everything inside. Without it the subtree inherits the *site's*
          foreground — the branded near-white that SiteSettingsProvider pins to
          <html> — so anything without an explicit color came out white on a
          white board. The site's palette is right for the site and has no say
          here. */}
      {/* data-surface re-points the --btn-* variables at the board's ink, so
          every Button inside this tree paints itself for paper without the
          call site having to say so. See index.css. */}
      <CustomCursor cursorColor="#9100FF" userName={displayName} />
      <div
        className="board"
        data-editing={editorNode ? "" : undefined}
        data-surface="board"
      >
        {/* Wraps rather than overflowing: the palette has grown past what fits on
          one line at laptop width, and a row of shrink-0 buttons pushed Publish
          and Close off the edge instead of moving them down. */}
        <BoardStatusBar
          isDirty={isDirty}
          isSaving={isSaving}
          title={board?.title ?? "Board"}
        />

        <div className="board-panel board-panel--top-right">
          <BoardHeaderActions
            commentCount={comments.length}
            hasNodes={items.some((item) => item.kind === "op")}
            isPublic={board?.isPublic ?? false}
            isPublishing={isPublishing}
            isRunning={graphRun.isRunning}
            onCancelRun={() => graphRun.cancel()}
            onClose={() => void close(onClose)}
            onPublish={() => void publish(!board?.isPublic)}
            onRun={() => void graphRun.runBoard()}
            onToggleComments={() => setShowComments((open) => !open)}
            publicUrl={publicUrl}
            showComments={showComments}
          />
        </div>

        {/* The layer every board overlay belongs in. Named so a panel escaping
            its own transform has somewhere to escape to — see ElementsTab. */}
        <div className="relative z-100 min-h-0 flex-1" data-board-overlays>
          <FloatingTools
            drawStyle={drawStyle}
            drawTool={drawTool}
            items={items}
            onConfigChange={changeConfig}
            onDownloadShader={downloadShader}
            onExportShader={exportShader}
            onMaskChange={changeMask}
            onStyle={setDrawStyle}
            onTool={setDrawTool}
            selected={selection.item}
            wires={wires}
          />

          <BoardToolPanel
            onAddFrame={addFrame}
            onAddNode={addNode}
            onAddWritable={addWritable}
            onTogglePicker={() => setIsPicking((v) => !v)}
          />

          <BoardCanvas
            autoEditId={autoEditId}
            boardId={boardId}
            comments={comments}
            drawStyle={drawStyle}
            drawTool={drawTool}
            items={items}
            keyOf={keyOf}
            onArrangeFrame={autoArrange}
            onBringToFront={bringToFront}
            onCancel={graphRun.cancel}
            onChange={change}
            onConfigChange={changeConfig}
            onCopyFrame={(frame, title) => void copyFrameToBoard(frame, title)}
            onCreateFromPort={createFromPort}
            onDraw={addDrawing}
            onDrawTool={setDrawTool}
            onDropFiles={(files, point) => void dropFiles(files, point)}
            onDropImage={dropImage}
            onEditImage={openEditor}
            onExportItem={(itemId) => void exportItem(itemId)}
            onGroupIntoFrame={groupIntoFrame}
            onMaskStroke={addMaskStroke}
            onOpenInAffinity={(itemId) => void openItemInAffinity(itemId)}
            onRemoveVersion={(itemId, index) =>
              void removeVersion(itemId, index)
            }
            onRun={(itemId, force) => void runNode(itemId, force)}
            onSaveElement={beginElement}
            onSaveRecipe={(chosen, name) => void saveRecipe(chosen, name)}
            onSelectionChange={selection.select}
            onSendToBack={sendToBack}
            onSendToCanva={openSendToCanva}
            onSendVersions={sendVersions}
            onVectorize={(itemId) => void vectorizeItem(itemId)}
            onWiresChange={changeWires}
            recipeUses={uses}
            viewCentreRef={viewCentreRef}
            wires={wires}
          />

          {canvaTarget ? (
            <SendToCanvaModal
              imageUrl={canvaTarget.imageUrl}
              name={canvaTarget.name}
              onClose={() => setCanvaTarget(null)}
            />
          ) : null}

          {pendingSvg ? (
            <SvgImportDialog
              count={pendingSvg.files.length}
              onCancel={() => setPendingSvg(null)}
              onConvertPng={() => void importSvg(false)}
              onKeepSvg={() => void importSvg(true)}
            />
          ) : null}

          {showComments ? (
            <CommentsPanel
              comments={comments}
              items={items}
              onClose={() => setShowComments(false)}
              onResolve={(commentId, resolved) =>
                void resolveComment(commentId, resolved)
              }
            />
          ) : null}

          {isInserting ? (
            <InsertPalette
              onChoose={(action) => {
                setIsInserting(false);
                if (action.kind === "recipe") {
                  void placeRecipe(action.recipeId);
                  return;
                }
                if (action.kind === "writable") {
                  addWritable(action.writable);
                } else if (action.kind === "frame") {
                  addFrame();
                } else if (action.kind === "node") {
                  addNode(action.nodeType);
                } else if (action.kind === "shader") {
                  addShader(action.name);
                } else {
                  // Images need a source chosen, so the palette hands over to the
                  // panel that can ask rather than guessing one.
                  setIsPicking(true);
                }
              }}
              onDismiss={() => setIsInserting(false)}
              recipes={recipes}
            />
          ) : null}

          <AnimatePresence>
            {isPicking ? (
              <BoardInsertPanel
                initialTab={pickAt}
                onAddElement={(element) => {
                  addElement(element);
                  setIsPicking(false);
                }}
                onAddExternal={addExternal}
                onAddFiles={(files) =>
                  void dropFiles(
                    files,
                    dropPoint(items, DEFAULT_IMAGE_WIDTH, DEFAULT_IMAGE_HEIGHT)
                  )
                }
                onAddNode={addNode}
                onAddPhoto={addPhoto}
                onAddShader={addShader}
                onAttachSource={attachSource}
                onDetachSource={detachSource}
                photos={photos}
                setIsOpen={(open) => {
                  setIsPicking(open);
                  if (!open) {
                    // Cleared on close so the next opening goes back to the usual
                    // first tab — being sent to the library once does not mean the
                    // panel now lives there.
                    setPickAt(undefined);
                  }
                }}
                sources={sources}
              />
            ) : null}
          </AnimatePresence>

          {editorNode}

          {elementDraft ? (
            <ElementModal
              description={elementDraft.description}
              images={elementDraft.images}
              onCancel={() => setElementDraft(null)}
              onSaved={() => {
                // Ends on the library the element was just added to, so the thing
                // that was named can be placed without hunting for it.
                setElementDraft(null);
                setPickAt("elements");
                setIsPicking(true);
              }}
            />
          ) : null}
        </div>
      </div>
    </ModelsProvider>
  );
}

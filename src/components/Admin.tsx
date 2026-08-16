import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  GridTableIcon,
  Layers01Icon,
  TagsIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type AdminDataResult, useAdminData } from "../hooks/useAdminData";
import { useAdminLogin } from "../hooks/useAdminLogin";
import { type AdminViewResult, useAdminView } from "../hooks/useAdminView";
import { type NewPhotoResult, useNewPhoto } from "../hooks/useNewPhoto";
import { usePhotoDetails } from "../hooks/usePhotoDetails";
import {
  type PhotoSelectionResult,
  usePhotoSelection,
} from "../hooks/usePhotoSelection";
import { portfolioService } from "../services/portfolioService";
import type { Photo } from "../types";
import { AddItemForm } from "./admin/AddItemForm";
import { CategoriesManageDialog } from "./admin/CategoriesManageDialog";
import { CategoryPicker } from "./admin/CategoryPicker";
import { DailyChallengePanel } from "./admin/DailyChallengePanel";
import { ForgotPasswordForm } from "./admin/ForgotPasswordForm";
import { LoginScreen } from "./admin/LoginScreen";
import { PhotoCard } from "./admin/PhotoCard";
import { DetailsDialog } from "./admin/PhotoDetailsDialog";
import { OptimizedImage } from "./OptimizedImage";
import { PhotoEditor } from "./PhotoEditor";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/checkbox";

type CategoryGroup = AdminViewResult["categorizedPhotos"][number];

// ── Items header controls ─────────────────────────────────────────────────────

interface ViewToggleButtonProps {
  onToggle: () => void;
  stackedView: boolean;
}

const ViewToggleButton = ({ onToggle, stackedView }: ViewToggleButtonProps) => (
  <Button
    aria-label={stackedView ? "Switch to grid view" : "Switch to stacked view"}
    onClick={onToggle}
    size="sm"
    type="button"
    variant={stackedView ? "selected" : "outline"}
  >
    {stackedView ? (
      <HugeiconsIcon icon={GridTableIcon} size={13} />
    ) : (
      <HugeiconsIcon icon={Layers01Icon} size={13} />
    )}
    {stackedView ? "Grid" : "Stack"}
  </Button>
);

// ── Batch actions ─────────────────────────────────────────────────────────────

interface BatchActionsProps {
  categoryOptionsDisabled: boolean;
  data: AdminDataResult;
  selection: PhotoSelectionResult;
}

const BatchActions = ({
  categoryOptionsDisabled,
  data,
  selection,
}: BatchActionsProps) => (
  <section
    aria-label="Batch actions for selected photos"
    className="flex w-full flex-col gap-2 md:ml-auto md:w-auto md:flex-row md:items-center"
  >
    <span className="shrink-0 text-[10px] text-white/90 uppercase tracking-widest">
      {selection.selectedIds.length} selected
    </span>
    <div className="w-full min-w-0 md:max-w-48 md:flex-1">
      <CategoryPicker
        categories={data.categories}
        className="[&_label]:sr-only"
        disabled={categoryOptionsDisabled}
        id="batch-category"
        isCreating={data.isSavingCategory}
        label="Category"
        onChange={selection.setBatchCategoryId}
        onCreate={data.createCategoryFromLabel}
        value={selection.batchCategoryId}
      />
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button
        disabled={
          selection.isBatchUpdating ||
          selection.isBatchDeleting ||
          categoryOptionsDisabled
        }
        onClick={() => void selection.batchSetCategory()}
        size="sm"
        type="button"
        variant="default"
      >
        {selection.isBatchUpdating ? "Applying…" : "Set category"}
      </Button>
      <Button
        disabled={selection.isBatchDeleting || selection.isBatchUpdating}
        onClick={() => void selection.batchDelete()}
        size="sm"
        tone="danger"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon icon={Delete02Icon} size={14} />
        {selection.isBatchDeleting ? "Deleting…" : "Delete"}
      </Button>
      <Button
        disabled={selection.isBatchDeleting || selection.isBatchUpdating}
        onClick={selection.clear}
        size="sm"
        type="button"
        variant="ghost"
      >
        Clear
      </Button>
    </div>
  </section>
);

// ── Stacked view ──────────────────────────────────────────────────────────────

const STACK_ROTATIONS = [-5, 3, -1.5, 0];
const STACK_OFFSETS = [-8, -4, -2, 0];

interface CategoryStackProps {
  group: CategoryGroup;
  groupIdx: number;
  selection: PhotoSelectionResult;
}

const CategoryStack = ({ group, groupIdx, selection }: CategoryStackProps) => {
  const allSelected = group.photos.every((p) =>
    selection.selectedIds.includes(p.id)
  );
  const someSelected = group.photos.some((p) =>
    selection.selectedIds.includes(p.id)
  );
  const stackCards = group.photos.slice(0, 4).reverse();
  return (
    <div
      className="flex animate-stack-in flex-col gap-3"
      style={{ animationDelay: `${groupIdx * 0.07}s` }}
    >
      <div className="group/stack relative aspect-3/4 rounded-lg p-2">
        <div
          aria-hidden
          className={`absolute inset-0 animate-gradient-spin rounded-lg blur-[5px] transition-opacity duration-500 ${
            allSelected
              ? "opacity-100"
              : "opacity-0 group-hover/stack:opacity-30"
          }`}
          style={{
            background:
              "conic-gradient(from calc(var(--gradient-angle) + 335deg), transparent 0deg, oklch(52.74% 0.21 281.43deg) 30deg, oklch(73.91% 0.22 322.89deg) 60deg, transparent 100deg, transparent 360deg)",
            filter: "blur(20px)",
          }}
        />
        <button
          aria-label={`${allSelected ? "Deselect" : "Select"} all in ${group.categoryLabel}`}
          className="relative h-full w-full cursor-pointer"
          onClick={() => selection.toggleCategoryGroup(group.photos)}
          type="button"
        >
          {stackCards.map((photo, i) => (
            <div
              className="absolute inset-0 overflow-hidden rounded-lg border border-white/10 bg-black/40 transition-transform duration-300 group-hover/stack:duration-200"
              key={photo.id}
              style={{
                transform: `rotate(${STACK_ROTATIONS[i]}deg) translateY(${STACK_OFFSETS[i]}px)`,
                transitionDelay: `${i * 20}ms`,
                zIndex: i + 1,
              }}
            >
              <OptimizedImage
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
                sizes="120px"
                src={photo.url}
              />
            </div>
          ))}
          <div className="absolute right-2 bottom-2 z-20 rounded-full bg-black/70 px-2 py-0.5 font-medium text-[9px] text-white/90 uppercase tracking-widest backdrop-blur-sm">
            {group.photos.length}
          </div>
        </button>
      </div>
      <div>
        <p
          className={`truncate text-[10px] uppercase tracking-widest transition-colors ${allSelected ? "text-white" : "text-white/90"}`}
        >
          {group.categoryLabel}
        </p>
        <p className="text-[9px] text-white/90">
          {group.photos.length} {group.photos.length === 1 ? "photo" : "photos"}
          {someSelected &&
            !allSelected &&
            ` · ${group.photos.filter((p) => selection.selectedIds.includes(p.id)).length} selected`}
        </p>
      </div>
    </div>
  );
};

interface StackedViewProps {
  groups: CategoryGroup[];
  selection: PhotoSelectionResult;
}

const StackedView = ({ groups, selection }: StackedViewProps) => (
  <div className="p-4 sm:p-6">
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {groups.map((group, groupIdx) => (
        <CategoryStack
          group={group}
          groupIdx={groupIdx}
          key={group.categoryId}
          selection={selection}
        />
      ))}
    </div>
  </div>
);

// ── Grid view ─────────────────────────────────────────────────────────────────

interface PhotoGridProps {
  newlyAddedPhotoId: string | null;
  onEditDetails: (photo: Photo) => void;
  onEditImage: (photo: Photo) => void;
  /** The ids in their new order, once a drag settles. */
  onReorder: (photoIds: string[]) => void;
  onReset: (photo: Photo) => void;
  onRotate: (photo: Photo) => void;
  onToggleFeatured: (photo: Photo) => void;
  onTogglePublished: (photo: Photo) => void;
  photos: Photo[];
  selection: PhotoSelectionResult;
}

const PhotoGrid = ({
  newlyAddedPhotoId,
  onEditDetails,
  onEditImage,
  onReset,
  onRotate,
  onReorder,
  onToggleFeatured,
  onTogglePublished,
  photos,
  selection,
}: PhotoGridProps) => {
  // A local copy so the grid rearranges under the pointer. Dragging against
  // the server's copy would mean a round trip per card crossed, and the photo
  // snapping back each time until the save landed.
  const [order, setOrder] = useState(photos);
  const dragId = useRef<string | null>(null);

  // Re-synced whenever the library changes underneath — a save, a delete, a
  // new upload — but not while a drag is in flight, which would yank the card
  // out from under the pointer.
  useEffect(() => {
    if (dragId.current === null) {
      setOrder(photos);
    }
  }, [photos]);

  const moveBefore = (targetId: string) => {
    const held = dragId.current;
    if (held === null || held === targetId) {
      return;
    }
    setOrder((current) => {
      const from = current.findIndex((p) => p.id === held);
      const to = current.findIndex((p) => p.id === targetId);
      if (from === -1 || to === -1) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(from, 1);
      if (moved) {
        next.splice(to, 0, moved);
      }
      return next;
    });
  };

  const commit = () => {
    dragId.current = null;
    // Compared against the incoming order rather than tracked with a flag: a
    // drag that ends where it started is not a change, and should not spend a
    // request or churn the library.
    const before = photos.map((p) => p.id).join();
    const after = order.map((p) => p.id).join();
    if (before !== after) {
      onReorder(order.map((p) => p.id));
    }
  };

  return (
    <div className="p-2 sm:p-3">
      <p className="px-1 pb-2 text-[10px] text-white/40 uppercase tracking-[0.18em]">
        Drag to reorder
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-5">
        {order.map((photo) => (
          <PhotoCard
            isDragging={dragId.current === photo.id}
            isNew={photo.id === newlyAddedPhotoId}
            key={photo.id}
            onDragEnd={commit}
            onDragOver={() => moveBefore(photo.id)}
            onDragStart={() => {
              dragId.current = photo.id;
            }}
            onEditDetails={onEditDetails}
            onEditImage={onEditImage}
            onReset={onReset}
            onRotate={onRotate}
            onToggleFeatured={onToggleFeatured}
            onTogglePublished={onTogglePublished}
            photo={photo}
            selection={selection}
          />
        ))}
      </div>
    </div>
  );
};

// ── Current items ─────────────────────────────────────────────────────────────

interface ItemsCardProps {
  categoryOptionsDisabled: boolean;
  data: AdminDataResult;
  newPhoto: NewPhotoResult;
  onEditDetails: (photo: Photo) => void;
  onEditImage: (photo: Photo) => void;
  onManageCategories: () => void;
  onReorder: (photoIds: string[]) => void;
  onReset: (photo: Photo) => void;
  onRotate: (photo: Photo) => void;
  onToggleFeatured: (photo: Photo) => void;
  onTogglePublished: (photo: Photo) => void;
  selection: PhotoSelectionResult;
  view: AdminViewResult;
}

const ItemsCard = ({
  categoryOptionsDisabled,
  data,
  newPhoto,
  onEditDetails,
  onEditImage,
  onManageCategories,
  onReorder,
  onReset,
  onRotate,
  onToggleFeatured,
  onTogglePublished,
  selection,
  view,
}: ItemsCardProps) => (
  <Card className="overflow-hidden border-white/0 bg-white/5">
    <CardHeader className="flex flex-col gap-3 border-white/5 border-b md:flex-row md:items-center md:gap-4">
      <div className="flex shrink-0 items-center gap-3">
        <CardTitle className="whitespace-nowrap font-light text-sm text-white/90 uppercase tracking-[0.3em]">
          Current Items
        </CardTitle>
        <Button
          onClick={onManageCategories}
          size="sm"
          type="button"
          variant="outline"
        >
          <HugeiconsIcon icon={TagsIcon} size={13} />
          Categories
        </Button>
        <ViewToggleButton
          onToggle={view.toggleView}
          stackedView={view.stackedView}
        />
      </div>

      {selection.someSelected ? (
        <BatchActions
          categoryOptionsDisabled={categoryOptionsDisabled}
          data={data}
          selection={selection}
        />
      ) : null}
    </CardHeader>

    <CardContent className="p-0">
      {data.isLoadingPhotos ? (
        <p className="p-6 text-center text-sm text-white/90 uppercase tracking-widest">
          Loading…
        </p>
      ) : (
        <>
          {view.stackedView ? null : (
            <div className="flex items-center gap-3 border-white/10 border-b bg-black/20 px-3 py-2.5">
              <Checkbox
                aria-label="Select all photos"
                checked={selection.allSelected}
                className="h-5 w-5"
                disabled={data.photos.length === 0}
                onChange={selection.toggleAll}
                ref={selection.selectAllRef}
              />
              <span className="text-[10px] text-white/90 uppercase tracking-widest">
                Select all
              </span>
            </div>
          )}

          {/* ── Stacked view ── */}
          {view.stackedView ? (
            <StackedView
              groups={view.categorizedPhotos}
              selection={selection}
            />
          ) : null}

          {/* ── Grid view ── */}
          {view.stackedView ? null : (
            <PhotoGrid
              newlyAddedPhotoId={newPhoto.newlyAddedPhotoId}
              onEditDetails={onEditDetails}
              onEditImage={onEditImage}
              onReorder={onReorder}
              onReset={onReset}
              onRotate={onRotate}
              onToggleFeatured={onToggleFeatured}
              onTogglePublished={onTogglePublished}
              photos={data.photos}
              selection={selection}
            />
          )}
        </>
      )}
    </CardContent>
  </Card>
);

/**
 * Signs the admin in, and shows nothing behind it until they are.
 *
 * A wrapper rather than a check inside each section: the admin is several
 * pages now, and a gate copied four times is a gate that will eventually be
 * four subtly different gates, one of which forgets to close.
 */
export const AdminGate = ({
  children,
  isAuthenticated,
  onLogin,
}: {
  children: ReactNode;
  isAuthenticated: boolean;
  onLogin: () => void;
}) => {
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const login = useAdminLogin(onLogin);

  if (!isAuthenticated && isRecoveringPassword) {
    return (
      <ForgotPasswordForm
        initialEmail={login.email}
        onBack={() => setIsRecoveringPassword(false)}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginScreen
        login={login}
        onForgotPassword={() => setIsRecoveringPassword(true)}
        onSignedIn={onLogin}
      />
    );
  }

  return children;
};

/**
 * The photo library: uploading, categorising, ordering and editing.
 *
 * Site settings, moodboards and CMS pages used to be stacked below this on the
 * same endless page, which buried the thing the admin is actually for. They
 * are their own routes now; this component is only ever the photographs.
 */
export const Admin = () => {
  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);

  // Always authenticated: AdminGate is what renders this.
  const data = useAdminData(true);
  const view = useAdminView(data.photos);
  const selection = usePhotoSelection(data.photos, data.categories, {
    removePhotos: data.removePhotos,
    replacePhotos: data.replacePhotos,
  });
  const details = usePhotoDetails(data.applyPhotoUpdate);
  const newPhoto = useNewPhoto(data.categories, data.insertPhoto);

  const categoryOptionsDisabled = data.categories.length === 0;

  /**
   * Shows or hides a photograph on the public gallery.
   *
   * Title, category and order come back unchanged because the endpoint
   * validates all three on every write; only `isPublished` is actually
   * different.
   */
  const togglePublished = async (photo: Photo) => {
    try {
      const saved = await portfolioService.updatePhoto(photo.id, {
        categoryId: photo.categoryId,
        isPublished: !photo.isPublished,
        order: photo.order,
        title: photo.title,
      });
      data.applyPhotoUpdate(saved);
      toast.success(photo.isPublished ? "Hidden from the site" : "Published");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not change visibility"
      );
    }
  };

  /**
   * Toggles whether a photograph appears in the homepage hero slideshow.
   */
  const toggleFeatured = async (photo: Photo) => {
    try {
      const saved = await portfolioService.updatePhoto(photo.id, {
        categoryId: photo.categoryId,
        isFeatured: !photo.isFeatured,
        isPublished: photo.isPublished,
        order: photo.order,
        title: photo.title,
      });
      data.applyPhotoUpdate(saved);
      toast.success(
        photo.isFeatured
          ? "Removed from homepage slideshow"
          : "Added to homepage slideshow"
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not change featured status"
      );
    }
  };

  const rotatePhoto = async (photo: Photo) => {
    try {
      const rotated = await portfolioService.rotatePhoto(photo.id);
      data.applyPhotoUpdate(rotated);
      toast.success("Rotated 90°");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not rotate the photo"
      );
    }
  };

  const resetPhoto = async (photo: Photo) => {
    try {
      const restored = await portfolioService.resetPhoto(photo.id);
      data.applyPhotoUpdate(restored);
      toast.success("Restored the original");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not restore the photo"
      );
    }
  };

  const reorderPhotos = async (photoIds: string[]) => {
    // Kept so the list can be put back if the save fails.
    const previous = data.photos;
    const byId = new Map(previous.map((p) => [p.id, p]));
    const moved = photoIds
      .map((id) => byId.get(id))
      .filter((p): p is Photo => p !== undefined);

    // Applied before the request, not after: the grid has already animated
    // into this order under the pointer, and refetching to confirm it would
    // repaint every card to show what is on screen.
    data.replacePhotos(moved);

    try {
      await portfolioService.reorderPhotos(photoIds);
    } catch (error) {
      data.replacePhotos(previous);
      toast.error(
        error instanceof Error ? error.message : "Could not save the new order"
      );
    }
  };

  return (
    <div className="mx-auto w-full space-y-8 md:space-y-12">
      <CategoriesManageDialog
        categories={data.categories}
        isCreating={data.isSavingCategory}
        loading={data.isLoadingCategories}
        onCreate={data.createCategoryFromLabel}
        onDelete={(cat) => void data.handleDeleteCategory(cat)}
        onOpenChange={setCategoriesModalOpen}
        open={categoriesModalOpen}
      />

      {/* ── Top row: daily challenge + add form ── */}
      <div className="grid grid-cols-1 items-stretch gap-5 md:gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <DailyChallengePanel />

        <AddItemForm
          categoryOptionsDisabled={categoryOptionsDisabled}
          data={data}
          newPhoto={newPhoto}
        />
      </div>

      {/* ── Current items ── */}
      <ItemsCard
        categoryOptionsDisabled={categoryOptionsDisabled}
        data={data}
        newPhoto={newPhoto}
        onEditDetails={details.open}
        onEditImage={setEditingPhoto}
        onManageCategories={() => setCategoriesModalOpen(true)}
        onReorder={(photoIds) => void reorderPhotos(photoIds)}
        onReset={(photo) => void resetPhoto(photo)}
        onRotate={(photo) => void rotatePhoto(photo)}
        onToggleFeatured={(photo) => void toggleFeatured(photo)}
        onTogglePublished={(photo) => void togglePublished(photo)}
        selection={selection}
        view={view}
      />

      {/* ── Edit details dialog ── */}
      <DetailsDialog
        categoryOptionsDisabled={categoryOptionsDisabled}
        data={data}
        details={details}
      />

      {editingPhoto ? (
        <PhotoEditor
          onClose={() => setEditingPhoto(null)}
          onSaved={() => {
            void data.reload();
          }}
          photo={editingPhoto}
        />
      ) : null}
    </div>
  );
};

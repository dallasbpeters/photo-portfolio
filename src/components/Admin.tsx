import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  EyeIcon,
  EyeOffIcon,
  FileEditIcon,
  GridTableIcon,
  Layers01Icon,
  Login02Icon,
  PencilEdit01Icon,
  RotateRight01Icon,
  Shield01Icon,
  TagsIcon,
  Upload02Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type AdminDataResult, useAdminData } from "../hooks/useAdminData";
import { type AdminLoginResult, useAdminLogin } from "../hooks/useAdminLogin";
import { type AdminViewResult, useAdminView } from "../hooks/useAdminView";
import { type NewPhotoResult, useNewPhoto } from "../hooks/useNewPhoto";
import {
  type ExifForm,
  type PhotoDetailsResult,
  usePhotoDetails,
} from "../hooks/usePhotoDetails";
import {
  type PhotoSelectionResult,
  usePhotoSelection,
} from "../hooks/usePhotoSelection";
import { portfolioService } from "../services/portfolioService";
import type { Photo } from "../types";
import { BatchUploader } from "./admin/BatchUploader";
import { CategoriesManageDialog } from "./admin/CategoriesManageDialog";
import { CategoryPicker } from "./admin/CategoryPicker";
import { DailyChallengePanel } from "./admin/DailyChallengePanel";
import { ForgotPasswordForm } from "./admin/ForgotPasswordForm";
import { GoogleSignInButton } from "./admin/GoogleSignInButton";
import { OptimizedImage } from "./OptimizedImage";
import { PhotoEditor } from "./PhotoEditor";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type CategoryGroup = AdminViewResult["categorizedPhotos"][number];

// ── Login screen ──────────────────────────────────────────────────────────────

interface LoginScreenProps {
  login: AdminLoginResult;
  onForgotPassword: () => void;
  onSignedIn: () => void;
}

const LoginScreen = ({
  login,
  onForgotPassword,
  onSignedIn,
}: LoginScreenProps) => (
  <div className="flex min-h-[min(70dvh,32rem)] w-full flex-col items-center justify-center space-y-6 px-2">
    <div className="rounded-full border border-white/10 bg-white/5 p-5 sm:p-6">
      <HugeiconsIcon icon={Shield01Icon} size={72} />
    </div>
    <h2 className="text-center font-light text-xl uppercase tracking-[0.25em] sm:text-2xl sm:tracking-[0.3em]">
      Admin Access
    </h2>
    <p className="max-w-sm px-2 text-center text-[10px] text-white/90 uppercase tracking-[0.2em]">
      Sign in with your email and password.
    </p>
    <form
      aria-label="Admin sign in"
      className="w-full max-w-sm space-y-4"
      onSubmit={(e) => void login.handleLogin(e)}
    >
      <div className="space-y-2">
        <Label
          className="text-[10px] text-white/90 uppercase tracking-widest"
          htmlFor="admin-email"
        >
          Email
        </Label>
        <Input
          autoComplete="username"
          className="min-h-11 border-white/10 bg-black/40 text-base transition-colors focus:border-white/40"
          id="admin-email"
          onChange={(e) => login.setEmail(e.target.value)}
          required
          type="email"
          value={login.email}
        />
      </div>
      <div className="space-y-2">
        <Label
          className="text-[10px] text-white/90 uppercase tracking-widest"
          htmlFor="admin-password"
        >
          Password
        </Label>
        <Input
          autoComplete="current-password"
          className="min-h-11 border-white/10 bg-black/40 text-base transition-colors focus:border-white/40"
          id="admin-password"
          onChange={(e) => login.setPassword(e.target.value)}
          required
          type="password"
          value={login.password}
        />
      </div>
      <Button
        className="flex min-h-12 w-full items-center justify-center gap-2 border-white/20 px-8 py-3 text-[10px] uppercase tracking-widest transition-all duration-500 hover:bg-white hover:text-black"
        disabled={login.isSubmitting}
        type="submit"
        variant="outline"
      >
        <HugeiconsIcon icon={Login02Icon} size={16} />
        {login.isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
      <button
        className="min-h-11 w-full text-[10px] text-white/90 uppercase tracking-[0.2em] transition-colors hover:text-white"
        onClick={onForgotPassword}
        type="button"
      >
        Forgot password?
      </button>
    </form>
    <GoogleSignInButton onSignedIn={onSignedIn} />
  </div>
);

// ── Add new item ──────────────────────────────────────────────────────────────

interface AddItemFormProps {
  categoryOptionsDisabled: boolean;
  data: AdminDataResult;
  newPhoto: NewPhotoResult;
}

const AddItemForm = ({
  categoryOptionsDisabled,
  data,
  newPhoto,
}: AddItemFormProps) => (
  <Card className="h-full overflow-visible border-white/10 bg-white/5">
    <CardHeader>
      <CardTitle className="font-light text-sm text-white/90 uppercase tracking-[0.3em]">
        Add New Item
      </CardTitle>
    </CardHeader>
    <CardContent>
      <form
        className="grid grid-cols-1 items-end gap-5 md:gap-6"
        onSubmit={(e) => void newPhoto.handleAdd(e)}
      >
        <div className="space-y-3 lg:col-span-2">
          <Label
            className="text-[10px] text-white/90 uppercase tracking-widest"
            htmlFor="add-image-file"
          >
            Image
          </Label>
          <div className="flex flex-col gap-2">
            <input
              accept="image/jpeg,image/png,image/webp,image/gif"
              aria-label="Upload image from device"
              className="min-h-11 w-full text-[11px] text-white/90 file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2.5 file:font-medium file:text-[10px] file:text-white/90 file:uppercase file:tracking-widest hover:file:bg-white/15"
              id="add-image-file"
              onChange={(e) =>
                newPhoto.setUploadDraftFile(e.target.files?.[0] ?? null)
              }
              ref={newPhoto.imageFileInputRef}
              required
              type="file"
            />
            {newPhoto.uploadDraftFile ? (
              <p className="flex items-center gap-1 text-[10px] text-white/90">
                <HugeiconsIcon icon={Upload02Icon} size={12} />
                <span className="truncate">
                  {newPhoto.uploadDraftFile.name}
                </span>
              </p>
            ) : (
              <p className="text-[10px] text-white/90">
                JPEG, PNG, WebP, or GIF (max 8MB).
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <Label
            className="text-[10px] text-white/90 uppercase tracking-widest"
            htmlFor="title"
          >
            Title
          </Label>
          <Input
            className="min-h-11 border-white/10 bg-black/40 text-base transition-colors focus:border-white/40 sm:text-sm"
            id="title"
            onChange={(e) =>
              newPhoto.setForm({
                ...newPhoto.form,
                title: e.target.value,
              })
            }
            placeholder="Project Name"
            required
            value={newPhoto.form.title}
          />
        </div>

        <div className="space-y-3 lg:col-span-2">
          <BatchUploader
            categories={data.categories}
            categoryId={newPhoto.form.categoryId}
            reload={data.reload}
          />
        </div>

        <CategoryPicker
          categories={data.categories}
          disabled={categoryOptionsDisabled}
          id="add-item-category"
          isCreating={data.isSavingCategory}
          label="Category"
          onChange={(categoryId) =>
            newPhoto.setForm({ ...newPhoto.form, categoryId })
          }
          onCreate={data.createCategoryFromLabel}
          value={newPhoto.form.categoryId}
        />

        <Button
          className="min-h-11"
          disabled={
            categoryOptionsDisabled ||
            newPhoto.isUploading ||
            !newPhoto.uploadDraftFile
          }
          size="lg"
          type="submit"
          variant="default"
        >
          <HugeiconsIcon icon={Add01Icon} size={16} />
          {newPhoto.isUploading ? "Uploading…" : "Add Item"}
        </Button>
      </form>
    </CardContent>
  </Card>
);

// ── Items header controls ─────────────────────────────────────────────────────

interface ViewToggleButtonProps {
  onToggle: () => void;
  stackedView: boolean;
}

const ViewToggleButton = ({ onToggle, stackedView }: ViewToggleButtonProps) => (
  <Button
    aria-label={stackedView ? "Switch to grid view" : "Switch to stacked view"}
    className={`flex items-center gap-1.5 border-white/15 text-[10px] uppercase tracking-widest transition-colors hover:bg-white/10 hover:text-white ${
      stackedView ? "border-white/30 bg-white/10 text-white" : "text-white/90"
    }`}
    onClick={onToggle}
    size="sm"
    type="button"
    variant="outline"
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
        className="min-h-11 bg-white text-[10px] text-black uppercase tracking-widest hover:bg-white/90"
        disabled={
          selection.isBatchUpdating ||
          selection.isBatchDeleting ||
          categoryOptionsDisabled
        }
        onClick={() => void selection.batchSetCategory()}
        size="sm"
        type="button"
      >
        {selection.isBatchUpdating ? "Applying…" : "Set category"}
      </Button>
      <Button
        className="min-h-11 border-red-500/40 text-[10px] text-red-400 uppercase tracking-widest hover:border-red-500/60 hover:bg-red-500/10"
        disabled={selection.isBatchDeleting || selection.isBatchUpdating}
        onClick={() => void selection.batchDelete()}
        size="sm"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon icon={Delete02Icon} size={14} />
        {selection.isBatchDeleting ? "Deleting…" : "Delete"}
      </Button>
      <Button
        className="min-h-11 text-[10px] text-white/90 uppercase tracking-widest"
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

interface PhotoCardProps {
  isDragging: boolean;
  isNew: boolean;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDragStart: () => void;
  onEditDetails: (photo: Photo) => void;
  onEditImage: (photo: Photo) => void;
  onRotate: (photo: Photo) => void;
  onTogglePublished: (photo: Photo) => void;
  photo: Photo;
  selection: PhotoSelectionResult;
}

const PhotoCard = ({
  isDragging,
  isNew,
  onDragEnd,
  onDragOver,
  onDragStart,
  onEditDetails,
  onEditImage,
  onRotate,
  onTogglePublished,
  photo,
  selection,
}: PhotoCardProps) => {
  const selected = selection.selectedIds.includes(photo.id);
  return (
    // Only a drag source, never a button: it wraps the checkbox and the edit
    // controls, so a real button here would nest interactive elements, and
    // there is no keyboard reorder for a focus stop to operate.
    //
    // Reordering by keyboard is the Order field in Edit details, which sets a
    // position directly — so dragging is a shortcut for people who can, not
    // the only way in.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: HTML5 drag needs its handlers on the dragged element itself
    // biome-ignore lint/a11y/noStaticElementInteractions: as above — the keyboard path is the Order field
    <div
      className={`group relative aspect-3/4 rounded-lg p-0.5 transition-opacity ${isNew ? "animate-photo-enter" : ""} ${isDragging ? "opacity-40" : ""}`}
      draggable
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        // Both are needed: without preventDefault the browser refuses the drop
        // and animates the card snapping back to where it started.
        e.preventDefault();
        onDragOver();
      }}
      onDragStart={onDragStart}
      onDrop={(e) => e.preventDefault()}
    >
      <div
        aria-hidden
        className="absolute inset-0 animate-gradient-spin rounded-lg opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "conic-gradient(from calc(var(--gradient-angle) + 335deg), transparent 0deg, oklch(89.62% 0.16 184.25deg) 30deg, oklch(88.7% 0.25 138.31deg) 60deg, transparent 100deg, transparent 360deg)",
          filter: "blur(10px)",
        }}
      />
      <div
        className={`relative h-full overflow-hidden rounded-md border bg-black/40 transition-colors ${
          selected ? "border-white/40 ring-1 ring-white/30" : "border-white/10"
        }`}
      >
        <OptimizedImage
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          referrerPolicy="no-referrer"
          sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 90vw"
          src={photo.url}
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-t from-black via-black/50 to-black/20"
        />

        <label
          className="absolute top-1 left-1 z-10 flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md"
          htmlFor={`select-photo-${photo.id}`}
        >
          <Checkbox
            aria-label={`Select ${photo.title}`}
            checked={selected}
            className="h-5 w-5"
            id={`select-photo-${photo.id}`}
            onChange={() => selection.toggle(photo.id)}
          />
        </label>

        <div className="absolute top-1 right-0.5 z-10 flex flex-col gap-0.5">
          <Button
            aria-label={`Edit title and category for ${photo.title}`}
            className="size-10 min-h-11 min-w-11 text-white/90 hover:bg-white/15 hover:text-white"
            onClick={() => onEditDetails(photo)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={FileEditIcon} size={18} />
          </Button>
          <Button
            aria-label={`Open image editor for ${photo.title}`}
            className="size-10 min-h-11 min-w-11 text-white/90 hover:bg-white/15 hover:text-white"
            onClick={() => onEditImage(photo)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={PencilEdit01Icon} size={18} />
          </Button>
          <Button
            aria-label={`Rotate ${photo.title} 90 degrees`}
            className="size-10 min-h-11 min-w-11 text-white/90 hover:bg-white/15 hover:text-white"
            onClick={() => onRotate(photo)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={RotateRight01Icon} size={18} />
          </Button>
          <Button
            aria-label={
              photo.isPublished
                ? `Hide ${photo.title} from the site`
                : `Show ${photo.title} on the site`
            }
            aria-pressed={!photo.isPublished}
            className="size-10 min-h-11 min-w-11 text-white/90 hover:bg-white/15 hover:text-white"
            onClick={() => onTogglePublished(photo)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              icon={photo.isPublished ? EyeIcon : EyeOffIcon}
              size={18}
            />
          </Button>
          <Button
            aria-label={`Delete ${photo.title}`}
            className="size-10 min-h-11 min-w-11 text-white/90 hover:bg-red-500/20 hover:text-red-300"
            onClick={() => void selection.deletePhoto(photo.id)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Delete02Icon} size={18} />
          </Button>
        </div>

        <div className="absolute right-0 bottom-0 left-0 z-10 p-2 pt-6">
          <p className="line-clamp-2 font-light text-[10px] text-white uppercase leading-tight tracking-wider drop-shadow-md">
            {photo.title}
          </p>
          <p className="mt-0.5 truncate text-[9px] text-white/75 uppercase tracking-wider drop-shadow">
            {photo.categoryLabel}
          </p>
          <p className="mt-0.5 font-mono text-[9px] text-white/55 drop-shadow">
            #{photo.order}
          </p>
          {photo.isPublished ? null : (
            <p className="mt-1 inline-flex items-center gap-1 rounded-sm bg-amber-400/15 px-1.5 py-0.5 text-[9px] text-amber-200 uppercase tracking-wider">
              <HugeiconsIcon icon={EyeOffIcon} size={10} />
              Hidden
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

interface PhotoGridProps {
  newlyAddedPhotoId: string | null;
  onEditDetails: (photo: Photo) => void;
  onEditImage: (photo: Photo) => void;
  /** The ids in their new order, once a drag settles. */
  onReorder: (photoIds: string[]) => void;
  onRotate: (photo: Photo) => void;
  onTogglePublished: (photo: Photo) => void;
  photos: Photo[];
  selection: PhotoSelectionResult;
}

const PhotoGrid = ({
  newlyAddedPhotoId,
  onEditDetails,
  onEditImage,
  onRotate,
  onReorder,
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
            onRotate={onRotate}
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
  onRotate: (photo: Photo) => void;
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
  onRotate,
  onTogglePublished,
  selection,
  view,
}: ItemsCardProps) => (
  <Card className="overflow-hidden border-white/10 bg-white/5">
    <CardHeader className="flex flex-col gap-3 border-white/5 border-b md:flex-row md:items-center md:gap-4">
      <div className="flex shrink-0 items-center gap-3">
        <CardTitle className="whitespace-nowrap font-light text-sm text-white/90 uppercase tracking-[0.3em]">
          Current Items
        </CardTitle>
        <Button
          className="flex items-center gap-1.5 border-white/15 text-[10px] text-white/90 uppercase tracking-widest hover:bg-white/10 hover:text-white"
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
              onRotate={onRotate}
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

// ── Edit details dialog ───────────────────────────────────────────────────────

interface ExifFieldConfig {
  inputMode?: "decimal" | "numeric" | "text";
  label: string;
  name: keyof ExifForm;
  placeholder: string;
  type?: "datetime-local" | "text";
}

const EXIF_FIELDS: ExifFieldConfig[] = [
  { label: "Make", name: "make", placeholder: "Leica" },
  { label: "Model", name: "model", placeholder: "M6" },
  { label: "Lens", name: "lens", placeholder: "35mm Summicron" },
  {
    inputMode: "decimal",
    label: "Focal length",
    name: "focalLength",
    placeholder: "35",
  },
  {
    inputMode: "decimal",
    label: "Aperture",
    name: "aperture",
    placeholder: "2",
  },
  {
    inputMode: "text",
    label: "Shutter",
    name: "shutter",
    placeholder: "1/250",
  },
  { inputMode: "numeric", label: "ISO", name: "iso", placeholder: "400" },
  {
    label: "Taken at",
    name: "takenAt",
    placeholder: "",
    type: "datetime-local",
  },
];

interface DetailsDialogProps {
  categoryOptionsDisabled: boolean;
  data: AdminDataResult;
  details: PhotoDetailsResult;
}

const DetailsDialog = ({
  categoryOptionsDisabled,
  data,
  details,
}: DetailsDialogProps) => (
  <Dialog
    onOpenChange={(open) => {
      if (!open) {
        details.close();
      }
    }}
    open={details.detailsPhoto !== null}
  >
    <DialogContent
      className="max-h-[85dvh] overflow-y-auto overflow-x-hidden border-white/10 bg-neutral-950 text-white sm:max-w-md"
      showCloseButton
    >
      <form className="space-y-4" onSubmit={(e) => void details.save(e)}>
        <DialogHeader>
          <DialogTitle className="font-light text-white uppercase tracking-[0.2em]">
            Edit details
          </DialogTitle>
          <DialogDescription className="text-white/90 text-xs uppercase tracking-widest">
            Title, category, and sort order. Use the pencil to edit the image.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label
            className="text-[10px] text-white/90 uppercase tracking-widest"
            htmlFor="details-title"
          >
            Title
          </Label>
          <Input
            className="border-white/10 bg-black/40 focus:border-white/40"
            id="details-title"
            onChange={(e) => details.setDetailsTitle(e.target.value)}
            required
            value={details.detailsTitle}
          />
        </div>
        <CategoryPicker
          categories={data.categories}
          disabled={categoryOptionsDisabled}
          id="details-category"
          isCreating={data.isSavingCategory}
          label="Category"
          onChange={details.setDetailsCategoryId}
          onCreate={data.createCategoryFromLabel}
          value={details.detailsCategoryId}
        />
        <div className="space-y-2">
          <Label
            className="text-[10px] text-white/90 uppercase tracking-widest"
            htmlFor="details-order"
          >
            Order
          </Label>
          <Input
            className="border-white/10 bg-black/40 focus:border-white/40"
            id="details-order"
            onChange={(e) =>
              details.setDetailsOrder(Number.parseInt(e.target.value, 10) || 0)
            }
            required
            type="number"
            value={details.detailsOrder}
          />
        </div>

        {/* Read off the file at upload, and wrong often enough to need
            correcting: adapted lenses report nothing, scans carry the
            scanner's date, and a borrowed body stamps someone else's make. */}
        <fieldset className="space-y-3 border-white/10 border-t pt-4">
          <legend className="sr-only">Shooting details</legend>
          <p className="text-[10px] text-white/90 uppercase tracking-widest">
            Shooting details
          </p>

          <div className="grid grid-cols-2 gap-3">
            {EXIF_FIELDS.map((field) => (
              <div className="space-y-2" key={field.name}>
                <Label
                  className="text-[10px] text-white/60 uppercase tracking-widest"
                  htmlFor={`details-exif-${field.name}`}
                >
                  {field.label}
                </Label>
                <Input
                  className="border-white/10 bg-black/40 focus:border-white/40"
                  id={`details-exif-${field.name}`}
                  inputMode={field.inputMode}
                  onChange={(e) =>
                    details.setDetailsExifField(field.name, e.target.value)
                  }
                  placeholder={field.placeholder}
                  type={field.type ?? "text"}
                  value={details.detailsExif[field.name]}
                />
              </div>
            ))}
          </div>

          <p className="text-[10px] text-white/30 leading-relaxed">
            Empty every box to remove the shooting details from this photograph
            entirely.
          </p>
        </fieldset>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button
            className="text-white/90 hover:text-white"
            onClick={details.close}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            className="bg-white text-black hover:bg-white/90"
            disabled={details.isSaving}
            type="submit"
          >
            {details.isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
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
        onRotate={(photo) => void rotatePhoto(photo)}
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

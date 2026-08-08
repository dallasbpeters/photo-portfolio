import {
  FilePenLine,
  Layers,
  LayoutGrid,
  LogIn,
  Pencil,
  Plus,
  Shield,
  Tags,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { type AdminDataResult, useAdminData } from "../hooks/useAdminData";
import { type AdminLoginResult, useAdminLogin } from "../hooks/useAdminLogin";
import { type AdminViewResult, useAdminView } from "../hooks/useAdminView";
import { type NewPhotoResult, useNewPhoto } from "../hooks/useNewPhoto";
import {
  type PhotoDetailsResult,
  usePhotoDetails,
} from "../hooks/usePhotoDetails";
import {
  type PhotoSelectionResult,
  usePhotoSelection,
} from "../hooks/usePhotoSelection";
import type { Photo } from "../types";
import { BatchUploader } from "./admin/BatchUploader";
import { CategoriesManageDialog } from "./admin/CategoriesManageDialog";
import { CategoryPicker } from "./admin/CategoryPicker";
import { DailyChallengePanel } from "./admin/DailyChallengePanel";
import { ForgotPasswordForm } from "./admin/ForgotPasswordForm";
import { GoogleSignInButton } from "./admin/GoogleSignInButton";
import { PagesPanel } from "./admin/PagesPanel";
import { SiteSettingsPanel } from "./admin/SiteSettingsPanel";
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

interface AdminProps {
  isAuthenticated: boolean;
  onLogin: () => void;
  onLogout: () => void;
}

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
      <Shield aria-hidden className="size-10 text-white/90 sm:size-12" />
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
        <LogIn aria-hidden size={16} />
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
                <Upload aria-hidden className="shrink-0 opacity-70" size={12} />
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
          className="flex min-h-11 w-full items-center justify-center gap-2 bg-[#52ffd4] text-[12px] text-black uppercase tracking-widest transition-colors hover:bg-white/80 lg:col-span-1"
          disabled={
            categoryOptionsDisabled ||
            newPhoto.isUploading ||
            !newPhoto.uploadDraftFile
          }
          type="submit"
        >
          <Plus aria-hidden size={16} />
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
      <LayoutGrid aria-hidden size={13} />
    ) : (
      <Layers aria-hidden size={13} />
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
        <Trash2 aria-hidden className="mr-1 inline" size={14} />
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
  isNew: boolean;
  onEditDetails: (photo: Photo) => void;
  onEditImage: (photo: Photo) => void;
  photo: Photo;
  selection: PhotoSelectionResult;
}

const PhotoCard = ({
  isNew,
  onEditDetails,
  onEditImage,
  photo,
  selection,
}: PhotoCardProps) => {
  const selected = selection.selectedIds.includes(photo.id);
  return (
    <article
      className={`group relative aspect-3/4 rounded-lg p-0.5 ${isNew ? "animate-photo-enter" : ""}`}
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
            <FilePenLine aria-hidden size={18} />
          </Button>
          <Button
            aria-label={`Open image editor for ${photo.title}`}
            className="size-10 min-h-11 min-w-11 text-white/90 hover:bg-white/15 hover:text-white"
            onClick={() => onEditImage(photo)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Pencil aria-hidden size={18} />
          </Button>
          <Button
            aria-label={`Delete ${photo.title}`}
            className="size-10 min-h-11 min-w-11 text-white/90 hover:bg-red-500/20 hover:text-red-300"
            onClick={() => void selection.deletePhoto(photo.id)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden size={18} />
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
        </div>
      </div>
    </article>
  );
};

interface PhotoGridProps {
  newlyAddedPhotoId: string | null;
  onEditDetails: (photo: Photo) => void;
  onEditImage: (photo: Photo) => void;
  photos: Photo[];
  selection: PhotoSelectionResult;
}

const PhotoGrid = ({
  newlyAddedPhotoId,
  onEditDetails,
  onEditImage,
  photos,
  selection,
}: PhotoGridProps) => (
  <div className="p-2 sm:p-3">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {photos.map((photo) => (
        <PhotoCard
          isNew={photo.id === newlyAddedPhotoId}
          key={photo.id}
          onEditDetails={onEditDetails}
          onEditImage={onEditImage}
          photo={photo}
          selection={selection}
        />
      ))}
    </div>
  </div>
);

// ── Current items ─────────────────────────────────────────────────────────────

interface ItemsCardProps {
  categoryOptionsDisabled: boolean;
  data: AdminDataResult;
  newPhoto: NewPhotoResult;
  onEditDetails: (photo: Photo) => void;
  onEditImage: (photo: Photo) => void;
  onManageCategories: () => void;
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
          <Tags aria-hidden size={13} />
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

export const Admin = ({ isAuthenticated, onLogin }: AdminProps) => {
  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);

  const login = useAdminLogin(onLogin);
  const data = useAdminData(isAuthenticated);
  const view = useAdminView(data.photos);
  const selection = usePhotoSelection(
    data.photos,
    data.categories,
    data.reload
  );
  const details = usePhotoDetails(data.reload);
  const newPhoto = useNewPhoto(data.categories, data.reload);

  const categoryOptionsDisabled = data.categories.length === 0;

  // ── Login screen ────────────────────────────────────────────────────────────

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

  // ── Authenticated ────────────────────────────────────────────────────────────

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

      <PagesPanel />

      <SiteSettingsPanel />
    </div>
  );
};

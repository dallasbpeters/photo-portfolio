import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Checkbox } from './ui/checkbox';
import { Trash2, Plus, LogIn, Shield, Pencil, FilePenLine, Tags, Upload, Layers, LayoutGrid } from 'lucide-react';
import { CategoryPicker } from './admin/CategoryPicker';
import { CategoriesManageDialog } from './admin/CategoriesManageDialog';
import { ForgotPasswordForm } from './admin/ForgotPasswordForm';
import { GoogleSignInButton } from './admin/GoogleSignInButton';
import { DailyChallengePanel } from './admin/DailyChallengePanel';
import { SiteSettingsPanel } from './admin/SiteSettingsPanel';
import { PhotoEditor } from './PhotoEditor';
import { useAdminData } from '../hooks/useAdminData';
import { useAdminLogin } from '../hooks/useAdminLogin';
import { useAdminView } from '../hooks/useAdminView';
import { useNewPhoto } from '../hooks/useNewPhoto';
import { usePhotoDetails } from '../hooks/usePhotoDetails';
import { usePhotoSelection } from '../hooks/usePhotoSelection';
import type { Photo } from '../types';

type AdminProps = {
  isAuthenticated: boolean;
  onLogin: () => void;
  onLogout: () => void;
};

export const Admin = ({ isAuthenticated, onLogin }: AdminProps) => {
  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);

  const login      = useAdminLogin(onLogin);
  const data       = useAdminData(isAuthenticated);
  const view       = useAdminView(data.photos);
  const selection  = usePhotoSelection(data.photos, data.categories, data.reload);
  const details    = usePhotoDetails(data.reload);
  const newPhoto   = useNewPhoto(data.categories, data.reload);

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
      <div className="flex flex-col items-center justify-center min-h-[min(70dvh,32rem)] w-full px-2 space-y-6">
        <div className="p-5 sm:p-6 bg-white/5 rounded-full border border-white/10">
          <Shield className="size-10 text-white/20 sm:size-12" aria-hidden />
        </div>
        <h2 className="text-xl sm:text-2xl font-light tracking-[0.25em] sm:tracking-[0.3em] uppercase text-center">
          Admin Access
        </h2>
        <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] text-center max-w-sm px-2">
          Sign in with your email and password.
        </p>
        <form
          onSubmit={(e) => void login.handleLogin(e)}
          className="w-full max-w-sm space-y-4"
          aria-label="Admin sign in"
        >
          <div className="space-y-2">
            <Label htmlFor="admin-email" className="text-[10px] uppercase tracking-widest text-white/40">
              Email
            </Label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="username"
              value={login.email}
              onChange={(e) => login.setEmail(e.target.value)}
              required
              className="min-h-11 text-base bg-black/40 border-white/10 focus:border-white/40 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password" className="text-[10px] uppercase tracking-widest text-white/40">
              Password
            </Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={login.password}
              onChange={(e) => login.setPassword(e.target.value)}
              required
              className="min-h-11 text-base bg-black/40 border-white/10 focus:border-white/40 transition-colors"
            />
          </div>
          <Button
            type="submit"
            disabled={login.isSubmitting}
            variant="outline"
            className="w-full min-h-12 flex items-center justify-center gap-2 border-white/20 hover:bg-white hover:text-black transition-all duration-500 uppercase tracking-widest text-[10px] px-8 py-3"
          >
            <LogIn size={16} aria-hidden />
            {login.isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
          <button
            type="button"
            onClick={() => setIsRecoveringPassword(true)}
            className="w-full min-h-11 text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white transition-colors"
          >
            Forgot password?
          </button>
        </form>
        <GoogleSignInButton onSignedIn={onLogin} />
      </div>
    );
  }

  // ── Authenticated ────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full space-y-8 md:space-y-12">
      <CategoriesManageDialog
        open={categoriesModalOpen}
        onOpenChange={setCategoriesModalOpen}
        categories={data.categories}
        loading={data.isLoadingCategories}
        isCreating={data.isSavingCategory}
        onCreate={data.createCategoryFromLabel}
        onDelete={(cat) => void data.handleDeleteCategory(cat)}
      />

      {/* ── Top row: daily challenge + add form ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-5 md:gap-6 items-end">
        <DailyChallengePanel />

        <Card className="bg-white/5 border-white/10 overflow-visible h-full">
          <CardHeader>
            <CardTitle className="text-sm font-light uppercase tracking-[0.3em] text-white/60">
              Add New Item
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => void newPhoto.handleAdd(e)}
              className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 items-end"
            >
              <div className="space-y-3 lg:col-span-2">
                <Label htmlFor="add-image-file" className="text-[10px] uppercase tracking-widest text-white/40">
                  Image
                </Label>
                <div className="flex flex-col gap-2">
                  <input
                    ref={newPhoto.imageFileInputRef}
                    id="add-image-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    required
                    className="min-h-11 w-full text-[11px] text-white/70 file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2.5 file:text-[10px] file:font-medium file:uppercase file:tracking-widest file:text-white/90 hover:file:bg-white/15"
                    aria-label="Upload image from device"
                    onChange={(e) => newPhoto.setUploadDraftFile(e.target.files?.[0] ?? null)}
                  />
                  {newPhoto.uploadDraftFile ? (
                    <p className="flex items-center gap-1 text-[10px] text-white/45">
                      <Upload size={12} className="shrink-0 opacity-70" aria-hidden />
                      <span className="truncate">{newPhoto.uploadDraftFile.name}</span>
                    </p>
                  ) : (
                    <p className="text-[10px] text-white/35">JPEG, PNG, WebP, or GIF (max 8MB).</p>
                  )}
                </div>
              </div>

              <div className="space-y-3 lg:col-span-2">
                <Label htmlFor="title" className="text-[10px] uppercase tracking-widest text-white/40">
                  Title
                </Label>
                <Input
                  id="title"
                  value={newPhoto.form.title}
                  onChange={(e) => newPhoto.setForm({ ...newPhoto.form, title: e.target.value })}
                  placeholder="Project Name"
                  required
                  className="min-h-11 text-base sm:text-sm bg-black/40 border-white/10 focus:border-white/40 transition-colors"
                />
              </div>

              <CategoryPicker
                id="add-item-category"
                label="Category"
                categories={data.categories}
                value={newPhoto.form.categoryId}
                onChange={(categoryId) => newPhoto.setForm({ ...newPhoto.form, categoryId })}
                onCreate={data.createCategoryFromLabel}
                disabled={categoryOptionsDisabled}
                isCreating={data.isSavingCategory}
              />

              <Button
                type="submit"
                disabled={categoryOptionsDisabled || newPhoto.isUploading || !newPhoto.uploadDraftFile}
                className="w-full min-h-11 flex items-center justify-center gap-2 bg-[#52ffd4] text-black hover:bg-white/80 transition-colors uppercase tracking-widest text-[12px] lg:col-span-1"
              >
                <Plus size={16} aria-hidden />
                {newPhoto.isUploading ? 'Uploading…' : 'Add Item'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* ── Current items ── */}
      <Card className="bg-white/5 border-white/10 overflow-hidden">
        <CardHeader className="flex flex-col gap-3 border-b border-white/5 md:flex-row md:items-center md:gap-4">
          <div className="flex shrink-0 items-center gap-3">
            <CardTitle className="text-sm font-light uppercase tracking-[0.3em] text-white/60 whitespace-nowrap">
              Current Items
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCategoriesModalOpen(true)}
              className="flex items-center gap-1.5 border-white/15 uppercase tracking-widest text-[10px] text-white/60 hover:bg-white/10 hover:text-white"
            >
              <Tags size={13} aria-hidden />
              Categories
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={view.toggleView}
              aria-label={view.stackedView ? 'Switch to grid view' : 'Switch to stacked view'}
              className={`flex items-center gap-1.5 border-white/15 uppercase tracking-widest text-[10px] hover:bg-white/10 hover:text-white transition-colors ${
                view.stackedView ? 'bg-white/10 text-white border-white/30' : 'text-white/60'
              }`}
            >
              {view.stackedView ? <LayoutGrid size={13} aria-hidden /> : <Layers size={13} aria-hidden />}
              {view.stackedView ? 'Grid' : 'Stack'}
            </Button>
          </div>

          {selection.someSelected && (
            <div
              className="flex w-full flex-col gap-2 md:ml-auto md:w-auto md:flex-row md:items-center"
              role="region"
              aria-label="Batch actions for selected photos"
            >
              <span className="shrink-0 text-[10px] uppercase tracking-widest text-white/50">
                {selection.selectedIds.length} selected
              </span>
              <div className="w-full min-w-0 md:max-w-48 md:flex-1">
                <CategoryPicker
                  id="batch-category"
                  label="Category"
                  categories={data.categories}
                  value={selection.batchCategoryId}
                  onChange={selection.setBatchCategoryId}
                  onCreate={data.createCategoryFromLabel}
                  disabled={categoryOptionsDisabled}
                  isCreating={data.isSavingCategory}
                  className="[&_label]:sr-only"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={selection.isBatchUpdating || selection.isBatchDeleting || categoryOptionsDisabled}
                  onClick={() => void selection.batchSetCategory()}
                  className="min-h-11 bg-white text-black hover:bg-white/90 uppercase tracking-widest text-[10px]"
                >
                  {selection.isBatchUpdating ? 'Applying…' : 'Set category'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={selection.isBatchDeleting || selection.isBatchUpdating}
                  onClick={() => void selection.batchDelete()}
                  className="min-h-11 border-red-500/40 text-red-400 hover:border-red-500/60 hover:bg-red-500/10 uppercase tracking-widest text-[10px]"
                >
                  <Trash2 size={14} className="mr-1 inline" aria-hidden />
                  {selection.isBatchDeleting ? 'Deleting…' : 'Delete'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={selection.isBatchDeleting || selection.isBatchUpdating}
                  onClick={selection.clear}
                  className="min-h-11 text-[10px] uppercase tracking-widest text-white/50"
                >
                  Clear
                </Button>
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {data.isLoadingPhotos ? (
            <p className="p-6 text-sm text-white/40 uppercase tracking-widest text-center">Loading…</p>
          ) : data.photos.length === 0 ? (
            <p className="p-6 text-sm text-white/40 uppercase tracking-widest text-center">
              No photos yet. Add one above.
            </p>
          ) : (
            <>
              {!view.stackedView && (
                <div className="flex items-center gap-3 border-b border-white/10 bg-black/20 px-3 py-2.5">
                  <Checkbox
                    ref={selection.selectAllRef}
                    checked={selection.allSelected}
                    onChange={selection.toggleAll}
                    disabled={data.photos.length === 0}
                    className="h-5 w-5"
                    aria-label="Select all photos"
                  />
                  <span className="text-[10px] uppercase tracking-widest text-white/50">Select all</span>
                </div>
              )}

              {/* ── Stacked view ── */}
              {view.stackedView && (
                <div className="p-4 sm:p-6">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {view.categorizedPhotos.map((group, groupIdx) => {
                      const allSelected  = group.photos.every((p) => selection.selectedIds.includes(p.id));
                      const someSelected = group.photos.some((p) => selection.selectedIds.includes(p.id));
                      const stackCards   = group.photos.slice(0, 4).reverse();
                      const rotations    = [-5, 3, -1.5, 0];
                      const offsets      = [-8, -4, -2, 0];
                      return (
                        <div
                          key={group.categoryId}
                          className="animate-stack-in flex flex-col gap-3"
                          style={{ animationDelay: `${groupIdx * 0.07}s` }}
                        >
                          <div className="group/stack relative aspect-3/4 rounded-lg p-[8px]">
                            <div
                              aria-hidden
                              className={`animate-gradient-spin absolute inset-0 rounded-lg blur-[5px] transition-opacity duration-500 ${
                                allSelected ? 'opacity-100' : someSelected ? 'opacity-60' : 'opacity-0 group-hover/stack:opacity-30'
                              }`}
                              style={{
                                background: `conic-gradient(from calc(var(--gradient-angle) + 335deg), transparent 0deg, oklch(52.74% 0.21 281.43deg) 30deg, oklch(73.91% 0.22 322.89deg) 60deg, transparent 100deg, transparent 360deg)`,
                                filter: 'blur(20px)',
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => selection.toggleCategoryGroup(group.photos)}
                              className="relative h-full w-full cursor-pointer"
                              aria-label={`${allSelected ? 'Deselect' : 'Select'} all in ${group.categoryLabel}`}
                            >
                              {stackCards.map((photo, i) => (
                                <div
                                  key={photo.id}
                                  className="absolute inset-0 overflow-hidden rounded-lg border border-white/10 bg-black/40 transition-transform duration-300 group-hover/stack:duration-200"
                                  style={{
                                    transform: `rotate(${rotations[i]}deg) translateY(${offsets[i]}px)`,
                                    zIndex: i + 1,
                                    transitionDelay: `${i * 20}ms`,
                                  }}
                                >
                                  <img
                                    src={photo.url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                              ))}
                              <div className="absolute bottom-2 right-2 z-20 rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-medium uppercase tracking-widest text-white/70 backdrop-blur-sm">
                                {group.photos.length}
                              </div>
                            </button>
                          </div>
                          <div>
                            <p className={`truncate text-[10px] uppercase tracking-widest transition-colors ${allSelected ? 'text-white' : 'text-white/60'}`}>
                              {group.categoryLabel}
                            </p>
                            <p className="text-[9px] text-white/30">
                              {group.photos.length} {group.photos.length === 1 ? 'photo' : 'photos'}
                              {someSelected && !allSelected && (
                                ` · ${group.photos.filter((p) => selection.selectedIds.includes(p.id)).length} selected`
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Grid view ── */}
              {!view.stackedView && (
                <div className="p-2 sm:p-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {data.photos.map((photo) => {
                      const selected = selection.selectedIds.includes(photo.id);
                      const isNew    = photo.id === newPhoto.newlyAddedPhotoId;
                      return (
                        <article
                          key={photo.id}
                          className={`group relative aspect-3/4 rounded-lg p-[2px] ${isNew ? 'animate-photo-enter' : ''}`}
                        >
                          <div
                            aria-hidden
                            className="animate-gradient-spin absolute inset-0 rounded-lg opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                            style={{
                              background: `conic-gradient(from calc(var(--gradient-angle) + 335deg), transparent 0deg, oklch(89.62% 0.16 184.25deg) 30deg, oklch(88.7% 0.25 138.31deg) 60deg, transparent 100deg, transparent 360deg)`,
                              filter: 'blur(10px)',
                            }}
                          />
                          <div
                            className={`relative h-full overflow-hidden rounded-[calc(0.5rem-2px)] border bg-black/40 transition-colors ${
                              selected ? 'border-white/40 ring-1 ring-white/30' : 'border-white/10'
                            }`}
                          >
                            <img
                              src={photo.url}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-linear-to-t from-black via-black/50 to-black/20" aria-hidden />

                            <label className="absolute left-1 top-1 z-10 flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md">
                              <Checkbox
                                checked={selected}
                                onChange={() => selection.toggle(photo.id)}
                                className="h-5 w-5"
                                aria-label={`Select ${photo.title}`}
                              />
                            </label>

                            <div className="absolute right-0.5 top-1 z-10 flex flex-col gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                type="button"
                                onClick={() => details.open(photo)}
                                className="size-10 min-h-11 min-w-11 text-white/90 hover:bg-white/15 hover:text-white"
                                aria-label={`Edit title and category for ${photo.title}`}
                              >
                                <FilePenLine size={18} aria-hidden />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                type="button"
                                onClick={() => setEditingPhoto(photo)}
                                className="size-10 min-h-11 min-w-11 text-white/90 hover:bg-white/15 hover:text-white"
                                aria-label={`Open image editor for ${photo.title}`}
                              >
                                <Pencil size={18} aria-hidden />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                type="button"
                                onClick={() => void selection.deletePhoto(photo.id)}
                                className="size-10 min-h-11 min-w-11 text-white/90 hover:bg-red-500/20 hover:text-red-300"
                                aria-label={`Delete ${photo.title}`}
                              >
                                <Trash2 size={18} aria-hidden />
                              </Button>
                            </div>

                            <div className="absolute bottom-0 left-0 right-0 z-10 p-2 pt-6">
                              <p className="line-clamp-2 text-[10px] font-light uppercase leading-tight tracking-wider text-white drop-shadow-md">
                                {photo.title}
                              </p>
                              <p className="mt-0.5 truncate text-[9px] uppercase tracking-wider text-white/75 drop-shadow">
                                {photo.categoryLabel}
                              </p>
                              <p className="mt-0.5 font-mono text-[9px] text-white/55 drop-shadow">#{photo.order}</p>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Edit details dialog ── */}
      <Dialog open={details.detailsPhoto !== null} onOpenChange={(open) => !open && details.close()}>
        <DialogContent
          className="max-h-[85dvh] overflow-y-auto overflow-x-hidden border-white/10 bg-neutral-950 text-white sm:max-w-md"
          showCloseButton
        >
          <form onSubmit={(e) => void details.save(e)} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="font-light uppercase tracking-[0.2em] text-white">
                Edit details
              </DialogTitle>
              <DialogDescription className="text-white/50 text-xs uppercase tracking-widest">
                Title, category, and sort order. Use the pencil to edit the image.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="details-title" className="text-[10px] uppercase tracking-widest text-white/40">
                Title
              </Label>
              <Input
                id="details-title"
                value={details.detailsTitle}
                onChange={(e) => details.setDetailsTitle(e.target.value)}
                required
                className="border-white/10 bg-black/40 focus:border-white/40"
              />
            </div>
            <CategoryPicker
              id="details-category"
              label="Category"
              categories={data.categories}
              value={details.detailsCategoryId}
              onChange={details.setDetailsCategoryId}
              onCreate={data.createCategoryFromLabel}
              disabled={categoryOptionsDisabled}
              isCreating={data.isSavingCategory}
            />
            <div className="space-y-2">
              <Label htmlFor="details-order" className="text-[10px] uppercase tracking-widest text-white/40">
                Order
              </Label>
              <Input
                id="details-order"
                type="number"
                value={details.detailsOrder}
                onChange={(e) => details.setDetailsOrder(parseInt(e.target.value, 10) || 0)}
                required
                className="border-white/10 bg-black/40 focus:border-white/40"
              />
            </div>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" className="text-white/60 hover:text-white" onClick={details.close}>
                Cancel
              </Button>
              <Button type="submit" disabled={details.isSaving} className="bg-white text-black hover:bg-white/90">
                {details.isSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {editingPhoto && (
        <PhotoEditor
          photo={editingPhoto}
          onClose={() => setEditingPhoto(null)}
          onSaved={() => {
            void data.reload();
          }}
        />
      )}

      <SiteSettingsPanel />
    </div>
  );
};

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Upload02Icon } from "@hugeicons-pro/core-stroke-standard";
import type { AdminDataResult } from "../../hooks/useAdminData";
import type { NewPhotoResult } from "../../hooks/useNewPhoto";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { BatchUploader } from "./BatchUploader";
import { CategoryPicker } from "./CategoryPicker";

// ── Add new item ──────────────────────────────────────────────────────────────

interface AddItemFormProps {
  categoryOptionsDisabled: boolean;
  data: AdminDataResult;
  newPhoto: NewPhotoResult;
}

export const AddItemForm = ({
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

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
import "../../styles/primitives.css";
import "../../styles/adminChrome.css";
import "./AddItemForm.css";

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
  <Card className="add-item">
    <CardHeader>
      <CardTitle className="add-item__title">Add New Item</CardTitle>
    </CardHeader>
    <CardContent>
      <form
        className="add-item__form"
        onSubmit={(e) => void newPhoto.handleAdd(e)}
      >
        <div className="stack stack--mid">
          <Label className="admin-caps" htmlFor="add-image-file">
            Image
          </Label>
          <div className="stack stack--tight">
            <input
              accept="image/jpeg,image/png,image/webp,image/gif"
              aria-label="Upload image from device"
              className="admin-file"
              id="add-image-file"
              onChange={(e) =>
                newPhoto.setUploadDraftFile(e.target.files?.[0] ?? null)
              }
              ref={newPhoto.imageFileInputRef}
              required
              type="file"
            />
            {newPhoto.uploadDraftFile ? (
              <p className="add-item__file-name">
                <HugeiconsIcon icon={Upload02Icon} size={12} />
                <span className="add-item__truncate">
                  {newPhoto.uploadDraftFile.name}
                </span>
              </p>
            ) : (
              <p className="add-item__file-note">
                JPEG, PNG, WebP, or GIF (max 8MB).
              </p>
            )}
          </div>
        </div>

        <div className="stack stack--mid">
          <Label className="admin-caps" htmlFor="title">
            Title
          </Label>
          <Input
            className="admin-control add-item__field"
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

        <div className="stack stack--mid">
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

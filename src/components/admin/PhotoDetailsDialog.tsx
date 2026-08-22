import type { AdminDataResult } from "../../hooks/useAdminData";
import type { ExifForm, PhotoDetailsResult } from "../../hooks/usePhotoDetails";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { CategoryPicker } from "./CategoryPicker";
import "../../styles/primitives.css";
import "../../styles/adminChrome.css";
import "./PhotoDetailsDialog.css";

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

export const DetailsDialog = ({
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
    <DialogContent className="admin-dialog--form" showCloseButton>
      <form className="stack" onSubmit={(e) => void details.save(e)}>
        <DialogHeader>
          <DialogTitle className="admin-dialog__heading">
            Edit details
          </DialogTitle>
          <DialogDescription className="admin-dialog__subtitle">
            Title, category, and sort order. Use the pencil to edit the image.
          </DialogDescription>
        </DialogHeader>
        <div className="stack stack--tight">
          <Label className="admin-caps" htmlFor="details-title">
            Title
          </Label>
          <Input
            className="admin-control"
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
        <div className="stack stack--tight">
          <Label className="admin-caps" htmlFor="details-order">
            Order
          </Label>
          <Input
            className="admin-control"
            id="details-order"
            onChange={(e) =>
              details.setDetailsOrder(Number.parseInt(e.target.value, 10) || 0)
            }
            required
            type="number"
            value={details.detailsOrder}
          />
        </div>

        {/* For screenshots rather than photographs. Framing one in a browser
            window says what it is, and lets a tall capture scroll at full
            width in the lightbox instead of shrinking until it is unreadable. */}
        <fieldset className="photo-details__section stack stack--mid">
          <legend className="sr-only">Browser chrome</legend>
          <div className="photo-details__check-row">
            <Checkbox
              checked={details.detailsShowChrome}
              className="photo-details__check"
              id="details-show-chrome"
              onChange={(e) => details.setDetailsShowChrome(e.target.checked)}
            />
            <div className="stack stack--snug">
              <Label className="admin-caps" htmlFor="details-show-chrome">
                Show browser chrome
              </Label>
              <p className="admin-note">
                Frames this image in a browser window and lets it scroll
              </p>
            </div>
          </div>

          {details.detailsShowChrome ? (
            <div className="stack stack--tight">
              <Label className="admin-caps" htmlFor="details-chrome-url">
                Address bar
              </Label>
              <Input
                className="admin-control"
                id="details-chrome-url"
                maxLength={300}
                onChange={(e) => details.setDetailsChromeUrl(e.target.value)}
                placeholder="dallaspeters.com/work"
                value={details.detailsChromeUrl}
              />
              <p className="admin-note">
                Display only — never linked. Leave empty to hide the bar.
              </p>
            </div>
          ) : null}
        </fieldset>

        {/* Read off the file at upload, and wrong often enough to need
            correcting: adapted lenses report nothing, scans carry the
            scanner's date, and a borrowed body stamps someone else's make. */}
        <fieldset className="photo-details__section stack stack--mid">
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
                  className="admin-control"
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
          <Button onClick={details.close} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={details.isSaving} type="submit" variant="default">
            {details.isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
);

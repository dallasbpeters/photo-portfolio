export interface CategoryRow {
  created_at: string | Date;
  id: string;
  label: string;
  photo_count?: number;
  slug: string;
  sort_order: number;
}

export interface CategoryDto {
  createdAt: string;
  id: string;
  label: string;
  photoCount: number;
  slug: string;
  sortOrder: number;
}

export const categoryRowToDto = (row: CategoryRow): CategoryDto => ({
  createdAt: new Date(row.created_at).toISOString(),
  id: row.id,
  label: row.label,
  photoCount: row.photo_count ?? 0,
  slug: row.slug,
  sortOrder: row.sort_order,
});

export const slugifyLabel = (label: string): string => {
  const base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "category";
};

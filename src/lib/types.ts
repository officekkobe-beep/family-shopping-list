export type SyncStatus = "syncing" | "synced" | "offline";

export type Category = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type Store = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type Product = {
  id: string;
  name: string;
  category_id: string;
  store_id: string | null;
  memo: string | null;
  is_selected: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type ProductView = Product & {
  category: Category;
  store: Store | null;
};

export type ImportProduct = {
  storeName: string;
  categoryName: string;
  name: string;
  isSelected: boolean;
  memo: string;
  sortOrder: number | null;
  rowNumber: number;
};

export type ImportPreview = {
  total: number;
  valid: number;
  errors: { rowNumber: number; message: string }[];
  products: ImportProduct[];
  duplicateCount: number;
};

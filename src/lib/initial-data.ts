import type { Category, Product, Store } from "./types";

export const initialCategories: Category[] = [
  { id: "cat-001", name: "野菜", sort_order: 1, is_active: true },
  { id: "cat-002", name: "肉", sort_order: 2, is_active: true },
  { id: "cat-003", name: "日用品", sort_order: 3, is_active: true },
  { id: "cat-004", name: "グロサリ(粉)", sort_order: 4, is_active: true },
  { id: "cat-005", name: "冷蔵", sort_order: 5, is_active: true },
  { id: "cat-006", name: "グロサリ", sort_order: 6, is_active: true },
  { id: "cat-007", name: "グロサリ(油)", sort_order: 7, is_active: true },
  { id: "cat-008", name: "グロサリ(調味料)", sort_order: 8, is_active: true },
  { id: "cat-009", name: "グロサリ(ドリンク)", sort_order: 9, is_active: true },
  { id: "cat-010", name: "グロサリ(麺)", sort_order: 10, is_active: true },
  { id: "cat-011", name: "グロサリ(素)", sort_order: 11, is_active: true },
  { id: "cat-012", name: "魚", sort_order: 12, is_active: true },
  { id: "cat-013", name: "冷凍食品", sort_order: 13, is_active: true },
];

export const initialStores: Store[] = [
  { id: "store-001", name: "業務スーパー", sort_order: 1, is_active: true },
  { id: "store-002", name: "コープ", sort_order: 2, is_active: true },
  { id: "store-003", name: "ロピア", sort_order: 3, is_active: true },
  { id: "store-004", name: "ネット", sort_order: 4, is_active: true },
  { id: "store-005", name: "薬局", sort_order: 5, is_active: true },
  { id: "store-006", name: "100均", sort_order: 6, is_active: true },
  { id: "store-007", name: "スーパー", sort_order: 7, is_active: true },
];

export const initialProducts: Product[] = [
  { id: "prod-001", store_id: "store-007", category_id: "cat-001", name: "フルーツ", is_selected: true, memo: "", sort_order: 1 },
  { id: "prod-002", store_id: "store-006", category_id: "cat-003", name: "ウェッティー", is_selected: true, memo: "", sort_order: 1 },
  { id: "prod-003", store_id: "store-007", category_id: "cat-003", name: "ティッシュ", is_selected: true, memo: "", sort_order: 2 },
  { id: "prod-004", store_id: "store-007", category_id: "cat-003", name: "液体ハイター", is_selected: true, memo: "", sort_order: 3 },
  { id: "prod-005", store_id: "store-004", category_id: "cat-003", name: "燃えるゴミ袋", is_selected: true, memo: "", sort_order: 4 },
  { id: "prod-006", store_id: "store-001", category_id: "cat-005", name: "牛乳", is_selected: true, memo: "", sort_order: 1 },
  { id: "prod-007", store_id: "store-007", category_id: "cat-005", name: "焼きそば", is_selected: true, memo: "", sort_order: 2 },
  { id: "prod-008", store_id: "store-007", category_id: "cat-005", name: "納豆", is_selected: true, memo: "", sort_order: 3 },
  { id: "prod-009", store_id: "store-001", category_id: "cat-006", name: "味噌汁", is_selected: true, memo: "", sort_order: 1 },
  { id: "prod-010", store_id: "store-001", category_id: "cat-010", name: "サリ麺", is_selected: true, memo: "", sort_order: 1 },
  { id: "prod-011", store_id: "store-003", category_id: "cat-012", name: "エビ", is_selected: true, memo: "", sort_order: 1 },
  { id: "prod-012", store_id: "store-002", category_id: "cat-012", name: "魚", is_selected: true, memo: "", sort_order: 2 },
  { id: "prod-013", store_id: "store-001", category_id: "cat-013", name: "枝豆", is_selected: true, memo: "", sort_order: 1 },
];

export const extractionNote =
  "MHTから抽出できた商品は13件です。画面統計では全134件ですが、未選択121件の商品行データはMHT内にありませんでした。";

import type { Category, ImportPreview, ProductView, Store } from "./types";

const trueValues = new Set(["true", "1", "はい", "yes", "y"]);
const falseValues = new Set(["false", "0", "いいえ", "no", "n", ""]);

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }
  if (inQuotes) throw new Error("CSVの引用符が閉じられていません。");
  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function normalizeBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  if (trueValues.has(normalized)) return true;
  if (falseValues.has(normalized)) return false;
  return false;
}

export function previewCsvImport(text: string): ImportPreview {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { total: 0, valid: 0, errors: [{ rowNumber: 1, message: "CSVが空です。" }], products: [], duplicateCount: 0 };
  }
  const header = rows[0].map((h) => h.trim());
  const indexOf = (name: string) => header.indexOf(name);
  const storeIndex = indexOf("店名");
  const categoryIndex = indexOf("カテゴリー");
  const nameIndex = indexOf("商品名");
  const selectedIndex = indexOf("買う予定");
  const memoIndex = indexOf("メモ");
  const orderIndex = indexOf("表示順");
  const errors: ImportPreview["errors"] = [];
  const keyed = new Map<string, ImportPreview["products"][number]>();
  let duplicateCount = 0;

  if (categoryIndex === -1 || nameIndex === -1) {
    return {
      total: Math.max(rows.length - 1, 0),
      valid: 0,
      errors: [{ rowNumber: 1, message: "見出しに「カテゴリー」と「商品名」が必要です。" }],
      products: [],
      duplicateCount: 0,
    };
  }

  rows.slice(1).forEach((row, idx) => {
    const rowNumber = idx + 2;
    const categoryName = (row[categoryIndex] || "").trim();
    const name = (row[nameIndex] || "").trim();
    const storeName = storeIndex >= 0 ? (row[storeIndex] || "").trim() : "";
    const memo = memoIndex >= 0 ? (row[memoIndex] || "").trim() : "";
    const selectedRaw = selectedIndex >= 0 ? row[selectedIndex] || "" : "";
    const orderRaw = orderIndex >= 0 ? (row[orderIndex] || "").trim() : "";
    const sortOrder = orderRaw ? Number(orderRaw) : null;
    if (!name) {
      errors.push({ rowNumber, message: "商品名が空です。" });
      return;
    }
    if (!categoryName) {
      errors.push({ rowNumber, message: "カテゴリーが空です。" });
      return;
    }
    if (orderRaw && (!Number.isFinite(sortOrder) || Number(sortOrder) < 0)) {
      errors.push({ rowNumber, message: "表示順は数字で入力してください。" });
      return;
    }
    const product = {
      storeName,
      categoryName,
      name,
      isSelected: normalizeBoolean(selectedRaw),
      memo,
      sortOrder,
      rowNumber,
    };
    const key = `${storeName}\t${categoryName}\t${name}`;
    if (keyed.has(key)) duplicateCount += 1;
    keyed.set(key, product);
  });

  const products = [...keyed.values()];
  return { total: rows.length - 1, valid: products.length, errors, products, duplicateCount };
}

function escapeCsvCell(value: string | number | boolean | null | undefined) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildProductsCsv(products: ProductView[]) {
  const rows = [
    ["店名", "カテゴリー", "商品名", "買う予定", "メモ", "表示順"],
    ...products.map((product) => [
      product.store?.name || "",
      product.category.name,
      product.name,
      product.is_selected ? "TRUE" : "FALSE",
      product.memo || "",
      product.sort_order,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
}

export function buildImportPayload(preview: ImportPreview) {
  const categoryNames = [...new Set(preview.products.map((p) => p.categoryName))];
  const storeNames = [...new Set(preview.products.map((p) => p.storeName).filter(Boolean))];
  return {
    categories: categoryNames.map((name, index) => ({ name, sort_order: index + 1, is_active: true })),
    stores: storeNames.map((name, index) => ({ name, sort_order: index + 1, is_active: true })),
    products: preview.products.map((product, index) => ({
      name: product.name,
      category_name: product.categoryName,
      store_name: product.storeName || null,
      memo: product.memo,
      is_selected: product.isSelected,
      sort_order: product.sortOrder || index + 1,
    })),
  };
}

export function makeCopyText(products: ProductView[], mode: "store" | "category") {
  const selected = products.filter((product) => product.is_selected);
  if (selected.length === 0) return "買うものはありません";
  const groups = new Map<string, ProductView[]>();
  const sorted = [...selected].sort((a, b) => {
    if (mode === "store") {
      const storeDiff = (a.store?.sort_order ?? 9999) - (b.store?.sort_order ?? 9999);
      if (storeDiff !== 0) return storeDiff;
    }
    const categoryDiff = a.category.sort_order - b.category.sort_order;
    if (categoryDiff !== 0) return categoryDiff;
    return a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ja");
  });
  for (const product of sorted) {
    const key = mode === "store" ? product.store?.name || "その他" : product.category.name;
    groups.set(key, [...(groups.get(key) || []), product]);
  }
  return [...groups.entries()]
    .map(([label, items]) => {
      const lines = items.map((product) => {
        const suffix = mode === "category" && product.store?.name ? `（${product.store.name}）` : "";
        return `・${product.name}${suffix}`;
      });
      return `【${label}】\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

export function sortProducts(products: ProductView[]) {
  return [...products].sort((a, b) => {
    const categoryDiff = a.category.sort_order - b.category.sort_order;
    if (categoryDiff !== 0) return categoryDiff;
    return a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ja");
  });
}

export function sortBasketProducts(products: ProductView[]) {
  return [...products].sort((a, b) => {
    const storeDiff = (a.store?.sort_order ?? 9999) - (b.store?.sort_order ?? 9999);
    if (storeDiff !== 0) return storeDiff;
    const categoryDiff = a.category.sort_order - b.category.sort_order;
    if (categoryDiff !== 0) return categoryDiff;
    return a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ja");
  });
}

export function joinProductData(products: ProductView[], categories: Category[], stores: Store[]) {
  return products.map((product) => ({
    ...product,
    category: categories.find((category) => category.id === product.category_id) || categories[0],
    store: stores.find((store) => store.id === product.store_id) || null,
  }));
}

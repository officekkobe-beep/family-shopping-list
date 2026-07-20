"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Database,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  ShoppingBasket,
  Trash2,
  Undo2,
} from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildImportPayload,
  buildProductsCsv,
  makeCopyText,
  previewCsvImport,
  sortBasketProducts,
  sortProducts,
} from "@/lib/csv";
import {
  initialCategories,
  initialProducts,
  initialStores,
} from "@/lib/initial-data";
import { getSupabaseClient, hasSupabaseEnv } from "@/lib/supabase";
import type {
  Category,
  ImportPreview,
  Product,
  ProductView,
  Store,
  SyncStatus,
} from "@/lib/types";

type Tab = "choose" | "basket" | "copy" | "admin";
type AdminPanel = "top" | "products" | "categories" | "stores" | "csv";
type RefreshReason = "initial" | "realtime" | "poll" | "manual" | "mutation-error";

const statusLabel: Record<SyncStatus, string> = {
  syncing: "同期中",
  synced: "同期済み",
  offline: "接続できません",
};

function hydrateProducts(
  products: Product[],
  categories: Category[],
  stores: Store[],
): ProductView[] {
  return products
    .map((product) => {
      const category = categories.find((item) => item.id === product.category_id);
      if (!category) return null;
      return {
        ...product,
        category,
        store: stores.find((item) => item.id === product.store_id) || null,
      };
    })
    .filter((product): product is ProductView => Boolean(product));
}

function nextSortOrder(products: Product[], categoryId: string) {
  const values = products
    .filter((product) => product.category_id === categoryId)
    .map((product) => product.sort_order);
  return values.length ? Math.max(...values) + 1 : 1;
}

function makeId() {
  return crypto.randomUUID();
}

function logSync(event: string, details?: Record<string, unknown>) {
  const debugEnabled =
    process.env.NODE_ENV === "development" ||
    new URLSearchParams(window.location.search).get("debugSync") === "1";

  if (!debugEnabled) return;

  console.info(
    "[shopping-sync]",
    JSON.stringify({
      event,
      at: new Date().toISOString(),
      ...details,
    }),
  );
}

export function ShoppingApp({ shareKey }: { shareKey: string }) {
  const supabase = useMemo(() => getSupabaseClient(shareKey), [shareKey]);
  const [tab, setTab] = useState<Tab>("choose");
  const [adminPanel, setAdminPanel] = useState<AdminPanel>("top");
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [stores, setStores] = useState<Store[]>(initialStores);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [status, setStatus] = useState<SyncStatus>(hasSupabaseEnv() ? "syncing" : "offline");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [storeFilter, setStoreFilter] = useState("すべて");
  const [lastDone, setLastDone] = useState<Product | null>(null);
  const [copyMode, setCopyMode] = useState<"store" | "category">("store");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    name: "",
    category_id: "cat-001",
    store_id: "store-001",
    memo: "",
    is_selected: false,
    sort_order: "",
  });
  const [categoryForm, setCategoryForm] = useState({
    id: "",
    name: "",
    sort_order: "",
    is_active: true,
  });
  const [storeForm, setStoreForm] = useState({
    id: "",
    name: "",
    sort_order: "",
    is_active: true,
  });
  const [csvPreview, setCsvPreview] = useState<ImportPreview | null>(null);
  const [adminQuery, setAdminQuery] = useState("");
  const [adminCategory, setAdminCategory] = useState("すべて");
  const [adminStore, setAdminStore] = useState("すべて");
  const [lastSyncNote, setLastSyncNote] = useState("");

  useEffect(() => {
    window.localStorage.setItem("family-shopping-list:last-share-path", window.location.pathname);
  }, [shareKey]);

  const productViews = useMemo(
    () => hydrateProducts(products, categories, stores),
    [products, categories, stores],
  );
  const selectedCount = productViews.filter((product) => product.is_selected).length;

  const showMessage = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 4200);
  }, []);

  const loadData = useCallback(
    async (reason: RefreshReason = "manual") => {
      if (!supabase) {
        setStatus("offline");
        return;
      }
      const startedAt = Date.now();
      setStatus("syncing");
      logSync("fetch-start", { reason });
      const [categoryResult, storeResult, productResult] = await Promise.all([
        supabase.from("categories").select("*").order("sort_order", { ascending: true }),
        supabase.from("stores").select("*").order("sort_order", { ascending: true }),
        supabase.from("products").select("*").order("sort_order", { ascending: true }),
      ]);
      if (categoryResult.error || storeResult.error || productResult.error) {
        setStatus("offline");
        logSync("fetch-error", {
          reason,
          categoryError: categoryResult.error?.message,
          storeError: storeResult.error?.message,
          productError: productResult.error?.message,
        });
        showMessage("データを取得できませんでした。通信状態を確認してください。");
        return;
      }
      setCategories((categoryResult.data || []) as Category[]);
      setStores((storeResult.data || []) as Store[]);
      setProducts((productResult.data || []) as Product[]);
      setStatus("synced");
      const elapsedMs = Date.now() - startedAt;
      const note = reason === "realtime" ? "Realtime通知で更新" : reason === "poll" ? "15秒再取得で更新" : "データ更新";
      setLastSyncNote(`${note} ${new Date().toLocaleTimeString("ja-JP")}`);
      logSync("fetch-success", { reason, elapsedMs });
    },
    [showMessage, supabase],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData("initial");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    if (!supabase) return;
    const refreshTimer = window.setInterval(() => {
      void loadData("poll");
    }, 15000);
    const channel = supabase
      .channel("shopping-master-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shopping_events" },
        (payload) => {
          logSync("realtime-event", {
            table: payload.table,
            eventType: payload.eventType,
            eventId: (payload.new as { id?: string } | null)?.id,
          });
          void loadData("realtime");
        },
      )
      .subscribe((state, error) => {
        logSync("realtime-status", { state, error: error?.message });
        if (state === "SUBSCRIBED") setStatus("synced");
        if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          setStatus("offline");
        }
      });
    return () => {
      window.clearInterval(refreshTimer);
      void supabase.removeChannel(channel);
      logSync("realtime-cleanup");
    };
  }, [loadData, supabase]);

  const persistProduct = async (
    next: Product,
    errorText = "更新できませんでした。通信状態を確認して、もう一度お試しください。",
  ) => {
    setProducts((current) => current.map((product) => (product.id === next.id ? next : product)));
    if (!supabase) return;
    setStatus("syncing");
    const { error } = await supabase
      .from("products")
      .update({
        name: next.name,
        category_id: next.category_id,
        store_id: next.store_id,
        memo: next.memo,
        is_selected: next.is_selected,
        sort_order: next.sort_order,
      })
      .eq("id", next.id);
    if (error) {
      showMessage(errorText);
      await loadData("mutation-error");
      return;
    }
    setStatus("synced");
  };

  const toggleSelected = (product: ProductView) => {
    void persistProduct({ ...product, is_selected: !product.is_selected });
  };

  const markDone = (product: ProductView) => {
    setLastDone(product);
    void persistProduct({ ...product, is_selected: false });
    showMessage(`「${product.name}」を購入済みにしました`);
  };

  const undoDone = () => {
    if (!lastDone) return;
    void persistProduct({ ...lastDone, is_selected: true });
    setLastDone(null);
    showMessage("元に戻しました");
  };

  const chooseProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sortProducts(productViews)
      .filter((product) => (selectedOnly ? product.is_selected : true))
      .filter((product) => {
        if (!normalized) return true;
        return [product.name, product.store?.name || "", product.memo || ""]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      });
  }, [productViews, query, selectedOnly]);

  const basketProducts = useMemo(() => {
    return sortBasketProducts(productViews.filter((product) => product.is_selected)).filter((product) =>
      storeFilter === "すべて" ? true : (product.store?.name || "その他") === storeFilter,
    );
  }, [productViews, storeFilter]);

  const copyText = useMemo(() => makeCopyText(productViews, copyMode), [copyMode, productViews]);

  const productGroups = useMemo(() => {
    const map = new Map<string, ProductView[]>();
    for (const product of chooseProducts) {
      map.set(product.category.id, [...(map.get(product.category.id) || []), product]);
    }
    return categories
      .filter((category) => map.has(category.id))
      .map((category) => ({ category, products: map.get(category.id) || [] }));
  }, [categories, chooseProducts]);

  const basketGroups = useMemo(() => {
    const map = new Map<string, ProductView[]>();
    for (const product of basketProducts) {
      const key = product.store?.name || "その他";
      map.set(key, [...(map.get(key) || []), product]);
    }
    return [...map.entries()];
  }, [basketProducts]);

  const activeStores = stores.filter((store) => store.is_active);
  const basketStoreNames = ["すべて", ...activeStores.map((store) => store.name), "その他"];

  const openProductForm = (product?: ProductView) => {
    const target = product || null;
    setEditingProduct(target);
    setProductForm({
      name: target?.name || "",
      category_id: target?.category_id || categories[0]?.id || "",
      store_id: target?.store_id || stores[0]?.id || "",
      memo: target?.memo || "",
      is_selected: target?.is_selected || false,
      sort_order: target?.sort_order ? String(target.sort_order) : "",
    });
    setAdminPanel("products");
  };

  const saveProduct = async () => {
    const name = productForm.name.trim();
    if (!name || !productForm.category_id) {
      showMessage("商品名とカテゴリーを入力してください。");
      return;
    }
    const order = productForm.sort_order.trim()
      ? Number(productForm.sort_order)
      : nextSortOrder(products, productForm.category_id);
    if (!Number.isFinite(order)) {
      showMessage("表示順は数字で入力してください。");
      return;
    }
    const payload: Product = {
      id: editingProduct?.id || makeId(),
      name,
      category_id: productForm.category_id,
      store_id: productForm.store_id || null,
      memo: productForm.memo.trim(),
      is_selected: productForm.is_selected,
      sort_order: order,
    };
    if (editingProduct) {
      await persistProduct(payload);
    } else {
      setProducts((current) => [payload, ...current]);
      if (supabase) {
        setStatus("syncing");
        const { error } = await supabase.from("products").insert(payload);
        if (error) {
          showMessage("商品を追加できませんでした。通信状態を確認してください。");
          await loadData("mutation-error");
          return;
        }
        setStatus("synced");
      }
    }
    setEditingProduct(null);
    setProductForm({
      name: "",
      category_id: categories[0]?.id || "",
      store_id: stores[0]?.id || "",
      memo: "",
      is_selected: false,
      sort_order: "",
    });
  };

  const deleteProduct = async (product: ProductView) => {
    if (!window.confirm(`「${product.name}」を削除しますか？\n\nこの操作は元に戻せません。`)) return;
    setProducts((current) => current.filter((item) => item.id !== product.id));
    if (!supabase) return;
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) {
      showMessage("商品を削除できませんでした。");
      await loadData("mutation-error");
    }
  };

  const saveCategory = async () => {
    const name = categoryForm.name.trim();
    if (!name) {
      showMessage("カテゴリー名を入力してください。");
      return;
    }
    const payload: Category = {
      id: categoryForm.id || makeId(),
      name,
      sort_order: Number(categoryForm.sort_order) || categories.length + 1,
      is_active: categoryForm.is_active,
    };
    setCategories((current) =>
      categoryForm.id ? current.map((item) => (item.id === payload.id ? payload : item)) : [...current, payload],
    );
    setCategoryForm({ id: "", name: "", sort_order: "", is_active: true });
    if (!supabase) return;
    const { error } = await supabase.from("categories").upsert(payload);
    if (error) {
      showMessage("カテゴリーを保存できませんでした。");
      await loadData("mutation-error");
    }
  };

  const saveStore = async () => {
    const name = storeForm.name.trim();
    if (!name) {
      showMessage("店舗名を入力してください。");
      return;
    }
    const payload: Store = {
      id: storeForm.id || makeId(),
      name,
      sort_order: Number(storeForm.sort_order) || stores.length + 1,
      is_active: storeForm.is_active,
    };
    setStores((current) =>
      storeForm.id ? current.map((item) => (item.id === payload.id ? payload : item)) : [...current, payload],
    );
    setStoreForm({ id: "", name: "", sort_order: "", is_active: true });
    if (!supabase) return;
    const { error } = await supabase.from("stores").upsert(payload);
    if (error) {
      showMessage("店舗を保存できませんでした。");
      await loadData("mutation-error");
    }
  };

  const moveCategory = async (category: Category, direction: -1 | 1) => {
    const index = categories.findIndex((item) => item.id === category.id);
    const other = categories[index + direction];
    if (!other) return;
    const nextA = { ...category, sort_order: other.sort_order };
    const nextB = { ...other, sort_order: category.sort_order };
    setCategories((current) =>
      current
        .map((item) => (item.id === nextA.id ? nextA : item.id === nextB.id ? nextB : item))
        .sort((a, b) => a.sort_order - b.sort_order),
    );
    if (supabase) {
      const { error } = await supabase.from("categories").upsert([nextA, nextB]);
      if (error) {
        showMessage("カテゴリー順を変更できませんでした。");
        await loadData("mutation-error");
      }
    }
  };

  const moveStore = async (store: Store, direction: -1 | 1) => {
    const index = stores.findIndex((item) => item.id === store.id);
    const other = stores[index + direction];
    if (!other) return;
    const nextA = { ...store, sort_order: other.sort_order };
    const nextB = { ...other, sort_order: store.sort_order };
    setStores((current) =>
      current
        .map((item) => (item.id === nextA.id ? nextA : item.id === nextB.id ? nextB : item))
        .sort((a, b) => a.sort_order - b.sort_order),
    );
    if (supabase) {
      const { error } = await supabase.from("stores").upsert([nextA, nextB]);
      if (error) {
        showMessage("店舗順を変更できませんでした。");
        await loadData("mutation-error");
      }
    }
  };

  const deleteCategory = async (category: Category) => {
    if (products.some((product) => product.category_id === category.id)) {
      showMessage("このカテゴリーには商品が登録されています。先に商品を移動してください。");
      return;
    }
    setCategories((current) => current.filter((item) => item.id !== category.id));
    if (supabase) {
      const { error } = await supabase.from("categories").delete().eq("id", category.id);
      if (error) {
        showMessage("カテゴリーを削除できませんでした。");
        await loadData("mutation-error");
      }
    }
  };

  const deleteStore = async (store: Store) => {
    if (products.some((product) => product.store_id === store.id)) {
      showMessage("この店舗には商品が登録されています。使わない場合は非表示にしてください。");
      return;
    }
    setStores((current) => current.filter((item) => item.id !== store.id));
    if (supabase) {
      const { error } = await supabase.from("stores").delete().eq("id", store.id);
      if (error) {
        showMessage("店舗を削除できませんでした。");
        await loadData("mutation-error");
      }
    }
  };

  const handleCsvFile = async (file: File) => {
    try {
      const text = await file.text();
      setCsvPreview(previewCsvImport(text));
    } catch {
      setCsvPreview({
        total: 0,
        valid: 0,
        errors: [{ rowNumber: 1, message: "ファイルの読込に失敗しました。" }],
        products: [],
        duplicateCount: 0,
      });
    }
  };

  const importCsv = async () => {
    if (!csvPreview || csvPreview.errors.length > 0) return;
    const payload = buildImportPayload(csvPreview);
    if (supabase) {
      const { error } = await supabase.rpc("replace_shopping_master", { payload });
      if (error) {
        showMessage("データベース登録に失敗しました。上書きは実行されていません。");
        return;
      }
      setCsvPreview(null);
      await loadData("manual");
      showMessage("CSVの商品マスタを上書きしました。");
      return;
    }
    const nextCategories = payload.categories.map((item, index) => ({
      id: makeId(),
      name: item.name,
      sort_order: index + 1,
      is_active: true,
    }));
    const nextStores = payload.stores.map((item, index) => ({
      id: makeId(),
      name: item.name,
      sort_order: index + 1,
      is_active: true,
    }));
    const nextProducts = payload.products.map((item, index) => {
      const category = nextCategories.find((candidate) => candidate.name === item.category_name)!;
      const store = nextStores.find((candidate) => candidate.name === item.store_name);
      return {
        id: makeId(),
        name: item.name,
        category_id: category.id,
        store_id: store?.id || null,
        memo: item.memo,
        is_selected: item.is_selected,
        sort_order: item.sort_order || index + 1,
      };
    });
    setCategories(nextCategories);
    setStores(nextStores);
    setProducts(nextProducts);
    setCsvPreview(null);
    showMessage("CSVの商品マスタを画面上で上書きしました。");
  };

  const downloadCsv = () => {
    const blob = new Blob([buildProductsCsv(productViews)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `商品マスタ_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      showMessage("買い物リストをコピーしました");
    } catch {
      showMessage("コピーできませんでした。テキストを選択してコピーしてください。");
    }
  };

  const filteredAdminProducts = productViews.filter((product) => {
    const matchText =
      !adminQuery.trim() ||
      [product.name, product.memo || ""].join(" ").toLowerCase().includes(adminQuery.trim().toLowerCase());
    const matchCategory = adminCategory === "すべて" || product.category_id === adminCategory;
    const matchStore = adminStore === "すべて" || product.store_id === adminStore;
    return matchText && matchCategory && matchStore;
  });

  return (
    <div className="min-h-dvh bg-[#f7f8f4] text-[#17211b]">
      <main className="mx-auto min-h-dvh max-w-3xl pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="sticky top-0 z-20 border-b border-[#dfe5dc] bg-[#f7f8f4]/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-[#697568]">家族共有</p>
              <h1 className="text-xl font-bold">家族の買い物リスト</h1>
              {lastSyncNote && <p className="mt-1 text-xs text-[#667264]">{lastSyncNote}</p>}
            </div>
            <div
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                status === "synced"
                  ? "bg-[#dff2e1] text-[#236330]"
                  : status === "syncing"
                    ? "bg-[#fff1c2] text-[#745a00]"
                    : "bg-[#ffe0dc] text-[#8b2c21]"
              }`}
            >
              {statusLabel[status]}
            </div>
          </div>
        </div>

        {tab === "choose" && (
          <section className="space-y-4 px-4 py-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">買うものを選ぶ</h2>
              </div>
              <div className="shrink-0 rounded-full bg-[#1d6f42] px-3 py-2 text-sm font-bold text-white">
                かご {selectedCount}件
              </div>
            </div>
            <label className="flex min-h-12 items-center gap-2 rounded-lg border border-[#d6ddd2] bg-white px-3">
              <Search size={20} />
              <input
                className="w-full bg-transparent py-3 text-base outline-none"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="商品を検索"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`min-h-11 rounded-lg border text-base font-bold ${
                  !selectedOnly ? "border-[#1d6f42] bg-[#dff2e1]" : "border-[#d6ddd2] bg-white"
                }`}
                onClick={() => setSelectedOnly(false)}
              >
                すべて
              </button>
              <button
                className={`min-h-11 rounded-lg border text-base font-bold ${
                  selectedOnly ? "border-[#1d6f42] bg-[#dff2e1]" : "border-[#d6ddd2] bg-white"
                }`}
                onClick={() => setSelectedOnly(true)}
              >
                選択中のみ
              </button>
            </div>
            <div className="space-y-3">
              {productGroups.map(({ category, products: groupProducts }) => {
                const selectedInCategory = groupProducts.filter((product) => product.is_selected).length;
                const isCollapsed = collapsed.has(category.id);
                return (
                  <div key={category.id} className="overflow-hidden rounded-lg border border-[#d6ddd2] bg-white">
                    <button
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      onClick={() =>
                        setCollapsed((current) => {
                          const next = new Set(current);
                          if (next.has(category.id)) next.delete(category.id);
                          else next.add(category.id);
                          return next;
                        })
                      }
                    >
                      <span className="text-lg font-bold">{category.name}</span>
                      <span className="flex items-center gap-2 text-sm font-semibold text-[#667264]">
                        {selectedInCategory} / {groupProducts.length}
                        {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                      </span>
                    </button>
                    {!isCollapsed &&
                      groupProducts.map((product) => (
                        <button
                          key={product.id}
                          className={`flex w-full items-start gap-3 border-t border-[#edf0ea] px-4 py-3 text-left ${
                            product.is_selected ? "bg-[#eef8ef]" : "bg-white"
                          }`}
                          onClick={() => toggleSelected(product)}
                        >
                          <span
                            className={`mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border-2 ${
                              product.is_selected
                                ? "border-[#1d6f42] bg-[#1d6f42] text-white"
                                : "border-[#9aa59a] text-[#9aa59a]"
                            }`}
                          >
                            {product.is_selected ? <Check size={17} /> : "○"}
                          </span>
                          <span>
                            <span className="block text-lg font-bold">{product.name}</span>
                            {(product.store?.name || product.memo) && (
                              <span className="block text-sm text-[#667264]">
                                {[product.store?.name, product.memo].filter(Boolean).join("｜")}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "basket" && (
          <BasketView
            selectedCount={selectedCount}
            storeFilter={storeFilter}
            setStoreFilter={setStoreFilter}
            basketStoreNames={basketStoreNames}
            basketGroups={basketGroups}
            markDone={markDone}
            setTab={setTab}
          />
        )}

        {tab === "copy" && (
          <CopyView copyMode={copyMode} setCopyMode={setCopyMode} copyText={copyText} copyList={copyList} />
        )}

        {tab === "admin" && (
          <AdminView
            adminPanel={adminPanel}
            setAdminPanel={setAdminPanel}
            adminQuery={adminQuery}
            setAdminQuery={setAdminQuery}
            adminCategory={adminCategory}
            setAdminCategory={setAdminCategory}
            adminStore={adminStore}
            setAdminStore={setAdminStore}
            categories={categories}
            stores={stores}
            products={products}
            filteredAdminProducts={filteredAdminProducts}
            productForm={productForm}
            setProductForm={setProductForm}
            editingProduct={editingProduct}
            setEditingProduct={setEditingProduct}
            openProductForm={openProductForm}
            saveProduct={saveProduct}
            deleteProduct={deleteProduct}
            categoryForm={categoryForm}
            setCategoryForm={setCategoryForm}
            saveCategory={saveCategory}
            moveCategory={moveCategory}
            deleteCategory={deleteCategory}
            storeForm={storeForm}
            setStoreForm={setStoreForm}
            saveStore={saveStore}
            moveStore={moveStore}
            deleteStore={deleteStore}
            downloadCsv={downloadCsv}
            csvPreview={csvPreview}
            setCsvPreview={setCsvPreview}
            handleCsvFile={handleCsvFile}
            importCsv={importCsv}
          />
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#d6ddd2] bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-3xl grid-cols-4">
          <NavButton active={tab === "choose"} onClick={() => setTab("choose")} icon={<PackagePlus size={20} />} label="選ぶ" />
          <NavButton active={tab === "basket"} onClick={() => setTab("basket")} icon={<ShoppingBasket size={20} />} label="かご" badge={selectedCount} />
          <NavButton active={tab === "copy"} onClick={() => setTab("copy")} icon={<Clipboard size={20} />} label="コピー" />
          <NavButton active={tab === "admin"} onClick={() => setTab("admin")} icon={<Database size={20} />} label="管理" />
        </div>
      </nav>

      {(message || lastDone) && (
        <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-3xl px-4">
          <div className="flex w-full items-center justify-between gap-2 rounded-lg bg-[#17211b] px-4 py-3 text-white shadow-lg">
            <span>{message || (lastDone ? `「${lastDone.name}」を購入済みにしました` : "")}</span>
            {lastDone && (
              <button className="flex items-center gap-1 font-bold" onClick={undoDone}>
                <Undo2 size={16} />
                元に戻す
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BasketView({
  selectedCount,
  storeFilter,
  setStoreFilter,
  basketStoreNames,
  basketGroups,
  markDone,
  setTab,
}: {
  selectedCount: number;
  storeFilter: string;
  setStoreFilter: (value: string) => void;
  basketStoreNames: string[];
  basketGroups: [string, ProductView[]][];
  markDone: (product: ProductView) => void;
  setTab: (tab: Tab) => void;
}) {
  return (
    <section className="space-y-4 px-4 py-4">
      <div className="flex items-end justify-between">
        <h2 className="text-2xl font-bold">買い物かご</h2>
        <div className="text-base font-bold">残り{selectedCount}件</div>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {basketStoreNames.map((name) => (
          <button
            key={name}
            className={`min-h-11 shrink-0 rounded-full border px-4 font-bold ${
              storeFilter === name ? "border-[#1d6f42] bg-[#dff2e1]" : "border-[#d6ddd2] bg-white"
            }`}
            onClick={() => setStoreFilter(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {selectedCount === 0 ? (
        <div className="rounded-lg border border-dashed border-[#bec8ba] bg-white px-4 py-12 text-center">
          <p className="mb-4 text-xl font-bold">買うものはありません</p>
          <button className="min-h-11 rounded-lg bg-[#1d6f42] px-5 font-bold text-white" onClick={() => setTab("choose")}>
            商品を選ぶ
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {basketGroups.map(([store, groupProducts]) => (
            <div key={store}>
              <h3 className="mb-2 px-1 text-lg font-bold">{store}</h3>
              <div className="overflow-hidden rounded-lg border border-[#d6ddd2] bg-white">
                {groupProducts.map((product) => (
                  <button
                    key={product.id}
                    className="flex w-full items-start gap-3 border-t border-[#edf0ea] px-4 py-3 text-left first:border-t-0"
                    onClick={() => markDone(product)}
                  >
                    <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-md border-2 border-[#6f7a6e]">
                      □
                    </span>
                    <span>
                      <span className="block text-lg font-bold">{product.name}</span>
                      <span className="block text-sm text-[#667264]">
                        {[product.category.name, product.memo].filter(Boolean).join("｜")}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CopyView({
  copyMode,
  setCopyMode,
  copyText,
  copyList,
}: {
  copyMode: "store" | "category";
  setCopyMode: (mode: "store" | "category") => void;
  copyText: string;
  copyList: () => void;
}) {
  return (
    <section className="space-y-4 px-4 py-4">
      <h2 className="text-2xl font-bold">コピー</h2>
      <div className="grid grid-cols-2 gap-2">
        <button
          className={`min-h-11 rounded-lg border font-bold ${
            copyMode === "store" ? "border-[#1d6f42] bg-[#dff2e1]" : "border-[#d6ddd2] bg-white"
          }`}
          onClick={() => setCopyMode("store")}
        >
          店舗別
        </button>
        <button
          className={`min-h-11 rounded-lg border font-bold ${
            copyMode === "category" ? "border-[#1d6f42] bg-[#dff2e1]" : "border-[#d6ddd2] bg-white"
          }`}
          onClick={() => setCopyMode("category")}
        >
          カテゴリー別
        </button>
      </div>
      <textarea
        className="min-h-80 w-full rounded-lg border border-[#d6ddd2] bg-white p-4 text-base leading-7 outline-none"
        readOnly
        value={copyText}
      />
      <button
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#1d6f42] px-4 font-bold text-white"
        onClick={copyList}
      >
        <Clipboard size={20} />
        テキストをコピー
      </button>
    </section>
  );
}

function AdminView(props: {
  adminPanel: AdminPanel;
  setAdminPanel: (panel: AdminPanel) => void;
  adminQuery: string;
  setAdminQuery: (value: string) => void;
  adminCategory: string;
  setAdminCategory: (value: string) => void;
  adminStore: string;
  setAdminStore: (value: string) => void;
  categories: Category[];
  stores: Store[];
  products: Product[];
  filteredAdminProducts: ProductView[];
  productForm: ProductFormState;
  setProductForm: Dispatch<SetStateAction<ProductFormState>>;
  editingProduct: Product | null;
  setEditingProduct: (product: Product | null) => void;
  openProductForm: (product?: ProductView) => void;
  saveProduct: () => void;
  deleteProduct: (product: ProductView) => void;
  categoryForm: MasterFormState;
  setCategoryForm: Dispatch<SetStateAction<MasterFormState>>;
  saveCategory: () => void;
  moveCategory: (category: Category, direction: -1 | 1) => void;
  deleteCategory: (category: Category) => void;
  storeForm: MasterFormState;
  setStoreForm: Dispatch<SetStateAction<MasterFormState>>;
  saveStore: () => void;
  moveStore: (store: Store, direction: -1 | 1) => void;
  deleteStore: (store: Store) => void;
  downloadCsv: () => void;
  csvPreview: ImportPreview | null;
  setCsvPreview: (preview: ImportPreview | null) => void;
  handleCsvFile: (file: File) => void;
  importCsv: () => void;
}) {
  const {
    adminPanel,
    setAdminPanel,
    adminQuery,
    setAdminQuery,
    adminCategory,
    setAdminCategory,
    adminStore,
    setAdminStore,
    categories,
    stores,
    filteredAdminProducts,
    productForm,
    setProductForm,
    editingProduct,
    setEditingProduct,
    openProductForm,
    saveProduct,
    deleteProduct,
    categoryForm,
    setCategoryForm,
    saveCategory,
    moveCategory,
    deleteCategory,
    storeForm,
    setStoreForm,
    saveStore,
    moveStore,
    deleteStore,
    downloadCsv,
    csvPreview,
    setCsvPreview,
    handleCsvFile,
    importCsv,
  } = props;

  return (
    <section className="space-y-4 px-4 py-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">管理</h2>
        {adminPanel !== "top" && (
          <button className="rounded-lg border border-[#d6ddd2] bg-white px-3 py-2 font-bold" onClick={() => setAdminPanel("top")}>
            戻る
          </button>
        )}
      </div>
      {adminPanel === "top" && (
        <div className="overflow-hidden rounded-lg border border-[#d6ddd2] bg-white">
          {[
            ["products", "商品管理"],
            ["categories", "カテゴリー管理"],
            ["stores", "店舗管理"],
            ["csv", "CSV入出力"],
          ].map(([panel, label]) => (
            <button
              key={panel}
              className="flex min-h-14 w-full items-center justify-between border-t border-[#edf0ea] px-4 text-left text-lg font-bold first:border-t-0"
              onClick={() => setAdminPanel(panel as AdminPanel)}
            >
              {label}
              <span>＞</span>
            </button>
          ))}
        </div>
      )}
      {adminPanel === "products" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-[#d6ddd2] bg-white p-3">
            <input
              className="mb-2 min-h-11 w-full rounded-lg border border-[#d6ddd2] px-3 outline-none"
              placeholder="商品検索"
              value={adminQuery}
              onChange={(event) => setAdminQuery(event.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                className="min-h-11 rounded-lg border border-[#d6ddd2] px-2"
                value={adminCategory}
                onChange={(event) => setAdminCategory(event.target.value)}
              >
                <option>すべて</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <select
                className="min-h-11 rounded-lg border border-[#d6ddd2] px-2"
                value={adminStore}
                onChange={(event) => setAdminStore(event.target.value)}
              >
                <option>すべて</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <ProductForm
            form={productForm}
            setForm={setProductForm}
            categories={categories}
            stores={stores}
            onSave={saveProduct}
            editing={Boolean(editingProduct)}
            onCancel={() => setEditingProduct(null)}
          />
          <button className="flex min-h-11 items-center gap-2 rounded-lg bg-[#1d6f42] px-4 font-bold text-white" onClick={() => openProductForm()}>
            <Plus size={18} />
            商品追加
          </button>
          <div className="space-y-2">
            {filteredAdminProducts.map((product) => (
              <div key={product.id} className="rounded-lg border border-[#d6ddd2] bg-white p-3">
                <div className="font-bold">{product.name}</div>
                <div className="text-sm text-[#667264]">
                  {product.category.name}｜{product.store?.name || "その他"}
                </div>
                <div className="mt-2 flex gap-2">
                  <button className="min-h-10 rounded-lg border border-[#d6ddd2] px-3 font-bold" onClick={() => openProductForm(product)}>
                    <Pencil size={16} />
                  </button>
                  <button className="min-h-10 rounded-lg border border-[#d6ddd2] px-3 font-bold" onClick={() => void deleteProduct(product)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {adminPanel === "categories" && (
        <MasterList title="カテゴリー" items={categories} form={categoryForm} setForm={setCategoryForm} onSave={saveCategory} onMove={moveCategory} onDelete={deleteCategory} />
      )}
      {adminPanel === "stores" && (
        <MasterList title="店舗" items={stores} form={storeForm} setForm={setStoreForm} onSave={saveStore} onMove={moveStore} onDelete={deleteStore} />
      )}
      {adminPanel === "csv" && (
        <CsvPanel
          downloadCsv={downloadCsv}
          csvPreview={csvPreview}
          setCsvPreview={setCsvPreview}
          handleCsvFile={handleCsvFile}
          importCsv={importCsv}
        />
      )}
    </section>
  );
}

function CsvPanel({
  downloadCsv,
  csvPreview,
  setCsvPreview,
  handleCsvFile,
  importCsv,
}: {
  downloadCsv: () => void;
  csvPreview: ImportPreview | null;
  setCsvPreview: (preview: ImportPreview | null) => void;
  handleCsvFile: (file: File) => void;
  importCsv: () => void;
}) {
  return (
    <div className="space-y-3">
      <button className="min-h-12 w-full rounded-lg bg-[#1d6f42] px-4 font-bold text-white" onClick={downloadCsv}>
        CSV出力
      </button>
      <label className="block rounded-lg border border-dashed border-[#aeb9aa] bg-white p-4 text-center font-bold">
        CSVを選択
        <input
          className="hidden"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleCsvFile(file);
            event.target.value = "";
          }}
        />
      </label>
      {csvPreview && (
        <div className="rounded-lg border border-[#d6ddd2] bg-white p-4">
          <p>読込件数：{csvPreview.total}件</p>
          <p>正常：{csvPreview.valid}件</p>
          <p>エラー：{csvPreview.errors.length}件</p>
          <p>重複：{csvPreview.duplicateCount}件</p>
          {csvPreview.errors.map((error) => (
            <p key={`${error.rowNumber}-${error.message}`} className="text-[#9b2e22]">
              行{error.rowNumber}: {error.message}
            </p>
          ))}
          <p className="my-3 font-bold">現在の商品マスタをすべて上書きします。</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="min-h-11 rounded-lg bg-[#1d6f42] px-3 font-bold text-white disabled:bg-[#9aa59a]"
              disabled={csvPreview.errors.length > 0}
              onClick={() => void importCsv()}
            >
              上書きする
            </button>
            <button className="min-h-11 rounded-lg border border-[#d6ddd2] bg-white px-3 font-bold" onClick={() => setCsvPreview(null)}>
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-sm font-bold ${active ? "text-[#1d6f42]" : "text-[#667264]"}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span className="absolute right-5 top-2 rounded-full bg-[#d83b2d] px-2 py-0.5 text-xs text-white">{badge}</span>
      )}
    </button>
  );
}

type ProductFormState = {
  name: string;
  category_id: string;
  store_id: string;
  memo: string;
  is_selected: boolean;
  sort_order: string;
};

function ProductForm({
  form,
  setForm,
  categories,
  stores,
  onSave,
  editing,
  onCancel,
}: {
  form: ProductFormState;
  setForm: Dispatch<SetStateAction<ProductFormState>>;
  categories: Category[];
  stores: Store[];
  onSave: () => void;
  editing: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-[#d6ddd2] bg-white p-3">
      <div className="font-bold">{editing ? "商品編集" : "商品追加"}</div>
      <input className="min-h-11 w-full rounded-lg border border-[#d6ddd2] px-3" placeholder="商品名" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
      <div className="grid grid-cols-2 gap-2">
        <select className="min-h-11 rounded-lg border border-[#d6ddd2] px-2" value={form.category_id} onChange={(event) => setForm((current) => ({ ...current, category_id: event.target.value }))}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select className="min-h-11 rounded-lg border border-[#d6ddd2] px-2" value={form.store_id} onChange={(event) => setForm((current) => ({ ...current, store_id: event.target.value }))}>
          <option value="">その他</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </div>
      <textarea className="min-h-20 w-full rounded-lg border border-[#d6ddd2] px-3 py-2" placeholder="メモ" value={form.memo} onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))} />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-[#d6ddd2] px-3">
          <input type="checkbox" checked={form.is_selected} onChange={(event) => setForm((current) => ({ ...current, is_selected: event.target.checked }))} />
          買う予定
        </label>
        <input className="min-h-11 rounded-lg border border-[#d6ddd2] px-3" placeholder="表示順" value={form.sort_order} onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="min-h-11 rounded-lg bg-[#1d6f42] px-3 font-bold text-white" onClick={onSave}>
          保存
        </button>
        <button className="min-h-11 rounded-lg border border-[#d6ddd2] bg-white px-3 font-bold" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </div>
  );
}

type MasterFormState = {
  id: string;
  name: string;
  sort_order: string;
  is_active: boolean;
};

function MasterList<T extends Category | Store>({
  title,
  items,
  form,
  setForm,
  onSave,
  onMove,
  onDelete,
}: {
  title: string;
  items: T[];
  form: MasterFormState;
  setForm: Dispatch<SetStateAction<MasterFormState>>;
  onSave: () => void;
  onMove: (item: T, direction: -1 | 1) => void;
  onDelete: (item: T) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-lg border border-[#d6ddd2] bg-white p-3">
        <div className="font-bold">{form.id ? `${title}編集` : `${title}追加`}</div>
        <input className="min-h-11 w-full rounded-lg border border-[#d6ddd2] px-3" placeholder={`${title}名`} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
        <div className="grid grid-cols-2 gap-2">
          <input className="min-h-11 rounded-lg border border-[#d6ddd2] px-3" placeholder="表示順" value={form.sort_order} onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))} />
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-[#d6ddd2] px-3">
            <input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} />
            使用中
          </label>
        </div>
        <button className="min-h-11 w-full rounded-lg bg-[#1d6f42] px-3 font-bold text-white" onClick={onSave}>
          保存
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#d6ddd2] bg-white p-3">
            <div>
              <div className="font-bold">{item.name}</div>
              <div className="text-sm text-[#667264]">{item.is_active ? "使用中" : "非表示"}</div>
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              <button className="min-h-10 rounded-lg border border-[#d6ddd2] px-2 font-bold" disabled={index === 0} onClick={() => onMove(item, -1)}>
                ↑
              </button>
              <button className="min-h-10 rounded-lg border border-[#d6ddd2] px-2 font-bold" disabled={index === items.length - 1} onClick={() => onMove(item, 1)}>
                ↓
              </button>
              <button className="min-h-10 rounded-lg border border-[#d6ddd2] px-2 font-bold" onClick={() => setForm({ id: item.id, name: item.name, sort_order: String(item.sort_order), is_active: item.is_active })}>
                編集
              </button>
              <button className="min-h-10 rounded-lg border border-[#d6ddd2] px-2 font-bold" onClick={() => onDelete(item)}>
                削除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

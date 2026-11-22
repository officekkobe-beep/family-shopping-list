"use client";

import { ArrowRight, Calculator, ShoppingBasket } from "lucide-react";
import { useRouter } from "next/navigation";

export function FamilyHome({ shareKey }: { shareKey: string }) {
  const router = useRouter();
  const base = `/f/${shareKey}`;

  return (
    <main className="min-h-dvh bg-[#f7f8f4] px-4 py-8 text-[#17211b]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <p className="text-sm font-semibold text-[#667264]">家族共有</p>
          <h1 className="mt-1 text-3xl font-bold">家族アプリ</h1>
          <p className="mt-2 text-base leading-7 text-[#667264]">
            使う機能を選んでください。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            className="flex min-h-44 flex-col justify-between rounded-2xl border border-[#d6ddd2] bg-white p-5 text-left shadow-sm transition active:scale-[0.99]"
            onClick={() => router.push(`${base}/shopping`)}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#dff2e1] text-[#1d6f42]">
              <ShoppingBasket size={26} />
            </span>
            <span>
              <span className="block text-2xl font-bold">買い物</span>
              <span className="mt-1 flex items-center gap-1 text-sm font-semibold text-[#667264]">
                買うもの・かご・商品管理 <ArrowRight size={16} />
              </span>
            </span>
          </button>

          <button
            className="flex min-h-44 flex-col justify-between rounded-2xl border border-[#d6ddd2] bg-white p-5 text-left shadow-sm transition active:scale-[0.99]"
            onClick={() => router.push(`${base}/household`)}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#fff1c2] text-[#745a00]">
              <Calculator size={26} />
            </span>
            <span>
              <span className="block text-2xl font-bold">家計</span>
              <span className="mt-1 flex items-center gap-1 text-sm font-semibold text-[#667264]">
                負担・確定・精算・予算繰越 <ArrowRight size={16} />
              </span>
            </span>
          </button>
        </div>

        <p className="mt-8 text-center text-xs text-[#7a8578]">
          今後、家族で使う機能をここへ追加できます。
        </p>
      </div>
    </main>
  );
}

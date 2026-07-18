import type { Metadata } from "next";
import { ShoppingApp } from "@/components/ShoppingApp";
import { getConfiguredShareKey } from "@/lib/server-config";

export const metadata: Metadata = {
  title: "家族の買い物リスト",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function FamilyPage({ params }: { params: Promise<{ shareKey: string }> }) {
  const { shareKey } = await params;
  const configuredKey = getConfiguredShareKey();

  if (shareKey !== configuredKey || configuredKey.length < 32) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#f7f8f4] px-6 text-[#17211b]">
        <div className="max-w-sm rounded-lg border border-[#d6ddd2] bg-white p-6 text-center">
          <h1 className="mb-3 text-xl font-bold">ページを表示できません</h1>
          <p className="text-base leading-7 text-[#667264]">
            共有URLを確認してください。
          </p>
        </div>
      </main>
    );
  }

  return <ShoppingApp shareKey={shareKey} />;
}

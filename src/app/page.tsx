"use client";

import { useEffect } from "react";
import Link from "next/link";

const savedSharePathKey = "family-shopping-list:last-share-path";

function isSharePath(value: string | null): value is string {
  return Boolean(value && /^\/f\/[^/]+$/.test(value));
}

export default function Home() {
  useEffect(() => {
    const savedPath = window.localStorage.getItem(savedSharePathKey);
    if (isSharePath(savedPath)) {
      window.location.replace(savedPath);
    }
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f7f8f4] px-6 text-[#17211b]">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-[#1d6f42] text-3xl font-bold text-white">
          買
        </div>
        <h1 className="mb-3 text-2xl font-bold">家族の買い物リスト</h1>
        <p className="mb-6 text-base leading-7 text-[#667264]">
          家族専用URLから利用する買い物リストです。共有URLはこのページには表示しません。
        </p>
        <Link className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#d6ddd2] bg-white px-5 font-bold" href="/">
          URLを確認してください
        </Link>
      </div>
    </main>
  );
}

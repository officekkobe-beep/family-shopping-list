export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f7f8f4] px-6 text-[#17211b]">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-[#1d6f42] text-2xl font-bold text-white">
          家
        </div>
        <h1 className="mb-3 text-2xl font-bold">家族アプリ</h1>
        <p className="text-base leading-7 text-[#667264]">
          家族専用の共有URLから利用してください。共有URLはこのページには表示しません。
        </p>
      </div>
    </main>
  );
}

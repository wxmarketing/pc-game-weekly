"use client";

export default function ReportError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-dvh bg-zinc-50 px-6 py-12 text-zinc-900">
      <main className="mx-auto max-w-2xl rounded-xl border border-rose-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-rose-800">周报页渲染出错</h1>
        <p className="mt-2 text-sm text-zinc-600">
          请把下面「错误信息」整段复制给开发者；同时看你运行 <code className="rounded bg-zinc-100 px-1">npm run dev</code>{" "}
          的终端里是否有一行红色堆栈。
        </p>
        {error.digest ? <p className="mt-2 text-xs text-zinc-500">digest: {error.digest}</p> : null}
        <pre className="mt-4 max-h-[50vh] overflow-auto rounded-lg bg-zinc-950 p-4 text-xs text-zinc-100 whitespace-pre-wrap break-words">
          {error.message}
          {"\n\n"}
          {error.stack ?? ""}
        </pre>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"
        >
          重试
        </button>
      </main>
    </div>
  );
}

"use client";

export default function ReportError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-dvh bg-bg-deep px-6 py-12 text-text-secondary">
      <main
        className="mx-auto max-w-2xl rounded-[--radius-card] border border-border bg-bg-base p-6"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <h1 className="text-lg font-semibold text-text-primary">周报页渲染出错</h1>
        <p className="mt-2 text-sm text-text-secondary">
          请把下面「错误信息」整段复制给开发者；同时检查你运行{" "}
          <code className="rounded bg-bg-raised px-1">npm run dev</code> 的终端里是否有一行红色堆栈。
        </p>
        {error.digest ? <p className="mt-2 text-xs text-text-muted">digest: {error.digest}</p> : null}
        <pre className="mt-4 max-h-[50vh] overflow-auto rounded-[--radius-card] border border-border-light bg-bg-surface p-4 text-xs text-text-secondary whitespace-pre-wrap break-words">
          {error.message}
          {"\n\n"}
          {error.stack ?? ""}
        </pre>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 inline-flex min-h-11 items-center rounded-full border border-border bg-bg-raised px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-surface hover:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2"
        >
          重试
        </button>
      </main>
    </div>
  );
}

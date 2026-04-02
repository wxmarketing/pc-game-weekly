import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function readSupabaseServiceEnv(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit) {
  const timeoutMs = 12_000;
  const maxAttempts = 3;

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Preserve any caller-provided signal by chaining aborts.
      const callerSignal = init?.signal;
      if (callerSignal) {
        if (callerSignal.aborted) controller.abort();
        else callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
      }

      return await fetch(input, { ...init, signal: controller.signal });
    } catch (e) {
      lastErr = e;
      // brief backoff; avoid blocking too long during SSR
      await new Promise((r) => setTimeout(r, 120 * attempt));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetch failed");
}

const serviceClientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fetchWithRetry },
} as const;

/** 页面展示等场景：缺 env 时返回 null，避免整页 500 */
export function tryCreateSupabaseServiceClient(): SupabaseClient | null {
  const env = readSupabaseServiceEnv();
  if (!env) return null;
  return createClient(env.url, env.serviceRoleKey, serviceClientOptions);
}

/** Cron / 脚本 / API：缺 env 时抛错，便于尽早失败 */
export function createSupabaseServiceClient() {
  const env = readSupabaseServiceEnv();
  if (!env) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(env.url, env.serviceRoleKey, serviceClientOptions);
}


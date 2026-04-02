import { createClient } from "@supabase/supabase-js";

export function createSupabaseBrowserClient() {
  // In client bundles, Next.js only inlines statically-referenced NEXT_PUBLIC_* vars.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anonKey);
}


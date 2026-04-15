/**
 * Bangumi 缓存写入 API
 * POST /api/bangumi/cache
 * 
 * 用 service role 写入 Supabase，前端用 anon key 只能读
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { entity_name, bangumi_id, cover_url, store_url, store_type, name_cn, name, tags, platform } = body;

    if (!entity_name) {
      return NextResponse.json({ error: "entity_name is required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();

    // upsert：存在则更新，不存在则插入
    const { error } = await supabase.from("bangumi_cache").upsert(
      {
        entity_name,
        bangumi_id: bangumi_id ?? null,
        cover_url: cover_url ?? null,
        store_url: store_url ?? null,
        store_type: store_type ?? null,
        name_cn: name_cn ?? null,
        name: name ?? null,
        tags: tags ?? null, // 游戏类型标签数组
        platform: platform ?? null, // 平台信息
        updated_at: new Date().toISOString(),
      },
      { onConflict: "entity_name" }
    );

    if (error) {
      console.error("[bangumi/cache] upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[bangumi/cache] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

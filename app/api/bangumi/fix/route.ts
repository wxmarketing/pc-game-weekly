import { NextResponse } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { entity_name, bangumi_id, cover_url, name_cn, name, tags, platform } = body;

    if (!entity_name || !bangumi_id || !cover_url) {
      return NextResponse.json(
        { error: "缺少必要参数: entity_name, bangumi_id, cover_url" },
        { status: 400 }
      );
    }

    const supabase = tryCreateSupabaseServiceClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase 服务不可用" },
        { status: 500 }
      );
    }

    // upsert bangumi_cache 表，手动修正时锁定封面
    const { error } = await supabase
      .from("bangumi_cache")
      .upsert(
        {
          entity_name,
          bangumi_id,
          cover_url,
          cover_locked: true, // 手动修正的封面设为锁定
          name_cn: name_cn ?? null,
          name: name ?? null,
          tags: tags ?? null,
          platform: platform ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "entity_name" }
      );

    if (error) {
      console.error("[Bangumi Fix] upsert error:", error);
      return NextResponse.json(
        { error: `数据库更新失败: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Bangumi Fix] error:", err);
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    );
  }
}

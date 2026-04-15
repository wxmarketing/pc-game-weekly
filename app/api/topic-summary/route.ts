/**
 * Topic Summary API
 * POST /api/topic-summary
 *
 * 为指定的 topic ids 生成 AI 摘要
 * - 已有摘要：直接返回
 * - 没有摘要：调 Supabase edge function (deepseek) 生成，写回 DB，再返回
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const DEEPSEEK_EDGE_URL =
  "https://jpptkbrygzcfjboicowo.supabase.co/functions/v1/deepseek";

interface TopicRow {
  id: number;
  entity_name: string;
  summary_title: string | null;
  summary_body: string | null;
  articles: { title: string; url: string; source: string }[];
  ai_summary: string | null;
}

export async function POST(request: Request) {
  try {
    const { ids } = (await request.json()) as { ids: number[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids array required" }, { status: 400 });
    }

    // 限制单次请求数量，防止滥用
    const limitedIds = ids.slice(0, 10);

    const supabase = createSupabaseServiceClient();

    // 1. 查询这些 topic
    console.log("[topic-summary] querying ids:", limitedIds);
    const { data: topics, error: fetchError } = await supabase
      .from("entity_topics")
      .select("id, entity_name, summary_title, summary_body, articles, ai_summary")
      .in("id", limitedIds);

    console.log("[topic-summary] query result:", { topics: topics?.length, error: fetchError });

    if (fetchError) {
      console.error("[topic-summary] fetch error:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!topics || topics.length === 0) {
      console.log("[topic-summary] no topics found for ids:", limitedIds);
      return NextResponse.json({ summaries: {} });
    }

    // 2. 分离：已有摘要 vs 需要生成
    const result: Record<number, string> = {};
    const needGenerate: TopicRow[] = [];

    for (const t of topics as TopicRow[]) {
      if (t.ai_summary) {
        result[t.id] = t.ai_summary;
      } else {
        needGenerate.push(t);
      }
    }

    // 3. 并发生成缺失的摘要
    if (needGenerate.length > 0) {
      console.log("[topic-summary] generating for", needGenerate.length, "topics");
      const generatePromises = needGenerate.map(async (topic) => {
        console.log("[topic-summary] generating for topic:", topic.id, topic.entity_name);
        const summary = await generateSummary(topic);
        console.log("[topic-summary] generated:", topic.id, summary?.substring(0, 50));
        if (summary) {
          // 写回 DB
          await supabase
            .from("entity_topics")
            .update({ ai_summary: summary })
            .eq("id", topic.id);
          result[topic.id] = summary;
        }
      });

      await Promise.all(generatePromises);
    }

    return NextResponse.json({ summaries: result });
  } catch (err) {
    console.error("[topic-summary] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function generateSummary(topic: TopicRow): Promise<string | null> {
  // 构建 prompt
  const title = topic.articles[0]?.title || topic.summary_title || topic.entity_name;
  const body = topic.summary_body || "";
  const sources = topic.articles.map((a) => a.source).join("、") || "未知来源";

  const prompt = `你是一个游戏资讯编辑。请用2-3句话（50-80字）概括以下新闻，需要包含：
1. 核心事件是什么
2. 关键细节或数据（如有）
3. 为什么值得关注

不要使用"本文"、"该文"等指代词。直接陈述事实，语言简洁有信息量。

标题：${title}
内容摘要：${body}
来源：${sources}

摘要：`;

  try {
    // 调用 Supabase edge function 需要 Authorization header
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseKey) {
      console.error("[topic-summary] Missing SUPABASE_SERVICE_ROLE_KEY");
      return null;
    }

    const res = await fetch(DEEPSEEK_EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        prompt,
        max_tokens: 200,
        temperature: 0.5,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[topic-summary] edge function error:", res.status, text);
      return null;
    }

    const json = await res.json();
    const content = json.data?.choices?.[0]?.message?.content?.trim();
    return content || null;
  } catch (err) {
    console.error("[topic-summary] generate error:", err);
    return null;
  }
}

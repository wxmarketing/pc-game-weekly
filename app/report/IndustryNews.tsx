"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { EntityTopic } from "@/lib/report/supabaseReportData";
export type { EntityTopic } from "@/lib/report/supabaseReportData";
import { useBangumiCovers, useBangumiStoreLink } from "@/lib/bangumi/hooks";

/* ============================================
   子 Tab 定义
   ============================================ */
const SUB_TABS = [
  { id: "hot-games", label: "什么游戏讨论度高？" },
  { id: "companies", label: "厂商在干什么？" },
  { id: "platforms", label: "平台在干什么？" },
  { id: "random", label: "随机新鲜事" },
] as const;

type SubTabId = (typeof SUB_TABS)[number]["id"];

/* ============================================
   Mock 数据已移除 — 数据通过 props 从 Supabase 注入
   ============================================ */

/* ============================================
   辅助函数
   ============================================ */
/** 按 entity_score 降序排（null/undefined 排最后） */
function sortByScore(list: EntityTopic[]): EntityTopic[] {
  return [...list].sort((a, b) => (b.entity_score ?? -Infinity) - (a.entity_score ?? -Infinity));
}

function filterByTab(data: EntityTopic[], tabId: SubTabId): EntityTopic[] {
  switch (tabId) {
    case "hot-games":
      return sortByScore(
        data.filter(
          (d) => d.entity_type === "game" && (d.heat_level === "high" || d.heat_level === "mid")
        )
      );
    case "companies":
      return sortByScore(data.filter((d) => d.entity_type === "company"));
    case "platforms":
      return sortByScore(data.filter((d) => d.entity_type === "platform"));
    case "random":
      return sortByScore(
        data.filter(
          (d) => d.entity_type === "other" || (d.entity_type === "game" && d.heat_level === "low")
        )
      );
    default:
      return [];
  }
}

/** 渲染 summary_body 中的 **粗体** 标记，压缩多余空行并转换换行为 <br> */
function renderBody(text: string) {
  return text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // 压缩 2 个及以上连续换行为 1 个（彻底消灭空行）
    .replace(/\n{2,}/g, "\n")
    // 粗体
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-text-primary font-semibold">$1</strong>')
    // 换行转 <br>
    .replace(/\n/g, "<br>")
    // 在第 2 个及之后的编号问题前加一段额外间距（<br> + margin-top 的空行块）
    // 匹配 <br> 后面紧跟数字+点号（但排除第一个编号，即开头的）
    .replace(/(<br>)((\d+)\.\s)/g, (_, brTag, numPrefix, num) => {
      return Number(num) > 1
        ? `${brTag}<span class="in-qa-gap"></span>${numPrefix}`
        : `${brTag}${numPrefix}`;
    });
}

/* ============================================
   外链 icon
   ============================================ */
function LinkIcon() {
  return (
    <svg
      className="inline-block w-3 h-3 opacity-50"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6.5 3.5H3.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9.5" />
      <path d="M9.5 2.5h4v4" />
      <path d="M13.5 2.5 7.5 8.5" />
    </svg>
  );
}

/* ============================================
   游戏卡片 — 封面 + 名称
   ============================================ */
function GameCard({
  topic,
  onClick,
}: {
  topic: EntityTopic;
  onClick: () => void;
}) {
  return (
    <button
      className="in-card in-card--game group"
      onClick={onClick}
    >
      {/* 封面背景 */}
      <div className="in-card-cover">
        <img
          src={topic.cover_url || "/no-cover.png"}
          alt={topic.entity_name}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => { e.currentTarget.src = "/no-cover.png"; }}
          suppressHydrationWarning
        />
      </div>
      {/* 底部信息 */}
      <div className="in-card-meta">
        <div className="in-card-name">{topic.entity_name}</div>
        <span className={`in-heat-pill ${topic.heat_level === "high" ? "in-heat-pill--high" : "in-heat-pill--mid"}`}>
          {topic.heat_level === "high" ? "高热度" : "中热度"}
        </span>
      </div>
    </button>
  );
}

/* ============================================
   游戏展开详情视图
   ============================================ */
function GameDetail({
  topic,
  bangumiId,
  onClose,
}: {
  topic: EntityTopic;
  bangumiId?: number | null;
  onClose: () => void;
}) {
  // 按需拉取商店链接
  const { storeLink, loadingStore, fetchStore } = useBangumiStoreLink(bangumiId);

  // 展开时自动触发
  useEffect(() => {
    if (bangumiId) fetchStore();
  }, [bangumiId, fetchStore]);

  // 优先用已有数据，fallback 到 Bangumi 拉取结果
  const finalStoreUrl = topic.store_url || storeLink?.store_url;
  const finalStoreType = topic.store_type || storeLink?.store_type;
  
  // 游戏类型标签（服务端预取 or 客户端 hook 注入）
  const tags = topic.bangumi_tags;

  return (
    <div className="in-detail animate-card-in">
      {/* 用 grid 布局：封面左列 + 内容右列，body 自然对齐标题 */}
      <div className="in-detail-grid">
        {/* 左列：封面 + 商店按钮 */}
        <div className="in-detail-left">
          <div className="in-detail-cover-sm">
            <img
              src={topic.cover_url || "/no-cover.png"}
              alt={topic.entity_name}
              className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.src = "/no-cover.png"; }}
              suppressHydrationWarning
            />
          </div>

          {/* 商店按钮 — 封面正下方 */}
          {loadingStore && !finalStoreUrl && (
            <span className="in-detail-link-loading">获取中…</span>
          )}
          {finalStoreUrl && (
            <a
              href={finalStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="in-detail-link-btn"
            >
              游戏详情
            </a>
          )}

          {/* 游戏类型标签（胶囊样式）— 暂时隐藏 */}
          {/* {tags && tags.length > 0 && (
            <div className="in-detail-genre">
              <span className="in-genre-pill">{tags[0]}</span>
            </div>
          )} */}
        </div>

        {/* 右列：标题 + 关闭按钮 */}
        <div className="in-detail-header-right">
          <div className="flex-1 min-w-0">
            <h3 className="in-detail-title">{topic.entity_name}</h3>
            <p className="in-detail-subtitle">{topic.summary_title}</p>
          </div>
          <button className="in-detail-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        {/* 右列第二行：body + sources，grid-column 对齐标题列 */}
        <div className="in-detail-content">
          <div
            className="in-detail-body"
            dangerouslySetInnerHTML={{ __html: renderBody(topic.summary_body) }}
          />

          {/* 来源链接 */}
          <div className="in-detail-sources">
            <span className="in-detail-sources-label">来源</span>
            <div className="in-detail-sources-list">
              {topic.articles.map((a, i) => (
                <a
                  key={i}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="in-source-chip"
                >
                  <LinkIcon />
                  <span>{a.title}</span>
                  <span className="in-source-from">— {a.source}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 商店按钮文案 */
function getStoreBtnLabel(storeType?: string | null): string {
  switch (storeType) {
    case "steam": return "Steam 商店页面";
    case "epic": return "Epic 商店页面";
    case "taptap": return "TapTap 页面";
    case "ps": return "PlayStation Store";
    case "xbox": return "Xbox 商店";
    case "official": return "游戏官网";
    case "bgm": return "Bangumi 页面";
    default: return "查看详情";
  }
}

/* ============================================
   厂商/平台 通用卡片
   ============================================ */
function InfoCard({ topic }: { topic: EntityTopic }) {
  return (
    <div className="in-card in-card--info">
      {/* 区域 1: 分类标签（从 entity_name 映射而来） */}
      <div className="in-info-header">
        <span className="in-info-entity">{topic.display_category}</span>
      </div>
      {/* 区域 2: 摘要标题 */}
      <h4 className="in-info-title">{topic.summary_title}</h4>
      {/* 区域 3: 内容 */}
      <div
        className="in-info-body"
        dangerouslySetInnerHTML={{ __html: renderBody(topic.summary_body) }}
      />
      {/* 区域 4: 来源链接 */}
      <div className="in-info-sources">
        {topic.articles.length > 0 ? (
          topic.articles.map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="in-source-chip"
            >
              <LinkIcon />
              <span className="truncate">{a.title}</span>
              <span className="in-source-from">— {a.source}</span>
            </a>
          ))
        ) : null}
        {/* 商店链接按钮 */}
        {topic.store_url && (
          <a
            href={topic.store_url}
            target="_blank"
            rel="noopener noreferrer"
            className="in-link-btn"
          >
            {getStoreBtnLabel(topic.store_type)}
            <span className="link-arrow">→</span>
          </a>
        )}
      </div>
    </div>
  );
}

/* ============================================
   随机新鲜事卡片
   ============================================ */
function RandomCard({
  topic,
  aiSummary,
  isLoading,
}: {
  topic: EntityTopic;
  aiSummary?: string | null;
  isLoading?: boolean;
}) {
  const displayTitle = topic.articles[0]?.title || topic.summary_title;
  const summary = aiSummary || topic.ai_summary;

  return (
    <div className="in-card in-card--random">
      <h4 className="in-random-title">{displayTitle}</h4>

      {/* AI 摘要区域 */}
      <div className="in-random-summary">
        {isLoading ? (
          <div className="in-summary-loading">
            <span className="in-loading-dot" />
            <span className="in-loading-text">AI 摘要生成中...</span>
          </div>
        ) : summary ? (
          <p className="in-summary-text">{summary}</p>
        ) : (
          <div
            className="in-random-body"
            dangerouslySetInnerHTML={{ __html: renderBody(topic.summary_body) }}
          />
        )}
      </div>

      <div className="in-info-sources">
        {topic.articles.length > 0 &&
          topic.articles.map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="in-source-chip"
            >
              <LinkIcon />
              <span className="truncate">{a.title}</span>
              <span className="in-source-from">— {a.source}</span>
            </a>
          ))}
      </div>
    </div>
  );
}

/* ============================================
   主组件
   ============================================ */
export function IndustryNews({ data }: { data: EntityTopic[] }) {
  const topics = data.length > 0 ? data : [];
  const [activeTab, setActiveTab] = useState<SubTabId>("hot-games");
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [randomSeed, setRandomSeed] = useState(0);

  // DEBUG: 打印客户端接收到的封面数据
  useEffect(() => {
    const games = topics.filter(t => t.entity_type === "game");
    const withCovers = games.filter(t => t.cover_url);
    console.log(`[IndustryNews] 客户端接收到 ${games.length} 个游戏，${withCovers.length} 个有封面`);
    if (withCovers.length > 0) {
      console.log(`[IndustryNews] 示例: ${withCovers[0]?.entity_name} -> ${withCovers[0]?.cover_url?.substring(0, 50)}...`);
    }
    if (games.length > 0 && withCovers.length === 0) {
      console.log(`[IndustryNews] 第一个游戏数据:`, JSON.stringify(games[0], null, 2));
    }
  }, [topics]);

  const filtered = useMemo(() => filterByTab(topics, activeTab), [topics, activeTab]);

  /* ── Bangumi 封面集成 ── */
  // 只收集"什么游戏讨论度高"tab 下的游戏（high/mid 热度）
  const gameNames = useMemo(() => {
    const hotGames = topics.filter(
      (t) => t.entity_type === "game" && (t.heat_level === "high" || t.heat_level === "mid")
    );
    return [...new Set(hotGames.map((g) => g.entity_name))];
  }, [topics]);

  const { covers } = useBangumiCovers(gameNames);

  // 将 Bangumi 封面注入到 filtered 结果中（服务端预取 > 客户端 hook > Steam 保底）
  const enrichedFiltered = useMemo(() => {
    if (activeTab !== "hot-games") return filtered;
    return filtered.map((t) => {
      // 服务端已经预取了 bangumi_cache 数据，cover_url 和 bangumi_tags 已注入
      // 客户端 hook 只需要处理服务端缓存没有的情况
      const bgm = covers[t.entity_name];
      if (bgm && bgm.cover_url) {
        // 客户端 hook 有更新的数据，用它
        return {
          ...t,
          cover_url: bgm.cover_url,
          bangumi_tags: bgm.tags ?? t.bangumi_tags, // hook 的 tags 优先
        };
      }
      // 保留服务端预取的数据
      return t;
    });
  }, [filtered, covers, activeTab]);

  // 获取展开游戏的 bangumiId
  const expandedGame = expandedGameId
    ? enrichedFiltered.find((t) => t.id === expandedGameId) ?? null
    : null;
  const expandedBangumiId = expandedGame
    ? covers[expandedGame.entity_name]?.bangumi_id ?? null
    : null;
  /* 随机抽 3 张 */
  const randomItems = useMemo(() => {
    const pool = filterByTab(topics, "random");
    if (pool.length <= 3) return pool;
    // Fisher-Yates 取前 3
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics, randomSeed]);

  /* AI 摘要状态 */
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [loadingSummaries, setLoadingSummaries] = useState(false);

  // 请求 AI 摘要
  const fetchSummaries = useCallback(async (items: EntityTopic[]) => {
    // 过滤出没有摘要的 topic
    const needFetch = items.filter((t) => !t.ai_summary && !summaries[t.id]);
    if (needFetch.length === 0) return;

    setLoadingSummaries(true);
    try {
      const ids = needFetch.map((t) => Number(t.id));
      const res = await fetch("/api/topic-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        const { summaries: newSummaries } = await res.json();
        setSummaries((prev) => ({ ...prev, ...newSummaries }));
      }
    } catch (err) {
      console.error("Failed to fetch summaries:", err);
    } finally {
      setLoadingSummaries(false);
    }
  }, [summaries]);

  // 切换到随机 tab 或换一批时自动加载摘要
  useEffect(() => {
    if (activeTab === "random" && randomItems.length > 0) {
      fetchSummaries(randomItems);
    }
  }, [activeTab, randomItems, fetchSummaries]);

  const handleRefreshRandom = useCallback(() => {
    setRandomSeed((s) => s + 1);
  }, []);

  return (
    <div className="in-root">
      {/* Sub-tabs */}
      <div className="in-tabs">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`in-tab${activeTab === tab.id ? " in-tab--active" : ""}`}
            onClick={() => {
              setActiveTab(tab.id);
              setExpandedGameId(null);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="in-content" key={activeTab}>
        {/* ── 什么游戏讨论度高？ ── */}
        {activeTab === "hot-games" && (
          <>
            {expandedGame ? (
              <GameDetail
                topic={expandedGame}
                bangumiId={expandedBangumiId}
                onClose={() => setExpandedGameId(null)}
              />
            ) : (
              <div className="in-grid--game">
                {enrichedFiltered.map((t) => (
                  <GameCard
                    key={t.id}
                    topic={t}
                    onClick={() => setExpandedGameId(t.id)}
                  />
                ))}
                {enrichedFiltered.length === 0 && (
                  <div className="in-empty">暂无热门游戏数据</div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── 厂商在干什么？ ── */}
        {activeTab === "companies" && (
          <div className="in-grid--info">
            {filtered.map((t) => (
              <InfoCard key={t.id} topic={t} />
            ))}
            {filtered.length === 0 && (
              <div className="in-empty">暂无厂商动态</div>
            )}
          </div>
        )}

        {/* ── 平台在干什么？ ── */}
        {activeTab === "platforms" && (
          <div className="in-grid--info">
            {filtered.map((t) => (
              <InfoCard key={t.id} topic={t} />
            ))}
            {filtered.length === 0 && (
              <div className="in-empty">暂无平台动态</div>
            )}
          </div>
        )}

        {/* ── 随机新鲜事 ── */}
        {activeTab === "random" && (
          <div>
            <div className="in-grid--random">
              {randomItems.map((t) => (
                <RandomCard
                  key={t.id}
                  topic={t}
                  aiSummary={summaries[t.id]}
                  isLoading={loadingSummaries && !t.ai_summary && !summaries[t.id]}
                />
              ))}
              {randomItems.length === 0 && (
                <div className="in-empty">暂无随机内容</div>
              )}
            </div>
            <div className="in-refresh-row">
              <button className="in-refresh-btn" onClick={handleRefreshRandom}>
                <span className="in-refresh-icon">↻</span>
                换一批
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

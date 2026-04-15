/**
 * Bangumi API 客户端 — 纯前端调用，CORS 已验证 (Access-Control-Allow-Origin: *)
 *
 * 两个核心能力：
 * 1. searchGameCover  — 用 entity_name 搜封面 (images.medium)
 * 2. fetchStoreLinks  — 用 bangumi subject id 拉 infobox，提取商店链接
 * 
 * 缓存策略（v5）：
 * 1. 先查 Supabase 持久化缓存
 * 2. 缓存没有才请求 Bangumi API
 * 3. 请求成功后异步写入 Supabase 缓存
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const BGM_API = "https://api.bgm.tv/v0";

/* ============================================
   类型
   ============================================ */
export interface BangumiCoverResult {
  bangumi_id: number;
  cover_url: string; // images.medium
  tags?: string[]; // 游戏类型标签（前几个热门标签）
  platform?: string; // 平台信息
}

export interface BangumiStoreLink {
  store_type: string; // steam | epic | taptap | ps | xbox | official | bgm
  store_url: string;
}

/** Supabase 缓存表结构 */
interface BangumiCacheRow {
  entity_name: string;
  bangumi_id: number | null;
  cover_url: string | null;
  store_url: string | null;
  store_type: string | null;
  name_cn: string | null;
  name: string | null;
  tags: string[] | null; // 游戏类型标签
  platform: string | null; // 平台信息
}

/* ============================================
   Supabase 持久化缓存
   ============================================ */

let supabaseClient: ReturnType<typeof createSupabaseBrowserClient> | null = null;

function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = createSupabaseBrowserClient();
  }
  return supabaseClient;
}

/** 从 Supabase 读取缓存 */
async function getSupabaseCache(entityName: string): Promise<BangumiCacheRow | null> {
  try {
    const { data, error } = await getSupabase()
      .from("bangumi_cache")
      .select("*")
      .eq("entity_name", entityName)
      .single();
    
    if (error || !data) return null;
    return data as BangumiCacheRow;
  } catch {
    return null;
  }
}

/** 异步写入 Supabase 缓存（通过 API route） */
function saveToSupabaseCache(row: Partial<BangumiCacheRow> & { entity_name: string }): void {
  // 异步写入，不阻塞主流程
  console.log("[Bangumi] saving to cache:", row.entity_name);
  fetch("/api/bangumi/cache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(row),
  })
    .then(async (res) => {
      const text = await res.text();
      if (!res.ok) {
        console.error("[Bangumi] cache write failed:", res.status, text);
      } else {
        console.log("[Bangumi] cache saved:", row.entity_name);
      }
    })
    .catch((err) => {
      console.error("[Bangumi] cache write error:", err);
    });
}

/* ============================================
   sessionStorage 本地缓存（作为二级缓存加速）
   ============================================ */
const CACHE_VERSION = "v5"; // v5: Supabase 持久化缓存
const COVER_CACHE_PREFIX = `bgm_cover_${CACHE_VERSION}_`;
const STORE_CACHE_PREFIX = `bgm_store_${CACHE_VERSION}_`;

function getCached<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function setCache(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sessionStorage 满了就算了
  }
}

/* ============================================
   搜索结果匹配策略
   ============================================ */

/** 计算单个搜索结果的总收藏数 */
function totalCollection(item: Record<string, unknown>): number {
  const col = item.collection as Record<string, number> | undefined;
  if (!col || typeof col !== "object") return 0;
  return Object.values(col).reduce((sum, v) => sum + (typeof v === "number" ? v : 0), 0);
}

/**
 * 计算两个字符串的相似度（基于最长公共子序列）
 * 返回 0~1，1 表示完全相同
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  
  const m = a.length, n = b.length;
  // LCS 动态规划
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const lcs = dp[m][n];
  // 相似度 = 2 * LCS / (len(a) + len(b))
  return (2 * lcs) / (m + n);
}

/**
 * 计算条目与搜索词的匹配得分
 * 核心原则：名字越接近搜索词越好，长度差异越小越好
 */
function matchScore(item: Record<string, unknown>, keyword: string): number {
  const kw = keyword.trim().toLowerCase();
  const name = String(item.name ?? "").trim().toLowerCase();
  const nameCn = String(item.name_cn ?? "").trim().toLowerCase();
  
  // 1. 精确匹配 → 最高分 1000
  if (name === kw || nameCn === kw) {
    return 1000;
  }
  
  // 2. 计算 name_cn 和 name 的相似度，取最高
  const simCn = similarity(nameCn, kw);
  const simEn = similarity(name, kw);
  const sim = Math.max(simCn, simEn);
  
  // 3. 长度惩罚：名字比搜索词长太多要扣分（防止"黑帝斯2"匹配到"黑帝斯 地狱使者"这种）
  const bestName = simCn >= simEn ? nameCn : name;
  const lenDiff = Math.abs(bestName.length - kw.length);
  const lenPenalty = Math.max(0, 1 - lenDiff * 0.05); // 每多1个字符扣5%
  
  // 4. 前缀加分：以搜索词开头的额外加分
  const prefixBonus = (nameCn.startsWith(kw) || name.startsWith(kw)) ? 0.2 : 0;
  
  // 5. 包含加分：完整包含搜索词的加分
  const containsBonus = (nameCn.includes(kw) || name.includes(kw)) ? 0.1 : 0;
  
  // 综合得分 = 相似度 * 长度惩罚 + 加分项，映射到 0~999
  return (sim * lenPenalty + prefixBonus + containsBonus) * 700;
}

/**
 * 从搜索结果中选最佳匹配。
 *
 * 核心策略：**名字相似度优先，收藏数次之**
 * 
 * 这样可以解决：
 * - "黑帝斯2" 不会匹配到 "黑帝斯"（相似度更低）
 * - "刺客信条 黑旗 重制版" 不会匹配到 "刺客信条 黑旗"（长度差异）
 * - "生化危机9" 会匹配到 "生化危机9 安魂曲"（前缀匹配加分）
 */
function pickBestMatch(
  items: Record<string, unknown>[],
  keyword: string,
): Record<string, unknown> | null {
  if (items.length === 0) return null;
  
  // 给每个条目计算匹配得分
  const scored = items.map((it) => ({
    item: it,
    score: matchScore(it, keyword),
    hasCover: (() => {
      const imgs = it.images as Record<string, string> | undefined;
      return !!(imgs && (imgs.medium || imgs.large));
    })(),
    collection: totalCollection(it),
  }));
  
  // 排序规则：
  // 1. 匹配得分（高优先）
  // 2. 有封面的优先
  // 3. 收藏数（高优先，但权重低）
  scored.sort((a, b) => {
    // 得分差异超过 50 分时，得分优先
    if (Math.abs(a.score - b.score) > 50) {
      return b.score - a.score;
    }
    // 得分接近时，考虑封面
    if (a.hasCover !== b.hasCover) {
      return a.hasCover ? -1 : 1;
    }
    // 最后看收藏数
    return b.collection - a.collection;
  });
  
  // 取得分最高的，但要有基本门槛
  const best = scored[0];
  if (best && (best.score >= 100 || best.collection > 10)) {
    return best.item;
  }
  
  return null;
}

/* ============================================
   搜索封面
   ============================================ */

/** 搜索单个游戏名，返回封面图 URL 和 bangumi ID */
export async function searchGameCover(
  entityName: string
): Promise<BangumiCoverResult | null> {
  // 1. 先查 sessionStorage 本地缓存（最快）
  const cacheKey = COVER_CACHE_PREFIX + entityName;
  const localCached = getCached<BangumiCoverResult>(cacheKey);
  if (localCached) return localCached;

  const nullKey = cacheKey + "_null";
  if (sessionStorage.getItem(nullKey)) return null;

  // 2. 查 Supabase 持久化缓存
  const dbCached = await getSupabaseCache(entityName);
  if (dbCached) {
    // 有缓存记录
    if (dbCached.bangumi_id && dbCached.cover_url) {
      const result: BangumiCoverResult = {
        bangumi_id: dbCached.bangumi_id,
        cover_url: dbCached.cover_url,
        tags: dbCached.tags ?? undefined,
        platform: dbCached.platform ?? undefined,
      };
      setCache(cacheKey, result); // 写入本地缓存加速后续访问
      return result;
    } else {
      // 缓存记录存在但没有有效数据（之前搜不到）
      setCache(nullKey, 1);
      return null;
    }
  }

  // 3. Supabase 没有，请求 Bangumi API
  try {
    const res = await fetch(`${BGM_API}/search/subjects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "PCGameWeekly/1.0" },
      body: JSON.stringify({
        keyword: entityName,
        filter: { type: [4] }, // 4 = 游戏
      }),
    });

    if (!res.ok) {
      console.warn(`[Bangumi] search failed for "${entityName}":`, res.status);
      return null;
    }

    const json = await res.json();
    const items = json?.data;
    if (!Array.isArray(items) || items.length === 0) {
      setCache(nullKey, 1);
      // 写入空缓存，避免重复请求
      saveToSupabaseCache({ entity_name: entityName });
      return null;
    }

    // ── 智能匹配：相似度优先 ──
    const best = pickBestMatch(items, entityName);
    const first = best ?? items[0];
    const coverUrl: string = first?.images?.medium || first?.images?.large || "";
    if (!coverUrl || !first?.id) {
      setCache(nullKey, 1);
      saveToSupabaseCache({ entity_name: entityName });
      return null;
    }

    // Bangumi 图片 URL 有时是 http，转成 https
    const safeCoverUrl = coverUrl.replace(/^http:\/\//, "https://");

    // 从 infobox 提取「游戏类型」（替代之前的 tags 热门标签）
    const infobox: Array<{ key: string; value: unknown }> = first.infobox ?? [];
    const gameTypeItem = infobox.find((item) => item.key === "游戏类型");
    const gameType: string | undefined = gameTypeItem && typeof gameTypeItem.value === "string"
      ? gameTypeItem.value
      : undefined;

    // 提取平台信息（优先 infobox，其次 first.platform）
    const platformItem = infobox.find((item) => item.key === "平台");
    let platform: string | undefined = first.platform || undefined;
    if (platformItem) {
      // 平台可能是字符串或数组
      if (typeof platformItem.value === "string") {
        platform = platformItem.value;
      } else if (Array.isArray(platformItem.value)) {
        // 提取 PC 优先，否则取第一个
        const platforms = (platformItem.value as Array<{ v?: string }>).map((p) => p.v).filter(Boolean);
        platform = platforms.includes("PC") ? "PC" : platforms[0] || undefined;
      }
    }

    const result: BangumiCoverResult = {
      bangumi_id: first.id,
      cover_url: safeCoverUrl,
      tags: gameType ? [gameType] : undefined, // 游戏类型（单个值存为数组保持兼容）
      platform,
    };
    
    // 写入本地缓存
    setCache(cacheKey, result);
    
    // 异步写入 Supabase（包含更多信息，方便后续商店链接查询）
    saveToSupabaseCache({
      entity_name: entityName,
      bangumi_id: first.id,
      cover_url: safeCoverUrl,
      name_cn: first.name_cn ?? null,
      name: first.name ?? null,
      tags: gameType ? [gameType] : null, // 游戏类型
      platform: platform ?? null,
    });
    
    return result;
  } catch (err) {
    console.warn(`[Bangumi] search error for "${entityName}":`, err);
    return null;
  }
}

/* ============================================
   获取商店链接
   ============================================ */

/** 商店链接优先级：Steam > Epic > TapTap > PS > Xbox > 官网 > Bangumi */
const STORE_PATTERNS: { type: string; pattern: RegExp; urlPattern?: RegExp }[] = [
  { type: "steam", pattern: /steam/i, urlPattern: /store\.steampowered\.com|steam:\/\//i },
  { type: "epic", pattern: /epic/i, urlPattern: /epicgames\.com|store\.epicgames/i },
  { type: "taptap", pattern: /taptap/i, urlPattern: /taptap\.cn|taptap\.io/i },
  { type: "ps", pattern: /playstation|ps store|psn/i, urlPattern: /playstation\.com|store\.playstation/i },
  { type: "xbox", pattern: /xbox|microsoft store/i, urlPattern: /xbox\.com|microsoft\.com/i },
  { type: "official", pattern: /官网|官方网站|official|^website$/i },
];

/** 从 infobox 提取商店链接，按优先级返回第一个匹配 */
export async function fetchStoreLinks(
  bangumiId: number,
  entityName?: string // 可选，用于更新 Supabase 缓存
): Promise<BangumiStoreLink | null> {
  // 1. 先查 sessionStorage 本地缓存
  const cacheKey = STORE_CACHE_PREFIX + bangumiId;
  const localCached = getCached<BangumiStoreLink>(cacheKey);
  if (localCached) return localCached;

  const nullKey = cacheKey + "_null";
  if (sessionStorage.getItem(nullKey)) return null;

  // 2. 如果有 entityName，查 Supabase 缓存
  if (entityName) {
    const dbCached = await getSupabaseCache(entityName);
    if (dbCached?.store_url && dbCached?.store_type) {
      const result: BangumiStoreLink = {
        store_type: dbCached.store_type,
        store_url: dbCached.store_url,
      };
      setCache(cacheKey, result);
      return result;
    }
  }

  // 3. 请求 Bangumi API（bangumiId 为 0 表示没有有效 ID，跳过）
  if (!bangumiId) {
    return null;
  }
  try {
    const res = await fetch(`${BGM_API}/subjects/${bangumiId}`, {
      headers: { "User-Agent": "PCGameWeekly/1.0" },
    });

    if (!res.ok) {
      console.warn(`[Bangumi] subject detail failed for id=${bangumiId}:`, res.status);
      return null;
    }

    const json = await res.json();

    // infobox 是一个 { key: string, value: string | { v: string }[] }[] 数组
    const infobox: Array<{ key: string; value: unknown }> = json?.infobox ?? [];

    // 同时收集 json 根级别的 website 字段
    const websiteUrl: string = json?.website ?? "";

    // 从 infobox 提取所有可能的链接
    const allLinks: { label: string; url: string }[] = [];

    for (const item of infobox) {
      const values = Array.isArray(item.value)
        ? item.value.map((v: { v?: string }) => v?.v ?? "")
        : [String(item.value ?? "")];

      for (const val of values) {
        // 提取 URL
        const urlMatch = val.match(/https?:\/\/[^\s)}\]"']+/);
        if (urlMatch) {
          allLinks.push({ label: item.key, url: urlMatch[0] });
        }
      }
    }

    // 按优先级匹配
    for (const sp of STORE_PATTERNS) {
      for (const link of allLinks) {
        const labelMatch = sp.pattern.test(link.label);
        const urlMatch = sp.urlPattern ? sp.urlPattern.test(link.url) : false;
        if (labelMatch || urlMatch) {
          const result: BangumiStoreLink = {
            store_type: sp.type,
            store_url: link.url,
          };
          setCache(cacheKey, result);
          // 更新 Supabase 缓存
          if (entityName) {
            saveToSupabaseCache({
              entity_name: entityName,
              store_url: result.store_url,
              store_type: result.store_type,
            });
          }
          return result;
        }
      }
    }

    // 如果 infobox 没找到，但有 website 字段
    if (websiteUrl) {
      // 检查 website 是否匹配任何商店
      for (const sp of STORE_PATTERNS) {
        if (sp.urlPattern && sp.urlPattern.test(websiteUrl)) {
          const result: BangumiStoreLink = {
            store_type: sp.type,
            store_url: websiteUrl,
          };
          setCache(cacheKey, result);
          if (entityName) {
            saveToSupabaseCache({
              entity_name: entityName,
              store_url: result.store_url,
              store_type: result.store_type,
            });
          }
          return result;
        }
      }
      // 不匹配任何商店，当作官网
      const result: BangumiStoreLink = {
        store_type: "official",
        store_url: websiteUrl,
      };
      setCache(cacheKey, result);
      if (entityName) {
        saveToSupabaseCache({
          entity_name: entityName,
          store_url: result.store_url,
          store_type: result.store_type,
        });
      }
      return result;
    }

    // 兜底：bangumi 页面本身
    const bgmResult: BangumiStoreLink = {
      store_type: "bgm",
      store_url: `https://bgm.tv/subject/${bangumiId}`,
    };
    setCache(cacheKey, bgmResult);
    if (entityName) {
      saveToSupabaseCache({
        entity_name: entityName,
        store_url: bgmResult.store_url,
        store_type: bgmResult.store_type,
      });
    }
    return bgmResult;
  } catch (err) {
    console.warn(`[Bangumi] store link error for id=${bangumiId}:`, err);
    setCache(nullKey, 1);
    return null;
  }
}

/* ============================================
   批量工具
   ============================================ */

/** 延迟 ms */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 批量搜索封面：每批 batchSize 个请求，批间隔 intervalMs
 * 返回 Map<entityName, BangumiCoverResult>
 */
export async function batchSearchCovers(
  entityNames: string[],
  batchSize = 5,
  intervalMs = 200
): Promise<Map<string, BangumiCoverResult>> {
  const results = new Map<string, BangumiCoverResult>();

  for (let i = 0; i < entityNames.length; i += batchSize) {
    const batch = entityNames.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (name) => {
        const result = await searchGameCover(name);
        return { name, result };
      })
    );
    for (const { name, result } of batchResults) {
      if (result) results.set(name, result);
    }
    // 非最后一批时等待
    if (i + batchSize < entityNames.length) {
      await delay(intervalMs);
    }
  }

  return results;
}

"use client";

import { useState, useCallback } from "react";
import { updateSessionCoverCache } from "@/lib/bangumi/api";
import { updateGlobalCoverCache } from "@/lib/bangumi/hooks";

const BGM_API = "https://api.bgm.tv/v0";

interface SearchResult {
  id: number;
  name: string;
  name_cn: string;
  images?: { medium?: string; large?: string };
  date?: string;
  platform?: string;
}

interface BangumiFixModalProps {
  entityName: string;
  currentCoverUrl?: string | null;
  onClose: () => void;
  onFixed: (data: { bangumi_id: number; cover_url: string; name_cn?: string }) => void;
}

export function BangumiFixModal({
  entityName,
  currentCoverUrl,
  onClose,
  onFixed,
}: BangumiFixModalProps) {
  const [query, setQuery] = useState(entityName);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setSelectedId(null);

    try {
      const res = await fetch(`${BGM_API}/search/subjects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "PCGameWeekly/1.0" },
        body: JSON.stringify({
          keyword: query.trim(),
          filter: { type: [4] }, // 4 = 游戏
        }),
      });

      if (!res.ok) {
        throw new Error(`搜索失败: ${res.status}`);
      }

      const json = await res.json();
      const items = json?.data ?? [];
      setResults(items.slice(0, 10)); // 最多显示 10 个结果
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜索出错");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleConfirm = useCallback(async () => {
    const selected = results.find((r) => r.id === selectedId);
    if (!selected) return;

    const coverUrl = selected.images?.medium || selected.images?.large;
    if (!coverUrl) {
      setError("所选条目没有封面图");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 调用 API 更新 bangumi_cache
      const res = await fetch("/api/bangumi/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_name: entityName,
          bangumi_id: selected.id,
          cover_url: coverUrl.replace(/^http:\/\//, "https://"),
          name_cn: selected.name_cn || null,
          name: selected.name || null,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "保存失败");
      }

      const safeCoverUrl = coverUrl.replace(/^http:\/\//, "https://");
      
      // 同步更新客户端缓存，避免页面切换后恢复旧封面
      const cacheData = {
        bangumi_id: selected.id,
        cover_url: safeCoverUrl,
      };
      updateSessionCoverCache(entityName, cacheData);
      updateGlobalCoverCache(entityName, cacheData);

      // 通知父组件更新
      onFixed({
        bangumi_id: selected.id,
        cover_url: safeCoverUrl,
        name_cn: selected.name_cn,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存出错");
    } finally {
      setSaving(false);
    }
  }, [selectedId, results, entityName, onFixed, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#181818] rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col border border-[#282828]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#282828] flex items-center justify-between">
          <h2 className="text-base font-semibold text-white tracking-tight">
            修复 Bangumi 关联
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-[#909090] hover:text-white hover:bg-[#282828] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* 当前状态 */}
          <div className="mb-5 p-4 bg-[#1f1f1f] rounded-lg border border-[#282828]">
            <p className="text-sm text-[#909090]">
              当前游戏：<span className="font-medium text-white">{entityName}</span>
            </p>
            {currentCoverUrl && (
              <div className="mt-3 flex items-center gap-3">
                <span className="text-sm text-[#909090]">当前封面：</span>
                <img
                  src={currentCoverUrl}
                  alt="当前封面"
                  className="w-16 h-20 object-cover rounded"
                />
              </div>
            )}
          </div>

          {/* 搜索框 */}
          <div className="flex gap-3 mb-5">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="输入游戏名搜索 Bangumi..."
              className="flex-1 px-4 py-2.5 border border-[#333] rounded-lg bg-[#121212] text-white placeholder-[#606060] focus:outline-none focus:border-[#1ed760] transition-colors"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="px-5 py-2.5 bg-[#1ed760] text-[#121212] font-semibold rounded-full hover:bg-[#1fdf64] hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "搜索中..." : "搜索"}
            </button>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/20 text-red-400 rounded-lg text-sm border border-red-900/30">
              {error}
            </div>
          )}

          {/* 搜索结果 */}
          {results.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-[#909090] mb-3">
                搜索结果（点击选择正确的条目）：
              </p>
              {results.map((item) => {
                const coverUrl = item.images?.medium || item.images?.large;
                const isSelected = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full flex items-center gap-4 p-3 rounded-lg border transition-all ${
                      isSelected
                        ? "border-[#1ed760] bg-[#1ed760]/10"
                        : "border-[#282828] bg-[#1f1f1f] hover:border-[#333] hover:bg-[#252525]"
                    }`}
                  >
                    {/* 封面 */}
                    <div className="w-14 h-[70px] flex-shrink-0 bg-[#282828] rounded overflow-hidden">
                      {coverUrl ? (
                        <img
                          src={coverUrl.replace(/^http:\/\//, "https://")}
                          alt={item.name_cn || item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#606060] text-xs">
                          无封面
                        </div>
                      )}
                    </div>
                    {/* 信息 */}
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-medium text-white truncate">
                        {item.name_cn || item.name}
                      </p>
                      {item.name_cn && item.name !== item.name_cn && (
                        <p className="text-sm text-[#b3b3b3] truncate">
                          {item.name}
                        </p>
                      )}
                      <p className="text-xs text-[#606060] mt-1">
                        {item.date && `${item.date}`}
                        {item.platform && ` · ${item.platform}`}
                        {` · ID: ${item.id}`}
                      </p>
                    </div>
                    {/* 选中标记 */}
                    {isSelected && (
                      <div className="text-[#1ed760] text-lg">✓</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* 空状态 */}
          {!loading && results.length === 0 && query && (
            <p className="text-center text-[#606060] py-8">
              点击"搜索"按钮查找 Bangumi 条目
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#282828] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 text-[#b3b3b3] hover:text-white font-medium transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedId || saving}
            className="px-5 py-2 bg-[#1ed760] text-[#121212] font-semibold rounded-full hover:bg-[#1fdf64] hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed transition-all"
          >
            {saving ? "保存中..." : "确认修复"}
          </button>
        </div>
      </div>
    </div>
  );
}

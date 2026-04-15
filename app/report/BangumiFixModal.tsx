"use client";

import { useState, useCallback } from "react";

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

      // 通知父组件更新
      onFixed({
        bangumi_id: selected.id,
        cover_url: coverUrl.replace(/^http:\/\//, "https://"),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            修复 Bangumi 关联
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* 当前状态 */}
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              当前游戏：<span className="font-medium text-gray-900 dark:text-gray-100">{entityName}</span>
            </p>
            {currentCoverUrl && (
              <div className="mt-2 flex items-center gap-3">
                <span className="text-sm text-gray-500">当前封面：</span>
                <img
                  src={currentCoverUrl}
                  alt="当前封面"
                  className="w-16 h-16 object-cover rounded"
                />
              </div>
            )}
          </div>

          {/* 搜索框 */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="输入游戏名搜索 Bangumi..."
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "搜索中..." : "搜索"}
            </button>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* 搜索结果 */}
          {results.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
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
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    {/* 封面 */}
                    <div className="w-16 h-20 flex-shrink-0 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                      {coverUrl ? (
                        <img
                          src={coverUrl.replace(/^http:\/\//, "https://")}
                          alt={item.name_cn || item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                          无封面
                        </div>
                      )}
                    </div>
                    {/* 信息 */}
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {item.name_cn || item.name}
                      </p>
                      {item.name_cn && item.name !== item.name_cn && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {item.name}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {item.date && `发售日期: ${item.date}`}
                        {item.platform && ` · ${item.platform}`}
                        {` · ID: ${item.id}`}
                      </p>
                    </div>
                    {/* 选中标记 */}
                    {isSelected && (
                      <div className="text-blue-600 dark:text-blue-400 text-lg">✓</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* 空状态 */}
          {!loading && results.length === 0 && query && (
            <p className="text-center text-gray-400 py-8">
              点击"搜索"按钮查找 Bangumi 条目
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedId || saving}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "保存中..." : "确认修复"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import {
  batchSearchCovers,
  fetchStoreLinks,
  type BangumiCoverResult,
  type BangumiStoreLink,
} from "./api";

/* ============================================
   useBangumiCovers — 批量为游戏名搜封面
   ============================================ */

export interface CoverMap {
  [entityName: string]: BangumiCoverResult;
}

/* ── 模块级缓存，避免组件卸载后丢失 ── */
const globalCoverCache: CoverMap = {};
const globalFetchedNames = new Set<string>();
let globalCacheVersion = 0;
const listeners = new Set<() => void>();

function notifyListeners() {
  globalCacheVersion++;
  listeners.forEach((l) => l());
}

function subscribeToCache(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getCacheSnapshot() {
  return globalCacheVersion;
}

function getServerSnapshot() {
  return 0;
}

/**
 * 传入游戏名列表，返回 { covers, loading }
 * - 自动批量请求（5/batch, 200ms间隔）
 * - 模块级缓存，组件卸载后不丢失
 * - entityNames 变化时自动重新请求（只请求新增的）
 */
export function useBangumiCovers(entityNames: string[]) {
  const [loading, setLoading] = useState(false);

  // 订阅全局缓存变化
  useSyncExternalStore(subscribeToCache, getCacheSnapshot, getServerSnapshot);

  // 稳定依赖：用 JSON 序列化避免数组引用变化导致的重复触发
  const namesKey = JSON.stringify(entityNames.slice().sort());

  useEffect(() => {
    const names = JSON.parse(namesKey) as string[];
    // 过滤出还没请求过的名字
    const newNames = names.filter((n) => !globalFetchedNames.has(n));
    if (newNames.length === 0) return;

    // 标记为已请求
    newNames.forEach((n) => globalFetchedNames.add(n));

    let cancelled = false;
    setLoading(true);

    batchSearchCovers(newNames).then((resultMap) => {
      if (cancelled) return;
      resultMap.forEach((val, key) => {
        globalCoverCache[key] = val;
      });
      notifyListeners();
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [namesKey]);

  return { covers: globalCoverCache, loading };
}

/* ============================================
   useBangumiStoreLink — 按需获取商店链接
   ============================================ */

export interface StoreLinkState {
  loading: boolean;
  data: BangumiStoreLink | null;
}

/**
 * 传入 bangumi_id 和 entityName（可选），返回 { storeLink, loadingStore, fetchStore }
 * - fetchStore() 触发请求（用于点击/展开时调用）
 * - 自动 sessionStorage 缓存
 * - 传 entityName 可以查 Supabase 缓存中手动设置的 store_url
 */
export function useBangumiStoreLink(bangumiId: number | null | undefined, entityName?: string) {
  const [state, setState] = useState<StoreLinkState>({
    loading: false,
    data: null,
  });

  const fetchStore = useCallback(() => {
    // 没有 bangumiId 也没有 entityName 才跳过
    if (!bangumiId && !entityName) return;
    setState((prev) => ({ ...prev, loading: true }));
    fetchStoreLinks(bangumiId ?? 0, entityName).then((result) => {
      setState({ loading: false, data: result });
    });
  }, [bangumiId, entityName]);

  // 当 bangumiId 变化时重置
  useEffect(() => {
    setState({ loading: false, data: null });
  }, [bangumiId]);

  return {
    storeLink: state.data,
    loadingStore: state.loading,
    fetchStore,
  };
}

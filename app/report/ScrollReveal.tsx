"use client";

import { useRef, useEffect, useState, type ReactNode } from "react";

/**
 * ScrollReveal — 当元素进入视口时触发一次性 CSS 动画
 * 
 * 使用 IntersectionObserver 检测，进入后 unobserve，确保只触发一次。
 * 支持 rootMargin 提前触发（默认 -40px 底部偏移，滚到眼前才动）。
 */
export function ScrollReveal({
  id,
  "data-section-id": dataSectionId,
  children,
  className = "",
  animateClass = "animate-reveal",
  threshold = 0.1,
  rootMargin = "0px 0px -40px 0px",
}: {
  id?: string;
  "data-section-id"?: string;
  children: ReactNode;
  className?: string;
  animateClass?: string;
  threshold?: number;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 如果浏览器不支持 IO，直接显示
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }

    // 安全兜底：如果元素已经在视口内（首屏/hash跳转），立即显示
    const rect = el.getBoundingClientRect();
    if (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.height > 0
    ) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(el);

    // 最终兜底：1.5 秒后如果仍未触发则强制显示（防止 iframe / 特殊环境下 IO 失效）
    const timer = setTimeout(() => setVisible(true), 1500);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [threshold, rootMargin]);

  return (
    <div
      ref={ref}
      id={id}
      data-section-id={dataSectionId}
      className={`${className} ${visible ? animateClass : "opacity-0"}`}
      style={visible ? { animationFillMode: "backwards" } : undefined}
    >
      {children}
    </div>
  );
}

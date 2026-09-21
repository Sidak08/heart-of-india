"use client";

import { useEffect, useRef } from "react";

export function MotionReveal({ children, className = "", stagger = false }: { children: React.ReactNode; className?: string; stagger?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      element.dataset.motion = "visible";
      return;
    }

    if (element.getBoundingClientRect().top < window.innerHeight * 0.88) {
      element.dataset.motion = "visible";
      return;
    }

    element.dataset.motion = "pending";
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      element.dataset.motion = "revealed";
      observer.disconnect();
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} className={`${className} motion-reveal${stagger ? " motion-stagger" : ""}`.trim()}>{children}</div>;
}

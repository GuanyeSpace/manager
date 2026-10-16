"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function SessionRenewal({ preview }: { preview: boolean }) {
  const pathname = usePathname();
  useEffect(() => {
    if (preview || pathname.startsWith("/boss/preview/") || pathname === "/login") return;
    let lastAttempt = 0, activeAt = Date.now(), pending = false, stopped = false;
    async function renew() {
      const now = Date.now();
      if (stopped || pending || document.visibilityState !== "visible" || now - activeAt > 5 * 60_000 || now - lastAttempt < 60_000) return;
      lastAttempt = now; pending = true;
      try {
        const response = await fetch("/api/session/renew", { method: "POST", credentials: "same-origin", headers: { "x-session-renew": "1" }, cache: "no-store" });
        if (response.status === 401 || response.status === 403) stopped = true;
      } catch { /* 临时网络失败不退出，后续前台操作重试。 */ }
      finally { pending = false; }
    }
    const activity = () => { activeAt = Date.now(); void renew(); };
    const resume = () => { if (document.visibilityState === "visible") activity(); };
    void renew();
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    const timer = setInterval(() => void renew(), 60_000);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener("pointerdown", activity); window.removeEventListener("keydown", activity); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
  }, [pathname, preview]);
  return null;
}

"use client";
import { createContext, useContext, type ReactNode } from "react";
import { allowedPreviewPath } from "@/lib/auth/preview-path";
const PreviewNavigation = createContext<string | null>(null);
export function PreviewNavigationProvider({ prefix, children }: { prefix: string | null; children: ReactNode }) {
  return <PreviewNavigation.Provider value={prefix}>{children}</PreviewNavigation.Provider>;
}
export function usePreviewHref() {
  const prefix = useContext(PreviewNavigation);
  return (href: string) => prefix && allowedPreviewPath(href.split(/[?#]/)[0]) ? prefix + href : href;
}

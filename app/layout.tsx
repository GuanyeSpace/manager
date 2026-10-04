import { headers } from "next/headers";
import { PREVIEW_HEADER } from "@/lib/auth/preview-path";
import { verifiedPreviewContext } from "@/lib/auth/preview-context";
import { PreviewNavigationProvider } from "@/components/preview-navigation";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "公司内部管理系统",
  description: "公司内部管理系统",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const preview = verifiedPreviewContext((await headers()).get(PREVIEW_HEADER));
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><PreviewNavigationProvider prefix={preview?.prefix ?? null}><WorkspaceSwitcher />{children}</PreviewNavigationProvider></body>
    </html>
  );
}

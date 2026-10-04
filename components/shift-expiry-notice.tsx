"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { isShiftExpired } from "@/modules/workbench/schema";
export function ShiftExpiryNotice({ shift, serverNow }: { shift: { clockStartedAt: Date | null; createdAt: Date; endedAt: Date | null }; serverNow: Date }) {
  const [now, setNow] = useState(new Date(serverNow).getTime());
  useEffect(() => {
    const base = new Date(serverNow).getTime(), mounted = performance.now();
    const timer = setInterval(() => setNow(base + performance.now() - mounted), 1000);
    return () => clearInterval(timer);
  }, [serverNow]);
  if (!isShiftExpired(shift, now)) return null;
  return <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">上班记录超时待处理，暂不能开始准备或确认开播。<Link href="/workbench/attendance#missed-end" className="ml-2 font-medium underline">处理上班记录</Link></p>;
}

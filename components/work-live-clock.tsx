"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { taskSeconds, taskTimeLabel } from "@/modules/workbench/schema";

export type LiveClockTask = {
  index: number;
  minute: number;
  trigger?: "timed" | "manual";
  second?: number;
  title: string;
  status: "pending" | "done" | "issue" | "skip";
};

export function liveClockTasks(tasks: LiveClockTask[], elapsed: number) {
  const pending = tasks.filter(task => task.status === "pending" && task.trigger !== "manual").sort((a, b) => taskSeconds(a) - taskSeconds(b) || a.index - b.index);
  return { next: pending[0], due: pending.filter(task => taskSeconds(task) <= elapsed) };
}

function reminderKey(sessionId: string, index: number) {
  return `work-live-reminder:v2:${sessionId}:${index}`;
}

export function WorkLiveClock({ sessionId, startedAt, tasks, preview = false }: { sessionId: string; startedAt: string; tasks: LiveClockTask[]; preview?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  const [visible, setVisible] = useState<LiveClockTask[]>([]);
  const [permission, setPermission] = useState<string>("default");
  const seen = useRef(new Set<string>());
  useEffect(() => {
    let active = true;
    const notices: Notification[] = [];
    const tick = () => {
      if (!active) return;
      setNow(Date.now());
      setPermission("Notification" in window ? Notification.permission : "unsupported");
      if (preview) return;
      const notify = () => {
        if (!active) return;
        const due = liveClockTasks(tasks, Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000))).due;
        const fresh = due.filter(t => {
          const key = reminderKey(sessionId, t.index);
          if (seen.current.has(key)) return false;
          try { if (localStorage.getItem(key)) { seen.current.add(key); return false; } } catch { /* In-memory fallback. */ }
          seen.current.add(key);
          try { localStorage.setItem(key, "1"); } catch { /* In-memory fallback. */ }
          return true;
        });
        if (!fresh.length) return;
        setVisible(old => [...old.filter(t => tasks.some(current => current.index === t.index && current.status === "pending")), ...fresh]);
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            const notification = new Notification("直播事项到时提醒", { body: fresh.map(t => `${t.title} · 开播后 ${taskTimeLabel(t)}`).join("\n"), tag: `live:${sessionId}:${fresh.map(t => t.index).join(",")}`, silent: true });
            notification.onclick = () => { window.focus(); notification.close(); };
            notices.push(notification);
          } catch { /* Page dialog remains available if OS notifications are blocked. */ }
        }
      };
      if (navigator.locks) void navigator.locks.request(`live-reminder:${sessionId}`, notify).catch(() => notify());
      else notify();
    };
    const initial = setTimeout(tick, 0), timer = setInterval(tick, 1000);
    window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick);
    return () => { active = false; clearTimeout(initial); clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); notices.forEach(n => n.close()); };
  }, [sessionId, startedAt, tasks, preview]);
  const elapsed = now === null ? null : Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const { next, due } = liveClockTasks(tasks, elapsed ?? -1);
  const shown = visible.filter(t => tasks.some(current => current.index === t.index && current.status === "pending"));
  async function enableNotifications() {
    if (preview || !("Notification" in window)) return;
    try { setPermission(await Notification.requestPermission()); } catch { setPermission("denied"); }
  }
  return <>
    <div className="space-y-2 rounded-xl bg-emerald-50 p-4 text-emerald-950">
      <p>本场已开播 <strong className="text-xl tabular-nums">{elapsed === null ? "…" : `${Math.floor(elapsed / 3600)}:${String(Math.floor(elapsed % 3600 / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`}</strong></p>
      {next ? <p className="text-sm">下一未处理事项：{next.title} · 开播后 {taskTimeLabel(next)}{elapsed !== null && elapsed >= taskSeconds(next) ? "（已到时）" : ""}</p> : <p className="text-sm">暂无未处理的定时事项</p>}
      <p role="status" className="text-sm">已到时未处理 {due.length} 项</p>
      {!preview && <div className="text-sm">{permission === "default" && <button type="button" onClick={enableNotifications} className="rounded border px-3 py-1">开启桌面通知</button>}{permission === "granted" && <p>桌面通知已开启，请保持本场页面打开。</p>}{permission === "denied" && <p>桌面通知被禁用，可在浏览器网站设置中开启；页面弹窗仍可用。</p>}{permission === "unsupported" && <p>当前浏览器不支持桌面通知，将使用页面弹窗。</p>}</div>}
    </div>
    <Dialog.Root open={!preview && shown.length > 0} onOpenChange={open => { if (!open) setVisible([]); }}>
      <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40"/><Dialog.Content className="fixed left-1/2 top-1/2 z-[71] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-950 shadow-xl">
        <Dialog.Title className="text-xl font-semibold">直播事项提醒 · {shown.length} 项</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm">以下事项已到配置时间，请及时执行。关闭提醒不会标记任务完成。</Dialog.Description>
        <ul className="my-5 max-h-64 list-disc space-y-3 overflow-y-auto pl-5">{shown.map(task => <li key={task.index}>{task.title} · 开播后 {taskTimeLabel(task)}</li>)}</ul>
        <Dialog.Close className="rounded bg-amber-900 px-5 py-2 text-white">知道了</Dialog.Close>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </>;
}

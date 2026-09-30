"use client";

import { useEffect, useState } from "react";
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
  return `work-live-reminder:${sessionId}:${index}`;
}

export function WorkLiveClock({ sessionId, startedAt, tasks }: { sessionId: string; startedAt: string; tasks: LiveClockTask[] }) {
  const [now, setNow] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<{ sessionId: string; indices: Set<number> } | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const stored = new Set<number>();
    for (const task of tasks) {
      try {
        const key = reminderKey(sessionId, task.index);
        if (task.status === "pending") {
          if (sessionStorage.getItem(key) === "1") stored.add(task.index);
        } else {
          sessionStorage.removeItem(key);
        }
      } catch {
        // The clock still works when browser storage is unavailable.
      }
    }
    const timer = setTimeout(() => {
      setDismissed(previous => {
        const indices = previous?.sessionId === sessionId ? new Set(previous.indices) : new Set<number>();
        for (const task of tasks) {
          if (task.status !== "pending") indices.delete(task.index);
        }
        for (const index of stored) indices.add(index);
        if (previous?.sessionId === sessionId && indices.size === previous.indices.size && [...indices].every(index => previous.indices.has(index))) return previous;
        return { sessionId, indices };
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [sessionId, tasks]);

  const elapsed = now === null ? null : Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const { next, due } = liveClockTasks(tasks, elapsed ?? -1);
  const visible = dismissed?.sessionId === sessionId ? due.filter(task => !dismissed.indices.has(task.index)) : [];

  function closeReminder() {
    for (const task of visible) {
      try { sessionStorage.setItem(reminderKey(sessionId, task.index), "1"); } catch { /* Keep the in-page dismissal. */ }
    }
    setDismissed(previous => {
      const indices = previous?.sessionId === sessionId ? new Set(previous.indices) : new Set<number>();
      for (const task of visible) indices.add(task.index);
      return { sessionId, indices };
    });
  }

  return <>
    <div className="space-y-2 rounded-xl bg-emerald-50 p-4 text-emerald-950">
      <p>本场已开播 <strong className="text-xl tabular-nums">{elapsed === null ? "…" : `${Math.floor(elapsed / 3600)}:${String(Math.floor(elapsed % 3600 / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`}</strong></p>
      {next ? <p className="text-sm">下一未处理事项：{next.title} · 开播后 {taskTimeLabel(next)}{elapsed !== null && elapsed >= taskSeconds(next) ? "（已到时）" : ""}</p> : <p className="text-sm">暂无未处理的定时事项</p>}
      <p role="status" className="text-sm">已到时未处理 {due.length} 项</p>
    </div>
    {visible.length > 0 && <div role="alert" className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-lg">
      <div className="flex items-start justify-between gap-3"><strong>直播事项提醒 · {visible.length} 项</strong><button type="button" onClick={closeReminder} aria-label="关闭直播事项提醒" className="rounded px-2 py-0.5 text-sm hover:bg-amber-100">关闭</button></div>
      <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm">{visible.map(task => <li key={task.index}>{task.title} · 开播后 {taskTimeLabel(task)}</li>)}</ul>
      <p className="mt-2 text-xs">关闭提醒不会更改事项状态。</p>
    </div>}
  </>;
}

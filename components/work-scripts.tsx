"use client";
import { useState } from "react";
import { categories, type Workflow } from "@/modules/workbench/schema";
export function WorkScripts({ workflow }: { workflow: Workflow }) {
  const [feedback, setFeedback] = useState<{ key: string; message: string } | null>(null);
  return <aside className="min-w-0 space-y-5 rounded-xl border bg-background p-5"><h2 className="text-lg font-semibold">账号话术</h2>
    {categories.map(category => <section key={category} className="space-y-2"><h3 className="text-sm font-medium">{category}</h3>{workflow.scripts.map((script, index) => ({ script, index })).filter(({ script }) => script.category === category).map(({ script, index }) => <details key={index} className="rounded-lg bg-muted/50 p-3"><summary className="cursor-pointer text-sm font-medium">{script.title}</summary>{script.scene && <p className="mt-2 text-xs text-muted-foreground">{script.scene}</p>}<p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{script.body}</p><button type="button" className="mt-3 rounded border px-3 py-1 text-xs" onClick={async () => { try { await navigator.clipboard.writeText(script.body); setFeedback({ key: String(index), message: "已复制" }); } catch { setFeedback({ key: String(index), message: "复制失败，请手动选择文字复制" }); } }}>一键复制</button>{feedback?.key === String(index) && <p role="status" className="mt-2 text-xs">{feedback.message}</p>}</details>)}{!workflow.scripts.some(s => s.category === category) && <p className="text-xs text-muted-foreground">尚未配置</p>}</section>)}
  </aside>;
}

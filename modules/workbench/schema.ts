import { z } from "zod";

export const endKinds = { normal: "正常下播", violation_stop: "违规断播", violation_ban: "违规封禁", equipment: "设备问题断播", other: "其他异常中断", interrupted: "异常中断（历史）" };
export const endKindSchema = z.enum(["normal", "violation_stop", "violation_ban", "equipment", "other", "interrupted"]);
export const endOutcomes = { normal: "NORMAL", violation_stop: "VIOLATION_STOP", violation_ban: "VIOLATION_BAN", equipment: "EQUIPMENT", other: "OTHER_INTERRUPTION", interrupted: "INTERRUPTED" };
export function endKindForOutcome(outcome: string | null) { return (Object.keys(endOutcomes) as (keyof typeof endKinds)[]).find(k => endOutcomes[k] === outcome) ?? "normal"; }
export function isInterrupted(outcome: string | null) { return endKindForOutcome(outcome) !== "normal"; }
export function isViolationEnd(outcome: string | null) { return ["VIOLATION_STOP", "VIOLATION_BAN"].includes(outcome ?? ""); }
export function isOtherEnd(outcome: string | null) { return isInterrupted(outcome) && !isViolationEnd(outcome); }

export const phases = ["before", "live", "after"] as const;
export const phaseLabels = { before: "开播前", live: "开播中", after: "下播后" };
export const statusLabels = { PREPARING: "准备中", LIVE: "直播中", WRAP: "待收尾", COMPLETE: "已收尾", CANCELLED: "已取消" };
export const categories = ["福袋话术", "人设话术", "进群话术", "关注话术", "其他话术"] as const;
const task = z.object({ trigger: z.enum(["timed", "manual"]).optional(), title: z.string().trim().min(1).max(100), detail: z.string().trim().max(2000), minute: z.number().int().min(0).max(1440), second: z.number().int().min(0).max(59).optional() });
export const workflowSchema = z.object({
  before: z.array(task).max(40), live: z.array(task).max(40), after: z.array(task).max(40),
  materials: z.string().trim().max(12000),
  scripts: z.array(z.object({ category: z.enum(categories), title: z.string().trim().min(1).max(100), body: z.string().trim().min(1).max(5000), scene: z.string().trim().max(300) })).max(60),
});
export type Workflow = z.infer<typeof workflowSchema>;
export type Progress = Record<string, { status: "done" | "issue" | "skip" | "pending"; note: string; actor: string; at: string }>;
export type WorkState = { error?: string; success?: string; savedVersion?: number } | undefined;
export const defaultWorkflow: Workflow = {
  before: [
    { title: "设备与网络检查", detail: "手动确认电脑、推流设备、麦克风、画面和网络状态。", minute: 0 },
    { title: "本场内容与素材确认", detail: "与主播确认内容安排，检查所需贴片、音乐和话术。", minute: 0 },
    { title: "承接或商品检查", detail: "按本账号用途检查群容量、卡片承接或商品链接；不适用时注明。", minute: 0 },
  ],
  live: [
    { title: "开场检查", detail: "确认画面、声音与开场内容正常。", minute: 0 },
    { title: "互动与承接检查", detail: "按账号流程配合主播，检查所用素材与承接链路。", minute: 3 },
  ],
  after: [
    { title: "异常与交接整理", detail: "记录本场异常、处理结果及下一场注意事项。", minute: 0 },
    { title: "设备与素材归档", detail: "结束推流后整理设备、素材和工作环境。", minute: 0 },
  ], materials: "", scripts: [],
};
export const dailyTasks = ["电脑重启周期检查（每 3 天）", "设备与物料盘点（每周）", "工作区域清洁（周六）", "异常复盘与资料更新"];
export function moneyPending(report: { deletedAt?: Date | null; monetizationDeletedAt?: Date | null; fanGroupCount: number | null; linkClickCount: number | null; longPressCount: number | null; backendJoinCount: number | null; effectiveCount: number | null; hasSales: boolean | null; salesGmv: unknown | null } | null, leadEligible = false) {
  return !report || !!report.deletedAt || !!report.monetizationDeletedAt || [report.fanGroupCount, report.linkClickCount, report.longPressCount, report.backendJoinCount, report.effectiveCount].some(v => v === null) || (!leadEligible && (report.hasSales === null || (report.hasSales === true && report.salesGmv === null)));
}
export const commandSchema = z.object({
  id: z.string().max(100), version: z.coerce.number().int().min(0),
  command: z.enum(["create", "start", "end", "complete", "cancel", "check", "issue", "patrol", "violation", "controller", "unstarted", "correct"]),
  endKind: endKindSchema.default("normal"),
  otherIncident: z.enum(["", "yes", "no"]).default(""),
  incident: z.enum(["", "yes", "no"]).default(""),
  failureReason: z.enum(["", "人脸验证未通过", "账号封禁", "设备故障", "主播原因", "其他"]).default(""),
  recoveryDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).default(""),
  actualControllerId: z.string().max(100).default(""),
  violation: z.enum(["", "yes", "no"]).default(""),
  reason: z.string().trim().max(2000).default(""),
  label: z.string().trim().max(30).default(""), time: z.string().max(30).default(""),
  phase: z.enum(phases).default("before"), index: z.coerce.number().int().min(0).max(39).default(0),
  status: z.enum(["done", "issue", "skip", "pending"]).default("done"), note: z.string().trim().max(2000).default(""),
});

export const workflowParts = ["before", "live", "after", "scripts", "materials"] as const;
export const workflowPartLabels = { before: "开播前流程", live: "直播中流程", after: "下播后流程", scripts: "账号话术", materials: "素材与交接说明" };
export const copyWorkflowSchema = z.object({
  sourceId: z.string().min(1).max(100), sourceVersion: z.number().int().min(1),
  targets: z.array(z.object({ id: z.string().min(1).max(100), version: z.number().int().min(0) })).min(1).max(100),
  parts: z.array(z.enum(workflowParts)).min(1).max(5),
}).refine(v => new Set(v.targets.map(t => t.id)).size === v.targets.length && v.targets.every(t => t.id !== v.sourceId), { message: "目标账号不能重复或包含来源账号" });

export function taskSeconds(task: { minute: number; second?: number }) { return task.minute * 60 + (task.second ?? 0); }
export function taskTimeLabel(task: { minute: number; second?: number }) { return `${task.minute} 分 ${(task.second ?? 0)} 秒`; }
export function moveTask<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return items;
  const result = [...items]; const [item] = result.splice(from, 1); result.splice(to, 0, item); return result;
}

export const equipmentLabels = { computer: "电脑", sound: "麦克风与声音", picture: "摄像机与画面", network: "网络" } as const;
export const equipmentTargets = {
  computer: "电脑正常开机，直播伴侣、音乐软件、直播保镖等正常使用。",
  sound: "打开直播伴侣录屏，测试播放声音和麦克风收音正常。",
  picture: "摄像机/手机直播画面正常，灯光和各种贴片正常。",
  network: "直播伴侣测速正常，大于 50 Mb。",
} as const;
export const SHIFT_MINIMUM_MS = 8 * 60 * 60 * 1000;
export function completedCheckCount(checks: EquipmentChecks) {
  return Object.keys(equipmentLabels).filter(key => ["normal", "issue"].includes(checks[key as keyof EquipmentChecks]?.status ?? "")).length;
}
export type EquipmentChecks = Partial<Record<keyof typeof equipmentLabels, { status: "normal" | "issue"; note: string; at: string; actor: string }>>;
export const shiftCommandSchema = z.object({
  command: z.enum(["shiftStart", "shiftCheck", "shiftEnd", "shiftEarlyEnd", "shiftCorrectTime", "shiftCorrectCheck"]),
  id: z.string().max(100).default(""), version: z.coerce.number().int().min(0).default(0),
  startedAt: z.string().max(30).default(""), endedAt: z.string().max(30).default(""), reason: z.string().trim().max(2000).default(""),
  item: z.enum(["computer", "sound", "picture", "network"]).default("computer"),
  status: z.enum(["normal", "issue"]).default("normal"), note: z.string().trim().max(2000).default(""),
});

export function workStatusLabel(session: { phase: keyof typeof statusLabels; outcome?: string | null }) {
  if (session.outcome === "UNSTARTED") return "未正常开播";
  if (isInterrupted(session.outcome ?? null)) return `${statusLabels[session.phase]} · ${endKinds[endKindForOutcome(session.outcome ?? null)]}`;
  return statusLabels[session.phase];
}

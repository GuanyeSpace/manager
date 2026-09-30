"use client";
import { useState } from "react";
import type { ResourceOptions } from "@/modules/resources/data";
import { carriers, moneyLabel, numberStatuses, type ResourceInput } from "@/modules/resources/schema";
const control = "w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-sm";
type Props = { initial?: ResourceInput; options: ResourceOptions; branchId: string };
export function NumberBasicFields({ initial, options, branchId }: Props) {
  const [cardType, setCardType] = useState<string>(initial?.cardType ?? "MAIN");
  const [mainCardId, setMainCardId] = useState(initial?.mainCardId ?? "");
  const main = options.numbers.find(n => n.id === mainCardId && n.branchId === branchId);
  return <>
    <label className="space-y-2 text-sm"><span>运营商</span><select name="carrier" defaultValue={initial?.carrier ?? ""} className={control}><option value="">请选择</option>{initial?.carrier && !carriers.some(c => c === initial.carrier) && <option value={initial.carrier}>{initial.carrier}（原登记值）</option>}{carriers.map(c => <option key={c}>{c}</option>)}</select></label>
    <label className="space-y-2 text-sm"><span>主 / 副卡</span><select name="cardType" value={cardType} onChange={e => setCardType(e.target.value)} className={control}>{initial && !initial.cardType && <option value="">待确认（原资料未登记）</option>}<option value="MAIN">主卡</option><option value="SECONDARY">副卡</option></select></label>
    {cardType === "SECONDARY" && <label className="space-y-2 text-sm"><span>所属主卡 *</span><select name="mainCardId" required value={main?.id ?? ""} onChange={e => setMainCardId(e.target.value)} className={control}><option value="">请选择主卡</option>{options.numbers.filter(n => n.branchId === branchId && n.id !== initial?.id && n.cardType === "MAIN" && (n.status !== "CANCELLED" || n.id === initial?.mainCardId)).map(n => <option key={n.id} value={n.id}>{n.number}</option>)}</select></label>}
    {cardType === "SECONDARY" ? <div className="rounded-lg bg-muted/50 p-3 text-sm"><p>共用主卡套餐：{main ? moneyLabel(main.monthlyFeeCents) : "请选择主卡"} / 月</p><p className="mt-1">套餐流量：{main?.dataGb ? `${main.dataGb} G` : "未登记"}</p><p className="mt-2 text-xs text-muted-foreground">套餐只在主卡维护，主卡更新后副卡同步显示。</p></div> : <>{[["monthlyFee", "每月套餐费（元）", "21474836.47"], ["dataGb", "套餐流量（G）", "99999999.99"]].map(([key, label, max]) => <label key={key} className="space-y-2 text-sm"><span>{label}</span><input name={key} type="number" min="0" max={max} step="0.01" defaultValue={initial?.[key as "monthlyFee" | "dataGb"] ?? ""} className={control} /></label>)}</>}
    <label className="space-y-2 text-sm"><span>状态</span><select name="status" defaultValue={initial?.status || "NORMAL"} className={control}>{Object.entries(numberStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {initial?.plan && <label className="space-y-2 text-sm"><span>原套餐说明（保留）</span><input name="plan" maxLength={300} defaultValue={initial.plan} className={control} /></label>}
  </>;
}
export function NumberPlacement({ initial, options, branchId }: Props) {
  const [deviceId, setDeviceId] = useState(initial?.branchId === branchId ? initial.phoneDeviceId : "");
  const [slot, setSlot] = useState<string>(initial?.phoneSlot ?? "");
  const device = options.phones.find(p => p.id === deviceId);
  return <><label className="space-y-2 text-sm"><span>所在手机</span><select name="phoneDeviceId" value={deviceId} onChange={e => { setDeviceId(e.target.value); setSlot(""); }} className={control}><option value="">暂未放入手机</option><option value="other">其他（未编号 / 个人手机）</option>{options.phones.filter(p => p.branchId === branchId && (p.active || p.id === initial?.phoneDeviceId)).map(p => <option key={p.id} value={p.id}>{p.code}</option>)}</select></label>
    {deviceId === "other" ? <label className="space-y-2 text-sm"><span>其他手机说明 *</span><input name="otherPhone" required maxLength={300} placeholder="例如：张三的个人手机" defaultValue={initial?.otherPhone ?? ""} className={control} /></label> : device && <label className="space-y-2 text-sm"><span>所在卡槽 *</span><select name="phoneSlot" required value={slot} onChange={e => setSlot(e.target.value)} className={control}><option value="">请选择</option>{[1, 2].map(n => { const occupied = device.slots.find(s => s.slot === n && s.phoneNumberId !== initial?.id); return <option key={n} value={n} disabled={!!occupied}>卡槽 {n}{occupied ? "（已占用）" : ""}</option>; })}</select></label>}
  </>;
}

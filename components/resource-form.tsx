"use client";
import { NavigationFields } from "@/components/context-link";
import { hasRole } from "@/lib/auth/roles";
import { startTransition, useActionState, useState } from "react";
import { NumberBasicFields, NumberPlacement } from "@/components/number-fields";
import { Role } from "@/app/generated/prisma/enums";
import { canFillAccountDuty } from "@/lib/auth/account-permissions";
import { saveResourceAction } from "@/modules/resources/actions";
import { itemCodes, moneyLabel, toCents, resourceLabels, resourceSchema, type ResourceKind, type ResourceInput } from "@/modules/resources/schema";
import type { ResourceOptions } from "@/modules/resources/data";
const control = "w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-sm";
export function ResourceForm({ kind, options, initial }: { kind: ResourceKind; options: ResourceOptions; initial?: ResourceInput }) {
  const [state, action, pending] = useActionState(saveResourceAction, undefined);
  const [error, setError] = useState("");
  const [branchId, setBranchId] = useState(initial?.branchId ?? options.branches[0]?.id ?? "");
  const [roomId, setRoomId] = useState(initial?.roomId ?? "");
  const [operatorId, setOperatorId] = useState(initial?.operatorId ?? "");
  const [controllerId, setControllerId] = useState(initial?.controllerId ?? "");
  const [registration, setRegistration] = useState("individual");
  const [code, setCode] = useState(initial?.code ?? "");
  const [quantity, setQuantity] = useState(kind === "phones" ? "1" : initial?.quantity ?? "1");
  const [purchaseUnitPrice, setPurchaseUnitPrice] = useState(initial?.purchaseUnitPrice ?? "");
  const [currentUnitValue, setCurrentUnitValue] = useState(initial?.currentUnitValue ?? "");
  function total(value: string) { return /^\d+(\.\d{1,2})?$/.test(value) && /^[1-9]\d*$/.test(quantity) ? moneyLabel(toCents(value)! * Number(quantity)) : "未登记"; }
  const people = options.people.filter(p => p.branchId === branchId || hasRole(p, Role.BOSS));
  function field(key: keyof ResourceInput, label: string, required = false, maxLength = 200) {
    return <label key={key} className="block space-y-2 text-sm"><span>{label}{required ? " *" : ""}</span><input name={key} required={required} defaultValue={key === "code" ? undefined : String(initial?.[key] ?? "")} value={key === "code" ? code : undefined} onChange={key === "code" ? e => setCode(e.target.value) : undefined} readOnly={key === "code" && initial?.individual} maxLength={maxLength} className={control} /></label>;
  }
  function personSelect(key: "operatorId" | "controllerId" | "userId", label: string, role?: Role) {
    const value = key === "operatorId" ? operatorId : key === "controllerId" ? controllerId : undefined;
    return <label className="space-y-2 text-sm"><span>{label}</span><select name={key} className={control} value={value} defaultValue={key === "userId" && initial?.branchId === branchId ? initial.userId : undefined} onChange={key === "userId" ? undefined : e => (key === "operatorId" ? setOperatorId : setControllerId)(e.target.value)}><option value="">暂未分配</option>{people.filter(p => !role || canFillAccountDuty(p, branchId, role)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>;
  }
  return <form className="space-y-6" onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const result = resourceSchema.safeParse({ ...Object.fromEntries(data), anchorIds: data.getAll("anchorIds"), ...(kind === "phones" ? { loginAccountIds: data.getAll("loginAccountIds") } : {}) });
    setError(result.success ? "" : result.error.issues[0]?.message ?? "请检查填写内容");
    if (result.success) startTransition(() => action(data));
  }}>
    <NavigationFields /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={initial?.id ?? ""} /><input type="hidden" name="version" value={initial?.version ?? 0} />
    {kind === "materials" && !initial && <section className="space-y-3 rounded-xl border p-5"><h2 className="font-semibold">登记方式</h2><label className="flex gap-2 text-sm"><input type="radio" name="registration" value="individual" checked={registration === "individual"} onChange={() => setRegistration("individual")} />逐件建档（一物一码，适合贴标签和分别领用）</label><label className="flex gap-2 text-sm"><input type="radio" name="registration" value="batch" checked={registration === "batch"} onChange={() => setRegistration("batch")} />按数量登记（同一位置、同一使用人共用一个批次编号）</label><p className="text-xs text-muted-foreground">逐件建档每次最多 100 件，共同信息先统一填写，保存后分别调整归属。数量大于 1 时，输入的编号作为来源批次编号，系统追加序号生成单件编号。</p>{registration === "individual" && code && Number(quantity) >= 1 && Number(quantity) <= 100 && <p className="break-words text-sm">将生成：{Number(quantity) === 1 ? code : itemCodes(code, Number(quantity)).join("、")}</p>}</section>}
    <section className="space-y-4 rounded-xl border p-5"><h2 className="font-semibold">基本信息</h2><div className="grid gap-4 md:grid-cols-2">
      {kind === "rooms" ? <>{field("name", "直播间名称", true, 100)}{field("location", "位置", false, 300)}</> : kind === "numbers" ? <>
        {field("number", "手机号码", true, 30)}{field("openedBy", "开户人", false, 100)}<NumberBasicFields initial={initial} options={options} branchId={branchId} />
      </> : <>{field("code", `${resourceLabels[kind]}编号`, true, 100)}{field("model", kind === "materials" ? "物资名称 / 规格" : `${resourceLabels[kind]}型号`, true)}{kind !== "phones" && field("category", kind === "materials" ? "物资类型（家具 / 插排等）" : "设备类型（电脑 / 摄像头等）", true, 100)}{field("serialNumber", kind === "phones" ? "序列号 / IMEI（选填）" : "序列号（选填）", false, 100)}</>}
      {kind !== "rooms" && kind !== "numbers" && field("purpose", "用途", false, 500)}
      {kind !== "numbers" && <label className="space-y-2 text-sm"><span>状态</span><select name="active" defaultValue={initial?.active ?? "true"} className={control}><option value="true">启用</option><option value="false">停用</option></select></label>}
    </div></section>
    {kind !== "rooms" && kind !== "numbers" && <section className="space-y-4 rounded-xl border p-5"><h2 className="font-semibold">数量与资产价值</h2><p className="text-xs leading-5 text-muted-foreground">金额单位为元，估值按单件填写；总额 = 数量 × 单价。金额留空表示未登记。相同规格、单价与归属可按批登记，不同使用人或位置请分开登记。手机一机一档。</p><div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-2 text-sm"><span>数量{!initial ? " *" : ""}</span><input name="quantity" type="number" min="1" max={kind === "materials" && !initial && registration === "individual" ? 100 : 1000000} step="1" required={!initial} readOnly={kind === "phones" || initial?.individual} value={quantity} onChange={e => setQuantity(e.target.value)} className={control} /></label>
      <label className="space-y-2 text-sm"><span>计量单位</span><input name="unit" maxLength={20} readOnly={kind === "phones"} defaultValue={kind === "phones" ? "台" : initial?.unit || "件"} className={control} /></label>
      <label className="space-y-2 text-sm"><span>购入日期（选填）</span><input name="purchaseDate" type="date" defaultValue={initial?.purchaseDate ?? ""} className={control} /></label>
      <label className="space-y-2 text-sm"><span>购入单价（元，选填）</span><input name="purchaseUnitPrice" type="number" min="0" max="21474836.47" step="0.01" value={purchaseUnitPrice} onChange={e => setPurchaseUnitPrice(e.target.value)} className={control} /></label>
      <label className="space-y-2 text-sm"><span>当前单件估值（元，选填）</span><input name="currentUnitValue" type="number" min="0" max="21474836.47" step="0.01" value={currentUnitValue} onChange={e => setCurrentUnitValue(e.target.value)} className={control} /></label>
      <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm"><p>购入总额：{total(purchaseUnitPrice)}</p><p>当前估值总额：{total(currentUnitValue)}</p></div>
    </div></section>}
    <section className="space-y-4 rounded-xl border p-5"><h2 className="font-semibold">归属与人员</h2><div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-2 text-sm"><span>所属分公司 *</span><select name="branchId" required value={branchId} className={control} onChange={e => { setBranchId(e.target.value); setRoomId(""); setOperatorId(""); setControllerId(""); }}><option value="" disabled>请选择分公司</option>{options.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      {kind !== "rooms" && <label className="space-y-2 text-sm"><span>所属直播间</span><select name="roomId" value={roomId} className={control} onChange={e => { const room = options.rooms.find(r => r.id === e.target.value); setRoomId(e.target.value); if (room) { setOperatorId(room.operatorId ?? ""); setControllerId(room.controllerId ?? ""); } }}><option value="">暂未分配</option>{options.rooms.filter(r => r.branchId === branchId).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
      {personSelect("operatorId", "所属运营", Role.OPERATOR)}{personSelect("controllerId", "所属直播中控", Role.CONTROLLER)}
      {kind !== "rooms" && <div key={`user-${branchId}`}>{personSelect("userId", "使用人")}</div>}
      {kind === "numbers" && <NumberPlacement key={`placement-${branchId}`} initial={initial} options={options} branchId={branchId} />}
    </div><p className="text-xs text-muted-foreground">分公司必填，其余可暂未分配。选择直播间会带入运营和直播中控，可按实际使用情况调整。</p>
    {kind === "rooms" && <fieldset key={branchId} className="space-y-3"><legend className="mb-2 text-sm font-medium">使用此直播间的主播（可多选）</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{people.filter(p => canFillAccountDuty(p, branchId, Role.ANCHOR)).map(p => <label key={p.id} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" name="anchorIds" value={p.id} defaultChecked={initial?.branchId === branchId && initial.anchorIds.includes(p.id)} />{p.name}</label>)}</div><p className="text-xs text-muted-foreground">主播来自员工档案，老板可兼任。新增主播请到主播管理。</p></fieldset>}
    </section>
    {kind === "numbers" && <section className="space-y-4 rounded-xl border p-5"><h2 className="font-semibold">绑定账号管理</h2><div className="grid gap-4 md:grid-cols-2"><label className="block space-y-2 text-sm"><span>绑定抖音号（选填）</span><select key={`account-${branchId}`} name="accountId" defaultValue={initial?.branchId === branchId ? initial.accountId : ""} className={control}><option value="">不绑定</option>{options.accounts.filter(a => a.branchId === branchId && (!a.phoneNumberId || a.phoneNumberId === initial?.id)).map(a => <option key={a.id} value={a.id}>{a.name} · {a.douyinId}</option>)}</select></label>{field("wechat", "绑定微信号", false, 100)}{field("xiaohongshu", "绑定小红书", false, 100)}{field("kuaishou", "绑定快手号", false, 100)}{field("purpose", "其他用途", false, 500)}</div><p className="mt-3 text-xs text-muted-foreground">与抖音账号管理共用同一绑定关系，修改后两处同步显示。</p></section>}
    {kind === "phones" && <section key={`slots-${branchId}`} className="space-y-4 rounded-xl border p-5"><h2 className="font-semibold">手机卡槽</h2><div className="grid gap-4 md:grid-cols-2">{(["sim1", "sim2"] as const).map((key, i) => <label key={key} className="space-y-2 text-sm"><span>卡槽 {i + 1} · 手机号</span><select name={key} defaultValue={initial?.branchId === branchId ? initial[key] : ""} className={control}><option value="">空卡槽</option>{options.numbers.filter(n => n.branchId === branchId && (!n.slot || n.slot.deviceId === initial?.id)).map(n => <option key={n.id} value={n.id}>{n.number}</option>)}</select></label>)}</div><p className="text-xs text-muted-foreground">手机号需先建档。同一号码只能放入一个卡槽，换机前请先从原手机移出。</p></section>}
    {kind === "phones" && <section key={`logins-${branchId}`} className="space-y-4 rounded-xl border p-5"><h2 className="font-semibold">实际登录账号</h2><p className="text-xs text-muted-foreground">按实际使用情况登记，与手机卡绑定账号独立；更换手机卡不会改变此处记录。</p><fieldset><legend className="mb-3 text-sm">登录抖音号（可多选）</legend><div className="grid max-h-64 gap-2 overflow-y-auto md:grid-cols-2">{options.accounts.filter(a => a.branchId === branchId).map(a => <label key={a.id} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" name="loginAccountIds" value={a.id} defaultChecked={initial?.branchId === branchId && initial.loginAccountIds?.includes(a.id)} />{a.name} · {a.douyinId}</label>)}</div></fieldset><label className="block space-y-2 text-sm"><span>登录微信号（每行一个）</span><textarea name="loginWechats" rows={3} maxLength={2000} defaultValue={initial?.branchId === branchId ? initial.loginWechats ?? "" : ""} className={control} /></label></section>}
    <label className="block space-y-2 text-sm"><span>备注</span><textarea name="notes" rows={4} maxLength={2000} defaultValue={initial?.notes ?? ""} className={control} /></label>
    {(error || state?.error) && <p role="alert" className="text-sm text-destructive">{error || state?.error}</p>}
    <button disabled={pending || !options.branches.length} className="rounded-lg bg-primary px-6 py-3 text-sm text-primary-foreground">{pending ? "保存中…" : `保存${resourceLabels[kind]}`}</button>
  </form>;
}

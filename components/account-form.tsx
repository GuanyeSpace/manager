"use client";
import { NavigationFields } from "@/components/context-link";

import { startTransition, useActionState, useState } from "react";
import { Role } from "@/app/generated/prisma/enums";
import { canFillAccountDuty, type AccountActor } from "@/lib/auth/account-permissions";
import { accountSchema, type AccountInput, type AccountFormState } from "@/modules/accounts/schema";
import { saveAccountAction } from "@/modules/accounts/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";
const fields = [
  ["douyinId", "抖音号", 100], ["name", "账号名称", 100], ["homepageUrl", "主页链接（选填）", 500],
  ["realName", "实名人（选填）", 100], ["purpose", "用途（选填）", 200],
] as const;

export function AccountForm({ initial, branches, people, rooms, numbers, externalAnchors = [] }: {
  initial?: AccountInput;
  externalAnchors?: {id:string;name:string;branchId:string;active:boolean}[];
  rooms: { id: string; name: string; branchId: string }[];
  numbers: { id: string; number: string; branchId: string; account: { id: string } | null }[];
  branches: { id: string; name: string }[];
  people: (AccountActor & { name: string })[];
}) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(saveAccountAction, undefined);
  const [clientErrors, setClientErrors] = useState<Record<string, string[] | undefined>>({});
  const [branchId, setBranchId] = useState(initial?.branchId ?? branches[0]?.id ?? "");
  const [status, setStatus] = useState(initial?.active ?? "true");
  const errors = { ...state?.fieldErrors, ...clientErrors };
  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const result = accountSchema.safeParse(Object.fromEntries(data));
      setClientErrors(result.success ? {} : result.error.flatten().fieldErrors);
      if (result.success) startTransition(() => action(data));
    }} className="flex max-w-2xl flex-col gap-4">
      <NavigationFields /><input type="hidden" name="id" value={initial?.id ?? ""} />
      <input type="hidden" name="version" value={initial?.version ?? 0} />
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(([name, label, maxLength]) => <div className="flex flex-col gap-2" key={name}>
          <Label htmlFor={name}>{label}</Label>
          <Input id={name} name={name} defaultValue={initial?.[name] ?? ""} maxLength={maxLength} required={name === "name" || name === "douyinId"} />
          {errors[name]?.[0] && <p className="text-sm text-destructive">{errors[name]?.[0]}</p>}
        </div>)}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="branchId">所属分公司</Label>
        <select id="branchId" name="branchId" value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectClass} required>
          <option value="" disabled>请选择</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {initial && branchId !== initial.branchId && <p className="text-sm text-amber-700">这是跨公司调拨，请重新确认接收公司的运营、直播中控和主播。旧负责人只保留此前历史的查看权限。</p>}
      </div>
      <div key={`resources-${branchId}`} className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm"><span>所属直播间</span><select name="roomId" className={selectClass} defaultValue={branchId === initial?.branchId ? initial?.roomId ?? "" : ""}><option value="">暂未分配</option>{rooms.filter(r => r.branchId === branchId).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label className="space-y-2 text-sm"><span>绑定手机号档案</span><select name="phoneNumberId" className={selectClass} defaultValue={branchId === initial?.branchId ? initial?.phoneNumberId ?? "" : ""}><option value="">暂不关联</option>{numbers.filter(n => n.branchId === branchId && (!n.account || n.account.id === initial?.id)).map(n => <option key={n.id} value={n.id}>{n.number}</option>)}</select></label>
      </div>
      <input type="hidden" name="phone" value={initial?.phoneNumberId ? "" : initial?.phone ?? ""} />
      {initial?.phone && !initial.phoneNumberId && <p className="text-xs text-muted-foreground">原登记号码：{initial.phone}。可在手机号管理中建档，再选择关联。</p>}
      <p className="text-xs text-muted-foreground">请先在手机号管理中登记号码；关联后可从账号表点击号码查看详情。</p>
      <div key={branchId} className="grid gap-4 sm:grid-cols-3">
        {([
          ["operatorId", "运营（可不选）", Role.OPERATOR],
          ["controllerId", "直播中控（可不选）", Role.CONTROLLER],
          ["anchorId", "主播（可不选）", Role.ANCHOR],
        ] as const).map(([key, label, role]) => <div key={key} className="flex flex-col gap-2">
          <Label htmlFor={key}>{label}</Label>
          <select id={key} name={key} className={selectClass}
            defaultValue={branchId === initial?.branchId ? initial[key] : ""}>
            <option value="">无</option>
            {people.filter((p) => canFillAccountDuty(p, branchId, role)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {errors[key]?.[0] && <p className="text-sm text-destructive">{errors[key]?.[0]}</p>}
        </div>)}
      </div>
      <label className="space-y-2 text-sm" key={`external-${branchId}`}>外部主播（与员工主播二选一）<select name="externalAnchorId" className={selectClass} defaultValue={branchId === initial?.branchId ? initial.externalAnchorId ?? "" : ""}><option value="">无</option>{externalAnchors.filter(a=>a.branchId===branchId&&(a.active||a.id===initial?.externalAnchorId)).map(a=><option key={a.id} value={a.id}>{a.name}（外部{a.active?"":" / 已停用"}）</option>)}</select></label>
      <p className="text-xs text-muted-foreground">每项职责限一人；老板可兼任。人员交接会保留此前的归属记录。</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">备注（选填）</Label>
        <textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} maxLength={2000} rows={3} className="rounded-lg border p-3 text-sm" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="active">账号状态</Label>
        <select id="active" name="active" value={status} onChange={e => setStatus(e.target.value as AccountInput["active"])} className={selectClass}>
          <option value="true">启用</option><option value="false">停用</option><option value="banned">封禁</option>
        </select>
      </div>
      {status === "banned" && <div className="flex flex-col gap-2">
        <Label htmlFor="unbanDate">预计解封日期（选填）</Label>
        <Input id="unbanDate" name="unbanDate" type="date" defaultValue={initial?.unbanDate ?? ""} min="0001-01-01" max="9999-12-31" />
        {errors.unbanDate?.[0] && <p className="text-sm text-destructive">{errors.unbanDate[0]}</p>}
        <p className="text-xs text-muted-foreground">未知日期可留空。封禁期间不能准备或开播；到期后确认账号已解封，再手动改为启用。</p>
      </div>}
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button disabled={pending || !branches.length} type="submit">{pending ? "保存中…" : initial ? "保存变更" : "创建账号"}</Button>
    </form>
  );
}

"use client";
import { startTransition, useActionState, useState } from "react";
import { saveProfileAction } from "@/modules/profile/actions";
export function ProfileForm({ profile }: { profile: { nickname: string; contactPhone: string; profileVersion: number } }) {
  const [state, action, pending] = useActionState(saveProfileAction, undefined);
  const [initialVersion] = useState(profile.profileVersion);
  return <form className="max-w-xl space-y-4 rounded-xl border bg-white p-5" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); startTransition(() => action(form));
  }}>
    <input type="hidden" name="version" value={state?.version ?? initialVersion} />
    <label className="block space-y-2 text-sm"><span>昵称（选填）</span><input name="nickname" defaultValue={profile.nickname} maxLength={50} className="w-full rounded-lg border px-3 py-2" /></label>
    <label className="block space-y-2 text-sm"><span>联系电话（选填）</span><input name="contactPhone" type="tel" defaultValue={profile.contactPhone} maxLength={30} className="w-full rounded-lg border px-3 py-2" /></label>
    <p className="text-xs text-muted-foreground">昵称不改变员工姓名、岗位或历史工作记录。</p>
    {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {state?.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}
    <button disabled={pending} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-50">{pending ? "保存中…" : "保存个人资料"}</button>
  </form>;
}

import { Role } from "@/app/generated/prisma/enums";
import { ROLE_LABELS } from "@/lib/auth/role-labels";
export function UserRoleFields({ initial = [], error }: { initial?: Role[]; error?: string }) {
  return <fieldset className="space-y-2"><legend className="text-sm font-medium">岗位（可多选）</legend><div className="grid grid-cols-2 gap-3">{Object.values(Role).map(role => <label key={role} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" name="roles" value={role} defaultChecked={initial.includes(role)} />{ROLE_LABELS[role]}</label>)}</div><p className="text-xs text-muted-foreground">至少选择一个岗位。同一登录账号可切换相应工作台。</p>{error && <p className="text-sm text-destructive">{error}</p>}</fieldset>;
}

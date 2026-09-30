// 日期只展示平台预计日期，不把到期视为已经恢复。
export function accountStatusLabel(account: { active: boolean; banned: boolean; unbanDate: string | null }): string {
  if (!account.banned) return account.active ? "启用" : "停用";
  return `封禁 · ${account.unbanDate ? `预计 ${account.unbanDate} 解封` : "解封日期待定"}`;
}

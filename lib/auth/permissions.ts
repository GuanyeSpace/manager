import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";

// 页面级访问控制。所有需要登录的页面，第一行都调用这两个函数，
// 绝不在页面里自己写「读 cookie / 查用户 / 判断 redirect」的逻辑。

// 第 1 步：必须登录。未登录 → 登录页。返回当前用户，供后续岗位/能力检查使用。
export async function requirePageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// 第 2 步：强制改密。mustChangePassword=true 的用户只允许待在改密页。
// 改密页自身不调用本函数，其余每个受保护页面都要调用。
export async function requirePasswordChanged(user: CurrentUser): Promise<void> {
  if (user.mustChangePassword) redirect("/change-password");
}

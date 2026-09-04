import { redirect } from "next/navigation";
import { requirePageUser, requirePasswordChanged, getWorkbenchPath } from "@/lib/auth/permissions";

// 首页只做一件事：把已登录用户送到自己的岗位工作台。
export default async function HomePage() {
  const user = await requirePageUser();
  await requirePasswordChanged(user);
  redirect(getWorkbenchPath(user));
}

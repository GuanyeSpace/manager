import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  // 已登录用户访问登录页：直接送回工作台；需要改密的先送去改密页。
  // 这里查数据库判断，不依赖 proxy 拦截（proxy 只做粗筛，不是安全边界）。
  const user = await getCurrentUser();
  if (user) {
    redirect(user.mustChangePassword ? "/change-password" : "/");
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 p-4">
      <LoginForm />
    </main>
  );
}

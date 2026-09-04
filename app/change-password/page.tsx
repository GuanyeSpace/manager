import { requirePageUser } from "@/lib/auth/permissions";
import { ChangePasswordForm } from "@/components/change-password-form";

// 改密页：已登录即可访问（首次强制改密 + 以后自愿改密共用）。
// 故意不调用 requirePasswordChanged——本页就是被强制跳转的目标页。
export default async function ChangePasswordPage() {
  const user = await requirePageUser();

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 p-4">
      <ChangePasswordForm forced={user.mustChangePassword} />
    </main>
  );
}

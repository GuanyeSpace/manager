import { requireControllerPage } from "@/lib/auth/permissions";
import { ControllerShell } from "@/components/controller-shell";
import { ProfileForm } from "@/components/profile-form";
import { ChangePasswordForm } from "@/components/change-password-form";
import { prisma } from "@/lib/db";
export default async function ProfilePage() {
  const user = await requireControllerPage();
  const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { nickname: true, contactPhone: true, profileVersion: true } });
  return <ControllerShell name={user.name}><h1 className="text-2xl font-semibold">个人资料</h1><p className="text-sm text-muted-foreground">员工姓名：{user.name} · 登录账号：{user.username}</p><ProfileForm profile={profile} /><ChangePasswordForm forced={false} /></ControllerShell>;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBossPage } from "@/lib/auth/permissions";
import { getUserById } from "@/modules/users/queries";
import { listBranches } from "@/modules/branches/queries";
import { ROLE_LABELS } from "@/lib/auth/role-labels";
import { formatDateTime } from "@/lib/datetime";
import { EmploymentStatus, BranchStatus } from "@/app/generated/prisma/enums";
import { EditUserForm } from "@/components/edit-user-form";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { EmploymentStatusForm } from "@/components/employment-status-form";
import { LogoutButton } from "@/components/logout-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function UserDetailPage({ params }: PageProps<"/boss/users/[id]">) {
  const actor = await requireBossPage();
  const { id } = await params;
  const target = await getUserById(actor, id);
  if (!target) {
    notFound();
  }
  const branches = await listBranches(actor);
  // 编辑表单的候选分公司：启用中的 + 该用户当前所属的（即使已停用，保证编辑不卡死）
  const branchOptions = branches
    .filter((b) => b.status === BranchStatus.ACTIVE || b.id === target.branchId)
    .map((b) => ({
      id: b.id,
      name: b.status === BranchStatus.INACTIVE ? `${b.name}（已停用）` : b.name,
    }));

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-4">
          <Link
            href="/boss/users"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← 返回用户列表
          </Link>
          <h1 className="text-2xl font-semibold">{target.name}</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{actor.name}</span>
          <LogoutButton />
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
          <CardDescription>
            用户名是登录标识，创建后不可修改；系统不提供删除用户功能
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p>
            用户名：<span className="font-medium">{target.username}</span>
          </p>
          <p>
            岗位：{ROLE_LABELS[target.role]} · 所属分公司：{target.branch?.name ?? "—"}
          </p>
          <p>
            在职状态：
            {target.employmentStatus === EmploymentStatus.ACTIVE ? "在职" : "已离职"}
          </p>
          <p className="text-muted-foreground">
            最后登录：{target.lastLoginAt ? formatDateTime(target.lastLoginAt) : "—"} · 创建于{" "}
            {formatDateTime(target.createdAt)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>编辑资料</CardTitle>
          <CardDescription>可修改：姓名、岗位、所属分公司</CardDescription>
        </CardHeader>
        <CardContent>
          <EditUserForm
            userId={target.id}
            initialName={target.name}
            initialRole={target.role}
            initialBranchId={target.branchId}
            branches={branchOptions}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>重置密码</CardTitle>
          <CardDescription>
            重置后该用户所有会话立即失效，需用新密码重新登录，并强制修改一次密码
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm userId={target.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>在职状态</CardTitle>
          <CardDescription>
            设为离职后立即不能登录，其所有会话被删除；可以随时复职
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmploymentStatusForm userId={target.id} currentStatus={target.employmentStatus} />
        </CardContent>
      </Card>
    </main>
  );
}

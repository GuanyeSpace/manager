import Link from "next/link";
import { requireBossPage } from "@/lib/auth/permissions";
import { listBranches } from "@/modules/branches/queries";
import { BranchStatus } from "@/app/generated/prisma/enums";
import { CreateUserForm } from "@/components/create-user-form";
import { LogoutButton } from "@/components/logout-button";

export default async function NewUserPage() {
  const actor = await requireBossPage();
  const branches = await listBranches(actor);
  // 停用的分公司不得被选中（需求明确）
  const activeBranches = branches
    .filter((b) => b.status === BranchStatus.ACTIVE)
    .map((b) => ({ id: b.id, name: b.name }));

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
          <h1 className="text-2xl font-semibold">新增用户</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{actor.name}</span>
          <LogoutButton />
        </div>
      </header>

      <CreateUserForm branches={activeBranches} />
    </main>
  );
}

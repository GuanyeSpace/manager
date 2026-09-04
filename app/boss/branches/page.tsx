import Link from "next/link";
import { requireBossPage } from "@/lib/auth/permissions";
import { listBranches } from "@/modules/branches/queries";
import { toggleBranchAction } from "@/modules/branches/actions";
import { formatDateTime } from "@/lib/datetime";
import { BranchStatus } from "@/app/generated/prisma/enums";
import { CreateBranchForm } from "@/components/create-branch-form";
import { BranchRenameDialog } from "@/components/branch-rename-dialog";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";

export default async function BranchesPage() {
  const user = await requireBossPage();
  const branches = await listBranches(user);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-4">
          <Link
            href="/boss"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← 返回工作台
          </Link>
          <h1 className="text-2xl font-semibold">分公司管理</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{user.name}</span>
          <LogoutButton />
        </div>
      </header>

      <CreateBranchForm />

      <section className="flex flex-col gap-2">
        {branches.map((branch) => (
          <div
            key={branch.id}
            className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-1">
              <span className="font-medium">{branch.name}</span>
              <span className="text-xs text-muted-foreground">
                {branch.status === BranchStatus.ACTIVE ? "启用中" : "已停用"} · 创建于{" "}
                {formatDateTime(branch.createdAt)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <BranchRenameDialog branchId={branch.id} currentName={branch.name} />
              <form action={toggleBranchAction}>
                <input type="hidden" name="branchId" value={branch.id} />
                <Button variant="outline" size="sm" type="submit">
                  {branch.status === BranchStatus.ACTIVE ? "停用" : "启用"}
                </Button>
              </form>
            </div>
          </div>
        ))}
        {branches.length === 0 && <p className="text-muted-foreground">还没有分公司</p>}
      </section>
    </main>
  );
}

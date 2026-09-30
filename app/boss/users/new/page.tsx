import { ReturnLink } from "@/components/context-link";
import { requireBossPage } from "@/lib/auth/permissions";
import { listBranches } from "@/modules/branches/queries";
import { BranchStatus, Role } from "@/app/generated/prisma/enums";
import { CreateUserForm } from "@/components/create-user-form";

export default async function NewUserPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const actor = await requireBossPage();
  const anchor = (await searchParams).role === "ANCHOR";
  const branches = await listBranches(actor);
  // 停用的分公司不得被选中（需求明确）
  const activeBranches = branches
    .filter((b) => b.status === BranchStatus.ACTIVE)
    .map((b) => ({ id: b.id, name: b.name }));

  return (
    <main className="flex flex-1 flex-col gap-6">
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-4">
          <ReturnLink fallback={anchor ? "/resources/anchors" : "/boss/users"} label="返回列表" />
          <h1 className="text-2xl font-semibold">{anchor ? "新增主播" : "新增用户"}</h1>
        </div>
      </header>

      <CreateUserForm defaultRole={anchor ? Role.ANCHOR : undefined} branches={activeBranches} />
    </main>
  );
}

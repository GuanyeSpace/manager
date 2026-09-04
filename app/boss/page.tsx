import Link from "next/link";
import { requireBossPage } from "@/lib/auth/permissions";
import { LogoutButton } from "@/components/logout-button";

// 老板工作台（空壳）：只放导航。用户管理与分公司管理页面在后续 commit 补齐。
export default async function BossPage() {
  const user = await requireBossPage();

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">老板工作台</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{user.name}</span>
          <LogoutButton />
        </div>
      </header>

      <nav className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/boss/users"
          className="rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted"
        >
          用户管理
        </Link>
        <Link
          href="/boss/branches"
          className="rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted"
        >
          分公司管理
        </Link>
      </nav>
    </main>
  );
}

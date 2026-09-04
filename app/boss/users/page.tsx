import Link from "next/link";
import { requireBossPage } from "@/lib/auth/permissions";
import { listUsers } from "@/modules/users/queries";
import { listBranches } from "@/modules/branches/queries";
import { usersFilterSchema } from "@/modules/users/schema";
import { ROLE_LABELS } from "@/lib/auth/role-labels";
import { formatDateTime } from "@/lib/datetime";
import { Role, EmploymentStatus } from "@/app/generated/prisma/enums";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm";

export default async function UsersPage({ searchParams }: PageProps<"/boss/users">) {
  const actor = await requireBossPage();
  const sp = await searchParams;
  const filters = usersFilterSchema.parse(sp);
  const [users, branches] = await Promise.all([listUsers(actor, filters), listBranches(actor)]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-4">
          <Link href="/boss" className="text-sm text-muted-foreground hover:text-foreground">
            ← 返回工作台
          </Link>
          <h1 className="text-2xl font-semibold">用户管理</h1>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/boss/users/new">
            <Button>新增用户</Button>
          </Link>
          <span className="text-sm text-muted-foreground">{actor.name}</span>
          <LogoutButton />
        </div>
      </header>

      <form method="GET" action="/boss/users" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="q">
            搜索（姓名或用户名）
          </label>
          <input
            id="q"
            name="q"
            defaultValue={filters.q}
            placeholder="输入关键字"
            className="h-8 w-44 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="role">
            岗位
          </label>
          <select id="role" name="role" defaultValue={filters.role} className={selectClass}>
            <option value="ALL">全部岗位</option>
            {Object.values(Role).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="branchId">
            分公司
          </label>
          <select
            id="branchId"
            name="branchId"
            defaultValue={filters.branchId}
            className={selectClass}
          >
            <option value="ALL">全部分公司</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="status">
            在职状态
          </label>
          <select id="status" name="status" defaultValue={filters.status} className={selectClass}>
            <option value="ACTIVE">在职</option>
            <option value="RESIGNED">离职</option>
            <option value="ALL">全部</option>
          </select>
        </div>
        <Button type="submit" variant="secondary">
          筛选
        </Button>
        <Link
          href="/boss/users"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          清除筛选
        </Link>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>用户名</TableHead>
              <TableHead>岗位</TableHead>
              <TableHead>所属分公司</TableHead>
              <TableHead>在职状态</TableHead>
              <TableHead>最后登录时间</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell>{u.username}</TableCell>
                <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                <TableCell>{u.branch?.name ?? "—"}</TableCell>
                <TableCell>
                  {u.employmentStatus === EmploymentStatus.ACTIVE ? (
                    <span className="text-emerald-600">在职</span>
                  ) : (
                    <span className="text-muted-foreground">已离职</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—"}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/boss/users/${u.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    查看/编辑
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  没有符合条件的用户
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}

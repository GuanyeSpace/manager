import { requireReadAccountActor } from "@/lib/auth/read-actor";
import { deviceScope, numberScope } from "@/lib/auth/resource-permissions";
import { anchorKey } from "@/lib/anchor-identity";
import { roleWhere } from "@/lib/auth/roles";
import type { Prisma } from "@/app/generated/prisma/client";
import { canManageAccountBranch, isAccountBoss } from "@/lib/auth/account-permissions";
import { currentAccountScope, historicalAccountScope } from "./service";

export type AccountListFilters = { controllerId?: string; anchorId?: string; status?: string };

// 调用方使用 RepeatableRead：权限与读取内容来自同一快照，防止交接期间混入新资料。
export async function readAccountList(tx: Prisma.TransactionClient, token: string, q = "", filters: AccountListFilters = {}) {
  const actor = await requireReadAccountActor(tx, token);
  const accounts = await tx.douyinAccount.findMany({
    where: { AND: [currentAccountScope(actor), {kind:"INTERNAL"}] },
    select: {
      id: true, name: true, douyinId: true, realName: true, active: true, banned: true, unbanDate: true, phone: true,
      phoneNumber: { select: { id: true, number: true } }, room: { select: { id: true, name: true } },
      phoneLogins: { where: { device: deviceScope(actor) }, select: { device: { select: { id: true, code: true } } }, orderBy: { device: { code: "asc" } } },
      controller: { select: { id: true, name: true } }, anchor: { select: { id: true, name: true } }, externalAnchor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const canCreate = isAccountBoss(actor) || !!await tx.branch.findFirst({ where: { id: actor.branchId ?? "", managerId: actor.id, status: "ACTIVE" } });
  const visibleNumbers = new Set((await tx.phoneNumber.findMany({ where: { AND: [numberScope(actor), { id: { in: accounts.flatMap(a => a.phoneNumber ? [a.phoneNumber.id] : []) } }] }, select: { id: true } })).map(n => n.id));
  const controllers = [...new Map(accounts.flatMap(a => a.controller ? [[a.controller.id, a.controller] as const] : [])).values()];
  const anchors = [...new Map(accounts.flatMap(a => a.externalAnchor ? [[`external:${a.externalAnchor.id}`, {id:`external:${a.externalAnchor.id}`,name:`${a.externalAnchor.name}（外部）`}] as const] : a.anchor ? [[a.anchor.id,a.anchor] as const] : [])).values()];
  controllers.sort((a,b)=>a.name.localeCompare(b.name,"zh-CN"));
  anchors.sort((a,b)=>a.name.localeCompare(b.name,"zh-CN"));
  const filtered = accounts.filter(a => (a.name.includes(q) || a.douyinId.includes(q)) && (!filters.controllerId || (filters.controllerId === "unassigned" ? !a.controller : a.controller?.id === filters.controllerId)) && (!filters.anchorId || (filters.anchorId === "unassigned" ? !a.anchor && !a.externalAnchor : anchorKey(a.anchor?.id ?? null,a.externalAnchor?.id ?? null) === filters.anchorId)) && (!filters.status || (filters.status === "banned" ? a.banned : filters.status === "active" ? a.active && !a.banned : filters.status === "inactive" ? !a.active && !a.banned : false)));
  return { controllers, anchors, accounts: filtered.map(a => a.phoneNumber && !visibleNumbers.has(a.phoneNumber.id) ? { ...a, phoneNumber: null, phone: "" } : a), canCreate };
}

export async function readAccountHistory(tx: Prisma.TransactionClient, token: string, accountId?: string) {
  const actor = await requireReadAccountActor(tx, token);
  // 不 join 当前账号，避免原负责人看到交接后的名称、分公司和其他资料。
  return tx.accountRecord.findMany({
    where: { AND: [historicalAccountScope(actor), { accountId, endedAt: { not: null } }] },
    orderBy: { startedAt: "desc" },
  });
}

export async function readAccountOptions(tx: Prisma.TransactionClient, token: string) {
  const actor = await requireReadAccountActor(tx, token);
  const branches = await tx.branch.findMany({
    where: { status: "ACTIVE", ...(isAccountBoss(actor) ? {} : { id: actor.branchId ?? "", managerId: actor.id }) },
    select: { id: true, name: true }, orderBy: { createdAt: "asc" },
  });
  const people = branches.length ? await tx.user.findMany({
    where: { employmentStatus: "ACTIVE", OR: [roleWhere("BOSS"), { branchId: { in: branches.map((b) => b.id) } }] },
    select: { id: true, name: true, role: true, roles: true, branchId: true, employmentStatus: true, mustChangePassword: true },
    orderBy: { name: "asc" },
  }) : [];
  const rooms = await tx.liveRoom.findMany({ where: { branchId: { in: branches.map(b => b.id) }, active: true }, select: { id: true, name: true, branchId: true } });
  const numbers = await tx.phoneNumber.findMany({ where: { branchId: { in: branches.map(b => b.id) } }, select: { id: true, number: true, branchId: true, account: { select: { id: true } } } });
  const externalAnchors = await tx.externalAnchor.findMany({ where: { branchId: { in: branches.map(b => b.id) } }, select: { id: true, name: true, branchId: true, active: true }, orderBy: { name: "asc" } });
  return { branches, people, rooms, numbers, externalAnchors };
}

export async function readAccountDetail(tx: Prisma.TransactionClient, token: string, id: string) {
  const actor = await requireReadAccountActor(tx, token);
  const account = await tx.douyinAccount.findFirst({
    where: { AND: [{ id }, currentAccountScope(actor)] },
    include: { branch: true, phoneNumber: { select: { id: true, number: true } }, room: { select: { id: true, name: true } }, operator: { select: { name: true } }, controller: { select: { name: true } }, anchor: { select: { name: true } }, externalAnchor: { select: { name: true } } },
  });
  const history = await readAccountHistory(tx, token, id);
  const canEdit = !!account && account.kind === "INTERNAL" && account.branch?.status === "ACTIVE" && canManageAccountBranch(actor, account.branch);
  const options = canEdit ? await readAccountOptions(tx, token) : null;
  const phones = account ? await tx.assetDevice.findMany({ where: { AND: [deviceScope(actor), { phoneLogins: { some: { accountId: id } } }] }, select: { id: true, code: true } }) : [];
  const visibleNumber = !account?.phoneNumber || !!await tx.phoneNumber.findFirst({ where: { AND: [numberScope(actor), { id: account.phoneNumber.id }] }, select: { id: true } });
  return { account: account && !visibleNumber ? { ...account, phoneNumber: null, phone: "" } : account, history, canEdit, options, phones };
}

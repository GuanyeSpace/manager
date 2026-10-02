import { isExecutionController } from "@/lib/auth/account-permissions";
import type { Prisma } from "@/app/generated/prisma/client";
import { Role, AuditAction, BranchStatus } from "@/app/generated/prisma/enums";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { writeAudit } from "@/lib/audit";
import {
  canUseAccounts, canManageAccountBranch, canFillAccountDuty,
  isAccountBoss, accountMembershipWhere, type AccountActor,
} from "@/lib/auth/account-permissions";
import { accountSchema, managerSchema, type AccountInput } from "./schema";

export async function requireAccountActor(tx: Prisma.TransactionClient, token: string): Promise<AccountActor & { name: string }> {
  if (token.startsWith("readonly-preview:")) throw new UserActionError("只读预览不能执行修改操作");
  const session = await tx.session.findUnique({ where: { id: token }, include: { user: true } });
  if (!session || session.expiresAt.getTime() <= Date.now() || !canUseAccounts(session.user)) {
    throw new UserActionError("登录或权限已变化，请刷新页面后重试");
  }
  const { id, name, role, roles, branchId, employmentStatus, mustChangePassword } = session.user;
  return { id, name, role, roles, branchId, employmentStatus, mustChangePassword };
}

export function currentAccountScope(actor: AccountActor): Prisma.DouyinAccountWhereInput {
  if (isExecutionController(actor)) return { branchId: actor.branchId ?? "", controllerId: actor.id };
  if (isAccountBoss(actor)) return {};
  return {
    branchId: actor.branchId ?? "",
    OR: [...accountMembershipWhere(actor.id).OR, { branch: { managerId: actor.id } }],
  };
}

export function historicalAccountScope(actor: AccountActor): Prisma.AccountRecordWhereInput {
  if (isExecutionController(actor)) return { controllerId: actor.id };
  if (isAccountBoss(actor)) return {};
  return { OR: [
    ...accountMembershipWhere(actor.id).OR,
    { branchId: actor.branchId ?? "", branch: { managerId: actor.id } },
  ] };
}

export async function saveAccount(tx: Prisma.TransactionClient, token: string, raw: AccountInput, ip: string) {
  const input = accountSchema.parse(raw);
  // 与人员变更共用管理锁：权限、人员在职状态、交接和版本检查串行化。
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  const before = input.id ? await tx.douyinAccount.findUnique({ where: { id: input.id }, include: { branch: true } }) : null;
  if (input.id && (!before || !canManageAccountBranch(actor, before.branch))) {
    throw new UserActionError("账号不存在或无管理权限");
  }
  if (before && before.version !== input.version) throw new UserActionError("账号已被其他人修改，请刷新后重新编辑");
  if (before && before.branchId !== input.branchId && !isAccountBoss(actor)) {
    throw new UserActionError("跨公司调拨仅限老板操作");
  }
  const externalAnchorId = input.externalAnchorId === undefined ? before?.externalAnchorId ?? null : input.externalAnchorId || null;
  if (input.anchorId && externalAnchorId) throw new UserActionError("员工主播与外部主播只能选择一种");
  if (before && (before.externalAnchorId !== externalAnchorId || before.branchId !== input.branchId || before.controllerId !== (input.controllerId || null) || before.operatorId !== (input.operatorId || null) || before.anchorId !== (input.anchorId || null) || input.active !== "true")) {
    const ongoing = await tx.workSession.findFirst({ where: { accountId: before.id, phase: { in: ["PREPARING", "LIVE"] } } });
    if (ongoing) throw new UserActionError("账号正在准备或直播中，请先取消准备或确认下播，再交接人员、调拨、停用或标记封禁");
  }
  await tx.$queryRaw`SELECT "id" FROM "Branch" WHERE "id" = ${input.branchId} FOR UPDATE`;
  const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
  if (!branch || !canManageAccountBranch(actor, branch)) throw new UserActionError("无权管理所选分公司");
  if (branch.status !== BranchStatus.ACTIVE) throw new UserActionError("分公司已停用，请先启用后维护账号");

  const roomId = input.roomId === undefined ? before?.roomId ?? null : input.roomId || null;
  const phoneNumberId = input.phoneNumberId === undefined ? before?.phoneNumberId ?? null : input.phoneNumberId || null;
  const room = roomId ? await tx.liveRoom.findUnique({ where: { id: roomId } }) : null;
  if (roomId && (!room || room.branchId !== branch.id || !room.active)) throw new UserActionError("直播间必须属于该分公司且已启用");
  const number = phoneNumberId ? await tx.phoneNumber.findUnique({ where: { id: phoneNumberId }, include: { account: { select: { id: true } } } }) : null;
  if (phoneNumberId && (!number || number.branchId !== branch.id)) throw new UserActionError("手机号档案必须属于该分公司");
  if (number && !number.active && before?.phoneNumberId !== number.id) throw new UserActionError("该手机号已停用，不能新增绑定");
  if (number?.account && number.account.id !== before?.id) throw new UserActionError("该手机号已经绑定其他抖音账号");
  if (before && before.roomId !== roomId && await tx.workSession.findFirst({ where: { accountId: before.id, phase: { in: ["PREPARING", "LIVE"] } } })) throw new UserActionError("请先结束本场准备或直播，再变更直播间");
  if (before && before.branchId !== branch.id && await tx.phoneAccountLogin.findFirst({ where: { accountId: before.id } })) throw new UserActionError("此账号仍登记在原分公司的手机上，请先解除手机登录关联再调拨");
  const externalAnchor = externalAnchorId ? await tx.externalAnchor.findUnique({ where: { id: externalAnchorId } }) : null;
  if (externalAnchorId && (!externalAnchor || externalAnchor.branchId !== branch.id || (!externalAnchor.active && before?.externalAnchorId !== externalAnchorId))) throw new UserActionError("请选择本分公司启用的外部主播");
  const duties = [
    { key: "operatorId", id: input.operatorId, role: Role.OPERATOR, label: "运营" },
    { key: "controllerId", id: input.controllerId, role: Role.CONTROLLER, label: "直播中控" },
    { key: "anchorId", id: input.anchorId, role: Role.ANCHOR, label: "主播" },
  ] as const;
  const people = await tx.user.findMany({ where: { id: { in: duties.map((d) => d.id).filter(Boolean) } } });
  for (const duty of duties) {
    if (!duty.id) continue;
    const person = people.find((p) => p.id === duty.id);
    if (!person || !canFillAccountDuty(person, branch.id, duty.role)) {
      throw new UserActionError(`${duty.label}必须是在职的本公司对应岗位员工或老板`, { [duty.key]: ["人员岗位、归属或在职状态不符"] });
    }
  }
  const data = {
    douyinId: input.douyinId, name: input.name, homepageUrl: input.homepageUrl,
    realName: input.realName, phone: number?.number ?? input.phone, phoneNumberId, roomId, purpose: input.purpose, notes: input.notes,
    branchId: branch.id, operatorId: input.operatorId || null,
    externalAnchorId, controllerId: input.controllerId || null, anchorId: input.anchorId || null, active: input.active === "true", banned: input.active === "banned",
    unbanDate: input.active === "banned" ? input.unbanDate || null : null,
  };
  const now = new Date();
  const account = before
    ? await tx.douyinAccount.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 } } })
    : await tx.douyinAccount.create({ data });
  if ((before?.phoneNumberId ?? null) !== phoneNumberId) {
    await tx.phoneNumber.updateMany({ where: { id: { in: [before?.phoneNumberId, phoneNumberId].filter((id): id is string => !!id) } }, data: { version: { increment: 1 } } });
  }
  if (before) await tx.accountRecord.updateMany({ where: { accountId: account.id, endedAt: null }, data: { endedAt: now } });
  await tx.accountRecord.create({ data: {
    accountId: account.id, branchId: branch.id, branchName: branch.name,
    douyinId: account.douyinId, name: account.name, active: account.active, banned: account.banned, unbanDate: account.unbanDate,
    operatorId: account.operatorId, operatorName: people.find((p) => p.id === account.operatorId)?.name ?? null,
    controllerId: account.controllerId, controllerName: people.find((p) => p.id === account.controllerId)?.name ?? null,
    externalAnchorId, externalAnchorName: externalAnchor?.name ?? null,
    anchorId: account.anchorId, anchorName: people.find((p) => p.id === account.anchorId)?.name ?? null,
    actorName: actor.name, version: account.version, startedAt: now,
  } });
  await writeAudit({ db: tx, actorId: actor.id, action: before ? AuditAction.ACCOUNT_UPDATE : AuditAction.ACCOUNT_CREATE,
    targetType: "DouyinAccount", targetId: account.id,
    detail: { version: account.version, branchId: branch.id, previousBranchId: before?.branchId ?? null }, ip });
  return account.id;
}

export async function setBranchManager(tx: Prisma.TransactionClient, token: string, raw: unknown, ip: string) {
  const input = managerSchema.parse(raw);
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  if (!isAccountBoss(actor)) throw new UserActionError("仅老板可以指定分公司负责人");
  const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
  if (!branch) throw new UserActionError("分公司不存在");
  if ((branch.managerId ?? "") !== input.previousManagerId) throw new UserActionError("负责人已变化，请刷新后重试");
  if (input.managerId) {
    const user = await tx.user.findUnique({ where: { id: input.managerId } });
    if (!user || user.employmentStatus !== "ACTIVE" || (!isAccountBoss(user) && user.branchId !== branch.id)) {
      throw new UserActionError("负责人必须是在职的本公司员工或老板");
    }
  }
  await tx.branch.update({ where: { id: branch.id }, data: { managerId: input.managerId || null } });
  await writeAudit({ db: tx, actorId: actor.id, action: AuditAction.BRANCH_UPDATE, targetType: "Branch", targetId: branch.id,
    detail: { managerId: { from: branch.managerId, to: input.managerId || null } }, ip });
}

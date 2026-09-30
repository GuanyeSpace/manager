import type { Prisma } from "@/app/generated/prisma/client";
import { isAccountBoss } from "@/lib/auth/account-permissions";
import { writeAudit } from "@/lib/audit";
import { requireAccountActor } from "@/modules/accounts/service";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { canExecute } from "./service";
import { workflowSchema } from "./schema";

export async function saveSessionScripts(tx: Prisma.TransactionClient, token: string, id: string, sessionVersion: number, accountVersion: number, rawScripts: unknown, ip: string) {
  const scripts = workflowSchema.shape.scripts.parse(rawScripts);
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  const session = await tx.workSession.findUnique({ where: { id }, include: { account: { include: { workflow: true } } } });
  if (!session || !canExecute(actor, session.account, session.controllerId) || (session.loginUserId && session.loginUserId !== actor.id && !isAccountBoss(actor))) throw new UserActionError("场次不存在或无执行权限");
  if (!["PREPARING", "LIVE", "WRAP"].includes(session.phase)) throw new UserActionError("本场已结束，不能修改话术");
  const accountWorkflow = session.account.workflow;
  if (!accountWorkflow) throw new UserActionError("账号流程不存在，请刷新后重试");
  if (session.version !== sessionVersion || accountWorkflow.version !== accountVersion) throw new UserActionError("话术已被其他人修改，请刷新后重试");

  const beforeSession = workflowSchema.parse(session.workflow);
  const beforeAccount = workflowSchema.parse(accountWorkflow.content);
  const afterSession = { ...beforeSession, scripts };
  const afterAccount = { ...beforeAccount, scripts };
  const savedAccount = await tx.accountWorkflow.update({ where: { accountId: session.accountId }, data: { content: afterAccount, version: { increment: 1 }, updatedByName: actor.name } });
  const savedSession = await tx.workSession.update({ where: { id }, data: { workflow: afterSession, version: { increment: 1 } } });
  await tx.workEvent.create({ data: { sessionId: id, kind: "scripts", body: "更新本场及账号话术", actorId: actor.id, actorName: actor.name } });
  await writeAudit({ db: tx, actorId: actor.id, action: "WORKFLOW_UPDATE", targetType: "AccountWorkflow", targetId: session.accountId, detail: { before: beforeAccount, after: afterAccount, version: savedAccount.version, sessionId: id }, ip });
  await writeAudit({ db: tx, actorId: actor.id, action: "WORK_SESSION_UPDATE", targetType: "WorkSession", targetId: id, detail: { command: "scripts", before: beforeSession, after: afterSession, version: savedSession.version }, ip });
}

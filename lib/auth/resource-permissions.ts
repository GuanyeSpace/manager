import type { Prisma } from "@/app/generated/prisma/client";
import { isAccountBoss, isExecutionController, type AccountActor } from "./account-permissions";

export function roomScope(actor: AccountActor): Prisma.LiveRoomWhereInput {
  if (isExecutionController(actor)) return { branchId: actor.branchId ?? "", OR: [{ controllerId: actor.id }, { accounts: { some: { controllerId: actor.id } } }] };
  if (isAccountBoss(actor)) return {};
  return { branchId: actor.branchId ?? "", OR: [{ branch: { managerId: actor.id } }, { operatorId: actor.id }, { controllerId: actor.id }, { anchors: { some: { userId: actor.id } } }, { numbers: { some: { OR: [{ operatorId: actor.id }, { controllerId: actor.id }, { userId: actor.id }] } } }, { devices: { some: { splitAt: null, OR: [{ operatorId: actor.id }, { controllerId: actor.id }, { userId: actor.id }] } } }, { accounts: { some: { OR: [{ operatorId: actor.id }, { controllerId: actor.id }, { anchorId: actor.id }] } } }] };
}
export function numberScope(actor: AccountActor): Prisma.PhoneNumberWhereInput {
  if (isExecutionController(actor)) return { branchId: actor.branchId ?? "", userId: actor.id };
  if (isAccountBoss(actor)) return {};
  const assigned = [{ operatorId: actor.id }, { controllerId: actor.id }, { userId: actor.id }];
  return { branchId: actor.branchId ?? "", OR: [{ branch: { managerId: actor.id } }, ...assigned, { room: { OR: [{ operatorId: actor.id }, { controllerId: actor.id }, { anchors: { some: { userId: actor.id } } }] } }, { account: { OR: [{ operatorId: actor.id }, { controllerId: actor.id }, { anchorId: actor.id }] } }, { slot: { device: { OR: assigned } } }] };
}
export function deviceScope(actor: AccountActor): Prisma.AssetDeviceWhereInput {
  if (isExecutionController(actor)) return { branchId: actor.branchId ?? "", userId: actor.id };
  if (isAccountBoss(actor)) return {};
  return { branchId: actor.branchId ?? "", OR: [{ branch: { managerId: actor.id } }, { operatorId: actor.id }, { controllerId: actor.id }, { userId: actor.id }, { room: roomScope(actor) }, { slots: { some: { phoneNumber: { OR: [{ operatorId: actor.id }, { controllerId: actor.id }, { userId: actor.id }, { account: { OR: [{ operatorId: actor.id }, { controllerId: actor.id }, { anchorId: actor.id }] } }] } } } }] };
}

import { roleWhere } from "@/lib/auth/roles";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireAccountActor, currentAccountScope } from "@/modules/accounts/service";
import { isExecutionController, canManageAccountBranch, isAccountBoss } from "@/lib/auth/account-permissions";
import { roomScope, numberScope, deviceScope } from "@/lib/auth/resource-permissions";
import { pageSizeSchema, numberStatus, numberFiltersSchema, type NumberFilters, deviceKind, devicePath, resourceLabels, moneyInput, resourceSchema, type ResourceKind } from "./schema";
const person = { select: { id: true, name: true } } as const;
const ownership = { branch: true, operator: person, controller: person } as const;
const assetOwnership = { ...ownership, room: { select: { id: true, name: true } }, user: person } as const;
export async function readResourceOptions(tx: Prisma.TransactionClient, token: string) {
  const actor = await requireAccountActor(tx, token);
  if (isExecutionController(actor)) return { branches: [], people: [], rooms: [], numbers: [], accounts: [], phones: [] };
  const branches = await tx.branch.findMany({ where: { status: "ACTIVE", ...(isAccountBoss(actor) ? {} : { id: actor.branchId ?? "", managerId: actor.id }) }, select: { id: true, name: true } });
  const branchIds = branches.map(b => b.id);
  const people = await tx.user.findMany({ where: { employmentStatus: "ACTIVE", OR: [...(branchIds.length ? [roleWhere("BOSS")] : []), { branchId: { in: branchIds } }] }, select: { id: true, name: true, role: true, roles: true, branchId: true, employmentStatus: true, mustChangePassword: true }, orderBy: { name: "asc" } });
  const rooms = await tx.liveRoom.findMany({ where: { branchId: { in: branchIds }, active: true }, select: { id: true, name: true, branchId: true, operatorId: true, controllerId: true }, orderBy: { name: "asc" } });
  const numbers = await tx.phoneNumber.findMany({ where: { branchId: { in: branchIds } }, select: { id: true, number: true, branchId: true, cardType: true, mainCardId: true, monthlyFeeCents: true, dataGb: true, status: true, active: true, slot: { select: { deviceId: true } } }, orderBy: { number: "asc" } });
  const accounts = await tx.douyinAccount.findMany({ where: { branchId: { in: branchIds } }, select: { id: true, name: true, douyinId: true, branchId: true, phoneNumberId: true }, orderBy: { name: "asc" } });
  const phones = await tx.assetDevice.findMany({ where: { branchId: { in: branchIds }, kind: "PHONE" }, select: { id: true, code: true, branchId: true, active: true, slots: { select: { slot: true, phoneNumberId: true } } }, orderBy: { code: "asc" } });
  return { branches, people, rooms, numbers: numbers.map(n => ({ ...n, dataGb: n.dataGb?.toString() ?? "" })), accounts, phones };
}
export type ResourceOptions = Awaited<ReturnType<typeof readResourceOptions>>;
export async function readResourceList(tx: Prisma.TransactionClient, token: string, kind: ResourceKind, q: string, requestedPage: number, archived = false) {
  const actor = await requireAccountActor(tx, token);
  const manager = !isExecutionController(actor) && (isAccountBoss(actor) || !!await tx.branch.findFirst({ where: { id: actor.branchId ?? "", managerId: actor.id } }));
  const roomWhere: Prisma.LiveRoomWhereInput = { AND: [roomScope(actor), { name: { contains: q } }] };
  const numberWhere: Prisma.PhoneNumberWhereInput = { AND: [numberScope(actor), { OR: [{ number: { contains: q } }, { purpose: { contains: q } }] }] };
  const deviceWhere: Prisma.AssetDeviceWhereInput = { AND: [deviceScope(actor), { kind: deviceKind(kind), splitAt: kind === "materials" && archived ? { not: null } : null, OR: [{ code: { contains: q } }, { model: { contains: q } }, { category: { contains: q } }] }] };
  const total = kind === "rooms" ? await tx.liveRoom.count({ where: roomWhere }) : kind === "numbers" ? await tx.phoneNumber.count({ where: numberWhere }) : await tx.assetDevice.count({ where: deviceWhere });
  const pages = Math.max(1, Math.ceil(total / 30)), page = Math.min(pages, Math.max(1, Math.trunc(requestedPage) || 1));
  const pagination = { take: 30, skip: (page - 1) * 30, orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }] };
  let rows;
  if (kind === "rooms") {
    rows = (await tx.liveRoom.findMany({ where: roomWhere, include: { ...ownership, anchors: { include: { user: person } } }, ...pagination })).map(r => ({ id: r.id, title: r.name, description: r.anchors.map(a => a.user.name).join("、") || "未分配主播", branch: r.branch.name, room: "—", operator: r.operator?.name, controller: r.controller?.name, user: null, active: r.active, asset: null }));
  } else if (kind === "numbers") {
    rows = (await tx.phoneNumber.findMany({ where: numberWhere, include: assetOwnership, ...pagination })).map(r => ({ id: r.id, title: r.number, description: [r.carrier, r.purpose].filter(Boolean).join(" · "), branch: r.branch.name, room: r.room?.name, operator: r.operator?.name, controller: r.controller?.name, user: r.user?.name, active: r.active, asset: null }));
  } else {
    rows = (await tx.assetDevice.findMany({ where: deviceWhere, include: assetOwnership, ...pagination })).map(r => ({ id: r.id, title: r.code, description: `${r.category} · ${r.model}`, branch: r.branch.name, room: r.room?.name, operator: r.operator?.name, controller: r.controller?.name, user: r.user?.name, active: r.active, asset: { quantity: r.quantity, unit: r.unit, purchaseUnitPriceCents: r.purchaseUnitPriceCents, currentUnitValueCents: r.currentUnitValueCents } }));
  }
  return { rows, manager, total, page, pages };
}
export async function readResourceDetail(tx: Prisma.TransactionClient, token: string, kind: ResourceKind, id: string) {
  const actor = await requireAccountActor(tx, token);
  const related: { label: string; title: string; href: string }[] = [];
  let initial, record;
  if (kind === "rooms") {
    const room = await tx.liveRoom.findFirst({ where: { id, ...roomScope(actor) }, include: { ...ownership, anchors: { include: { user: person } } } });
    if (!room) return null;
    record = room;
    initial = resourceSchema.parse({ ...room, active: String(room.active), operatorId: room.operatorId ?? "", controllerId: room.controllerId ?? "", anchorIds: room.anchors.map(a => a.userId) });
    room.anchors.forEach(a => related.push({ label: "主播", title: a.user.name, href: `/resources/anchors/${a.userId}` }));
    const accounts = await tx.douyinAccount.findMany({ where: { roomId: id, ...currentAccountScope(actor) }, select: { id: true, name: true } });
    accounts.forEach(a => related.push({ label: "抖音账号", title: a.name, href: `/accounts/${a.id}` }));
    const numbers = await tx.phoneNumber.findMany({ where: { roomId: id, ...numberScope(actor) }, select: { id: true, number: true } });
    numbers.forEach(n => related.push({ label: "手机号", title: n.number, href: `/resources/numbers/${n.id}` }));
    const devices = await tx.assetDevice.findMany({ where: { roomId: id, splitAt: null, ...deviceScope(actor) }, select: { id: true, code: true, kind: true } });
    devices.forEach(d => related.push({ label: resourceLabels[devicePath(d.kind)], title: d.code, href: `/resources/${devicePath(d.kind)}/${d.id}` }));
  } else if (kind === "numbers") {
    const number = await tx.phoneNumber.findFirst({ where: { id, ...numberScope(actor) }, include: { ...assetOwnership, slot: true } });
    if (!number) return null;
    record = number;
    const account = await tx.douyinAccount.findFirst({ where: { phoneNumberId: id, ...currentAccountScope(actor) }, select: { id: true, name: true } });
    initial = resourceSchema.parse({ ...number, dataGb: number.dataGb?.toString() ?? "", monthlyFee: moneyInput(number.monthlyFeeCents), cardType: number.cardType ?? "", mainCardId: number.mainCardId ?? "", status: numberStatus(number.status, number.active), phoneDeviceId: number.slot?.deviceId ?? (number.otherPhone ? "other" : ""), phoneSlot: number.slot ? String(number.slot.slot) : "", active: String(number.active), roomId: number.roomId ?? "", userId: number.userId ?? "", operatorId: number.operatorId ?? "", controllerId: number.controllerId ?? "", accountId: account?.id ?? "" });
    if (number.mainCardId) {
      const main = await tx.phoneNumber.findFirst({ where: { id: number.mainCardId, ...numberScope(actor) } });
      if (main) {
        related.push({ label: "共享套餐主卡", title: main.number, href: `/resources/numbers/${main.id}` });
        initial.monthlyFee = moneyInput(main.monthlyFeeCents); initial.dataGb = main.dataGb?.toString() ?? "";
      }
    }
    const secondaryCards = await tx.phoneNumber.findMany({ where: { mainCardId: id, ...numberScope(actor) }, select: { id: true, number: true } });
    secondaryCards.forEach(card => related.push({ label: "共享套餐副卡", title: card.number, href: `/resources/numbers/${card.id}` }));
    if (account) related.push({ label: "绑定抖音号", title: account.name, href: `/accounts/${account.id}` });
    const slot = await tx.deviceSlot.findFirst({ where: { phoneNumberId: id, device: deviceScope(actor) }, include: { device: { select: { id: true, code: true } } } });
    if (slot) related.push({ label: `所在手机 · 卡槽 ${slot.slot}`, title: slot.device.code, href: `/resources/phones/${slot.device.id}` });
  } else {
    const device = await tx.assetDevice.findFirst({ where: { id, kind: deviceKind(kind), ...deviceScope(actor) }, include: { ...assetOwnership, phoneLogins: { where: { account: currentAccountScope(actor) }, include: { account: { select: { id: true, name: true } } } } } });
    if (!device) return null;
    record = device;
    const slots = await tx.deviceSlot.findMany({ where: { deviceId: id, phoneNumber: numberScope(actor) }, include: { phoneNumber: { select: { id: true, number: true } } }, orderBy: { slot: "asc" } });
    initial = resourceSchema.parse({ ...device, loginAccountIds: device.phoneLogins.map(link => link.accountId), quantity: device.quantity === null ? "" : String(device.quantity), purchaseUnitPrice: moneyInput(device.purchaseUnitPriceCents), currentUnitValue: moneyInput(device.currentUnitValueCents), active: String(device.active), roomId: device.roomId ?? "", userId: device.userId ?? "", operatorId: device.operatorId ?? "", controllerId: device.controllerId ?? "", sim1: slots.find(s => s.slot === 1)?.phoneNumberId ?? "", sim2: slots.find(s => s.slot === 2)?.phoneNumberId ?? "" });
    device.phoneLogins.forEach(link => related.push({ label: "登录抖音号", title: link.account.name, href: `/accounts/${link.accountId}` }));
    if (device.sourceAssetId) {
      const parent = await tx.assetDevice.findFirst({ where: { id: device.sourceAssetId, ...deviceScope(actor) }, select: { id: true, code: true } });
      if (parent) related.push({ label: "来源批次（已拆分，不计存量）", title: parent.code, href: `/resources/materials/${parent.id}` });
    }
    if (device.splitAt) {
      const children = await tx.assetDevice.findMany({ where: { sourceAssetId: id, ...deviceScope(actor) }, include: { room: true, user: person }, orderBy: { code: "asc" } });
      children.forEach(child => related.push({ label: "拆分单件", title: `${child.code} · ${child.room?.name ?? "未分配直播间"} · ${child.user?.name ?? "未分配使用人"}`, href: `/resources/materials/${child.id}` }));
    }
    slots.forEach(s => related.push({ label: `卡槽 ${s.slot}`, title: s.phoneNumber.number, href: `/resources/numbers/${s.phoneNumberId}` }));
  }
  if ("room" in record && record.room && await tx.liveRoom.findFirst({ where: { id: record.room.id, ...roomScope(actor) }, select: { id: true } })) related.unshift({ label: "所属直播间", title: record.room.name, href: `/resources/rooms/${record.room.id}` });
  const splitAt = "splitAt" in record ? record.splitAt : null;
  const editable = !splitAt && !isExecutionController(actor) && canManageAccountBranch(actor, record.branch);
  const options = editable ? await readResourceOptions(tx, token) : null;
  return { initial, splitAt, branchName: record.branch.name, operatorName: record.operator?.name, controllerName: record.controller?.name, userName: "user" in record ? record.user?.name : null, related, editable, options };
}

export async function readAnchors(tx: Prisma.TransactionClient, token: string, id?: string) {
  const actor = await requireAccountActor(tx, token);
  const manager = !isExecutionController(actor) && (isAccountBoss(actor) || !!await tx.branch.findFirst({ where: { id: actor.branchId ?? "", managerId: actor.id } }));
  const scope: Prisma.UserWhereInput = isAccountBoss(actor) ? {} : manager ? { branchId: actor.branchId ?? "" } : { OR: [{ id: actor.id }, { anchoredAccounts: { some: currentAccountScope(actor) } }, { roomAnchors: { some: { room: roomScope(actor) } } }] };
  const anchors = await tx.user.findMany({ where: { AND: [scope, { id, OR: [roleWhere("ANCHOR"), { anchoredAccounts: { some: {} } }, { roomAnchors: { some: {} } }] }] }, select: { id: true, name: true, employmentStatus: true, branch: { select: { name: true } }, anchoredAccounts: { where: currentAccountScope(actor), select: { id: true, name: true, operator: person, controller: person, branch: { select: { id: true, managerId: true, status: true } } } }, roomAnchors: { where: { room: roomScope(actor) }, select: { room: { select: { id: true, name: true } } } } }, orderBy: { name: "asc" } });
  return { anchors: anchors.map(a => ({ ...a, anchoredAccounts: a.anchoredAccounts.map(({ branch, ...account }) => ({ ...account, canEdit: branch.status === "ACTIVE" && canManageAccountBranch(actor, branch) })) })), canManageUsers: isAccountBoss(actor) };
}

export async function readNumberList(tx: Prisma.TransactionClient, token: string, q: string, requestedPage: number, rawFilters: Partial<NumberFilters> = {}, requestedSize = 20) {
  const actor = await requireAccountActor(tx, token), filters = numberFiltersSchema.parse(rawFilters);
  const scope = numberScope(actor);
  const statusFilter = !filters.status ? {} : { OR: [{ status: filters.status }, ...(filters.status === "CANCELLED" ? [] : [{ status: null, active: filters.status === "NORMAL" }])] };
  const where: Prisma.PhoneNumberWhereInput = { AND: [scope, statusFilter, { openedBy: { contains: filters.openedBy }, ...(filters.userId ? { userId: filters.userId === "unassigned" ? null : filters.userId } : {}), OR: [{ number: { contains: q } }, { purpose: { contains: q } }, { wechat: { contains: q } }, { xiaohongshu: { contains: q } }, { kuaishou: { contains: q } }, { account: { AND: [currentAccountScope(actor), { name: { contains: q } }] } }] }] };
  const pageSize = pageSizeSchema.parse(requestedSize);
  const total = await tx.phoneNumber.count({ where }), pages = Math.max(1, Math.ceil(total / pageSize)), page = Math.min(pages, Math.max(1, Math.trunc(requestedPage) || 1));
  const rows = await tx.phoneNumber.findMany({ where, select: { id: true, number: true, openedBy: true, wechat: true, xiaohongshu: true, kuaishou: true, status: true, active: true, user: person, branch: { select: { name: true } }, account: { select: { id: true, name: true, douyinId: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: pageSize, skip: (page - 1) * pageSize });
  const visibleAccounts = new Set((await tx.douyinAccount.findMany({ where: { AND: [currentAccountScope(actor), { id: { in: rows.flatMap(r => r.account ? [r.account.id] : []) } }] }, select: { id: true } })).map(a => a.id));
  const users = await tx.user.findMany({ where: { usedNumbers: { some: scope } }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  const manager = !isExecutionController(actor) && (isAccountBoss(actor) || !!await tx.branch.findFirst({ where: { id: actor.branchId ?? "", managerId: actor.id } }));
  return { rows: rows.map(r => ({ ...r, account: r.account && visibleAccounts.has(r.account.id) ? r.account : null, status: numberStatus(r.status, r.active) })), total, pages, page, pageSize, users, manager, filters };
}

export async function readPhoneList(tx: Prisma.TransactionClient, token: string, q: string, requestedPage: number, requestedSize = 20, userId = "", rawStatus = "") {
  const actor = await requireAccountActor(tx, token), scope = deviceScope(actor), pageSize = pageSizeSchema.parse(requestedSize);
  const status = ["active", "inactive"].includes(rawStatus) ? rawStatus : "";
  const where: Prisma.AssetDeviceWhereInput = { AND: [scope, { kind: "PHONE", ...(userId ? { userId: userId === "unassigned" ? null : userId } : {}), ...(status ? { active: status === "active" } : {}), OR: [{ code: { contains: q } }, { model: { contains: q } }, { loginWechats: { contains: q } }, { slots: { some: { phoneNumber: { AND: [numberScope(actor), { number: { contains: q } }] } } } }, { phoneLogins: { some: { account: { AND: [currentAccountScope(actor), { OR: [{ name: { contains: q } }, { douyinId: { contains: q } }] }] } } } }] }] };
  const total = await tx.assetDevice.count({ where }), pages = Math.max(1, Math.ceil(total / pageSize)), page = Math.min(pages, Math.max(1, Math.trunc(requestedPage) || 1));
  const rows = await tx.assetDevice.findMany({ where, select: { id: true, code: true, model: true, purpose: true, active: true, loginWechats: true, user: person, branch: { select: { name: true } }, slots: { where: { phoneNumber: numberScope(actor) }, select: { slot: true, phoneNumber: { select: { id: true, number: true } } }, orderBy: { slot: "asc" } }, phoneLogins: { where: { account: currentAccountScope(actor) }, select: { account: { select: { id: true, name: true, douyinId: true } } }, orderBy: { accountId: "asc" } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: pageSize, skip: (page - 1) * pageSize });
  const users = await tx.user.findMany({ where: { usedDevices: { some: { AND: [scope, { kind: "PHONE" }] } } }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  const manager = !isExecutionController(actor) && (isAccountBoss(actor) || !!await tx.branch.findFirst({ where: { id: actor.branchId ?? "", managerId: actor.id } }));
  return { rows, total, pages, page, pageSize, users, manager, status };
}

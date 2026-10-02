import type { Prisma } from "@/app/generated/prisma/client";
import { Role } from "@/app/generated/prisma/enums";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { requireAccountActor, saveAccount } from "@/modules/accounts/service";
import { isExecutionController, canManageAccountBranch, canFillAccountDuty, isAccountBoss } from "@/lib/auth/account-permissions";
import { writeAudit } from "@/lib/audit";
import { carriers, numberStatus, itemCodes, deviceKind, toCents, normalizeNumber, resourceSchema, type ResourceKind } from "./schema";

async function assignNumber(tx: Prisma.TransactionClient, token: string, account: NonNullable<Awaited<ReturnType<typeof tx.douyinAccount.findUnique>>>, phoneNumberId: string | null, ip: string) {
  await saveAccount(tx, token, { ...account, externalAnchorId: account.externalAnchorId ?? "", controllerId: account.controllerId ?? "", phoneNumberId: phoneNumberId ?? "", roomId: account.roomId ?? "", operatorId: account.operatorId ?? "", anchorId: account.anchorId ?? "", phone: "", active: account.banned ? "banned" : account.active ? "true" : "false", unbanDate: account.unbanDate ?? "" }, ip);
}
export async function saveResource(tx: Prisma.TransactionClient, token: string, kind: ResourceKind, raw: unknown, ip: string) {
  const input = resourceSchema.parse(raw);
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
  if (isExecutionController(actor) || !branch || !canManageAccountBranch(actor, branch)) throw new UserActionError("仅老板或本公司负责人可以维护资料");
  if (branch.status !== "ACTIVE") throw new UserActionError("分公司已停用");
  const before = !input.id ? null : kind === "rooms" ? await tx.liveRoom.findUnique({ where: { id: input.id } }) : kind === "numbers" ? await tx.phoneNumber.findUnique({ where: { id: input.id } }) : await tx.assetDevice.findFirst({ where: { id: input.id, kind: deviceKind(kind) } });
  if (input.id && !before) throw new UserActionError("资料不存在");
  if (before) {
    const oldBranch = await tx.branch.findUniqueOrThrow({ where: { id: before.branchId } });
    if (!canManageAccountBranch(actor, oldBranch)) throw new UserActionError("无权修改原分公司的资料");
    if ("splitAt" in before && before.splitAt) throw new UserActionError("此批次已拆分归档，请编辑对应的单件物资");
    if ("individual" in before && before.individual && (input.code !== before.code || input.quantity !== "1")) throw new UserActionError("单件物资编号固定、数量必须为 1，请仅调整归属等资料");
    if (before.version !== input.version) throw new UserActionError("资料已被修改，请刷新后重试");
    if (before.branchId !== branch.id && !isAccountBoss(actor)) throw new UserActionError("跨公司调拨仅限老板");
  }
  const duties = [[input.operatorId, Role.OPERATOR, "运营"], [input.controllerId, Role.CONTROLLER, "直播中控"], ...input.anchorIds.map(id => [id, Role.ANCHOR, "主播"] as const)] as const;
  const people = await tx.user.findMany({ where: { id: { in: [...duties.map(d => d[0]), input.userId].filter(Boolean) } } });
  for (const [id, role, label] of duties) {
    if (!id) continue;
    const person = people.find(p => p.id === id);
    if (!person || !canFillAccountDuty(person, branch.id, role)) throw new UserActionError(`${label}必须为本公司对应岗位的在职员工或老板`);
  }
  if (input.userId) {
    const user = people.find(p => p.id === input.userId);
    if (!user || user.employmentStatus !== "ACTIVE" || (!isAccountBoss(user) && user.branchId !== branch.id)) throw new UserActionError("使用人必须为本公司在职员工或老板");
  }
  if (input.roomId) {
    const room = await tx.liveRoom.findUnique({ where: { id: input.roomId } });
    if (!room || room.branchId !== branch.id || !room.active) throw new UserActionError("直播间必须属于所选分公司且已启用");
  }
  const common = { branchId: branch.id, operatorId: input.operatorId || null, controllerId: input.controllerId || null, notes: input.notes, active: input.active === "true" };
  const allocation = { ...common, roomId: input.roomId || null, userId: input.userId || null, purpose: input.purpose };
  let id: string;
  const oldLoginIds = before && kind === "phones" ? (await tx.phoneAccountLogin.findMany({ where: { deviceId: before.id } })).map(link => link.accountId) : [];
  if (kind === "rooms") {
    if (!input.name) throw new UserActionError("请输入直播间名称");
    if (before && (before.branchId !== branch.id || !common.active)) {
      const occupied = await tx.douyinAccount.count({ where: { roomId: before.id } }) + await tx.phoneNumber.count({ where: { roomId: before.id } }) + await tx.assetDevice.count({ where: { roomId: before.id, splitAt: null } });
      if (occupied) throw new UserActionError("请先移出直播间关联的账号、手机号及设备，再调拨或停用");
    }
    const data = { ...common, name: input.name, location: input.location };
    const saved = before ? await tx.liveRoom.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 } } }) : await tx.liveRoom.create({ data });
    id = saved.id;
    await tx.roomAnchor.deleteMany({ where: { roomId: id } });
    await tx.roomAnchor.createMany({ data: [...new Set(input.anchorIds)].map(userId => ({ roomId: id, userId, branchId: branch.id })) });
  } else if (kind === "numbers") {
    const number = normalizeNumber(input.number);
    if (!/^\+?\d{5,20}$/.test(number)) throw new UserActionError("请输入有效手机号（数字，可带国际区号）");
    if (before && before.branchId !== branch.id && await tx.deviceSlot.findUnique({ where: { phoneNumberId: before.id } })) throw new UserActionError("请先从手机卡槽取出此号码，再跨公司调拨");
    const oldNumber = before && "number" in before ? before : null;
    if (input.carrier && !carriers.some(c => c === input.carrier) && input.carrier !== oldNumber?.carrier) throw new UserActionError("请选择有效运营商");
    if (!input.cardType && oldNumber?.cardType) throw new UserActionError("请选择主卡或副卡");
    if (input.cardType !== "SECONDARY" && input.mainCardId) throw new UserActionError("只有副卡可以绑定主卡");
    const mainCard = input.mainCardId ? await tx.phoneNumber.findUnique({ where: { id: input.mainCardId } }) : null;
    if (input.cardType === "SECONDARY" && (!mainCard || mainCard.id === before?.id || mainCard.cardType !== "MAIN" || mainCard.branchId !== branch.id || (numberStatus(mainCard.status, mainCard.active) === "CANCELLED" && oldNumber?.mainCardId !== mainCard.id))) throw new UserActionError("请选择本公司有效主卡，不能绑定自身或其他副卡");
    if (before && (input.cardType !== "MAIN" || before.branchId !== branch.id || input.status === "CANCELLED") && await tx.phoneNumber.count({ where: { mainCardId: before.id } })) throw new UserActionError("请先解除或转移所属副卡，再修改主卡类型、调拨或注销");
    const oldSlot = before ? await tx.deviceSlot.findUnique({ where: { phoneNumberId: before.id } }) : null;
    const deviceId = input.phoneDeviceId && input.phoneDeviceId !== "other" ? input.phoneDeviceId : null;
    if (input.phoneDeviceId === "other" && !input.otherPhone) throw new UserActionError("请填写其他手机说明，例如使用人的手机");
    if (deviceId) {
      const device = await tx.assetDevice.findUnique({ where: { id: deviceId } });
      if (!device || device.kind !== "PHONE" || device.branchId !== branch.id || (!device.active && oldSlot?.deviceId !== device.id)) throw new UserActionError("所在手机必须为本公司已登记的有效手机");
      if (!input.phoneSlot) throw new UserActionError("请选择手机卡槽");
      const occupied = await tx.deviceSlot.findUnique({ where: { deviceId_slot: { deviceId, slot: Number(input.phoneSlot) } } });
      if (occupied && occupied.phoneNumberId !== before?.id) throw new UserActionError("所选手机卡槽已被其他号码占用，请先移出原号码");
    }
    const desired = input.accountId ? await tx.douyinAccount.findUnique({ where: { id: input.accountId } }) : null;
    if (input.accountId && (!desired || desired.branchId !== branch.id)) throw new UserActionError("抖音账号必须属于所选分公司");
    const previouslyLinked = before ? await tx.douyinAccount.findUnique({ where: { phoneNumberId: before.id } }) : null;
    if (desired?.phoneNumberId && desired.phoneNumberId !== before?.id) throw new UserActionError("所选抖音账号已绑定其他手机号，请先解除原绑定");
    if (previouslyLinked && previouslyLinked.id !== desired?.id) await assignNumber(tx, token, previouslyLinked, null, ip);
    const status = input.status || numberStatus(oldNumber?.status ?? null, common.active);
    const data = { ...allocation, active: status === "NORMAL", status, number, openedBy: input.openedBy, wechat: input.wechat, xiaohongshu: input.xiaohongshu, kuaishou: input.kuaishou, carrier: input.carrier, plan: input.plan, monthlyFeeCents: input.cardType === "SECONDARY" ? null : toCents(input.monthlyFee), dataGb: input.cardType === "SECONDARY" ? null : input.dataGb || null, cardType: input.cardType || null, mainCardId: input.mainCardId || null, otherPhone: input.phoneDeviceId === "other" ? input.otherPhone : "" };
    const saved = before ? await tx.phoneNumber.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 } } }) : await tx.phoneNumber.create({ data });
    id = saved.id;
    if (desired) await assignNumber(tx, token, desired, id, ip);
    if ((oldSlot?.deviceId ?? null) !== deviceId || (deviceId && oldSlot?.slot !== Number(input.phoneSlot))) {
      await tx.deviceSlot.deleteMany({ where: { phoneNumberId: id } });
      if (deviceId) await tx.deviceSlot.create({ data: { phoneNumberId: id, deviceId, slot: Number(input.phoneSlot), branchId: branch.id } });
      await tx.assetDevice.updateMany({ where: { id: { in: [oldSlot?.deviceId, deviceId].filter((v): v is string => !!v) } }, data: { version: { increment: 1 } } });
    }
  } else {
    if (!input.code || !input.model) throw new UserActionError("请填写编号与名称 / 型号");
    if (kind !== "phones" && !input.category) throw new UserActionError("请填写类型，例如电脑、办公家具或插排");
    if (input.sim1 && input.sim1 === input.sim2) throw new UserActionError("两个卡槽不能选择同一个手机号");
    if (kind !== "phones" && (input.sim1 || input.sim2)) throw new UserActionError("只有手机可以配置 SIM 卡槽");
    const simIds = [input.sim1, input.sim2].filter(Boolean);
    const numbers = await tx.phoneNumber.findMany({ where: { id: { in: simIds } }, include: { slot: true } });
    if (numbers.length !== simIds.length || numbers.some(n => n.branchId !== branch.id || (!n.active && n.slot?.deviceId !== before?.id))) throw new UserActionError("卡槽号码必须为本公司已启用的手机号");
    if (numbers.some(n => n.slot && n.slot.deviceId !== before?.id)) throw new UserActionError("手机号已装在其他手机，请先取出再分配");
    if (kind === "phones" && input.quantity && input.quantity !== "1") throw new UserActionError("手机按一机一档登记，数量必须为 1");
    if (!before && kind !== "phones" && !input.quantity) throw new UserActionError("请输入数量");
    const quantity = kind === "phones" ? 1 : input.quantity ? Number(input.quantity) : null;
    const financial = { quantity, unit: kind === "phones" ? "台" : input.unit || "件", purchaseDate: input.purchaseDate, purchaseUnitPriceCents: toCents(input.purchaseUnitPrice), currentUnitValueCents: toCents(input.currentUnitValue) };
    const loginIds = [...new Set(input.loginAccountIds ?? oldLoginIds)];
    if (kind !== "phones" && (loginIds.length || input.loginWechats)) throw new UserActionError("只有手机可以登记登录账号");
    const loginAccounts = await tx.douyinAccount.findMany({ where: { id: { in: loginIds }, branchId: branch.id } });
    if (loginAccounts.length !== loginIds.length) throw new UserActionError("登录抖音号必须属于手机所在分公司，调拨前请先解除原登录账号");
    const loginWechats = input.loginWechats === undefined ? undefined : [...new Set(input.loginWechats.split(/\r?\n/).map(s => s.trim()).filter(Boolean))].join("\n");
    const data = { loginWechats, ...allocation, ...financial, kind: deviceKind(kind), code: input.code, model: input.model, category: kind === "phones" ? "手机" : input.category, serialNumber: input.serialNumber };
    const saved = before ? await tx.assetDevice.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 } } }) : await tx.assetDevice.create({ data });
    id = saved.id;
    await tx.phoneAccountLogin.deleteMany({ where: { deviceId: id } });
    await tx.phoneAccountLogin.createMany({ data: loginIds.map(accountId => ({ deviceId: id, accountId, branchId: branch.id })) });
    const oldSlots = await tx.deviceSlot.findMany({ where: { deviceId: id } });
    const changedNumbers = [...new Set([...oldSlots.map(s => s.phoneNumberId), ...simIds])].filter(numberId => oldSlots.find(s => s.phoneNumberId === numberId)?.slot !== ([input.sim1, input.sim2].indexOf(numberId) + 1 || undefined));
    await tx.phoneNumber.updateMany({ where: { id: { in: changedNumbers } }, data: { otherPhone: "", version: { increment: 1 } } });
    await tx.deviceSlot.deleteMany({ where: { deviceId: id } });
    await tx.deviceSlot.createMany({ data: [input.sim1, input.sim2].flatMap((phoneNumberId, index) => phoneNumberId ? [{ deviceId: id, slot: index + 1, phoneNumberId, branchId: branch.id }] : []) });
  }
  // 操作内容包含关联变更，和实体保存同一事务，保留调拨、人员和卡槽修改记录。
  await writeAudit({ db: tx, actorId: actor.id, action: before ? "RESOURCE_UPDATE" : "RESOURCE_CREATE", targetType: kind, targetId: id, detail: { ...(kind === "phones" ? { previousLoginAccountIds: oldLoginIds } : {}), previousVersion: before?.version ?? 0, before: before ? JSON.parse(JSON.stringify(before)) : null, after: input }, ip });
  return id;
}

export async function splitMaterial(tx: Prisma.TransactionClient, token: string, id: string, version: number, ip: string) {
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  const source = await tx.assetDevice.findUnique({ where: { id }, include: { branch: true } });
  if (isExecutionController(actor) || !source || !canManageAccountBranch(actor, source.branch)) throw new UserActionError("仅老板或本公司负责人可以拆分物资");
  if (source.kind !== "MATERIAL" || source.individual || source.splitAt || !source.active || source.branch.status !== "ACTIVE") throw new UserActionError("此物资不能拆分，可能已经拆分或停用");
  if (source.version !== version) throw new UserActionError("资料已被修改，请刷新后核对再拆分");
  if (!source.quantity || source.quantity < 2 || source.quantity > 100) throw new UserActionError("本次支持拆分数量为 2 至 100 的物资批次");
  const codes = itemCodes(source.code, source.quantity);
  if (codes.some(code => code.length > 100)) throw new UserActionError("原编号过长，请先缩短至 96 字以内");
  if (await tx.assetDevice.count({ where: { code: { in: codes } } })) throw new UserActionError("生成的单件编号已有占用，未进行拆分，请核对原编号");
  const items = [];
  for (const code of codes) {
    const item = await tx.assetDevice.create({ data: {
      kind: "MATERIAL", individual: true, sourceAssetId: source.id, code, quantity: 1,
      model: source.model, category: source.category, unit: source.unit, purchaseDate: source.purchaseDate,
      purchaseUnitPriceCents: source.purchaseUnitPriceCents, currentUnitValueCents: source.currentUnitValueCents,
      purpose: source.purpose, notes: source.notes, branchId: source.branchId, roomId: source.roomId,
      operatorId: source.operatorId, controllerId: source.controllerId, userId: source.userId,
    } });
    items.push(item.id);
    await writeAudit({ db: tx, actorId: actor.id, action: "RESOURCE_CREATE", targetType: "materials", targetId: item.id, detail: { operation: "split_item", sourceAssetId: id, code }, ip });
  }
  await tx.assetDevice.update({ where: { id }, data: { splitAt: new Date(), active: false, version: { increment: 1 } } });
  await writeAudit({ db: tx, actorId: actor.id, action: "RESOURCE_UPDATE", targetType: "materials", targetId: id, detail: { operation: "split", previousVersion: version, quantity: source.quantity, purchaseUnitPriceCents: source.purchaseUnitPriceCents, currentUnitValueCents: source.currentUnitValueCents, itemIds: items, codes }, ip });
  return id;
}

export async function createIndividualMaterials(tx: Prisma.TransactionClient, token: string, raw: unknown, ip: string) {
  const input = resourceSchema.parse(raw);
  if (input.id || !input.quantity || Number(input.quantity) > 100) throw new UserActionError("逐件建档每次支持新增 1 至 100 件");
  if (Number(input.quantity) > 1 && input.serialNumber) throw new UserActionError("每件序列号不同，请建档后分别填写，批量新增时留空");
  const id = await saveResource(tx, token, "materials", input, ip);
  if (Number(input.quantity) > 1) return splitMaterial(tx, token, id, 1, ip);
  await tx.assetDevice.update({ where: { id }, data: { individual: true } });
  await writeAudit({ db: tx, actorId: (await requireAccountActor(tx, token)).id, action: "RESOURCE_UPDATE", targetType: "materials", targetId: id, detail: { operation: "individual_registration" }, ip });
  return id;
}

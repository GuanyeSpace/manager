import { Role } from "@/app/generated/prisma/enums";
import type { Prisma } from "@/app/generated/prisma/client";
import { ROLE_LABELS } from "./role-labels";
export type RoleHolder = { role: Role; roles?: Role[] };
// role 保留旧岗位，roles 只存兼任岗位；历史员工无需回填。
export function userRoles(user: RoleHolder): Role[] { return [...new Set([user.role, ...(user.roles ?? [])])]; }
export function hasRole(user: RoleHolder, role: Role): boolean { return userRoles(user).includes(role); }
export function roleWhere(role: Role): Prisma.UserWhereInput { return { OR: [{ role }, { roles: { has: role } }] }; }
export function rolesLabel(user: RoleHolder): string { return userRoles(user).map(role => ROLE_LABELS[role]).join("、"); }

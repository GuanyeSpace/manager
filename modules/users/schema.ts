import { z } from "zod";
import { Role } from "@/app/generated/prisma/enums";

const roleValues = Object.values(Role) as [Role, ...Role[]];

// 新增用户表单。老板岗位不需要分公司（跨分公司），其他岗位必须选。
export const createUserSchema = z
  .object({
    name: z.string().trim().min(1, "请输入姓名").max(30, "姓名不能超过 30 字"),
    username: z
      .string()
      .trim()
      .min(2, "用户名至少 2 个字符")
      .max(30, "用户名不能超过 30 字")
      .regex(/^[a-zA-Z0-9_.-]+$/, "用户名只能包含字母、数字、下划线、点、横线"),
    initialPassword: z.string().min(8, "初始密码至少 8 位"),
    role: z.enum(roleValues, { message: "请选择岗位" }).optional(),
    roles: z.array(z.enum(roleValues)).min(1, "请至少选择一个岗位").max(roleValues.length).optional(),
    expectedRoles: z.string().optional(),
    branchId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.roles?.length && !data.role) ctx.addIssue({ code: "custom", path: ["roles"], message: "请至少选择一个岗位" });
    if (!(data.roles ?? (data.role ? [data.role] : [])).includes(Role.BOSS) && !data.branchId) {
      ctx.addIssue({
        code: "custom",
        path: ["branchId"],
        message: "非老板岗位必须选择所属分公司",
      });
    }
  }).transform(data => {
    const roles = [...new Set(data.roles ?? [data.role!])];
    return { ...data, roles, role: roles.includes(Role.BOSS) ? Role.BOSS : roles[0] };
  });

// 编辑用户表单（用户名不可改，见需求）
export const updateUserSchema = z
  .object({
    userId: z.string().min(1, "缺少用户标识"),
    name: z.string().trim().min(1, "请输入姓名").max(30, "姓名不能超过 30 字"),
    role: z.enum(roleValues, { message: "请选择岗位" }).optional(),
    roles: z.array(z.enum(roleValues)).min(1, "请至少选择一个岗位").max(roleValues.length).optional(),
    expectedRoles: z.string().optional(),
    branchId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.roles?.length && !data.role) ctx.addIssue({ code: "custom", path: ["roles"], message: "请至少选择一个岗位" });
    if (!(data.roles ?? (data.role ? [data.role] : [])).includes(Role.BOSS) && !data.branchId) {
      ctx.addIssue({
        code: "custom",
        path: ["branchId"],
        message: "非老板岗位必须选择所属分公司",
      });
    }
  }).transform(data => {
    const roles = [...new Set(data.roles ?? [data.role!])];
    return { ...data, roles, role: roles.includes(Role.BOSS) ? Role.BOSS : roles[0] };
  });

export const resetPasswordSchema = z.object({
  userId: z.string().min(1, "缺少用户标识"),
  newPassword: z.string().min(8, "新密码至少 8 位"),
});

export const userIdSchema = z.object({
  userId: z.string().min(1, "缺少用户标识"),
});

// 用户列表筛选参数（来自 URL 查询串，非法值一律回落到默认值）
export const usersFilterSchema = z.object({
  q: z.string().trim().max(50, "搜索词过长").catch(""),
  role: z.enum([...roleValues, "ALL"]).catch("ALL"),
  branchId: z.string().catch("ALL"),
  status: z.enum(["ACTIVE", "RESIGNED", "ALL"]).catch("ACTIVE"), // 默认只显示在职
});

import { z } from "zod";

// 分公司名称校验（新增与重命名共用）
export const branchNameSchema = z.object({
  name: z.string().trim().min(1, "请输入分公司名称").max(50, "名称不能超过 50 字"),
});

// 新增分公司表单
export const createBranchSchema = branchNameSchema;

// 重命名分公司表单（带隐藏的 branchId）
export const renameBranchSchema = branchNameSchema.extend({
  branchId: z.string().min(1, "缺少分公司标识"),
});

// 启停表单（带隐藏的 branchId）
export const toggleBranchSchema = z.object({
  branchId: z.string().min(1, "缺少分公司标识"),
});

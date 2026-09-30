import { z } from "zod";
export const profileSchema = z.object({
  version: z.coerce.number().int().min(0),
  nickname: z.string().trim().max(50, "昵称最多50字"),
  contactPhone: z.string().trim().max(30).refine(v => !v || /^[+\d ()-]{5,30}$/.test(v), "请输入有效联系电话"),
});
export type ProfileState = { error?: string; success?: string; version?: number } | undefined;

import { z } from "zod";

// 登录表单校验。前后端共用：客户端不装 z 依赖，
// 校验真正生效在 server action 里（前端只做展示）。
export const loginSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});

// 修改密码表单校验（密码最短长度 8 位是开工前确认过的默认值）。
// oldPassword 是可选的：首次登录/重置后的强制改密不要求输入旧密码；
// 普通改密是否必填由服务端依据数据库里的 mustChangePassword 判断，不能信任客户端。
export const changePasswordSchema = z.object({
  oldPassword: z.string().optional(),
  newPassword: z.string().min(8, "新密码至少 8 位"),
  confirmPassword: z.string().min(1, "请再次输入新密码"),
});

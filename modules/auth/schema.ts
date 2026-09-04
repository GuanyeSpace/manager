import { z } from "zod";

// 登录表单校验。前后端共用：客户端不装 z 依赖，
// 校验真正生效在 server action 里（前端只做展示）。
export const loginSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});

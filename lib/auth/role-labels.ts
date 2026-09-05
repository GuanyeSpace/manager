// 岗位的中文显示名。服务端组件和客户端组件都要用，所以不能加 "server-only"。
import type { Role } from "@/app/generated/prisma/enums";

export const ROLE_LABELS: Record<Role, string> = {
  BOSS: "老板",
  OPERATOR: "运营",
  CONTROLLER: "中控",
  ASSISTANT: "小助理",
  ANCHOR: "主播",
  FINANCE: "财务",
};

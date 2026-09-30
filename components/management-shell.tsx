import { getCurrentUser } from "@/lib/auth/session";
import { workspaceLinks } from "@/lib/auth/workspaces";
import { ManagementShellChrome } from "@/components/management-shell-chrome";

// 共享管理布局：服务端壳只负责把「当前岗位可进入的工作台」交给展示层。
// 各 layout 仍保留自己的身份检查；这里不授权，读取会话也不放宽任何范围。
export async function ManagementShell({ name, children }: { name: string; children: React.ReactNode }) {
  const user = await getCurrentUser();
  return <ManagementShellChrome name={name} workspaces={user ? workspaceLinks(user) : []}>{children}</ManagementShellChrome>;
}

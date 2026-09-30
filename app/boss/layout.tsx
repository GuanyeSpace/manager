import { requireBossPage } from "@/lib/auth/permissions";
import { ManagementShell } from "@/components/management-shell";
export default async function BossLayout({ children }: { children: React.ReactNode }) {
  const user = await requireBossPage();
  return <ManagementShell name={user.name}>{children}</ManagementShell>;
}

import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { WorkbenchHome } from "@/components/workbench-home";
export default async function WorkbenchPage() {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  return <WorkbenchHome name={user.name} />;
}

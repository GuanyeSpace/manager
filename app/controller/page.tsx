import { requireControllerPage } from "@/lib/auth/permissions";
import { ControllerShell } from "@/components/controller-shell";
import { WorkbenchHome } from "@/components/workbench-home";
export default async function ControllerPage() {
  const user = await requireControllerPage();
  return <ControllerShell name={user.name}><WorkbenchHome name={user.name} /></ControllerShell>;
}

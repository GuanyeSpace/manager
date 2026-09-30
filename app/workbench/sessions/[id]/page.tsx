import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { WorkSessionView } from "@/components/work-session-view";
export default async function WorkSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  return <WorkSessionView id={(await params).id} />;
}

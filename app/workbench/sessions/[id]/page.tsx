import { ReturnLink } from "@/components/context-link";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { WorkSessionView } from "@/components/work-session-view";
export default async function WorkSessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  return <><ReturnLink fallback="/workbench/history" label="返回场次记录" /><WorkSessionView id={(await params).id} edit={(await searchParams).edit === "yes"} /></>;
}

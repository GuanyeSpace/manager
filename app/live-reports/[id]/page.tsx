import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { LiveReportDetails } from "@/components/live-report-details";
export default async function LiveReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ via?: string }> }) {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  const { id } = await params;
  return <LiveReportDetails id={id} via={(await searchParams).via} />;
}

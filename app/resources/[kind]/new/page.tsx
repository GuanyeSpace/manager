import { ReturnLink } from "@/components/context-link";
import { notFound } from "next/navigation";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getResourceOptions } from "@/modules/resources/queries";
import { isResourceKind, resourceLabels } from "@/modules/resources/schema";
import { ResourceForm } from "@/components/resource-form";
export default async function NewResourcePage({ params }: { params: Promise<{ kind: string }> }) {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  const { kind } = await params; if (!isResourceKind(kind)) notFound();
  const options = await getResourceOptions(); if (!options.branches.length) notFound();
  return <><ReturnLink fallback={`/resources/${kind}`} label={`返回${resourceLabels[kind]}管理`} /><h1 className="text-2xl font-semibold">新增{resourceLabels[kind]}</h1><div className="max-w-4xl"><ResourceForm kind={kind} options={options} /></div></>;
}

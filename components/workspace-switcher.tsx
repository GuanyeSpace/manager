import { verifiedPreviewContext } from "@/lib/auth/preview-context";
import { headers } from "next/headers";
import { PREVIEW_HEADER,previewRoles } from "@/lib/auth/preview-path";
import { WorkspacePreviewFrame } from "./workspace-preview-frame";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { workspaceLinks } from "@/lib/auth/workspaces";
export async function WorkspaceSwitcher() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return null;
  const preview=verifiedPreviewContext((await headers()).get(PREVIEW_HEADER));
  if(preview)return <WorkspacePreviewFrame prefix={preview.prefix} name={user.name} label={previewRoles[preview.role].label}/>;
  const links = workspaceLinks(user);
  if (links.length < 2) return null;
  return <nav aria-label="工作台切换" className="global-workspace-switcher flex flex-wrap items-center gap-3 border-b bg-emerald-50 px-6 py-2 text-sm"><span className="text-slate-500">切换工作台</span>{links.map(link => <Link key={link.href} href={link.href} className="rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-emerald-900 hover:bg-emerald-100">{link.label}</Link>)}</nav>;
}

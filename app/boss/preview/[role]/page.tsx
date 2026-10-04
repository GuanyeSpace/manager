import { notFound } from "next/navigation";
import { requireBossPage } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { roleWhere } from "@/lib/auth/roles";
import { previewRoles,type PreviewRole } from "@/lib/auth/preview-path";
export default async function Page({params}:{params:Promise<{role:string}>}){
 await requireBossPage();const {role}=await params;if(!Object.hasOwn(previewRoles,role))notFound();const spec=previewRoles[role as PreviewRole];
 const people=await prisma.user.findMany({where:{employmentStatus:"ACTIVE",AND:[roleWhere(spec.role)]},select:{id:true,name:true,mustChangePassword:true,branch:{select:{name:true}}},orderBy:{name:"asc"}});
 return <><h1 className="text-2xl font-semibold">{spec.label}工作台预览</h1><p className="text-sm text-slate-500">选择员工，按该员工的实际岗位和数据范围只读浏览，不创建员工会话。</p><div className="grid gap-4 md:grid-cols-3">{people.map(p=><section key={p.id} className="space-y-3 rounded border p-4"><h2 className="font-semibold">{p.name}</h2><p className="text-sm">{p.branch?.name??"跨分公司"}</p>{p.mustChangePassword?<p className="text-sm text-slate-500">员工尚需修改初始密码，工作台暂不可用</p>:<a href={`/boss/preview/${role}/${p.id}/view${spec.path}`} className="text-emerald-900 underline">进入只读预览 →</a>}</section>)}</div>{!people.length&&<p>暂无具有该岗位的在职员工。</p>}</>;
}

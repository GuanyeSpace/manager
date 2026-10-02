import { roleWhere } from "@/lib/auth/roles";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireSettlementBoss } from "./service";
import { resolveFilters } from "./schema";
import { reportPeople, reportPeopleInclude } from "@/modules/live-reports/personnel";
import { shanghaiInput } from "@/modules/live-reports/schema";
export async function readComparison(tx:Prisma.TransactionClient,token:string,raw:unknown) {
  await requireSettlementBoss(tx,token);const filters=resolveFilters(raw,new Date(),true);
  const groups=new Map<string,{day:string;anchorId:string|null;anchorName:string;reportCount:number;reportJoins:number;reportEffective:number;confirmedCount:number;confirmedJoins:number;confirmedEffective:number;pending:number}>();
  const within=(day:string,anchorId:string|null)=>(!filters.from||day>=filters.from)&&(!filters.to||day<=filters.to)&&(!filters.anchorId||(filters.anchorId==="unrecorded"?!anchorId:anchorId===filters.anchorId));
  function get(day:string,anchorId:string|null,anchorName:string){const key=day+":"+(anchorId??"unrecorded");let row=groups.get(key);if(!row){row={day,anchorId,anchorName,reportCount:0,reportJoins:0,reportEffective:0,confirmedCount:0,confirmedJoins:0,confirmedEffective:0,pending:0};groups.set(key,row);}return row;}
  const reports=(await tx.liveReport.findMany({where:{deletedAt:null,monetizationDeletedAt:null,OR:[{workSessionId:null},{workSession:{deletedAt:null}}]},include:reportPeopleInclude})).map(reportPeople);
  const included=new Set<string>();
  for(const r of reports){const day=shanghaiInput(r.startedAt).slice(0,10);if(!within(day,r.anchorId))continue;
    const g=get(day,r.anchorId,r.anchorName);
    if((r.workSession?.leadTask&&!r.workSession.leadTask.completedAt)||r.workSession?.leadTask?.deletedAt||r.backendJoinCount===null||r.effectiveCount===null){if(!r.workSessionId)g.pending++;continue;}
    g.reportCount++;g.reportJoins+=r.backendJoinCount;g.reportEffective+=r.effectiveCount;if(r.workSessionId)included.add(r.workSessionId);
  }
  const sessions=await tx.workSession.findMany({where:{deletedAt:null,leadEligible:true,startedAt:{not:null},phase:{in:["LIVE","WRAP","COMPLETE"]}},include:{sourceRecord:true}});
  for(const s of sessions){if(included.has(s.id))continue;const day=shanghaiInput(s.startedAt!).slice(0,10),anchorId=s.actualAnchorId??s.sourceRecord.anchorId;if(within(day,anchorId))get(day,anchorId,s.actualAnchorName??s.sourceRecord.anchorName??"未记录").pending++;}
  const confirmed=await tx.confirmedLead.findMany({where:{deletedAt:null,day:{...(filters.from?{gte:filters.from}:{}),...(filters.to?{lte:filters.to}:{})},...(filters.anchorId?{anchorId:filters.anchorId}:{})}});
  for(const c of confirmed){const g=get(c.day,c.anchorId,c.anchorName);g.confirmedCount++;g.confirmedJoins+=c.joinCount;g.confirmedEffective+=c.effectiveCount;}
  const all=[...groups.values()].sort((a,b)=>b.day.localeCompare(a.day)||a.anchorName.localeCompare(b.anchorName));
  const pages=Math.max(1,Math.ceil(all.length/30)),page=Math.min(filters.page,pages);
  const historicalAnchors=[...new Map([...groups.values()].filter(r=>r.anchorId).map(r=>[r.anchorId!,{id:r.anchorId!,name:r.anchorName}])).values()];
  const anchors=[...new Map([...(await tx.user.findMany({where:roleWhere("ANCHOR"),select:{id:true,name:true}})),...historicalAnchors].map(p=>[p.id,p])).values()].sort((a,b)=>a.name.localeCompare(b.name));
  return {filters:{...filters,page},rows:all.slice((page-1)*30,page*30),pages,count:all.length,anchors};
}

import assert from "node:assert/strict";
import {validateTestEnv,resolveTestClient,assertTestDatabase,newRunId,cleanupRun} from "./lib/test-db";
import {saveExternalAnchor,readExternalAnchors} from "../modules/external-anchors/service";
import {readAccountList} from "../modules/accounts/data";
import {readConfigAccounts,runWorkCommand} from "../modules/workbench/service";
import {saveBackend} from "../modules/settlements/service";
import {readDirectOptions} from "../modules/direct-leads/service";
async function main(){
 const {dbName}=validateTestEnv(),db=resolveTestClient(),marker=newRunId();let verified=false,ext="";
 try{
  await assertTestDatabase(db,dbName);verified=true;
  const branch=await db.branch.create({data:{name:marker}});
  async function person(role:"BOSS"|"OPERATOR"|"LEAD_SPECIALIST"){const u=await db.user.create({data:{username:marker+role,name:role,role,branchId:branch.id,passwordHash:"test",mustChangePassword:false}});const token=marker+role;await db.session.create({data:{id:token,userId:u.id,expiresAt:new Date(Date.now()+3600000)}});return {id:u.id,token};}
  const boss=await person("BOSS"),manager=await person("OPERATOR"),lead=await person("LEAD_SPECIALIST");await db.branch.update({where:{id:branch.id},data:{managerId:manager.id}});
  const accounts=[{id:"",version:0,name:"账号一",douyinId:marker+"1",active:true},{id:"",version:0,name:"账号二",douyinId:marker+"2",active:true}];
  ext=await db.$transaction(tx=>saveExternalAnchor(tx,boss.token,{version:0,name:marker,notes:"备注",accounts},"test"));
  const row=(await db.$transaction(tx=>readExternalAnchors(tx,boss.token))).rows.find(r=>r.id===ext)!;
  assert.equal(row.accounts.length,2);assert.equal(row.branchId,null);
  await assert.rejects(db.$transaction(tx=>readExternalAnchors(tx,manager.token)),/仅老板/);
  await assert.rejects(db.$transaction(tx=>saveExternalAnchor(tx,manager.token,{id:ext,version:1,command:"toggle"},"test")),/仅老板/);
  assert(!(await db.$transaction(tx=>readAccountList(tx,boss.token))).accounts.some(a=>row.accounts.some(b=>b.id===a.id)));
  assert(!(await db.$transaction(tx=>readConfigAccounts(tx,boss.token))).some(a=>row.accounts.some(b=>b.id===a.id)));
  await assert.rejects(db.$transaction(tx=>runWorkCommand(tx,boss.token,{id:row.accounts[0].id,command:"create"},"test")));
  const first=row.accounts[0],old=await db.accountRecord.findFirstOrThrow({where:{accountId:first.id,endedAt:null}});
  await assert.rejects(db.$transaction(tx=>saveExternalAnchor(tx,boss.token,{id:ext,version:1,name:marker,accounts:[{...first,douyinId:row.accounts[1].douyinId},row.accounts[1]]},"test")),/不能重复/);
  await assert.rejects(db.$transaction(tx=>saveExternalAnchor(tx,boss.token,{id:ext,version:1,name:marker,accounts:[first]},"test")),/停用/);
  const changed=row.accounts.map((a,i)=>({...a,active:i!==0,name:i===0?"改名账号":a.name}));
  const race=await Promise.allSettled([1,2].map(()=>db.$transaction(tx=>saveExternalAnchor(tx,boss.token,{id:ext,version:1,name:marker,accounts:changed},"test"))));assert.equal(race.filter(r=>r.status==="fulfilled").length,1);
  assert.equal((await db.accountRecord.findUniqueOrThrow({where:{id:old.id}})).name,first.name);assert((await db.accountRecord.findUniqueOrThrow({where:{id:old.id}})).endedAt);
  assert(!(await db.$transaction(tx=>readDirectOptions(tx,lead.token))).accounts.some(a=>a.id===first.id));
  const latest=(await db.$transaction(tx=>readExternalAnchors(tx,boss.token))).rows.find(r=>r.id===ext)!;
  await assert.rejects(db.$transaction(async tx=>{await saveExternalAnchor(tx,boss.token,{id:ext,version:latest.version,name:"回滚",accounts:latest.accounts},"test");throw Error("rollback");}),/rollback/);
  assert.equal((await db.externalAnchor.findUniqueOrThrow({where:{id:ext}})).name,marker);
  const backend=await db.$transaction(tx=>saveBackend(tx,boss.token,{version:0,name:marker,notes:"说明",active:"true"},"test"));
  await db.leadBackend.update({where:{id:backend},data:{url:"historical-link"}});
  await db.$transaction(tx=>saveBackend(tx,boss.token,{id:backend,version:1,name:marker,active:"false",reason:"停用"},"test"));
  const b=await db.leadBackend.findUniqueOrThrow({where:{id:backend}});assert.equal(b.notes,"说明");assert.equal(b.url,"historical-link");assert.equal(b.active,false);
  await assert.rejects(db.$transaction(tx=>saveBackend(tx,boss.token,{id:backend,version:1,name:marker,active:"true",reason:"旧窗口"},"test")),/已被修改/);
  assert(await db.auditLog.count({where:{targetId:ext}})>=2);
  console.log("PASS: multi-account save, disable/history, stale version, rollback, boss-only directory, company list exclusion, backend notes/link preservation");
 }finally{if(verified){const ids=(await db.douyinAccount.findMany({where:{douyinId:{startsWith:marker}},select:{id:true}})).map(a=>a.id);await db.accountRecord.deleteMany({where:{accountId:{in:ids}}});await db.douyinAccount.deleteMany({where:{id:{in:ids}}});if(ext)await db.externalAnchor.delete({where:{id:ext}});await db.leadBackend.deleteMany({where:{name:marker}});await db.branch.updateMany({where:{name:marker},data:{managerId:null}});await cleanupRun(db,marker);}await db.$disconnect();}
}
main().then(()=>console.log("ALL PASS (including cleanup)")).catch(e=>{console.error(e);process.exitCode=1;});

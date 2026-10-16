import assert from "node:assert/strict";
import { resolveTestClient, validateTestEnv, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";
import { createLoginSession, changePasswordSession, renewLoginSession, SessionRevokedError } from "../modules/auth/auth-service";
import { REMEMBER_DURATION_MS, SESSION_DURATION_MS } from "../lib/auth/session-core";

async function main() {
  const {dbName}=validateTestEnv(), db=resolveTestClient(), marker=newRunId(); await assertTestDatabase(db,dbName);
  try {
    const user=await db.user.create({data:{username:marker+'-remember',name:marker,passwordHash:'hash',role:'BOSS',mustChangePassword:false}});
    const login=(rememberMe=false)=>db.$transaction(tx=>createLoginSession(tx,{userId:user.id,verifiedHash:'hash',ip:null,rememberMe}));
    const ordinary=await login(), remembered=await login(true);
    assert(Math.abs(ordinary.expiresAt.getTime()-Date.now()-SESSION_DURATION_MS)<5000);
    assert(Math.abs(remembered.expiresAt.getTime()-Date.now()-REMEMBER_DURATION_MS)<5000);
    assert.equal(await db.$transaction(tx=>renewLoginSession(tx,ordinary.token)),null);
    const auditCount=await db.auditLog.count({where:{actorId:user.id}});
    const now=new Date(), oldExpiry=new Date(now.getTime()+28*86400000);
    await db.session.update({where:{id:remembered.token},data:{expiresAt:oldExpiry}});
    const results=await Promise.all([0,1].map(()=>db.$transaction(tx=>renewLoginSession(tx,remembered.token,now))));
    assert.equal(results[0]!.getTime(),now.getTime()+REMEMBER_DURATION_MS);assert.equal(results[0]!.getTime(),results[1]!.getTime());
    const sameDay=await db.$transaction(tx=>renewLoginSession(tx,remembered.token,new Date(now.getTime()+3600000)));
    assert.equal(sameDay!.getTime(),results[0]!.getTime());assert.equal(await db.auditLog.count({where:{actorId:user.id}}),auditCount);
    // 退出/过期不能重建。
    await db.session.delete({where:{id:ordinary.token}});
    await assert.rejects(db.$transaction(tx=>renewLoginSession(tx,ordinary.token)),SessionRevokedError);
    const expired=await login(true);await db.session.update({where:{id:expired.token},data:{expiresAt:now}});
    await assert.rejects(db.$transaction(tx=>renewLoginSession(tx,expired.token,now)),SessionRevokedError);
    // 本人改密保持选择，旧会话全失效。
    const changed=await db.$transaction(tx=>changePasswordSession(tx,{userId:user.id,sessionToken:remembered.token,verifiedHash:'hash',newPasswordHash:'newhash',ip:null}));
    assert.equal((await db.session.findUniqueOrThrow({where:{id:changed.token}})).rememberMe,true);
    await assert.rejects(db.$transaction(tx=>renewLoginSession(tx,remembered.token)),SessionRevokedError);
    // 重置与续期同时发生，不得保留旧会话。
    await db.session.update({where:{id:changed.token},data:{expiresAt:oldExpiry}});
    await Promise.allSettled([db.$transaction(tx=>renewLoginSession(tx,changed.token)),db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${user.id} FOR UPDATE`;
      await tx.user.update({where:{id:user.id},data:{passwordHash:'reset'}});await tx.session.deleteMany({where:{userId:user.id}});
    })]);
    assert.equal(await db.session.count({where:{userId:user.id}}),0);
    const departed=await db.session.create({data:{id:marker+'-left',userId:user.id,expiresAt:new Date(Date.now()+REMEMBER_DURATION_MS),rememberMe:true}});
    await db.user.update({where:{id:user.id},data:{employmentStatus:'RESIGNED'}});
    await assert.rejects(db.$transaction(tx=>renewLoginSession(tx,departed.id)),SessionRevokedError);
    console.log('PASS remember/legacy/daily renewal/concurrency/expiry/logout/password/reset/resignation');
  } finally {await cleanupRun(db,marker);await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

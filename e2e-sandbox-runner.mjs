// Private Cloudflare Cron acceptance runner. Test-only: NEVER deploy to Production D1.
// This Worker has no public hostname, route or exposed endpoint. Runs once per RUN_ID.
// It calls the actual source engine with Cloudflare's real D1 binding, not a mock.
import engine, { reserve, settle, sweepExpiredReservations, sweepExpiredAvailableLots,applyCredit } from "./engine.mjs";
const RUN_ID="bat-d1-e2e-overdraft-20261024-06";
const BASE=Date.now() + 48*3600000; // future logical clock: production sandbox Cron can't race
const assert=(ok, why)=>{if(!ok)throw Error(why)};
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const call=async(r)=>({status:r.status,data:await r.json()});
const cid=(user,suffix)=>({user_id:user,app_id:"e2e_app",operation_id:"e2e_op_"+suffix});
async function seed(db,u,values,expiry){
 const qty=values.reduce((a,b)=>a+b,0);
 const b=[db.prepare("INSERT INTO battery_wallets(user_id,available_units,reserved_units,version) VALUES(?,?,0,1)").bind(u,qty)];
 for(let i=0;i<values.length;i++)b.push(db.prepare("INSERT INTO battery_lots(lot_id,user_id,source,expires_at_ms,available_units,reserved_units) VALUES(?,?,'sandbox_e2e',?,?,0)").bind(u+"_lot_"+i,u,expiry[i],values[i]));
 await db.batch(b);
}
async function clean(db,u){
 await db.batch([
  db.prepare("DELETE FROM battery_reservation_allocations WHERE reservation_id IN (SELECT reservation_id FROM battery_reservations WHERE user_id=?)").bind(u),
  db.prepare("DELETE FROM battery_ledger WHERE user_id=?").bind(u),
  db.prepare("DELETE FROM battery_reservations WHERE user_id=?").bind(u),
  db.prepare("DELETE FROM battery_lots WHERE user_id=?").bind(u),
  db.prepare("DELETE FROM battery_credit_receipts WHERE user_id=?").bind(u),
  db.prepare("DELETE FROM battery_overdraft_accounts WHERE user_id=?").bind(u),
  db.prepare("DELETE FROM battery_wallets WHERE user_id=?").bind(u)
 ]);
}
async function testOn(db,label,callback){
 const u="e2e_20261024_"+label;
 try {await clean(db,u); await callback(u); return {name:label,pass:true};}
 catch(e){return {name:label,pass:false,error:String(e).slice(0,280)}}
 finally{try{await clean(db,u)}catch(e){/* test summary records the original error; orphan detection runs later */}}
}
async function main(db){
 const checks=[];
 checks.push(await testOn(db,"fefo",async u=>{
  await seed(db,u,[5,7],[BASE+90000,BASE+300000]);
  const c={...cid(u,"fefo"),quantity:8};
  const a=await call(await reserve(db,c,BASE));assert(a.status===200,"reserve 8 failed "+JSON.stringify(a));
  const w=await one(db,"SELECT available_units,reserved_units FROM battery_wallets WHERE user_id=?",u);
  assert(w.available_units===4&&w.reserved_units===8,"wallet after reservation "+JSON.stringify(w));
  const lots=await all(db,"SELECT available_units,reserved_units FROM battery_lots WHERE user_id=? ORDER BY expires_at_ms",u);
  assert(lots[0].available_units===0&&lots[0].reserved_units===5&&lots[1].available_units===4&&lots[1].reserved_units===3,"FEFO incorrect "+JSON.stringify(lots));
  const dup=await call(await reserve(db,c,BASE+100));assert(dup.status===200&&dup.data.idempotent===true,"duplicate not idempotent");
  const cm=await call(await settle(db,c,"commit",BASE+1000));assert(cm.status===200,"commit failure");
  const cm2=await call(await settle(db,c,"commit",BASE+1001));assert(cm2.status===200&&cm2.data.idempotent,"double-commit should idempotent");
  const after=await one(db,"SELECT available_units,reserved_units FROM battery_wallets WHERE user_id=?",u);
  const led=await one(db,"SELECT COUNT(*) AS n,SUM(quantity_delta) AS amount FROM battery_ledger WHERE user_id=?",u);
  assert(after.available_units===4&&after.reserved_units===0&&led.n===1&&led.amount===-8,"commit/ledger mismatch");
 }));
 checks.push(await testOn(db,"cancel",async u=>{
  await seed(db,u,[9],[BASE+1000000]);const c={...cid(u,"cancel"),quantity:6};
  assert((await call(await reserve(db,c,BASE))).status===200,"reserve failure");
  assert((await call(await settle(db,c,"release",BASE+1000))).status===200,"release failure");
  const r=await call(await settle(db,c,"release",BASE+1100));
  const w=await one(db,"SELECT available_units,reserved_units FROM battery_wallets WHERE user_id=?",u);
  const n=await one(db,"SELECT COUNT(*) AS n FROM battery_ledger WHERE user_id=?",u);
  assert(r.status===200&&r.data.idempotent===true&&w.available_units===9&&w.reserved_units===0&&n.n===0,"full refund/duplicate failed");
 }));
 checks.push(await testOn(db,"timeout",async u=>{
  await seed(db,u,[10],[BASE+1000000]);const c={...cid(u,"timeout"),quantity:3};
  assert((await call(await reserve(db,c,BASE))).status===200,"reserve failure");
  const sweep=await sweepExpiredReservations(db,BASE+180001);
  assert(sweep.expired>=1&&sweep.failed===0,"Cron timeout return "+JSON.stringify(sweep));
  const late=await call(await settle(db,c,"commit",BASE+180002));
  const w=await one(db,"SELECT available_units,reserved_units FROM battery_wallets WHERE user_id=?",u);
  assert(late.status===409&&w.available_units===10&&w.reserved_units===0,"late commit or wallet corruption");
 }));
 checks.push(await testOn(db,"expired",async u=>{
  await seed(db,u,[4,6],[BASE+500,BASE+500000]);const c={...cid(u,"expired"),quantity:7};
  assert((await call(await reserve(db,c,BASE))).status===200,"reserve failure");
  const commit=await call(await settle(db,c,"commit",BASE+600));
  assert(commit.status===409&&commit.data.error==="reservation_lot_expired_must_release","expired lot allowed commit");
  const refund=await call(await settle(db,c,"release",BASE+600));
  const w=await one(db,"SELECT available_units,reserved_units FROM battery_wallets WHERE user_id=?",u);
  assert(refund.status===200&&w.available_units===6&&w.reserved_units===0,"expired credits resurrected "+JSON.stringify(w));
 }));
 checks.push(await testOn(db,"cleanup",async u=>{
  await seed(db,u,[4,6],[BASE+500,BASE+500000]);
  const sweep=await sweepExpiredAvailableLots(db,BASE+600);
  const w=await one(db,"SELECT available_units,reserved_units FROM battery_wallets WHERE user_id=?",u);
  assert(sweep.cleared>=1&&sweep.failed===0&&w.available_units===6,"expired sweep corrupt "+JSON.stringify({sweep,w}));
 }));
 checks.push(await testOn(db,"concurrent",async u=>{
  await seed(db,u,[6],[BASE+500000]);const a={...cid(u,"racea"),quantity:5},b={...cid(u,"raceb"),quantity:5};
  const results=await Promise.all([reserve(db,a,BASE),reserve(db,b,BASE)]).then(xs=>Promise.all(xs.map(call)));
  const w=await one(db,"SELECT available_units,reserved_units FROM battery_wallets WHERE user_id=?",u);
  const n=await one(db,"SELECT COUNT(*) AS n FROM battery_reservations WHERE user_id=?",u);
  assert(results.filter(x=>x.status===200).length===1&&results.filter(x=>x.status===409).length===1,"overbooking results "+JSON.stringify(results));
  assert(w.available_units===1&&w.reserved_units===5&&n.n===1,"double-spend wallet "+JSON.stringify({w,n}));
 }));
 checks.push(await testOn(db,"overdraft_first",async u=>{
  await seed(db,u,[5],[BASE+500000]);
  const c={...cid(u,"overdraft_first"),quantity:10};
  const res=await call(await reserve(db,c,BASE));
  assert(res.status===200&&res.data.funded_units===5&&res.data.overdraft_units===5,"first overdraft reserve "+JSON.stringify(res));
  const pending=await one(db,"SELECT debt_units,successful_uses,active_reservation_id FROM battery_overdraft_accounts WHERE user_id=?",u);
  assert(pending.debt_units===0&&pending.successful_uses===0&&Boolean(pending.active_reservation_id),"reserve consumed debt or chance");
  const cm=await call(await settle(db,c,"commit",BASE+1000));assert(cm.status===200,"first overdraft commit "+JSON.stringify(cm));
  const a=await one(db,"SELECT debt_units,successful_uses,active_reservation_id FROM battery_overdraft_accounts WHERE user_id=?",u);
  assert(a.debt_units===5&&a.successful_uses===1&&a.active_reservation_id===null,"debt or chance not settled "+JSON.stringify(a));
  const repeat=await call(await settle(db,c,"commit",BASE+1001));assert(repeat.status===200&&repeat.data.idempotent===true,"commit replay");
 }));
 checks.push(await testOn(db,"two_chances_repay",async u=>{
  await seed(db,u,[],[]);
  for(const [suffix,qty] of [["chance_a",8],["chance_b",12]]){
   const c={...cid(u,suffix),quantity:qty};
   assert((await call(await reserve(db,c,BASE))).status===200,"reserve "+suffix);
   assert((await call(await settle(db,c,"commit",BASE+1000))).status===200,"commit "+suffix);
  }
  const exhausted=await call(await reserve(db,{...cid(u,"blocked_third"),quantity:1},BASE+2000));
  assert(exhausted.status===409&&exhausted.data.error==="overdraft_opportunities_exhausted","third chance permitted");
  const gift1=await call(await applyCredit(db,{credit_id:"credit_partial_123",user_id:u,source:"gift",quantity:19,expires_at_ms:BASE+999999},BASE+2000));
  assert(gift1.status===200&&gift1.data.repaid_units===19&&gift1.data.available_added_units===0,"partial debt repayment "+JSON.stringify(gift1));
  const stillBlocked=await call(await reserve(db,{...cid(u,"partial_blocked"),quantity:1},BASE+3000));
  assert(stillBlocked.status===409,"partial repayment restored chances");
  const gift2=await call(await applyCredit(db,{credit_id:"credit_finish_123",user_id:u,source:"gift",quantity:4,expires_at_ms:BASE+999999},BASE+3000));
  assert(gift2.status===200&&gift2.data.repaid_units===1&&gift2.data.available_added_units===3,"full repayment "+JSON.stringify(gift2));
  const acct=await one(db,"SELECT debt_units,successful_uses FROM battery_overdraft_accounts WHERE user_id=?",u);
  assert(acct.debt_units===0&&acct.successful_uses===0,"chances not instantly restored");
  const next={...cid(u,"new_cycle"),quantity:8};
  const rr=await call(await reserve(db,next,BASE+4000));
  assert(rr.status===200&&rr.data.funded_units===3&&rr.data.overdraft_units===5,"new two-chance cycle blocked "+JSON.stringify(rr));
  const cc=await call(await settle(db,next,"release",BASE+5000));assert(cc.status===200,"release renewed chance failed");
 }));
 checks.push(await testOn(db,"concurrent_overdraft",async u=>{
  await seed(db,u,[],[]);
  const a={...cid(u,"race_a"),quantity:5},b={...cid(u,"race_b"),quantity:6};
  const results=await Promise.all([reserve(db,a,BASE),reserve(db,b,BASE)]).then(xs=>Promise.all(xs.map(call)));
  assert(results.filter(x=>x.status===200).length===1&&results.filter(x=>x.status===409).length===1,"overdraft double-book "+JSON.stringify(results));
  const active=results[0].status===200?a:b;
  const release=await call(await settle(db,active,"release",BASE+1000));assert(release.status===200,"release active overdraft");
  const acct=await one(db,"SELECT debt_units,successful_uses,active_reservation_id FROM battery_overdraft_accounts WHERE user_id=?",u);
  assert(acct.debt_units===0&&acct.successful_uses===0&&acct.active_reservation_id===null,"release consumed chance");
 }));
 checks.push(await testOn(db,"credit_conflict",async u=>{
  await seed(db,u,[],[]);
  const c={...cid(u,"pending_credit"),quantity:3};
  assert((await call(await reserve(db,c,BASE))).status===200,"reserve");
  const x={credit_id:"credit_waiting_123",user_id:u,source:"gift",quantity:10,expires_at_ms:BASE+900000};
  const blocked=await call(await applyCredit(db,x,BASE+100));
  assert(blocked.status===409&&blocked.data.error==="overdraft_settlement_pending_retry","grant allowed to race overdraft");
  assert((await call(await settle(db,c,"release",BASE+200))).status===200,"release");
  assert((await call(await applyCredit(db,x,BASE+300))).status===200,"grant retry");
  const duplicate=await call(await applyCredit(db,x,BASE+400));
  assert(duplicate.status===200&&duplicate.data.idempotent,"grant idempotency");
 }));

 checks.push(await testOn(db,"credit_replay_metadata",async u=>{
  await seed(db,u,[],[]);
  const issue={credit_id:"credit_meta_replay_123",user_id:u,source:"gift",quantity:11,expires_at_ms:BASE+900000};
  const firstCredit=await call(await applyCredit(db,issue,BASE));
  assert(firstCredit.status===200&&firstCredit.data.available_added_units===11,"credit grant failed "+JSON.stringify(firstCredit));
  const replay=await call(await applyCredit(db,issue,BASE+1));
  assert(replay.status===200&&replay.data.idempotent===true,"idempotent exact credit failed");
  const changedSource=await call(await applyCredit(db,{...issue,source:"migration"},BASE+2));
  assert(changedSource.status===409&&changedSource.data.error==="credit_conflict","credit replay silently changed source");
  const changedExpiry=await call(await applyCredit(db,{...issue,expires_at_ms:BASE+999999},BASE+3));
  assert(changedExpiry.status===409&&changedExpiry.data.error==="credit_conflict","credit replay silently changed expiry");
  const audit=await one(db,"SELECT COUNT(*) AS n,SUM(quantity_delta) AS credits FROM battery_ledger WHERE user_id=? AND app_id='battery_issuer'",u);
  assert(audit.n===1&&audit.credits===11,"credit ledger duplicated or missing "+JSON.stringify(audit));
 }));
 checks.push(await testOn(db,"private_credit_authorization",async u=>{
  await seed(db,u,[],[]);
  const value={credit_id:"credit_secure_issue_123",user_id:u,source:"gift",quantity:5,expires_at_ms:Date.now()+48*3600000};
  const send=(header,env)=>engine.fetch(new Request("https://battery-engine.internal/v1/credit",{
    method:"POST",headers:{"Content-Type":"application/json","X-Battery-Credit-Authorization":header},body:JSON.stringify(value)
   }),env);
  const issuer="b".repeat(40),debit="d".repeat(40);
  const ctx={BATTERY_DB:db,BATTERY_ENGINE_SECRET:debit,BATTERY_CREDIT_ISSUER_SECRET:issuer,BATTERY_CREDIT_ENABLED:"true"};
  assert((await call(await send("Bearer "+debit,ctx))).status===403,"spend engine key authorizes credit");
  assert((await call(await send("Bearer "+issuer,{BATTERY_DB:db,BATTERY_ENGINE_SECRET:debit}))).status===503,"missing issuer fails open");
  const result=await call(await send("Bearer "+issuer,ctx));
  assert(result.status===200&&result.data.available_added_units===5,"privileged issuer failed "+JSON.stringify(result));
  const qty=await one(db,"SELECT available_units FROM battery_wallets WHERE user_id=?",u);
  assert(qty.available_units===5,"authorized grant ledger mismatch");
 }));
 const req=new Request("https://battery-engine.internal/v1/reserve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({app_id:"e2e_app",user_id:"e2e_authority",operation_id:"e2e_op_auth",quantity:1})});
 const guarded=await call(await engine.fetch(req,{BATTERY_DB:db}));
 checks.push({name:"authfailclosed",pass:guarded.status===503,error:guarded.status===503?undefined:"engine accepted request without internal Secret"});
 const leftovers=await one(db,"SELECT COUNT(*) AS n FROM battery_wallets WHERE user_id LIKE 'e2e_20261024_%'");
 checks.push({name:"cleanupall",pass:leftovers.n===0,error:leftovers.n===0?undefined:"leftover wallet rows "+leftovers.n});
 return {run_id:RUN_ID,passed:checks.filter(x=>x.pass).length,total:checks.length,checks,environment:"isolated_battery_d1",production:false};
}
export default {
 async scheduled(event,env){
  const db=env?.BATTERY_DB;if(!db?.batch)throw Error("isolated Battery D1 missing");
  await db.prepare("CREATE TABLE IF NOT EXISTS e2e_test_results (run_id TEXT PRIMARY KEY NOT NULL, created_at_ms INTEGER NOT NULL, passed INTEGER NOT NULL, total INTEGER NOT NULL, report TEXT NOT NULL)").run();
  const old=await one(db,"SELECT run_id FROM e2e_test_results WHERE run_id=?",RUN_ID);
  if(old)return;
  // A Cron may start a second invocation before the first one writes results.
  // Claim one immutable run id transactionally; never overlap sandbox tests.
  await db.prepare("CREATE TABLE IF NOT EXISTS e2e_run_claims (run_id TEXT PRIMARY KEY NOT NULL, claimed_at_ms INTEGER NOT NULL)").run();
  const claim=await db.prepare("INSERT OR IGNORE INTO e2e_run_claims(run_id,claimed_at_ms) VALUES(?,?)").bind(RUN_ID,Date.now()).run();
  if(Number(claim?.meta?.changes||0)!==1)return;
  let report;
  try{report=await main(db)}catch(e){report={run_id:RUN_ID,passed:0,total:1,checks:[{name:"fatal",pass:false,error:String(e).slice(0,250)}],production:false}}
  await db.prepare("INSERT OR IGNORE INTO e2e_test_results(run_id,created_at_ms,passed,total,report) VALUES(?,?,?,?,?)").bind(RUN_ID,Date.now(),report.passed,report.total,JSON.stringify(report)).run();
 },
 async fetch(){return new Response("not_found",{status:404})}
};
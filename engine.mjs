// Private Starry Battery settlement engine.
// NEVER expose this Worker on workers.dev, a public route, or a H-Global binding.
// Only the trusted Gateway may call it with a dedicated secret.
// All related D1 mutations are sent in a single atomic D1 batch().
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const reId=/^[A-Za-z0-9_-]{8,120}$/;
const reApp=/^[a-z0-9_-]{3,80}$/;
const reUser=/^[A-Za-z0-9_-]{4,180}$/;
const nowMs=()=>Date.now();
const MAX_UNITS=Number.MAX_SAFE_INTEGER;
const validQuantity=n=>Number.isSafeInteger(n)&&n>0&&n<=MAX_UNITS;
const SEC=()=>globalThis.crypto;
const first=async(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const many=async(db,sql,...args)=>{const r=await db.prepare(sql).bind(...args).all();return r.results||[]};
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const secureEqual=async(a,b)=>{
 const te=new TextEncoder(),x=new Uint8Array(await SEC().subtle.digest("SHA-256",te.encode(a))),y=new Uint8Array(await SEC().subtle.digest("SHA-256",te.encode(b)));
 let d=0;for(let i=0;i<x.length;i++)d|=x[i]^y[i];return d===0;
};
const record=async(db,c)=>first(db,"SELECT reservation_id,user_id,app_id,operation_id,state,quantity,funded_units,overdraft_units,deadline_at_ms FROM battery_reservations WHERE app_id=? AND operation_id=? LIMIT 1",c.app_id,c.operation_id);
function same(r,c){return r&&r.user_id===c.user_id&&r.app_id===c.app_id&&r.operation_id===c.operation_id;}
function summary(r,idempotent=false){return {operation_id:r.operation_id,reservation_id:r.reservation_id,status:r.state,quantity:r.quantity,deadline_at_ms:r.deadline_at_ms,overdraft_units:r.overdraft_units||0,idempotent};}

// Wallet available_units and lots remain nonnegative; actual debt is exclusively
// accounted for in battery_overdraft_accounts.debt_units.
export async function reserve(db,c,time=nowMs(),allowOverdraft=true){
 if(!validQuantity(c.quantity))return reply({error:"invalid_quantity"},400);
 const old=await record(db,c);
 if(old){if(!same(old,c)||old.quantity!==c.quantity)return reply({error:"operation_conflict"},409);return reply(summary(old,true));}
 const [wallet,account,lots]=await Promise.all([
  first(db,"SELECT available_units,version FROM battery_wallets WHERE user_id=?",c.user_id),
  first(db,"SELECT debt_units,successful_uses,active_reservation_id FROM battery_overdraft_accounts WHERE user_id=?",c.user_id),
  many(db,"SELECT lot_id,available_units,expires_at_ms FROM battery_lots WHERE user_id=? AND available_units>0 AND expires_at_ms>? ORDER BY expires_at_ms ASC,lot_id ASC",c.user_id,time)
 ]);
 let due=c.quantity,available=Math.max(0,Number(wallet?.available_units||0)),funded=0;
 const alloc=[];
 for(const lot of lots){
  const qty=Math.min(due,available,lot.available_units);
  if(qty>0){alloc.push({lot_id:lot.lot_id,quantity:qty});due-=qty;available-=qty;funded+=qty;}
  if(due===0)break;
 }
 const overdraft=due>0;
 if(overdraft&&!allowOverdraft)return reply({error:"overdraft_temporarily_disabled"},409);
 if(overdraft&&(Number(account?.successful_uses||0)>=2||account?.active_reservation_id))
  return reply({error:account?.active_reservation_id?"overdraft_already_in_progress":"overdraft_opportunities_exhausted"},409);
 // Reject any single operation that would exceed JS safe integer bookkeeping.
 if(overdraft&&Number(account?.debt_units||0)>MAX_UNITS-due)return reply({error:"debt_numeric_limit"},400);
 const reservation_id=SEC().randomUUID(),deadline_at_ms=time+180000;
 const ops=[
  stmt(db,"INSERT OR IGNORE INTO battery_wallets(user_id,available_units,reserved_units,version) VALUES(?,0,0,1)",c.user_id),
  stmt(db,"INSERT INTO battery_reservations(reservation_id,user_id,app_id,operation_id,state,quantity,funded_units,overdraft_units,deadline_at_ms) VALUES(?,?,?,?,?,?,?,?,?)",
   reservation_id,c.user_id,c.app_id,c.operation_id,"reserved",c.quantity,funded,due,deadline_at_ms),
  // Compare the wallet version; a concurrent grant, expiry or reservation aborts
  // this entire D1 batch rather than allowing debt based on a stale balance.
  stmt(db,"UPDATE battery_wallets SET available_units=CASE WHEN version=? AND available_units>=? THEN available_units-? ELSE -1 END,reserved_units=reserved_units+?,version=version+1 WHERE user_id=?",
   wallet?.version??1,funded,funded,funded,c.user_id)
 ];
 if(overdraft){
  ops.push(stmt(db,"INSERT OR IGNORE INTO battery_overdraft_accounts(user_id,debt_units,successful_uses,active_reservation_id) VALUES(?,0,0,NULL)",c.user_id));
  ops.push(stmt(db,"UPDATE battery_overdraft_accounts SET active_reservation_id=CASE WHEN active_reservation_id IS NULL AND successful_uses<2 AND debt_units<=? THEN ? ELSE '' END WHERE user_id=?",
    MAX_UNITS-due,reservation_id,c.user_id));
 }
 for(const a of alloc){
  ops.push(stmt(db,"UPDATE battery_lots SET available_units=CASE WHEN expires_at_ms>? AND available_units>=? THEN available_units-? ELSE -1 END,reserved_units=reserved_units+? WHERE lot_id=? AND user_id=?",
   time,a.quantity,a.quantity,a.quantity,a.lot_id,c.user_id));
  ops.push(stmt(db,"INSERT INTO battery_reservation_allocations(reservation_id,lot_id,quantity) VALUES(?,?,?)",reservation_id,a.lot_id,a.quantity));
 }
 try{
  await db.batch(ops);
  return reply({operation_id:c.operation_id,reservation_id,status:"reserved",quantity:c.quantity,funded_units:funded,overdraft_units:due,deadline_at_ms,idempotent:false,allocations:alloc.length});
 }catch{
  const existing=await record(db,c);
  if(existing&&same(existing,c)&&existing.quantity===c.quantity)return reply(summary(existing,true));
  return reply({error:"reservation_transaction_conflict_retry"},409);
 }
}

export async function settle(db,c,action,time=nowMs()){
 let r=await record(db,c);
 if(!r)return reply({error:"reservation_not_found"},404);
 if(!same(r,c))return reply({error:"operation_conflict"},409);
 if(r.state!=="reserved"){
  if(action==="commit"&&r.state==="committed")return reply(summary(r,true));
  if(action==="release"&&(r.state==="released"||r.state==="expired"))return reply(summary(r,true));
  return reply({error:"reservation_already_final",state:r.state},409);
 }
 if(action==="commit"&&r.deadline_at_ms<=time)return reply({error:"reservation_expired_must_release"},409);
 const allocations=await many(db,
  "SELECT a.lot_id,a.quantity,l.expires_at_ms FROM battery_reservation_allocations a JOIN battery_lots l ON l.lot_id=a.lot_id WHERE a.reservation_id=? ORDER BY l.expires_at_ms,a.lot_id",r.reservation_id);
 const funded=r.funded_units,overdraft=r.overdraft_units;
 if(allocations.reduce((n,a)=>n+a.quantity,0)!==funded||funded+overdraft!==r.quantity)
  return reply({error:"reservation_corrupt"},503);
 if(action==="commit"&&allocations.some(a=>a.expires_at_ms<=time))
  return reply({error:"reservation_lot_expired_must_release"},409);
 const next=action==="commit"?"committed":(time>=r.deadline_at_ms?"expired":"released");
 const ops=[stmt(db,
   "UPDATE battery_reservations SET state=CASE WHEN state='reserved' AND (?='released' OR ?='expired' OR deadline_at_ms>?) THEN ? ELSE 'invalid' END WHERE reservation_id=? AND user_id=?",
   next,next,time,next,r.reservation_id,c.user_id)];
 if(action==="commit"){
  ops.push(stmt(db,"UPDATE battery_wallets SET reserved_units=reserved_units-?,version=version+1 WHERE user_id=?",funded,c.user_id));
  for(const a of allocations)ops.push(stmt(db,"UPDATE battery_lots SET reserved_units=reserved_units-? WHERE lot_id=? AND user_id=?",a.quantity,a.lot_id,c.user_id));
  if(overdraft>0)ops.push(stmt(db,
   "UPDATE battery_overdraft_accounts SET debt_units=CASE WHEN active_reservation_id=? AND successful_uses<2 AND debt_units<=? THEN debt_units+? ELSE -1 END,successful_uses=successful_uses+1,active_reservation_id=NULL WHERE user_id=?",
   r.reservation_id,MAX_UNITS-overdraft,overdraft,c.user_id));
  ops.push(stmt(db,"INSERT INTO battery_ledger(entry_id,user_id,app_id,operation_id,quantity_delta,created_at_ms) VALUES(?,?,?,?,?,?)",
    SEC().randomUUID(),c.user_id,c.app_id,c.operation_id,-r.quantity,time));
 }else{
  const refundable=allocations.reduce((n,a)=>n+(a.expires_at_ms>time?a.quantity:0),0);
  ops.push(stmt(db,"UPDATE battery_wallets SET reserved_units=reserved_units-?,available_units=available_units+?,version=version+1 WHERE user_id=?",funded,refundable,c.user_id));
  for(const a of allocations){
   const refundableLot=a.expires_at_ms>time?a.quantity:0;
   ops.push(stmt(db,"UPDATE battery_lots SET reserved_units=reserved_units-?,available_units=available_units+? WHERE lot_id=? AND user_id=?",a.quantity,refundableLot,a.lot_id,c.user_id));
  }
  if(overdraft>0)ops.push(stmt(db,"UPDATE battery_overdraft_accounts SET active_reservation_id=CASE WHEN active_reservation_id=? THEN NULL ELSE '' END WHERE user_id=?",r.reservation_id,c.user_id));
 }
 try{await db.batch(ops);return reply({...summary({...r,state:next}),idempotent:false});}
 catch{
  r=await record(db,c);
  if(r&&same(r,c)&&(r.state===next||action==="release"&&r.state==="expired"))return reply(summary(r,true));
  return reply({error:"settlement_transaction_conflict_retry"},409);
 }
}

// Private, trusted credit issuance primitive. No public/app-facing grant route.
// Retrying a duplicate credit_id never gives additional battery. Credit delivery
// during an active overdraft returns 409; the issuer must retry after settlement.
export async function applyCredit(db,c,time=nowMs()){
 if(!c||!reId.test(c.credit_id||"")||!reUser.test(c.user_id||"")||
  !/^[a-z0-9_-]{3,80}$/.test(c.source||"")||!validQuantity(c.quantity)||
  !Number.isSafeInteger(c.expires_at_ms)||c.expires_at_ms<=time)
  return reply({error:"invalid_credit"},400);
 const existing=await first(db,"SELECT credit_id,user_id,quantity,source,expires_at_ms FROM battery_credit_receipts WHERE credit_id=?",c.credit_id);
 if(existing)return existing.user_id===c.user_id&&existing.quantity===c.quantity&&existing.source===c.source&&existing.expires_at_ms===c.expires_at_ms
  ?reply({credit_id:c.credit_id,idempotent:true}):reply({error:"credit_conflict"},409);
 const account=await first(db,"SELECT debt_units,successful_uses,active_reservation_id FROM battery_overdraft_accounts WHERE user_id=?",c.user_id);
 if(account?.active_reservation_id)return reply({error:"overdraft_settlement_pending_retry"},409);
 const debt=Number(account?.debt_units||0),repay=Math.min(c.quantity,debt),remaining=c.quantity-repay;
 const wallet=await first(db,"SELECT available_units,version FROM battery_wallets WHERE user_id=?",c.user_id);
 if(remaining>MAX_UNITS-Number(wallet?.available_units||0))return reply({error:"wallet_numeric_limit"},400);
 const ops=[
  stmt(db,"INSERT OR IGNORE INTO battery_wallets(user_id,available_units,reserved_units,version) VALUES(?,0,0,1)",c.user_id),
  stmt(db,"INSERT OR IGNORE INTO battery_overdraft_accounts(user_id,debt_units,successful_uses,active_reservation_id) VALUES(?,0,0,NULL)",c.user_id),
  stmt(db,"INSERT INTO battery_credit_receipts(credit_id,user_id,quantity,repaid_units,lot_units,created_at_ms,source,expires_at_ms) VALUES(?,?,?,?,?,?,?,?)",c.credit_id,c.user_id,c.quantity,repay,remaining,time,c.source,c.expires_at_ms),
  stmt(db,"UPDATE battery_overdraft_accounts SET debt_units=CASE WHEN debt_units=? AND active_reservation_id IS NULL THEN debt_units-? ELSE -1 END,successful_uses=CASE WHEN debt_units=? AND debt_units-?=0 THEN 0 ELSE successful_uses END WHERE user_id=?",
   debt,repay,debt,repay,c.user_id),
  stmt(db,"UPDATE battery_wallets SET available_units=CASE WHEN version=? AND available_units<=? THEN available_units+? ELSE -1 END,version=version+1 WHERE user_id=?",
   wallet?.version??1,MAX_UNITS-remaining,remaining,c.user_id)
 ];
 ops.push(stmt(db,"INSERT INTO battery_ledger(entry_id,user_id,app_id,operation_id,quantity_delta,created_at_ms) VALUES(?,?,?,?,?,?)",SEC().randomUUID(),c.user_id,"battery_issuer",c.credit_id,c.quantity,time));
 if(remaining>0)ops.push(stmt(db,"INSERT INTO battery_lots(lot_id,user_id,source,expires_at_ms,available_units,reserved_units) VALUES(?,?,?,?,?,0)",
  "grant_"+c.credit_id,c.user_id,c.source,c.expires_at_ms,remaining));
 try{await db.batch(ops);return reply({credit_id:c.credit_id,repaid_units:repay,available_added_units:remaining,idempotent:false});}
 catch{
  const dup=await first(db,"SELECT credit_id,user_id,quantity,source,expires_at_ms FROM battery_credit_receipts WHERE credit_id=?",c.credit_id);
  if(dup&&dup.user_id===c.user_id&&dup.quantity===c.quantity&&dup.source===c.source&&dup.expires_at_ms===c.expires_at_ms)return reply({credit_id:c.credit_id,idempotent:true});
  return reply({error:"credit_transaction_conflict_retry"},409);
 }
}

// Called only by a Cloudflare Cron Trigger on the PRIVATE Engine Worker.
// A disconnected App must not leave its reserved battery locked forever.
export async function sweepExpiredReservations(db,time=nowMs(),limit=50){
 if(!Number.isSafeInteger(limit)||limit<1||limit>500)throw Error("invalid_sweep_limit");
 const pending=await many(db,
  "SELECT user_id,app_id,operation_id FROM battery_reservations WHERE state='reserved' AND deadline_at_ms<=? ORDER BY deadline_at_ms, reservation_id LIMIT ?",
  time,limit);
 let expired=0,failed=0;
 for(const c of pending){
  try{const r=await settle(db,c,"release",time);const body=await r.json();
   if(r.status===200&&(body.status==="expired"||body.status==="released"))expired++;else failed++;
  }catch{failed++;}
 }
 return {checked:pending.length,expired,failed};
}
// Expired *available* lots must be removed from the materialized wallet balance.
// Compare-and-fail D1 CHECK guard prevents races with concurrent reservations.
// Reserved lots are handled separately by sweepExpiredReservations.
export async function sweepExpiredAvailableLots(db,time=nowMs(),limit=50){
 if(!Number.isSafeInteger(limit)||limit<1||limit>500)throw Error("invalid_sweep_limit");
 const lots=await many(db,
  "SELECT lot_id,user_id,available_units FROM battery_lots WHERE expires_at_ms<=? AND available_units>0 ORDER BY expires_at_ms,lot_id LIMIT ?",
  time,limit);
 let cleared=0,failed=0;
 for(const l of lots){
  const ops=[
   stmt(db,"UPDATE battery_lots SET available_units=CASE WHEN available_units=? AND expires_at_ms<=? THEN 0 ELSE -1 END WHERE lot_id=? AND user_id=?",
    l.available_units,time,l.lot_id,l.user_id),
   stmt(db,"UPDATE battery_wallets SET available_units=available_units-?,version=version+1 WHERE user_id=?",
    l.available_units,l.user_id)
  ];
  try{await db.batch(ops);cleared++;}catch{failed++;}
 }
 return {checked:lots.length,cleared,failed};
}
// Prevent unbounded D1 growth: API rate-limit windows older than 48 hours
// are transient counters, not the immutable member transaction ledger.
export async function sweepOldRateLimitWindows(db,time=nowMs(),limit=500){
 if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw Error("invalid_sweep_limit");
 const cutoff=time-48*3600000;
 const result=await db.prepare(
  "DELETE FROM battery_app_rate_limits WHERE (app_id,window_start_ms) IN "+
  "(SELECT app_id,window_start_ms FROM battery_app_rate_limits WHERE window_start_ms<? ORDER BY window_start_ms LIMIT ?)"
 ).bind(cutoff,limit).run();
 return {deleted:Number(result?.meta?.changes||0)};
}
export default{
 async scheduled(_event,env){
  if(!env?.BATTERY_DB?.batch)return;
  // No secrets exposed, and no public endpoint. Cron is a platform-only trigger.
  // Failed items are retried on the next tick. A small batch bounds D1 work.
  await sweepExpiredReservations(env.BATTERY_DB);
  await sweepExpiredAvailableLots(env.BATTERY_DB);
  await sweepOldRateLimitWindows(env.BATTERY_DB);
 },
 async fetch(request,env){
  const url=new URL(request.url);
  if(request.method!=="POST"||!["/v1/reserve","/v1/commit","/v1/release","/v1/credit"].includes(url.pathname))return reply({error:"not_found"},404);
  const credit=url.pathname==="/v1/credit";
  const secretName=credit?"BATTERY_CREDIT_ISSUER_SECRET":"BATTERY_ENGINE_SECRET";
  const secret=env?.[secretName];
  if(!env?.BATTERY_DB?.batch||typeof secret!=="string"||secret.length<32)return reply({error:credit?"credit_issuer_not_configured":"engine_not_configured"},503);
  const auth=request.headers.get(credit?"X-Battery-Credit-Authorization":"X-Battery-Internal-Authorization")||"";
  if(auth.length>1024||!auth.startsWith("Bearer ")||!await secureEqual(auth.slice(7),secret))return reply({error:"internal_access_denied"},403);
  // Fail closed even if a secret is accidentally provisioned before Production acceptance.
  // release stays available for cleanup of an existing reservation during a pause.
  if(credit&&env?.BATTERY_CREDIT_ENABLED!=="true")return reply({error:"credit_issuance_disabled"},503);
  if(!credit&&url.pathname!=="/v1/release"&&env?.BATTERY_OPERATIONS_ENABLED!=="true")return reply({error:"battery_operations_disabled"},503);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type")||""))return reply({error:"unsupported_content_type"},415);
  let c;
  try{const raw=await request.text();if(raw.length>2048)return reply({error:"request_too_large"},413);c=JSON.parse(raw);}
  catch{return reply({error:"invalid_json"},400);}
  const action=url.pathname.split("/").at(-1);
  if(!c||Array.isArray(c)||typeof c!=="object"||
   Object.keys(c).sort().join(",")!==(credit?"credit_id,expires_at_ms,quantity,source,user_id":action==="reserve"?"app_id,operation_id,quantity,user_id":"app_id,operation_id,user_id")||
   (credit?(!reId.test(c.credit_id||"")||!reUser.test(c.user_id||"")||
     !/^[a-z0-9_-]{3,80}$/.test(c.source||"")||!validQuantity(c.quantity)||
     !Number.isSafeInteger(c.expires_at_ms)||c.expires_at_ms<=Date.now()):
     (!reId.test(c.operation_id||"")||!reApp.test(c.app_id||"")||!reUser.test(c.user_id||"")||
      (action==="reserve"&&!validQuantity(c.quantity)))))return reply({error:credit?"invalid_credit":"invalid_operation"},400);
  try{return credit?await applyCredit(env.BATTERY_DB,c):action==="reserve"?await reserve(env.BATTERY_DB,c,nowMs(),env?.BATTERY_OVERDRAFT_ENABLED==="true"):await settle(env.BATTERY_DB,c,action);}
  catch{return reply({error:"engine_database_unavailable"},503);}
 }
};
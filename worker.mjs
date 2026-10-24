import {readArchivedLedger} from "./archive.mjs";
// Starry-only Battery API Gateway: authenticated backend-to-backend adapter.
// App credentials are never sent by browsers. Gateway has NO direct write route to D1.
// Engine is accessible only over a private Service Binding; absent bindings fail closed.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 "content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const scopesFor=row=>new Set(String(row.scopes||"").split(" ").filter(Boolean));
const sha256=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,"0")).join("");
const uidValid=u=>typeof u==="string"&&u.length>3&&u.length<180&&/^[A-Za-z0-9_-]+$/.test(u);
async function verifiedPrincipal(request,env,needed){
 if(!env?.BATTERY_DB?.prepare||!env?.CENTRAL_AUTH_VERIFY?.fetch||typeof env?.CENTRAL_AUTH_CALLER_SECRET!=="string"||env.CENTRAL_AUTH_CALLER_SECRET.length<32)return {error:"dependency_unavailable",status:503};
 const id=request.headers.get("X-Battery-App-Id")||"";
 const match=/^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(request.headers.get("Authorization")||"");
 const userToken=request.headers.get("X-Central-Access-Token")||"";
 if(!/^[a-z0-9_-]{3,80}$/.test(id)||!match||!userToken||userToken.length>4096)return {error:"app_auth_required",status:401};
 const keyHash=await sha256(match[1]);
 let client;
 try{
  client=await env.BATTERY_DB.prepare("SELECT app_id,scopes,rate_limit_per_minute FROM battery_app_clients WHERE app_id=? AND token_sha256=? AND enabled=1 LIMIT 1").bind(id,keyHash).first();
 }catch{return {error:"database_unavailable",status:503};}
 if(!client)return {error:"app_forbidden",status:403};
 if(!scopesFor(client).has(needed))return {error:"scope_forbidden",status:403};
 // Atomic, per-app configurable 60-second quota; reject when exhausted.
 // Throttle before central token introspection to protect the shared identity service.
 const max=Number(client.rate_limit_per_minute);
 const limit=Number.isSafeInteger(max)&&max>=1&&max<=10000?max:120;
 const minute=Math.floor(Date.now()/60000)*60000;
 let quota;
 try{
  quota=await env.BATTERY_DB.prepare(
   "INSERT INTO battery_app_rate_limits(app_id,window_start_ms,request_count) VALUES(?,?,1) "+
   "ON CONFLICT(app_id,window_start_ms) DO UPDATE SET request_count=request_count+1 "+
   "WHERE request_count<? RETURNING request_count"
  ).bind(id,minute,limit).first();
 }catch{return {error:"rate_limit_unavailable",status:503};}
 if(!quota)return {error:"rate_limit_exceeded",status:429};
 let reply;
 try{
  reply=await env.CENTRAL_AUTH_VERIFY.fetch(new Request("https://central-auth.internal/v1/introspect",{
   method:"POST",headers:{"Authorization":"Bearer "+userToken,"Content-Type":"application/json","X-Battery-Caller":"starry","X-Central-Service-Auth":env.CENTRAL_AUTH_CALLER_SECRET},
   body:JSON.stringify({required_brand:"starry"})}));
 }catch{return {error:"central_auth_unavailable",status:503};}
 if(reply.status>=500)return {error:"central_auth_unavailable",status:503};
 if(!reply.ok)return {error:"central_auth_rejected",status:403};
 let data;
 try{data=await reply.json();}catch{return {error:"invalid_central_auth_response",status:503};}
 if(data.active!==true||data.brand_allowed!==true||!uidValid(data.user_id)||data.suspended!==false)return {error:"central_auth_rejected",status:403};
 return {appId:id,userId:data.user_id};
}
const operations={"reserve":"usage:reserve","commit":"usage:commit","release":"usage:release"};
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==="/health"&&request.method==="GET")return json({service:"starry-battery-gateway",status:"reachable"});
  const method=request.method,path=url.pathname;
  const isWallet=method==="GET"&&path==="/v1/battery/wallet";
  const isLedger=method==="GET"&&path==="/v1/battery/ledger";
  const op=method==="POST"&&/^\/v1\/battery\/(reserve|commit|release)$/.exec(path)?.[1];
  if(!isWallet&&!isLedger&&!op)return json({error:"not_found"},404);
  const required=isWallet?"balance:read":isLedger?"ledger:read":operations[op];
  const principal=await verifiedPrincipal(request,env,required);
  if(principal.error)return json({error:principal.error},principal.status);
  if(isWallet){
   let wallet;
   try{wallet=await env.BATTERY_DB.prepare("SELECT available_units,reserved_units,version FROM battery_wallets WHERE user_id=?").bind(principal.userId).first();}
   catch{return json({error:"database_unavailable"},503);}
   let debt;
   try{debt=await env.BATTERY_DB.prepare("SELECT debt_units,successful_uses,active_reservation_id FROM battery_overdraft_accounts WHERE user_id=?").bind(principal.userId).first();}
   catch{return json({error:"overdraft_schema_unavailable"},503);}
   const owed=Number(debt?.debt_units||0),available=Number(wallet?.available_units||0);
   return json({available_units:available-owed,spendable_units:available,debt_units:owed,reserved_units:wallet?.reserved_units||0,overdraft_remaining:2-Number(debt?.successful_uses||0),overdraft_in_progress:Boolean(debt?.active_reservation_id),version:wallet?.version||0});
  }
  if(isLedger){
   if(!env?.BATTERY_ARCHIVE_R2?.get)return json({error:"archive_binding_unavailable"},503);
   const rawMs=url.searchParams.get("before_ms"),rawId=url.searchParams.get("before_id");
   const beforeMs=rawMs===null?Number.MAX_SAFE_INTEGER:Number(rawMs),beforeId=rawId??"~";
   if((rawId!==null&&rawMs===null)||(rawMs!==null&&(!/^[0-9]{1,16}$/.test(rawMs)||!Number.isSafeInteger(beforeMs)||beforeMs<=0))||
      !(/^[A-Za-z0-9_-]{8,120}$/.test(beforeId)||beforeId==="~"))return json({error:"invalid_ledger_cursor"},400);
   let entries;
   try{
    const recent=await env.BATTERY_DB.prepare("SELECT entry_id,quantity_delta,created_at_ms FROM battery_ledger WHERE user_id=? AND (created_at_ms<? OR (created_at_ms=? AND entry_id<?)) ORDER BY created_at_ms DESC,entry_id DESC LIMIT 50").bind(principal.userId,beforeMs,beforeMs,beforeId).all();
    const archived=await readArchivedLedger(env.BATTERY_DB,env.BATTERY_ARCHIVE_R2,principal.userId,beforeMs,50,beforeId);
    entries=[...(recent.results||[]),...archived.map(x=>({entry_id:x.entry_id,quantity_delta:x.quantity_delta,created_at_ms:x.created_at_ms}))].sort((x,y)=>y.created_at_ms-x.created_at_ms||y.entry_id.localeCompare(x.entry_id)).slice(0,50);
   }catch{return json({error:"ledger_or_archive_unavailable"},503);}
   const last=entries.at(-1);
   return json({entries,limit:50,next_cursor:last&&entries.length===50?{before_ms:last.created_at_ms,before_id:last.entry_id}:null});
  }
  if(!env?.BATTERY_ENGINE?.fetch||typeof env.BATTERY_ENGINE_SECRET!=="string"||env.BATTERY_ENGINE_SECRET.length<32)return json({error:"battery_engine_not_ready"},503);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type")||""))return json({error:"unsupported_content_type"},415);
  let body;
  try{const raw=await request.text();if(raw.length>2048)return json({error:"payload_too_large"},413);body=JSON.parse(raw);}
  catch{return json({error:"invalid_json"},400);}
  if(!body||typeof body!=="object"||Array.isArray(body)||
      Object.keys(body).sort().join(",")!==(op==="reserve"?"operation_id,quantity":"operation_id")||
      !/^[A-Za-z0-9_-]{8,120}$/.test(body.operation_id||"")||
      (op==="reserve"&&(!Number.isSafeInteger(body.quantity)||body.quantity<=0||body.quantity>Number.MAX_SAFE_INTEGER)))
     return json({error:"invalid_operation"},400);
  // Forward authenticated principal, not caller-provided user_id/app_id. Only private binding may reach Engine.
  const forwarded={operation_id:body.operation_id,quantity:op==="reserve"?body.quantity:undefined,
                   user_id:principal.userId,app_id:principal.appId};
  try{
   const result=await env.BATTERY_ENGINE.fetch(new Request("https://battery-engine.internal/v1/"+op,{
    method:"POST",headers:{"Content-Type":"application/json","X-Battery-Internal-Authorization":"Bearer "+env.BATTERY_ENGINE_SECRET},
    body:JSON.stringify(forwarded)}));
   return new Response(result.body,{status:result.status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  }catch{return json({error:"battery_engine_unavailable"},503);}
 }
};

// Cloudflare private, isolated staging smoke against DARK Production Battery Workers.
// Does not mutate or issue any live member wallet / any Production D1.
// Report is written ONLY into separate Battery E2E testing D1.
const RUN_ID="battery-dark-production-smoke-20261024-01";
const getJson=async response=>{try{return await response.json()}catch{return {invalid_json:true}}};
export default{
 async scheduled(_event,env){
  const db=env?.BATTERY_E2E_DB;
  if(!db?.prepare||!env?.BATTERY_GATEWAY_PROD?.fetch||!env?.BATTERY_ENGINE_PROD?.fetch||!env?.BATTERY_ARCHIVE_PROD?.fetch)throw Error("dark_release_bindings_missing");
  await db.prepare("CREATE TABLE IF NOT EXISTS battery_dark_prod_smoke (run_id TEXT PRIMARY KEY,passed INTEGER NOT NULL,checks_json TEXT NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS battery_dark_prod_claims (run_id TEXT PRIMARY KEY)").run();
  const claim=await db.prepare("INSERT OR IGNORE INTO battery_dark_prod_claims(run_id) VALUES(?)").bind(RUN_ID).run();
  if(Number(claim?.meta?.changes||0)!==1)return;
  const checks=[];
  async function probe(name,fn){
   try{const result=await fn();checks.push({name,pass:result===true});}
   catch(e){checks.push({name,pass:false,error:String(e).slice(0,160)});}
  }
  await probe("gateway_health",async()=>{
   const r=await env.BATTERY_GATEWAY_PROD.fetch(new Request("https://battery-prod.internal/health",{method:"GET"}));
   const json=await getJson(r);
   return r.status===200&&json.service==="starry-battery-gateway"&&json.status==="reachable";
  });
  await probe("gateway_no_auth_denied",async()=>{
   const r=await env.BATTERY_GATEWAY_PROD.fetch(new Request("https://battery-prod.internal/v1/battery/wallet",{method:"GET"}));
   const json=await getJson(r);
   return r.status===503&&json.error==="dependency_unavailable";
  });
  await probe("gateway_cannot_credit",async()=>{
   const r=await env.BATTERY_GATEWAY_PROD.fetch(new Request("https://battery-prod.internal/v1/battery/credit",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}));
   return r.status===404;
  });
  await probe("engine_without_secret_must_deny_reserve",async()=>{
   const r=await env.BATTERY_ENGINE_PROD.fetch(new Request("https://battery-engine.internal/v1/reserve",{
    method:"POST",headers:{"Content-Type":"application/json","X-Battery-Internal-Authorization":"Bearer "+"z".repeat(40)},
    body:JSON.stringify({user_id:"synthetic_probe_member",app_id:"starry_probe",operation_id:"probe_123456",quantity:1})
   }));
   const json=await getJson(r);
   return r.status===503&&json.error==="engine_not_configured";
  });
  await probe("engine_without_secret_must_deny_credit",async()=>{
   const r=await env.BATTERY_ENGINE_PROD.fetch(new Request("https://battery-engine.internal/v1/credit",{
    method:"POST",headers:{"Content-Type":"application/json","X-Battery-Credit-Authorization":"Bearer "+"z".repeat(40)},
    body:JSON.stringify({credit_id:"probe_123456",user_id:"synthetic_probe_member",source:"gift",quantity:10,expires_at_ms:Date.now()+86400000})
   }));
   const json=await getJson(r);
   return r.status===503&&json.error==="credit_issuer_not_configured";
  });
  await probe("private_archive_no_public_endpoint",async()=>{
   const r=await env.BATTERY_ARCHIVE_PROD.fetch(new Request("https://battery-archive.internal/health"));
   return r.status===404;
  });
  const total=checks.length,passed=checks.filter(x=>x.pass).length;
  await db.prepare("INSERT INTO battery_dark_prod_smoke(run_id,passed,checks_json) VALUES(?,?,?)").bind(RUN_ID,passed,JSON.stringify({run_id:RUN_ID,passed,total,checks,production_data_written:false})).run();
 },
 async fetch(){return new Response("not_found",{status:404})}
};

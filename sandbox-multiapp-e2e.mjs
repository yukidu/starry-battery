// One-shot isolated multi-App sandbox verification via PRIVATE Service Binding.
// Only synthetic wallets in sandbox D1. Reports go to separate Battery E2E D1.
const RUN_ID="starry-battery-multiapp-sandbox-e2e-20261024-01";
async function runSandbox(env){
  if(!env?.BATTERY_E2E_DB?.prepare||!env?.BATTERY_SANDBOX_GATEWAY?.fetch||!env?.SANDBOX_QA_APPS)throw Error("sandbox_e2e_not_configured");
  const db=env.BATTERY_E2E_DB;
  await db.prepare("CREATE TABLE IF NOT EXISTS battery_multiapp_sandbox_results(run_id TEXT PRIMARY KEY,passed INTEGER,total INTEGER,report TEXT)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS battery_multiapp_sandbox_claims(run_id TEXT PRIMARY KEY)").run();
  const claim=await db.prepare("INSERT OR IGNORE INTO battery_multiapp_sandbox_claims(run_id) VALUES(?)").bind(RUN_ID).run();
  if(Number(claim?.meta?.changes||0)!==1)return;
  const x=JSON.parse(env.SANDBOX_QA_APPS),checks=[];
  const ask=async(app,member,path="/v1/battery/wallet",method="GET",replace={})=>{
   const headers={"X-Battery-App-Id":app.id,"Authorization":"Bearer "+app.key,"X-Central-Access-Token":member,...replace};
   const r=await env.BATTERY_SANDBOX_GATEWAY.fetch(new Request("https://sandbox-battery.internal"+path,{method,headers}));
   let data;try{data=await r.json()}catch{data={error:"invalid_json"}}
   return {status:r.status,data};
  };
  async function check(name,run){try{checks.push({name,pass:await run()===true});}catch(e){checks.push({name,pass:false,error:String(e).slice(0,180)});}}
  await check("alpha_wallet_25",async()=>{const r=await ask(x.alpha,x.user1);return r.status===200&&r.data.available_units===25;});
  await check("beta_reads_shared_wallet_25",async()=>{const r=await ask(x.beta,x.user1);return r.status===200&&r.data.available_units===25;});
  await check("same_app_different_member_42",async()=>{const r=await ask(x.alpha,x.user2);return r.status===200&&r.data.available_units===42;});
  await check("beta_scoped_to_member_42",async()=>{const r=await ask(x.beta,x.user2);return r.status===200&&r.data.available_units===42;});
  await check("app_key_not_interchangeable",async()=>{const r=await ask({...x.alpha,key:x.beta.key},x.user1);return r.status===403&&r.data.error==="app_forbidden";});
  await check("hglobal_not_registered",async()=>{const r=await ask({...x.alpha,id:"hglobal_qa"},x.user1);return r.status===403;});
  await check("forged_member_denied",async()=>{const r=await ask(x.alpha,"invalid_fake_member_token_".repeat(2));return r.status===403;});
  await check("missing_user_token_denied",async()=>{const r=await ask(x.alpha,"");return r.status===401;});
  await check("balance_only_app_cannot_read_ledger",async()=>{const r=await ask(x.beta,x.user1,"/v1/battery/ledger");return r.status===403&&r.data.error==="scope_forbidden";});
  await check("no_charge_in_sandbox",async()=>{const r=await ask(x.alpha,x.user1,"/v1/battery/reserve","POST");return r.status===503||r.status===415;});
  const passed=checks.filter(y=>y.pass).length,total=checks.length;
  await db.prepare("INSERT INTO battery_multiapp_sandbox_results(run_id,passed,total,report) VALUES(?,?,?,?)").bind(RUN_ID,passed,total,JSON.stringify({run_id:RUN_ID,passed,total,checks,synthetic_only:true,production_data:false})).run();
 }
export default {
 async scheduled(_ev,env){await runSandbox(env);},
 async fetch(request,env){
  if(new URL(request.url).pathname!=="/__sandbox_e2e_once"||request.method!=="POST")return new Response("not_found",{status:404});
  const expected=env?.SANDBOX_E2E_TRIGGER_SECRET;
  const actual=request.headers.get("X-Sandbox-Run-Secret")||"";
  if(typeof expected!=="string"||expected.length<40||actual.length!==expected.length)return new Response("forbidden",{status:403});
  let mismatch=0;for(let i=0;i<actual.length;i++)mismatch|=actual.charCodeAt(i)^expected.charCodeAt(i);
  if(mismatch)return new Response("forbidden",{status:403});
  await runSandbox(env);
  return new Response("sandbox_probe_completed",{status:200,headers:{"Cache-Control":"no-store"}});
 }
};

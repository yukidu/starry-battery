// One-shot, private synthetic member/app E2E. No real member, no real billing.
// Writes report only to an isolated E2E RESULTS D1; transactions only to QA SANDBOX D1.
const RUN_ID="starry-battery-app-sandbox-e2e-20261024-01";
export default{
 async scheduled(_event,env){
  const db=env?.BATTERY_E2E_DB, gateway=env?.SANDBOX_GATEWAY;
  if(!db?.batch||!gateway?.fetch||!env?.BATTERY_APP_TEST_KEY||!env?.BATTERY_MEMBER_TEST_TOKEN)throw Error("missing_sandbox_bindings");
  await db.prepare("CREATE TABLE IF NOT EXISTS battery_app_sandbox_test_results(run_id TEXT PRIMARY KEY,passed INTEGER NOT NULL,total INTEGER NOT NULL,report TEXT NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS battery_app_sandbox_test_claims(run_id TEXT PRIMARY KEY)").run();
  const claim=await db.prepare("INSERT OR IGNORE INTO battery_app_sandbox_test_claims(run_id) VALUES(?)").bind(RUN_ID).run();
  if(Number(claim.meta?.changes||0)!==1)return;
  const headers={"X-Battery-App-Id":"starry_qa_ci","Authorization":"Bearer "+env.BATTERY_APP_TEST_KEY,
    "X-Central-Access-Token":env.BATTERY_MEMBER_TEST_TOKEN};
  const opId="sandbox_e2e_op_20261024_01",cancelId="sandbox_e2e_cancel_20261024_01";
  const check=[];
  const req=async(path,method="GET",payload=null,modified={})=>{
   const opts={method,headers:{...headers,...modified}};
   if(payload!==null){opts.headers["Content-Type"]="application/json";opts.body=JSON.stringify(payload);}
   const response=await gateway.fetch(new Request("https://sandbox-gateway.internal"+path,opts));
   let data;try{data=await response.json();}catch{data={error:"unparseable"};}
   return {code:response.status,data};
  };
  async function probe(name,fn){try{check.push({name,pass:await fn()===true});}catch(e){check.push({name,pass:false,error:String(e).slice(0,180)});}}
  await probe("initial_wallet",async()=>{const r=await req("/v1/battery/wallet");return r.code===200&&r.data.available_units===25&&r.data.debt_units===0;});
  await probe("deny_invalid_app_secret",async()=>{const r=await req("/v1/battery/wallet","GET",null,{Authorization:"Bearer "+"x".repeat(48)});return r.code===403&&r.data.error==="app_forbidden";});
  await probe("deny_invalid_member_token",async()=>{const r=await req("/v1/battery/wallet","GET",null,{"X-Central-Access-Token":"wrong_sandbox_member_token"});return r.code===403;});
  await probe("deny_unregistered_app",async()=>{const r=await req("/v1/battery/wallet","GET",null,{"X-Battery-App-Id":"another_app"});return r.code===403;});
  await probe("deny_forged_user_id",async()=>{const r=await req("/v1/battery/reserve","POST",{operation_id:"sandbox_forgery_01",quantity:2,user_id:"other_member"});return r.code===400&&r.data.error==="invalid_operation";});
  await probe("reserve_real_sandbox_D1",async()=>{const r=await req("/v1/battery/reserve","POST",{operation_id:opId,quantity:5});return r.code===200&&r.data.status==="reserved"&&r.data.funded_units===5&&r.data.overdraft_units===0;});
  await probe("reserve_idempotent",async()=>{const r=await req("/v1/battery/reserve","POST",{operation_id:opId,quantity:5});return r.code===200&&r.data.idempotent===true;});
  await probe("commit_exactly_once",async()=>{const r=await req("/v1/battery/commit","POST",{operation_id:opId});return r.code===200&&(r.data.status==="committed"||r.data.state==="committed");});
  await probe("wallet_reflects_commit",async()=>{const r=await req("/v1/battery/wallet");return r.code===200&&r.data.available_units===20&&r.data.debt_units===0;});
  await probe("ledger_read_scoped_member",async()=>{const r=await req("/v1/battery/ledger");return r.code===200&&Array.isArray(r.data.entries)&&r.data.entries.some(x=>x.quantity_delta===-5);});
  await probe("reserve_then_release",async()=>{const r=await req("/v1/battery/reserve","POST",{operation_id:cancelId,quantity:3});if(r.code!==200)return false;const u=await req("/v1/battery/release","POST",{operation_id:cancelId});return u.code===200&&(u.data.status==="released"||u.data.status==="expired");});
  await probe("wallet_refunds_cancel",async()=>{const r=await req("/v1/battery/wallet");return r.code===200&&r.data.available_units===20;});
  await probe("disable_unfunded_overdraft",async()=>{const r=await req("/v1/battery/reserve","POST",{operation_id:"sandbox_overdraft_01",quantity:5000});return r.code===409&&r.data.error==="overdraft_temporarily_disabled";});
  await probe("deny_credit_on_gateway",async()=>{const r=await req("/v1/battery/credit","POST",{quantity:100});return r.code===404;});
  const passed=check.filter(x=>x.pass).length,total=check.length;
  await db.prepare("INSERT INTO battery_app_sandbox_test_results(run_id,passed,total,report) VALUES(?,?,?,?)").bind(RUN_ID,passed,total,JSON.stringify({run_id:RUN_ID,passed,total,check,real_member:false,production_d1:false})).run();
 },
 async fetch(){return new Response("not_found",{status:404});}
};

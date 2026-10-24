// Public, entirely synthetic, READ-ONLY contract demo for Starry App developers.
// NO D1 / R2 / service binding / client credentials / member identity / AI billing.
// Not a substitute for the private authenticated Battery Gateway.
const headers={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","access-control-allow-origin":"*","access-control-allow-methods":"GET,OPTIONS","access-control-allow-headers":"Content-Type","x-starry-battery-environment":"synthetic-sandbox","x-robots-tag":"noindex, nofollow"};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const fixtures=Object.freeze({
 wallet:Object.freeze({available_units:50,spendable_units:50,debt_units:0,reserved_units:0,overdraft_remaining:2,overdraft_in_progress:false,version:1}),
 ledger:Object.freeze([{entry_id:"demo_credit_signup",quantity_delta:60,created_at_ms:1772323200000},
                       {entry_id:"demo_ai_usage_001",quantity_delta:-10,created_at_ms:1772409600000}])
});
const banner={environment:"synthetic_sandbox",synthetic:true,real_member_data:false,real_money:false,can_write:false};
export default{
 async fetch(request){
  const url=new URL(request.url);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(request.headers.has("authorization")||request.headers.has("x-central-access-token")||request.headers.has("cookie"))
    return response({...banner,error:"never_send_real_credentials_to_demo"},400);
  if(url.pathname==="/health"&&request.method==="GET")
    return response({...banner,service:"starry-battery-api-sandbox",status:"reachable"});
  if(request.method==="GET"&&url.pathname==="/v1/battery/wallet")
    return response({...fixtures.wallet,...banner});
  if(request.method==="GET"&&url.pathname==="/v1/battery/ledger")
    return response({entries:fixtures.ledger,limit:50,next_cursor:null,...banner});
  if(request.method==="GET"&&url.pathname==="/sandbox/capabilities")
    return response({...banner,available_read_routes:["GET /health","GET /v1/battery/wallet","GET /v1/battery/ledger","GET /sandbox/capabilities","POST /sandbox/simulate/reserve","POST /sandbox/simulate/commit","POST /sandbox/simulate/release"],live_api_required_for:["usage:reserve","usage:commit","usage:release","grant","purchase"],note:"Demonstration only. Values are constants, not a connected member wallet."});
  // Explicitly simulated request/response shapes only. No reservation is persisted,
  // no member exists, and no AI inference or paid battery can be triggered.
  const simulated=({"/sandbox/simulate/reserve":"reserve","/sandbox/simulate/commit":"commit","/sandbox/simulate/release":"release"})[url.pathname];
  if(simulated&&request.method==="POST"){
   if(!/^application\\/json(?:;|$)/i.test(request.headers.get("Content-Type")||""))
     return response({...banner,error:"invalid_demo_content_type"},415);
   let value;
   try{const raw=await request.text();if(raw.length>512)return response({...banner,error:"demo_payload_too_large"},413);value=JSON.parse(raw);}
   catch{return response({...banner,error:"invalid_demo_json"},400);}
   if(!value||typeof value!=="object"||Array.isArray(value)||
     Object.keys(value).sort().join(",")!==(simulated==="reserve"?"operation_id,quantity":"operation_id")||
     !/^[A-Za-z0-9_-]{8,120}$/.test(value.operation_id||"")||
     (simulated==="reserve"&&(!Number.isSafeInteger(value.quantity)||value.quantity<1||value.quantity>50)))
     return response({...banner,error:"invalid_demo_operation"},400);
   return response({...banner,not_persisted:true,no_real_charges:true,
     operation_id:value.operation_id,reservation_id:"demo_"+value.operation_id,
     status:simulated==="reserve"?"reserved":simulated==="commit"?"committed":"released",
     ...(simulated==="reserve"?{quantity:value.quantity,funded_units:value.quantity,overdraft_units:0,deadline_at_ms:Date.now()+180000}:{})});
  }
  if(url.pathname.startsWith("/v1/battery/")&&request.method!=="GET")
    return response({...banner,error:"demo_write_disabled",live_transaction_performed:false},405);
  return response({...banner,error:"not_found"},404);
 }
};

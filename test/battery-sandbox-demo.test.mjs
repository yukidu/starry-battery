import test from "node:test";
import assert from "node:assert/strict";
import demo from "../sandbox-demo.mjs";

const req=(path,init={})=>new Request("https://synthetic.example"+path,init);
const json=async request=>{const r=await demo.fetch(request);return {code:r.status,body:await r.json(),headers:r.headers};};
test("public demo returns only explicitly synthetic wallet and history",async()=>{
 const w=await json(req("/v1/battery/wallet"));const l=await json(req("/v1/battery/ledger"));
 assert.equal(w.code,200);assert.equal(l.code,200);
 assert.equal(w.body.available_units,50);assert.equal(w.body.synthetic,true);
 assert.equal(l.body.synthetic,true);assert.equal(l.body.entries.length,2);
 assert.equal(w.headers.get("X-Starry-Battery-Environment"),"synthetic-sandbox");
 assert.equal(w.headers.get("Cache-Control"),"no-store");
});
test("read-only demo denies all state-changing operations",async()=>{
 for(const op of ["reserve","commit","release","credit"]){
  const r=await json(req("/v1/battery/"+op,{method:"POST",headers:{"content-type":"application/json"},body:'{"operation_id":"operation123","quantity":500}'}));
  assert.equal(r.code,405,op);assert.equal(r.body.error,"demo_write_disabled");
  assert.equal(r.body.live_transaction_performed,false);
 }
});
test("the demo refuses live credentials and cookies",async()=>{
 for(const headers of [{Authorization:"Bearer realsecret"},{"X-Central-Access-Token":"realmember"},{Cookie:"session=realmember"}]){
  const r=await json(req("/v1/battery/wallet",{headers}));
  assert.equal(r.code,400);assert.equal(r.body.error,"never_send_real_credentials_to_demo");
 }
});
test("unknown or post health never looks like a real API",async()=>{
 assert.equal((await json(req("/unknown"))).code,404);
 assert.equal((await json(req("/health",{method:"POST"}))).code,404);
 const health=await json(req("/health"));
 assert.equal(health.body.real_member_data,false);
 assert.equal(health.body.real_money,false);
 assert.equal(health.body.can_write,false);
});
test("CORS preflight only enables synthetic GET",async()=>{
 const r=await demo.fetch(req("/v1/battery/wallet",{method:"OPTIONS"}));
 assert.equal(r.status,204);
 assert.equal(r.headers.get("access-control-allow-methods"),"GET,OPTIONS");
});

test("sandbox simulation accepts fake reserve/commit/release shapes but never persists charges",async()=>{
 const send=(op,body)=>json(req("/sandbox/simulate/"+op,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}));
 const reservation=await send("reserve",{operation_id:"sandbox_op_1234",quantity:5});
 assert.equal(reservation.code,200);assert.equal(reservation.body.status,"reserved");
 assert.equal(reservation.body.not_persisted,true);assert.equal(reservation.body.no_real_charges,true);
 assert.equal(reservation.body.funded_units,5);
 const commit=await send("commit",{operation_id:"sandbox_op_1234"});
 assert.equal(commit.code,200);assert.equal(commit.body.status,"committed");assert.equal(commit.body.synthetic,true);
 const released=await send("release",{operation_id:"sandbox_op_1234"});
 assert.equal(released.code,200);assert.equal(released.body.status,"released");
 const unchanged=await json(req("/v1/battery/wallet"));
 assert.equal(unchanged.body.available_units,50);
});
test("sandbox simulation validates quantity, payload and refuses real App credentials",async()=>{
 const send=(op,body,headers={})=>json(req("/sandbox/simulate/"+op,{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body)}));
 assert.equal((await send("reserve",{operation_id:"sandbox_op_1234",quantity:51})).code,400);
 assert.equal((await send("reserve",{operation_id:"sandbox_op_1234",quantity:0})).code,400);
 assert.equal((await send("commit",{operation_id:"sandbox_op_1234",user_id:"victim_user"})).code,400);
 assert.equal((await send("commit",{operation_id:"sandbox_op_1234"},{Authorization:"Bearer real"})).code,400);
});

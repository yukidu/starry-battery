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

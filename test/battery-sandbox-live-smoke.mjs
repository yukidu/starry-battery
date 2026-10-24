// Live black-box check: only the PUBLIC synthetic demo, never any real member API.
// Intended for GitHub Actions / safe terminal; no app token or personal data.
import assert from "node:assert/strict";
const origin=(process.env.BATTERY_SANDBOX_DEMO_URL||"https://starry-battery-api-sandbox-20261024.yukidu.workers.dev").replace(/\/$/,"");
if(!/^https:\/\/[a-z0-9-]+\.yukidu\.workers\.dev$/.test(origin))throw Error("untrusted_demo_origin");
async function read(path,opts={}){
 const r=await fetch(origin+path,{signal:AbortSignal.timeout(12000),redirect:"error",...opts});
 const json=await r.json();
 assert.equal(r.headers.get("x-starry-battery-environment"),"synthetic-sandbox");
 assert.equal(r.headers.get("cache-control"),"no-store");
 return {status:r.status,body:json};
}
const h=await read("/health");assert.equal(h.status,200);assert.equal(h.body.synthetic,true);assert.equal(h.body.can_write,false);
const w=await read("/v1/battery/wallet");assert.equal(w.status,200);assert.equal(w.body.real_member_data,false);assert.equal(w.body.available_units,50);
const l=await read("/v1/battery/ledger");assert.equal(l.status,200);assert.equal(l.body.synthetic,true);assert.equal(l.body.entries.length,2);
const denied=await read("/v1/battery/wallet",{headers:{"Authorization":"Bearer fake_credential_for_deny_test"}});
assert.equal(denied.status,400);assert.equal(denied.body.error,"never_send_real_credentials_to_demo");
const forbidden=await read("/v1/battery/reserve",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operation_id:"sandboxop123",quantity:1})});
assert.equal(forbidden.status,405);assert.equal(forbidden.body.error,"demo_write_disabled");
console.log("PASS: external synthetic Battery demo 5/5; no sensitive credentials or Production writes");

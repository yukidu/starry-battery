import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import auth from "../sandbox-auth.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const secret="c".repeat(48),token="m".repeat(48);
const env={BATTERY_SANDBOX_MODE:"true",SANDBOX_AUTH_CALLER_SECRET:secret,SANDBOX_MEMBER_TOKEN:token};
const req=(overrides={},b={required_brand:"starry"})=>new Request("https://sandbox-auth.private/v1/introspect",{method:"POST",headers:{"Content-Type":"application/json","X-Central-Service-Auth":secret,"Authorization":"Bearer "+token,...overrides},body:JSON.stringify(b)});
test("private fake member always explicitly identified as synthetic",async()=>{
 const r=await auth.fetch(req(),env);const j=await r.json();
 assert.equal(r.status,200);assert.equal(j.active,true);assert.equal(j.brand_allowed,true);
 assert.equal(j.suspended,false);assert.equal(j.user_id,"sandbox_member_qa01");assert.equal(j.real_member,false);assert.equal(j.sandbox,true);
});
test("mock central identity fails closed without mode/secrets or with forged tokens",async()=>{
 assert.equal((await auth.fetch(req(),{})).status,503);
 assert.equal((await auth.fetch(req({"X-Central-Service-Auth":"wrong"}),env)).status,403);
 assert.equal((await auth.fetch(req({"Authorization":"Bearer wrong"}),env)).status,403);
 assert.equal((await auth.fetch(req(),{...env,BATTERY_SANDBOX_MODE:"false"})).status,503);
});
test("fake verifier denies H-Global brand even with correct keys",async()=>{
 assert.equal((await auth.fetch(req({}, {required_brand:"hglobal"}),env)).status,403);
});
test("mock verifier cannot publish membership lookup, issue, or health endpoints",async()=>{
 for(const route of ["/health","/v1/issue","/v1/members"]){
  const r=await auth.fetch(new Request("https://sandbox-auth.private"+route),env);
  assert.equal(r.status,404);
 }
});

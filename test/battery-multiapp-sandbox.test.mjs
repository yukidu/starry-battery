import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import auth from "../sandbox-multiapp-auth.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,"0")).join("");
const token="member_test_token_".repeat(3),secret="caller_secret_test_".repeat(3);
const makeRequest=(tok=token,caller=secret,brand="starry")=>new Request("https://sandbox-auth.internal/v1/introspect",{
 method:"POST",headers:{"Authorization":"Bearer "+tok,"X-Central-Service-Auth":caller,"X-Battery-Caller":"starry","Content-Type":"application/json"},
 body:JSON.stringify({required_brand:brand})
});
const setup=async()=>({SANDBOX_ENABLED:"true",SANDBOX_CALLER_SECRET:secret,
 SANDBOX_TOKEN_REGISTRY:JSON.stringify([{token_sha256:await sha(token),user_id:"sandbox_member_demo_01",active:true}])});
test("synthetic-only member works for a valid private caller",async()=>{
 const r=await auth.fetch(makeRequest(),await setup());assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{active:true,brand_allowed:true,user_id:"sandbox_member_demo_01",suspended:false,sandbox:true});
});
test("missing caller and member token are rejected",async()=>{
 const env=await setup();
 assert.equal((await auth.fetch(makeRequest(token,"forged"),env)).status,403);
 assert.equal((await auth.fetch(makeRequest("forged_member_token_".repeat(2)),env)).status,403);
 assert.equal((await auth.fetch(makeRequest(),{})).status,503);
});
test("H-Global and non-synthetic registry identities fail closed",async()=>{
 const env=await setup();
 assert.equal((await auth.fetch(makeRequest(token,secret,"hglobal"),env)).status,403);
 const fail={...env,SANDBOX_TOKEN_REGISTRY:JSON.stringify([{token_sha256:await sha(token),user_id:"real_user_123",active:true}])};
 assert.equal((await auth.fetch(makeRequest(),fail)).status,503);
});
test("disabled sandbox cannot be used even with secrets",async()=>{
 const env={...await setup(),SANDBOX_ENABLED:"false"};
 assert.equal((await auth.fetch(makeRequest(),env)).status,503);
});

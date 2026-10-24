import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import gateway from "../worker.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const url="https://battery.internal";
const secret="private-caller-secret_".repeat(3);
const alphaKey="a".repeat(48),betaKey="b".repeat(48),memberAlpha="central_alpha_token_".repeat(3),memberBeta="central_beta_token_".repeat(3);
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(v=>v.toString(16).padStart(2,"0")).join("");
const keys=new Map();
const env={
 CENTRAL_AUTH_CALLER_SECRET:secret,
 CENTRAL_AUTH_VERIFY:{async fetch(req){
  assert.equal(req.headers.get("X-Central-Service-Auth"),secret);
  const token=req.headers.get("Authorization");
  if(token!=="Bearer "+memberAlpha&&token!=="Bearer "+memberBeta)return new Response(JSON.stringify({error:"invalid"}),{status:403});
  return Response.json({active:true,brand_allowed:true,suspended:false,user_id:token==="Bearer "+memberAlpha?"sandbox_member_alpha":"sandbox_member_beta"});
 }},
 BATTERY_DB:{prepare(sql){return{bind(...args){return{
  async first(){
   if(sql.includes("FROM battery_app_clients")){
    const app=keys.get(args[0]);
    return app&&app.hash===args[1]?{app_id:args[0],scopes:app.scopes,rate_limit_per_minute:120}:null;
   }
   if(sql.includes("battery_app_rate_limits"))return {request_count:1};
   if(sql.includes("battery_wallets"))return {available_units:args[0]==="sandbox_member_alpha"?25:42,reserved_units:0,version:1};
   if(sql.includes("battery_overdraft_accounts"))return {debt_units:0,successful_uses:0,active_reservation_id:null};
   throw Error("unexpected SELECT "+sql);
  }
 };}}}},
 };
const call=async(appId,appKey,member,path="/v1/battery/wallet")=>gateway.fetch(new Request(url+path,{headers:{
 "X-Battery-App-Id":appId,"Authorization":"Bearer "+appKey,"X-Central-Access-Token":member
}}),env);
test("two distinct Starry App credentials read same member's shared wallet",async()=>{
 keys.set("starry_alpha_qa",{hash:await sha(alphaKey),scopes:"balance:read ledger:read"});
 keys.set("starry_beta_qa",{hash:await sha(betaKey),scopes:"balance:read"});
 for(const app of [["starry_alpha_qa",alphaKey],["starry_beta_qa",betaKey]]){
  const r=await call(...app,memberAlpha);
  assert.equal(r.status,200);
  assert.equal((await r.json()).available_units,25);
 }
});
test("central membership is isolated across Apps, not caller-supplied user_id",async()=>{
 const a=await call("starry_alpha_qa",alphaKey,memberBeta);
 const b=await call("starry_beta_qa",betaKey,memberBeta);
 assert.equal(a.status,200);assert.equal(b.status,200);
 assert.equal((await a.json()).available_units,42);
 assert.equal((await b.json()).available_units,42);
});
test("cross-app impersonation, H-Global and forged central token fail closed",async()=>{
 assert.equal((await call("starry_alpha_qa",betaKey,memberAlpha)).status,403);
 assert.equal((await call("hglobal_qa",alphaKey,memberAlpha)).status,403);
 assert.equal((await call("starry_alpha_qa",alphaKey,"forged_token_".repeat(4))).status,403);
});
test("a balance-only App has no ledger scope",async()=>{
 const r=await call("starry_beta_qa",betaKey,memberAlpha,"/v1/battery/ledger");
 assert.equal(r.status,403);
 assert.equal((await r.json()).error,"scope_forbidden");
});

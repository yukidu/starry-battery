import test from "node:test";
import assert from "node:assert/strict";
import {inspectBatteryRelease} from "../deploy/verify-battery-cloudflare.mjs";
const accountId="a".repeat(32),token="b".repeat(40);
const d1="6fb69a9b-11b2-4794-950b-004db41d3343";
const calls=[];
const respond=(code,result)=>({status:code,ok:code>=200&&code<300,json:async()=>({success:true,result})});
function requestWithWorkers(workers={}){
 return async(uri,init)=>{
  calls.push({uri,method:init.method});
  if(uri.endsWith("/d1/database/"+d1))return respond(200,{uuid:d1,name:"starry-battery-production"});
  if(uri.endsWith("/r2/buckets"))return respond(200,{buckets:[{name:"starry-battery-ledger-production"}]});
  for(const [name,settings] of Object.entries(workers))if(uri.endsWith("/workers/scripts/"+name+"/settings"))return respond(200,settings);
  if(uri.includes("/workers/scripts/")&&uri.endsWith("/settings"))return respond(404,null);
  if(uri.endsWith("/subdomain"))return respond(200,{enabled:false,previews_enabled:false});
  throw Error("unrecognized mock read "+uri);
 };
}
test("production infrastructure can be staged but does not authorize transactions",async()=>{
 calls.length=0;
 const audit=await inspectBatteryRelease({target:"production",accountId,token,request:requestWithWorkers()});
 assert.equal(audit.read_only,true);
 assert.equal(audit.production_fully_activated,false);
 assert.deepEqual(audit.worker_status,{engine:"not_deployed",gateway:"not_deployed",archive:"not_deployed"});
 assert.ok(audit.blockers.includes("central_auth_verified"));
 assert.ok(calls.length>=5);
 assert.ok(calls.every(x=>x.method==="GET"),"preflight must never mutate Cloudflare");
});
test("production inspector rejects a Central D1 in a Battery private Engine binding",async()=>{
 const name="starry-battery-engine-production";
 const dangerous={bindings:[
  {type:"d1",name:"BATTERY_DB",id:d1},
  {type:"d1",name:"CENTRAL_DB",id:"ca08ee86-7b39-46fe-a578-611d1bee312c"}
 ]};
 await assert.rejects(inspectBatteryRelease({target:"production",accountId,token,
  request:requestWithWorkers({[name]:dangerous})}),/central_d1_binding/);
});
test("preflight rejects missing token and a forged Cloudflare account id",async()=>{
 await assert.rejects(inspectBatteryRelease({target:"production",accountId,token:"",request:requestWithWorkers()}),/battery_read_token_missing/);
 await assert.rejects(inspectBatteryRelease({target:"production",accountId:"",token,request:requestWithWorkers()}),/invalid_account_id/);
});

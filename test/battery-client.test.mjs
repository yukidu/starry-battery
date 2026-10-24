import test from "node:test";
import assert from "node:assert/strict";
import {StarryBatteryClient,BatteryApiError} from "../client/server-battery-client.mjs";
const key="k".repeat(48);
const makeClient=(fn)=>new StarryBatteryClient({baseUrl:"https://battery-test.example/",appId:"starry_echo",appKey:key,fetchImpl:fn});
test("auth headers are attached and caller cannot submit arbitrary user_id",async()=>{
 const records=[];const client=makeClient(async (url,opts)=>{records.push({url,opts});return new Response(JSON.stringify({available_units:2}),{status:200})});
 await client.wallet("central_member_token_123");
 await client.reserve("central_member_token_123",{operationId:"operation123",quantity:2});
 await client.commit("central_member_token_123",{operationId:"operation123"});
 await client.release("central_member_token_123",{operationId:"operation123"});
 assert.equal(records.length,4);
 assert.deepEqual(records.map(x=>new URL(x.url).pathname),["/v1/battery/wallet","/v1/battery/reserve","/v1/battery/commit","/v1/battery/release"]);
 assert.ok(records.every(x=>x.opts.headers.Authorization==="Bearer "+key&&x.opts.headers["X-Battery-App-Id"]==="starry_echo"));
 const reserveBody=JSON.parse(records[1].opts.body);
 assert.deepEqual(reserveBody,{operation_id:"operation123",quantity:2});
 assert.equal(records[1].opts.headers["X-Central-Access-Token"],"central_member_token_123");
});
test("client rejects non-HTTPS gateways, invalid tokens, and unsafe operation IDs",async()=>{
 assert.throws(()=>new StarryBatteryClient({baseUrl:"http://battery.example",appId:"starry_echo",appKey:key}),/HTTPS/);
 const c=makeClient(async()=>new Response("{}",{status:200}));
 await assert.rejects(c.wallet(""),/Central Access token/);
 await assert.rejects(c.reserve("validtoken123",{operationId:"a",quantity:5}),/Invalid reservation/);
 await assert.rejects(c.reserve("validtoken123",{operationId:"operation123",quantity:0}),/Invalid reservation/);
 assert.throws(()=>c.ledger("validtoken123",{beforeId:"entry123456"}),/requires timestamp/);
});
test("client reports rate limiting and Central Auth failures without leaking app token",async()=>{
 const c=makeClient(async()=>new Response(JSON.stringify({error:"rate_limit_exceeded"}),{status:429}));
 await assert.rejects(c.wallet("validtoken123"),e=>e instanceof BatteryApiError&&e.status===429&&e.message==="rate_limit_exceeded"&&!JSON.stringify(e).includes(key));
});
test("client explicitly refuses automatic request retry on network failure",async()=>{
 let calls=0;const c=makeClient(async()=>{calls++;throw new Error("timeout")});
 await assert.rejects(c.reserve("validtoken123",{operationId:"operation123",quantity:1}),e=>e instanceof BatteryApiError&&e.status===0);
 assert.equal(calls,1);
});

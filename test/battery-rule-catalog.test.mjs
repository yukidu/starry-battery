import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog=JSON.parse(await readFile(new URL("../rules-catalog.json",import.meta.url),"utf8"));
const rules=catalog.rules;
const ids=rules.map(x=>x.id);
test("Battery catalog is a non-authoritative index linked to M06 and M06-A",()=>{
 assert.match(catalog.m06_url,/10XEaZagWP_hwF1kn3JidrjYyfE3-7L9SZLND2CZdAXA/);
 assert.match(catalog.overview_url,/1T-SXNilxJ9QnwHotDkFAC3OHIbZtpPo0KJ8PgcDeRLc/);
 assert.equal(catalog.production_ready,false,"never mark as Production without gate evidence");
 assert.ok(rules.length>=10);
});
test("Battery rule IDs are unique, stable and carry a valid lifecycle status",()=>{
 assert.equal(new Set(ids).size,ids.length,"duplicate rule ID can silently shadow an existing policy");
 const allowed=new Set(["decided","developed","pending","unverified","deployed"]);
 for(const r of rules){
  assert.match(r.id,/^BAT-[A-Z]\d\d$/);
  assert.ok(allowed.has(r.status),"unknown status for "+r.id);
  assert.ok(typeof r.name==="string"&&r.name.trim());
  if(r.status==="pending")assert.equal(r.enabled,false,"unconfirmed business rule must fail closed: "+r.id);
 }
});
test("decided overdraft remains disabled pending acceptance and H-Global cannot call Battery",()=>{
 const overdraft=rules.find(x=>x.id==="BAT-B05");
 assert.equal(overdraft.status,"developed");
 assert.equal(overdraft.enabled,false);
 assert.equal(overdraft.successful_overdraft_limit,2);
 assert.equal(overdraft.concurrent_overdraft_limit,1);
 assert.equal(overdraft.reset_when_debt_zero,true);
 const onlyStarry=rules.find(x=>x.id==="BAT-A01");
 assert.equal(onlyStarry.hglobal_battery_allowed,false);
});
test("technical defaults match the current approved API contract",()=>{
 const rate=rules.find(x=>x.id==="BAT-A03");
 const timeout=rules.find(x=>x.id==="BAT-B02");
 assert.equal(rate.rate_limit_default_per_minute,120);
 assert.deepEqual(rate.rate_limit_schema_range,[1,10000]);
 assert.equal(timeout.timeout_default_seconds,180);
});

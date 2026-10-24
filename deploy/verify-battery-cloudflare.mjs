// GET-only Battery Cloudflare release inventory. No D1 queries, deployments or mutations.
// Does not authorize activation even when the inventory matches.
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
const targets=JSON.parse(await readFile(new URL("./battery-targets.json",import.meta.url),"utf8"));
const serviceTypes={engine:"d1",gateway:"service",archive:"r2_bucket"};
export async function inspectBatteryRelease({target,accountId,token,request=fetch,manifest=targets}){
 if(!["preview","production"].includes(target))throw Error("invalid_target");
 if(!/^[a-f0-9]{32}$/i.test(accountId||""))throw Error("invalid_account_id");
 if(typeof token!=="string"||token.length<10)throw Error("battery_read_token_missing");
 const expected=manifest[target];
 if(!expected?.d1_id||!expected?.r2_bucket)throw Error("manifest_incomplete");
 if(manifest.forbidden_central_d1_ids.includes(expected.d1_id))throw Error("central_d1_forbidden");
 const base="https://api.cloudflare.com/client/v4/accounts/"+accountId;
 const get=async(route,allow404=false)=>{
  const response=await request(base+route,{method:"GET",headers:{"Authorization":"Bearer "+token}});
  if(allow404&&response.status===404)return null;
  if(!response.ok)throw Error("cloudflare_read_failed_"+response.status);
  const data=await response.json();
  if(data?.success!==true)throw Error("cloudflare_api_rejected");
  return data.result;
 };
 const database=await get("/d1/database/"+expected.d1_id);
 if(database?.uuid!==expected.d1_id||database?.name!==expected.d1_name)throw Error("battery_d1_target_mismatch");
 const buckets=await get("/r2/buckets");
 if(!Array.isArray(buckets?.buckets)||!buckets.buckets.some(b=>b.name===expected.r2_bucket))throw Error("battery_r2_target_missing");
 const statuses={},blockers=[];
 for(const part of ["engine","gateway","archive"]){
  const name=expected[part];
  if(!name?.startsWith("starry-battery-"))throw Error("non_battery_worker");
  const settings=await get("/workers/scripts/"+name+"/settings",true);
  if(!settings){statuses[part]="not_deployed";blockers.push(part+"_not_deployed");continue;}
  const bindings=settings.bindings;
  if(!Array.isArray(bindings))throw Error("missing_bindings_"+part);
  const byName=new Map(bindings.map(x=>[x.name,x]));
  const d1=byName.get("BATTERY_DB");
  if(part!=="gateway"&&part!=="engine"&&part!=="archive")throw Error("invalid_part");
  if(d1?.type!=="d1"||(d1.id||d1.database_id)!==expected.d1_id)throw Error("incorrect_battery_d1_binding_"+part);
  if(bindings.some(x=>x.type==="d1"&&manifest.forbidden_central_d1_ids.includes(x.id||x.database_id)))throw Error("central_d1_binding_"+part);
  if(part==="gateway"){
   const engine=byName.get("BATTERY_ENGINE");
   if(engine?.type!=="service"||engine.service!==expected.engine)throw Error("wrong_private_engine_binding");
   if(!byName.has("CENTRAL_AUTH_VERIFY"))blockers.push("central_auth_binding_missing");
  }
  if(part==="gateway"||part==="archive"){
   const r2=byName.get("BATTERY_ARCHIVE_R2");
   if(r2?.type!=="r2_bucket")throw Error("archive_r2_binding_missing_"+part);
  }
  if(part==="archive"&&byName.get("BATTERY_ARCHIVE_ENABLED")?.text!=="false")throw Error("archive_not_safely_disabled");
  if(part==="engine"){
   for(const key of ["BATTERY_OPERATIONS_ENABLED","BATTERY_CREDIT_ENABLED","BATTERY_OVERDRAFT_ENABLED"]){
    if(byName.get(key)?.text!=="false")throw Error("engine_not_safely_disabled_"+key);
   }
  }
  if(part!=="gateway"){
   const sub=await get("/workers/scripts/"+name+"/subdomain");
   if(sub?.enabled===true||sub?.previews_enabled===true)throw Error("private_worker_public_"+part);
  }
  statuses[part]="deployed_disabled_or_protected";
 }
 return {target,database:expected.d1_name,d1_id:expected.d1_id,r2:expected.r2_bucket,
   worker_status:statuses,blockers:[...blockers,...manifest.require_for_activation],
   production_fully_activated:false,read_only:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 inspectBatteryRelease({target:process.argv[2],accountId:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN_BATTERY}).then(x=>{
  process.stdout.write(JSON.stringify(x,null,2)+"\n");
 },e=>{process.stderr.write("Battery preflight blocked: "+String(e.message)+"\n");process.exitCode=1;});
}

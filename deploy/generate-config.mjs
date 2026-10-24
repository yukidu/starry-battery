// Generate service-specific Wrangler configs without modifying Central ID resources.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const base=new URL("../",import.meta.url);
const targets=JSON.parse(fs.readFileSync(new URL("./battery-targets.json",import.meta.url),"utf8"));
const target=process.env.BATTERY_TARGET;
const d1id=process.env.BATTERY_D1_ID;
const d1name=process.env.BATTERY_D1_NAME;
const central=process.env.CENTRAL_AUTH_WORKER||"";
const archiveBucket=process.env.BATTERY_R2_BUCKET||"";
if(!["preview","production"].includes(target))throw Error("invalid_battery_target");
if(!/^[a-f0-9-]{36}$/i.test(d1id||""))throw Error("missing_battery_d1_id");
if(!/^[a-zA-Z0-9_-]{3,128}$/.test(d1name||""))throw Error("missing_battery_d1_name");
if(central&&!/^[a-z0-9][a-z0-9-]{2,62}$/.test(central))throw Error("invalid_central_auth_worker_name");
if(target==="production"&&!central)throw Error("production_requires_verified_central_auth_worker");
if(!/^[a-z0-9][a-z0-9-]{2,62}$/.test(archiveBucket))throw Error("battery_archive_bucket_required");
const release=targets[target];
if(!release||release.d1_id!==d1id||release.d1_name!==d1name||release.r2_bucket!==archiveBucket)throw Error("battery_release_target_manifest_mismatch");
if([d1id].some(id=>targets.forbidden_central_d1_ids.includes(id)))throw Error("central_d1_forbidden");
const engineName=release.engine;
const common={compatibility_date:"2026-10-01",d1_databases:[{binding:"BATTERY_DB",database_name:d1name,database_id:d1id}]};
const engine={...common,name:engineName,main:"engine.mjs",workers_dev:false,vars:{BATTERY_OPERATIONS_ENABLED:"false",BATTERY_OVERDRAFT_ENABLED:"false",BATTERY_CREDIT_ENABLED:"false"},triggers:{crons:[]}};
const gateway={...common,name:release.gateway,main:"worker.mjs",workers_dev:target==="preview",r2_buckets:[{binding:"BATTERY_ARCHIVE_R2",bucket_name:archiveBucket}],services:[{binding:"BATTERY_ENGINE",service:engineName}]};
if(central)gateway.services.push({binding:"CENTRAL_AUTH_VERIFY",service:central});
const archive={...common,name:release.archive,main:"archive.mjs",workers_dev:false,r2_buckets:[{binding:"BATTERY_ARCHIVE_R2",bucket_name:archiveBucket}],vars:{BATTERY_ARCHIVE_ENABLED:"false"},triggers:{crons:[]}};
for(const [name,config] of [["engine",engine],["gateway",gateway],["archive",archive]]){
 const output=path.join(fileURLToPath(base),".wrangler."+name+".generated.json");
 fs.writeFileSync(output,JSON.stringify(config,null,2)+"\n",{mode:0o600});
}
console.log("Generated isolated Battery Wrangler configs for",target,"(no Central ID settings modified)");

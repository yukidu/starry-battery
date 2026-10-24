// Private one-shot Cloudflare R2 + D1 E2E. Never bind to Production.
import {archiveOldLedgerRows,readArchivedLedger,archiveObjectKey} from "./archive.mjs";
const RUN_ID="bat-r2-archive-e2e-20261024-01";
export default{
 async scheduled(_event,env){
  const db=env?.BATTERY_DB,bucket=env?.BATTERY_ARCHIVE_R2;
  if(!db?.batch||!bucket?.put||!bucket?.get||!bucket?.delete)throw Error("sandbox_bindings_missing");
  await db.prepare("CREATE TABLE IF NOT EXISTS battery_r2_e2e_results(run_id TEXT PRIMARY KEY,passed INTEGER NOT NULL,report TEXT NOT NULL)").run();
  const existing=await db.prepare("SELECT run_id FROM battery_r2_e2e_results WHERE run_id=?").bind(RUN_ID).first();
  if(existing)return;
  await db.prepare("CREATE TABLE IF NOT EXISTS battery_r2_e2e_claims(run_id TEXT PRIMARY KEY)").run();
  const claim=await db.prepare("INSERT OR IGNORE INTO battery_r2_e2e_claims(run_id) VALUES(?)").bind(RUN_ID).run();
  if(Number(claim?.meta?.changes||0)!==1)return;
  const user_id="e2e_archive_member",entry_id="e2e_archive_entry_123";
  const now=Date.now(),past=now-450*86400000;
  const row={entry_id,user_id,app_id:"e2e_archive",operation_id:"e2e_archive_task",quantity_delta:-7,created_at_ms:past};
  const key=archiveObjectKey(row);
  let report={run_id:RUN_ID,passed:0,step:"seed"};
  try{
   await db.batch([
    db.prepare("INSERT INTO battery_wallets(user_id,available_units,reserved_units,version) VALUES(?,0,0,1)").bind(user_id),
    db.prepare("INSERT INTO battery_ledger(entry_id,user_id,app_id,operation_id,quantity_delta,created_at_ms) VALUES(?,?,?,?,?,?)").bind(entry_id,user_id,row.app_id,row.operation_id,-7,past)
   ]);
   report.step="archive";
   const a=await archiveOldLedgerRows(db,bucket,now,5);
   if(a.archived!==1||a.failed!==0)throw Error("unexpected_archive_result "+JSON.stringify(a));
   report.step="verify";
   const original=await db.prepare("SELECT entry_id FROM battery_ledger WHERE entry_id=?").bind(entry_id).first();
   if(original)throw Error("unarchived_entry_still_in_d1");
   const index=await db.prepare("SELECT entry_id,digest_sha256 FROM battery_archive_index WHERE entry_id=?").bind(entry_id).first();
   if(!index||index.digest_sha256.length!==64)throw Error("missing_archive_index");
   const retrieved=await readArchivedLedger(db,bucket,user_id);
   if(retrieved.length!==1||retrieved[0].entry_id!==entry_id||retrieved[0].quantity_delta!==-7)throw Error("archive_readback_mismatch");
   report={run_id:RUN_ID,passed:1,step:"verified",checked:a.checked,archived:a.archived};
  }catch(e){report={run_id:RUN_ID,passed:0,step:report.step,error:String(e).slice(0,260)};}
  finally{
   try{
    await db.batch([
     db.prepare("DELETE FROM battery_archive_index WHERE entry_id=? AND user_id=?").bind(entry_id,user_id),
     db.prepare("DELETE FROM battery_ledger WHERE entry_id=? AND user_id=?").bind(entry_id,user_id),
     db.prepare("DELETE FROM battery_wallets WHERE user_id=?").bind(user_id)
    ]);
    await bucket.delete(key);
   }catch(e){report.passed=0;report.cleanup_error=String(e).slice(0,160);}
   await db.prepare("INSERT OR IGNORE INTO battery_r2_e2e_results(run_id,passed,report) VALUES(?,?,?)").bind(RUN_ID,report.passed,JSON.stringify(report)).run();
  }
 },
 async fetch(){return new Response("not_found",{status:404})}
};

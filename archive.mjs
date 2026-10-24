// Private, disabled-by-default R2 archive worker. Do not attach any public route.
// D1 entries are removed ONLY after R2 content read-back matches SHA-256 and
// a matching immutable archive index is present within the same D1 transaction.
const dig=async text=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)))).map(b=>b.toString(16).padStart(2,"0")).join("");
const validRow=r=>r&&/^[A-Za-z0-9_-]{8,120}$/.test(r.entry_id||"")&&
 typeof r.user_id==="string"&&/^[A-Za-z0-9_-]{4,180}$/.test(r.user_id)&&
 Number.isSafeInteger(r.created_at_ms)&&Number.isSafeInteger(r.quantity_delta);
const cutoffYear=now=>{const d=new Date(now);d.setUTCFullYear(d.getUTCFullYear()-1);return d.getTime();};
export function archiveObjectKey(r){
 if(!validRow(r))throw Error("invalid_ledger_record");
 const dt=new Date(r.created_at_ms);
 return "starry-battery/ledger/v1/"+dt.getUTCFullYear()+"/"+String(dt.getUTCMonth()+1).padStart(2,"0")+"/"+r.entry_id+".json";
}
const recordBody=r=>JSON.stringify({schema_version:1,entry_id:r.entry_id,user_id:r.user_id,app_id:r.app_id??null,operation_id:r.operation_id??null,quantity_delta:r.quantity_delta,created_at_ms:r.created_at_ms});
export async function archiveOldLedgerRows(db,bucket,now=Date.now(),limit=10){
 if(!db?.batch||!bucket?.put||!bucket?.get)throw Error("archive_bindings_unavailable");
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error("invalid_archive_limit");
 const cutoff=cutoffYear(now);
 const q=await db.prepare("SELECT entry_id,user_id,app_id,operation_id,quantity_delta,created_at_ms FROM battery_ledger WHERE created_at_ms<? ORDER BY created_at_ms,entry_id LIMIT ?").bind(cutoff,limit).all();
 let archived=0,failed=0;
 for(const row of q.results||[]){
  try{
   if(!validRow(row))throw Error("invalid_archive_record");
   const key=archiveObjectKey(row),body=recordBody(row),digest=await dig(body);
   const old=await bucket.get(key);
   if(old){
    if(await old.text()!==body)throw Error("immutable_r2_object_conflict");
   }else await bucket.put(key,body,{httpMetadata:{contentType:"application/json"}});
   const reread=await bucket.get(key);
   if(!reread||await reread.text()!==body)throw Error("r2_readback_mismatch");
   const changes=await db.batch([
    db.prepare("INSERT OR IGNORE INTO battery_archive_index(entry_id,user_id,created_at_ms,object_key,digest_sha256,archived_at_ms) VALUES(?,?,?,?,?,?)").bind(row.entry_id,row.user_id,row.created_at_ms,key,digest,now),
    db.prepare("DELETE FROM battery_ledger WHERE entry_id=? AND user_id=? AND EXISTS (SELECT 1 FROM battery_archive_index WHERE entry_id=? AND user_id=? AND object_key=? AND digest_sha256=?)").bind(row.entry_id,row.user_id,row.entry_id,row.user_id,key,digest)
   ]);
   if(Number(changes?.[1]?.meta?.changes||0)!==1)throw Error("r2_index_transaction_conflict");
   archived++;
  }catch{failed++;}
 }
 return {checked:(q.results||[]).length,archived,failed};
}
export async function readArchivedLedger(db,bucket,userId,beforeMs=Number.MAX_SAFE_INTEGER,limit=50,beforeId="~"){
 if(!db?.prepare||!bucket?.get)throw Error("archive_bindings_unavailable");
 if(!/^[A-Za-z0-9_-]{4,180}$/.test(userId||"")||!Number.isSafeInteger(beforeMs)||
   !Number.isSafeInteger(limit)||limit<1||limit>50||!(/^[A-Za-z0-9_-]{8,120}$/.test(beforeId)||beforeId==="~"))throw Error("invalid_archive_query");
 const q=await db.prepare("SELECT entry_id,object_key,digest_sha256 FROM battery_archive_index WHERE user_id=? AND (created_at_ms<? OR (created_at_ms=? AND entry_id<?)) ORDER BY created_at_ms DESC,entry_id DESC LIMIT ?").bind(userId,beforeMs,beforeMs,beforeId,limit).all();
 const rows=[];
 for(const row of q.results||[]){
  const obj=await bucket.get(row.object_key);
  if(!obj)throw Error("archive_object_missing");
  const text=await obj.text();
  if(await dig(text)!==row.digest_sha256)throw Error("archive_checksum_mismatch");
  const parsed=JSON.parse(text);
  if(parsed.entry_id!==row.entry_id||parsed.user_id!==userId||!validRow(parsed))throw Error("archive_identity_mismatch");
  rows.push(parsed);
 }
 return rows;
}
export default{
 async scheduled(_event,env){
  if(env?.BATTERY_ARCHIVE_ENABLED!=="true")return;
  if(!env?.BATTERY_DB?.batch||!env?.BATTERY_ARCHIVE_R2?.put)throw Error("archive_not_configured");
  const outcome=await archiveOldLedgerRows(env.BATTERY_DB,env.BATTERY_ARCHIVE_R2);
  if(outcome.failed>0)throw Error("archive_mismatch_incomplete");
 },
 async fetch(){return new Response("not_found",{status:404});}
};

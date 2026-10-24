import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import archivist,{archiveOldLedgerRows,readArchivedLedger,archiveObjectKey} from "../archive.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const now=Date.UTC(2026,9,24),older=Date.UTC(2024,8,12);
const entry={entry_id:"archive_entry_123",user_id:"member_123",app_id:"starry_echo",
 operation_id:"operation_123",quantity_delta:-13,created_at_ms:older};
function fixture(rows=[entry]){
 const objects=new Map(),batches=[],requests=[];
 const db={
  prepare(sql){return{bind(...args){requests.push({sql,args});return{
    async all(){
     if(sql.includes("FROM battery_ledger"))return {results:rows};
     if(sql.includes("FROM battery_archive_index"))return {results:[]};
     throw Error("unexpected archive select "+sql);
    }
  }}}},
  async batch(batch){batches.push(batch);return [{meta:{changes:1}},{meta:{changes:1}}];}
 };
 const bucket={
  async put(k,v){objects.set(k,v);},
  async get(k){const s=objects.get(k);return s===undefined?null:{text:async()=>s};}
 };
 return {db,bucket,objects,batches,requests};
}
test("archive a verified older transaction only after immutable R2 readback",async()=>{
 const x=fixture();
 const result=await archiveOldLedgerRows(x.db,x.bucket,now);
 assert.deepEqual(result,{checked:1,archived:1,failed:0});
 assert.equal(x.batches.length,1);
 assert.equal(x.batches[0].length,2);
 const key=archiveObjectKey(entry);
 assert.ok(x.objects.has(key));
 const index=x.requests.find(x=>x.sql.includes("INSERT OR IGNORE INTO battery_archive_index"));
 assert.equal(index.args[0],entry.entry_id);
 assert.match(index.args[4],/^[a-f0-9]{64}$/);
});
test("existing different R2 body may not be silently overwritten or deleted from D1",async()=>{
 const x=fixture();
 x.objects.set(archiveObjectKey(entry),"tampered");
 const result=await archiveOldLedgerRows(x.db,x.bucket,now);
 assert.deepEqual(result,{checked:1,archived:0,failed:1});
 assert.equal(x.batches.length,0);
 assert.equal(x.objects.get(archiveObjectKey(entry)),"tampered");
});
test("missing R2 bucket fails before any D1 archive transaction",async()=>{
 const x=fixture();
 await assert.rejects(archiveOldLedgerRows(x.db,null,now));
 assert.equal(x.batches.length,0);
});
test("archived reads verify digest and immutable member before returning history",async()=>{
 const text=JSON.stringify({schema_version:1,...entry});
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)))).map(b=>b.toString(16).padStart(2,"0")).join("");
 const key=archiveObjectKey(entry);
 const db={prepare(sql){return{bind(...args){assert.equal(args[0],entry.user_id);return{async all(){return {results:[{entry_id:entry.entry_id,object_key:key,digest_sha256:sha}]};}}}}}};
 const good={get:async()=>({text:async()=>text})};
 const result=await readArchivedLedger(db,good,entry.user_id);
 assert.equal(result.length,1);assert.equal(result[0].quantity_delta,-13);
 const corrupted={get:async()=>({text:async()=>text+" "})};
 await assert.rejects(readArchivedLedger(db,corrupted,entry.user_id),/archive_checksum_mismatch/);
});
test("private scheduled archive is disabled by default",async()=>{
 await assert.doesNotReject(()=>archivist.scheduled({},{}));
});

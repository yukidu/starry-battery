// Multi-App sandbox verifier. Synthetic members only; never use for Production.
// SHA-256 token digests live in an encrypted Worker secret, not a Public repository.
const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(v=>v.toString(16).padStart(2,"0")).join("");
function equal(a,b){if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
export default{
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==="/health"&&request.method==="GET")return respond({service:"starry-battery-multiapp-sandbox-auth",synthetic_only:true});
  if(path!=="/v1/introspect"||request.method!=="POST")return respond({error:"not_found"},404);
  if(env?.SANDBOX_ENABLED!=="true"||typeof env.SANDBOX_CALLER_SECRET!=="string"||env.SANDBOX_CALLER_SECRET.length<32||typeof env.SANDBOX_TOKEN_REGISTRY!=="string")return respond({error:"sandbox_disabled"},503);
  const caller=request.headers.get("X-Central-Service-Auth")||"";
  if(caller.length>512||!equal(caller,env.SANDBOX_CALLER_SECRET)||request.headers.get("X-Battery-Caller")!=="starry")return respond({error:"service_denied"},403);
  const match=/^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(request.headers.get("Authorization")||"");
  if(!match)return respond({error:"invalid_sandbox_token"},401);
  let body;try{const raw=await request.text();if(raw.length>256)return respond({error:"invalid_body"},400);body=JSON.parse(raw);}
  catch{return respond({error:"invalid_body"},400);}
  if(!body||Object.keys(body).sort().join(",")!=="required_brand"||body.required_brand!=="starry")return respond({error:"brand_denied"},403);
  let members;try{
   members=JSON.parse(env.SANDBOX_TOKEN_REGISTRY);
   if(!Array.isArray(members)||members.length<1||members.length>100||members.some(m=>!m||!/^[a-f0-9]{64}$/.test(m.token_sha256||"")||!/^sandbox_[a-z0-9_]{4,80}$/.test(m.user_id||"")||m.active!==true))throw Error("invalid_registry");
  }catch{return respond({error:"sandbox_registry_invalid"},503);}
  const hash=await digest(match[1]);
  const member=members.find(m=>equal(m.token_sha256,hash));
  if(!member)return respond({error:"sandbox_token_rejected"},403);
  return respond({active:true,brand_allowed:true,user_id:member.user_id,suspended:false,sandbox:true});
 }
};

// NEVER deploy this Worker outside the isolated Battery App Sandbox.
// Not Central ID, OAuth, a production token issuer, or real Starry membership.
// A single synthetic member token is verified for controlled private E2E.
const body=(data,status)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const eq=async(a,b)=>{
 if(typeof a!=="string"||typeof b!=="string")return false;
 const enc=new TextEncoder();
 const [ha,hb]=await Promise.all([crypto.subtle.digest("SHA-256",enc.encode(a)),crypto.subtle.digest("SHA-256",enc.encode(b))]);
 const x=new Uint8Array(ha),y=new Uint8Array(hb);let diff=0;
 for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
 return diff===0;
};
export default{
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(request.method!=="POST"||path!=="/v1/introspect")return body({error:"not_found"},404);
  if(env?.BATTERY_SANDBOX_MODE!=="true"||
      typeof env.SANDBOX_AUTH_CALLER_SECRET!=="string"||env.SANDBOX_AUTH_CALLER_SECRET.length<32||
      typeof env.SANDBOX_MEMBER_TOKEN!=="string"||env.SANDBOX_MEMBER_TOKEN.length<32)
     return body({error:"sandbox_not_configured"},503);
  const caller=request.headers.get("X-Central-Service-Auth")||"";
  const token=request.headers.get("Authorization")||"";
  if(caller.length>1024||token.length>4096||!token.startsWith("Bearer ")||
    !await eq(caller,env.SANDBOX_AUTH_CALLER_SECRET)||!await eq(token.slice(7),env.SANDBOX_MEMBER_TOKEN))
    return body({error:"invalid_sandbox_member"},403);
  let value;
  try{if(request.headers.get("Content-Type")!=="application/json")return body({error:"invalid_content_type"},415);
    const raw=await request.text();if(raw.length>256)return body({error:"oversize"},413);value=JSON.parse(raw);}
  catch{return body({error:"invalid_body"},400);}
  if(!value||Object.keys(value).sort().join(",")!=="required_brand"||value.required_brand!=="starry")return body({error:"starry_only"},403);
  return body({active:true,brand_allowed:true,suspended:false,user_id:"sandbox_member_qa01",sandbox:true,real_member:false},200);
 }
};

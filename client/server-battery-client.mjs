// Server-side only. Never import in browser bundles or expose appKey to mobile clients.
// The Central Access token must come from the server's verified logged-in member session.
const APP_ID=/^[a-z0-9_-]{3,80}$/;
const OP_ID=/^[A-Za-z0-9_-]{8,120}$/;
export class BatteryApiError extends Error{
 constructor(message,status,body){super(message);this.name="BatteryApiError";this.status=status;this.body=body;}
}
export class StarryBatteryClient{
 constructor({baseUrl,appId,appKey,fetchImpl=fetch,timeoutMs=10000}){
  if(typeof baseUrl!=="string"||!/^https:\/\//i.test(baseUrl))throw new TypeError("Battery baseUrl must use HTTPS");
  if(!APP_ID.test(appId||""))throw new TypeError("Invalid registered Starry appId");
  if(typeof appKey!=="string"||!/^[A-Za-z0-9._~-]{32,512}$/.test(appKey))throw new TypeError("Missing private appKey");
  if(typeof fetchImpl!=="function")throw new TypeError("Missing HTTP fetch");
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw new TypeError("Invalid timeout");
  this.url=baseUrl.replace(/\/+$/,"");this.appId=appId;this.appKey=appKey;this.fetchImpl=fetchImpl;this.timeoutMs=timeoutMs;
 }
 async request(method,path,centralAccessToken,payload){
  if(typeof centralAccessToken!=="string"||centralAccessToken.length<8||centralAccessToken.length>4096)throw new TypeError("Missing trusted Central Access token");
  if(!/^\/(?:v1\/battery\/)(?:wallet|ledger|reserve|commit|release)(?:\?.*)?$/.test(path))throw new TypeError("Unsupported Battery route");
  const headers={"X-Battery-App-Id":this.appId,"Authorization":"Bearer "+this.appKey,
    "X-Central-Access-Token":centralAccessToken,"Accept":"application/json"};
  const options={method,headers,signal:AbortSignal.timeout(this.timeoutMs),cache:"no-store"};
  if(payload!==undefined){headers["Content-Type"]="application/json";options.body=JSON.stringify(payload);}
  let r;
  try{r=await this.fetchImpl(this.url+path,options);}
  catch(err){throw new BatteryApiError("battery_network_or_timeout",0,{error:String(err?.name||"network_error")});}
  let body;
  try{body=await r.json();}catch{throw new BatteryApiError("battery_invalid_response",r.status,null);}
  if(!r.ok)throw new BatteryApiError(body?.error||"battery_request_failed",r.status,body);
  return body;
 }
 wallet(token){return this.request("GET","/v1/battery/wallet",token);}
 ledger(token,{beforeMs,beforeId}={}){
  if(beforeId!==undefined&&beforeMs===undefined)throw new TypeError("Ledger cursor requires timestamp");
  const q=new URLSearchParams();
  if(beforeMs!==undefined){
   if(!Number.isSafeInteger(beforeMs)||beforeMs<1)throw new TypeError("Invalid cursor time");
   q.set("before_ms",String(beforeMs));
  }
  if(beforeId!==undefined){if(!OP_ID.test(beforeId))throw new TypeError("Invalid cursor entry");q.set("before_id",beforeId);}
  const path="/v1/battery/ledger"+(q.size?"?"+q.toString():"");
  return this.request("GET",path,token);
 }
 reserve(token,{operationId,quantity}){
  if(!OP_ID.test(operationId||"")||!Number.isSafeInteger(quantity)||quantity<1)throw new TypeError("Invalid reservation");
  return this.request("POST","/v1/battery/reserve",token,{operation_id:operationId,quantity});
 }
 commit(token,{operationId}){
  if(!OP_ID.test(operationId||""))throw new TypeError("Invalid operationId");
  return this.request("POST","/v1/battery/commit",token,{operation_id:operationId});
 }
 release(token,{operationId}){
  if(!OP_ID.test(operationId||""))throw new TypeError("Invalid operationId");
  return this.request("POST","/v1/battery/release",token,{operation_id:operationId});
 }
}

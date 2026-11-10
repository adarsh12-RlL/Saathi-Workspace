// Isolated public reader: no vault, mission, memory, auth or provider imports.
export const MOLTBOOK_ORIGIN = "https://www.moltbook.com";
export const MOLTBOOK_PUBLIC_FEED = `${MOLTBOOK_ORIGIN}/api/v1/posts?sort=new&limit=10`;
export const MOLTBOOK_READ_CONSENT = "moltbook-public-v1";
const MAX_RESPONSE_BYTES = 512 * 1024;
const POST_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export class CommunityBridgeError extends Error {
  constructor(code) { super(code); this.name="CommunityBridgeError"; this.code=code; }
}
function field(raw,key) {
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw new CommunityBridgeError("INVALID_FEED");
  const descriptor=Object.getOwnPropertyDescriptor(raw,key);
  if(!descriptor||!("value" in descriptor)||!descriptor.enumerable)throw new CommunityBridgeError("INVALID_FEED");
  return descriptor.value;
}
function plain(value,maximum,required=false) {
  if(typeof value!=="string"||(required&&!value.trim()))throw new CommunityBridgeError("INVALID_FEED");
  // Plain text only; never decode HTML, evaluate markdown or execute instructions.
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,"").slice(0,maximum);
}
export function normalizeMoltbookFeed(raw) {
  if(field(raw,"success")!==true)throw new CommunityBridgeError("UNAVAILABLE");
  const source=field(raw,"posts");
  if(!Array.isArray(source)||source.length>10)throw new CommunityBridgeError("INVALID_FEED");
  const ids=new Set();
  return Array.from(source,item=>{
    const rawId=field(item,"id");if(typeof rawId!=="string"||!POST_ID.test(rawId))throw new CommunityBridgeError("INVALID_FEED");
    const id=rawId.toLowerCase();if(ids.has(id))throw new CommunityBridgeError("INVALID_FEED");ids.add(id);
    const content=field(item,"content");
    return {id,title:plain(field(item,"title"),240,true),content:content===null?"":plain(content,3000),author:plain(field(field(item,"author"),"name"),80,true),community:plain(field(field(item,"submolt"),"name"),80,true),url:`${MOLTBOOK_ORIGIN}/post/${id}`};
  });
}
async function smallJson(body,maximum) {
  if(!body)throw new CommunityBridgeError("INVALID_FEED");
  const reader=body.getReader(),chunks=[];let total=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maximum){await reader.cancel();throw new CommunityBridgeError("TOO_LARGE");}chunks.push(value);}
    const bytes=new Uint8Array(total);let cursor=0;for(const chunk of chunks){bytes.set(chunk,cursor);cursor+=chunk.length;}
    try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch{throw new CommunityBridgeError("INVALID_JSON");}
  }finally{reader.releaseLock();}
}
export async function readMoltbookPublicFeed({fetcher=globalThis.fetch,signal}={}) {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  const cancel=()=>controller.abort();if(signal?.aborted)controller.abort();else signal?.addEventListener("abort",cancel,{once:true});
  try {
    const response=await fetcher(MOLTBOOK_PUBLIC_FEED,{method:"GET",headers:{Accept:"application/json"},credentials:"omit",redirect:"error",referrerPolicy:"no-referrer",cache:"no-store",signal:controller.signal});
    if(!response.ok||response.redirected||(response.url&&response.url!==MOLTBOOK_PUBLIC_FEED))throw new CommunityBridgeError("UNAVAILABLE");
    if((response.headers.get("content-type")??"").split(";",1)[0].trim().toLowerCase()!=="application/json")throw new CommunityBridgeError("INVALID_FEED");
    const size=response.headers.get("content-length");if(size&&(!/^\d+$/.test(size)||Number(size)>MAX_RESPONSE_BYTES)){await response.body?.cancel();throw new CommunityBridgeError("TOO_LARGE");}
    return normalizeMoltbookFeed(await smallJson(response.body,MAX_RESPONSE_BYTES));
  }catch(reason){if(reason instanceof CommunityBridgeError)throw reason;throw new CommunityBridgeError("UNAVAILABLE");}
  finally{clearTimeout(timeout);signal?.removeEventListener("abort",cancel);}
}
function reply(status,payload) {return Response.json(payload,{status,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});}
export function createMoltbookReadHandler({fetcher=globalThis.fetch,now=()=>Date.now(),minimumIntervalMs=10000}={}) {
  let running=false,lastRequest=null;
  return async function handle(request) {
    if(request.method!=="POST")return reply(405,{ok:false,error:"Only explicit public-read requests are supported."});
    const url=new URL(request.url),origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");
    if(url.pathname!=="/api/community/moltbook"||url.search||origin!==url.origin||(site&&site!=="same-origin"))return reply(403,{ok:false,error:"Use the separate SAATHI community page."});
    if((request.headers.get("content-type")??"").split(";",1)[0].trim().toLowerCase()!=="application/json")return reply(415,{ok:false,error:"A small JSON consent request is required."});
    let input;
    try{input=await smallJson(request.body,512);}catch{return reply(400,{ok:false,error:"Invalid public-read request."});}
    if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!=="consent,operation"||input.operation!=="read_public"||input.consent!==MOLTBOOK_READ_CONSENT)return reply(400,{ok:false,error:"Public-read consent is required. Private data is not accepted."});
    const at=now();
    if(running||(lastRequest!==null&&at-lastRequest<minimumIntervalMs))return reply(429,{ok:false,error:"Wait ten seconds before refreshing the public feed."});
    running=true;lastRequest=at;
    try{return reply(200,{ok:true,posts:await readMoltbookPublicFeed({fetcher,signal:request.signal}),fetchedAt:new Date(at).toISOString()});}
    catch{return reply(502,{ok:false,error:"Moltbook's public feed is unavailable. Nothing was added to your workspace."});}
    finally{running=false;}
  };
}

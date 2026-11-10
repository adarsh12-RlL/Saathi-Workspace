export const PRIVATE_CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; worker-src 'none'; media-src 'none'";
export function privatePageHeaders() {
  return ["/", "/private-workspace", "/review-lab"].map(source => ({source,headers:[
    {key:"Content-Security-Policy",value:PRIVATE_CSP},
    {key:"Referrer-Policy",value:"no-referrer"},
    {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
    {key:"X-Content-Type-Options",value:"nosniff"},
  ]}));
}
export function communityPageHeaders() {
  // The browser connects only to this app's fixed public-reader endpoint.
  // Direct Moltbook calls, external scripts/images, embeds and forms stay off.
  return [{source:"/community/moltbook",headers:[
    {key:"Content-Security-Policy",value:PRIVATE_CSP.replace("connect-src 'none'","connect-src 'self'")},
    {key:"Referrer-Policy",value:"no-referrer"},
    {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
    {key:"X-Content-Type-Options",value:"nosniff"},
  ]}];
}
export function assertPrivacyEgress({mode,destination}) {
  if (mode === "private" && destination === "device") return;
  if (mode === "cloud-opt-in" && ["device","cloud"].includes(destination)) return;
  throw new Error("This connection is disabled by the workspace privacy mode.");
}

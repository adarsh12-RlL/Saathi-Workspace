import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PRIVATE_CSP,privatePageHeaders,assertPrivacyEgress} from "./privacy-policy.mjs";
test("private CSP blocks fetch, sockets, frames, forms, media and reporting sinks",()=>{
  for(const directive of ["connect-src 'none'","form-action 'none'","frame-src 'none'","object-src 'none'","worker-src 'none'","media-src 'none'"])assert.ok(PRIVATE_CSP.includes(directive));
  assert.ok(!/https?:|report-uri|report-to|unsafe-eval/.test(PRIVATE_CSP));
  assert.deepEqual(privatePageHeaders().map(route=>route.source),["/","/private-workspace","/review-lab"]);
  assert.ok(!privatePageHeaders().some(route=>route.source==="/cloud"));
  for(const route of privatePageHeaders())assert.equal(route.headers.find(header=>header.key==="Referrer-Policy").value,"no-referrer");
});
test("egress requires an explicit supported mode and destination",()=>{
  assert.doesNotThrow(()=>assertPrivacyEgress({mode:"private",destination:"device"}));
  for(const destination of ["cloud","external-ai","community",undefined])assert.throws(()=>assertPrivacyEgress({mode:"private",destination}));
  assert.doesNotThrow(()=>assertPrivacyEgress({mode:"cloud-opt-in",destination:"cloud"}));
  assert.throws(()=>assertPrivacyEgress({mode:"cloud-opt-in",destination:"community"}));
});
test("default route selects private mode and cloud is behind an explicit gate",async()=>{
  const home=await readFile(new URL("./web/src/app/page.tsx",import.meta.url),"utf8"),cloud=await readFile(new URL("./web/src/app/cloud/cloud-opt-in.tsx",import.meta.url),"utf8");
  assert.match(home,/PrivateWorkspaceClient/);assert.ok(!home.includes('"./workspace-client"'));assert.match(cloud,/if\(allowed\)/);assert.match(cloud,/setAllowed\(true\)/);
  for(const name of ["private-vault.mjs","private-workspace.mjs","agent-council.mjs"])assert.ok(!/fetch\(|WebSocket\(|sendBeacon\(|supabase-js/.test(await readFile(new URL(`./${name}`,import.meta.url),"utf8")));
});

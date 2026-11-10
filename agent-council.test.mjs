import test from "node:test";
import assert from "node:assert/strict";
import {AGENT_CATALOG,buildPrivateAgentContext,createPrivateCouncilPlan,validatePrivateProfile} from "./agent-council.mjs";
import {rankAcceptedMemories} from "./learning-loop.mjs";
const stamp="2026-10-09T10:00:00.000Z",mid="11111111-1111-4111-8111-111111111111",other="99999999-9999-4999-8999-999999999999";
const mission={id:mid,title:"Study JavaScript",goal:"Learn JavaScript",notes:"Private notes not part of the shared packet",nextStep:"Practice functions",stage:"planned",tasks:[],decisions:[],artifacts:[],miniApps:[],templateSource:null,reflection:null,updatedAt:stamp};
const profile={language:"hinglish",responseStyle:"concise"};
function memory(index,overrides={}){return {schema:"saathi.memory-proposal",version:1,id:`22222222-2222-4222-8222-${String(index).padStart(12,"0")}`,kind:"preference",key:"preference.short",statement:"Use short examples",scope:"global",missionId:null,confidence:1,evidence:[mid],status:"accepted",sensitive:false,createdAt:stamp,updatedAt:stamp,expiresAt:null,...overrides};}
test("private context excludes unapproved, sensitive, forgotten, expired and foreign mission memory",()=>{
  const packet=buildPrivateAgentContext(mission,4,[memory(1),memory(2,{status:"pending"}),memory(3,{sensitive:true}),memory(4,{status:"forgotten",statement:""}),memory(5,{expiresAt:stamp}),memory(6,{scope:"mission",missionId:other}),memory(7,{kind:"procedure",statement:"Bake a cake",key:"procedure.bake"}),memory(8,{kind:"lesson",scope:"mission",missionId:mid,statement:"Practice daily"})],profile,{at:stamp});
  assert.deepEqual(packet.memories.map(item=>item.id),[memory(1).id,memory(8).id]);assert.equal(packet.destination,"device");assert.ok(!JSON.stringify(packet).includes(mission.notes));
  assert.equal(packet.mission.revision,4);assert.equal(packet.profile.language,"hinglish");
});
test("council is inert, bounded, deterministic and shares the same approved evidence",()=>{
  const sequence=()=>{let n=1;return()=>`33333333-3333-4333-8333-${String(n++).padStart(12,"0")}`;};
  const before=structuredClone(mission),first=createPrivateCouncilPlan(mission,1,[memory(1)],profile,{at:stamp,newId:sequence()});
  assert.deepEqual(first,createPrivateCouncilPlan(mission,1,[memory(1)],profile,{at:stamp,newId:sequence()}));
  assert.deepEqual(mission,before);assert.equal(first.proposals.length,4);assert.deepEqual(first.proposals.map(item=>item.role),["planner","tutor","builder","reviewer"]);
  for(const proposal of first.proposals){assert.equal(proposal.status,"proposed");assert.equal(proposal.baseRevision,1);assert.deepEqual(proposal.evidence,first.proposals[0].evidence);assert.ok(proposal.evidence.includes(`memory:${memory(1).id}`));}
  assert.ok(first.proposals[2].body.tasks.some(task=>task.title.includes(memory(1).statement)));
  assert.equal(AGENT_CATALOG.length,13);assert.equal(AGENT_CATALOG.filter(item=>item.runtimeStatus==="local_rules").length,4);
  assert.equal(AGENT_CATALOG.find(item=>item.id==="ambassador").runtimeStatus,"opt_in_reader");
  const full={...mission,tasks:Array.from({length:99},(_,n)=>({id:String(n),title:"Task",done:false}))};for(const proposal of createPrivateCouncilPlan(full,1,[],profile).proposals)assert.equal(proposal.body.tasks.length,1);
  assert.throws(()=>createPrivateCouncilPlan({...full,tasks:[...full.tasks,{id:"last",title:"Task",done:false}]},1,[],profile),/maximum/);
});
test("profiles reject getters and extra properties without reading them",()=>{
  const hostile={...profile};let reads=0;Object.defineProperty(hostile,"language",{enumerable:true,get(){reads++;return "english";}});assert.throws(()=>validatePrivateProfile(hostile));assert.equal(reads,0);
  assert.throws(()=>validatePrivateProfile({...profile,upload:true}));
});
test("general learning-room retrieval excludes expired accepted memories",()=>{
  assert.deepEqual(rankAcceptedMemories("JavaScript",[memory(1,{kind:"lesson",key:"lesson.javascript",statement:"JavaScript practice",expiresAt:"2020-01-01T00:00:00Z"})]),[]);
});

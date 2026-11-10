import { validateMissionSnapshot, revision } from "./cloud/contracts.mjs";
import { validateMemoryCandidate, rankAcceptedMemories } from "./learning-loop.mjs";
import { createPlannerProposal } from "./agent-planner.mjs";
import { validateAgentProposal } from "./agent-room.mjs";

export const AGENT_CATALOG = Object.freeze([
  ["coordinator","Coordinator","One selected mission and approved context for the whole team","local_checks"],
  ["planner","Planner","Suggest next steps and a checklist","local_rules"],
  ["tutor","Tutor","Suggest a practice and explanation checklist","local_rules"],
  ["builder","Builder","Suggest a smallest-prototype checklist","local_rules"],
  ["reviewer","Reviewer","Suggest evidence and revision checks","local_rules"],
  ["tester","Tester","Check checklist capacity and saved state","local_checks"],
  ["memory","Memory steward","Reuse only approved, scoped, unexpired memories","local_checks"],
  ["privacy","Privacy guard","Keep private-mode connections on this device","local_checks"],
  ["analyst","Data analyst","SQL execution and charts need a future adapter","not_connected"],
  ["researcher","Researcher","External research needs a future adapter and sharing choice","not_connected"],
  ["organizer","Organizer","Calendar and email automation need future connectors","not_connected"],
  ["workflow","Workflow builder","Executable workflow generation needs a future adapter","not_connected"],
  ["ambassador","Moltbook Ambassador","Open the separate public reader; bring back unverified references without sending mission context","opt_in_reader"],
].map(([id,label,purpose,runtimeStatus])=>Object.freeze({id,label,purpose,runtimeStatus})));

export function validatePrivateProfile(raw) {
  if (!raw || typeof raw!=="object" || Array.isArray(raw) || Object.getPrototypeOf(raw)!==Object.prototype || Reflect.ownKeys(raw).sort().join(",")!=="language,responseStyle") throw new Error("Invalid private agent preferences.");
  for(const key of ["language","responseStyle"]){const d=Object.getOwnPropertyDescriptor(raw,key);if(!d?.enumerable||!("value" in d))throw new Error("Invalid private agent preferences.");}
  if(!["hinglish","hindi","english"].includes(raw.language)||!["concise","detailed"].includes(raw.responseStyle))throw new Error("Invalid private agent preferences.");
  return {language:raw.language,responseStyle:raw.responseStyle};
}
export function buildPrivateAgentContext(rawMission,currentRevision,rawMemories,rawProfile,{at=new Date().toISOString()}={}) {
  const mission = validateMissionSnapshot(rawMission,{requireUuid:true});
  revision(currentRevision);
  const profile = validatePrivateProfile(rawProfile);
  if (!Array.isArray(rawMemories) || rawMemories.length>10000 || !Number.isFinite(Date.parse(at))) throw new Error("Invalid private context input.");
  const eligible = rawMemories.map(validateMemoryCandidate).filter(memory=>memory.status==="accepted" && !memory.sensitive && (!memory.expiresAt || Date.parse(memory.expiresAt)>Date.parse(at)) && (memory.scope==="global" || memory.missionId===mission.id));
  // Global preferences are explicitly user-approved. Other global memories
  // need a lexical match; mission memories remain within their source mission.
  const matchIds = new Set(mission.goal.trim() ? rankAcceptedMemories(mission.goal,eligible,20).map(item=>item.memory.id) : []);
  const memories = eligible.filter(memory=>memory.kind==="preference" || memory.scope==="mission" || matchIds.has(memory.id))
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id)).slice(0,5)
    .map(memory=>({id:memory.id,kind:memory.kind,statement:memory.statement,scope:memory.scope,evidence:[...memory.evidence]}));
  return {schema:"saathi.private-agent-context",version:1,mission:{id:mission.id,title:mission.title,goal:mission.goal,nextStep:mission.nextStep,revision:currentRevision},profile,memories,destination:"device",generatedAt:at};
}
export function createPrivateCouncilPlan(rawMission,currentRevision,memories,profile,options={}) {
  const at=options.at??new Date().toISOString(), newId=options.newId??(()=>globalThis.crypto.randomUUID());
  const mission=validateMissionSnapshot(rawMission,{requireUuid:true});
  const context=buildPrivateAgentContext(mission,currentRevision,memories,profile,{at});
  const planner=createPlannerProposal(mission,currentRevision,{newId,at});
  const evidence=[...planner.evidence,...context.memories.map(memory=>`memory:${memory.id}`)];
  const target=(context.mission.nextStep||context.mission.goal||context.mission.title).slice(0,180);
  const concise=context.profile.responseStyle==="concise";
  const titles=context.profile.language==="hindi" ? ["योजना","अभ्यास","प्रोटोटाइप","जाँच"] : context.profile.language==="hinglish" ? ["Agla kaam","Seekho aur practice karo","Chhota prototype banao","Result aur evidence check karo"] : ["Next actions","Learn and practice","Build a small prototype","Review the result"];
  const capacity=100-mission.tasks.length;
  const roleTasks={
    tutor:[`Try one small exercise for: ${target}`,`Explain what worked${concise?" in three short points":" and what remains unclear, with one example"}`],
    builder:[`Define the smallest usable prototype for: ${target}`,"Write acceptance criteria before implementing the prototype"],
    reviewer:["Check the result against the saved goal and record evidence","Review data sharing and avoid including private material in external output"],
  };
  const proposals=[validateAgentProposal({...planner,title:titles[0],evidence})];
  for (const [index,role] of ["tutor","builder","reviewer"].entries()) {
    const tasks=[...roleTasks[role]];
    if (context.memories.length && role==="builder") tasks.push(`Review approved lesson: ${context.memories[0].statement.slice(0,240)}`);
    proposals.push(validateAgentProposal({...planner,id:newId(),runId:planner.runId,role,title:titles[index+1],summary:"Local checklist using the shared mission and approved context. This role does not call an AI model or run code.",body:{tasks:tasks.slice(0,capacity).map(title=>({id:newId(),title}))},evidence}));
  }
  return {context,proposals,checks:{privateDestination:true,approvedMemoryCount:context.memories.length,selectedMissionOnly:true,freeTaskSlots:capacity}};
}

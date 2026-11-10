import {uuid,validateCloudRow,validateMissionSnapshot} from "./cloud/contracts.mjs";
import {validateLearningSignal} from "./learning-loop.mjs";
import {validateMemoryDecision,projectLearningLedger} from "./memory-review.mjs";
import {validateAgentProposal} from "./agent-room.mjs";
import {prepareProposalApplication} from "./agent-planner.mjs";
import {validatePrivateProfile,createPrivateCouncilPlan} from "./agent-council.mjs";
import {assertPrivacyEgress} from "./privacy-policy.mjs";
import {createPublicResearchArtifact,readPublicResearchArtifact} from "./public-research.mjs";
function exact(raw,keys) {
  if (!raw || typeof raw!=="object" || Array.isArray(raw) || Object.getPrototypeOf(raw)!==Object.prototype || Reflect.ownKeys(raw).length!==keys.length) throw new Error("Invalid private workspace data.");
  for(const key of keys) { const d=Object.getOwnPropertyDescriptor(raw,key); if (!d?.enumerable || !("value" in d)) throw new Error("Invalid private workspace field."); }
}
function list(raw,limit,map) {
  if(!Array.isArray(raw)||raw.length>limit)throw new Error("Private workspace list is too large.");
  const ids=new Set();return Array.from(raw,item=>{const checked=map(item),id=checked.id??checked.payload?.id;if(ids.has(id))throw new Error("Duplicate private workspace ID.");ids.add(id);return checked;});
}
function time(value) { if(typeof value!=="string"||value.length>50||!Number.isFinite(Date.parse(value)))throw new Error("Invalid private workspace time.");return value; }
export function validatePrivateWorkspace(raw) {
  exact(raw,["schema","version","ownerId","profile","records","signals","decisions","proposals"]);
  if(raw.schema!=="saathi.private-workspace"||raw.version!==1)throw new Error("Unsupported private workspace version.");
  const ownerId=uuid(raw.ownerId);
  const records=list(raw.records,100,item=>{exact(item,["id","ownerId","mission","revision","createdAt","updatedAt","deletedAt"]);return validateCloudRow({id:item.id,owner_id:item.ownerId,payload:item.mission,title:item.mission?.title,revision:item.revision,created_at:item.createdAt,updated_at:item.updatedAt,deleted_at:item.deletedAt},ownerId);});
  const missionIds=new Set(records.map(record=>record.id));
  const signals=list(raw.signals,500,item=>{exact(item,["payload","createdAt"]);const payload=validateLearningSignal(item.payload);if(!missionIds.has(payload.missionId))throw new Error("Private signal belongs to an unknown mission.");return {payload,createdAt:time(item.createdAt)};});
  const signalIds=new Set(signals.map(item=>item.payload.id));
  const decisions=list(raw.decisions,2000,item=>{exact(item,["payload","createdAt"]);const payload=validateMemoryDecision(item.payload);const source=signals.find(signal=>signal.payload.id===payload.signalId);if(!signalIds.has(payload.signalId)||source.payload.missionId!==payload.missionId)throw new Error("Private decision source mismatch.");return {payload,createdAt:time(item.createdAt)};});
  const proposals=list(raw.proposals,100,item=>{const proposal=validateAgentProposal(item);if(!missionIds.has(proposal.missionId))throw new Error("Private proposal belongs to an unknown mission.");return proposal;});
  const result={schema:"saathi.private-workspace",version:1,ownerId,profile:validatePrivateProfile(raw.profile),records,signals,decisions,proposals};
  if(new TextEncoder().encode(JSON.stringify(result)).length>2*1024*1024)throw new Error("Private workspace exceeds its 2 MB limit.");
  return result;
}
export function emptyPrivateWorkspace() {return validatePrivateWorkspace({schema:"saathi.private-workspace",version:1,ownerId:globalThis.crypto.randomUUID(),profile:{language:"hinglish",responseStyle:"concise"},records:[],signals:[],decisions:[],proposals:[]});}
export function createPrivateWorkspace(vault,initial) {
  assertPrivacyEgress({mode:"private",destination:"device"});
  let state=validatePrivateWorkspace(initial),busy=false,epoch=0;
  const listeners=new Set();
  function current(){if(!state||!vault.isUnlocked())throw new Error("Unlock the private workspace first.");return state;}
  async function transact(change) {
    if(busy)throw new Error("Wait for the current private save.");
    busy=true;const started=epoch;
    try {const candidate=validatePrivateWorkspace(await change(structuredClone(current())));if(started!==epoch)throw new Error("Workspace locked.");await vault.save(candidate);if(started!==epoch)throw new Error("Workspace locked.");state=candidate;for(const listener of listeners)listener();return structuredClone(candidate);}
    finally {busy=false;}
  }
  function find(draft,id,expected) {const record=draft.records.find(item=>item.id===id&&!item.deletedAt);if(!record||record.revision!==expected)throw new Error("The saved mission revision changed. Review it again.");return record;}
  function update(draft,mission,expected) {const record=find(draft,mission.id,expected);record.mission=validateMissionSnapshot(mission,{requireUuid:true});record.revision++;record.updatedAt=new Date().toISOString();return record;}
  return {
    getState(){return structuredClone(current());},
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    lock(){epoch++;vault.lock();state=null;listeners.clear();},
    async setProfile(profile){await transact(draft=>({...draft,profile:validatePrivateProfile(profile)}));},
    async create(mission){const checked=validateMissionSnapshot(mission,{requireUuid:true});const saved=await transact(draft=>{if(draft.records.some(record=>record.id===checked.id))throw new Error("Mission already exists.");const at=new Date().toISOString();draft.records.push({id:checked.id,ownerId:draft.ownerId,mission:checked,revision:1,createdAt:at,updatedAt:at,deletedAt:null});return draft;});return saved.records.find(record=>record.id===checked.id);},
    async save(mission,expected){const saved=await transact(draft=>{update(draft,mission,expected);return draft;});return saved.records.find(record=>record.id===mission.id);},
    async importResearch(capsule,missionId,expected){
      const artifact=createPublicResearchArtifact(capsule);
      const saved=await transact(draft=>{
        const record=find(draft,missionId,expected);
        const capsuleId=readPublicResearchArtifact(artifact).id;
        if(record.mission.artifacts.some(item=>readPublicResearchArtifact(item)?.id===capsuleId))throw new Error("This research file is already saved in the mission.");
        update(draft,{...record.mission,artifacts:[...record.mission.artifacts,artifact],updatedAt:new Date().toISOString()},expected);
        return draft;
      });
      return saved.records.find(record=>record.id===missionId);
    },
    async list(){const {signals,decisions}=current();return structuredClone({signals,decisions});},
    watch(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    async appendSignal(raw){const payload=validateLearningSignal(raw);await transact(draft=>{if(draft.signals.some(item=>item.payload.id===payload.id))throw new Error("This review already exists.");draft.signals.push({payload,createdAt:new Date().toISOString()});return draft;});},
    async appendDecision(raw){const payload=validateMemoryDecision(raw);await transact(async draft=>{if(draft.decisions.some(item=>item.payload.id===payload.id))throw new Error("Decision already exists.");const ledger=await projectLearningLedger(draft.signals,draft.decisions);const entry=ledger.entries.find(item=>item.signalId===payload.signalId&&item.candidate.id===payload.candidateId&&item.missionId===payload.missionId);if(!entry)throw new Error("Memory candidate source mismatch.");const allowed={accept:entry.view.canAccept,edit:entry.view.canEdit,reject:entry.view.canReject,forget:entry.view.canForget};if(!allowed[payload.action])throw new Error("Memory decision is no longer available.");draft.decisions.push({payload,createdAt:new Date().toISOString()});return draft;});},
    async plan(id,expected){let result;await transact(async draft=>{const record=find(draft,id,expected),ledger=await projectLearningLedger(draft.signals,draft.decisions);result=createPrivateCouncilPlan(record.mission,record.revision,ledger.entries.map(item=>item.candidate),draft.profile);draft.proposals=[...result.proposals,...draft.proposals].slice(0,100);return draft;});return result.context;},
    async apply(raw){const id=uuid(raw.id);let status;await transact(draft=>{const proposal=draft.proposals.find(item=>item.id===id);if(!proposal)throw new Error("Unknown saved proposal.");const record=draft.records.find(item=>item.id===proposal.missionId&&!item.deletedAt);if(!record)throw new Error("Mission is unavailable.");const prepared=prepareProposalApplication(proposal,record.mission,record.revision);status=prepared.proposal.status;if(status==="proposed"){update(draft,prepared.mission,record.revision);status="accepted";}draft.proposals=draft.proposals.map(item=>item.id===id?{...prepared.proposal,status}:item);return draft;});return status;},
    async reject(raw){await transact(draft=>{const proposal=draft.proposals.find(item=>item.id===raw.id);if(!proposal||proposal.status!=="proposed")throw new Error("Only a saved pending proposal can be rejected.");proposal.status="rejected";return draft;});},
  };
}

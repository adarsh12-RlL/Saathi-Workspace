import type {MissionSnapshot} from "./cloud/index.mjs";
import type {MemoryCandidate} from "./memory-review.mjs";
import type {AgentProposal} from "./agent-planner.mjs";
export type PrivateProfile={language:"hinglish"|"hindi"|"english";responseStyle:"concise"|"detailed"};
export const AGENT_CATALOG:ReadonlyArray<{id:string;label:string;purpose:string;runtimeStatus:"local_rules"|"local_checks"|"not_connected"|"opt_in_reader"}>;
export function validatePrivateProfile(raw:unknown):PrivateProfile;
export type PrivateAgentContext={schema:"saathi.private-agent-context";version:1;mission:{id:string;title:string;goal:string;nextStep:string;revision:number};profile:PrivateProfile;memories:Array<Pick<MemoryCandidate,"id"|"kind"|"statement"|"scope"|"evidence">>;destination:"device";generatedAt:string};
export function buildPrivateAgentContext(mission:MissionSnapshot,revision:number,memories:readonly MemoryCandidate[],profile:PrivateProfile,options?:{at?:string}):PrivateAgentContext;
export function createPrivateCouncilPlan(mission:MissionSnapshot,revision:number,memories:readonly MemoryCandidate[],profile:PrivateProfile,options?:{at?:string;newId?:()=>string}):{context:PrivateAgentContext;proposals:AgentProposal[];checks:{privateDestination:boolean;approvedMemoryCount:number;selectedMissionOnly:boolean;freeTaskSlots:number}};

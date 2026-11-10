export const MOLTBOOK_ORIGIN:"https://www.moltbook.com";
export const MOLTBOOK_PUBLIC_FEED:string;
export const MOLTBOOK_READ_CONSENT:"moltbook-public-v1";
export type CommunityPost={id:string;title:string;content:string;author:string;community:string;url:string};
export class CommunityBridgeError extends Error {code:string;constructor(code:string);}
export function normalizeMoltbookFeed(raw:unknown):CommunityPost[];
export function readMoltbookPublicFeed(options?:{fetcher?:typeof fetch;signal?:AbortSignal}):Promise<CommunityPost[]>;
export function createMoltbookReadHandler(options?:{fetcher?:typeof fetch;now?:()=>number;minimumIntervalMs?:number}):(request:Request)=>Promise<Response>;

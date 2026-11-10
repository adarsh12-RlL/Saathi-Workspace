import type {CommunityPost} from "./moltbook-bridge.mjs";
export type PublicResearchCapsule = {
  schema: "saathi.public-research";
  version: 1;
  id: string;
  source: "moltbook";
  trust: "unverified";
  exportedAt: string;
  items: CommunityPost[];
};
export type PublicResearchArtifact = {
  id: string;
  title: "Moltbook public research";
  kind: "Document";
  content: string;
};
export function validatePublicResearchCapsule(raw: unknown): PublicResearchCapsule;
export function createPublicResearchCapsule(posts: readonly CommunityPost[], options?: {newId?: () => string; at?: string}): PublicResearchCapsule;
export function createPublicResearchArtifact(raw: unknown, options?: {newId?: () => string}): PublicResearchArtifact;
export function readPublicResearchArtifact(raw: unknown): PublicResearchCapsule | null;

export type MissionStage = "captured" | "planned" | "working" | "complete";
export type LearningSignal = {
  schema: "saathi.learning-signal";
  version: 1;
  id: string;
  missionId: string;
  createdAt: string;
  outcome: "success" | "partial" | "blocked";
  rating: number;
  reflection: string;
  corrections: string[];
  preferences: string[];
  tags: string[];
  reusable: boolean;
  allowLearning: boolean;
  sensitiveSource: boolean;
};

export type LearningEvent = {
  id: string;
  ownerId: string;
  missionId: string;
  eventType: "learning_signal";
  payload: LearningSignal;
  createdAt: string;
};
export type LearningEventRepository = {
  ownerId: string;
  list(): Promise<ReadonlyArray<LearningEvent>>;
  append(signal: LearningSignal): Promise<LearningEvent>;
  watch(onInvalidate: () => void, onStatus?: (status: string) => void): () => void;
};
export type MissionReflection = {
  outcome: "achieved" | "partial" | "blocked";
  rating: 1 | 2 | 3 | 4 | 5;
  friction: Array<"scope" | "time" | "clarity" | "skill" | "tooling" | "none">;
  lesson: string;
  repeat: "yes" | "maybe" | "no";
  personalMemory: string | null;
  reviewedAt: string;
};

export type MissionSnapshot = {
  id: string;
  title: string;
  goal: string;
  notes: string;
  nextStep: string;
  stage: MissionStage;
  tasks: Array<{ id: string; title: string; done: boolean }>;
  decisions: Array<{ id: string; text: string; at: string }>;
  artifacts: Array<{ id: string; title: string; kind: string; content: string }>;
  miniApps: unknown[];
  updatedAt: string;
  templateSource: string | null;
  reflection: MissionReflection | null;
};

export type CloudRecord = {
  id: string;
  ownerId: string;
  mission: MissionSnapshot;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type AuthState = {
  status: "idle" | "checking" | "authenticated" | "signed-out" | "error" | "stopped";
  user: { id: string; email: string | null } | null;
  error: string | null;
};

export type SyncState = {
  status: "idle" | "loading" | "ready" | "saving" | "error" | "conflict" | "stopped";
  records: ReadonlyArray<CloudRecord>;
  error: string | null;
};

export type CloudWorkspaceState = {
  auth: AuthState;
  ownerId: string | null;
  sync: SyncState;
};

export type SaathiClient = { auth: unknown; from: unknown; channel: unknown; removeChannel: unknown };

export type CloudWorkspace = {
  getState(): CloudWorkspaceState;
  start(): Promise<unknown>;
  checkSession(): Promise<{ id: string; email: string | null } | null>;
  signIn(email: string, password: string): Promise<{ id: string; email: string | null }>;
  signUp(email: string, password: string, options?: { emailRedirectTo?: string }): Promise<{ requiresConfirmation: boolean; user: { id: string; email: string | null } | null }>;
  signOut(): Promise<void>;
  create(mission: MissionSnapshot): Promise<CloudRecord>;
  save(mission: MissionSnapshot, expectedRevision: number): Promise<CloudRecord>;
  remove(id: string, expectedRevision: number): Promise<CloudRecord>;
  refresh(): Promise<unknown>;
  stop(): void;
};

export function validateCloudConfiguration(url: unknown, key: unknown): string | null;
export function createSaathiClient(options: {
  url?: string;
  publishableKey?: string;
  storage?: Storage;
}): { client: SaathiClient | null; configurationError: string | null };
export function createCloudWorkspace(client: SaathiClient, options?: {
  onState?: (state: CloudWorkspaceState) => void;
}): CloudWorkspace;
export const LEARNING_EVENTS_TABLE: "saathi_learning_events";
export function createLearningEventRepository(client: SaathiClient, userId: string): LearningEventRepository;

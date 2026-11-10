export const PRIVATE_VAULT_KEY: string;
export type VaultEnvelope = {schema:"saathi.private-vault";version:1;kdf:"PBKDF2-SHA256";iterations:number;salt:string;iv:string;ciphertext:string};
export function sealPrivateVault(payload:unknown,passphrase:string):Promise<VaultEnvelope>;
export function openPrivateVault(envelope:unknown,passphrase:string):Promise<unknown>;
export type PrivateVaultStore = {hasVault():boolean;isUnlocked():boolean;lock():void;create(payload:unknown,passphrase:string):Promise<unknown>;unlock(passphrase:string):Promise<unknown>;save(payload:unknown):Promise<unknown>};
export function createPrivateVaultStore(storage:Pick<Storage,"getItem"|"setItem">,options?:{key?:string}):PrivateVaultStore;

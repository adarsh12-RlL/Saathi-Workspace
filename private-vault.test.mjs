import test from "node:test";
import assert from "node:assert/strict";
import {sealPrivateVault,openPrivateVault,createPrivateVaultStore,PRIVATE_VAULT_KEY} from "./private-vault.mjs";
const passphrase="long private test phrase";
function storage(){const items=new Map();return {getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value)};}
test("vault ciphertext excludes plaintext and uses fresh salt and IV",async()=>{
  const payload={secret:"private fixture",nested:[1,"x"]};
  const first=await sealPrivateVault(payload,passphrase),second=await sealPrivateVault(payload,passphrase);
  assert.deepEqual(await openPrivateVault(first,passphrase),payload);
  assert.notEqual(first.salt,second.salt);assert.notEqual(first.iv,second.iv);assert.notEqual(first.ciphertext,second.ciphertext);
  assert.ok(first.iterations>=210000);assert.ok(!JSON.stringify(first).includes(payload.secret));assert.ok(!JSON.stringify(first).includes(passphrase));
});
test("wrong passphrase, tampering, unsupported envelope and malformed base64 cannot unlock",async()=>{
  const first=await sealPrivateVault({value:"secret"},passphrase);
  for(const invalid of [{...first,iv:first.salt},{...first,iterations:1},{...first,extra:"x"},{...first,ciphertext:"????"},{...first,ciphertext:(first.ciphertext[0]==="A"?"B":"A")+first.ciphertext.slice(1)}])await assert.rejects(openPrivateVault(invalid,passphrase),/Cannot unlock/);
  await assert.rejects(openPrivateVault(first,"wrong private password"),/Cannot unlock/);
  await assert.rejects(sealPrivateVault({},"tiny"),/12/);
  await assert.rejects(sealPrivateVault({large:"x".repeat(2*1024*1024)},passphrase),/2 MB/);
});
test("vault reload, lock, fresh save IV, and existing-vault protection",async()=>{
  const disk=storage(),first=createPrivateVaultStore(disk);await first.create({counter:1},passphrase);
  const old=JSON.parse(disk.getItem(PRIVATE_VAULT_KEY));await first.save({counter:2});const saved=disk.getItem(PRIVATE_VAULT_KEY);
  assert.notEqual(old.iv,JSON.parse(saved).iv);assert.equal(old.salt,JSON.parse(saved).salt);
  first.lock();assert.equal(first.isUnlocked(),false);await assert.rejects(first.save({}),/Unlock/);
  const second=createPrivateVaultStore(disk);assert.deepEqual(await second.unlock(passphrase),{counter:2});
  await assert.rejects(second.create({},passphrase),/already exists/);
  assert.equal(disk.getItem(PRIVATE_VAULT_KEY),saved);
});
test("conflicting tab and quota failure preserve the last durable vault",async()=>{
  const disk=storage(),a=createPrivateVaultStore(disk),b=createPrivateVaultStore(disk);await a.create({counter:1},passphrase);await b.unlock(passphrase);await a.save({counter:2});const saved=disk.getItem(PRIVATE_VAULT_KEY);
  await assert.rejects(b.save({counter:3}),/Another tab/);assert.equal(b.isUnlocked(),false);assert.equal(disk.getItem(PRIVATE_VAULT_KEY),saved);
  disk.setItem=()=>{throw new Error("quota");};await assert.rejects(a.save({counter:4}),/quota/);assert.equal(disk.getItem(PRIVATE_VAULT_KEY),saved);
});
test("locking during encryption prevents a late save from persisting",async()=>{
  const disk=storage(),vault=createPrivateVaultStore(disk);await vault.create({counter:1},passphrase);const old=disk.getItem(PRIVATE_VAULT_KEY);
  const saving=vault.save({counter:2});vault.lock();await assert.rejects(saving,/locked/);assert.equal(disk.getItem(PRIVATE_VAULT_KEY),old);
});

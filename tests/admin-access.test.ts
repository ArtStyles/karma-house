import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeAccess, accountActions, decodeAdminPage } from '../src/admin/domain.ts';
import { decodePublicProfile } from '../src/profiles/domain.ts';
import {scopedAdminRequest} from '../src/admin/request.ts';
const id='42000000-0000-4000-8000-000000000001';
test('owner identity accepts only name, avatar and routing id',()=>{
  const profile=decodePublicProfile({id,displayName:'Creador',avatarUrlPath:null,identityOnly:true});
  assert.equal(profile.identityOnly,true);
  assert.deepEqual(profile.activeListings,[]);
  assert.throws(()=>decodePublicProfile({id,displayName:'Creador',avatarUrlPath:null,identityOnly:true,email:'private@example.invalid'}));
});
test('authority fails closed for malformed or elevated suspension response',()=>{
  assert.deepEqual(decodeAccess({role:'owner',suspended:false,reason:null}),{role:'owner',suspended:false,reason:null});
  assert.throws(()=>decodeAccess({role:'owner',suspended:true,reason:'No'}));
  assert.throws(()=>decodeAccess({role:'superadmin',suspended:false,reason:null}));
});
test('only the owner may manage others, and the owner is protected',()=>{
  assert.deepEqual(accountActions('admin','member',false),[]);
  assert.deepEqual(accountActions('owner','owner',false),[]);
  assert.deepEqual(accountActions('owner','member',false),['suspend','grant_admin']);
  assert.deepEqual(accountActions('owner','admin',true),['reactivate','revoke_admin']);
});
test('account pages reject accidentally included private data',()=>{
  const row={id,displayName:'Creador',role:'owner',suspended:false,reason:null};
  assert.equal(decodeAdminPage('accounts',{items:[row],hasMore:false}).items.length,1);
  assert.throws(()=>decodeAdminPage('accounts',{items:[{...row,email:'private@example.invalid'}],hasMore:false}));
});
test('an account switch discards a pending admin response',async()=>{
  let active=true;let resolve!:(value:string)=>void;
  const deferred=new Promise<string>(done=>{resolve=done;});
  const result=scopedAdminRequest(()=>deferred,()=>{if(!active)throw new Error('KH_ACCOUNT_CHANGED');});
  active=false;resolve('private administration data');
  await assert.rejects(result,/KH_ACCOUNT_CHANGED/);
});
test('revoked access discards an old transport error as well',async()=>{
  let active=true;let reject!:(error:Error)=>void;
  const deferred=new Promise<string>((_,fail)=>{reject=fail;});
  const result=scopedAdminRequest(()=>deferred,()=>{if(!active)throw new Error('KH_ACCOUNT_CHANGED');});
  active=false;reject(new Error('old session error'));
  await assert.rejects(result,/KH_ACCOUNT_CHANGED/);
});

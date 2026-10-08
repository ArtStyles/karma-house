import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retainProfileIdentity} from '../src/auth/profileRefreshRetention.ts';
test('a transient refresh keeps identity while dropping cached administrative authority',()=>{
 const retained=retainProfileIdentity({ownerId:'a',displayName:'Ana',avatarUrl:'photo',isAdmin:true,access:{role:'owner' as const,suspended:false,reason:null}},'a');
 assert.equal(retained?.displayName,'Ana');assert.equal(retained?.avatarUrl,'photo');assert.equal(retained?.isAdmin,false);assert.equal(retained?.access.role,'member');
});
test('cached identity never crosses accounts and confirmed suspension stays visible',()=>{
 const value={ownerId:'a',displayName:'Ana',isAdmin:false,access:{role:'member' as const,suspended:true,reason:'motivo'}};
 assert.equal(retainProfileIdentity(value,'b'),null);assert.equal(retainProfileIdentity(null,'a'),null);assert.equal(retainProfileIdentity(value,'a')?.access.suspended,true);assert.equal(retainProfileIdentity(value,'a')?.access.reason,'motivo');
});

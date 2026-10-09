import assert from 'node:assert/strict';
import test from 'node:test';
import { createRemoteMarketplaceController, type RemoteMarketplaceRepository } from '../src/state/remoteMarketplaceStore.ts';

const A='45000000-0000-4000-8001-000000000001', B='45000000-0000-4000-8001-000000000002';
function deferred<T=void>() { let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}; }
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(ids:string[]=[],overrides:Partial<RemoteMarketplaceRepository>={}) {
  const writes:{id:string;favorite:boolean}[]=[],gates:ReturnType<typeof deferred>[]=[];
  const store=createRemoteMarketplaceController({
    load:async()=>({ownListings:[],favoriteIds:ids}),
    resolvePropertyAlias:async id=>id,
    setFavorite:async(_owner,id,favorite)=>{writes.push({id,favorite});const gate=deferred();gates.push(gate);await gate.promise;},
    ...overrides,
  } as RemoteMarketplaceRepository);
  store.setSession('account-a',false);
  return {store,writes,gates};
}
test('a heart and shared favorite count change before alias lookup or saving completes',async()=>{
  const alias=deferred<string>(),f=fixture([],{resolvePropertyAlias:()=>alias.promise});await f.store.refresh();
  const save=f.store.toggleFavorite(A,true);
  assert.deepEqual(f.store.getState().favoriteIds,[A]);
  alias.resolve(A);await tick();assert.deepEqual(f.store.getState().favoriteIds,[A]);assert.equal(f.writes.length,1);
  f.gates[0].resolve();await save;
});
test('rapid remove and add retain the latest visible intent while acknowledgements arrive',async()=>{
  const f=fixture([A]);await f.store.refresh();
  const remove=f.store.toggleFavorite(A);assert.deepEqual(f.store.getState().favoriteIds,[]);
  const add=f.store.toggleFavorite(A);assert.deepEqual(f.store.getState().favoriteIds,[A]);
  await tick();f.gates[0].resolve();await remove;assert.deepEqual(f.store.getState().favoriteIds,[A]);
  await tick();assert.deepEqual(f.writes,[{id:A,favorite:false},{id:A,favorite:true}]);f.gates[1].resolve();await add;
});
test('a failed latest remove restores the confirmed favorite and reports failure',async()=>{
  const f=fixture([A]);await f.store.refresh();const remove=f.store.toggleFavorite(A,false);
  assert.deepEqual(f.store.getState().favoriteIds,[]);const rejected=assert.rejects(remove,/network/);
  await tick();f.gates[0].reject(Error('network unavailable'));await rejected;
  assert.deepEqual(f.store.getState().favoriteIds,[A]);
});
test('failure of an older add cannot remove a later intent or undo another property',async()=>{
  const f=fixture();await f.store.refresh();
  const first=f.store.toggleFavorite(A,true);const rejected=assert.rejects(first,/network/);
  const second=f.store.toggleFavorite(A,false),other=f.store.toggleFavorite(B,true);
  assert.deepEqual(f.store.getState().favoriteIds,[B]);await tick();f.gates[0].reject(Error('network unavailable'));await rejected;
  assert.equal(f.store.getState().storageError,null,'an obsolete request cannot show a global failure over a newer choice');
  assert.deepEqual(f.store.getState().favoriteIds,[B]);await tick();f.gates[1].resolve();await second;await tick();f.gates[2].resolve();await other;
  assert.deepEqual(f.store.getState().favoriteIds,[B]);
});
test('background heart reads share a request and cannot hold up a favorite write',async()=>{
  const read=deferred<string>();let reads=0;
  const f=fixture([],{resolvePropertyAlias:async id=>{if(++reads===1)return read.promise;return id}});await f.store.refresh();
  const opening=f.store.prepareFavoriteHeart(A),same=f.store.prepareFavoriteHeart(A);assert.equal(opening,same);
  const save=f.store.toggleFavorite(A,true);await tick();assert.equal(f.writes.length,1);f.gates[0].resolve();await save;
  assert.deepEqual(f.store.getState().favoriteIds,[A]);read.resolve(A);await opening;assert.deepEqual(f.store.getState().favoriteIds,[A]);
});
test('a concurrent server refresh retains pending favorites, then a failed save restores that snapshot',async()=>{
  const f=fixture();await f.store.refresh();const save=f.store.toggleFavorite(A,true),rejected=assert.rejects(save,/network/);
  await tick();await f.store.refresh();assert.deepEqual(f.store.getState().favoriteIds,[A]);
  f.gates[0].reject(Error('network unavailable'));await rejected;assert.deepEqual(f.store.getState().favoriteIds,[]);
});
test('canonical reconciliation applies a pending remove once to merged saved identities',async()=>{
  const alias=deferred<string>(),f=fixture([A,B],{resolvePropertyAlias:()=>alias.promise});await f.store.refresh();
  const remove=f.store.toggleFavorite(B,false);assert.deepEqual(f.store.getState().favoriteIds,[A]);
  alias.resolve(B);await tick();assert.deepEqual(f.store.getState().favoriteIds,[]);assert.deepEqual(f.writes,[{id:B,favorite:false}]);f.gates[0].resolve();await remove;
});
test('account changes clear pending hearts and late failures cannot affect the new account',async()=>{
  const f=fixture();await f.store.refresh();const save=f.store.toggleFavorite(A,true),rejected=assert.rejects(save,/sesión/);
  assert.deepEqual(f.store.getState().favoriteIds,[A]);await tick();f.store.setSession('account-b',false);
  assert.deepEqual(f.store.getState().favoriteIds,[]);f.gates[0].resolve();await rejected;assert.deepEqual(f.store.getState().favoriteIds,[]);
});
test('a tap during the initial account read survives hydration and preserves other saved favorites',async()=>{
  const initial=deferred<{ownListings:never[];favoriteIds:string[]}>(),f=fixture([],{load:()=>initial.promise});
  const loading=f.store.refresh(),save=f.store.toggleFavorite(A,true);
  assert.deepEqual(f.store.getState().favoriteIds,[A]);initial.resolve({ownListings:[],favoriteIds:[B]});await loading;await tick();
  assert.deepEqual(new Set(f.store.getState().favoriteIds),new Set([A,B]));f.gates[0].resolve();await save;
});

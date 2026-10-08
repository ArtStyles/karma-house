import test from 'node:test';
import assert from 'node:assert/strict';
import {createRemoteMarketplaceController,type RemoteMarketplaceRepository} from '../src/state/remoteMarketplaceStore.ts';
import * as favorites from '../src/catalog/favoritesController.ts';
import type {Listing} from '../src/domain/listings.ts';
const D='45000000-0000-4000-8001-000000000001',C='45000000-0000-4000-8001-000000000002';
const listing={id:C,status:'active',moderationStatus:'approved',title:'Canónica'} as Listing;
function account(ids:string[],resolve: (id:string)=>Promise<string>=async id=>id===D?C:id){const writes:{id:string;favorite:boolean}[]=[];const repository={load:async()=>({ownListings:[],favoriteIds:ids}),resolvePropertyAlias:resolve,setFavorite:async(_owner:string,id:string,favorite:boolean)=>{writes.push({id,favorite})}} as unknown as RemoteMarketplaceRepository;const store=createRemoteMarketplaceController(repository);store.setSession('account-a',false);return {store,writes}}
for(const ids of [[D],[D,C]])test(`canonical favorite consumer reconciles ${ids.length} saved ids, count, remove and undo`,async()=>{
 const {store,writes}=account(ids);await store.refresh();
 const reader=favorites.createAccountFavoriteReader({byIds:async requested=>{assert.deepEqual(requested,[C]);return [listing]}},store.normalizeFavoriteIds);
 const controller=favorites.createFavoriteListingsController(reader);controller.setSession('account-a');await controller.setIds(ids);
 const visible=favorites.visibleFavoriteListings(controller.getState().listings,store.getState().favoriteIds);assert.deepEqual(visible.map(x=>x.id),[C]);assert.equal(store.getState().favoriteIds.length,1);assert.equal(store.canonicalFavoriteId(D),C);
 const seen=favorites.canonicalFavoriteCards([{...listing,id:D},listing],store.canonicalFavoriteId);assert.equal(seen.length,1);
 await store.toggleFavorite(D);assert.deepEqual(store.getState().favoriteIds,[]);assert.deepEqual(favorites.visibleFavoriteListings(visible,store.getState().favoriteIds),[]);
 await store.toggleFavorite(D);assert.deepEqual(store.getState().favoriteIds,[C]);assert.deepEqual(writes,[{id:C,favorite:false},{id:C,favorite:true}]);
});
test('alias read errors preserve saved membership and visible cached favorite',async()=>{let fail=false;const {store}=account([D],async id=>{if(fail)throw Error('network unavailable');return id===D?C:id});await store.refresh();await store.normalizeFavoriteIds(()=>{});fail=true;await assert.rejects(store.normalizeFavoriteIds(()=>{}),/network/);assert.deepEqual(store.getState().favoriteIds,[C]);assert.equal(favorites.visibleFavoriteListings([listing],store.getState().favoriteIds).length,1)});
test('late canonical resolution cannot change a different account or perform a toggle',async()=>{let release!:()=>void;const wait=new Promise<void>(r=>{release=r});const {store,writes}=account([D],async()=>{await wait;return C});await store.refresh();const pending=store.toggleFavorite(D);await new Promise(r=>setTimeout(r,0));store.setSession('account-b',false);release();await assert.rejects(pending,/sesión/);assert.deepEqual(store.getState().favoriteIds,[]);assert.equal(store.canonicalFavoriteId(D),D);assert.equal(writes.length,0)});

test('late favorite list reconciliation cannot publish into a different account',async()=>{let release!:()=>void;const wait=new Promise<void>(r=>{release=r});const {store}=account([D],async()=>{await wait;return C});await store.refresh();const controller=favorites.createFavoriteListingsController(favorites.createAccountFavoriteReader({byIds:async()=>[listing]},store.normalizeFavoriteIds));controller.setSession('account-a');const pending=controller.setIds([D]);await new Promise(r=>setTimeout(r,0));store.setSession('account-b',false);controller.setSession('account-b');release();await pending;assert.deepEqual(store.getState().favoriteIds,[]);assert.deepEqual(controller.getState().listings,[])});

test('leaving favorites cancels pending reconciliation without a global error; reopening resolves again',async()=>{let release!:()=>void,waitOnce=true;const wait=new Promise<void>(r=>{release=r});const {store}=account([D],async()=>{if(waitOnce){waitOnce=false;await wait}return C});await store.refresh();const controller=favorites.createFavoriteListingsController(favorites.createAccountFavoriteReader({byIds:async()=>[listing]},store.normalizeFavoriteIds));controller.setSession('account-a');const pending=controller.setIds([D]);await new Promise(r=>setTimeout(r,0));controller.cancelRead();release();await pending;assert.deepEqual(store.getState().favoriteIds,[D]);assert.equal(store.getState().storageError,null);await controller.setIds(store.getState().favoriteIds);assert.deepEqual(store.getState().favoriteIds,[C]);assert.equal(controller.getState().listings.length,1)});

test('direct canonical card/detail exposes unknown until resolved, then removes and undoes the displayed favorite',async()=>{
 let release!:()=>void;const wait=new Promise<void>(r=>{release=r});const {store,writes}=account([D],async id=>{await wait;return id===D?C:id});await store.refresh();
 assert.equal(store.favoriteMembership(C),null);
 const opening=store.prepareFavoriteHeart(C);await new Promise(r=>setTimeout(r,0));assert.equal(store.favoriteMembership(C),null);assert.deepEqual(writes,[]);
 release();await opening;assert.equal(store.favoriteMembership(C),true);assert.deepEqual(store.getState().favoriteIds,[C]);
 await store.toggleFavorite(C,false);assert.equal(store.favoriteMembership(C),false);await store.toggleFavorite(C,true);assert.equal(store.favoriteMembership(C),true);
 assert.deepEqual(writes,[{id:C,favorite:false},{id:C,favorite:true}]);
});
test('direct heart resolution failure stays unknown and retry recovers without losing saved ids',async()=>{
 let fail=true;const {store,writes}=account([D],async id=>{if(fail)throw Error('network unavailable');return id===D?C:id});await store.refresh();
 await assert.rejects(store.prepareFavoriteHeart(C),/network/);assert.equal(store.favoriteMembership(C),null);assert.deepEqual(store.getState().favoriteIds,[D]);assert.deepEqual(writes,[]);
 fail=false;await store.prepareFavoriteHeart(C);assert.equal(store.favoriteMembership(C),true);
});
test('direct heart resolution cannot expose the previous account membership after an account change',async()=>{
 let release!:()=>void;const wait=new Promise<void>(r=>{release=r});const {store,writes}=account([D],async()=>{await wait;return C});await store.refresh();const opening=store.prepareFavoriteHeart(C);await new Promise(r=>setTimeout(r,0));store.setSession('account-b',false);release();await assert.rejects(opening,/sesión/);assert.equal(store.favoriteMembership(C),null);assert.deepEqual(store.getState().favoriteIds,[]);assert.deepEqual(writes,[]);
});
test('a merge after rendering cannot reverse the displayed add intent into a removal',async()=>{
 let merged=false;const {store,writes}=account([D],async id=>merged&&id===D?C:id);await store.refresh();await store.prepareFavoriteHeart(C);assert.equal(store.favoriteMembership(C),false);merged=true;
 await store.toggleFavorite(C,true);assert.deepEqual(writes,[{id:C,favorite:true}]);assert.deepEqual(store.getState().favoriteIds,[C]);
});

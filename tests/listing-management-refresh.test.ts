import test from 'node:test';import assert from 'node:assert/strict';import {createRemoteMarketplaceController} from '../src/state/remoteMarketplaceStore.ts';import {createListingManagementEvents} from '../src/state/listingManagementEvents.ts';
test('management invalidation defeats a previous owner load without dropping favorites',async()=>{
 let release!:(v:unknown)=>void;let calls=0;const old=new Promise(r=>release=r);
 const repository={load:async()=>++calls===1?{ownListings:[],favoriteIds:['same-id']}:calls===2?await old:{ownListings:[],favoriteIds:['same-id']}};
 const c=createRemoteMarketplaceController(repository as never);c.setSession('owner',false);await c.refresh();const pending=c.refresh();await c.invalidateListingManagement(['same-id']);release({ownListings:[{id:'same-id',ownerId:'old-owner'}],favoriteIds:[]});await pending;
 assert.deepEqual(c.getState().ownListings,[]);assert.deepEqual(c.getState().favoriteIds,['same-id']);
});
test('management event invalidates late readers and retains no contact or private snapshot',()=>{
 const events=createListingManagementEvents(),checkpoint=events.checkpoint();events.invalidate(['same-id','same-id']);assert.throws(checkpoint,/MANAGEMENT_CHANGED/);assert.equal(events.getSnapshot(),1);
});

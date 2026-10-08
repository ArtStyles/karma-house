// @ts-nocheck -- Minimal repository double isolates post-review hydration.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createRemoteMarketplaceController} from '../src/state/remoteMarketplaceStore.ts';
test('paged moderation preserves the mutation/version guard without hydrating the full legacy queue',async()=>{
 const reviews=[],controller=createRemoteMarketplaceController({load:async()=>({ownListings:[],favoriteIds:[]}),review:async(...args)=>reviews.push(args),loadModerationQueue:async()=>{throw Error('full queue must not be fetched');}});
 controller.setSession('reviewer',true);await controller.reviewListing('listing','approved','',7,false);
 assert.deepEqual(reviews[0].slice(0,4),['listing','approved','',7]);assert.deepEqual(controller.getState().moderationQueue,[]);
});

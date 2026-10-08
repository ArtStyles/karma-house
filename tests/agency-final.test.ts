import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeAgencyDeal} from '../src/agencies/deals/domain.ts';
const id=(n:number)=>`45000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('case projection retains buyer and canonical home identities',()=>{
 const input={id:id(1),agencyId:id(2),propertyId:id(3),canonicalPropertyId:id(8),propertyTitle:'Casa azul',buyerName:'Ana Pérez',cycleId:id(4),buyerId:id(5),contactKind:'account',privateContact:null,assigneeId:null,stage:'inquiry',version:1,closedReason:null};
 assert.deepEqual(decodeAgencyDeal(input,id(2)),input);
});

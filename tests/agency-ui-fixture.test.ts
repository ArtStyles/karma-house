import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertFixtureTarget,assertFixtureReceipt,fixturePage} from '../scripts/agency-ui-fixture.mjs';

const source='postgresql://agency_test@127.0.0.1:55487/kh_agency_test_suites_20261007';
test('UI fixture requires the explicit approved local source before connecting',()=>{
 assert.equal(assertFixtureTarget(source).href,source);
 for(const value of [undefined,'postgresql://agency_test@production/kh_agency_test_suites_20261007',source+'?sslmode=disable',source.replace('55487','5432')])assert.throws(()=>assertFixtureTarget(value));
});
test('synthetic REST pagination terminates instead of repeating the first page',()=>{
 assert.deepEqual(fixturePage(new URLSearchParams('offset=3&limit=200')),{offset:3,limit:200});
 assert.deepEqual(fixturePage(new URLSearchParams()),{offset:0,limit:100});
 for(const input of ['offset=-1','limit=999999','offset=NaN'])assert.throws(()=>fixturePage(new URLSearchParams(input)));
});
test('cleanup receipt cannot target source or an unrecorded database',()=>{
 const r={kind:'agency-ui-synthetic-v1',source,database:'kh_agency_test_legacy_'+'a'.repeat(32),runId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',origin:'http://127.0.0.1:56434',pid:123,controlToken:'c'.repeat(64)};
 assert.doesNotThrow(()=>assertFixtureReceipt(r));
 for(const patch of [{database:'kh_agency_test_suites_20261007'},{source:source.replace('127.0.0.1','remote')},{origin:'https://example.com'},{pid:0},{controlToken:''}])assert.throws(()=>assertFixtureReceipt({...r,...patch}));
});

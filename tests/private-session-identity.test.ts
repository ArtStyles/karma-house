import test from 'node:test';import assert from 'node:assert/strict';
import {privateSessionKey} from '../src/assisted/sessionIdentity.ts';
const actor='43000000-0000-4000-8000-000000000001',session='43000000-0000-4000-8000-000000000010';
const jwt=(sub:string,session_id:string,exp:number)=>`header.${Buffer.from(JSON.stringify({sub,session_id,exp})).toString('base64url')}.signature`;
test('token refresh keeps unsaved form identity but a new login or actor discards it',()=>{
 const first=privateSessionKey(actor,jwt(actor,session,1));
 assert.equal(privateSessionKey(actor,jwt(actor,session,2)),first);
 assert.notEqual(privateSessionKey(actor,jwt(actor,actor,2)),first);
 assert.notEqual(privateSessionKey(session,jwt(session,session,2)),first);
 assert.notEqual(privateSessionKey(undefined,undefined),first);
});
test('malformed or mismatched token cannot lend another authenticated session its form key',()=>{
 assert.notEqual(privateSessionKey(actor,'broken-first'),privateSessionKey(actor,'broken-second'));
 assert.notEqual(privateSessionKey(actor,jwt(session,session,2)),privateSessionKey(actor,jwt(actor,session,2)));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadDraftPhotos, type PhotoUploadPort } from '../src/data/photoUpload.ts';
const port: PhotoUploadPort = { upload: async()=>{throw Error('unexpected upload');}, exists:async()=>true, readLocal:async()=>{throw Error('unexpected read');}, getUploadId:async()=> 'new' };
test('inherited photo reuse requires current property context and an exact server-returned path',async()=>{
 const path='original/request/one.jpg';
 assert.deepEqual(await uploadDraftPhotos([{uri:'https://signed.invalid',storagePath:path}], 'recipient','request',port,()=>{}, {propertyId:'property',reusablePaths:[path]}),[path]);
 await assert.rejects(uploadDraftPhotos([{uri:'https://signed.invalid',storagePath:'original/request/two.jpg'}], 'recipient','request',port,()=>{}, {propertyId:'property',reusablePaths:[path]}),/otra/);
 await assert.rejects(uploadDraftPhotos([{uri:'https://signed.invalid',storagePath:path}], 'recipient','request',port,()=>{}),/otra/);
});

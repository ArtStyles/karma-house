import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {spawnSync} from 'node:child_process';

test('APK verifier uses the explicit private reference and retains its old default without leaking values',()=>{
 const root=mkdtempSync(join(tmpdir(),'kh-apk-reference-'));
 try{
  for(const path of ['scripts','infra','sdk/build-tools/test','jdk/bin'])mkdirSync(join(root,path),{recursive:true});
  writeFileSync(join(root,'scripts/verify.ps1'),readFileSync('scripts/verify-android-preview.ps1'));
  writeFileSync(join(root,'app.json'),JSON.stringify({expo:{version:'1.2.3',android:{package:'test.fixture',versionCode:1}}}));
  writeFileSync(join(root,'.env.local'),'EXPO_PUBLIC_SUPABASE_URL=https://example.invalid\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=public-fixture\n');
  for(const path of ['test.apk','sdk/build-tools/test/aapt.exe','sdk/build-tools/test/apksigner.bat','jdk/bin/java.exe'])writeFileSync(join(root,path),'fixture');
  // Deliberately stop before invoking native tooling. The missing variable proves which file was read.
  writeFileSync(join(root,'infra/.env.local'),'SUPABASE_SECRET_KEY=private-default-fixture\n');
  writeFileSync(join(root,'outside.env'),'SUPABASE_DB_PASSWORD=private-explicit-fixture\n');
  const run=(extra:string[])=>spawnSync('pwsh',['-NoProfile','-File',join(root,'scripts/verify.ps1'),'-ApkPath',join(root,'test.apk'),'-SdkPath',join(root,'sdk'),'-JdkPath',join(root,'jdk'),'-BuildToolsVersion','test',...extra],{encoding:'utf8'});
  const standard=run([]),explicit=run(['-PrivateConfigurationPath',join(root,'outside.env')]);
  assert.notEqual(standard.status,0);assert.match(standard.stderr,/Falta el valor privado.*SUPABASE_DB_PASSWORD/s);
  assert.notEqual(explicit.status,0);assert.match(explicit.stderr,/Falta el valor privado.*SUPABASE_SECRET_KEY/s);
  assert.doesNotMatch(standard.stderr+explicit.stderr,/private-default-fixture|private-explicit-fixture/);
 }finally{const inside=relative(tmpdir(),root);assert.ok(inside&&!inside.startsWith('..')&&!isAbsolute(inside));rmSync(root,{recursive:true,force:true});}
});

test('distribution forwards an explicit private reference and leaves verifier default available',()=>{
 const root=mkdtempSync(join(tmpdir(),'kh-distribution-reference-'));
 try{
  for(const path of ['scripts','docs'])mkdirSync(join(root,path));
  writeFileSync(join(root,'scripts/prepare.ps1'),readFileSync('scripts/prepare-android-distribution.ps1'));
  writeFileSync(join(root,'scripts/verify-android-preview.ps1'),`param($ApkPath,$SdkPath,$JdkPath,$BuildToolsVersion,$ExpectedVersion,$ExpectedVersionCode,$ExpectedPackage,$ExpectedCertificateSha256,[string]$PrivateConfigurationPath='')\nif($PrivateConfigurationPath){'EXPLICIT:'+ $PrivateConfigurationPath}else{'DEFAULT'}\n`);
  writeFileSync(join(root,'docs/android-installation.txt'),'fixture');writeFileSync(join(root,'test.apk'),'fixture-apk');
  for(const [version,extra,expected]of [['1.2.3',[],/DEFAULT/],['1.2.4',['-PrivateConfigurationPath',join(root,'outside.env')],/EXPLICIT:.*outside.env/]] as const){
   writeFileSync(join(root,'app.json'),JSON.stringify({expo:{version,android:{package:'test.fixture',versionCode:1}}}));
   const run=spawnSync('pwsh',['-NoProfile','-File',join(root,'scripts/prepare.ps1'),'-ApkPath',join(root,'test.apk'),'-SdkPath',root,'-JdkPath',root,...extra],{encoding:'utf8'});
   assert.equal(run.status,0,run.stderr);assert.match(run.stdout,expected);
  }
 }finally{const inside=relative(tmpdir(),root);assert.ok(inside&&!inside.startsWith('..')&&!isAbsolute(inside));rmSync(root,{recursive:true,force:true});}
});

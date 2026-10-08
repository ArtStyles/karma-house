// @ts-nocheck -- Actual TSX permission rendering/action guards, with injected hooks.
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';import assert from 'node:assert/strict';
import ts from 'typescript';
import vm from 'node:vm';
import React from 'react';
test('private collaborator edit and save are gated immediately after owner revocation',async()=>{
let auth={user:{id:'A'},session:{access_token:'tokenA'},isOwner:true};
const states=[],refs=[];let stateIndex=0,refIndex=0,saveCalls=0;
const styles=new Proxy({},{get:()=>({})});
const repository={saveCollaborator:async input=>{saveCalls++;return {...input,id:'collaborator',version:2};}};
const context={React,console,useState(initial){const i=stateIndex++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value}];},useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial});},useEffect(){},useAssistedListings:()=>({auth,repository,run:async work=>work({checkpoint(){}})}),useListingTransfers:()=>({state:{error:'',busy:false}}),usePublicProfile:()=>({}),useAdminQuery:()=>({items:[],loading:false,error:null,refreshing:false,reload:async()=>{}}),createThemedStyles:()=>()=>({colors:{primary:'#00f'},styles}),fixtureCollaborators:[],fixtureAssistedRows:[],assistedError:e=>String(e),router:{push(){}},randomUUID:()=> 'mutation',StyleSheet:{create:x=>x},options:x=>Object.entries(x).map(([value,label])=>({value,label}))};
for(const name of ['SafeAreaView','ScrollView','RefreshControl','PageTitle','EmptyState','View','Pill','AdminToolbar','Notice','Pressable','Text','AdminStatus','AdminPagination','Modal','Button','TextInput','TransferOfferSheet'])context[name]=name;
const source=(await readFile('src/screens/AssistedListingsScreen.tsx','utf8')).replace(/^import .*;\r?\n/gm,'').replace('export default function','function');
vm.createContext(context);vm.runInContext(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}}).outputText+'\nglobalThis.renderTestScreen=AssistedBody;',context);
function render(){stateIndex=0;refIndex=0;return context.renderTestScreen();}
function collect(node,predicate,found=[]){if(!node||typeof node!=='object')return found;if(Array.isArray(node)){for(const child of node)collect(child,predicate,found);return found;}if(predicate(node))found.push(node);collect(node.props?.children,predicate,found);return found;}
render();states[0]={canPrepare:true};states[5]={id:'collaborator',kind:'owner',privateName:'PRIVATE_ASSISTED_A',privateContact:'private-contact-A',contactChannel:'known-channel',accountId:null,linkEvidenceReference:'evidence',expectedVersion:1};
const before=render();auth={...auth,isOwner:false};const after=render();
const modal=collect(after,n=>n.type==='Modal')[0],save=collect(after,n=>n.type==='Button'&&n.props.label==='Guardar colaborador')[0];
await save?.props.onPress();await Promise.resolve();await Promise.resolve();
assert.ok(JSON.stringify(before).includes('PRIVATE_ASSISTED_A'));assert.equal(modal?.props.visible,false);assert.ok(!JSON.stringify(after).includes('PRIVATE_ASSISTED_A'));assert.equal(saveCalls,0);
});

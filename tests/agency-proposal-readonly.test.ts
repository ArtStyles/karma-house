import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
async function panel(canSend:boolean){
 const source=await readFile(new URL('../src/components/agencies/AgencyProposalPanel.tsx',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 let state=0;const exports:any={};
 const mocks:any={
  'react':{useState:(initial:any)=>[state++===0?[{id:'offer',kind:'offer',status:'accepted',createdBy:'staff',amountUsd:98000,version:1}]:initial,()=>{}],useRef:(current:any)=>({current}),useCallback:(fn:any)=>fn},
  'expo-router':{useFocusEffect(){}},'react-native':{Text:'Text',TextInput:'TextInput',View:'View'},
  '../../agencies/scheduling/repository':{},'../../agencies/scheduling/domain':{},
  '../../negotiations/domain':{havanaDateTime:()=>({date:'2026-10-08',time:'10:00'})},
  '../../messaging/domain':{},'../../lib/supabase':{supabase:null},
  '../ui':{Button:'Button',Notice:'Notice',Pill:'Pill'},
  './AgencyRegistrationFields':{useAgencyFormStyles:()=>({styles:{},colors:{}})},
  '../negotiations/VisitDateTimeFields':{VisitDateTimeFields:'VisitDateTimeFields'},
 };
 runInNewContext(code,{exports,require:(id:string)=>id==='react/jsx-runtime'?require(id):mocks[id]??(()=>{throw Error(id)})()});
 return exports.AgencyProposalPanel({conversation:{dealId:'deal',buyerId:null,assigneeId:'staff',canSend},actorId:'staff',staff:true,external:true,capture(){throw Error('No write expected')},onChanged:async()=>{}});
}
function buttons(node:any):any[]{return !node?[]:Array.isArray(node)?node.flatMap(buttons):typeof node==='object'?[...(node.type==='Button'?[node.props]:[]),...buttons(node.props?.children)]:[];}
test('closed external agreements retain history but cannot withdraw an offer',async()=>{
 const closed=buttons(await panel(false));
 assert.equal(closed.find(b=>b.label==='Retirar oferta')?.disabled,true);
 assert.equal(closed.find(b=>b.label==='Ver historial de la propuesta')?.disabled,false);
 assert.equal(buttons(await panel(true)).find(b=>b.label==='Retirar oferta')?.disabled,false);
});

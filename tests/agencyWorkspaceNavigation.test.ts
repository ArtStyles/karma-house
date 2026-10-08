// @ts-nocheck -- Actual screen hooks with a delayed refresh and navigation cleanup.
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';import assert from 'node:assert/strict';
import ts from 'typescript';import vm from 'node:vm';import React from 'react';
test('routed agency navigation hides the previous workspace and discards a refresh after blur',async()=>{
 let resolveRefresh;const pending=new Promise(resolve=>{resolveRefresh=resolve});let focusEffect,selectionCalls=0;
 const states=[],refs=[];let stateIndex=0,refIndex=0;
 const styles=new Proxy({},{get:()=>({})}),w={ready:true,enabled:true,agencies:[],activeAgencyId:'old-agency',activeAgency:{id:'old-agency',tradeName:'PREVIOUS_AGENCY'},membership:{role:'admin'},refreshAgencies:()=>pending,setActiveAgencyForRead:async()=>{selectionCalls++}};
 const context={React,useState(initial){const i=stateIndex++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value}];},useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial});},useCallback:x=>x,useFocusEffect:fn=>{focusEffect=fn},useLocalSearchParams:()=>({agencyId:'principal'}),useAuth:()=>({user:{id:'owner'},session:{access_token:'token'}}),useAgencyWorkspace:()=>w,useConsultationRefresh:()=>({refreshing:false,refresh:async()=>{}}),createThemedStyles:()=>()=>({colors:{},styles}),agencyError:String,agencyStateLabel:{approved:'Aprobada'},canPerformAgencyAction:()=>true,router:{push(){}},StyleSheet:{create:x=>x}};
 for(const name of ['SafeAreaView','ScrollView','RefreshControl','PageTitle','AccountPrompt','ActivityIndicator','Notice','EmptyState','Button','Pressable','View','Text','Icon','AgencyVerifiedBadge'])context[name]=name;
 const source=(await readFile('src/screens/AgencyWorkspaceScreen.tsx','utf8')).replace(/^import .*;\r?\n/gm,'').replace('export const agencyRoleLabel','const agencyRoleLabel').replace('export default function','function');
 vm.createContext(context);vm.runInContext(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}}).outputText+'\nglobalThis.renderTestScreen=AgencyWorkspaceScreen;',context);
 const tree=context.renderTestScreen();assert.ok(!JSON.stringify(tree).includes('PREVIOUS_AGENCY'),'old workspace links must be hidden before the routed selection finishes');
 const blur=focusEffect();blur();resolveRefresh();await pending;await Promise.resolve();await Promise.resolve();
 assert.equal(selectionCalls,0,'a blurred screen must not change global agency selection');
});

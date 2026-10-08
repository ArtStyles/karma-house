import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

for(const screen of ['AgencyReviewsScreen','AgencyPropertyRequestsScreen','AgencyDuplicateReviewScreen'])test(`${screen} has no raw text children outside native Text components`,async()=>{
 const source=await readFile(new URL(`../src/screens/${screen}.tsx`,import.meta.url),'utf8');
 const tree=ts.createSourceFile(`${screen}.tsx`,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const invalid:string[]=[];
 function visit(node:ts.Node){
  if((ts.isJsxElement(node)&&['View','ScrollView','SafeAreaView'].includes(node.openingElement.tagName.getText(tree)))||ts.isJsxFragment(node)){
   for(const child of node.children){
    // JSX preserves single-line whitespace as a string child; native View rejects it.
    if(ts.isJsxText(child)&&child.text!==''&&(!/^\s*$/.test(child.text)||!/[\r\n]/.test(child.text)))invalid.push(`line ${tree.getLineAndCharacterOfPosition(child.pos).line+1}: ${JSON.stringify(child.text)}`);
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(tree);assert.deepEqual(invalid,[],'Raw JSX text causes React Native View render errors');
});

// Empty strings from a conditional are native text children too.
test('agency notices never leak empty string conditions into native containers', async()=>{
 const {readdir}=await import('node:fs/promises');
 const screens=(await readdir(new URL('../src/screens/',import.meta.url))).filter(n=>/^Agency.*\.tsx$/.test(n));
 const files=[...screens.map(n=>`screens/${n}`),'screens/DetailScreen.tsx','components/agencies/AgencyRegistrationFields.tsx'];
 const invalid:string[]=[];
 for(const file of files){
  const source=await readFile(new URL(`../src/${file}`,import.meta.url),'utf8');
  const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(node:ts.Node){
   if(ts.isJsxExpression(node)&&node.expression&&ts.isBinaryExpression(node.expression)&&node.expression.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken){
    let value:ts.Expression=node.expression;
    while(ts.isBinaryExpression(value)&&value.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken)value=value.left;
    if(['issue','feedback','error','heart.error','management.error','listingError','contactError'].includes(value.getText(tree)))invalid.push(`${file}:${tree.getLineAndCharacterOfPosition(node.pos).line+1}`);
   }
   ts.forEachChild(node,visit);
  }
  visit(tree);
 }
 assert.deepEqual(invalid,[],'String conditions must become booleans before rendering native elements');
});

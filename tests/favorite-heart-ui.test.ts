import assert from 'node:assert/strict';
import test from 'node:test';
import {control, elements, executeComponent, Hooks} from './helpers/tsxHooks.ts';
function deferred(){let resolve!:()=>void,reject!:(error:unknown)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function heartFixture(){
  const hooks=new Hooks(),reads=deferred(),writes:ReturnType<typeof deferred>[]=[];
  let favorite=false,member:boolean|null=null,user='account-a';
  const toggleFavorite=()=>{favorite=!favorite;const gate=deferred();writes.push(gate);return gate.promise};
  const auth=()=>({ready:true,user:{id:user},session:{access_token:user}});
  const useMarketplace=()=>({mode:'cloud',ready:true,favoriteIds:favorite?['property']:[],canonicalFavoriteId:(id:string)=>id,favoriteMembership:()=>member,prepareFavoriteHeart:()=>reads.promise,toggleFavorite});
  // useFocusEffect takes a single callback; model its effect/cleanup using stable callback identity.
  const focus=(work:any)=>hooks.useEffect(work,[work]);
  const actual=executeComponent('src/state/useFavoriteHeart.ts','useFavoriteHeart',hooks,{useMarketplace,useAuth:auth,useFocusEffect:focus});
  return {render:()=>hooks.render(()=>actual('property')),reads,writes,resolveMember:()=>{member=true;favorite=true},changeAccount:()=>{user='account-b';member=null;favorite=false},dispose:()=>hooks.dispose()};
}
test('a heart exposes a visible cached boolean during background reconciliation',async()=>{
  const f=heartFixture();assert.equal(f.render().favorite,false);f.resolveMember();f.reads.resolve();await Promise.resolve();assert.equal(f.render().favorite,true);
});
test('heart toggles immediately and accepts a second tap before the first request finishes',async()=>{
  const f=heartFixture();const first=f.render().toggle();assert.equal(f.render().favorite,true);
  const second=f.render().toggle();assert.equal(f.render().favorite,false);assert.equal(f.writes.length,2);
  f.writes[0].resolve();await first;assert.equal(f.render().favorite,false);f.writes[1].resolve();await second;
});
test('an obsolete failure has no alert; the latest failure gives retry feedback',async()=>{
  const f=heartFixture();const first=f.render().toggle(),second=f.render().toggle();f.writes[0].reject(Error('network'));await first;
  assert.equal(f.render().error,'');f.writes[1].reject(Error('network'));await second;assert.match(f.render().error,/No pudimos guardar/);
});
test('late favorite feedback cannot cross accounts or survive an unmount',async()=>{
  const f=heartFixture();const save=f.render().toggle();f.changeAccount();assert.equal(f.render().favorite,false);f.writes[0].reject(Error('network'));await save;assert.equal(f.render().error,'');
  const next=f.render().toggle();f.dispose();f.writes[1].reject(Error('network'));await next;
});
test('PropertyCard always renders a heart and accepts taps while a favorite write is pending',async()=>{
  const hooks=new Hooks(),gate=deferred();let favorite=false,calls=0;
  const component=executeComponent('src/components/PropertyCard.tsx','PropertyCard',hooks,{
    useStyles:()=>({colors:{},styles:{}}),useMarketplace:()=>({mode:'cloud'}),useAuth:()=>({user:{id:'account-a'},ready:true}),
    useFavoriteHeart:()=>({favorite,error:'',checking:true,toggle:()=>{favorite=!favorite;calls++;return gate.promise}}),
    listingFacts:()=>'',operationBadge:()=>'',isNewListing:()=>false,priceLabel:()=>'',priceSuffix:()=>'',formatMoney:()=>'',
    View:'View',Text:'Text',MotionPressable:'MotionPressable',PropertyImage:'PropertyImage',Icon:'Icon',IconButton:'IconButton',router:{push:()=>{}},
  });
  const listing={id:'property',title:'Casa',owner:'remote',location:'Vedado',province:'La Habana',price:1};
  const render=()=>hooks.render(()=>component({listing}));
  let tree=render();assert.equal(elements(tree).find(x=>x.type==='IconButton')?.props.name,'heart-outline');
  const first=control(tree,'Guardar en favoritos: Casa').onPress();tree=render();assert.equal(elements(tree).find(x=>x.type==='IconButton')?.props.name,'heart');
  const second=control(tree,'Quitar de favoritos: Casa').onPress();assert.equal(calls,2);gate.resolve();await Promise.all([first,second]);
});

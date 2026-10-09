import assert from 'node:assert/strict';
import test from 'node:test';
import {executeComponent,Hooks,elements} from './helpers/tsxHooks.ts';
function animatedFixture(path:string,name:string,bindings:Record<string,unknown>={}){
  const hooks=new Hooks(),commands:{kind:string;value:number}[]=[];let reduced=false;
  const component=executeComponent(path,name,hooks,{
    Animated:{View:'AnimatedView',Image:'AnimatedImage'},View:'View',Text:'Text',Icon:'Icon',useStyles:()=>({colors:{},styles:{}}),useTheme:()=>({colors:{navigationActive:'blue'}}),
    useReducedMotion:()=>reduced,useSharedValue:(initial:number)=>hooks.useRef({value:initial}).current,
    useAnimatedStyle:(work:()=>any)=>({evaluate:work}),cancelAnimation:()=>commands.push({kind:'cancel',value:0}),
    withSpring:(value:number)=>{commands.push({kind:'spring',value});return value},withTiming:(value:number)=>{commands.push({kind:'timing',value});return value},
    ReduceMotion:{System:'system'},...bindings,
  });
  return {commands,render:(props:any)=>hooks.render(()=>component(props)),reduce:(value=true)=>{reduced=value}};
}
test('selection indicator follows the latest tab without intercepting touches and settles on resize',()=>{
  const f=animatedFixture('src/components/SelectionIndicator.tsx','SelectionIndicator');
  let tree=f.render({index:0,count:4,width:400});assert.equal(tree.props.pointerEvents,'none');
  tree=f.render({index:3,count:4,width:400});assert.equal(f.commands.at(-1)?.kind,'spring');assert.equal(tree.props.style.at(-1).evaluate().transform[0].translateX,299);
  tree=f.render({index:1,count:4,width:400});assert.equal(tree.props.style.at(-1).evaluate().transform[0].translateX,105);
  tree=f.render({index:1,count:4,width:300});assert.equal(tree.props.style.at(-1).evaluate().transform[0].translateX,80);
});
test('turning on reduced motion cancels a running selection spring and places it at the active tab',()=>{
  const f=animatedFixture('src/components/SelectionIndicator.tsx','SelectionIndicator');f.render({index:0,count:4,width:400});f.render({index:2,count:4,width:400});f.reduce();
  const tree=f.render({index:2,count:4,width:400});assert.equal(f.commands.at(-1)?.kind,'cancel');assert.equal(tree.props.style.at(-1).evaluate().transform[0].translateX,202);
});
test('a photograph keeps its frame, reveals only after load, and has a clear failure fallback',()=>{
  const f=animatedFixture('src/components/LoadedPropertyPhoto.tsx','LoadedPropertyPhoto');const props={source:{uri:'https://photo.test/one'},label:'Casa'};
  let tree=f.render(props),photo=elements(tree).find(x=>x.type==='AnimatedImage')!;assert.equal(photo.props.style.at(-1).evaluate().opacity,0);
  photo.props.onLoad();tree=f.render(props);photo=elements(tree).find(x=>x.type==='AnimatedImage')!;assert.equal(photo.props.style.at(-1).evaluate().opacity,1);assert.equal(f.commands.at(-1)?.kind,'timing');
  photo.props.onError();tree=f.render(props);assert.equal(elements(tree).some(x=>x.type==='AnimatedImage'),false);assert.equal(tree.props.accessibilityLabel,'No se pudo cargar la fotografía');
});
test('photos remain immediately visible when reduced motion is enabled during loading',()=>{
  const f=animatedFixture('src/components/LoadedPropertyPhoto.tsx','LoadedPropertyPhoto');const props={source:{uri:'https://photo.test/one'},label:'Casa'};f.render(props);f.reduce();
  const tree=f.render(props),photo=elements(tree).find(x=>x.type==='AnimatedImage')!;assert.equal(photo.props.style.at(-1).evaluate().opacity,1);assert.equal(f.commands.at(-1)?.kind,'cancel');
});
test('a photo still fades if the reduced-motion preference resolves before it finishes loading',()=>{
  const f=animatedFixture('src/components/LoadedPropertyPhoto.tsx','LoadedPropertyPhoto'),props={source:{uri:'https://photo.test/one'},label:'Casa'};
  f.reduce();f.render(props);f.reduce(false);let tree=f.render(props),photo=elements(tree).find(x=>x.type==='AnimatedImage')!;
  assert.equal(photo.props.style.at(-1).evaluate().opacity,0);photo.props.onLoad();tree=f.render(props);assert.equal(elements(tree).find(x=>x.type==='AnimatedImage')!.props.style.at(-1).evaluate().opacity,1);
});
test('data saver does not mount a photo until reveal; changing its source resets the photo component',()=>{
  const hooks=new Hooks(),revealed=new Set<string>();let saver=true;
  const component=executeComponent('src/components/PropertyImage.tsx','PropertyImage',hooks,{
    useStyles:()=>({colors:{},styles:{}}),useDataSaverState:()=>({enabled:saver,ready:true}),
    useSyncExternalStore:(_subscribe:any,read:()=>any)=>read(),revealed,subscribe:()=>()=>{},reveal:(key:string)=>revealed.add(key),
    View:'View',Text:'Text',Icon:'Icon',Pressable:'Pressable',LoadedPropertyPhoto:'LoadedPhoto',Platform:{OS:'android'},
  });
  const listing={id:'property',owner:'remote',title:'Casa',photoUri:'https://photo.test/one'};
  const render=(value=listing)=>hooks.render(()=>component({listing:value}));let tree=render();assert.equal(elements(tree).some(x=>x.type==='LoadedPhoto'),false);
  let stopped=false;elements(tree).find(x=>x.type==='Pressable')!.props.onPress({stopPropagation:()=>{stopped=true}});tree=render();assert.equal(stopped,true);
  const first=elements(tree).find(x=>x.type==='LoadedPhoto')!;assert.equal(first.props.source.uri,listing.photoUri);
  tree=render({...listing,photoUri:'https://photo.test/two'});assert.equal(elements(tree).some(x=>x.type==='LoadedPhoto'),false);
  saver=false;tree=render({...listing,photoUri:'https://photo.test/two'});const second=elements(tree).find(x=>x.type==='LoadedPhoto')!;assert.notEqual(first.props.key,second.props.key);
});
test('Android materials require a supported OS and a separate blur target',()=>{
  const hooks=new Hooks(),platform={OS:'android',Version:30};const component=executeComponent('src/components/NavigationMaterial.tsx','NavigationMaterial',hooks,{
    useTheme:()=>({colors:{navigation:'solid',navigationGlass:'glass'},scheme:'dark'}),Platform:platform,AccessibilityInfo:{isHighTextContrastEnabled:async()=>false,addEventListener:()=>({remove:()=>{}})},StyleSheet:{absoluteFill:{}},View:'View',BlurView:'BlurView',
  });
  const render=(props:any={})=>hooks.render(()=>component(props));const target={current:{}};
  assert.equal(render({blurTarget:target}).type,'View');platform.Version=31;assert.equal(render().type,'View');
  const tree=render({blurTarget:target});assert.equal(tree.type,'BlurView');assert.equal(tree.props.blurTarget,target);assert.equal(tree.props.blurMethod,'dimezisBlurViewSdk31Plus');assert.equal(tree.props.pointerEvents,'none');
});
test('discovery indicator tracks the finger while scrolling never applies a search and rotation keeps its page',()=>{
  const hooks=new Hooks(),scrolls:any[]=[];let reaction:{read:()=>number;run:(next:number,previous:number|null)=>void};const progress={value:0};let operations=0;
  const cards=[{action:'Comprar'},{action:'Alquilar'},{action:'Permutar'},{action:'Publicar anuncio'}];
  const component=executeComponent('src/components/ExploreDiscovery.tsx','ExploreDiscovery',hooks,{
    useStyles:()=>({colors:{},styles:{}}),useWindowDimensions:()=>({width:390}),useReducedMotion:()=>false,
    useSharedValue:()=>progress,useAnimatedScrollHandler:(work:any)=>work,useAnimatedReaction:(read:any,run:any)=>{reaction={read,run}},useAnimatedStyle:(work:any)=>({evaluate:work}),scheduleOnRN:(work:any,...args:any[])=>work(...args),
    cards,Platform:{OS:'android'},Animated:{ScrollView:'ScrollView',View:'AnimatedView'},View:'View',Text:'Text',Icon:'Icon',MotionPressable:'MotionPressable',
  });
  const render=()=>hooks.render(()=>component({offline:false,onOperation:()=>operations++,onPublish:()=>operations++}));let tree=render(),scroll=elements(tree).find(x=>x.type==='ScrollView')!;
  scroll.props.ref.current={scrollTo:(value:any)=>scrolls.push(value)};scroll.props.onScroll({contentOffset:{x:504}});reaction!.run(reaction!.read(),0);
  assert.equal(operations,0);assert.equal(elements(tree).find(x=>x.type==='AnimatedView')!.props.style.at(-1).evaluate().transform[0].translateX,15);
  tree=render();assert.ok(elements(tree).some(x=>x.props.accessibilityLabel==='Tarjeta 3 de 4: Permutar'));
  tree.props.onLayout({nativeEvent:{layout:{width:600}}});render();assert.equal(scrolls.at(-1).x,1172);assert.equal(scrolls.at(-1).animated,false);assert.equal(operations,0);
});

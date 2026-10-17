import assert from 'node:assert/strict';
import test from 'node:test';
import {control,executeComponent,Hooks,elements} from './helpers/tsxHooks.ts';
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
test('the arch carousel moves by neighbour, dot or swipe, and only the centre opens a home',()=>{
  const hooks=new Hooks(),opened:string[]=[];let responder:any;
  const listings=['A','B','C'].map(id=>({id,title:id,price:1,location:'Vedado',province:'La Habana'}));
  const component=executeComponent('src/components/ExploreDiscovery.tsx','ExploreDiscovery',hooks,{
    useStyles:()=>({colors:{},styles:{}}),useReducedMotion:()=>false,ease:{},
    PanResponder:{create:(config:any)=>{responder=config;return{panHandlers:{}}}},Animated:{View:'AnimatedView'},FadeIn:{duration:()=>({easing:()=>({})})},
    ArchImage:'ArchImage',Cartel:'Cartel',MotionPressable:'MotionPressable',PropertyImage:'PropertyImage',View:'View',Text:'Text',
    formatMoney:()=>'$ 1',cartelLabel:()=>'Se vende',listingFacts:()=>'',priceSuffix:()=>'',
  });
  const render=()=>hooks.render(()=>component({listings,onOpen:(listing:any)=>opened.push(listing.id)}));
  const centre=(tree:any)=>elements(tree).find(x=>x.type==='MotionPressable'&&/^Ver [ABC],/.test(x.props.accessibilityLabel))!.props;
  let tree=render();assert.match(centre(tree).accessibilityLabel,/^Ver A,/);
  control(tree,'Siguiente: B').onPress();tree=render();assert.match(centre(tree).accessibilityLabel,/^Ver B,/);
  control(tree,'Ver A').onPress();tree=render();assert.match(centre(tree).accessibilityLabel,/^Ver A,/);
  responder.onPanResponderRelease({}, {dx:-60});tree=render();assert.match(centre(tree).accessibilityLabel,/^Ver B,/);
  responder.onPanResponderRelease({}, {dx:20});tree=render();assert.match(centre(tree).accessibilityLabel,/^Ver B,/);
  assert.deepEqual(opened,[]);centre(tree).onPress();assert.deepEqual(opened,['B']);
});
test('a carousel with a single home shows no neighbours or dots',()=>{
  const hooks=new Hooks();
  const component=executeComponent('src/components/ExploreDiscovery.tsx','ExploreDiscovery',hooks,{
    useStyles:()=>({colors:{},styles:{}}),useReducedMotion:()=>true,ease:{},
    PanResponder:{create:()=>({panHandlers:{}})},Animated:{View:'AnimatedView'},FadeIn:{duration:()=>({easing:()=>({})})},
    ArchImage:'ArchImage',Cartel:'Cartel',MotionPressable:'MotionPressable',PropertyImage:'PropertyImage',View:'View',Text:'Text',
    formatMoney:()=>'$ 1',cartelLabel:()=>'Se vende',listingFacts:()=>'',priceSuffix:()=>'',
  });
  const tree=hooks.render(()=>component({listings:[{id:'A',title:'A',price:1,location:'Vedado',province:'La Habana'}],onOpen:()=>{}}));
  assert.equal(elements(tree).filter(x=>x.type==='MotionPressable').length,1);
});

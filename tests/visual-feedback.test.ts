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
test('the tab bar material is the nearly opaque navigation glass',()=>{
  const hooks=new Hooks();const component=executeComponent('src/components/NavigationMaterial.tsx','NavigationMaterial',hooks,{
    useTheme:()=>({colors:{navigation:'solid',navigationGlass:'glass'},scheme:'dark'}),StyleSheet:{absoluteFill:{}},View:'View',
  });
  const tree=hooks.render(()=>component());
  assert.equal(tree.type,'View');assert.equal(tree.props.style[1].backgroundColor,'glass');assert.equal(tree.props.pointerEvents,'none');
});
function carouselFixture(reduced:boolean){
  const hooks=new Hooks();let responder:any;
  const offset=executeComponent('src/components/ExploreDiscovery.tsx','offset',new Hooks(),{});
  const component=executeComponent('src/components/ExploreDiscovery.tsx','ExploreDiscovery',hooks,{
    useStyles:()=>({colors:{},styles:{}}),useReducedMotion:()=>reduced,ease:{},SIDE:.79,offset,Slide:'Slide',
    PanResponder:{create:(config:any)=>{responder=config;return{panHandlers:{}}}},
    useSharedValue:(initial:number)=>hooks.useRef({value:initial}).current,cancelAnimation:()=>{},ReduceMotion:{Never:'never'},
    withTiming:(value:number,_config:unknown,done?:(finished:boolean)=>void)=>{done?.(true);return value},scheduleOnRN:(work:(value:unknown)=>void,value:unknown)=>work(value),
    MotionPressable:'MotionPressable',View:'View',
  });
  return {component,hooks,responder:()=>responder};
}
test('the arch carousel moves by neighbour, dot or swipe, and only the centre opens a home',()=>{
  const f=carouselFixture(false),opened:string[]=[];
  const listings=['A','B','C'].map(id=>({id,title:id,price:1,location:'Vedado',province:'La Habana'}));
  const render=()=>f.hooks.render(()=>f.component({listings,onOpen:(listing:any)=>opened.push(listing.id)}));
  const slides=(tree:any)=>elements(tree).filter(x=>x.type==='Slide').map(x=>x.props);
  const centre=(tree:any)=>slides(tree).find(x=>x.place===0)!;
  let tree=render();assert.equal(centre(tree).listing.id,'A');
  assert.deepEqual(slides(tree).map(x=>[x.listing.id,x.place]),[['A',0],['B',1],['C',-1]]);
  slides(tree).find(x=>x.place===1)!.onPress();tree=render();assert.equal(centre(tree).listing.id,'B');
  control(tree,'Ver A').onPress();tree=render();assert.equal(centre(tree).listing.id,'A');
  const pan=f.responder();
  pan.onPanResponderGrant();pan.onPanResponderRelease({}, {dx:-60,vx:0});tree=render();assert.equal(centre(tree).listing.id,'B');
  pan.onPanResponderGrant();pan.onPanResponderRelease({}, {dx:20,vx:0});tree=render();assert.equal(centre(tree).listing.id,'B');
  pan.onPanResponderGrant();pan.onPanResponderRelease({}, {dx:15,vx:.8});tree=render();assert.equal(centre(tree).listing.id,'A');
  assert.deepEqual(opened,[]);centre(tree).onPress();assert.deepEqual(opened,['A']);
});
test('a carousel with a single home shows no neighbours or dots',()=>{
  const f=carouselFixture(true);
  const tree=f.hooks.render(()=>f.component({listings:[{id:'A',title:'A',price:1,location:'Vedado',province:'La Habana'}],onOpen:()=>{}}));
  assert.deepEqual(elements(tree).filter(x=>x.type==='Slide').map(x=>x.props.place),[0]);
  assert.equal(elements(tree).filter(x=>x.type==='MotionPressable').length,0);
});
test('carousel slides sit on a ring, so the strip never jumps when it wraps',()=>{
  const offset=executeComponent('src/components/ExploreDiscovery.tsx','offset',new Hooks(),{});
  assert.equal(offset(0,0,5),0);assert.equal(offset(1,0,5),1);assert.equal(offset(4,0,5),-1);
  assert.equal(offset(0,4,5),1);assert.equal(offset(2,0.5,5),1.5);assert.equal(offset(0,7,5),-2);
});

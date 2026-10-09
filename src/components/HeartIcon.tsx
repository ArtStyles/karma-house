import {useEffect,useRef,type ReactNode} from 'react';
import Animated,{cancelAnimation,useAnimatedStyle,useSharedValue,withSequence,withSpring,withTiming} from 'react-native-reanimated';
import {useReducedMotion} from '../settings/useReducedMotion';

export function HeartIcon({active,children}:{active:boolean;children:ReactNode}){
  const reduced=useReducedMotion(),previous=useRef(active),scale=useSharedValue(1);
  useEffect(()=>{
    if(reduced||!active){cancelAnimation(scale);scale.value=1}
    else if(!previous.current)scale.value=withSequence(withTiming(1.1,{duration:70}),withSpring(1,{duration:180,dampingRatio:1,overshootClamping:true}));
    previous.current=active;
  },[active,reduced,scale]);
  const reaction=useAnimatedStyle(()=>({transform:[{scale:scale.value}]}));
  return <Animated.View pointerEvents="none" style={reaction}>{children}</Animated.View>;
}

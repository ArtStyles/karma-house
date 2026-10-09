import {useEffect,useRef} from 'react';
import Animated,{cancelAnimation,ReduceMotion,useAnimatedStyle,useSharedValue,withSpring} from 'react-native-reanimated';
import {useReducedMotion} from '../settings/useReducedMotion';
import {useTheme} from '../theme';

/** A single selection surface follows the navigator; it never owns input. */
export function SelectionIndicator({index,count,width}:{index:number;count:number;width:number}){
  const {colors}=useTheme(),reduced=useReducedMotion();
  const step=Math.max(0,width-12)/Math.max(1,count),target=8+Math.max(0,Math.min(count-1,index))*step;
  const x=useSharedValue(target),previousWidth=useRef(width);
  useEffect(()=>{
    if(reduced||previousWidth.current!==width){cancelAnimation(x);x.value=target}
    else x.value=withSpring(target,{duration:240,dampingRatio:1,overshootClamping:true,reduceMotion:ReduceMotion.System});
    previousWidth.current=width;
  },[target,width,reduced,x]);
  const position=useAnimatedStyle(()=>({transform:[{translateX:x.value}]}));
  return <Animated.View pointerEvents="none" style={[{position:'absolute',left:0,top:6,bottom:6,width:Math.max(0,step-4),borderRadius:27,backgroundColor:colors.navigationActive},position]}/>;
}

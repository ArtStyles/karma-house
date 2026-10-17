import {useEffect,useRef,useState,type ComponentProps} from 'react';
import {StyleSheet,Text,View} from 'react-native';
import Animated,{cancelAnimation,useAnimatedStyle,useSharedValue,withTiming} from 'react-native-reanimated';
import {useReducedMotion} from '../settings/useReducedMotion';
import {createThemedStyles} from '../theme';
import {Icon} from './ui';

/** Mounted only for a revealed photo; keying by source isolates late load/error callbacks. */
export function LoadedPropertyPhoto({source,label,fit='cover'}:{source:ComponentProps<typeof Animated.Image>['source'];label:string;fit?:'cover'|'contain'}){
  const {colors,styles}=useStyles(),reduced=useReducedMotion(),[failed,setFailed]=useState(false);
  const opacity=useSharedValue(reduced?1:0);
  const loaded=useRef(false);
  useEffect(()=>{cancelAnimation(opacity);opacity.value=reduced||loaded.current?1:0;return()=>cancelAnimation(opacity)},[opacity,reduced]);
  const appearance=useAnimatedStyle(()=>({opacity:opacity.value}));
  if(failed)return <View style={styles.placeholder} accessibilityLabel="No se pudo cargar la fotografía"><Icon name="image-outline" size={32} color={colors.muted}/><Text style={styles.placeholderText}>Foto no disponible</Text></View>;
  return <Animated.Image source={source} accessibilityLabel={label} style={[styles.image,appearance]} resizeMode={fit} fadeDuration={0}
    onLoad={()=>{loaded.current=true;opacity.value=reduced?1:withTiming(1,{duration:180})}} onError={()=>setFailed(true)}/>;
}
const useStyles=createThemedStyles(colors=>StyleSheet.create({
  image:{position:'absolute',top:0,left:0,width:'100%',height:'100%'},
  placeholder:{alignItems:'center',gap:7,padding:4},placeholderText:{fontSize:11,textAlign:'center',color:colors.muted},
}));

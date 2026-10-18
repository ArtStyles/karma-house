import {createContext,useContext,useState,type RefObject} from 'react';
import {StyleSheet,View} from 'react-native';
import {NavigationMaterial} from './NavigationMaterial';
import {SelectionIndicator} from './SelectionIndicator';

export const TabMaterialContext=createContext<{index:number;count:number;target?:RefObject<View|null>}>({index:0,count:4});
export function TabBarMaterial(){
  const {index,count}=useContext(TabMaterialContext),[width,setWidth]=useState(0);
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={event=>setWidth(event.nativeEvent.layout.width)}>
    <NavigationMaterial/>
    {width>0&&<SelectionIndicator index={index} count={count} width={width}/>}
  </View>;
}

import { useEffect, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createThemedStyles } from '../../theme';
import { IconButton } from '../ui';

export function NegotiationSheet({ visible, title = 'Visitas y ofertas', busy = false, onClose, children, refreshControl }: { visible:boolean; title?:string; busy?:boolean; onClose():void; children:ReactNode;refreshControl?:ScrollViewProps['refreshControl'] }) {
  const { styles } = useStyles();
  const insets=useSafeAreaInsets();
  useEffect(()=>{
    if(!visible||Platform.OS!=='web')return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy){event.preventDefault();onClose()}};
    document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);
  },[visible,busy,onClose]);
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={()=>{if(!busy)onClose()}}>
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <View style={[styles.overlay,{paddingTop:Math.max(insets.top,16),paddingBottom:Math.max(insets.bottom,16)}]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar panel de solicitudes" disabled={busy} onPress={onClose} style={StyleSheet.absoluteFill}/>
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>{title}</Text><View pointerEvents={busy?'none':'auto'}><IconButton name="close" label="Cerrar visitas y ofertas" onPress={onClose} style={styles.close}/></View></View>
          <ScrollView alwaysBounceVertical refreshControl={refreshControl} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({flex:{flex:1},overlay:{flex:1,backgroundColor:colors.overlay,paddingHorizontal:14,justifyContent:'center'},sheet:{width:'100%',maxWidth:580,maxHeight:'100%',alignSelf:'center',backgroundColor:colors.paper,borderRadius:27,overflow:'hidden',flexShrink:1},header:{flexDirection:'row',alignItems:'center',gap:10,padding:18,paddingBottom:13,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},title:{flex:1,color:colors.ink,fontSize:21,lineHeight:27,fontWeight:'600',letterSpacing:-.4},close:{backgroundColor:colors.softBlue},content:{padding:18,gap:15,paddingBottom:25}}));

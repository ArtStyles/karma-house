import { useEffect, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createThemedStyles, internalLayout } from '../../theme';
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
          <ScrollView alwaysBounceVertical refreshControl={refreshControl} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} contentContainerStyle={styles.content}>{children}</ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({flex:{flex:1},overlay:{flex:1,backgroundColor:colors.overlay,paddingHorizontal:internalLayout.gutter,justifyContent:'center'},sheet:{width:'100%',maxWidth:580,maxHeight:'100%',alignSelf:'center',backgroundColor:colors.surface,borderRadius:internalLayout.radius,overflow:'hidden',flexShrink:1},header:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:20,paddingVertical:16,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},title:{flex:1,minWidth:0,color:colors.ink,fontSize:24,lineHeight:30,fontWeight:'600',letterSpacing:-.4},close:{backgroundColor:'transparent'},content:{padding:20,gap:20,paddingBottom:28}}));

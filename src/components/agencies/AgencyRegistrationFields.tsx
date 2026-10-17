import {StyleSheet,Switch,Text,TextInput,View,type TextInputProps} from 'react-native';
import type {AgencyApplicationInput} from '../../agencies/types';
import type {AgencyFieldErrors} from '../../agencies/registration';
import {PROVINCES} from '../../domain/listingOptions';
import {Pill} from '../ui';
import {createThemedStyles,internalLayout,rounded,typography} from '../../theme';
export function AgencyTextField({label,error,hint,...props}:TextInputProps&{label:string;error?:string;hint?:string}){
 const {colors,styles:s}=useAgencyFormStyles();
 return <View style={s.field}>
  <Text style={s.label}>{label}</Text>
  <TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.muted} style={[s.input,props.multiline&&s.multiline,props.style,error&&{borderColor:colors.danger}]} />
  {Boolean(error)&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  {Boolean(hint)&&<Text style={s.hint}>{hint}</Text>}
 </View>;
}
export function AgencyRegistrationFields({value,onChange,disabled,errors={},commercialOnly=false}:{value:AgencyApplicationInput;onChange:(value:AgencyApplicationInput)=>void;disabled:boolean;errors?:AgencyFieldErrors;commercialOnly?:boolean}){
 const {colors,styles:s}=useAgencyFormStyles();const set=<K extends keyof AgencyApplicationInput>(key:K,next:AgencyApplicationInput[K])=>onChange({...value,[key]:next});
 return <View style={s.form}>
  <View style={s.card}>
   <Text accessibilityRole="header" style={s.title}>Identidad de la inmobiliaria</Text>
   <AgencyTextField label="Nombre comercial" value={value.tradeName} onChangeText={v=>set('tradeName',v)} editable={!disabled} maxLength={120} error={errors.tradeName}/>
   {!commercialOnly&&<AgencyTextField label="Nombre completo del responsable" hint="Dato privado para revisar la solicitud." value={value.responsibleFullName} onChangeText={v=>set('responsibleFullName',v)} editable={!disabled} maxLength={160} error={errors.responsibleFullName}/>}
   <AgencyTextField label="Teléfono comercial" hint="Será público cuando se apruebe la inmobiliaria." value={value.businessPhone} onChangeText={v=>set('businessPhone',v)} editable={!disabled} keyboardType="phone-pad" maxLength={30} error={errors.businessPhone}/>
  </View>
  <View style={s.card}>
   <Text accessibilityRole="header" style={s.title}>Zona de servicio</Text>
   <View style={s.field}><Text style={s.label}>Provincia de referencia</Text><View style={s.wrap}>{PROVINCES.map(province=><Pill key={province} label={province} active={value.province===province} onPress={()=>{if(!disabled)set('province',province);}}/>)}</View></View>
   <AgencyTextField label="Municipio de referencia" value={value.municipality} onChangeText={v=>set('municipality',v)} editable={!disabled} maxLength={80} error={errors.municipality}/>
   <AgencyTextField label="Zonas de servicio" hint="Separa las zonas con comas." value={value.serviceAreas.join(',')} onChangeText={v=>set('serviceAreas',v?v.split(','):[])} editable={!disabled} maxLength={1620} error={errors.serviceAreas}/>
  </View>
  <View style={s.card}>
   <Text accessibilityRole="header" style={s.title}>Servicios y oficina</Text>
   <AgencyTextField label="Descripción de servicios" hint="Será pública tras la aprobación." value={value.description} onChangeText={v=>set('description',v)} editable={!disabled} multiline maxLength={1000} error={errors.description}/>
   <AgencyTextField label="Dirección de oficina · opcional" value={value.officeAddress??''} onChangeText={v=>set('officeAddress',v||null)} editable={!disabled} maxLength={200} error={errors.officeAddress}/>
   <View style={s.switchRow}><View style={s.flex}><Text style={s.label}>Publicar dirección de oficina</Text><Text style={s.hint}>Activa esta opción para mostrarla en el perfil público.</Text></View><Switch accessibilityLabel="Publicar dirección de oficina" hitSlop={10} value={value.publishOfficeAddress} onValueChange={v=>set('publishOfficeAddress',v)} disabled={disabled} trackColor={{false:colors.switchTrack,true:colors.primary}} thumbColor={colors.switchThumb} ios_backgroundColor={colors.switchTrack}/></View>
  </View>
  {!commercialOnly&&<View style={s.card}>
   <Text accessibilityRole="header" style={s.title}>Referencias privadas</Text>
   <AgencyTextField label="Referencias para la revisión · opcionales" hint="Una por línea, hasta cinco referencias." value={value.evidenceReferences.join('\n')} onChangeText={v=>set('evidenceReferences',v?v.split('\n'):[])} editable={!disabled} multiline maxLength={2504} error={errors.evidenceReferences}/>
   <Text style={s.copy}>El responsable y las referencias solo se usan para revisar la solicitud. La revisión no acredita la titularidad de viviendas. Puedes añadir el logo después de confirmar tu correo.</Text>
  </View>}
 </View>;
}
export const useAgencyFormStyles=createThemedStyles(colors=>StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.paper},
 content:{width:'100%',maxWidth:internalLayout.maxWidth,alignSelf:'center',paddingHorizontal:16,paddingBottom:40,gap:16},
 form:{gap:18},field:{gap:8},label:{fontSize:13,lineHeight:18,fontWeight:'600',color:colors.body,paddingHorizontal:4},
 input:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:rounded.pill,minHeight:52,color:colors.ink,fontSize:16,paddingHorizontal:18,paddingVertical:12},
 multiline:{minHeight:112,textAlignVertical:'top',borderRadius:rounded.card,paddingTop:14},error:{color:colors.danger,fontSize:13,lineHeight:19,paddingHorizontal:4},hint:{color:colors.muted,fontSize:12,lineHeight:18,paddingHorizontal:4},
 copy:{color:colors.body,fontSize:14,lineHeight:21},title:{...typography.section,color:colors.ink},
 caption:{color:colors.muted,fontSize:12,lineHeight:16,fontWeight:'600'},value:{color:colors.ink,fontSize:15,lineHeight:22},date:{...typography.numeral,color:colors.ink},
 status:{color:colors.primary,fontSize:13,lineHeight:18,fontWeight:'700'},
 card:{padding:16,backgroundColor:colors.surface,borderRadius:rounded.card,borderWidth:1,borderColor:colors.border,gap:14},
 section:{gap:14,paddingVertical:4},item:{paddingVertical:14,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border,gap:10},first:{borderTopWidth:0,paddingTop:0},
 facts:{gap:12},datum:{gap:2},divider:{height:StyleSheet.hairlineWidth,backgroundColor:colors.border},
 wrap:{flexDirection:'row',flexWrap:'wrap',gap:8},row:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:12},flex:{flex:1,minWidth:0,gap:4},
 switchRow:{minHeight:52,flexDirection:'row',alignItems:'center',gap:16,paddingTop:12,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border},
 // Logos sit in the arch, like every photo in a list (DESIGN.md §1).
 logo:{width:96,height:112,borderTopLeftRadius:48,borderTopRightRadius:48,borderBottomLeftRadius:rounded.inner,borderBottomRightRadius:rounded.inner},
 modalBackdrop:{flex:1,backgroundColor:colors.overlay,justifyContent:'flex-end'},
 modalFrame:{width:'100%',maxWidth:560,alignSelf:'center',maxHeight:'92%',backgroundColor:colors.sheet,borderTopLeftRadius:rounded.sheet,borderTopRightRadius:rounded.sheet,borderWidth:1,borderBottomWidth:0,borderColor:colors.border,overflow:'hidden'},
 modalContent:{padding:20,paddingBottom:32,gap:18},
 // A person chosen by their avatar (Seguimientos): 44 px circles, the chosen one in blue.
 avatars:{flexDirection:'row',gap:8,paddingVertical:2},avatar:{width:44,height:44,borderRadius:rounded.pill,backgroundColor:colors.raised,alignItems:'center',justifyContent:'center'},avatarOn:{backgroundColor:colors.primaryFill},
 avatarText:{...typography.cardTitle,fontSize:16,lineHeight:20,color:colors.primary},avatarTextOn:{color:colors.onPrimary},
}));

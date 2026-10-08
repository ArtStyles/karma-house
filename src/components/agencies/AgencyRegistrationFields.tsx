import {StyleSheet,Switch,Text,TextInput,View,type TextInputProps} from 'react-native';
import type {AgencyApplicationInput} from '../../agencies/types';
import type {AgencyFieldErrors} from '../../agencies/registration';
import {PROVINCES} from '../../domain/listingOptions';
import {Pill} from '../ui';
import {createThemedStyles} from '../../theme';
export function AgencyTextField({label,error,...props}:TextInputProps&{label:string;error?:string}){
 const {colors,styles:s}=useAgencyFormStyles();return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.muted} style={[s.input,props.multiline&&s.multiline,error&&{borderColor:colors.danger}]} />{Boolean(error)&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}</View>;
}
export function AgencyRegistrationFields({value,onChange,disabled,errors={},commercialOnly=false}:{value:AgencyApplicationInput;onChange:(value:AgencyApplicationInput)=>void;disabled:boolean;errors?:AgencyFieldErrors;commercialOnly?:boolean}){
 const {styles:s}=useAgencyFormStyles();const set=<K extends keyof AgencyApplicationInput>(key:K,next:AgencyApplicationInput[K])=>onChange({...value,[key]:next});
 return <View style={s.form}>
 <AgencyTextField label="Nombre comercial" value={value.tradeName} onChangeText={v=>set('tradeName',v)} editable={!disabled} maxLength={120} error={errors.tradeName}/>
 {!commercialOnly&&<AgencyTextField label="Nombre completo del responsable · privado" value={value.responsibleFullName} onChangeText={v=>set('responsibleFullName',v)} editable={!disabled} maxLength={160} error={errors.responsibleFullName}/>}
 <AgencyTextField label="Teléfono comercial · público tras aprobación" value={value.businessPhone} onChangeText={v=>set('businessPhone',v)} editable={!disabled} keyboardType="phone-pad" maxLength={30} error={errors.businessPhone}/>
 <Text style={s.label}>Provincia de referencia</Text><View style={s.wrap}>{PROVINCES.map(province=><Pill key={province} label={province} active={value.province===province} onPress={()=>{if(!disabled)set('province',province);}}/>)}</View>
 <AgencyTextField label="Municipio de referencia" value={value.municipality} onChangeText={v=>set('municipality',v)} editable={!disabled} maxLength={80} error={errors.municipality}/>
 <AgencyTextField label="Zonas de servicio · separadas por comas" value={value.serviceAreas.join(',')} onChangeText={v=>set('serviceAreas',v?v.split(','):[])} editable={!disabled} maxLength={1620} error={errors.serviceAreas}/>
 <AgencyTextField label="Descripción de servicios · pública tras aprobación" value={value.description} onChangeText={v=>set('description',v)} editable={!disabled} multiline maxLength={1000} error={errors.description}/>
 <AgencyTextField label="Dirección de oficina · opcional" value={value.officeAddress??''} onChangeText={v=>set('officeAddress',v||null)} editable={!disabled} maxLength={200} error={errors.officeAddress}/>
 <View style={s.row}><Text style={[s.label,{flex:1}]}>Publicar dirección de oficina</Text><Switch accessibilityLabel="Publicar dirección de oficina" value={value.publishOfficeAddress} onValueChange={v=>set('publishOfficeAddress',v)} disabled={disabled}/></View>
 {!commercialOnly&&<AgencyTextField label="Referencias privadas · opcionales, una por línea, máximo cinco" value={value.evidenceReferences.join('\n')} onChangeText={v=>set('evidenceReferences',v?v.split('\n'):[])} editable={!disabled} multiline maxLength={2504} error={errors.evidenceReferences}/>}
 {!commercialOnly&&<Text style={s.copy}>El responsable y las referencias solo se usan para revisar la solicitud. La revisión no acredita la titularidad de viviendas. Puedes añadir el logo después de confirmar tu correo.</Text>}
 </View>;
}
export const useAgencyFormStyles=createThemedStyles(colors=>StyleSheet.create({safe:{flex:1,backgroundColor:colors.paper},content:{width:'100%',maxWidth:760,alignSelf:'center',padding:22,paddingBottom:40,gap:18},form:{gap:16},field:{gap:8},label:{fontSize:14,fontWeight:'600',color:colors.ink},input:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:15,minHeight:52,color:colors.ink,fontSize:16,padding:14},multiline:{minHeight:100,textAlignVertical:'top'},error:{color:colors.danger,fontSize:13},copy:{color:colors.muted,fontSize:14,lineHeight:22},title:{color:colors.ink,fontSize:21,fontWeight:'600'},card:{padding:20,backgroundColor:colors.surface,borderRadius:22,borderWidth:1,borderColor:colors.border,gap:14},wrap:{flexDirection:'row',flexWrap:'wrap',gap:8},row:{flexDirection:'row',alignItems:'center',gap:10}}));

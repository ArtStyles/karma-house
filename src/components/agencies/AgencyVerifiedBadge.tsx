import {Text,View} from 'react-native';
import {Icon} from '../ui';
import {rounded,useTheme} from '../../theme';
/**
 * KarmaHouse's company seal (DESIGN.md §8): it never says «verificada», and it explains that it does not
 * vouch for who owns the homes. The principal agency keeps its own label.
 */
export function AgencyVerifiedBadge({verified,agencyName,principal=false,labelled=false}:{verified:boolean;agencyName:string;principal?:boolean;labelled?:boolean}){
 const {colors}=useTheme();if(!verified)return null;
 const label=principal?'Inmobiliaria principal':'Sello empresarial',spoken=principal?label:'Sello empresarial de KarmaHouse';
 return <View accessible accessibilityLabel={`${spoken}: ${agencyName}`} accessibilityHint={principal?undefined:'No acredita la propiedad de las viviendas.'} style={{flexDirection:'row',alignItems:'center',gap:5,alignSelf:'flex-start',...(labelled?{paddingHorizontal:9,minHeight:24,borderRadius:rounded.pill,backgroundColor:colors.softAmber}:{})}}><Icon name={principal?'star':'shield-checkmark'} color={colors.amber} size={labelled?14:20}/>{labelled&&<Text style={{color:colors.amber,fontSize:12,lineHeight:16,fontWeight:'700'}}>{label}</Text>}</View>;
}

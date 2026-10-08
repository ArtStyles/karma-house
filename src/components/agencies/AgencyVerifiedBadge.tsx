import {Text,View} from 'react-native';
import {Icon} from '../ui';
import {useTheme} from '../../theme';
export function AgencyVerifiedBadge({verified,agencyName,principal=false,labelled=false}:{verified:boolean;agencyName:string;principal?:boolean;labelled?:boolean}){
 const {colors}=useTheme();if(!verified)return null;
 const label=principal?'Inmobiliaria principal':'Inmobiliaria verificada por KarmaHouse',color=principal?colors.amber:colors.green;
 return <View accessible accessibilityLabel={`${label}: ${agencyName}`} style={{flexDirection:'row',alignItems:'center',gap:6,...(labelled?{paddingHorizontal:9,paddingVertical:5,borderRadius:12,backgroundColor:principal?colors.softAmber:colors.softGreen}:{})}}><Icon name="checkmark-circle" color={color} size={22}/>{labelled&&<Text style={{color,fontSize:12,fontWeight:'700'}}>{label}</Text>}</View>;
}

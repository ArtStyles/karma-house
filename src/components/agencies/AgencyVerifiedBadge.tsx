import {View} from 'react-native';
import {Icon} from '../ui';
import {useTheme} from '../../theme';
export function AgencyVerifiedBadge({verified,agencyName}:{verified:boolean;agencyName:string}){
 const {colors}=useTheme();if(!verified)return null;
 return <View accessible accessibilityLabel={`Inmobiliaria verificada por KarmaHouse: ${agencyName}`}><Icon name="checkmark-circle" color={colors.green} size={22}/></View>;
}

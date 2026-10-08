import { SelectionField } from '../SelectionField';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { havanaDateTime } from '../../negotiations/domain';
import { createThemedStyles } from '../../theme';

const pad = (value: number) => String(value).padStart(2,'0');
export function VisitDateTimeFields({ date, time, disabled, onDate, onTime, purpose = 'visit' }: { purpose?: 'visit' | 'sale'; date: string; time: string; disabled: boolean; onDate(value: string): void; onTime(value: string): void }) {
  const { styles } = useStyles();
  const today = havanaDateTime().date;
  const [firstYear,firstMonth] = today.split('-').map(Number);
  const months = Array.from({length:7},(_,index) => {
    const stamp = new Date(Date.UTC(firstYear,firstMonth-1+index,1));
    return { value:`${stamp.getUTCFullYear()}-${pad(stamp.getUTCMonth()+1)}`,label:stamp.toLocaleDateString('es',{month:'long',year:'numeric',timeZone:'UTC'}) };
  });
  const [year,month,day] = date.split('-').map(Number);
  const days = new Date(Date.UTC(year,month,0)).getUTCDate();
  const [hour,minute] = time.split(':');
  return <View style={styles.fields}>
    {purpose === 'sale' ? <View><Text style={styles.label}>Fecha de venta (AAAA-MM-DD)</Text><TextInput accessibilityLabel="Fecha de venta (AAAA-MM-DD)" style={styles.dateInput} value={date} onChangeText={onDate} editable={!disabled} placeholder="AAAA-MM-DD" maxLength={10}/></View> : <><SelectionField inline label="Mes de la visita" value={date.slice(0,7)} options={months} disabled={disabled} onChange={value => {
      const [nextYear,nextMonth] = value.split('-').map(Number);
      const nextDay = Math.min(day,new Date(Date.UTC(nextYear,nextMonth,0)).getUTCDate());
      onDate(`${value}-${pad(nextDay)}`);
    }} />
    <SelectionField inline label="Día de la visita" value={pad(day)} options={Array.from({length:days},(_,i)=>({value:pad(i+1),label:String(i+1)}))} disabled={disabled} onChange={value=>onDate(`${date.slice(0,7)}-${value}`)} /></>}
    <View style={styles.timeRow}>
      <View style={styles.timeField}><SelectionField inline label="Hora" value={hour} options={Array.from({length:24},(_,i)=>({value:pad(i),label:`${pad(i)} h`}))} disabled={disabled} onChange={value=>onTime(`${value}:${minute}`)} /></View>
      <View style={styles.timeField}><SelectionField inline label="Minutos" value={minute} options={Array.from({length:60},(_,i)=>({value:pad(i),label:pad(i)}))} disabled={disabled} onChange={value=>onTime(`${hour}:${value}`)} /></View>
    </View>
    <Text style={styles.hint}>{purpose === 'sale' ? 'Hora de Cuba · Indica cuándo ocurrió la venta. La fecha y hora no pueden estar en el futuro.' : 'Hora de Cuba · Elige una fecha futura, dentro de los próximos 180 días.'}</Text>
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({label:{color:colors.ink,fontSize:14,marginBottom:6},dateInput:{color:colors.ink,borderColor:colors.border,borderWidth:1,borderRadius:12,padding:12},fields:{gap:13},timeRow:{flexDirection:'row',gap:10},timeField:{flex:1,minWidth:0},hint:{fontSize:12,lineHeight:19,color:colors.muted}}));

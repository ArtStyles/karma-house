import { SelectionField } from '../SelectionField';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { havanaDateTime } from '../../negotiations/domain';
import { createThemedStyles, rounded, typography } from '../../theme';
import { Icon } from '../ui';

const pad = (value: number) => String(value).padStart(2,'0');
const WEEK = ['L','M','X','J','V','S','D'];
const WEEKDAYS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const capital = (text: string) => text.charAt(0).toLocaleUpperCase('es') + text.slice(1);

/** A visit is picked on a month calendar (days in Calistoga, past days off); a sale date stays a typed field. */
export function VisitDateTimeFields({ date, time, disabled, onDate, onTime, purpose = 'visit' }: { purpose?: 'visit' | 'sale'; date: string; time: string; disabled: boolean; onDate(value: string): void; onTime(value: string): void }) {
  const { colors, styles } = useStyles();
  const today = havanaDateTime().date;
  const [firstYear,firstMonth] = today.split('-').map(Number);
  const months = Array.from({length:7},(_,index) => {
    const stamp = new Date(Date.UTC(firstYear,firstMonth-1+index,1));
    return { value:`${stamp.getUTCFullYear()}-${pad(stamp.getUTCMonth()+1)}`,label:stamp.toLocaleDateString('es',{month:'long',year:'numeric',timeZone:'UTC'}) };
  });
  const [year,month,day] = date.split('-').map(Number);
  const days = new Date(Date.UTC(year,month,0)).getUTCDate();
  const [hour,minute] = time.split(':');
  const monthValue = date.slice(0,7);
  const monthIndex = months.findIndex(option => option.value === monthValue);
  const monthLabel = months[monthIndex]?.label ?? monthValue;
  const monthName = new Date(Date.UTC(year,month-1,1)).toLocaleDateString('es',{month:'long',timeZone:'UTC'});
  // Keep the chosen day when the month changes, or the last day of a shorter month.
  const moveMonth = (value: string) => {
    const [nextYear,nextMonth] = value.split('-').map(Number);
    const nextDay = Math.min(day,new Date(Date.UTC(nextYear,nextMonth,0)).getUTCDate());
    onDate(`${value}-${pad(nextDay)}`);
  };
  // Monday first, as Cuban calendars are.
  const lead = (new Date(Date.UTC(year,month-1,1)).getUTCDay() + 6) % 7;
  const arrow = (delta: -1 | 1) => {
    const target = months[monthIndex + delta];
    return <Pressable accessibilityRole="button" accessibilityLabel={delta < 0 ? 'Mes anterior' : 'Mes siguiente'} accessibilityState={{ disabled: disabled || !target }}
      disabled={disabled || !target} onPress={() => target && moveMonth(target.value)} style={[styles.arrow, (disabled || !target) && styles.off]}>
      <Icon name={delta < 0 ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.ink} />
    </Pressable>;
  };
  return <View style={styles.fields}>
    {purpose === 'sale' ? <View style={styles.dateField}><Text style={styles.label}>Fecha de venta (AAAA-MM-DD)</Text><TextInput accessibilityLabel="Fecha de venta (AAAA-MM-DD)" style={styles.dateInput} value={date} onChangeText={onDate} editable={!disabled} placeholder="AAAA-MM-DD" placeholderTextColor={colors.muted} maxLength={10}/></View> : <View style={styles.calendar}>
      <View style={styles.monthRow}>
        <SelectionField label="Mes de la visita" value={monthValue} options={months} disabled={disabled} onChange={moveMonth}
          renderTrigger={open => <Pressable accessibilityRole="button" accessibilityLabel={`Mes de la visita: ${monthLabel}`} accessibilityState={{ disabled }} disabled={disabled} onPress={open} style={styles.monthTrigger}>
            <Text style={styles.month}>{capital(monthLabel)}</Text><Icon name="chevron-down" size={16} color={colors.sol} />
          </Pressable>} />
        <View style={styles.arrows}>{arrow(-1)}{arrow(1)}</View>
      </View>
      <View accessibilityLabel="Día de la visita" style={styles.grid}>
        {WEEK.map(letter => <Text key={letter} accessible={false} style={styles.weekday}>{letter}</Text>)}
        {Array.from({length:lead},(_,index) => <View key={`lead${index}`} style={styles.cell} />)}
        {Array.from({length:days},(_,index) => {
          const number = index + 1, value = `${monthValue}-${pad(number)}`, past = value < today, chosen = number === day;
          const weekday = WEEKDAYS[new Date(Date.UTC(year,month-1,number)).getUTCDay()];
          return <View key={number} style={styles.cell}><Pressable accessibilityRole="button" accessibilityLabel={`${weekday} ${number} de ${monthName}`} accessibilityState={{ selected: chosen, disabled: disabled || past }}
            disabled={disabled || past} onPress={() => onDate(value)} style={[styles.day, chosen && styles.dayOn, value === today && !chosen && styles.today, past && styles.off]}>
            <Text style={[styles.dayText, chosen && styles.dayTextOn]}>{number}</Text>
          </Pressable></View>;
        })}
      </View>
    </View>}
    <View style={styles.timeRow}>
      <View style={styles.timeField}><SelectionField inline label="Hora" value={hour} options={Array.from({length:24},(_,i)=>({value:pad(i),label:`${pad(i)} h`}))} disabled={disabled} onChange={value=>onTime(`${value}:${minute}`)} /></View>
      <View style={styles.timeField}><SelectionField inline label="Minutos" value={minute} options={Array.from({length:60},(_,i)=>({value:pad(i),label:pad(i)}))} disabled={disabled} onChange={value=>onTime(`${hour}:${value}`)} /></View>
    </View>
    <Text style={styles.hint}>{purpose === 'sale' ? 'Hora de Cuba · Indica cuándo ocurrió la venta. La fecha y hora no pueden estar en el futuro.' : 'Hora de Cuba · Elige una fecha futura, dentro de los próximos 180 días.'}</Text>
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  label:{color:colors.body,fontSize:13,lineHeight:18,fontWeight:'600'},dateField:{gap:8},
  dateInput:{minHeight:52,color:colors.ink,borderColor:colors.border,borderWidth:1,borderRadius:rounded.pill,paddingHorizontal:18,paddingVertical:12,fontSize:16,backgroundColor:colors.surface},
  fields:{gap:16},calendar:{gap:10},
  monthRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},monthTrigger:{minHeight:44,flexDirection:'row',alignItems:'center',gap:6,flexShrink:1},month:{...typography.section,color:colors.ink,flexShrink:1},
  arrows:{flexDirection:'row',gap:6},arrow:{width:40,height:40,borderRadius:rounded.pill,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface},off:{opacity:.3},
  grid:{flexDirection:'row',flexWrap:'wrap',rowGap:4},
  weekday:{width:`${100/7}%`,textAlign:'center',fontSize:12,lineHeight:22,fontWeight:'600',color:colors.muted},
  cell:{width:`${100/7}%`,height:44,alignItems:'center',justifyContent:'center'},
  day:{width:40,height:40,borderRadius:rounded.pill,alignItems:'center',justifyContent:'center'},dayOn:{backgroundColor:colors.primaryFill},today:{borderWidth:1,borderColor:colors.outline},
  dayText:{...typography.cardTitle,color:colors.ink,fontVariant:['tabular-nums']},dayTextOn:{color:colors.onPrimary},
  timeRow:{flexDirection:'row',flexWrap:'wrap',gap:12},timeField:{flexGrow:1,flexBasis:140,minWidth:0},hint:{fontSize:12,lineHeight:18,color:colors.muted},
}));

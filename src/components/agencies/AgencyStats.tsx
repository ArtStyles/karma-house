import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAgencyWorkspace } from '../../agencies/AgencyProvider';
import type { CapturedAgencyContext } from '../../agencies/controller';
import { createAgencyDealRepository } from '../../agencies/deals/repository';
import { agencyPropertyRepository } from '../../agencies/properties/client';
import { countPages, weekRange, type Tally } from '../../agencies/stats';
import { supabase } from '../../lib/supabase';
import { createThemedStyles, rounded, typography } from '../../theme';

const deals = supabase ? createAgencyDealRepository(supabase) : null;
type Stats = { key: string; homes?: Tally; leads?: Tally; visits?: Tally };

/**
 * Mi inmobiliaria's three figures, read from the lists the agency already has: homes in the portfolio,
 * open follow-ups and this week's visits. Each one shows «—» until it is read, and stays so if it fails.
 */
export function AgencyStats() {
  const w = useAgencyWorkspace();
  const { colors, styles } = useStyles();
  const key = `${w.activeAgencyId}:${w.generation}`;
  const [stats, setStats] = useState<Stats | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true, context: CapturedAgencyContext;
    try { context = w.captureAgencyReadContext(); } catch { return; }
    const { from, to } = weekRange();
    const settle = (name: 'homes' | 'leads' | 'visits', work: Promise<Tally>) => work.then(value => {
      context.checkpoint();
      if (active) setStats(old => ({ ...(old?.key === key ? old : { key }), [name]: value }));
    }).catch(() => undefined);
    void Promise.all([
      agencyPropertyRepository ? settle('homes', countPages(offset => agencyPropertyRepository!.list(offset, context))) : null,
      deals ? settle('leads', countPages(offset => deals.list({ offset }, context), deal => !deal.closedReason)) : null,
      deals ? settle('visits', countPages(offset => deals.scheduling.calendar(from, to, offset, context), visit => visit.outcome !== 'cancelled')) : null,
    ]).finally(() => context.release());
    return () => { active = false; };
  }, [key, w.captureAgencyReadContext]));
  const shown = stats?.key === key ? stats : null;
  const figure = (tally: Tally | undefined, label: string, one: string, many: string, warm = false) => {
    const text = tally ? `${tally.count}${tally.more ? '+' : ''}` : '—';
    return <View accessible accessibilityLabel={tally ? `${text} ${tally.count === 1 && !tally.more ? one : many}` : `${label}: consultando`} style={styles.figure}>
      <Text style={[styles.number, warm && tally && tally.count > 0 && { color: colors.amber }]}>{text}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>;
  };
  return <View style={styles.card}>
    {figure(shown?.homes, 'Viviendas', 'vivienda en la cartera', 'viviendas en la cartera')}
    {figure(shown?.leads, 'Interesados', 'interesado en seguimiento', 'interesados en seguimiento')}
    {figure(shown?.visits, 'Visitas esta semana', 'visita esta semana', 'visitas esta semana', true)}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  card: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 8, borderRadius: rounded.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  figure: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  number: { ...typography.numeralLg, color: colors.ink },
  label: { color: colors.muted, fontSize: 12, lineHeight: 16, textAlign: 'center' },
}));

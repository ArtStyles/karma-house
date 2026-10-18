import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAgencyWorkspace } from '../../agencies/AgencyProvider';
import type { CapturedAgencyContext } from '../../agencies/controller';
import { agencyError } from '../../agencies/domain';
import { createAgencyDealRepository } from '../../agencies/deals/repository';
import { createAgencyMessagingRepository } from '../../agencies/messaging/repository';
import type { AgencyConversation } from '../../agencies/messaging/types';
import type { AgencyMembership, AgencyRole } from '../../agencies/types';
import { createMessageId } from '../../messaging/domain';
import { supabase } from '../../lib/supabase';
import { agencyRoleLabel } from '../../screens/AgencyWorkspaceScreen';
import { createThemedStyles, typography } from '../../theme';
import { Sheet } from '../Sheet';
import { Notice, Pill } from '../ui';

const messaging = supabase ? createAgencyMessagingRepository(supabase) : null;
const deals = supabase ? createAgencyDealRepository(supabase) : null;
type Person = { userId: string; displayName?: string; role: AgencyRole };

/** Who answers this client: the responsable and the people added to the conversation. Admins and coordinators change it. */
export function AgencyAttendantsSheet({ visible, onClose, conversation: c, onChanged }: { visible: boolean; onClose(): void; conversation: AgencyConversation; onChanged(): Promise<void> }) {
  const w = useAgencyWorkspace();
  const { colors, styles } = useStyles();
  const [members, setMembers] = useState<AgencyMembership[] | null>(null), [busy, setBusy] = useState(''), [issue, setIssue] = useState('');
  useEffect(() => {
    if (!visible || !c.canManage || !w.repository) return;
    const repository = w.repository;
    let active = true, context: CapturedAgencyContext;
    try { context = w.captureAgencyReadContext(); } catch { return; }
    setIssue('');
    void (async () => {
      const all: AgencyMembership[] = [];
      for (let more = true; more && all.length < 150;) { const page = await repository.listMembers(all.length, context); context.checkpoint(); all.push(...page.items); more = page.hasMore; }
      return all;
    })().then(all => { if (active) setMembers(all); }).catch(error => { if (active) setIssue(agencyError(error)); }).finally(() => context.release());
    return () => { active = false; };
  }, [visible, c.canManage, w.repository, w.captureAgencyReadContext]);
  async function change(key: string, work: (context: CapturedAgencyContext) => Promise<unknown>) {
    if (busy || !messaging || !deals) return;
    setBusy(key); setIssue('');
    let context: CapturedAgencyContext | undefined;
    try { context = w.captureAgencyContext(); await work(context); context.checkpoint(); await onChanged(); }
    catch (error) { setIssue(agencyError(error)); }
    finally { context?.release(); setBusy(''); }
  }
  const attending = new Set(c.attendants.filter(a => !a.lead).map(a => a.userId));
  const people: Person[] = c.canManage && members ? members : c.attendants;
  return <Sheet visible={visible} onClose={onClose} title="Quién atiende">
    <Text style={styles.intro}>Administradores y coordinadores escriben en todas las conversaciones. También escriben el responsable y las personas que se añadan aquí. El cliente ve todas las respuestas como {c.agencyName}.</Text>
    {!!issue && <Notice error>{issue}</Notice>}
    {c.canManage && !members && !issue && <ActivityIndicator accessibilityLabel="Consultando el equipo" color={colors.primary} />}
    {people.map(person => {
      const name = person.displayName ?? 'Persona del equipo';
      const lead = person.userId === c.assigneeId, supervisor = person.role !== 'manager', added = attending.has(person.userId);
      return <View key={person.userId} style={styles.person}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.meta}>{agencyRoleLabel[person.role]}{lead ? ' · Responsable' : added ? ' · Atiende' : supervisor ? ' · Escribe siempre' : ''}</Text>
        {c.canManage && !lead && <View style={styles.actions}>
          <Pill label={busy === `lead:${person.userId}` ? 'Guardando…' : 'Hacer responsable'} accessibilityLabel={`Hacer responsable a ${name}`}
            onPress={() => void change(`lead:${person.userId}`, context => deals!.assign({ dealId: c.dealId, userId: person.userId, expectedVersion: c.dealVersion, clientRequestId: createMessageId() }, context))} />
          {!supervisor && <Pill label={busy === `attend:${person.userId}` ? 'Guardando…' : 'Atiende'} active={added} accessibilityLabel={`${added ? 'Quitar' : 'Añadir'} a ${name} en esta conversación`}
            onPress={() => void change(`attend:${person.userId}`, context => messaging!.setAttendant({ conversationId: c.id, userId: person.userId, attending: !added, clientRequestId: createMessageId() }, context))} />}
        </View>}
      </View>;
    })}
    {!c.canManage && !c.attendants.length && <Text style={styles.meta}>Aún no hay responsable. Lo elige un administrador o un coordinador.</Text>}
  </Sheet>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  intro: { ...typography.bodySm, color: colors.body, marginBottom: 6 },
  person: { gap: 4, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  name: { ...typography.body, fontWeight: '600', color: colors.ink }, meta: { ...typography.label, fontWeight: '400', color: colors.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 6 },
}));

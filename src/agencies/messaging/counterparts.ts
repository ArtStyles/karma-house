import type { AgencyConversation } from './types.ts';

// The caller supplies only the currently authorized, captured conversation.
export function agencyConversationCounterparts(
    conversation: Pick<AgencyConversation, 'buyerId' | 'assigneeId' | 'blockedUserIds'> | null,
    messageParticipants: readonly (string | null)[], actorId: string | undefined, staff: boolean,
) {
    if (!conversation || !actorId) return [];
    const participates = !staff || conversation.assigneeId === actorId || messageParticipants.includes(actorId);
    const ordinaryTargets = participates ? [...messageParticipants, staff ? conversation.buyerId : conversation.assigneeId] : [];
    const targets = [...new Set([...ordinaryTargets, ...conversation.blockedUserIds]
        .filter((target): target is string => !!target && target !== actorId && (staff ? target === conversation.buyerId : target !== conversation.buyerId)))];
    return targets.map(userId => ({ userId,
        canBlock: staff ? participates && userId === conversation.buyerId : userId === conversation.assigneeId || messageParticipants.includes(userId),
        canUnblock: true,
        canReport: participates && messageParticipants.includes(userId),
    }));
}

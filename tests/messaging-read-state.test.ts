import assert from 'node:assert/strict';
import test from 'node:test';
import { createMessagingController } from '../src/messaging/controller.ts';
import type { ChatMessage, Conversation, MessagingRepository } from '../src/messaging/types.ts';
import { elements, executeComponent, Hooks } from './helpers/tsxHooks.ts';

const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const chat = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const timestamp = '2026-10-12T12:00:00.000Z';
const conversation: Conversation = {
  id: chat, propertyId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', propertyTitle: 'Casa', propertyLocation: 'La Habana',
  buyerId: actor, sellerId: other, otherUserId: other, otherName: 'Vendedor',
  lastMessage: null, lastMessageAt: null, lastSeq: 0, unreadCount: 0,
  blockedByMe: false, blockedByOther: false, canSend: true, propertyAvailable: true, createdAt: timestamp,
};

function fixture(screen: 'inbox' | 'conversation') {
  const hooks = new Hooks();
  let inboxFailure = false, historyFailure = false;
  let conversations: Conversation[] = [conversation], messages: ChatMessage[] = [];
  const repository: MessagingRepository = {
    listConversations: async () => { if (inboxFailure) throw Error('Network request failed'); return conversations; },
    getConversation: async () => conversation,
    listMessages: async () => { if (historyFailure) throw Error('Network request failed'); return messages; },
    startConversation: async () => conversation,
    sendMessage: async () => { throw Error('The read-state fixture must not send'); },
    findSentMessages: async () => [], markRead: async () => {}, setBlocked: async () => {}, reportConversation: async () => {},
  };
  const controller = createMessagingController(repository, { getItem: async () => null, setItem: async () => {} });
  controller.setSession(actor, 'captured-token');
  let refresh: () => Promise<unknown> = async () => {};
  const native = Object.fromEntries([
    'SafeAreaView', 'View', 'Text', 'Pressable', 'ActivityIndicator', 'FlatList', 'RefreshControl', 'ScrollView',
    'KeyboardAvoidingView', 'Modal', 'TextInput', 'PageTitle', 'Button', 'Icon', 'IconButton', 'Notice', 'EmptyState',
    'AccountPrompt', 'ActionGroup', 'AgencyInbox', 'ConversationCard', 'ConversationNegotiations', 'ReportConversationSheet',
    'MessageBubble', 'ProposalCard', 'NegotiationNotice',
  ].map(name => [name, name]));
  const path = screen === 'inbox' ? 'src/screens/InboxScreen.tsx' : 'src/screens/ConversationScreen.tsx';
  const component = executeComponent(path, screen === 'inbox' ? 'InboxScreen' : 'ConversationBody', hooks, {
    ...native,
    useStyles: () => ({ colors: {}, styles: {} }),
    useAuth: () => ({ ready: true, user: { id: actor }, session: { access_token: 'captured-token' }, suspended: false }),
    useMessaging: () => ({ ...controller, ...controller.getState(), available: true }),
    useMessagingActivity: () => screen === 'conversation',
    useConsultationRefresh: (_scope: string, work: () => Promise<unknown>) => { refresh = work; return { refreshing: false, refresh: work, isRefreshing: () => false }; },
    useNotifications: () => ({ invalidateAfterBlockChange: async () => {} }),
    useComposerDraft: () => ({ ready: true, text: '', error: '', change() {}, retry: async () => {}, clearAfterEnqueue: async () => {} }),
    useNegotiations: () => ({ userId: actor, items: [], ready: true, loading: false, loadingMore: false, mutating: false, error: '', hasMore: false, refresh: async () => {} }),
    useNegotiationMutations: () => ({ issue: '', clearFeedback() {}, respond: async () => {}, create: async () => {} }),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
    message: executeComponent('src/screens/ConversationScreen.tsx', 'message', hooks, {}),
    Platform: { OS: 'android' }, Keyboard: { dismiss() {} }, router: { push() {}, replace() {} }, goBack() {},
    setInterval: () => 1, clearInterval() {}, requestAnimationFrame() {},
  });
  const render = () => hooks.render(() => component({ id: chat, userId: actor }));
  const list = () => elements(render()).find(item => item.type === 'FlatList')!.props;
  return {
    controller, render, list,
    failInbox: (value: boolean) => { inboxFailure = value; }, failHistory: (value: boolean) => { historyFailure = value; },
    setConversations: (value: Conversation[]) => { conversations = value; }, setMessages: (value: ChatMessage[]) => { messages = value; },
    refresh: () => refresh(),
    settle: () => new Promise<void>(resolve => setImmediate(resolve)),
    dispose: () => { hooks.dispose(); controller.dispose(); },
  };
}

test('an initial failed inbox query does not claim there are no conversations; a successful empty retry does', async () => {
  const f = fixture('inbox');
  try {
    f.setConversations([]); f.failInbox(true);
    await assert.rejects(f.controller.refresh());
    assert.equal(f.list().ListEmptyComponent, null);
    assert.ok(elements(f.render()).some(item => item.type === 'Notice' && item.props.error));
    f.failInbox(false);
    await f.refresh();
    assert.equal(f.list().ListEmptyComponent.type, 'EmptyState');
  } finally { f.dispose(); }
});

test('an inbox refresh failure retains the previously loaded conversations', async () => {
  const f = fixture('inbox');
  try {
    await f.controller.refresh();
    f.failInbox(true); await assert.rejects(f.controller.refresh());
    assert.equal(f.list().data.length, 1);
    assert.equal(f.list().data[0].id, chat);
  } finally { f.dispose(); }
});

test('a known chat whose first history query fails keeps the error without claiming it has no messages', async () => {
  const f = fixture('conversation');
  try {
    await f.controller.refresh(); f.failHistory(true);
    f.render(); await f.settle();
    assert.ok(f.controller.getState().histories[chat].error);
    assert.equal(f.list().ListEmptyComponent, null);
    assert.ok(elements(f.render()).some(item => item.props.accessibilityRole === 'alert'));
    f.failHistory(false); await f.refresh();
    // The provider's successful inbox refresh clears the controller's shared read error.
    await f.controller.refresh();
    assert.equal(f.list().ListEmptyComponent.type, 'EmptyState');
  } finally { f.dispose(); }
});

test('a chat refresh failure preserves the loaded history and older-message control', async () => {
  const f = fixture('conversation');
  try {
    f.setMessages(Array.from({ length: 60 }, (_, index): ChatMessage => ({
      id: `11111111-1111-4111-8111-${String(index + 41).padStart(12, '0')}`,
      clientMessageId: `22222222-2222-4222-8222-${String(index + 41).padStart(12, '0')}`,
      conversationId: chat, senderId: other, seq: index + 41, body: `Mensaje ${index + 41}`, createdAt: timestamp,
    })));
    await f.controller.refresh(); f.render(); await f.settle();
    f.failHistory(true); await assert.rejects(f.controller.openConversation(chat));
    const list = f.list();
    assert.equal(list.data.length, 60);
    assert.equal(list.data[0].message.seq, 41);
    assert.equal(list.data[59].message.seq, 100);
    assert.equal(list.ListHeaderComponent.props.label, 'Ver mensajes anteriores');
  } finally { f.dispose(); }
});

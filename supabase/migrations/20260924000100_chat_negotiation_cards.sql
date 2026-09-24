-- Proposal summaries were already linked to their negotiation event, but clients only saw the text.
-- Expose the event so the chat can draw a card with live actions. The text body is unchanged, so
-- earlier app versions and the inbox preview keep showing the summary.
create or replace function kh_private.chat_message_json(p_message public.kh_messages) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',p_message.id,'conversationId',p_message.conversation_id,'seq',p_message.seq,
    'clientMessageId',p_message.client_message_id,'senderId',p_message.sender_id,'body',p_message.body,'createdAt',p_message.created_at,
    'negotiation',(select jsonb_build_object('id',e.negotiation_id,'action',e.action,'kind',e.snapshot->'kind','createdBy',e.snapshot->'createdBy',
        'amountUsd',e.snapshot->'amountUsd','visitAt',e.snapshot->'visitAt','note',e.snapshot->'note','parentId',e.snapshot->'parentId')
      from kh_private.negotiation_events e where e.id=p_message.negotiation_event_id));
$$;
notify pgrst, 'reload schema';

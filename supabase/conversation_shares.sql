-- Run in Supabase SQL Editor after chat_threads.sql.
-- Share links: token maps to a conversation; import copies messages to the recipient's account.

CREATE TABLE IF NOT EXISTS public.conversation_shares (
  token text PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_shares_conversation
  ON public.conversation_shares (conversation_id);

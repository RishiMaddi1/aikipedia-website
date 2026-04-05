-- Run in Supabase SQL Editor (once per project).
-- Multi-chat threads: conversations + messages, max 1000 messages per conversation (FIFO eviction).

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  image_url text,
  user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
  ON public.conversations (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at ASC);

-- At most 1000 rows per conversation: before insert, delete oldest row if already at cap.
CREATE OR REPLACE FUNCTION public.messages_enforce_max_per_conversation ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF (
    SELECT
      COUNT(*)::int
    FROM
      public.messages
    WHERE
      conversation_id = NEW.conversation_id) >= 1000 THEN
  DELETE FROM public.messages
  WHERE id = (
      SELECT
        id
      FROM
        public.messages
      WHERE
        conversation_id = NEW.conversation_id
      ORDER BY
        created_at ASC,
        id ASC
      LIMIT 1);
END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_before_insert_cap ON public.messages;

CREATE TRIGGER messages_before_insert_cap
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE PROCEDURE public.messages_enforce_max_per_conversation ();

-- Optional: expose to PostgREST (usually default for public schema).
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations; -- only if using realtime

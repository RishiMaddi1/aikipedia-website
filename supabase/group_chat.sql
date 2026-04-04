-- ============================================================================
-- Aikipedia Group Chat - Database Schema
-- ============================================================================
-- Run this in Supabase SQL Editor
-- Enables turn-based group chat with shared credit pot
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Step 1: Extend existing conversations table for group support
-- ----------------------------------------------------------------------------

-- Add group-related columns to conversations table
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_awaiting_ai BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS locked_by_username TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS group_pot_balance DECIMAL(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS max_members INTEGER DEFAULT 50;

-- Add index for group conversations lookup
CREATE INDEX IF NOT EXISTS idx_conversations_is_group
  ON public.conversations(is_group)
  WHERE is_group = true;

-- ----------------------------------------------------------------------------
-- Step 2: Create group_members table
-- ----------------------------------------------------------------------------
-- Links users to group conversations
-- Each row represents a user's membership in a group

CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure a user can only be a member once per group
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_conversation_user
  ON public.group_members(conversation_id, user_id);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_group_members_user_id
  ON public.group_members(user_id);

CREATE INDEX IF NOT EXISTS idx_group_members_conversation_id
  ON public.group_members(conversation_id);

-- ----------------------------------------------------------------------------
-- Step 3: Create group_pot_contributions table
-- ----------------------------------------------------------------------------
-- Tracks who added credits to which group pot
-- Useful for transparency and fairness

CREATE TABLE IF NOT EXISTS public.group_pot_contributions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for contribution history queries
CREATE INDEX IF NOT EXISTS idx_group_pot_contributions_conversation
  ON public.group_pot_contributions(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_group_pot_contributions_user
  ON public.group_pot_contributions(user_id);

-- ----------------------------------------------------------------------------
-- Step 4: Enable Realtime on tables
-- ----------------------------------------------------------------------------
-- Run these commands OR enable in Supabase Dashboard:
-- Database → Replication → Select tables → Enable

ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;

-- ----------------------------------------------------------------------------
-- Step 5: Helper Functions
-- ----------------------------------------------------------------------------

-- Function to get group member count
CREATE OR REPLACE FUNCTION public.get_group_member_count(p_conversation_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM public.group_members
    WHERE conversation_id = p_conversation_id
  );
END;
$$ LANGUAGE plpgsql;

-- Function to check if user is group admin
CREATE OR REPLACE FUNCTION public.is_group_admin(p_conversation_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1
    FROM public.group_members
    WHERE conversation_id = p_conversation_id
      AND user_id = p_user_id
      AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql;

-- Function to auto-release stale locks (after 5 minutes)
CREATE OR REPLACE FUNCTION public.release_stale_locks()
RETURNS void AS $$
BEGIN
  UPDATE public.conversations
  SET is_awaiting_ai = false,
      locked_by_user_id = NULL,
      locked_by_username = NULL,
      locked_at = NULL
  WHERE is_awaiting_ai = true
    AND locked_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Step 6: Triggers for automatic timestamp updates
-- ----------------------------------------------------------------------------

-- Update locked_at when lock is acquired
CREATE OR REPLACE FUNCTION public.update_locked_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_awaiting_ai = true AND (OLD.is_awaiting_ai IS NULL OR OLD.is_awaiting_ai = false) THEN
    NEW.locked_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_locked_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  WHEN (NEW.is_awaiting_ai IS DISTINCT FROM OLD.is_awaiting_ai)
  EXECUTE FUNCTION public.update_locked_at();

-- ----------------------------------------------------------------------------
-- Step 7: Row Level Security (RLS) Policies
-- ----------------------------------------------------------------------------

-- Enable RLS on group_members
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Users can see group memberships for conversations they are members of
CREATE POLICY group_members_select_member
  ON public.group_members FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.group_members gm
      WHERE gm.conversation_id = group_members.conversation_id
        AND gm.user_id = auth.uid()
    )
  );

-- Enable RLS on group_pot_contributions
ALTER TABLE public.group_pot_contributions ENABLE ROW LEVEL SECURITY;

-- Users can see contributions for groups they are members of
CREATE POLICY group_pot_contributions_select_member
  ON public.group_pot_contributions FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.group_members gm
      WHERE gm.conversation_id = group_pot_contributions.conversation_id
        AND gm.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- Step 8: Optional - Create view for group overview
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.group_overview AS
SELECT
  c.id,
  c.title,
  c.is_group,
  c.is_awaiting_ai,
  c.locked_by_username,
  c.locked_at,
  c.group_pot_balance,
  c.created_at,
  c.updated_at,
  c.user_id as created_by,
  gm.member_count,
  array_agg(DISTINCT u.username) as member_names
FROM public.conversations c
LEFT JOIN (
  SELECT conversation_id, COUNT(*) as member_count
  FROM public.group_members
  GROUP BY conversation_id
) gm ON gm.conversation_id = c.id
LEFT JOIN public.group_members gmx ON gmx.conversation_id = c.id
LEFT JOIN public.users u ON u.id = gmx.user_id
WHERE c.is_group = true
GROUP BY c.id, c.title, c.is_group, c.is_awaiting_ai, c.locked_by_username,
         c.locked_at, c.group_pot_balance, c.created_at, c.updated_at,
         c.user_id, gm.member_count;

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Verify tables were created: SELECT * FROM information_schema.tables WHERE table_schema = 'public';
-- 2. Enable Realtime in Supabase Dashboard for: conversations, messages, group_members
-- 3. Test with: SELECT * FROM public.group_members; SELECT * FROM public.group_pot_contributions;
-- ============================================================================

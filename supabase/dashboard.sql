-- ============================================================================
-- Aikipedia Dashboard - Database Schema
-- ============================================================================
-- Run this in Supabase SQL Editor
-- Enables tracking user analytics, spending, and usage patterns
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Step 1: Add columns to messages table for analytics
-- ----------------------------------------------------------------------------

-- Who sent the message (NULL for assistant); required for group chat labels
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Add cost tracking
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS cost DECIMAL(10,4);

-- Add model tracking
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS model TEXT;

-- Add token counts
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS input_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS output_tokens INTEGER DEFAULT 0;

-- Add index for analytics queries
CREATE INDEX IF NOT EXISTS idx_messages_created_at
  ON public.messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_user_id
  ON public.messages(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_model
  ON public.messages(model, created_at DESC);

-- ----------------------------------------------------------------------------
-- Step 2: Create transactions table for lifetime spend tracking
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'gift_redeem', 'group_pot_add', 'ai_charge')),
  amount DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  description TEXT,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  gift_code_id UUID REFERENCES public.gift_codes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_transactions_user_id
  ON public.transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_type
  ON public.transactions(type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_conversation_id
  ON public.transactions(conversation_id, created_at DESC) WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_gift_code_id
  ON public.transactions(gift_code_id, created_at DESC) WHERE gift_code_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_message_id
  ON public.transactions(message_id, created_at DESC) WHERE message_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Step 3: Create view for user analytics
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.user_analytics AS
SELECT
  u.id as user_id,
  u.username,
  (
    SELECT COUNT(*) FROM public.messages WHERE role='user' AND user_id=u.id
  ) as total_messages_sent,
  (
    SELECT COUNT(*) FROM public.conversations WHERE user_id=u.id
  ) as total_conversations,
  (
    SELECT COUNT(*) FROM public.group_members WHERE user_id=u.id
  ) as total_groups_joined,
  (
    SELECT COUNT(*) FROM public.gift_codes WHERE created_by=u.id
  ) as gift_codes_created,
  (
    SELECT COUNT(*) FROM public.gift_codes WHERE redeemed_by=u.id
  ) as gift_codes_redeemed,
  (
    SELECT COALESCE(SUM(amount), 0) FROM public.transactions
    WHERE user_id=u.id AND type='purchase'
  ) as total_purchased,
  u.money_left as current_balance
FROM public.users u;

-- ----------------------------------------------------------------------------
-- Step 4: Create view for usage analytics (last 30 days)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.usage_analytics AS
SELECT
  DATE(m.created_at) as date,
  (
    SELECT COUNT(*) FROM public.messages WHERE role='user'
  ) as total_messages,
  (
    SELECT COUNT(*) FROM public.messages WHERE role='assistant'
  ) as total_ai_messages,
  (
    SELECT COUNT(DISTINCT conversation_id) FROM public.messages
  ) as active_conversations
FROM public.messages m
WHERE m.created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(m.created_at)
ORDER BY date DESC;

-- ----------------------------------------------------------------------------
-- Step 5: Create view for model usage analytics
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.model_usage AS
SELECT
  model,
  COUNT(*) as message_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(cost) as total_cost,
  AVG(cost) as avg_cost_per_message,
  MIN(created_at) as first_used,
  MAX(created_at) as last_used
FROM public.messages
WHERE model IS NOT NULL AND created_at >= NOW() - INTERVAL '90 days'
GROUP BY model
ORDER BY total_cost DESC;

-- ----------------------------------------------------------------------------
-- Step 6: Create view for spending over time
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.spending_over_time AS
SELECT
  DATE(created_at) as date,
  (
    SELECT SUM(amount) FILTER (WHERE type='purchase') FROM public.transactions
  ) as purchased_amount,
  (
    SELECT SUM(amount) FILTER (WHERE type='ai_charge') FROM public.transactions
  ) as ai_charge_amount,
  (
    SELECT COUNT(*) FILTER (WHERE type='ai_charge') FROM public.transactions
  ) as ai_message_count,
  (
    SELECT COUNT(*) FILTER (WHERE type='gift_redeem') FROM public.transactions
  ) as gifts_redeemed
FROM public.transactions
WHERE created_at >= NOW() - INTERVAL '90 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- ----------------------------------------------------------------------------
-- Step 7: Create view for group chat analytics
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.group_analytics AS
SELECT
  c.id as conversation_id,
  c.title as group_name,
  c.group_pot_balance,
  c.created_at as created_at,
  (
    SELECT COUNT(*) FROM public.messages WHERE conversation_id=c.id
  ) as total_messages,
  (
    SELECT COUNT(*) FROM public.group_members WHERE conversation_id=c.id
  ) as member_count,
  (
    SELECT COALESCE(SUM(amount), 0) FROM public.group_pot_contributions
    WHERE conversation_id=c.id
  ) as total_contributed
FROM public.conversations c
WHERE c.is_group = true
ORDER BY c.created_at DESC;

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Verify tables were created: SELECT * FROM information_schema.tables WHERE table_name IN ('transactions', 'user_analytics');
-- 2. Verify columns were added: SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'messages' AND column_name IN ('cost', 'model', 'input_tokens', 'output_tokens');
-- 3. Test views: SELECT * FROM public.user_analytics WHERE user_id = 'your-user-id';
-- ============================================================================

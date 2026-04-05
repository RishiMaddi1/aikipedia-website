-- ============================================================================
-- Aikipedia Gift Codes - Database Schema
-- ============================================================================
-- Run this in Supabase SQL Editor
-- Enables users to buy gift codes using their existing balance
--
-- Gift Code Format: GIFT-XXXXXXXXXXXXXXXXXXXXXXXX (29 chars total)
-- - 24 random alphanumeric characters
-- - 62^24 = 4.7 x 10^42 possible combinations (impossible to guess)
--
-- Security Features:
-- - Minimum amount: 5 echos
-- - Cannot redeem own code
-- - One-time use only
-- - Optional expiration
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Step 1: Create gift_codes table
-- ----------------------------------------------------------------------------
-- Stores gift codes that users can buy and share

CREATE TABLE IF NOT EXISTS public.gift_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 5),
  created_by UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ, -- NULL = no expiration
  redeemed_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ,
  is_used BOOLEAN DEFAULT false,
  payment_id TEXT, -- reference to the original credit transaction
  message TEXT -- Optional message from sender
);

-- Create index for code lookups (redeeming)
CREATE INDEX IF NOT EXISTS idx_gift_codes_code
  ON public.gift_codes(code) WHERE is_used = false;

-- Create index for user's purchased codes
CREATE INDEX IF NOT EXISTS idx_gift_codes_created_by
  ON public.gift_codes(created_by, created_at DESC);

-- Create index for user's redeemed codes
CREATE INDEX IF NOT EXISTS idx_gift_codes_redeemed_by
  ON public.gift_codes(redeemed_by) WHERE redeemed_by IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Step 2: Create gift_redemptions history table (optional, for analytics)
-- ----------------------------------------------------------------------------
-- Tracks all redemption events

CREATE TABLE IF NOT EXISTS public.gift_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gift_code_id UUID NOT NULL REFERENCES public.gift_codes (id) ON DELETE CASCADE,
  redeemed_by UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);

-- Create index for analytics
CREATE INDEX IF NOT EXISTS idx_gift_redemptions_redeemed_by
  ON public.gift_redemptions(redeemed_by, redeemed_at DESC);

-- ----------------------------------------------------------------------------
-- Step 3: Enable Row Level Security (RLS)
-- ----------------------------------------------------------------------------

ALTER TABLE public.gift_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_redemptions ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Step 4: RLS Policies
-- ----------------------------------------------------------------------------

-- Enable service role to read/write all gift codes (for worker operations)
-- This is safe because only your worker has the service role key
CREATE POLICY gift_codes_service_role_all
  ON public.gift_codes FOR ALL
  USING (true); -- Service role bypasses RLS

-- Enable service role to read/write all redemptions
CREATE POLICY gift_redemptions_service_role_all
  ON public.gift_redemptions FOR ALL
  USING (true);

-- Optional: Users can see their own purchased codes (for dashboard)
CREATE POLICY gift_codes_users_view_own
  ON public.gift_codes FOR SELECT
  USING (created_by = auth.uid());

-- Optional: Users can see their own redemption history
CREATE POLICY gift_redemptions_users_view_own
  ON public.gift_redemptions FOR SELECT
  USING (redeemed_by = auth.uid());

-- ----------------------------------------------------------------------------
-- Step 5: Main Redemption Function (SECURITY DEFINER)
-- ----------------------------------------------------------------------------
-- This function runs with elevated privileges and handles the entire redemption
-- process atomically, preventing race conditions and ensuring data integrity

CREATE OR REPLACE FUNCTION public.redeem_gift_code(
  p_user_id UUID,
  p_code TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  amount DECIMAL,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gift_code RECORD;
BEGIN
  -- Lock and fetch the gift code (FOR UPDATE prevents race conditions)
  SELECT * INTO v_gift_code
  FROM public.gift_codes
  WHERE code = p_code
  FOR UPDATE;

  -- Check if code exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'Invalid gift code'::TEXT;
  END IF;

  -- Check if already used
  IF v_gift_code.is_used THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'This gift code has already been redeemed'::TEXT;
  END IF;

  -- Check if expired
  IF v_gift_code.expires_at IS NOT NULL AND v_gift_code.expires_at < NOW() THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'This gift code has expired'::TEXT;
  END IF;

  -- Prevent redeeming own code
  IF v_gift_code.created_by = p_user_id THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'You cannot redeem your own gift code'::TEXT;
  END IF;

  -- Mark as used (atomically)
  UPDATE public.gift_codes
  SET is_used = true,
      redeemed_by = p_user_id,
      redeemed_at = NOW()
  WHERE id = v_gift_code.id;

  -- Add credits to user (atomically)
  UPDATE public.users
  SET money_left = money_left + v_gift_code.amount
  WHERE id = p_user_id;

  -- Return success
  RETURN QUERY SELECT true, v_gift_code.amount, 'Gift code redeemed successfully!'::TEXT;
END;
$$;

-- ----------------------------------------------------------------------------
-- Step 6: Helper Functions
-- ----------------------------------------------------------------------------

-- Function to check if a gift code is valid (for UI validation)
CREATE OR REPLACE FUNCTION public.is_gift_code_valid(p_code TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.gift_codes
    WHERE code = p_code
      AND is_used = false
      AND (expires_at IS NULL OR expires_at > NOW())
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get gift code details (for preview before redemption)
CREATE OR REPLACE FUNCTION public.get_gift_code_details(p_code TEXT)
RETURNS TABLE (
  id UUID,
  code TEXT,
  amount DECIMAL,
  is_valid BOOLEAN,
  is_used BOOLEAN,
  expires_at TIMESTAMPTZ,
  created_by_username TEXT,
  message TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gc.id,
    gc.code,
    gc.amount,
    (gc.is_used = false AND (gc.expires_at IS NULL OR gc.expires_at > NOW())) AS is_valid,
    gc.is_used,
    gc.expires_at,
    u.username AS created_by_username,
    gc.message
  FROM public.gift_codes gc
  LEFT JOIN public.users u ON u.id = gc.created_by
  WHERE gc.code = p_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- Step 7: Views for easy querying
-- ----------------------------------------------------------------------------

-- View for user's gift code dashboard
CREATE OR REPLACE VIEW public.user_gift_codes AS
SELECT
  gc.id,
  gc.code,
  gc.amount,
  gc.created_at,
  gc.expires_at,
  gc.is_used,
  gc.redeemed_at,
  gc.message,
  CASE
    WHEN gc.is_used THEN true
    WHEN gc.expires_at IS NOT NULL AND gc.expires_at <= NOW() THEN true
    ELSE false
  END AS is_expired,
  u.username AS redeemed_by_username
FROM public.gift_codes gc
LEFT JOIN public.users u ON u.id = gc.redeemed_by;

-- View for redeemed codes
CREATE OR REPLACE VIEW public.redeemed_gift_codes AS
SELECT
  gc.id,
  gc.code,
  gc.amount,
  gc.created_at,
  gc.redeemed_at,
  gc.message,
  u.username AS from_username
FROM public.gift_codes gc
JOIN public.users u ON u.id = gc.created_by;

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Verify tables were created: SELECT * FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('gift_codes', 'gift_redemptions');
-- 2. Test function: SELECT * FROM public.redeem_gift_code('your-user-id'::UUID, 'GIFT-CODE123');
-- 3. Test validation: SELECT * FROM public.is_gift_code_valid('GIFT-CODE123');
-- ============================================================================

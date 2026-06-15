-- Tokenised invite system for adding co-gardeners to a home.
--
-- UX review 2026-06-15 item 5.1. Before this migration, the only way to
-- add a co-gardener was for the owner to copy the home UUID and message
-- it via WhatsApp / SMS; the invitee then pasted it into Join Home. This
-- table is the backing store for "Invite by email", a hosted-OAuth-shaped
-- flow where the invitee clicks a link in their inbox instead.
--
-- Single-use tokens, time-limited (7 days default), email-pinned. The
-- create-home-invite edge function inserts a row + sends the email; the
-- redeem-home-invite edge function validates the token + writes into
-- home_members + flips used_at.
--
-- Security model:
--   * Token IS the PK — gen_random_uuid() gives 128 bits of entropy
--     (not bruteforceable). The token never appears in any SELECT
--     anywhere except the redemption path (service-role only).
--   * RLS lets owners SELECT / INSERT for their own homes; nobody can
--     SELECT by guessing a token (RLS doesn't include a permissive
--     by-token policy). The redeem path uses the service-role key.
--   * invitee_email is stored lower-cased so the email-pinning check at
--     redemption is case-insensitive.
--
-- Data API note (Supabase Oct-2026 deadline): explicit grants below so
-- PostgREST exposes the table to authenticated callers.

CREATE TABLE IF NOT EXISTS public.home_invite_tokens (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')) DEFAULT 'editor',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  invitee_email text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT home_invite_tokens_email_lowercase
    CHECK (invitee_email = lower(invitee_email))
);

CREATE INDEX IF NOT EXISTS home_invite_tokens_home_id_idx
  ON public.home_invite_tokens (home_id);

CREATE INDEX IF NOT EXISTS home_invite_tokens_email_idx
  ON public.home_invite_tokens (invitee_email);

CREATE INDEX IF NOT EXISTS home_invite_tokens_created_by_idx
  ON public.home_invite_tokens (created_by);

ALTER TABLE public.home_invite_tokens ENABLE ROW LEVEL SECURITY;

-- Owners can read their own home's invites — drives the "Pending invites"
-- list inside HomeManagement so they can copy / cancel a link if needed.
DROP POLICY IF EXISTS "Owners read own home invites" ON public.home_invite_tokens;
CREATE POLICY "Owners read own home invites"
  ON public.home_invite_tokens
  FOR SELECT
  TO authenticated
  USING (
    home_id IN (
      SELECT home_id FROM public.home_members
      WHERE user_id = (SELECT auth.uid()) AND role = 'owner'
    )
  );

-- Owners can insert invites for their own home; the edge function
-- (running as service role) also writes here directly so the policy is
-- a belt-and-braces for any client-side direct insert path we add later.
DROP POLICY IF EXISTS "Owners create home invites" ON public.home_invite_tokens;
CREATE POLICY "Owners create home invites"
  ON public.home_invite_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND home_id IN (
      SELECT home_id FROM public.home_members
      WHERE user_id = (SELECT auth.uid()) AND role = 'owner'
    )
  );

-- Owners can delete their own pending invites (cancel before redemption).
DROP POLICY IF EXISTS "Owners cancel own home invites" ON public.home_invite_tokens;
CREATE POLICY "Owners cancel own home invites"
  ON public.home_invite_tokens
  FOR DELETE
  TO authenticated
  USING (
    home_id IN (
      SELECT home_id FROM public.home_members
      WHERE user_id = (SELECT auth.uid()) AND role = 'owner'
    )
  );

-- NO RLS read-by-token policy. The redemption flow uses the service role
-- inside redeem-home-invite. This prevents anonymous probing of
-- /home_invite_tokens?token=eq.<guess> from leaking pending invites.

GRANT SELECT, INSERT, DELETE ON TABLE public.home_invite_tokens TO authenticated;

COMMENT ON TABLE public.home_invite_tokens IS
  'Per-email single-use invite tokens used to add a co-gardener to a home. Inserted by the create-home-invite edge function; redeemed by redeem-home-invite. RLS restricts SELECT / INSERT / DELETE to the home''s owner. Token redemption uses the service role.';

COMMENT ON COLUMN public.home_invite_tokens.invitee_email IS
  'Lower-cased email of the invitee. Pinned at redemption — auth.users.email must match (case-insensitive). Constraint enforces lower-case at insert.';

COMMENT ON COLUMN public.home_invite_tokens.used_at IS
  'Marked by redeem-home-invite when the token is consumed. Rows with used_at IS NOT NULL are dead and cannot be redeemed again.';

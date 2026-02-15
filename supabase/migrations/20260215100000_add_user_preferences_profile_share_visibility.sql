ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS profile_share_pvp_public BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS profile_share_pve_public BOOLEAN DEFAULT FALSE NOT NULL;

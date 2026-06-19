-- Add school name to classes
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query) before deploying the code change.
-- Nullable so existing rows are unaffected.
alter table public.classes
  add column if not exists school text;

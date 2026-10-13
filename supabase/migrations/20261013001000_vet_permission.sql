-- Simpler onboarding. New clients only give what the next step needs: their pup and a time for the
-- meet & greet (plus phone and address, asked while booking it). Home access, an emergency contact
-- and this permission are asked the first time they book a visit we make without them, and kept on
-- their profile so they're never asked twice.

alter table public.profiles add column vet_care_ok boolean;

comment on column public.profiles.vet_care_ok is
  'If their pup needs urgent care and nobody can be reached, may we take them to a vet? Null = not asked yet.';

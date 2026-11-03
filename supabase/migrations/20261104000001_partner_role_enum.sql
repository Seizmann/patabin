-- patabin_partner (Investor): read-only role.
-- Enum value must be added in its own migration: the new value cannot be
-- used in the same transaction it is added in.
alter type public.user_role add value 'patabin_partner';

-- patabin_demo_admin: public-facing demo account.
--
-- The enum value must be added in its own migration: Postgres cannot use a
-- newly added enum value in expressions within the same transaction. The
-- can_write()/assert_writeable() guards that reference it live in
-- 20261117000025_demo_admin_guards.sql.

alter type public.user_role add value 'patabin_demo_admin';

-- assert_writeable(): the zero-arg overload collides with
-- assert_writeable(p_perm text default null), making every zero-arg call
-- ambiguous ("function is not unique") and breaking RPCs that still call it
-- without arguments (packing, personal use, deletes...).
-- The text-default version already carries the full guard set
-- (active user, password gate, partner/demo read-only, permission), so the
-- zero-arg overload is dropped and all callers resolve to it.

drop function if exists public.assert_writeable();

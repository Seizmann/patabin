-- Demo admin account for public visitors (README credentials).
-- Password: demo1234 -- set directly via pgcrypto so it bypasses the 10-char
-- temp-password rule of the manage-users edge function. must_change_password
-- is false so the demo account lands straight in the app.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
select
  '00000000-0000-0000-0000-000000000000',
  'd3bd0000-1111-4222-8333-444455556666',
  'authenticated', 'authenticated', 'demo@patabin.rexio.pro',
  crypt('demo1234', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Demo Admin"}'::jsonb
where not exists (select 1 from auth.users where email = 'demo@patabin.rexio.pro');

insert into auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.email = 'demo@patabin.rexio.pro'
on conflict do nothing;

insert into public.profiles (id, role, display_name, must_change_password, is_active)
select u.id, 'patabin_demo_admin', 'Demo Admin', false, true
from auth.users u
where u.email = 'demo@patabin.rexio.pro'
on conflict (id) do update
  set role = 'patabin_demo_admin',
      display_name = 'Demo Admin',
      must_change_password = false,
      is_active = true;

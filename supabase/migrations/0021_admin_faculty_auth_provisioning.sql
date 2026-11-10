-- Migration 0021 (Updated): Admin Faculty Auth Account Provisioning
-- Provides secure stored procedure (SECURITY DEFINER) for administrators to provision,
-- reset password, and manage Supabase Auth accounts for faculty members.
-- Compatible with GoTrue strict string scanning (zero NULLs on token columns, auth.identities linking).

-- 1. Helper function for admin check
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- 2. Function to provision or update faculty auth login
create or replace function public.admin_provision_faculty_user(
  p_faculty_id uuid,
  p_email text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_faculty record;
  v_user_id uuid;
  v_encrypted_pw text;
begin
  -- Enforce admin privilege
  if not public.is_admin() then
    raise exception 'Permission denied: Only administrators can provision faculty accounts.';
  end if;

  -- Verify faculty member exists
  select id, name, email into v_faculty
  from public.faculty
  where id = p_faculty_id;

  if not found then
    raise exception 'Faculty member not found with ID %', p_faculty_id;
  end if;

  -- Clean inputs
  p_email := lower(trim(p_email));
  if length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters long.';
  end if;

  -- Generate Bcrypt hash for password
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

  -- Check if user already exists in auth.users by email
  select id into v_user_id
  from auth.users
  where email = p_email;

  if v_user_id is not null then
    -- User exists: update password, metadata, and ensure token columns are empty strings (never NULL)
    update auth.users
    set
      encrypted_password = v_encrypted_pw,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'name', v_faculty.name,
        'role', 'faculty',
        'faculty_id', v_faculty.id
      ),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now(),
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      email_change_token_current = coalesce(email_change_token_current, ''),
      email_change = coalesce(email_change, ''),
      phone_change = coalesce(phone_change, ''),
      phone_change_token = coalesce(phone_change_token, ''),
      reauthentication_token = coalesce(reauthentication_token, '')
    where id = v_user_id;
  else
    -- User does not exist: generate a new user_id and insert directly into auth.users
    -- All token/change string fields MUST be non-null empty strings ('') for GoTrue scanner
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change_token_current,
      email_change,
      phone_change,
      phone_change_token,
      reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      p_email,
      v_encrypted_pw,
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object(
        'name', v_faculty.name,
        'role', 'faculty',
        'faculty_id', v_faculty.id
      ),
      now(),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    );
  end if;

  -- Upsert matching identity in auth.identities (GoTrue requires this for email/password auth)
  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', p_email
    ),
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  )
  on conflict (provider, provider_id) do update
  set
    identity_data = jsonb_build_object(
      'sub', v_user_id::text,
      'email', p_email
    ),
    updated_at = now();

  -- Ensure faculty email matches the user's login email
  update public.faculty
  set email = p_email
  where id = v_faculty.id;

  -- Link or upsert profiles record
  insert into public.profiles (user_id, role, faculty_id, section_id, created_at)
  values (v_user_id, 'faculty', v_faculty.id, null, now())
  on conflict (user_id) do update
  set
    role = 'faculty',
    faculty_id = v_faculty.id;

  return jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'faculty_id', v_faculty.id,
    'email', p_email,
    'message', 'Faculty authentication account provisioned successfully.'
  );
end;
$$;

-- 3. Function to query faculty auth status (check which faculty have active logins)
create or replace function public.admin_get_faculty_auth_status()
returns table (
  faculty_id uuid,
  user_id uuid,
  email text,
  has_auth boolean,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Permission denied: Only administrators can view faculty credentials.';
  end if;

  return query
  select
    f.id as faculty_id,
    p.user_id as user_id,
    coalesce(u.email, f.email) as email,
    (p.user_id is not null and u.id is not null) as has_auth,
    u.last_sign_in_at
  from public.faculty f
  left join public.profiles p on p.faculty_id = f.id and p.role = 'faculty'
  left join auth.users u on u.id = p.user_id
  order by f.name asc;
end;
$$;

-- 4. One-time sanitizer function to repair any existing users created with NULL tokens
create or replace function public.admin_repair_auth_users()
returns void
language sql
security definer
set search_path = auth
as $$
  update auth.users
  set
    confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    email_change = coalesce(email_change, ''),
    phone_change = coalesce(phone_change, ''),
    phone_change_token = coalesce(phone_change_token, ''),
    reauthentication_token = coalesce(reauthentication_token, '')
  where
    confirmation_token is null
    or recovery_token is null
    or email_change_token_new is null
    or email_change_token_current is null
    or email_change is null
    or phone_change is null
    or phone_change_token is null
    or reauthentication_token is null;

  -- Also ensure auth.identities entries exist for all email users
  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email),
    'email',
    u.id::text,
    now(),
    now(),
    now()
  from auth.users u
  where not exists (
    select 1 from auth.identities i
    where i.provider = 'email' and i.provider_id = u.id::text
  );
$$;

-- Run repair immediately when migration runs
select public.admin_repair_auth_users();

-- Grants
grant execute on function public.admin_provision_faculty_user(uuid, text, text) to authenticated;
grant execute on function public.admin_get_faculty_auth_status() to authenticated;
grant execute on function public.admin_repair_auth_users() to authenticated;

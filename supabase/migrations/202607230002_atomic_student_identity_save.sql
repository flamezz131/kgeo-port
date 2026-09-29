-- K-GEO atomic student identity save.
-- Review this migration after 202607230001 and before deploying the matching
-- application code. Do not use it as a substitute for server-side validation.

begin;

-- SECURITY: this is the only browser-callable operation that changes a
-- canonical profile name after this migration. It derives the owner from the
-- authenticated JWT, authorizes that owner against trusted Auth and profile
-- state, and writes both identity tables in the caller's transaction.
create function public.save_student_identity(
  p_full_name text,
  p_roll_number text,
  p_personal_email text,
  p_mobile_number text,
  p_college text,
  p_course text,
  p_department text,
  p_current_year integer,
  p_current_semester integer,
  p_graduation_year integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requester_id uuid;
  normalized_full_name text;
  updated_profile_id uuid;
  failure_constraint text;
begin
  requester_id := (select auth.uid());

  if requester_id is null then
    raise exception using
      errcode = '42501',
      message = 'An active verified student profile is required';
  end if;

  if p_full_name is null then
    raise exception using
      errcode = '22023',
      message = 'A valid full name is required';
  end if;

  normalized_full_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_full_name),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if pg_catalog.char_length(normalized_full_name) not between 1 and 150 then
    raise exception using
      errcode = '22023',
      message = 'A valid full name is required';
  end if;

  begin
    update public.profiles as profile
    set full_name = normalized_full_name
    where profile.id = requester_id
      and profile.role = 'student'::public.user_role
      and profile.is_active is true
      and exists (
        select 1
        from auth.users as auth_user
        where auth_user.id = requester_id
          and auth_user.email_confirmed_at is not null
      )
    returning profile.id
    into updated_profile_id;

    if updated_profile_id is null then
      raise exception using
        errcode = '42501',
        message = 'An active verified student profile is required';
    end if;

    insert into public.student_profiles (
      student_id,
      roll_number,
      personal_email,
      mobile_number,
      college,
      course,
      department,
      current_year,
      current_semester,
      graduation_year
    )
    values (
      requester_id,
      p_roll_number,
      p_personal_email,
      p_mobile_number,
      p_college,
      p_course,
      p_department,
      p_current_year,
      p_current_semester,
      p_graduation_year
    )
    on conflict (student_id) do update
    set roll_number = excluded.roll_number,
        personal_email = excluded.personal_email,
        mobile_number = excluded.mobile_number,
        college = excluded.college,
        course = excluded.course,
        department = excluded.department,
        current_year = excluded.current_year,
        current_semester = excluded.current_semester,
        graduation_year = excluded.graduation_year;
  exception
    when unique_violation then
      get stacked diagnostics
        failure_constraint = constraint_name;

      if failure_constraint =
        'student_profiles_college_roll_number_key' then
        raise exception using
          errcode = '23505',
          message = 'The college and roll-number combination is unavailable',
          constraint = 'student_profiles_college_roll_number_key';
      end if;

      raise exception using
        errcode = '40001',
        message = 'The student identity changed concurrently';
    when check_violation or not_null_violation then
      raise exception using
        errcode = '22023',
        message = 'The student identity values are invalid';
    when insufficient_privilege then
      raise exception using
        errcode = '42501',
        message = 'An active verified student profile is required';
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'The student identity could not be saved';
  end;
end;
$function$;

comment on function public.save_student_identity(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer
) is
  'Atomically saves the authenticated active verified student canonical name and approved detailed identity fields without returning student data.';

revoke all on function public.save_student_identity(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.save_student_identity(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer
) to authenticated;

-- Prevent browser clients from bypassing the atomic identity RPC with separate
-- table mutations. Existing own-row RLS policies remain defense in depth.
revoke update (full_name) on table public.profiles from authenticated;

revoke insert (
  roll_number,
  personal_email,
  mobile_number,
  college,
  course,
  department,
  current_year,
  current_semester,
  graduation_year
) on table public.student_profiles from authenticated;

revoke update (
  roll_number,
  personal_email,
  mobile_number,
  college,
  course,
  department,
  current_year,
  current_semester,
  graduation_year
) on table public.student_profiles from authenticated;

-- Academic-field UPDATE grants are intentionally unchanged because later
-- profile sections still save those approved columns independently.

commit;

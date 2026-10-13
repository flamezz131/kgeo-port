-- MIGRATION 202608180001
-- Align record_consultation_outcome ACL by revoking service_role.

begin;
set local search_path = '';

do $$
declare
  v_proc_oid pg_catalog.oid;
  v_body_hash text;
  v_grants text[];
begin
  -- 1. Exact once verification
  select oid
  into strict v_proc_oid
  from pg_catalog.pg_proc
  where proname = 'record_consultation_outcome'
    and pronamespace = 'public'::pg_catalog.regnamespace;

  -- 2. Verify identity arguments
  if pg_catalog.pg_get_function_identity_arguments(v_proc_oid) <> 'p_consultation_id uuid, p_outcome text' then
    raise exception 'Unexpected identity arguments';
  end if;

  -- 3. Verify return type exact
  if (select prorettype from pg_catalog.pg_proc where oid = v_proc_oid) <> 'public.consultation_status'::pg_catalog.regtype::oid then
    raise exception 'Unexpected return type';
  end if;

  if (select proretset from pg_catalog.pg_proc where oid = v_proc_oid) is true then
    raise exception 'Unexpected set returning function';
  end if;

  -- 4. Verify postgres owner
  if (select pg_catalog.pg_get_userbyid(proowner) from pg_catalog.pg_proc where oid = v_proc_oid) <> 'postgres' then
    raise exception 'Unexpected owner';
  end if;

  -- 5. Verify language
  if (select prolang from pg_catalog.pg_proc where oid = v_proc_oid) <> (select oid from pg_catalog.pg_language where lanname = 'plpgsql') then
    raise exception 'Unexpected language';
  end if;

  -- 6. Verify volatility
  if (select provolatile from pg_catalog.pg_proc where oid = v_proc_oid) <> 'v' then
    raise exception 'Unexpected volatility';
  end if;

  -- 7. Verify SECURITY DEFINER
  if (select prosecdef from pg_catalog.pg_proc where oid = v_proc_oid) is false then
    raise exception 'Not SECURITY DEFINER';
  end if;

  -- 8. Verify safe empty search_path
  if not exists (
    select 1
    from pg_catalog.pg_proc
    where oid = v_proc_oid
      and proconfig in (array['search_path='], array['search_path=""'])
  ) then
    raise exception 'Unexpected search_path';
  end if;

  -- 9. Verify body SHA (Canonical Normalization)
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.regexp_replace(prosrc, '\r\n?', pg_catalog.chr(10), 'g'), 'UTF8')), 'hex')
  into v_body_hash
  from pg_catalog.pg_proc
  where oid = v_proc_oid;
  
  if v_body_hash <> '99033348ce71a1261fcd9f0f674824687758d175da8f0204f7240790a6e67c25' then
    raise exception 'Unexpected function body hash';
  end if;

  -- 10. Verify exact pre-grants (fail-closed against PUBLIC)
  select coalesce(array_agg(
    pg_catalog.format(
      '%s:%s',
      coalesce(role_record.rolname, 'PUBLIC'),
      privilege.is_grantable
    ) order by coalesce(role_record.rolname, 'PUBLIC'), privilege.is_grantable
  ), array[]::text[])
  into v_grants
  from pg_catalog.pg_proc as procedure
  left join pg_catalog.aclexplode(coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) as privilege on true
  left join pg_catalog.pg_roles as role_record on role_record.oid = privilege.grantee
  where procedure.oid = v_proc_oid
    and privilege.grantee <> procedure.proowner
    and privilege.privilege_type = 'EXECUTE';
    
  if v_grants is distinct from array['authenticated:f', 'service_role:f']::text[] then
    raise exception 'Unexpected pre-revoke grants: %', v_grants;
  end if;

  -- THE MUTATION
  revoke execute on function public.record_consultation_outcome(uuid, text) from service_role;

  -- 11. Verify exact post-grants (fail-closed against PUBLIC)
  select coalesce(array_agg(
    pg_catalog.format(
      '%s:%s',
      coalesce(role_record.rolname, 'PUBLIC'),
      privilege.is_grantable
    ) order by coalesce(role_record.rolname, 'PUBLIC'), privilege.is_grantable
  ), array[]::text[])
  into v_grants
  from pg_catalog.pg_proc as procedure
  left join pg_catalog.aclexplode(coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) as privilege on true
  left join pg_catalog.pg_roles as role_record on role_record.oid = privilege.grantee
  where procedure.oid = v_proc_oid
    and privilege.grantee <> procedure.proowner
    and privilege.privilege_type = 'EXECUTE';

  if v_grants is distinct from array['authenticated:f']::text[] then
    raise exception 'Unexpected post-revoke grants: %', v_grants;
  end if;

end;
$$;

commit;

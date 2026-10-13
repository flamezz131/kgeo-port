-- K-GEO Phase E1.4.1 counselor applications workspace read foundation.
-- Review this migration before applying it. Apply it only after
-- 202608010001_university_application_documents_foundation.sql.
--
-- This migration is additive and read-only. It creates two bounded counselor
-- RPCs and changes no table, row, enum, index, trigger, policy, or application
-- mutation contract.

begin;

-- SECURITY: this is the only cross-student list boundary for the future
-- counselor applications workspace. It derives the caller from auth.uid(),
-- reauthorizes an active verified counselor, uses static allowlisted filters
-- and ordering, and returns only approved student/application identity plus an
-- aggregate available-document count.
create function public.list_counselor_university_application_workspace(
  p_search text default null,
  p_status text default null,
  p_country_code text default null,
  p_degree_level text default null,
  p_intake_term text default null,
  p_intake_year integer default null,
  p_primary_filter text default 'all',
  p_archive_filter text default 'active',
  p_deadline_filter text default 'all',
  p_sort text default 'last_changed_desc',
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  application_id uuid,
  student_id uuid,
  student_full_name text,
  college_email text,
  roll_number text,
  university_name text,
  programme_name text,
  country_code text,
  degree_level public.university_application_degree_level,
  intake_term public.university_application_intake_term,
  intake_year integer,
  current_status public.university_application_status,
  application_reference text,
  submission_deadline date,
  submitted_at timestamptz,
  is_primary boolean,
  is_archived boolean,
  last_changed_at timestamptz,
  available_document_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  normalized_search text;
  normalized_status text;
  normalized_country_code text;
  normalized_degree_level text;
  normalized_intake_term text;
  normalized_primary_filter text;
  normalized_archive_filter text;
  normalized_deadline_filter text;
  normalized_sort text;
  business_date date;
  page_offset bigint;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Applications are temporarily unavailable.';
  end if;

  if p_search ~ '[[:cntrl:]]'
    or exists (
      select 1
      from pg_catalog.generate_series(128, 159) as codepoint(value)
      where pg_catalog.strpos(
        p_search,
        pg_catalog.chr(codepoint.value)
      ) > 0
    )
    or exists (
      select 1
      from pg_catalog.unnest(
        array[
          160, 173, 847, 1564, 5760, 6158,
          8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199,
          8200, 8201, 8202, 8203, 8204, 8205, 8206, 8207,
          8232, 8233, 8234, 8235, 8236, 8237, 8238, 8239,
          8287, 8288, 8289, 8290, 8291, 8292, 8293, 8294,
          8295, 8296, 8297, 8298, 8299, 8300, 8301, 8302,
          8303, 12288, 65279
        ]::integer[]
      ) as codepoint(value)
      where pg_catalog.strpos(
        p_search,
        pg_catalog.chr(codepoint.value)
      ) > 0
    ) then
    raise exception using
      errcode = '22023',
      message = 'Application filters are invalid.';
  end if;

  normalized_search := nullif(
    pg_catalog.translate(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(p_search),
        ' +',
        ' ',
        'g'
      ),
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'abcdefghijklmnopqrstuvwxyz'
    ),
    ''
  );
  normalized_status := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_status)),
    ''
  );
  normalized_country_code := nullif(
    pg_catalog.upper(pg_catalog.btrim(p_country_code)),
    ''
  );
  normalized_degree_level := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_degree_level)),
    ''
  );
  normalized_intake_term := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_intake_term)),
    ''
  );
  normalized_primary_filter := coalesce(
    nullif(pg_catalog.lower(pg_catalog.btrim(p_primary_filter)), ''),
    'all'
  );
  normalized_archive_filter := coalesce(
    nullif(pg_catalog.lower(pg_catalog.btrim(p_archive_filter)), ''),
    'active'
  );
  normalized_deadline_filter := coalesce(
    nullif(pg_catalog.lower(pg_catalog.btrim(p_deadline_filter)), ''),
    'all'
  );
  normalized_sort := coalesce(
    nullif(pg_catalog.lower(pg_catalog.btrim(p_sort)), ''),
    'last_changed_desc'
  );

  if pg_catalog.char_length(normalized_search) > 100
    or (
      normalized_status is not null
      and normalized_status not in (
        'planning',
        'documents_collecting',
        'application_preparing',
        'ready_to_submit',
        'submitted',
        'under_university_review',
        'additional_information_requested',
        'decision_received',
        'withdrawn',
        'closed'
      )
    )
    or (
      normalized_country_code is not null
      and normalized_country_code !~ '^[A-Z]{2}$'
    )
    or (
      normalized_degree_level is not null
      and normalized_degree_level not in (
        'bachelors',
        'masters',
        'postgraduate_diploma',
        'doctorate',
        'other'
      )
    )
    or (
      normalized_intake_term is not null
      and normalized_intake_term not in (
        'spring',
        'summer',
        'fall',
        'winter',
        'rolling',
        'other'
      )
    )
    or (
      p_intake_year is not null
      and p_intake_year not between 2020 and 2100
    )
    or normalized_primary_filter not in (
      'all',
      'primary',
      'non_primary'
    )
    or normalized_archive_filter not in (
      'active',
      'archived',
      'all'
    )
    or normalized_deadline_filter not in (
      'all',
      'overdue',
      'due_30_days',
      'no_deadline'
    )
    or normalized_sort not in (
      'last_changed_desc',
      'deadline_asc',
      'deadline_desc',
      'student_name_asc',
      'university_name_asc',
      'intake_year_desc'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Application filters are invalid.';
  end if;

  if p_page is null
    or p_page not between 1 and 100000
    or p_page_size is null
    or p_page_size not between 1 and 25 then
    raise exception using
      errcode = '22023',
      message = 'The requested applications page is invalid.';
  end if;

  business_date := (
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata'
  )::date;
  page_offset := (p_page::bigint - 1) * p_page_size::bigint;

  return query
  with available_document_counts as (
    select
      document.application_id,
      pg_catalog.count(*)::bigint as document_count
    from public.student_university_application_documents as document
    where document.status =
      'available'::public.university_application_document_status
    group by document.application_id
  ),
  workspace_base as (
    select
      application.id as workspace_application_id,
      application.student_id as workspace_student_id,
      student_account.full_name as workspace_student_full_name,
      student_account.college_email as workspace_college_email,
      student_profile.roll_number as workspace_roll_number,
      application.university_name as workspace_university_name,
      application.programme_name as workspace_programme_name,
      application.country_code as workspace_country_code,
      application.degree_level as workspace_degree_level,
      application.intake_term as workspace_intake_term,
      application.intake_year::integer as workspace_intake_year,
      application.current_status as workspace_current_status,
      application.application_reference as workspace_application_reference,
      application.submission_deadline as workspace_submission_deadline,
      application.submitted_at as workspace_submitted_at,
      application.is_primary as workspace_is_primary,
      application.is_archived as workspace_is_archived,
      application.last_changed_at as workspace_last_changed_at,
      coalesce(document_count.document_count, 0::bigint)
        as workspace_available_document_count,
      pg_catalog.translate(
        coalesce(
          nullif(pg_catalog.btrim(student_account.full_name), ''),
          student_account.college_email
        ),
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        'abcdefghijklmnopqrstuvwxyz'
      ) collate pg_catalog."C" as workspace_student_sort_name
    from public.student_university_applications as application
    inner join public.profiles as student_account
      on student_account.id = application.student_id
      and student_account.role = 'student'::public.user_role
    left join public.student_profiles as student_profile
      on student_profile.student_id = student_account.id
    left join available_document_counts as document_count
      on document_count.application_id = application.id
  ),
  filtered_workspace as (
    select workspace.*
    from workspace_base as workspace
    where (
      normalized_search is null
      or pg_catalog.strpos(
        pg_catalog.translate(
          coalesce(workspace.workspace_student_full_name, ''),
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          'abcdefghijklmnopqrstuvwxyz'
        ),
        normalized_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.translate(
          workspace.workspace_college_email,
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          'abcdefghijklmnopqrstuvwxyz'
        ),
        normalized_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.translate(
          coalesce(workspace.workspace_roll_number, ''),
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          'abcdefghijklmnopqrstuvwxyz'
        ),
        normalized_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.translate(
          workspace.workspace_university_name,
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          'abcdefghijklmnopqrstuvwxyz'
        ),
        normalized_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.translate(
          workspace.workspace_programme_name,
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          'abcdefghijklmnopqrstuvwxyz'
        ),
        normalized_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.translate(
          coalesce(workspace.workspace_application_reference, ''),
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          'abcdefghijklmnopqrstuvwxyz'
        ),
        normalized_search
      ) > 0
    )
      and (
        normalized_status is null
        or workspace.workspace_current_status::text = normalized_status
      )
      and (
        normalized_country_code is null
        or workspace.workspace_country_code = normalized_country_code
      )
      and (
        normalized_degree_level is null
        or workspace.workspace_degree_level::text = normalized_degree_level
      )
      and (
        normalized_intake_term is null
        or workspace.workspace_intake_term::text = normalized_intake_term
      )
      and (
        p_intake_year is null
        or workspace.workspace_intake_year = p_intake_year
      )
      and (
        normalized_primary_filter = 'all'
        or (
          normalized_primary_filter = 'primary'
          and workspace.workspace_is_primary is true
        )
        or (
          normalized_primary_filter = 'non_primary'
          and workspace.workspace_is_primary is false
        )
      )
      and (
        normalized_archive_filter = 'all'
        or (
          normalized_archive_filter = 'active'
          and workspace.workspace_is_archived is false
        )
        or (
          normalized_archive_filter = 'archived'
          and workspace.workspace_is_archived is true
        )
      )
      and (
        normalized_deadline_filter = 'all'
        or (
          normalized_deadline_filter = 'overdue'
          and workspace.workspace_submission_deadline < business_date
        )
        or (
          normalized_deadline_filter = 'due_30_days'
          and workspace.workspace_submission_deadline between
            business_date and business_date + 30
        )
        or (
          normalized_deadline_filter = 'no_deadline'
          and workspace.workspace_submission_deadline is null
        )
      )
  ),
  filtered_total as (
    select pg_catalog.count(*)::bigint as filtered_count
    from filtered_workspace
  ),
  page_rows as (
    select
      workspace.*,
      pg_catalog.row_number() over (
        order by
          case when normalized_sort = 'last_changed_desc' then
            workspace.workspace_last_changed_at
          end desc,
          case
            when normalized_sort in ('deadline_asc', 'deadline_desc')
              and workspace.workspace_submission_deadline is null then 1
            when normalized_sort in ('deadline_asc', 'deadline_desc') then 0
          end asc,
          case when normalized_sort = 'deadline_asc' then
            workspace.workspace_submission_deadline
          end asc,
          case when normalized_sort = 'deadline_desc' then
            workspace.workspace_submission_deadline
          end desc,
          case when normalized_sort = 'student_name_asc' then
            workspace.workspace_student_sort_name collate pg_catalog."C"
          end asc,
          case when normalized_sort = 'university_name_asc' then
            pg_catalog.translate(
              workspace.workspace_university_name,
              'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
              'abcdefghijklmnopqrstuvwxyz'
            )
              collate pg_catalog."C"
          end asc,
          case when normalized_sort = 'intake_year_desc' then
            workspace.workspace_intake_year
          end desc,
          case when normalized_sort in (
            'last_changed_desc',
            'deadline_desc',
            'intake_year_desc'
          ) then workspace.workspace_application_id end desc,
          case when normalized_sort in (
            'deadline_asc',
            'student_name_asc',
            'university_name_asc'
          ) then workspace.workspace_application_id end asc
      ) as result_position
    from filtered_workspace as workspace
    order by
      case when normalized_sort = 'last_changed_desc' then
        workspace.workspace_last_changed_at
      end desc,
      case
        when normalized_sort in ('deadline_asc', 'deadline_desc')
          and workspace.workspace_submission_deadline is null then 1
        when normalized_sort in ('deadline_asc', 'deadline_desc') then 0
      end asc,
      case when normalized_sort = 'deadline_asc' then
        workspace.workspace_submission_deadline
      end asc,
      case when normalized_sort = 'deadline_desc' then
        workspace.workspace_submission_deadline
      end desc,
      case when normalized_sort = 'student_name_asc' then
        workspace.workspace_student_sort_name collate pg_catalog."C"
      end asc,
      case when normalized_sort = 'university_name_asc' then
        pg_catalog.translate(
          workspace.workspace_university_name,
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          'abcdefghijklmnopqrstuvwxyz'
        )
          collate pg_catalog."C"
      end asc,
      case when normalized_sort = 'intake_year_desc' then
        workspace.workspace_intake_year
      end desc,
      case when normalized_sort in (
        'last_changed_desc',
        'deadline_desc',
        'intake_year_desc'
      ) then workspace.workspace_application_id end desc,
      case when normalized_sort in (
        'deadline_asc',
        'student_name_asc',
        'university_name_asc'
      ) then workspace.workspace_application_id end asc
    limit p_page_size
    offset page_offset
  )
  select
    page_row.workspace_application_id,
    page_row.workspace_student_id,
    page_row.workspace_student_full_name,
    page_row.workspace_college_email,
    page_row.workspace_roll_number,
    page_row.workspace_university_name,
    page_row.workspace_programme_name,
    page_row.workspace_country_code,
    page_row.workspace_degree_level,
    page_row.workspace_intake_term,
    page_row.workspace_intake_year,
    page_row.workspace_current_status,
    page_row.workspace_application_reference,
    page_row.workspace_submission_deadline,
    page_row.workspace_submitted_at,
    page_row.workspace_is_primary,
    page_row.workspace_is_archived,
    page_row.workspace_last_changed_at,
    page_row.workspace_available_document_count,
    filtered_total.filtered_count
  from filtered_total
  left join page_rows as page_row
    on true
  order by page_row.result_position asc nulls last;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Applications are temporarily unavailable.';
  when invalid_parameter_value then
    raise;
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Applications are temporarily unavailable.';
end;
$function$;

alter function public.list_counselor_university_application_workspace(
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  integer,
  integer
) owner to postgres;

comment on function public.list_counselor_university_application_workspace(
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  integer,
  integer
) is
  'Returns one bounded privacy-minimized cross-student application page to an active verified counselor. An empty or out-of-range page returns one sentinel row with only total_count populated.';

revoke all on function
  public.list_counselor_university_application_workspace(
    text,
    text,
    text,
    text,
    text,
    integer,
    text,
    text,
    text,
    text,
    integer,
    integer
  ) from public, anon, authenticated;

grant execute on function
  public.list_counselor_university_application_workspace(
    text,
    text,
    text,
    text,
    text,
    integer,
    text,
    text,
    text,
    text,
    integer,
    integer
  ) to authenticated;

-- SECURITY: metrics use the same caller-derived counselor authorization as the
-- list contract and return one aggregate-only row. Operational status and
-- deadline metrics exclude archived applications; no identifier is returned.
create function public.get_counselor_university_application_workspace_metrics()
returns table (
  total_active_applications bigint,
  total_archived_applications bigint,
  students_with_applications bigint,
  primary_applications bigint,
  planning_count bigint,
  documents_collecting_count bigint,
  application_preparing_count bigint,
  ready_to_submit_count bigint,
  submitted_count bigint,
  under_university_review_count bigint,
  additional_information_requested_count bigint,
  decision_received_count bigint,
  withdrawn_count bigint,
  closed_count bigint,
  overdue_deadline_count bigint,
  due_next_30_days_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  business_date date;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Applications are temporarily unavailable.';
  end if;

  business_date := (
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata'
  )::date;

  return query
  with eligible_applications as (
    select application.*
    from public.student_university_applications as application
    inner join public.profiles as student_account
      on student_account.id = application.student_id
      and student_account.role = 'student'::public.user_role
  )
  select
    pg_catalog.count(*) filter (
      where application.is_archived is false
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is true
    )::bigint,
    pg_catalog.count(distinct application.student_id) filter (
      where application.is_archived is false
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.is_primary is true
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'planning'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'documents_collecting'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'application_preparing'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'ready_to_submit'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'submitted'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'under_university_review'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'additional_information_requested'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'decision_received'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'withdrawn'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'closed'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.submission_deadline < business_date
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.submission_deadline between
          business_date and business_date + 30
    )::bigint
  from eligible_applications as application;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Applications are temporarily unavailable.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Applications are temporarily unavailable.';
end;
$function$;

alter function
  public.get_counselor_university_application_workspace_metrics()
  owner to postgres;

comment on function
  public.get_counselor_university_application_workspace_metrics() is
  'Returns one aggregate-only applications workspace metric row to an active verified counselor. Operational status and Asia/Kolkata deadline counts exclude archived applications.';

revoke all on function
  public.get_counselor_university_application_workspace_metrics()
  from public, anon, authenticated;

grant execute on function
  public.get_counselor_university_application_workspace_metrics()
  to authenticated;

commit;

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SET LOCAL search_path = '';

WITH RECURSIVE
database_roles AS (
  SELECT
    pg_catalog.max(role_record.oid)
      FILTER (WHERE role_record.rolname = 'authenticated') AS authenticated_oid,
    pg_catalog.max(role_record.oid)
      FILTER (WHERE role_record.rolname = 'anon') AS anon_oid
  FROM pg_catalog.pg_roles AS role_record
),
applicable_roles(role_oid) AS (
  SELECT database_roles.authenticated_oid
  FROM database_roles
  WHERE database_roles.authenticated_oid IS NOT NULL

  UNION

  SELECT membership.roleid
  FROM pg_catalog.pg_auth_members AS membership
  INNER JOIN applicable_roles AS inherited_role
    ON inherited_role.role_oid = membership.member
),
required_relations(schema_name, relation_name, rls_required, force_rls_required) AS (
  VALUES
    ('public'::text, 'profiles'::text, true, false),
    ('public', 'consultation_requests', true, false),
    ('public', 'student_counselor_assignments', true, true),
    ('public', 'counselor_student_notes', true, false),
    ('public', 'counselor_follow_ups', true, false),
    ('public', 'student_counseling_progressions', true, false),
    ('public', 'student_counseling_progression_events', true, false),
    ('public', 'student_counseling_progression_evidence', true, false),
    ('public', 'student_university_applications', true, false),
    ('public', 'student_university_application_documents', true, false),
    ('auth', 'users', null, null),
    ('storage', 'objects', null, null)
),
actual_relations AS (
  SELECT
    required.schema_name,
    required.relation_name,
    required.rls_required,
    required.force_rls_required,
    relation.oid,
    relation.relkind,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    owner_role.rolname::text AS owner_name
  FROM required_relations AS required
  LEFT JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.nspname = required.schema_name
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relnamespace = namespace.oid
    AND relation.relname = required.relation_name
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = relation.relowner
),
required_columns(
  schema_name,
  relation_name,
  column_name,
  type_name,
  not_null_required
) AS (
  VALUES
    ('public'::text, 'profiles'::text, 'id'::text, 'uuid'::text, true),
    ('public', 'profiles', 'role', 'public.user_role', true),
    ('public', 'profiles', 'is_active', 'boolean', true),
    ('auth', 'users', 'id', 'uuid', true),
    (
      'auth',
      'users',
      'email_confirmed_at',
      'timestamp with time zone',
      false
    ),
    ('public', 'consultation_requests', 'id', 'uuid', true),
    ('public', 'consultation_requests', 'student_id', 'uuid', true),
    (
      'public',
      'consultation_requests',
      'assigned_counselor_id',
      'uuid',
      false
    ),
    (
      'public',
      'consultation_requests',
      'status',
      'public.consultation_status',
      true
    ),
    (
      'public',
      'consultation_requests',
      'submitted_at',
      'timestamp with time zone',
      true
    ),
    ('public', 'student_counselor_assignments', 'id', 'uuid', true),
    (
      'public',
      'student_counselor_assignments',
      'student_id',
      'uuid',
      true
    ),
    (
      'public',
      'student_counselor_assignments',
      'counselor_id',
      'uuid',
      true
    ),
    (
      'public',
      'student_counselor_assignments',
      'assigned_at',
      'timestamp with time zone',
      true
    ),
    (
      'public',
      'student_counselor_assignments',
      'assigned_by',
      'uuid',
      true
    ),
    (
      'public',
      'student_counselor_assignments',
      'ended_at',
      'timestamp with time zone',
      false
    ),
    (
      'public',
      'student_counselor_assignments',
      'created_at',
      'timestamp with time zone',
      true
    ),
    ('public', 'counselor_student_notes', 'student_id', 'uuid', true),
    ('public', 'counselor_student_notes', 'counselor_id', 'uuid', true),
    ('public', 'counselor_follow_ups', 'student_id', 'uuid', true),
    ('public', 'counselor_follow_ups', 'counselor_id', 'uuid', true),
    (
      'public',
      'student_counseling_progressions',
      'student_id',
      'uuid',
      true
    ),
    (
      'public',
      'student_counseling_progression_events',
      'id',
      'uuid',
      true
    ),
    (
      'public',
      'student_counseling_progression_events',
      'student_id',
      'uuid',
      true
    ),
    (
      'public',
      'student_counseling_progression_evidence',
      'progression_event_id',
      'uuid',
      true
    ),
    (
      'public',
      'student_counseling_progression_evidence',
      'bucket_id',
      'text',
      true
    ),
    (
      'public',
      'student_counseling_progression_evidence',
      'storage_path',
      'text',
      true
    ),
    (
      'public',
      'student_counseling_progression_evidence',
      'status',
      'public.counseling_progression_evidence_status',
      true
    ),
    (
      'public',
      'student_counseling_progression_evidence',
      'uploaded_by',
      'uuid',
      true
    ),
    (
      'public',
      'student_counseling_progression_evidence',
      'upload_expires_at',
      'timestamp with time zone',
      true
    ),
    (
      'public',
      'student_university_applications',
      'id',
      'uuid',
      true
    ),
    (
      'public',
      'student_university_applications',
      'student_id',
      'uuid',
      true
    ),
    (
      'public',
      'student_university_applications',
      'is_archived',
      'boolean',
      true
    ),
    (
      'public',
      'student_university_application_documents',
      'application_id',
      'uuid',
      true
    ),
    (
      'public',
      'student_university_application_documents',
      'bucket_id',
      'text',
      true
    ),
    (
      'public',
      'student_university_application_documents',
      'storage_path',
      'text',
      true
    ),
    (
      'public',
      'student_university_application_documents',
      'status',
      'public.university_application_document_status',
      true
    ),
    (
      'public',
      'student_university_application_documents',
      'uploaded_by',
      'uuid',
      true
    ),
    (
      'public',
      'student_university_application_documents',
      'upload_expires_at',
      'timestamp with time zone',
      true
    ),
    ('storage', 'objects', 'bucket_id', 'text', null),
    ('storage', 'objects', 'name', 'text', null)
),
actual_columns AS (
  SELECT
    required.*,
    attribute.attnum,
    attribute.atttypid,
    attribute.attnotnull
  FROM required_columns AS required
  LEFT JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.nspname = required.schema_name
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relnamespace = namespace.oid
    AND relation.relname = required.relation_name
  LEFT JOIN pg_catalog.pg_attribute AS attribute
    ON attribute.attrelid = relation.oid
    AND attribute.attname = required.column_name
    AND attribute.attnum > 0
    AND attribute.attisdropped IS FALSE
),
enum_contracts AS (
  SELECT
    namespace.nspname::text AS schema_name,
    type_record.typname::text AS type_name,
    pg_catalog.array_agg(
      enum_record.enumlabel::text
      ORDER BY enum_record.enumlabel::text
    ) AS labels
  FROM pg_catalog.pg_type AS type_record
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = type_record.typnamespace
  INNER JOIN pg_catalog.pg_enum AS enum_record
    ON enum_record.enumtypid = type_record.oid
  WHERE
    (namespace.nspname, type_record.typname) IN (
      ('public', 'user_role'),
      ('public', 'consultation_status'),
      ('public', 'counseling_progression_evidence_status'),
      ('public', 'university_application_document_status')
    )
  GROUP BY namespace.nspname, type_record.typname
),
required_constraints(schema_name, relation_name, constraint_name) AS (
  VALUES
    (
      'public'::text,
      'consultation_requests'::text,
      'consultation_requests_status_assignment_check'::text
    ),
    (
      'public',
      'student_counselor_assignments',
      'student_counselor_assignments_pkey'
    ),
    (
      'public',
      'student_counselor_assignments',
      'student_counselor_assignments_student_id_fkey'
    ),
    (
      'public',
      'student_counselor_assignments',
      'student_counselor_assignments_counselor_id_fkey'
    ),
    (
      'public',
      'student_counselor_assignments',
      'student_counselor_assignments_assigned_by_fkey'
    ),
    (
      'public',
      'student_counselor_assignments',
      'student_counselor_assignments_distinct_participants_check'
    ),
    (
      'public',
      'student_counselor_assignments',
      'student_counselor_assignments_timestamps_check'
    ),
    (
      'public',
      'student_counseling_progression_evidence',
      'student_counseling_progression_evidence_pkey'
    ),
    (
      'public',
      'student_counseling_progression_evidence',
      'progression_evidence_event_id_fkey'
    ),
    (
      'public',
      'student_counseling_progression_evidence',
      'progression_evidence_bucket_check'
    ),
    (
      'public',
      'student_counseling_progression_evidence',
      'progression_evidence_storage_path_key'
    ),
    (
      'public',
      'student_counseling_progression_evidence',
      'progression_evidence_storage_path_check'
    ),
    (
      'public',
      'student_counseling_progression_evidence',
      'progression_evidence_upload_window_check'
    ),
    (
      'public',
      'student_counseling_progression_evidence',
      'progression_evidence_status_consistency_check'
    ),
    (
      'public',
      'student_university_application_documents',
      'student_university_application_documents_pkey'
    ),
    (
      'public',
      'student_university_application_documents',
      'university_application_documents_application_id_fkey'
    ),
    (
      'public',
      'student_university_application_documents',
      'university_application_documents_bucket_check'
    ),
    (
      'public',
      'student_university_application_documents',
      'university_application_documents_storage_path_key'
    ),
    (
      'public',
      'student_university_application_documents',
      'university_application_documents_storage_path_check'
    ),
    (
      'public',
      'student_university_application_documents',
      'university_application_documents_upload_window_check'
    ),
    (
      'public',
      'student_university_application_documents',
      'university_application_documents_status_consistency_check'
    )
),
actual_constraints AS (
  SELECT
    required.*,
    constraint_record.oid,
    constraint_record.contype,
    constraint_record.convalidated,
    pg_catalog.pg_get_constraintdef(
      constraint_record.oid,
      false
    ) AS definition
  FROM required_constraints AS required
  LEFT JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.nspname = required.schema_name
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relnamespace = namespace.oid
    AND relation.relname = required.relation_name
  LEFT JOIN pg_catalog.pg_constraint AS constraint_record
    ON constraint_record.conrelid = relation.oid
    AND constraint_record.conname = required.constraint_name
),
required_indexes(
  schema_name,
  relation_name,
  index_name,
  unique_required,
  required_method_name,
  required_key_expressions,
  required_predicate
) AS (
  VALUES
    (
      'public'::text,
      'student_counselor_assignments'::text,
      'student_counselor_assignments_one_active_student_key'::text,
      true,
      'btree'::text,
      ARRAY['student_id']::text[],
      '(ended_at IS NULL)'::text
    ),
    (
      'public',
      'student_counselor_assignments',
      'student_counselor_assignments_active_counselor_idx',
      false,
      'btree',
      ARRAY['counselor_id', 'student_id']::text[],
      '(ended_at IS NULL)'
    ),
    (
      'public',
      'student_counselor_assignments',
      'student_counselor_assignments_student_history_idx',
      false,
      'btree',
      ARRAY['student_id', 'assigned_at DESC', 'id DESC']::text[],
      null
    ),
    (
      'public',
      'student_counseling_progression_evidence',
      'progression_evidence_event_status_available_idx',
      false,
      'btree',
      ARRAY[
        'progression_event_id',
        'status',
        'available_at',
        'id'
      ]::text[],
      null
    ),
    (
      'public',
      'student_counseling_progression_evidence',
      'progression_evidence_status_expiry_idx',
      false,
      'btree',
      ARRAY['status', 'upload_expires_at', 'id']::text[],
      null
    ),
    (
      'public',
      'student_university_application_documents',
      'university_application_documents_application_available_idx',
      false,
      'btree',
      ARRAY[
        'application_id',
        'status',
        'available_at DESC',
        'id DESC'
      ]::text[],
      null
    ),
    (
      'public',
      'student_university_application_documents',
      'university_application_documents_status_expiry_idx',
      false,
      'btree',
      ARRAY['status', 'upload_expires_at', 'id']::text[],
      null
    )
),
actual_indexes AS (
  SELECT
    required.*,
    index_relation.oid AS index_oid,
    index_record.indisunique,
    index_record.indisvalid,
    index_record.indisready,
    index_record.indisexclusion,
    index_record.indimmediate,
    index_record.indislive,
    index_record.indnkeyatts,
    index_record.indnatts,
    index_record.indexprs,
    access_method.amname::text AS actual_method_name,
    ARRAY(
      SELECT pg_catalog.pg_get_indexdef(
        index_relation.oid,
        key_position.position,
        false
      )::text
      FROM pg_catalog.generate_series(
        1,
        index_record.indnkeyatts::integer
      ) AS key_position(position)
      ORDER BY key_position.position
    )::text[] AS actual_key_expressions,
    pg_catalog.pg_get_indexdef(index_relation.oid) AS definition,
    pg_catalog.pg_get_expr(
      index_record.indpred,
      index_record.indrelid,
      false
    ) AS actual_predicate
  FROM required_indexes AS required
  LEFT JOIN pg_catalog.pg_namespace AS table_namespace
    ON table_namespace.nspname = required.schema_name
  LEFT JOIN pg_catalog.pg_class AS table_relation
    ON table_relation.relnamespace = table_namespace.oid
    AND table_relation.relname = required.relation_name
  LEFT JOIN pg_catalog.pg_namespace AS index_namespace
    ON index_namespace.nspname = required.schema_name
  LEFT JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.relnamespace = index_namespace.oid
    AND index_relation.relname = required.index_name
  LEFT JOIN pg_catalog.pg_index AS index_record
    ON index_record.indexrelid = index_relation.oid
    AND index_record.indrelid = table_relation.oid
  LEFT JOIN pg_catalog.pg_am AS access_method
    ON access_method.oid = index_relation.relam
),
expected_functions(
  function_name,
  identity_arguments,
  arguments_contract,
  result_type_name,
  result_contract,
  returns_set,
  language_name,
  security_definer,
  volatility,
  body_sha256,
  execute_grantees
) AS (
  VALUES
    (
      'has_active_verified_kgeo_role'::text,
      'p_role public.user_role'::text,
      'p_role public.user_role'::text,
      'boolean'::text,
      'boolean'::text,
      false,
      'sql'::text,
      true,
      's'::"char",
      '65bcc32123f299ba9e7b1b6aa081b7a3a1e8b2a81db95f5a344f6c69bb8a5ba9'::text,
      ARRAY['authenticated:false']::text[]
    ),
    (
      'prepare_consultation_request_insert',
      '',
      '',
      'trigger',
      'trigger',
      false,
      'plpgsql',
      true,
      'v'::"char",
      '340eec03be05a02f874ea68a14e03b11b9dacb683b1e96c7bcfc4782b0fec1e2',
      ARRAY[]::text[]
    ),
    (
      'claim_next_consultation',
      '',
      '',
      'uuid',
      'uuid',
      false,
      'plpgsql',
      true,
      'v'::"char",
      'd5081a4ada7cfe420dc250575ed11ab31df6f7df1e1eda64ebc02a93701ec2ac',
      ARRAY['authenticated:false']::text[]
    ),
    (
      'record_consultation_outcome',
      'p_consultation_id uuid, p_outcome text',
      'p_consultation_id uuid, p_outcome text',
      'public.consultation_status',
      'public.consultation_status',
      false,
      'plpgsql',
      true,
      'v'::"char",
      '99033348ce71a1261fcd9f0f674824687758d175da8f0204f7240790a6e67c25',
      ARRAY['authenticated:false']::text[]
    ),
    (
      'protect_student_counselor_assignment_history',
      '',
      '',
      'trigger',
      'trigger',
      false,
      'plpgsql',
      true,
      'v'::"char",
      'a7c8ef222ad86f0625e45cedae481d8e866d954e4a31b300d16373a072c80e3a',
      ARRAY[]::text[]
    ),
    (
      'list_my_primary_students',
      'p_page integer, p_page_size integer',
      'p_page integer DEFAULT 1, p_page_size integer DEFAULT 25',
      'record',
      'TABLE(assignment_id uuid, student_id uuid, full_name text, college_email text, is_active boolean, course text, department text, assigned_at timestamp with time zone, total_count bigint)',
      true,
      'plpgsql',
      true,
      's'::"char",
      '397bc27ef19ba8e1c838eda7e1bfa5fe51935bfadd1d6502e6faa521b266a55d',
      ARRAY['authenticated:false']::text[]
    ),
    (
      'list_director_primary_counselor_assignments',
      'p_student_ids uuid[]',
      'p_student_ids uuid[]',
      'record',
      'TABLE(student_id uuid, counselor_id uuid, counselor_full_name text, counselor_college_email text, assigned_at timestamp with time zone)',
      true,
      'plpgsql',
      true,
      's'::"char",
      '7e59fd5bf38524671f06dca1b7273a139a4e1cd1ac6ef2e8e03b965d54a85e35',
      ARRAY['authenticated:false']::text[]
    ),
    (
      'list_director_primary_counselor_counts',
      'p_counselor_ids uuid[]',
      'p_counselor_ids uuid[]',
      'record',
      'TABLE(counselor_id uuid, assigned_student_count bigint)',
      true,
      'plpgsql',
      true,
      's'::"char",
      '446096bd62553213f04f4ca6c2075eebdcb4aec95981e9658a84ef4978559201',
      ARRAY['authenticated:false']::text[]
    ),
    (
      'prepare_student_counseling_progression_evidence_upload',
      'p_progression_event_id uuid, p_original_file_name text, p_mime_type text, p_file_size_bytes bigint',
      'p_progression_event_id uuid, p_original_file_name text, p_mime_type text, p_file_size_bytes bigint',
      'record',
      'TABLE(evidence_id uuid, progression_event_id uuid, bucket_id text, storage_path text, original_file_name text, mime_type text, file_size_bytes bigint, upload_expires_at timestamp with time zone)',
      true,
      'plpgsql',
      true,
      'v'::"char",
      '633f3d48db7ab1c5d343e290c2c973d96cc9bb00756a8f56af5d16cbef4ea481',
      ARRAY['authenticated:false']::text[]
    ),
    (
      'prepare_university_application_document_upload',
      'p_application_id uuid, p_document_title text, p_original_file_name text, p_mime_type text, p_file_size_bytes bigint',
      'p_application_id uuid, p_document_title text, p_original_file_name text, p_mime_type text, p_file_size_bytes bigint',
      'record',
      'TABLE(document_id uuid, application_id uuid, bucket_id text, storage_path text, document_title text, original_file_name text, mime_type text, file_size_bytes bigint, upload_expires_at timestamp with time zone)',
      true,
      'plpgsql',
      true,
      'v'::"char",
      '360798e005203a7655ff7d76e149494a9f066d88b2c5af5fc18c50e6924d5534',
      ARRAY['authenticated:false']::text[]
    ),
    (
      'can_upload_university_application_document_object',
      'p_bucket_id text, p_storage_path text',
      'p_bucket_id text, p_storage_path text',
      'boolean',
      'boolean',
      false,
      'plpgsql',
      true,
      's'::"char",
      '2becacd7e29b2b3dfd357942000160a2ecb528dd392c34f2b1fd4fdfdac04004',
      ARRAY['authenticated:false']::text[]
    ),
    (
      'can_view_university_application_document_object',
      'p_bucket_id text, p_storage_path text',
      'p_bucket_id text, p_storage_path text',
      'boolean',
      'boolean',
      false,
      'plpgsql',
      true,
      's'::"char",
      '9956a0b4d1d5acbd7b21cc8972782027beec75e1e3f9a4a4142f000295887764',
      ARRAY['authenticated:false']::text[]
    )
),
actual_functions AS (
  SELECT
    procedure.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid)::text
      AS identity_arguments,
    pg_catalog.pg_get_function_arguments(procedure.oid)::text
      AS arguments_contract,
    pg_catalog.pg_get_function_result(procedure.oid)::text
      AS result_contract,
    procedure.prorettype,
    procedure.proretset AS returns_set,
    language_record.lanname::text AS language_name,
    procedure.prosecdef AS security_definer,
    procedure.provolatile AS volatility,
    procedure.prokind,
    procedure.proconfig,
    procedure.proisstrict,
    procedure.proleakproof,
    procedure.proparallel,
    owner_role.rolname::text AS owner_name,
    pg_catalog.pg_get_functiondef(procedure.oid) AS definition,
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          pg_catalog.replace(
            pg_catalog.replace(
              procedure.prosrc,
              pg_catalog.chr(13) || pg_catalog.chr(10),
              pg_catalog.chr(10)
            ),
            pg_catalog.chr(13),
            pg_catalog.chr(10)
          ),
          'UTF8'
        )
      ),
      'hex'
    ) AS body_sha256,
    COALESCE((
      SELECT pg_catalog.array_agg(
        pg_catalog.format(
          '%s:%s',
          COALESCE(grantee_role.rolname, 'PUBLIC'),
          privilege.is_grantable
        )
        ORDER BY
          COALESCE(grantee_role.rolname, 'PUBLIC'),
          privilege.is_grantable
      )
      FROM pg_catalog.aclexplode(
        COALESCE(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = privilege.grantee
      WHERE privilege.privilege_type = 'EXECUTE'
        AND privilege.grantee <> procedure.proowner
    ), ARRAY[]::text[]) AS execute_grantees
  FROM pg_catalog.pg_proc AS procedure
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  INNER JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure.proowner
  INNER JOIN pg_catalog.pg_language AS language_record
    ON language_record.oid = procedure.prolang
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      SELECT expected.function_name
      FROM expected_functions AS expected
    )
),
function_contract_comparison AS (
  SELECT
    expected.function_name,
    expected.identity_arguments,
    actual.function_name IS NOT NULL
      AND actual.arguments_contract = expected.arguments_contract
      AND actual.result_contract = expected.result_contract
      AND actual.prorettype =
        pg_catalog.to_regtype(expected.result_type_name)::oid
      AND actual.returns_set = expected.returns_set
      AND actual.language_name = expected.language_name
      AND actual.security_definer = expected.security_definer
      AND actual.volatility = expected.volatility
      AND actual.body_sha256 = expected.body_sha256
      AND actual.execute_grantees = expected.execute_grantees
      AND actual.prokind = 'f'
      AND actual.proconfig IN (
        ARRAY['search_path=']::text[],
        ARRAY['search_path=""']::text[]
      )
      AND actual.proisstrict IS FALSE
      AND actual.proleakproof IS FALSE
      AND actual.proparallel = 'u'
      AND actual.owner_name = 'postgres'
      AS exact_metadata
  FROM expected_functions AS expected
  LEFT JOIN actual_functions AS actual
    ON actual.function_name = expected.function_name
    AND actual.identity_arguments = expected.identity_arguments
),
migration_001_helper_candidates AS (
  SELECT
    procedure.oid,
    procedure.prosrc,
    procedure.prorettype,
    procedure.proretset,
    procedure.prokind,
    procedure.prosecdef,
    procedure.provolatile,
    procedure.proisstrict,
    procedure.proleakproof,
    procedure.proparallel,
    procedure.proconfig,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      AS identity_arguments,
    owner_role.rolname::text AS owner_name,
    language_record.lanname::text AS language_name,
    COALESCE((
      SELECT pg_catalog.count(*)
      FROM pg_catalog.aclexplode(
        COALESCE(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) AS privilege
      WHERE privilege.privilege_type = 'EXECUTE'
        AND privilege.grantee <> procedure.proowner
    ), 0)::bigint AS nonowner_execute_grant_count
  FROM pg_catalog.pg_proc AS procedure
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  INNER JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure.proowner
  INNER JOIN pg_catalog.pg_language AS language_record
    ON language_record.oid = procedure.prolang
  WHERE namespace.nspname = 'public'
    AND procedure.proname =
      'is_active_primary_counselor_for_student'
),
migration_001_helper_state AS (
  SELECT
    pg_catalog.count(*)::integer AS candidate_count,
    pg_catalog.count(*) FILTER (
      WHERE
        candidate.identity_arguments = 'p_student_id uuid'
        AND candidate.prokind = 'f'
        AND candidate.prorettype =
          pg_catalog.to_regtype('boolean')::oid
        AND candidate.proretset IS FALSE
        AND candidate.prosecdef IS TRUE
        AND candidate.provolatile = 's'
        AND candidate.proisstrict IS FALSE
        AND candidate.proleakproof IS FALSE
        AND candidate.proparallel = 'u'
        AND candidate.proconfig IN (
          ARRAY['search_path=']::text[],
          ARRAY['search_path=""']::text[]
        )
        AND candidate.owner_name = 'postgres'
        AND candidate.language_name = 'sql'
        AND candidate.nonowner_execute_grant_count = 0
        AND pg_catalog.encode(
          pg_catalog.sha256(
            pg_catalog.convert_to(
              pg_catalog.replace(
                pg_catalog.replace(
                  candidate.prosrc,
                  pg_catalog.chr(13) || pg_catalog.chr(10),
                  pg_catalog.chr(10)
                ),
                pg_catalog.chr(13),
                pg_catalog.chr(10)
              ),
              'UTF8'
            )
          ),
          'hex'
        ) =
          'dbafccbd4bae61d5e20bce09ee3b66075664dc23f69943235344c3d123b9fb6b'
    )::integer AS exact_candidate_count
  FROM migration_001_helper_candidates AS candidate
),
protected_relations(relation_schema, relation_name) AS (
  VALUES
    ('public'::text, 'counselor_student_notes'::text),
    ('public', 'counselor_follow_ups'),
    ('public', 'student_counseling_progressions'),
    ('public', 'student_university_applications'),
    ('public', 'student_counseling_progression_evidence'),
    ('public', 'student_university_application_documents')
),
expected_pre_triggers(
  relation_schema,
  relation_name,
  relation_oid,
  trigger_name,
  function_oid,
  function_schema,
  function_name,
  function_identity_arguments,
  trigger_type,
  enabled_state,
  is_internal,
  argument_count,
  arguments_hex,
  when_expression,
  constraint_oid,
  is_deferrable,
  is_initially_deferred,
  old_transition_table,
  new_transition_table
) AS (
  VALUES
    (
      'public'::text,
      'counselor_student_notes'::text,
      pg_catalog.to_regclass('public.counselor_student_notes')::oid,
      'counselor_student_notes_10_prepare'::text,
      pg_catalog.to_regprocedure(
        'public.prepare_counselor_private_record()'
      )::oid,
      'public'::text,
      'prepare_counselor_private_record'::text,
      ''::text,
      23::smallint,
      'O'::"char",
      false,
      0::smallint,
      ''::text,
      null::text,
      0::oid,
      false,
      false,
      null::text,
      null::text
    ),
    (
      'public',
      'counselor_student_notes',
      pg_catalog.to_regclass('public.counselor_student_notes')::oid,
      'counselor_student_notes_20_normalize',
      pg_catalog.to_regprocedure(
        'public.normalize_counselor_student_note()'
      )::oid,
      'public',
      'normalize_counselor_student_note',
      '',
      23::smallint,
      'O'::"char",
      false,
      0::smallint,
      '',
      null,
      0::oid,
      false,
      false,
      null,
      null
    ),
    (
      'public',
      'counselor_follow_ups',
      pg_catalog.to_regclass('public.counselor_follow_ups')::oid,
      'counselor_follow_ups_10_prepare',
      pg_catalog.to_regprocedure(
        'public.prepare_counselor_private_record()'
      )::oid,
      'public',
      'prepare_counselor_private_record',
      '',
      23::smallint,
      'O'::"char",
      false,
      0::smallint,
      '',
      null,
      0::oid,
      false,
      false,
      null,
      null
    ),
    (
      'public',
      'counselor_follow_ups',
      pg_catalog.to_regclass('public.counselor_follow_ups')::oid,
      'counselor_follow_ups_20_normalize',
      pg_catalog.to_regprocedure(
        'public.normalize_counselor_follow_up()'
      )::oid,
      'public',
      'normalize_counselor_follow_up',
      '',
      23::smallint,
      'O'::"char",
      false,
      0::smallint,
      '',
      null,
      0::oid,
      false,
      false,
      null,
      null
    )
),
actual_pre_triggers AS (
  SELECT
    relation_namespace.nspname::text AS relation_schema,
    relation.relname::text AS relation_name,
    relation.oid AS relation_oid,
    trigger_record.tgname::text AS trigger_name,
    procedure.oid AS function_oid,
    function_namespace.nspname::text AS function_schema,
    procedure.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid)::text
      AS function_identity_arguments,
    trigger_record.tgtype AS trigger_type,
    trigger_record.tgenabled AS enabled_state,
    trigger_record.tgisinternal AS is_internal,
    trigger_record.tgnargs AS argument_count,
    pg_catalog.encode(trigger_record.tgargs, 'hex') AS arguments_hex,
    pg_catalog.pg_get_expr(
      trigger_record.tgqual,
      trigger_record.tgrelid,
      false
    )::text AS when_expression,
    trigger_record.tgconstraint AS constraint_oid,
    trigger_record.tgdeferrable AS is_deferrable,
    trigger_record.tginitdeferred AS is_initially_deferred,
    trigger_record.tgoldtable::text AS old_transition_table,
    trigger_record.tgnewtable::text AS new_transition_table
  FROM pg_catalog.pg_trigger AS trigger_record
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = trigger_record.tgrelid
  INNER JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation.relnamespace
  INNER JOIN pg_catalog.pg_proc AS procedure
    ON procedure.oid = trigger_record.tgfoid
  INNER JOIN pg_catalog.pg_namespace AS function_namespace
    ON function_namespace.oid = procedure.pronamespace
  INNER JOIN protected_relations AS protected
    ON protected.relation_schema = relation_namespace.nspname
    AND protected.relation_name = relation.relname
  WHERE trigger_record.tgisinternal IS FALSE
),
assignment_history_trigger AS (
  SELECT
    trigger_record.tgname,
    trigger_record.tgtype,
    trigger_record.tgenabled,
    trigger_record.tgisinternal,
    trigger_record.tgnargs,
    pg_catalog.encode(trigger_record.tgargs, 'hex') AS arguments_hex,
    pg_catalog.pg_get_expr(
      trigger_record.tgqual,
      trigger_record.tgrelid,
      false
    ) AS when_expression,
    trigger_record.tgconstraint,
    trigger_record.tgdeferrable,
    trigger_record.tginitdeferred,
    trigger_record.tgoldtable,
    trigger_record.tgnewtable,
    function_namespace.nspname::text AS function_schema,
    procedure.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid)::text
      AS function_identity_arguments
  FROM pg_catalog.pg_trigger AS trigger_record
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = trigger_record.tgrelid
  INNER JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation.relnamespace
  INNER JOIN pg_catalog.pg_proc AS procedure
    ON procedure.oid = trigger_record.tgfoid
  INNER JOIN pg_catalog.pg_namespace AS function_namespace
    ON function_namespace.oid = procedure.pronamespace
  WHERE relation_namespace.nspname = 'public'
    AND relation.relname = 'student_counselor_assignments'
    AND trigger_record.tgisinternal IS FALSE
),
preexisting_a1_4_2b_functions AS (
  SELECT pg_catalog.count(*)::integer AS row_count
  FROM pg_catalog.pg_proc AS procedure
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      'get_my_primary_counselor_case_access',
      'enforce_primary_counselor_student_case_row',
      'enforce_primary_counselor_progression_evidence',
      'enforce_primary_counselor_application_document'
    )
),
assignment_integrity_drift AS (
  SELECT pg_catalog.count(*)::bigint AS row_count
  FROM public.student_counselor_assignments AS assignment
  INNER JOIN public.profiles AS student_profile
    ON student_profile.id = assignment.student_id
  INNER JOIN public.profiles AS counselor_profile
    ON counselor_profile.id = assignment.counselor_id
  INNER JOIN public.profiles AS actor_profile
    ON actor_profile.id = assignment.assigned_by
  WHERE student_profile.role <> 'student'::public.user_role
    OR counselor_profile.role <> 'counselor'::public.user_role
    OR actor_profile.role NOT IN (
      'counselor'::public.user_role,
      'director'::public.user_role
    )
    OR assignment.student_id = assignment.counselor_id
    OR assignment.created_at <> assignment.assigned_at
    OR (
      assignment.ended_at IS NOT NULL
      AND assignment.ended_at < assignment.assigned_at
    )
),
applicable_insert_policies AS (
  SELECT
    policy_record.oid AS policy_oid,
    policy_record.polname,
    policy_record.polcmd,
    policy_record.polpermissive,
    policy_record.polroles,
    policy_record.polqual,
    policy_record.polwithcheck,
    pg_catalog.pg_get_expr(
      policy_record.polwithcheck,
      policy_record.polrelid,
      false
    ) AS rendered_expression
  FROM pg_catalog.pg_policy AS policy_record
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = policy_record.polrelid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'storage'
    AND relation.relname = 'objects'
    AND policy_record.polcmd IN ('a', '*')
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(
        policy_record.polroles
      ) AS policy_role(role_oid)
      WHERE policy_role.role_oid = 0
        OR policy_role.role_oid IN (
          SELECT inherited.role_oid
          FROM applicable_roles AS inherited
        )
    )
),
insert_policy_contracts AS (
  SELECT
    applicable_policy.*,
    pg_catalog.regexp_replace(
      pg_catalog.btrim(
        pg_catalog.replace(
          pg_catalog.replace(
            applicable_policy.rendered_expression,
            pg_catalog.chr(13) || pg_catalog.chr(10),
            pg_catalog.chr(10)
          ),
          pg_catalog.chr(13),
          pg_catalog.chr(10)
        )
      ),
      '[[:space:]]+',
      ' ',
      'g'
    ) AS exact_expression,
    ARRAY(
      SELECT DISTINCT
        pg_catalog.format(
          '%I.%I',
          dependency_namespace.nspname,
          dependency_relation.relname
        )
      FROM pg_catalog.pg_depend AS dependency_record
      INNER JOIN pg_catalog.pg_class AS dependency_relation
        ON dependency_record.refclassid =
          'pg_catalog.pg_class'::pg_catalog.regclass
        AND dependency_relation.oid = dependency_record.refobjid
      INNER JOIN pg_catalog.pg_namespace AS dependency_namespace
        ON dependency_namespace.oid =
          dependency_relation.relnamespace
      WHERE dependency_record.classid =
          'pg_catalog.pg_policy'::pg_catalog.regclass
        AND dependency_record.objid = applicable_policy.policy_oid
      ORDER BY 1
    )::text[] AS relation_dependencies,
    ARRAY(
      SELECT DISTINCT
        pg_catalog.format(
          '%I.%I(%s)',
          dependency_namespace.nspname,
          dependency_procedure.proname,
          pg_catalog.pg_get_function_identity_arguments(
            dependency_procedure.oid
          )
        )
      FROM pg_catalog.pg_depend AS dependency_record
      INNER JOIN pg_catalog.pg_proc AS dependency_procedure
        ON dependency_record.refclassid =
          'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency_procedure.oid = dependency_record.refobjid
      INNER JOIN pg_catalog.pg_namespace AS dependency_namespace
        ON dependency_namespace.oid =
          dependency_procedure.pronamespace
      WHERE dependency_record.classid =
          'pg_catalog.pg_policy'::pg_catalog.regclass
        AND dependency_record.objid = applicable_policy.policy_oid
      ORDER BY 1
    )::text[] AS function_dependencies
  FROM applicable_insert_policies AS applicable_policy
),
hashed_insert_policy_contracts AS (
  SELECT
    policy_contract.*,
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          policy_contract.exact_expression,
          'UTF8'
        )
      ),
      'hex'
    ) AS expression_sha256
  FROM insert_policy_contracts AS policy_contract
),
applicable_select_policies AS (
  SELECT
    policy_record.oid AS policy_oid,
    policy_record.polname,
    policy_record.polcmd,
    policy_record.polpermissive,
    policy_record.polroles,
    policy_record.polqual,
    policy_record.polwithcheck,
    pg_catalog.pg_get_expr(
      policy_record.polqual,
      policy_record.polrelid,
      false
    ) AS rendered_expression
  FROM pg_catalog.pg_policy AS policy_record
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = policy_record.polrelid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'storage'
    AND relation.relname = 'objects'
    AND policy_record.polcmd IN ('r', '*')
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(
        policy_record.polroles
      ) AS policy_role(role_oid)
      WHERE policy_role.role_oid = 0
        OR policy_role.role_oid IN (
          SELECT inherited.role_oid
          FROM applicable_roles AS inherited
        )
    )
),
select_policy_contracts AS (
  SELECT
    applicable_policy.*,
    pg_catalog.regexp_replace(
      pg_catalog.btrim(
        pg_catalog.replace(
          pg_catalog.replace(
            applicable_policy.rendered_expression,
            pg_catalog.chr(13) || pg_catalog.chr(10),
            pg_catalog.chr(10)
          ),
          pg_catalog.chr(13),
          pg_catalog.chr(10)
        )
      ),
      '[[:space:]]+',
      ' ',
      'g'
    ) AS exact_expression,
    ARRAY(
      SELECT DISTINCT
        pg_catalog.format(
          '%I.%I',
          dependency_namespace.nspname,
          dependency_relation.relname
        )
      FROM pg_catalog.pg_depend AS dependency_record
      INNER JOIN pg_catalog.pg_class AS dependency_relation
        ON dependency_record.refclassid =
          'pg_catalog.pg_class'::pg_catalog.regclass
        AND dependency_relation.oid = dependency_record.refobjid
      INNER JOIN pg_catalog.pg_namespace AS dependency_namespace
        ON dependency_namespace.oid =
          dependency_relation.relnamespace
      WHERE dependency_record.classid =
          'pg_catalog.pg_policy'::pg_catalog.regclass
        AND dependency_record.objid = applicable_policy.policy_oid
      ORDER BY 1
    )::text[] AS relation_dependencies,
    ARRAY(
      SELECT DISTINCT
        pg_catalog.format(
          '%I.%I(%s)',
          dependency_namespace.nspname,
          dependency_procedure.proname,
          pg_catalog.pg_get_function_identity_arguments(
            dependency_procedure.oid
          )
        )
      FROM pg_catalog.pg_depend AS dependency_record
      INNER JOIN pg_catalog.pg_proc AS dependency_procedure
        ON dependency_record.refclassid =
          'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency_procedure.oid = dependency_record.refobjid
      INNER JOIN pg_catalog.pg_namespace AS dependency_namespace
        ON dependency_namespace.oid =
          dependency_procedure.pronamespace
      WHERE dependency_record.classid =
          'pg_catalog.pg_policy'::pg_catalog.regclass
        AND dependency_record.objid = applicable_policy.policy_oid
      ORDER BY 1
    )::text[] AS function_dependencies
  FROM applicable_select_policies AS applicable_policy
),
hashed_select_policy_contracts AS (
  SELECT
    policy_contract.*,
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          policy_contract.exact_expression,
          'UTF8'
        )
      ),
      'hex'
    ) AS expression_sha256
  FROM select_policy_contracts AS policy_contract
),
incompatible_progression_reservations AS (
  SELECT pg_catalog.count(*)::bigint AS row_count
  FROM public.student_counseling_progression_evidence AS evidence
  INNER JOIN public.student_counseling_progression_events
    AS progression_event
    ON progression_event.id = evidence.progression_event_id
  WHERE evidence.status =
      'pending'::public.counseling_progression_evidence_status
    AND evidence.upload_expires_at >
      pg_catalog.statement_timestamp()
    AND NOT EXISTS (
      SELECT 1
      FROM public.student_counselor_assignments AS assignment
      INNER JOIN public.profiles AS student_profile
        ON student_profile.id = assignment.student_id
        AND student_profile.role = 'student'::public.user_role
      INNER JOIN public.profiles AS counselor_profile
        ON counselor_profile.id = assignment.counselor_id
        AND counselor_profile.role = 'counselor'::public.user_role
        AND counselor_profile.is_active IS TRUE
      INNER JOIN auth.users AS counselor_auth
        ON counselor_auth.id = counselor_profile.id
        AND counselor_auth.email_confirmed_at IS NOT NULL
      WHERE assignment.student_id = progression_event.student_id
        AND assignment.counselor_id = evidence.uploaded_by
        AND assignment.ended_at IS NULL
    )
),
incompatible_document_reservations AS (
  SELECT pg_catalog.count(*)::bigint AS row_count
  FROM public.student_university_application_documents AS document
  INNER JOIN public.student_university_applications AS application
    ON application.id = document.application_id
  WHERE document.status =
      'pending'::public.university_application_document_status
    AND document.upload_expires_at >
      pg_catalog.statement_timestamp()
    AND (
      application.is_archived IS TRUE
      OR NOT EXISTS (
        SELECT 1
        FROM public.student_counselor_assignments AS assignment
        INNER JOIN public.profiles AS student_profile
          ON student_profile.id = assignment.student_id
          AND student_profile.role = 'student'::public.user_role
        INNER JOIN public.profiles AS counselor_profile
          ON counselor_profile.id = assignment.counselor_id
          AND counselor_profile.role =
            'counselor'::public.user_role
          AND counselor_profile.is_active IS TRUE
        INNER JOIN auth.users AS counselor_auth
          ON counselor_auth.id = counselor_profile.id
          AND counselor_auth.email_confirmed_at IS NOT NULL
        WHERE assignment.student_id = application.student_id
          AND assignment.counselor_id = document.uploaded_by
          AND assignment.ended_at IS NULL
      )
    )
),
mandatory_checks(check_name, passed, details) AS (
  SELECT
    'DATABASE_ROLES',
    authenticated_oid IS NOT NULL AND anon_oid IS NOT NULL,
    pg_catalog.format(
      'authenticated=%s; anon=%s',
      authenticated_oid IS NOT NULL,
      anon_oid IS NOT NULL
    )
  FROM database_roles

  UNION ALL

  SELECT
    'REQUIRED_RELATIONS',
    pg_catalog.bool_and(
      oid IS NOT NULL
      AND relkind IN ('r', 'p')
      AND (
        rls_required IS NULL
        OR relrowsecurity = rls_required
      )
      AND (
        force_rls_required IS NULL
        OR relforcerowsecurity = force_rls_required
      )
      AND (
        schema_name IN ('auth', 'storage')
        OR owner_name = 'postgres'
      )
    ),
    pg_catalog.format(
      'exact_required=%s; found=%s',
      pg_catalog.count(*),
      pg_catalog.count(*) FILTER (WHERE oid IS NOT NULL)
    )
  FROM actual_relations

  UNION ALL

  SELECT
    'REQUIRED_COLUMNS',
    pg_catalog.bool_and(
      attnum IS NOT NULL
      AND atttypid =
        pg_catalog.to_regtype(type_name)::oid
      AND (
        not_null_required IS NULL
        OR attnotnull = not_null_required
      )
    ),
    pg_catalog.format(
      'required=%s; exact=%s',
      pg_catalog.count(*),
      pg_catalog.count(*) FILTER (
        WHERE attnum IS NOT NULL
          AND atttypid =
            pg_catalog.to_regtype(type_name)::oid
          AND (
            not_null_required IS NULL
            OR attnotnull = not_null_required
          )
      )
    )
  FROM actual_columns

  UNION ALL

  SELECT
    'REQUIRED_ENUMS',
    COALESCE((
      SELECT labels =
        ARRAY['admin', 'counselor', 'director', 'student']::text[]
      FROM enum_contracts
      WHERE schema_name = 'public'
        AND type_name = 'user_role'
    ), false)
    AND COALESCE((
      SELECT labels =
        ARRAY['available', 'pending', 'removed']::text[]
      FROM enum_contracts
      WHERE schema_name = 'public'
        AND type_name =
          'counseling_progression_evidence_status'
    ), false)
    AND COALESCE((
      SELECT labels =
        ARRAY['available', 'pending', 'removed']::text[]
      FROM enum_contracts
      WHERE schema_name = 'public'
        AND type_name =
          'university_application_document_status'
    ), false)
    AND COALESCE((
      SELECT labels @> ARRAY[
        'cancelled',
        'completed',
        'counselor_assigned',
        'no_show',
        'scheduled',
        'submitted',
        'waiting_for_assignment'
      ]::text[]
      FROM enum_contracts
      WHERE schema_name = 'public'
        AND type_name = 'consultation_status'
    ), false),
    'user_role and both reservation lifecycle enums are exact; consultation_status contains the approved A1.4.1 states'

  UNION ALL

  SELECT
    'REQUIRED_CONSTRAINTS',
    pg_catalog.bool_and(
      oid IS NOT NULL
      AND convalidated IS TRUE
    ),
    pg_catalog.format(
      'required=%s; present_and_validated=%s',
      pg_catalog.count(*),
      pg_catalog.count(*) FILTER (
        WHERE oid IS NOT NULL
          AND convalidated IS TRUE
      )
    )
  FROM actual_constraints

  UNION ALL

  SELECT
    'CRITICAL_CONSTRAINT_EXPRESSIONS',
    COALESCE((
      SELECT
        pg_catalog.lower(definition) LIKE
          '%status%waiting_for_assignment%'
        AND pg_catalog.lower(definition) LIKE
          '%assigned_counselor_id is null%'
        AND pg_catalog.lower(definition) LIKE
          '%scheduled%'
        AND pg_catalog.lower(definition) LIKE
          '%assigned_counselor_id is not null%'
      FROM actual_constraints
      WHERE relation_name = 'consultation_requests'
        AND constraint_name =
          'consultation_requests_status_assignment_check'
    ), false)
    AND COALESCE((
      SELECT
        pg_catalog.lower(definition) LIKE
          '%student_id <> counselor_id%'
      FROM actual_constraints
      WHERE relation_name = 'student_counselor_assignments'
        AND constraint_name =
          'student_counselor_assignments_distinct_participants_check'
    ), false)
    AND COALESCE((
      SELECT
        pg_catalog.lower(definition) LIKE
          '%created_at = assigned_at%'
        AND pg_catalog.lower(definition) LIKE
          '%ended_at >= assigned_at%'
      FROM actual_constraints
      WHERE relation_name = 'student_counselor_assignments'
        AND constraint_name =
          'student_counselor_assignments_timestamps_check'
    ), false)
    AND COALESCE((
      SELECT
        pg_catalog.lower(definition) LIKE
          '%counseling-progression-evidence%'
      FROM actual_constraints
      WHERE relation_name =
          'student_counseling_progression_evidence'
        AND constraint_name =
          'progression_evidence_bucket_check'
    ), false)
    AND COALESCE((
      SELECT
        pg_catalog.lower(definition) LIKE
          '%university-application-documents%'
      FROM actual_constraints
      WHERE relation_name =
          'student_university_application_documents'
        AND constraint_name =
          'university_application_documents_bucket_check'
    ), false),
    'assignment, consultation ownership, and protected-bucket constraints retain their reviewed semantics'

  UNION ALL

  SELECT
    'REQUIRED_INDEXES',
    pg_catalog.bool_and(
      index_oid IS NOT NULL
      AND indisvalid IS TRUE
      AND indisready IS TRUE
      AND indisunique = unique_required
      AND indisexclusion IS FALSE
      AND indimmediate IS TRUE
      AND indislive IS TRUE
      AND actual_method_name = required_method_name
      AND indnkeyatts =
        pg_catalog.cardinality(required_key_expressions)
      AND indnatts =
        pg_catalog.cardinality(required_key_expressions)
      AND indexprs IS NULL
      AND actual_key_expressions = required_key_expressions
      AND actual_predicate IS NOT DISTINCT FROM required_predicate
    ),
    pg_catalog.format(
      'required=%s; structurally_exact=%s',
      pg_catalog.count(*),
      pg_catalog.count(*) FILTER (
        WHERE index_oid IS NOT NULL
          AND indisvalid IS TRUE
          AND indisready IS TRUE
          AND indisunique = unique_required
          AND indisexclusion IS FALSE
          AND indimmediate IS TRUE
          AND indislive IS TRUE
          AND actual_method_name = required_method_name
          AND indnkeyatts =
            pg_catalog.cardinality(required_key_expressions)
          AND indnatts =
            pg_catalog.cardinality(required_key_expressions)
          AND indexprs IS NULL
          AND actual_key_expressions = required_key_expressions
          AND actual_predicate IS NOT DISTINCT FROM required_predicate
      )
    )
  FROM actual_indexes

  UNION ALL

  SELECT
    'ACTIVE_ASSIGNMENT_UNIQUENESS',
    COALESCE((
      SELECT
        indisunique IS TRUE
        AND pg_catalog.lower(definition) LIKE
          '%unique index%student_id%'
        AND pg_catalog.lower(actual_predicate) =
          '(ended_at is null)'
      FROM actual_indexes
      WHERE index_name =
        'student_counselor_assignments_one_active_student_key'
    ), false),
    'one active assignment per Student is enforced by the reviewed partial unique index'

  UNION ALL

  SELECT
    'SEALED_ASSIGNMENT_TABLE',
    COALESCE((
      SELECT
        relation.relrowsecurity
        AND relation.relforcerowsecurity
        AND owner_role.rolname = 'postgres'
        AND NOT pg_catalog.has_table_privilege(
          'public',
          relation.oid,
          'SELECT,INSERT,UPDATE,DELETE'
        )
        AND NOT pg_catalog.has_table_privilege(
          'anon',
          relation.oid,
          'SELECT,INSERT,UPDATE,DELETE'
        )
        AND NOT pg_catalog.has_table_privilege(
          'authenticated',
          relation.oid,
          'SELECT,INSERT,UPDATE,DELETE'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_policy AS policy_record
          WHERE policy_record.polrelid = relation.oid
        )
      FROM pg_catalog.pg_class AS relation
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      INNER JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = relation.relowner
      WHERE namespace.nspname = 'public'
        AND relation.relname =
          'student_counselor_assignments'
        AND relation.relkind = 'r'
    ), false),
    'assignment history is postgres-owned, forced-RLS, policy-free, and inaccessible directly to browser roles'

  UNION ALL

  SELECT
    'RESERVATION_TABLE_MUTATION_ACLS',
    NOT pg_catalog.has_table_privilege(
      'public',
      'public.student_counseling_progression_evidence',
      'INSERT,UPDATE,DELETE'
    )
    AND NOT pg_catalog.has_table_privilege(
      'anon',
      'public.student_counseling_progression_evidence',
      'INSERT,UPDATE,DELETE'
    )
    AND NOT pg_catalog.has_table_privilege(
      'authenticated',
      'public.student_counseling_progression_evidence',
      'INSERT,UPDATE,DELETE'
    )
    AND NOT pg_catalog.has_table_privilege(
      'public',
      'public.student_university_application_documents',
      'INSERT,UPDATE,DELETE'
    )
    AND NOT pg_catalog.has_table_privilege(
      'anon',
      'public.student_university_application_documents',
      'INSERT,UPDATE,DELETE'
    )
    AND NOT pg_catalog.has_table_privilege(
      'authenticated',
      'public.student_university_application_documents',
      'INSERT,UPDATE,DELETE'
    ),
    'progression-evidence and application-document reservation mutations remain RPC-only'

  UNION ALL

  SELECT
    'REQUIRED_FUNCTION_METADATA_AND_ACLS',
    pg_catalog.count(*) =
      (SELECT pg_catalog.count(*) FROM expected_functions)
    AND pg_catalog.bool_and(exact_metadata)
    AND (
      SELECT pg_catalog.count(*)
      FROM actual_functions
    ) = (
      SELECT pg_catalog.count(*)
      FROM expected_functions
    ),
    pg_catalog.format(
      'required=%s; exact=%s; discovered_overloads=%s',
      (SELECT pg_catalog.count(*) FROM expected_functions),
      pg_catalog.count(*) FILTER (WHERE exact_metadata),
      (SELECT pg_catalog.count(*) FROM actual_functions)
    )
  FROM function_contract_comparison

  UNION ALL

  SELECT
    'A1_4_1_BEHAVIORAL_CONTRACT',
    COALESCE((
      SELECT
        pg_catalog.lower(definition) LIKE
          '%new.status := ''waiting_for_assignment''::public.consultation_status%'
        AND pg_catalog.lower(definition) LIKE
          '%new.assigned_counselor_id := null%'
      FROM actual_functions
      WHERE function_name =
        'prepare_consultation_request_insert'
    ), false)
    AND COALESCE((
      SELECT
        pg_catalog.lower(definition) LIKE
          '%v_caller_id := (select auth.uid())%'
        AND pg_catalog.lower(definition) LIKE
          '%counselor_profile.role = ''counselor''::public.user_role%'
        AND pg_catalog.lower(definition) LIKE
          '%counselor_profile.is_active is true%'
        AND pg_catalog.lower(definition) LIKE
          '%counselor_auth.email_confirmed_at is not null%'
        AND pg_catalog.lower(definition) LIKE
          '%order by request.submitted_at asc, request.id asc%limit 1%for update%'
        AND pg_catalog.lower(definition) LIKE
          '%request.assigned_counselor_id is null%'
        AND pg_catalog.lower(definition) NOT LIKE
          '%''director''::public.user_role%'
        AND pg_catalog.lower(definition) NOT LIKE
          '%''admin''::public.user_role%'
      FROM actual_functions
      WHERE function_name = 'claim_next_consultation'
    ), false)
    AND COALESCE((
      SELECT
        pg_catalog.lower(definition) LIKE
          '%request.assigned_counselor_id = caller_id%'
        AND pg_catalog.lower(definition) LIKE '%for update%'
      FROM actual_functions
      WHERE function_name = 'record_consultation_outcome'
    ), false),
    'student booking, FCFS claim, and consultation-owner outcome rules remain installed'

  UNION ALL

  SELECT
    'A1_4_2A_BEHAVIORAL_CONTRACT',
    COALESCE((
      SELECT
        pg_catalog.lower(definition) LIKE
          '%insert into public.student_counselor_assignments%'
        AND pg_catalog.lower(definition) LIKE
          '%on conflict (student_id) where ended_at is null%do nothing%'
        AND pg_catalog.lower(definition) NOT LIKE
          '%update public.student_counselor_assignments%'
      FROM actual_functions
      WHERE function_name = 'claim_next_consultation'
    ), false)
    AND COALESCE((
      SELECT
        pg_catalog.lower(definition) LIKE
          '%v_student_role is distinct from ''student''::public.user_role%'
        AND pg_catalog.lower(definition) LIKE
          '%v_counselor_role is distinct from ''counselor''::public.user_role%'
        AND pg_catalog.lower(definition) LIKE
          '%tg_op = ''delete''%'
        AND pg_catalog.lower(definition) LIKE
          '%old.ended_at is not null%new.ended_at is null%'
      FROM actual_functions
      WHERE function_name =
        'protect_student_counselor_assignment_history'
    ), false)
    AND COALESCE((
      SELECT
        pg_catalog.lower(definition) LIKE
          '%assignment.counselor_id = v_caller_id%'
        AND pg_catalog.lower(definition) LIKE
          '%assignment.ended_at is null%'
        AND pg_catalog.lower(definition) LIKE
          '%p_page_size not between 1 and 50%'
      FROM actual_functions
      WHERE function_name = 'list_my_primary_students'
    ), false)
    AND COALESCE((
      SELECT
        pg_catalog.bool_and(
          pg_catalog.lower(definition) LIKE
            '%has_active_verified_kgeo_role(''director''::public.user_role)%'
          AND pg_catalog.lower(definition) LIKE
            '%cardinality(%not between 1 and 50%'
          AND pg_catalog.lower(definition) NOT LIKE
            '%counselor_student_notes%'
          AND pg_catalog.lower(definition) NOT LIKE
            '%counselor_follow_ups%'
        )
        AND pg_catalog.count(*) = 2
      FROM actual_functions
      WHERE function_name IN (
        'list_director_primary_counselor_assignments',
        'list_director_primary_counselor_counts'
      )
    ), false),
    'first-claim assignment, immutable history, counselor scope, and Director read-only projections remain installed'

  UNION ALL

  SELECT
    'ASSIGNMENT_HISTORY_TRIGGER',
    pg_catalog.count(*) = 1
    AND pg_catalog.bool_and(
      tgname = 'protect_student_counselor_assignment_history'
      AND tgtype = 31
      AND tgenabled = 'O'
      AND tgisinternal IS FALSE
      AND tgnargs = 0
      AND arguments_hex = ''
      AND when_expression IS NULL
      AND tgconstraint = 0
      AND tgdeferrable IS FALSE
      AND tginitdeferred IS FALSE
      AND tgoldtable IS NULL
      AND tgnewtable IS NULL
      AND function_schema = 'public'
      AND function_name =
        'protect_student_counselor_assignment_history'
      AND function_identity_arguments = ''
    ),
    pg_catalog.format(
      'expected=1; actual=%s',
      pg_catalog.count(*)
    )
  FROM assignment_history_trigger

  UNION ALL

  SELECT
    'MIGRATION_001_HELPER_STATE',
    candidate_count = 0
    OR (
      candidate_count = 1
      AND exact_candidate_count = 1
    ),
    CASE
      WHEN candidate_count = 0 THEN
        'approved pre-001 state: helper absent; apply Migration 001, rerun this preflight, then proceed to Migration 002 only when this row reports exact'
      WHEN candidate_count = 1
        AND exact_candidate_count = 1 THEN
        'approved post-001 state: exact private helper installed and ready for Migration 002'
      ELSE
        pg_catalog.format(
          'blocking helper drift: candidates=%s; exact=%s',
          candidate_count,
          exact_candidate_count
        )
    END
  FROM migration_001_helper_state

  UNION ALL

  SELECT
    'PRE_A1_4_2B_PROTECTED_TRIGGER_INVENTORY',
    NOT EXISTS (
      SELECT * FROM expected_pre_triggers
      EXCEPT
      SELECT * FROM actual_pre_triggers
    )
    AND NOT EXISTS (
      SELECT * FROM actual_pre_triggers
      EXCEPT
      SELECT * FROM expected_pre_triggers
    ),
    pg_catalog.format(
      'expected=4 historical triggers; actual=%s across all six protected relations',
      (SELECT pg_catalog.count(*) FROM actual_pre_triggers)
    )

  UNION ALL

  SELECT
    'NO_PREEXISTING_A1_4_2B_ENFORCEMENT_FUNCTIONS',
    row_count = 0,
    pg_catalog.format(
      'unexpected enforcement-function count=%s',
      row_count
    )
  FROM preexisting_a1_4_2b_functions

  UNION ALL

  SELECT
    'NO_HISTORICAL_ASSIGNMENT_REWRITE_REQUIRED',
    row_count = 0,
    pg_catalog.format(
      'incompatible historical assignment rows=%s; unassigned Students are intentionally allowed',
      row_count
    )
  FROM assignment_integrity_drift

  UNION ALL

  SELECT
    'STORAGE_INSERT_ALL_COMPLETE_INVENTORY',
    pg_catalog.count(*) = 3
    AND pg_catalog.array_agg(
      polname ORDER BY polname
    ) = ARRAY[
      'progression_evidence_object_insert_counselor',
      'students upload own marksheets',
      'university_application_document_object_insert_counselor'
    ]::name[],
    pg_catalog.format(
      'count=%s; names=%s',
      pg_catalog.count(*),
      COALESCE(
        pg_catalog.array_to_string(
          pg_catalog.array_agg(polname ORDER BY polname),
          ', '
        ),
        '<none>'
      )
    )
  FROM applicable_insert_policies

  UNION ALL

  SELECT
    'STORAGE_INSERT_PROGRESSION_EXACT',
    pg_catalog.count(*) = 1
    AND pg_catalog.bool_and(
      polcmd = 'a'
      AND polpermissive IS TRUE
      AND polroles = ARRAY[
        (SELECT authenticated_oid FROM database_roles)
      ]::oid[]
      AND polqual IS NULL
      AND polwithcheck IS NOT NULL
      AND exact_expression =
        '((bucket_id = ''counseling-progression-evidence''::text) AND ( SELECT public.has_active_verified_kgeo_role(''counselor''::public.user_role) AS has_active_verified_kgeo_role) AND (EXISTS ( SELECT 1 FROM public.student_counseling_progression_evidence evidence WHERE ((evidence.bucket_id = objects.bucket_id) AND (evidence.storage_path = objects.name) AND (evidence.status = ''pending''::public.counseling_progression_evidence_status) AND (evidence.uploaded_by = ( SELECT auth.uid() AS uid)) AND (evidence.upload_expires_at > statement_timestamp())))))'
      AND expression_sha256 =
        'f3542c42cd2d2129af881cb7cc610772657c984f9f37e75335b4f599b3282e9e'
      AND exact_expression NOT LIKE
        '%evidence.bucket_id = evidence.bucket_id%'
      AND relation_dependencies = ARRAY[
        'public.student_counseling_progression_evidence',
        'storage.objects'
      ]::text[]
      AND function_dependencies = ARRAY[
        'auth.uid()',
        'public.has_active_verified_kgeo_role(p_role public.user_role)'
      ]::text[]
    ),
    pg_catalog.format(
      'count=%s; role must be authenticated; reviewed WITH CHECK and dependencies must remain exact',
      pg_catalog.count(*)
    )
  FROM hashed_insert_policy_contracts
  WHERE polname =
    'progression_evidence_object_insert_counselor'

  UNION ALL

  SELECT
    'STORAGE_INSERT_MARKSHEET_EXACT',
    pg_catalog.count(*) = 1
    AND pg_catalog.bool_and(
      polcmd = 'a'
      AND polpermissive IS TRUE
      AND polroles = ARRAY[0::oid]
      AND polqual IS NULL
      AND polwithcheck IS NOT NULL
      AND expression_sha256 =
        '8341117815b25e65a2b904aeb6b00b4b4f1934e0e5a7ba3b171fbff371f53d35'
      AND relation_dependencies =
        ARRAY['storage.objects']::text[]
      AND function_dependencies = ARRAY[
        'auth.uid()',
        'storage.foldername(name text)'
      ]::text[]
    ),
    pg_catalog.format(
      'count=%s; sha=%s; role=PUBLIC',
      pg_catalog.count(*),
      COALESCE(pg_catalog.max(expression_sha256), '<missing>')
    )
  FROM hashed_insert_policy_contracts
  WHERE polname = 'students upload own marksheets'

  UNION ALL

  SELECT
    'STORAGE_INSERT_APPLICATION_DOCUMENT_EXACT',
    pg_catalog.count(*) = 1
    AND pg_catalog.bool_and(
      polcmd = 'a'
      AND polpermissive IS TRUE
      AND polroles = ARRAY[
        (SELECT authenticated_oid FROM database_roles)
      ]::oid[]
      AND polqual IS NULL
      AND polwithcheck IS NOT NULL
      AND exact_expression =
        '((bucket_id = ''university-application-documents''::text) AND ( SELECT public.can_upload_university_application_document_object(objects.bucket_id, objects.name) AS can_upload_university_application_document_object))'
      AND relation_dependencies =
        ARRAY['storage.objects']::text[]
      AND function_dependencies = ARRAY[
        'public.can_upload_university_application_document_object(p_bucket_id text, p_storage_path text)'
      ]::text[]
    ),
    pg_catalog.format(
      'count=%s; role must be authenticated; helper delegation and dependencies must remain exact',
      pg_catalog.count(*)
    )
  FROM hashed_insert_policy_contracts
  WHERE polname =
    'university_application_document_object_insert_counselor'

  UNION ALL

  SELECT
    'STORAGE_SELECT_ALL_COMPLETE_INVENTORY',
    pg_catalog.count(*) = 3
    AND pg_catalog.array_agg(
      polname ORDER BY polname
    ) = ARRAY[
      'progression_evidence_object_select_counselor',
      'students read own marksheets',
      'university_application_document_object_select_counselor'
    ]::name[],
    pg_catalog.format(
      'count=%s; names=%s',
      pg_catalog.count(*),
      COALESCE(
        pg_catalog.array_to_string(
          pg_catalog.array_agg(polname ORDER BY polname),
          ', '
        ),
        '<none>'
      )
    )
  FROM applicable_select_policies

  UNION ALL

  SELECT
    'STORAGE_SELECT_PROGRESSION_EXACT',
    pg_catalog.count(*) = 1
    AND pg_catalog.bool_and(
      polcmd = 'r'
      AND polpermissive IS TRUE
      AND polroles = ARRAY[
        (SELECT authenticated_oid FROM database_roles)
      ]::oid[]
      AND polqual IS NOT NULL
      AND polwithcheck IS NULL
      AND exact_expression =
        '((bucket_id = ''counseling-progression-evidence''::text) AND ( SELECT public.has_active_verified_kgeo_role(''counselor''::public.user_role) AS has_active_verified_kgeo_role) AND (EXISTS ( SELECT 1 FROM public.student_counseling_progression_evidence evidence WHERE ((evidence.bucket_id = objects.bucket_id) AND (evidence.storage_path = objects.name) AND (evidence.status = ''available''::public.counseling_progression_evidence_status)))))'
      AND expression_sha256 =
        '13b53eec7193e7b3ac31f322a8e538e4573dd817799f935fd3ae88dc68fb26db'
      AND exact_expression NOT LIKE
        '%evidence.bucket_id = evidence.bucket_id%'
      AND relation_dependencies = ARRAY[
        'public.student_counseling_progression_evidence',
        'storage.objects'
      ]::text[]
      AND function_dependencies = ARRAY[
        'public.has_active_verified_kgeo_role(p_role public.user_role)'
      ]::text[]
    ),
    pg_catalog.format(
      'count=%s; sha=%s; role must be authenticated; cross-object bucket binding must be objects.bucket_id',
      pg_catalog.count(*),
      COALESCE(pg_catalog.max(expression_sha256), '<missing>')
    )
  FROM hashed_select_policy_contracts
  WHERE polname =
    'progression_evidence_object_select_counselor'

  UNION ALL

  SELECT
    'STORAGE_SELECT_MARKSHEET_EXACT',
    pg_catalog.count(*) = 1
    AND pg_catalog.bool_and(
      polcmd = 'r'
      AND polpermissive IS TRUE
      AND polroles = ARRAY[0::oid]
      AND polqual IS NOT NULL
      AND polwithcheck IS NULL
      AND expression_sha256 =
        '8341117815b25e65a2b904aeb6b00b4b4f1934e0e5a7ba3b171fbff371f53d35'
      AND relation_dependencies =
        ARRAY['storage.objects']::text[]
      AND function_dependencies = ARRAY[
        'auth.uid()',
        'storage.foldername(name text)'
      ]::text[]
    ),
    pg_catalog.format(
      'count=%s; sha=%s; role=PUBLIC',
      pg_catalog.count(*),
      COALESCE(pg_catalog.max(expression_sha256), '<missing>')
    )
  FROM hashed_select_policy_contracts
  WHERE polname = 'students read own marksheets'

  UNION ALL

  SELECT
    'STORAGE_SELECT_APPLICATION_DOCUMENT_EXACT',
    pg_catalog.count(*) = 1
    AND pg_catalog.bool_and(
      polcmd = 'r'
      AND polpermissive IS TRUE
      AND polroles = ARRAY[
        (SELECT authenticated_oid FROM database_roles)
      ]::oid[]
      AND polqual IS NOT NULL
      AND polwithcheck IS NULL
      AND exact_expression =
        '((bucket_id = ''university-application-documents''::text) AND ( SELECT public.can_view_university_application_document_object(objects.bucket_id, objects.name) AS can_view_university_application_document_object))'
      AND expression_sha256 =
        '6541f826c64d04151b42aedaa257077f88053ae1ea2712ba0b54898ac5614873'
      AND relation_dependencies =
        ARRAY['storage.objects']::text[]
      AND function_dependencies = ARRAY[
        'public.can_view_university_application_document_object(p_bucket_id text, p_storage_path text)'
      ]::text[]
    ),
    pg_catalog.format(
      'count=%s; sha=%s; role must be authenticated',
      pg_catalog.count(*),
      COALESCE(pg_catalog.max(expression_sha256), '<missing>')
    )
  FROM hashed_select_policy_contracts
  WHERE polname =
    'university_application_document_object_select_counselor'

  UNION ALL

  SELECT
    'RESUME_UPLOAD_DEFERRED',
    NOT EXISTS (
      SELECT 1
      FROM applicable_insert_policies
      WHERE pg_catalog.lower(polname::text) LIKE '%resume%'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM applicable_select_policies
      WHERE pg_catalog.lower(polname::text) LIKE '%resume%'
    ),
    'Resume Upload is intentionally absent from the approved INSERT/ALL and SELECT/ALL inventories'

  UNION ALL

  SELECT
    'DIAGNOSTIC_INCOMPATIBLE_PROGRESSION_RESERVATIONS',
    row_count = 0,
    pg_catalog.format(
      'incompatible_progression_reservations=%s',
      row_count
    )
  FROM incompatible_progression_reservations

  UNION ALL

  SELECT
    'DIAGNOSTIC_INCOMPATIBLE_APPLICATION_DOCUMENT_RESERVATIONS',
    row_count = 0,
    pg_catalog.format(
      'incompatible_application_document_reservations=%s',
      row_count
    )
  FROM incompatible_document_reservations
),
output_rows(sort_order, check_name, passed, details) AS (
  SELECT
    10,
    mandatory.check_name,
    COALESCE(mandatory.passed, false),
    mandatory.details
  FROM mandatory_checks AS mandatory

  UNION ALL

  SELECT
    99,
    'FINAL_A1_4_2B_PREFLIGHT',
    COALESCE(pg_catalog.bool_and(mandatory.passed), false),
    CASE
      WHEN COALESCE(pg_catalog.bool_and(mandatory.passed), false)
      THEN CASE
        WHEN (
          SELECT candidate_count
          FROM migration_001_helper_state
        ) = 0
        THEN
          'all mandatory checks passed; approved pre-001 state: apply Migration 001, rerun this preflight, and apply Migration 002 only after MIGRATION_001_HELPER_STATE reports exact'
        ELSE
          'all mandatory checks passed; Migration 001 helper is exact and staging is preflight-ready for Migration 002'
      END
      ELSE pg_catalog.format(
        '%s of %s mandatory checks failed; stop deployment',
        pg_catalog.count(*) FILTER (
          WHERE NOT COALESCE(mandatory.passed, false)
        ),
        pg_catalog.count(*)
      )
    END
  FROM mandatory_checks AS mandatory
)
SELECT
  output.check_name,
  output.passed,
  output.details
FROM output_rows AS output
ORDER BY output.sort_order, output.check_name;

ROLLBACK;

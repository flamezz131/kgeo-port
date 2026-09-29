import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const helperMigration = read(
  "../../../supabase/migrations/202608130001_primary_counselor_storage_authorization_helpers.sql",
);
const enforcementMigration = read(
  "../../../supabase/migrations/202608130002_primary_counselor_case_ownership_enforcement.sql",
);
const progressionMigration = read(
  "../../../supabase/migrations/202607260001_progression_evidence_foundation.sql",
);
const documentMigration = read(
  "../../../supabase/migrations/202608010001_university_application_documents_foundation.sql",
);
const databaseDocumentation = read("../../../docs/database.md");
const readiness = read("../../../supabase/verification/pre_phase_c2_readiness.sql");
const migration = `${helperMigration}\n${enforcementMigration}`;

function normalizedSha256(value: string): string {
  return createHash("sha256")
    .update(value.replace(/\r\n?/g, "\n"))
    .digest("hex");
}

function extractFunctionBody(source: string, functionName: string): string {
  const declaration = new RegExp(
    `create (?:or replace )?function public\\.${functionName}\\b`,
  );
  const functionStart = source.search(declaration);
  assert.ok(functionStart >= 0);
  const delimiter = "$function$";
  const bodyStart = source.indexOf(`as ${delimiter}`, functionStart) +
    `as ${delimiter}`.length;
  const bodyEnd = source.indexOf(`${delimiter};`, bodyStart);
  assert.ok(bodyStart >= delimiter.length);
  assert.ok(bodyEnd > bodyStart);
  return source.slice(bodyStart, bodyEnd);
}

const approvedProgressionContract =
  "((bucket_id = 'counseling-progression-evidence'::text) AND ( SELECT public.has_active_verified_kgeo_role('counselor'::public.user_role) AS has_active_verified_kgeo_role) AND (EXISTS ( SELECT 1 FROM public.student_counseling_progression_evidence evidence WHERE ((evidence.bucket_id = objects.bucket_id) AND (evidence.storage_path = objects.name) AND (evidence.status = 'pending'::public.counseling_progression_evidence_status) AND (evidence.uploaded_by = ( SELECT auth.uid() AS uid)) AND (evidence.upload_expires_at > statement_timestamp())))))";
const approvedDocumentContract =
  "((bucket_id = 'university-application-documents'::text) AND ( SELECT public.can_upload_university_application_document_object(objects.bucket_id, objects.name) AS can_upload_university_application_document_object))";
const approvedProgressionSelectContract =
  "((bucket_id = 'counseling-progression-evidence'::text) AND ( SELECT public.has_active_verified_kgeo_role('counselor'::public.user_role) AS has_active_verified_kgeo_role) AND (EXISTS ( SELECT 1 FROM public.student_counseling_progression_evidence evidence WHERE ((evidence.bucket_id = objects.bucket_id) AND (evidence.storage_path = objects.name) AND (evidence.status = 'available'::public.counseling_progression_evidence_status)))))";
const approvedDocumentSelectContract =
  "((bucket_id = 'university-application-documents'::text) AND ( SELECT public.can_view_university_application_document_object(objects.bucket_id, objects.name) AS can_view_university_application_document_object))";

function policyExpressionSha256(value: string): string {
  return createHash("sha256")
    .update(value.replace(/\r\n?/g, "\n").trim().replace(/\s+/g, " "))
    .digest("hex");
}

type StoragePolicyContract = {
  command: "INSERT" | "ALL" | "SELECT";
  contract: string | null;
  expressionSha256: string;
  mode: "PERMISSIVE" | "RESTRICTIVE";
  name: string;
  functionDependencies: string[];
  relation: string;
  relationDependencies: string[];
  roles: string[];
};

const approvedPolicies: StoragePolicyContract[] = [
  {
    command: "INSERT",
    contract: approvedProgressionContract,
    expressionSha256: policyExpressionSha256(approvedProgressionContract),
    functionDependencies: [
      "auth.uid()",
      "public.has_active_verified_kgeo_role(p_role public.user_role)",
    ],
    mode: "PERMISSIVE",
    name: "progression_evidence_object_insert_counselor",
    relation: "storage.objects",
    relationDependencies: [
      "public.student_counseling_progression_evidence",
      "storage.objects",
    ],
    roles: ["authenticated"],
  },
  {
    command: "INSERT",
    contract: approvedDocumentContract,
    expressionSha256: policyExpressionSha256(approvedDocumentContract),
    functionDependencies: [
      "public.can_upload_university_application_document_object(p_bucket_id text, p_storage_path text)",
    ],
    mode: "PERMISSIVE",
    name: "university_application_document_object_insert_counselor",
    relation: "storage.objects",
    relationDependencies: ["storage.objects"],
    roles: ["authenticated"],
  },

];

const approvedSelectPolicies: StoragePolicyContract[] = [
  {
    command: "SELECT",
    contract: approvedProgressionSelectContract,
    expressionSha256: policyExpressionSha256(approvedProgressionSelectContract),
    functionDependencies: [
      "public.has_active_verified_kgeo_role(p_role public.user_role)",
    ],
    mode: "PERMISSIVE",
    name: "progression_evidence_object_select_counselor",
    relation: "storage.objects",
    relationDependencies: [
      "public.student_counseling_progression_evidence",
      "storage.objects",
    ],
    roles: ["authenticated"],
  },
  {
    command: "SELECT",
    contract: approvedDocumentSelectContract,
    expressionSha256: policyExpressionSha256(approvedDocumentSelectContract),
    functionDependencies: [
      "public.can_view_university_application_document_object(p_bucket_id text, p_storage_path text)",
    ],
    mode: "PERMISSIVE",
    name: "university_application_document_object_select_counselor",
    relation: "storage.objects",
    relationDependencies: ["storage.objects"],
    roles: ["authenticated"],
  },

];

function acceptsExactPolicyInventory(
  policies: StoragePolicyContract[],
  approved: StoragePolicyContract[],
): boolean {
  const expected = new Map(approved.map((policy) => [policy.name, policy]));
  return policies.length === expected.size && policies.every((policy) => {
    const expectedPolicy = expected.get(policy.name);
    return expectedPolicy !== undefined &&
      policy.command === expectedPolicy.command &&
      policy.mode === expectedPolicy.mode &&
      policy.relation === expectedPolicy.relation &&
      JSON.stringify(policy.roles) === JSON.stringify(expectedPolicy.roles) &&
      policy.contract === expectedPolicy.contract &&
      policy.expressionSha256 === expectedPolicy.expressionSha256 &&
      JSON.stringify(policy.relationDependencies) ===
        JSON.stringify(expectedPolicy.relationDependencies) &&
      JSON.stringify(policy.functionDependencies) ===
        JSON.stringify(expectedPolicy.functionDependencies);
  });
}

const acceptsPolicyInventory = (policies: StoragePolicyContract[]) =>
  acceptsExactPolicyInventory(policies, approvedPolicies);

test("historical progression Storage policy is reservation gated", () => {
  const policy = databaseDocumentation.match(
    /policy name: `progression_evidence_object_insert_counselor`[\s\S]*?```sql([\s\S]*?)```/,
  )?.[1] ?? "";
  assert.match(policy, /bucket_id = 'counseling-progression-evidence'/);
  assert.match(policy, /evidence\.bucket_id = storage\.objects\.bucket_id/);
  assert.match(policy, /evidence\.storage_path = storage\.objects\.name/);
  assert.match(policy, /evidence\.status =[\s\S]*?'pending'/);
  assert.match(policy, /evidence\.uploaded_by = \(select auth\.uid\(\)\)/);
  assert.match(policy, /evidence\.upload_expires_at > pg_catalog\.statement_timestamp\(\)/);
  assert.doesNotMatch(policy, /\bor\b|\btrue\b/i);
});

test("progression reservations have one trusted RPC path and no direct mutation grant", () => {
  const prepare = progressionMigration.match(
    /create function public\.prepare_student_counseling_progression_evidence_upload[\s\S]*?\$function\$;/,
  )?.[0] ?? "";
  assert.match(prepare, /caller_id := \(select auth\.uid\(\)\)/);
  assert.match(prepare, /select event\.student_id[\s\S]*?where event\.id = p_progression_event_id/);
  assert.match(prepare, /generated_storage_path :=[\s\S]*?target_student_id::text[\s\S]*?new_evidence_id::text/);
  assert.match(prepare, /status,[\s\S]*?uploaded_by,[\s\S]*?upload_expires_at/);
  assert.match(prepare, /'pending'[\s\S]*?caller_id[\s\S]*?prepared_time \+ interval '2 hours'/);
  assert.equal(
    progressionMigration.match(
      /create function public\.prepare_student_counseling_progression_evidence_upload/g,
    )?.length,
    1,
  );
  assert.doesNotMatch(
    progressionMigration,
    /grant (?:insert|update|delete|truncate)[\s\S]*?student_counseling_progression_evidence/i,
  );
});

test("canonical helper derives exact active verified Primary Counselor access", () => {
  const helper = helperMigration.match(
    /create function public\.is_active_primary_counselor_for_student[\s\S]*?\$function\$;/,
  )?.[0] ?? "";
  assert.match(helper, /assignment\.counselor_id = \(select auth\.uid\(\)\)/);
  assert.match(helper, /assignment\.ended_at is null/);
  assert.match(helper, /counselor_profile\.role = 'counselor'/);
  assert.match(helper, /counselor_profile\.is_active is true/);
  assert.match(helper, /counselor_auth\.email_confirmed_at is not null/);
  assert.match(helper, /security definer/);
  assert.match(helper, /set search_path = ''/);
  assert.match(
    helperMigration,
    /revoke all on function public\.is_active_primary_counselor_for_student\(uuid\)[\s\S]*?from public, anon, authenticated/,
  );
  assert.doesNotMatch(helper, /p_counselor_id|assigned_counselor_id/);
  assert.doesNotMatch(helperMigration, /can_upload_progression_evidence_object/);
});

test("reservation metadata tables enforce Primary Counselor ownership", () => {
  for (const table of [
    "student_counseling_progression_evidence",
    "student_university_application_documents",
  ]) {
    assert.match(
      enforcementMigration,
      new RegExp(`before insert or update or delete[\\s\\S]*?on public\\.${table}`),
    );
  }
  assert.match(
    enforcementMigration,
    /is_active_primary_counselor_for_student\(v_student_id\)[\s\S]*?is not true then/,
  );
});

test("application-document Storage helper independently requires current ownership", () => {
  const helper = enforcementMigration.match(
    /create or replace function public\.can_upload_university_application_document_object[\s\S]*?\$function\$;/,
  )?.[0] ?? "";
  assert.match(helper, /p_bucket_id = 'university-application-documents'/);
  assert.match(helper, /application\.is_archived is false/);
  assert.match(helper, /document\.storage_path = p_storage_path/);
  assert.match(helper, /document\.status =[\s\S]*?'pending'/);
  assert.match(helper, /document\.uploaded_by = \(select auth\.uid\(\)\)/);
  assert.match(helper, /document\.upload_expires_at > pg_catalog\.statement_timestamp\(\)/);
  assert.match(helper, /is_active_primary_counselor_for_student/);
  assert.doesNotMatch(helper, /p_student_id|p_counselor_id/);
  assert.match(
    databaseDocumentation,
    /university_application_document_object_insert_counselor[\s\S]*?can_upload_university_application_document_object/,
  );
  assert.match(documentMigration, /grant execute on function[\s\S]*?can_upload_university_application_document_object[\s\S]*?to authenticated/);
});

test("applicable Storage INSERT policies use the exact current-V1 three-policy inventory", () => {
  assert.equal(acceptsPolicyInventory(approvedPolicies), true);
  assert.match(enforcementMigration, /with recursive applicable_roles/);
  assert.match(enforcementMigration, /from pg_catalog\.pg_auth_members/);
  assert.match(enforcementMigration, /policy_record\.polcmd in \('a', '\*'\)/);
  assert.match(enforcementMigration, /policy_role\.role_oid = 0/);
  assert.match(enforcementMigration, /v_applicable_policy_count <> 2/);
  assert.match(enforcementMigration, /progression_evidence_object_insert_counselor/);
  assert.match(enforcementMigration, /university_application_document_object_insert_counselor/);

  assert.doesNotMatch(enforcementMigration, /students upload own resumes/);
  assert.doesNotMatch(readiness, /students upload own resumes/);
  assert.match(databaseDocumentation, /Resume upload will be available in a later release\./);
});

test("unexpected fourth INSERT ALL PUBLIC and inherited policies fail the allowlist", () => {
  for (const unexpected of [
    { ...approvedPolicies[0], name: "unexpected_insert" },
    { ...approvedPolicies[0], command: "ALL" as const, name: "unexpected_all" },
    { ...approvedPolicies[0], name: "unexpected_public", roles: ["PUBLIC"] },
    { ...approvedPolicies[0], name: "unexpected_inherited", roles: ["uploaders"] },
  ]) {
    assert.equal(acceptsPolicyInventory([...approvedPolicies, unexpected]), false);
  }
});

test("broadened static policy expressions and metadata fail exact contracts", () => {
  for (const changed of [
    { ...approvedPolicies[0], contract: `true OR ${approvedProgressionContract}` },
    { ...approvedPolicies[0], contract: approvedProgressionContract.replace("counseling-progression-evidence", "%") },
    { ...approvedPolicies[0], roles: ["PUBLIC"] },
    { ...approvedPolicies[0], mode: "RESTRICTIVE" as const },
    { ...approvedPolicies[0], command: "ALL" as const },
  ]) {
    assert.equal(
      acceptsPolicyInventory([changed, ...approvedPolicies.slice(1)]),
      false,
    );
  }
  assert.match(enforcementMigration, /pg_catalog\.pg_get_expr\([\s\S]*?false/);
  assert.match(enforcementMigration, /v_progression_expression <>[\s\S]*?v_document_expression <>/);
  assert.match(enforcementMigration, /set local search_path = ''/);
  assert.doesNotMatch(
    enforcementMigration.match(/do \$reservation_gate_prerequisite\$[\s\S]*?\$reservation_gate_prerequisite\$;/)?.[0] ?? "",
    /\blike\b/i,
  );
  for (const lossyReplacement of [
    /'public\.',\s*''/,
    /'storage\.',\s*''/,
    /'auth\.',\s*''/,
    /'pg_catalog\.',\s*''/,
  ]) {
    assert.doesNotMatch(enforcementMigration, lossyReplacement);
  }
});

test("progression INSERT uses the exact secure pg_get_expr alias rendering", () => {
  const noncanonicalAsContract = approvedProgressionContract.replace(
    "student_counseling_progression_evidence evidence",
    "student_counseling_progression_evidence AS evidence",
  );
  const unsafeSelfComparison = approvedProgressionContract.replace(
    "evidence.bucket_id = objects.bucket_id",
    "evidence.bucket_id = evidence.bucket_id",
  );
  const protectedBucketBroadening = approvedProgressionContract.replace(
    "bucket_id = 'counseling-progression-evidence'::text",
    "bucket_id IN ('counseling-progression-evidence'::text, 'university-application-documents'::text)",
  );
  const progressionInsertIndex = 0;

  assert.equal(
    policyExpressionSha256(approvedProgressionContract),
    "f3542c42cd2d2129af881cb7cc610772657c984f9f37e75335b4f599b3282e9e",
  );
  assert.notEqual(
    policyExpressionSha256(noncanonicalAsContract),
    policyExpressionSha256(approvedProgressionContract),
  );
  assert.match(
    enforcementMigration,
    /student_counseling_progression_evidence evidence WHERE/,
  );
  assert.doesNotMatch(
    enforcementMigration,
    /student_counseling_progression_evidence AS evidence WHERE/,
  );

  for (const changedPolicy of [
    {
      ...approvedPolicies[progressionInsertIndex],
      contract: noncanonicalAsContract,
      expressionSha256: policyExpressionSha256(noncanonicalAsContract),
    },
    {
      ...approvedPolicies[progressionInsertIndex],
      contract: unsafeSelfComparison,
      expressionSha256: policyExpressionSha256(unsafeSelfComparison),
    },
    {
      ...approvedPolicies[progressionInsertIndex],
      contract: "true",
      expressionSha256: policyExpressionSha256("true"),
    },
    {
      ...approvedPolicies[progressionInsertIndex],
      contract: `${approvedProgressionContract} OR true`,
      expressionSha256: policyExpressionSha256(
        `${approvedProgressionContract} OR true`,
      ),
    },
    {
      ...approvedPolicies[progressionInsertIndex],
      contract: protectedBucketBroadening,
      expressionSha256: policyExpressionSha256(protectedBucketBroadening),
    },
    {
      ...approvedPolicies[progressionInsertIndex],
      functionDependencies: ["public.unreviewed_storage_helper()"],
    },
  ]) {
    assert.equal(
      acceptsPolicyInventory([
        changedPolicy,
        ...approvedPolicies.slice(1),
      ]),
      false,
    );
  }
});



test("progression INSERT rejects PUBLIC while reviewed unrelated PUBLIC policies pass", () => {
  assert.equal(acceptsPolicyInventory(approvedPolicies), true);
  assert.equal(
    acceptsPolicyInventory([
      { ...approvedPolicies[0], roles: ["PUBLIC"] },
      ...approvedPolicies.slice(1),
    ]),
    false,
  );
  assert.equal(
    acceptsPolicyInventory([
      ...approvedPolicies,
      { ...approvedPolicies[2], name: "unreviewed_public_policy" },
    ]),
    false,
  );
});

test("progression SELECT rejects PUBLIC and application-document contracts stay authenticated", () => {
  assert.equal(
    acceptsExactPolicyInventory(approvedSelectPolicies, approvedSelectPolicies),
    true,
  );
  assert.deepEqual(approvedPolicies[1].roles, ["authenticated"]);
  assert.deepEqual(approvedSelectPolicies[1].roles, ["authenticated"]);
  assert.equal(
    acceptsExactPolicyInventory(
      [
        { ...approvedSelectPolicies[0], roles: ["PUBLIC"] },
        ...approvedSelectPolicies.slice(1),
      ],
      approvedSelectPolicies,
    ),
    false,
  );
  assert.match(
    enforcementMigration,
    /progression_evidence_object_select_counselor[\s\S]*?policy_record\.polroles = array\[v_authenticated_role_oid\]/,
  );
  assert.match(
    readiness,
    /progression evidence Storage SELECT policy contract is exact/,
  );
  assert.match(
    enforcementMigration,
    /v_applicable_select_policy_count <> 2/,
  );
  assert.match(enforcementMigration, /'counseling-progression-evidence'/);
  assert.match(enforcementMigration, /'university-application-documents'/);
});

test("progression SELECT uses the exact secure pg_get_expr alias rendering", () => {
  const previousAsRenderedContract = approvedProgressionSelectContract.replace(
    "student_counseling_progression_evidence evidence",
    "student_counseling_progression_evidence AS evidence",
  );
  assert.equal(
    policyExpressionSha256(approvedProgressionSelectContract),
    "13b53eec7193e7b3ac31f322a8e538e4573dd817799f935fd3ae88dc68fb26db",
  );
  assert.equal(
    previousAsRenderedContract.replace(" AS evidence", " evidence"),
    approvedProgressionSelectContract,
  );
  assert.notEqual(
    policyExpressionSha256(previousAsRenderedContract),
    policyExpressionSha256(approvedProgressionSelectContract),
  );

  const unsafeSelfComparison = approvedProgressionSelectContract.replace(
    "evidence.bucket_id = objects.bucket_id",
    "evidence.bucket_id = evidence.bucket_id",
  );
  const progressionSelectIndex = 0;
  for (const changedPolicy of [
    {
      ...approvedSelectPolicies[progressionSelectIndex],
      contract: previousAsRenderedContract,
      expressionSha256: policyExpressionSha256(previousAsRenderedContract),
    },
    {
      ...approvedSelectPolicies[progressionSelectIndex],
      contract: unsafeSelfComparison,
      expressionSha256: policyExpressionSha256(unsafeSelfComparison),
    },
    {
      ...approvedSelectPolicies[progressionSelectIndex],
      contract: "true",
      expressionSha256: policyExpressionSha256("true"),
    },
    {
      ...approvedSelectPolicies[progressionSelectIndex],
      functionDependencies: ["public.unreviewed_storage_helper()"],
    },
  ]) {
    assert.equal(
      acceptsExactPolicyInventory(
        [changedPolicy, ...approvedSelectPolicies.slice(1)],
        approvedSelectPolicies,
      ),
      false,
    );
  }
  assert.doesNotMatch(
    approvedProgressionSelectContract,
    /evidence\.bucket_id = evidence\.bucket_id/,
  );
});



test("complete SELECT ALL inventory rejects unrelated names PUBLIC inherited ALL and helpers", () => {
  const unrelatedPolicies: StoragePolicyContract[] = [
    {
      ...approvedSelectPolicies[0],
      contract: "true",
      expressionSha256: policyExpressionSha256("true"),
      name: "unrelated_select_true",
    },
    {
      ...approvedSelectPolicies[0],
      contract: "true",
      expressionSha256: policyExpressionSha256("true"),
      name: "public_select_true",
      roles: ["PUBLIC"],
    },
    {
      ...approvedSelectPolicies[0],
      name: "inherited_select",
      roles: ["storage_reader_parent"],
    },
    {
      ...approvedSelectPolicies[0],
      command: "ALL",
      name: "unexpected_all",
    },
    {
      ...approvedSelectPolicies[0],
      contract: "public.can_read_protected_storage_object(bucket_id, name)",
      expressionSha256: policyExpressionSha256(
        "public.can_read_protected_storage_object(bucket_id, name)",
      ),
      functionDependencies: [
        "public.can_read_protected_storage_object(p_bucket_id text, p_storage_path text)",
      ],
      name: "generic_object_reader",
    },
  ];

  for (const unexpected of unrelatedPolicies) {
    assert.equal(
      acceptsExactPolicyInventory(
        [...approvedSelectPolicies, unexpected],
        approvedSelectPolicies,
      ),
      false,
    );
  }

  const migrationInventory = enforcementMigration.match(
    /applicable_select_policies as \([\s\S]*?from applicable_select_policies as policy_name/,
  )?.[0] ?? "";
  const readinessInventory = readiness.match(
    /applicable_select_policies as \([\s\S]*?select_policy_contracts as/,
  )?.[0] ?? "";
  for (const inventory of [migrationInventory, readinessInventory]) {
    assert.match(inventory, /policy_record\.polcmd in \('r', '\*'\)/);
    assert.match(inventory, /policy_role\.role_oid = 0/);
    assert.doesNotMatch(inventory, /pg_catalog\.strpos|policy_record\.polname in/);
    assert.doesNotMatch(
      inventory,
      /counseling-progression-evidence|university-application-documents/,
    );
  }
});

test("policy dependencies reject same-named objects in another schema", () => {
  const alternateRelation = {
    ...approvedPolicies[0],
    relationDependencies: [
      "storage.student_counseling_progression_evidence",
      "storage.objects",
    ],
  };
  const alternateRoleHelper = {
    ...approvedPolicies[0],
    functionDependencies: [
      "auth.uid()",
      "storage.has_active_verified_kgeo_role(p_role public.user_role)",
    ],
  };
  const alternateDocumentHelper = {
    ...approvedPolicies[1],
    functionDependencies: [
      "storage.can_upload_university_application_document_object(p_bucket_id text, p_storage_path text)",
    ],
  };
  for (const policies of [
    [alternateRelation, ...approvedPolicies.slice(1)],
    [alternateRoleHelper, ...approvedPolicies.slice(1)],
    [approvedPolicies[0], alternateDocumentHelper, ...approvedPolicies.slice(2)],
  ]) {
    assert.equal(acceptsPolicyInventory(policies), false);
  }
  assert.match(enforcementMigration, /from pg_catalog\.pg_depend/);
  assert.match(enforcementMigration, /'pg_catalog\.pg_policy'::pg_catalog\.regclass/);
  assert.match(enforcementMigration, /'pg_catalog\.pg_class'::pg_catalog\.regclass/);
  assert.match(enforcementMigration, /'pg_catalog\.pg_proc'::pg_catalog\.regclass/);
  assert.match(readiness, /relation_dependencies = array\[/);
  assert.match(readiness, /function_dependencies = array\[/);
});

test("reservation locks close the scan-to-trigger installation window", () => {
  const lockPosition = enforcementMigration.indexOf("lock table");
  const progressionScanPosition = enforcementMigration.indexOf(
    "into v_incompatible_progression_reservations",
  );
  const documentScanPosition = enforcementMigration.indexOf(
    "into v_incompatible_document_reservations",
  );
  const evidenceTriggerPosition = enforcementMigration.indexOf(
    "create trigger enforce_primary_counselor_case_on_progression_evidence",
  );
  assert.ok(lockPosition > enforcementMigration.indexOf("begin;"));
  assert.ok(lockPosition < progressionScanPosition);
  assert.ok(lockPosition < documentScanPosition);
  assert.ok(lockPosition < evidenceTriggerPosition);
  assert.ok(evidenceTriggerPosition < enforcementMigration.lastIndexOf("commit;"));
  assert.match(
    enforcementMigration.slice(lockPosition, progressionScanPosition),
    /public\.student_counseling_progression_evidence,[\s\S]*?public\.student_university_application_documents[\s\S]*?in share row exclusive mode;/,
  );
  assert.equal(
    enforcementMigration.match(/\block table\b/gi)?.length,
    1,
  );
});

test("complete function hashes reject permissive early returns and retained keywords", () => {
  const functions = [
    {
      expected: "dbafccbd4bae61d5e20bce09ee3b66075664dc23f69943235344c3d123b9fb6b",
      name: "is_active_primary_counselor_for_student",
      source: helperMigration,
    },
    {
      expected: "7ee591ff22d8ff5678603d7871bae9e8b74eca5821e096c853b31cf31992e69f",
      name: "enforce_primary_counselor_student_case_row",
      source: enforcementMigration,
    },
    {
      expected: "0d4229e62145df6905dc51ec545c1c25122ee08280b99e1b2ae94e5d82c9427f",
      name: "can_upload_university_application_document_object",
      source: enforcementMigration,
    },
  ];
  for (const contract of functions) {
    const body = extractFunctionBody(contract.source, contract.name);
    assert.equal(normalizedSha256(body), contract.expected);
    assert.match(readiness, new RegExp(contract.expected));
    assert.notEqual(normalizedSha256(`\n  return true;${body}`), contract.expected);
    assert.notEqual(
      normalizedSha256(`\n  return true or false;${body}`),
      contract.expected,
    );
    assert.notEqual(
      normalizedSha256(`\n  if true then return new; end if;${body}`),
      contract.expected,
    );
  }
  const exactFunctionSection = readiness.match(
    /-- Phase A1\.4\.2B exact installed function[\s\S]*?order by check_name;/,
  )?.[0] ?? "";
  assert.doesNotMatch(exactFunctionSection, /definition\)\s+(?:not\s+)?like|definition\s+(?:not\s+)?like/i);
  assert.match(exactFunctionSection, /procedure\.prosrc/);
  assert.match(exactFunctionSection, /pg_catalog\.sha256/);
  assert.match(exactFunctionSection, /pg_catalog\.aclexplode/);
});

test("complete protected-table trigger inventory rejects every unexpected trigger", () => {
  type TriggerContract = {
    argumentsHex: string;
    constraintOid: number;
    deferrable: boolean;
    enabled: "O" | "D";
    events: string;
    functionIdentity: string;
    initiallyDeferred: boolean;
    newTransitionTable: string | null;
    oldTransitionTable: string | null;
    relation: string;
    triggerName: string;
    whenExpression: string | null;
  };

  const trigger = (
    triggerName: string,
    relation: string,
    functionIdentity: string,
    events: string,
  ): TriggerContract => ({
    argumentsHex: "",
    constraintOid: 0,
    deferrable: false,
    enabled: "O",
    events,
    functionIdentity,
    initiallyDeferred: false,
    newTransitionTable: null,
    oldTransitionTable: null,
    relation,
    triggerName,
    whenExpression: null,
  });
  const historicalTriggers = [
    trigger(
      "counselor_student_notes_10_prepare",
      "public.counselor_student_notes",
      "public.prepare_counselor_private_record()",
      "BEFORE ROW INSERT UPDATE",
    ),
    trigger(
      "counselor_student_notes_20_normalize",
      "public.counselor_student_notes",
      "public.normalize_counselor_student_note()",
      "BEFORE ROW INSERT UPDATE",
    ),
    trigger(
      "counselor_follow_ups_10_prepare",
      "public.counselor_follow_ups",
      "public.prepare_counselor_private_record()",
      "BEFORE ROW INSERT UPDATE",
    ),
    trigger(
      "counselor_follow_ups_20_normalize",
      "public.counselor_follow_ups",
      "public.normalize_counselor_follow_up()",
      "BEFORE ROW INSERT UPDATE",
    ),
  ];
  const ownershipTriggers = [
    trigger("enforce_primary_counselor_case_on_notes", "public.counselor_student_notes", "public.enforce_primary_counselor_student_case_row()", "BEFORE ROW INSERT UPDATE DELETE"),
    trigger("enforce_primary_counselor_case_on_follow_ups", "public.counselor_follow_ups", "public.enforce_primary_counselor_student_case_row()", "BEFORE ROW INSERT UPDATE DELETE"),
    trigger("enforce_primary_counselor_case_on_progressions", "public.student_counseling_progressions", "public.enforce_primary_counselor_student_case_row()", "BEFORE ROW INSERT UPDATE DELETE"),
    trigger("enforce_primary_counselor_case_on_applications", "public.student_university_applications", "public.enforce_primary_counselor_student_case_row()", "BEFORE ROW INSERT UPDATE DELETE"),
    trigger("enforce_primary_counselor_case_on_progression_evidence", "public.student_counseling_progression_evidence", "public.enforce_primary_counselor_progression_evidence()", "BEFORE ROW INSERT UPDATE DELETE"),
    trigger("enforce_primary_counselor_case_on_application_documents", "public.student_university_application_documents", "public.enforce_primary_counselor_application_document()", "BEFORE ROW INSERT UPDATE DELETE"),
  ];
  const postInstallTriggers = [...historicalTriggers, ...ownershipTriggers];
  const accepts = (
    expected: TriggerContract[],
    candidate: TriggerContract[],
  ) => {
    const sort = (contracts: TriggerContract[]) =>
      [...contracts].sort((left, right) =>
        `${left.relation}.${left.triggerName}`.localeCompare(
          `${right.relation}.${right.triggerName}`,
        )
      );
    return JSON.stringify(sort(candidate)) === JSON.stringify(sort(expected));
  };

  assert.equal(accepts(historicalTriggers, historicalTriggers), true);
  assert.equal(accepts(postInstallTriggers, postInstallTriggers), true);

  const maliciousLaterSortingTrigger = `
    create function public.zzz_mutate_student_after_primary_guard()
    returns trigger language plpgsql as $function$
    begin
      new.student_id := '00000000-0000-0000-0000-000000000000'::uuid;
      return new;
    end;
    $function$;
    create trigger zzz_mutate_student_after_primary_guard
    before insert or update on public.counselor_student_notes
    for each row execute function
      public.zzz_mutate_student_after_primary_guard();
  `;
  assert.match(maliciousLaterSortingTrigger, /new\.student_id\s*:=/);
  assert.match(maliciousLaterSortingTrigger, /zzz_mutate_student_after_primary_guard/);
  assert.doesNotMatch(
    maliciousLaterSortingTrigger,
    /create trigger enforce_primary_counselor_case_on_/,
  );

  const unexpectedTriggers = [
    trigger(
      "zzz_mutate_student_after_primary_guard",
      "public.counselor_student_notes",
      "public.zzz_mutate_student_after_primary_guard()",
      "BEFORE ROW INSERT UPDATE",
    ),
    trigger(
      "aaa_unexpected_trigger",
      "public.counselor_student_notes",
      "public.aaa_unexpected_trigger()",
      "BEFORE ROW INSERT UPDATE",
    ),
    trigger(
      "unrelated_name_update_trigger",
      "public.student_university_applications",
      "public.unrelated_name_update_trigger()",
      "BEFORE ROW UPDATE",
    ),
    trigger(
      "unexpected_after_row",
      "public.student_counseling_progressions",
      "public.unexpected_after_row()",
      "AFTER ROW INSERT UPDATE",
    ),
    trigger(
      "unexpected_before_statement",
      "public.student_counseling_progression_evidence",
      "public.unexpected_before_statement()",
      "BEFORE STATEMENT INSERT UPDATE",
    ),
    trigger(
      "unexpected_update_only",
      "public.student_university_application_documents",
      "public.unexpected_update_only()",
      "BEFORE ROW UPDATE",
    ),
    trigger(
      "unexpected_insert_update",
      "public.counselor_follow_ups",
      "public.unexpected_insert_update()",
      "BEFORE ROW INSERT UPDATE",
    ),
    {
      ...trigger(
        "disabled_unexpected_trigger",
        "public.counselor_student_notes",
        "public.disabled_unexpected_trigger()",
        "BEFORE ROW INSERT UPDATE",
      ),
      enabled: "D" as const,
    },
  ];
  for (const unexpected of unexpectedTriggers) {
    assert.equal(accepts(historicalTriggers, [...historicalTriggers, unexpected]), false);
    assert.equal(accepts(postInstallTriggers, [...postInstallTriggers, unexpected]), false);
  }

  assert.equal(accepts(postInstallTriggers, postInstallTriggers.slice(0, -1)), false);
  assert.equal(
    accepts(postInstallTriggers, [
      ...postInstallTriggers.slice(0, -1),
      trigger(
        "replacement_with_unrelated_name",
        "public.student_university_application_documents",
        "public.enforce_primary_counselor_application_document()",
        "BEFORE ROW INSERT UPDATE DELETE",
      ),
    ]),
    false,
  );
  assert.equal(
    accepts(postInstallTriggers, postInstallTriggers.map((candidate) =>
      candidate.triggerName === "enforce_primary_counselor_case_on_progression_evidence"
        ? { ...candidate, functionIdentity: "storage.enforce_primary_counselor_progression_evidence()" }
        : candidate
    )),
    false,
  );

  const inventorySections = [
    enforcementMigration.match(
      /expected_pre_triggers[\s\S]*?select \* from actual_pre_triggers[\s\S]*?except[\s\S]*?select \* from expected_pre_triggers/,
    )?.[0] ?? "",
    enforcementMigration.match(
      /expected_post_triggers[\s\S]*?select \* from actual_post_triggers[\s\S]*?except[\s\S]*?select \* from expected_post_triggers/,
    )?.[0] ?? "",
    readiness.match(
      /expected_case_triggers[\s\S]*?select \* from actual_case_triggers[\s\S]*?except[\s\S]*?select \* from expected_case_triggers/,
    )?.[0] ?? "",
  ];
  for (const inventorySection of inventorySections) {
    assert.match(inventorySection, /trigger_record\.tgrelid in/);
    assert.doesNotMatch(inventorySection, /tgname\s+(?:not\s+)?like/i);
    for (const relation of [
      "counselor_student_notes",
      "counselor_follow_ups",
      "student_counseling_progressions",
      "student_university_applications",
      "student_counseling_progression_evidence",
      "student_university_application_documents",
    ]) {
      assert.match(inventorySection, new RegExp(`public\\.${relation}`));
    }
    for (const metadata of [
      "relation.oid",
      "procedure.oid",
      "trigger_record.tgtype",
      "trigger_record.tgenabled",
      "trigger_record.tgisinternal",
      "trigger_record.tgnargs",
      "trigger_record.tgargs",
      "trigger_record.tgqual",
      "trigger_record.tgconstraint",
      "trigger_record.tgdeferrable",
      "trigger_record.tginitdeferred",
      "trigger_record.tgoldtable",
      "trigger_record.tgnewtable",
    ]) {
      assert.match(inventorySection, new RegExp(metadata.replace(".", "\\.")));
    }
  }

  assert.match(enforcementMigration, /Protected relation pre-install trigger allowlist prerequisite failed/);
  assert.match(enforcementMigration, /Protected relation final trigger allowlist assertion failed/);
  assert.doesNotMatch(enforcementMigration, /tgname\s+(?:not\s+)?like/i);
  assert.doesNotMatch(readiness, /tgname\s+(?:not\s+)?like\s+'enforce_primary_counselor_case_on_%'/i);
  assert.match(readiness, /complete protected relation user-trigger inventory is exact/);
});

test("legacy incompatible pending reservations stop deployment", () => {
  const prerequisite = enforcementMigration.match(
    /do \$reservation_gate_prerequisite\$[\s\S]*?\$reservation_gate_prerequisite\$;/,
  )?.[0] ?? "";
  assert.match(prerequisite, /v_incompatible_progression_reservations/);
  assert.match(prerequisite, /evidence\.status =[\s\S]*?'pending'/);
  assert.match(prerequisite, /evidence\.upload_expires_at > pg_catalog\.statement_timestamp\(\)/);
  assert.match(prerequisite, /assignment\.counselor_id = evidence\.uploaded_by/);
  assert.match(prerequisite, /assignment\.ended_at is null/);
  assert.match(prerequisite, /if v_incompatible_progression_reservations <> 0 then[\s\S]*?raise exception/);
  assert.match(prerequisite, /v_incompatible_document_reservations/);
  assert.match(prerequisite, /assignment\.counselor_id = document\.uploaded_by/);
  assert.match(prerequisite, /if v_incompatible_document_reservations <> 0 then[\s\S]*?raise exception/);
});

test("final prerequisite runs before every case enforcement object", () => {
  const prerequisiteEnd = enforcementMigration.indexOf("$reservation_gate_prerequisite$;");
  const firstCreate = enforcementMigration.search(/\ncreate function public\./);
  assert.ok(prerequisiteEnd > 0);
  assert.ok(firstCreate > prerequisiteEnd);
  const prerequisite = enforcementMigration.slice(0, prerequisiteEnd);
  assert.doesNotMatch(prerequisite, /\b(?:alter|create|drop)\s+policy\b/i);
  assert.doesNotMatch(prerequisite, /\bset\s+(?:local\s+)?role\b/i);
  assert.doesNotMatch(prerequisite, /\bowner\s+to\b/i);
});

test("A1.4.2B contains no Storage policy or ownership DDL", () => {
  assert.doesNotMatch(migration, /\b(?:alter|create|drop)\s+policy\b/i);
  assert.doesNotMatch(migration, /\bset\s+(?:local\s+)?role\b/i);
  assert.doesNotMatch(migration, /supabase_storage_admin/i);
  assert.doesNotMatch(migration, /alter\s+(?:table|schema)[\s\S]*?owner/i);
  assert.doesNotMatch(
    migration,
    /^\s*(?:insert\s+into|update|delete\s+from)\s+storage\.objects\b/im,
  );
  assert.equal(
    existsSync(
      new URL(
        "../../../supabase/storage-owner/202608130001_progression_evidence_primary_counselor_insert_policy.sql",
        import.meta.url,
      ),
    ),
    false,
  );
});

test("every long-term mutation family is protected without changing consultation outcomes", () => {
  for (const table of [
    "counselor_student_notes",
    "counselor_follow_ups",
    "student_counseling_progressions",
    "student_counseling_progression_evidence",
    "student_university_applications",
    "student_university_application_documents",
  ]) {
    assert.match(
      enforcementMigration,
      new RegExp(`before insert or update or delete(?: on|[\\s\\S]*?on) public\\.${table}`),
    );
  }
  assert.doesNotMatch(enforcementMigration, /create or replace function public\.record_consultation_outcome/);
  assert.doesNotMatch(enforcementMigration, /update public\.consultation_requests/);
});

test("case guards fail closed for direct RPC effects and unassigned students", () => {
  assert.match(
    enforcementMigration,
    /if public\.is_active_primary_counselor_for_student\(v_student_id\)[\s\S]*?is not true then/,
  );
  assert.doesNotMatch(enforcementMigration, /else true|assignment\.ended_at is null\s+or/);
  assert.doesNotMatch(enforcementMigration, /last_changed_by\s*=|counselor_id\s*=\s*new\./);
});

test("migration preserves history and does not implement reassignment", () => {
  assert.doesNotMatch(migration, /insert into public\.student_counselor_assignments/);
  assert.doesNotMatch(migration, /update public\.student_counselor_assignments/);
  assert.doesNotMatch(migration, /delete from public\./);
  assert.doesNotMatch(migration, /ended_at\s*=/);
  assert.doesNotMatch(migration, /note_text|next_action|corrected_by\s*=|changed_by\s*=/);
});

test("A1.4.1 and A1.4.2A migrations remain byte identical", () => {
  for (const [path, expectedHash] of [
    [
      "../../../supabase/migrations/202608110001_consultation_ownership_fcfs_assignment.sql",
      "9f0e2d2250168cb6d84ce570a73a16014fc2f92cff2666868b43c5691356f1cc",
    ],
    [
      "../../../supabase/migrations/202608120001_primary_counselor_assignment_foundation.sql",
      "4ce059cde852c11e8a9f160e5b62a0c972481ffbca431f6b37c0e56e50cd6051",
    ],
  ]) {
    assert.equal(
      createHash("sha256").update(readFileSync(new URL(path, import.meta.url))).digest("hex"),
      expectedHash,
    );
  }
});

test("canonical readiness repeats exact inventory and reservation defenses", () => {
  for (const check of [
    "applicable Storage INSERT ALL policies match the exact allowlist",
    "progression evidence static Storage policy contract is exact",
    "application document static Storage policy contract is exact",

    "applicable Storage SELECT ALL policies match the exact allowlist",
    "progression evidence Storage SELECT policy contract is exact",
    "application document Storage SELECT policy contract is exact",
    "unexpired progression evidence reservations are ownership compatible",
    "unexpired application document reservations are ownership compatible",
    "complete installed function contracts match reviewed hashes",
    "complete protected relation user-trigger inventory is exact",
  ]) {
    assert.match(readiness, new RegExp(check));
  }
  assert.match(readiness, /with recursive authenticated_role/);
  assert.match(readiness, /from pg_catalog\.pg_auth_members/);
  assert.match(readiness, /policy_record\.polcmd in \('a', '\*'\)/);
  assert.match(readiness, /policy_record\.polcmd in \('r', '\*'\)/);
  assert.match(readiness, /policy_role\.role_oid = 0/);
  assert.match(readiness, /exact_expression =/);

  assert.match(readiness, /from pg_catalog\.pg_depend/);
  assert.match(readiness, /set local search_path = ''/);
  assert.doesNotMatch(
    readiness.match(/-- Phase A1\.4\.2B static Storage[\s\S]*?order by check_name;/)?.[0] ?? "",
    /with_check like|strict_contract|canonical_expression/i,
  );
});

import * as fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const canonicalReadinessUrl = new URL(
  "../../../supabase/verification/pre_phase_c2_readiness.sql",
  import.meta.url,
);
const reconstructedReadinessUrl = new URL(
  "../../../supabase/verification/pre_phase_c2_readiness.reconstructed.sql",
  import.meta.url,
);
const reconstructionInventoryUrl = new URL(
  "../../../docs/readiness-reconstruction-inventory.md",
  import.meta.url,
);
const databaseDocumentationUrl = new URL(
  "../../../docs/database.md",
  import.meta.url,
);
const migrationDirectoryUrl = new URL(
  "../../../supabase/migrations/",
  import.meta.url,
);

const verificationSource = readFileSync(
  canonicalReadinessUrl,
  "utf8",
);
const reconstructionInventory = readFileSync(reconstructionInventoryUrl, "utf8");
const databaseDocumentation = readFileSync(databaseDocumentationUrl, "utf8");

const executableSql = verificationSource.replace(/--.*$/gm, "");
const activeReadinessHash =
  "21ff407489dee1fa637f2c44efe50c253ea41f03293b425bedc5f7a12d06ab01";

const reviewedMigrationHashes = {
  "202607170001_initial_kgeo_schema.sql":
    "5c3c7a5b4628db997f91d577b3f1b51400cf4693213e2daeaf7828c1f18024bb",
  "202607180001_consultation_requests_v1.sql":
    "f5beca24476a0c5d9f48cd3fbc222b9c278ebf9781291faa1cff8b250951e02d",
  "202607190001_single_counselor_slot_booking.sql":
    "5e814237b6230c04f517f2083393adc5818c3bd040fd3d7a26d1df8b541cc075",
  "202607190002_student_profile_foundation.sql":
    "370cf60acdef96ad57b5e1c384a1c4b29f7ee2f5cb0e822f77572c1db33c3219",
  "202607200001_require_core_profile_for_preferences.sql":
    "aec0c0207b54cd54387af6ce1d075de6a4830d6f8bc7dae9e8cd29e9b0fe3ab1",
  "202607200002_counselor_student_directory_foundation.sql":
    "38bdda3750f3c5398c1ae5144b93b40059327ae553bfffc9967b81bb385590ad",
  "202607230001_canonical_names_and_consultation_outcomes.sql":
    "500e575889108dad91bb6a08a6d01560f607707fac9656c3b5438ae476964b69",
  "202607230002_atomic_student_identity_save.sql":
    "0e8cf2228c80d3a58bdec3cdc520f65b0066aecccc14c51671e3a8960a171b64",
  "202607230003_counselor_consultation_reference_rpc.sql":
    "1cfd1e5ff871f76cacd290b3427d3652b537f18690056faa62e896422203a397",
  "202607230004_consultation_reference_column_hardening.sql":
    "11c7d770301f439ada3d4b8082c8bab48ebd4941cd331eeee9e1b7fdbfefbb51",
  "202607250001_counselor_notes_and_follow_ups_foundation.sql":
    "946782e65887ceacfe87bc028aed0f24f36519ab311390dd60e87dbb26b3d37f",
  "202607250002_counselor_follow_up_workload.sql":
    "8b03ad6970913d2d6e216e4985dda1f5ac5aa87f22a94d7ac670cd42c43c990f",
  "202607250003_official_counseling_progression.sql":
    "7f59a16d970db1e79b6dd9789f35e71c07b9f0a90d2802741cb76fd6141a523c",
  "202607260001_progression_evidence_foundation.sql":
    "c2161759110a1531ac3bb48189648c73123a89111f3d0aee29f78fd4075b9727",
  "202607260002_progression_correction_foundation.sql":
    "90d9a6e6f1b7fecb5a8a2e667c61eeb62b8546b33db402c3e1faf21a09e207fb",
  "202607270001_university_application_foundation.sql":
    "09d8c32734b159535387a4f6e21fda54d4b59ba4bbb60de4f93b7179794cb35b",
  "202607280001_student_university_application_read_foundation.sql":
    "3209de9d8bae1a8a2762fc9e539f3193cb9db2e6bd520cf60b420d85ea0d8875",
  "202608010001_university_application_documents_foundation.sql":
    "9cff3f5849fffa9d610b3d7a8bbab2ac0f04dc3e7729ca95bc46d0c0a6d548a1",
  "202608020001_counselor_application_workspace_read_foundation.sql":
    "d08643961a2bba54946cfd595fbc86f02b99b56696e705cf5b502fd5f467865d",
  "202608060001_director_dashboard_read_foundation.sql":
    "1179d59e46ba49904efe5bf610705aff6338dc52e92dd0b00ed57ad6630a0303",
  "202608060002_director_identity_bootstrap_support.sql":
    "944e1fc3d71c93d983f41efc244e8814f2c489c47627a89c85f5339d56d83b8c",
  "202608060003_staff_identity_provisioning.sql":
    "2f3a4780c9056cb619e58e9c50ad4d0dd96063550faec68585ee1585b69573b0",
  "202608070001_staff_provisioning_trigger_ambiguity_fix.sql":
    "ef5ac6f499b680245565a287bc7115901895d559297b3f96106c66a8789f972a",
  "202608090001_director_operational_oversight_foundation.sql":
    "74de642bf267dc9ae2798ec3c9a9bc158f2717275883d84efb1f106f563bb2ed",
  "202608110001_consultation_ownership_fcfs_assignment.sql":
    "9f0e2d2250168cb6d84ce570a73a16014fc2f92cff2666868b43c5691356f1cc",
  "202608120001_primary_counselor_assignment_foundation.sql":
    "4ce059cde852c11e8a9f160e5b62a0c972481ffbca431f6b37c0e56e50cd6051",
  "202608130001_primary_counselor_storage_authorization_helpers.sql":
    "420721812ead7f7c357836c396542c2ad6f3bad5707b94124f591689003808b3",
  "202608130002_primary_counselor_case_ownership_enforcement.sql":
    "6cb85edd3ab1bb93ddd6ee426cba9f14502e0d1a25859fcbd993f41596d05405",
  "202608180001_record_consultation_outcome_acl_alignment.sql":
    "1245ba55bf5cf3357f355e1bf997b12dfa86a1ac86f4469be0760e558f12e5fb",
  "202608180002_counselor_registration_approval.sql":
    "74eef63ccd6af184685d140824b100df4d98aaa1d8f4f88d460da1b9adb38792",
  "202608200001_counselor_registration_insert_timing_fix.sql":
    "a22247d7de234fdddc358c0e84f80ead743232a4f0fd81cc9df82baa07dc8134",
  "202608210001_kgeo_public_progress_publishing.sql":
    "0e8570547fb09429e59821b984424945284d61e625c413d5f2c6ca51972e7760",
  "202608210002_counselor_student_workspace_read_security.sql":
    "082227c809de0effbc8c9913c8c65c0ab7df1d9e067e118a995b342e4fa37424",
  "202608210003_director_primary_counselor_assignment.sql":
    "5d8a80ba10857214daf1e6bce36eb77b99c4dbb06d7f205857593261285614f4",
  "202608220001_student_eligibility_assessment.sql":
    "0be6f4f023cd7bf32df7813f3a4e89b6dcb8c56ec410f39425658493971d9d28",
  "202608220002_controlled_legacy_consultation_closure.sql":
    "19e1a56fc8df6c4de899cc80ea76233f7eb53ee71af38ad38603ee4674679dd3",
  "202608230001_duplicate_future_waiting_consultation_closure.sql":
    "f3041686ace391deea0f7bba005df93972995b7d54beaffab58f1eed39c1fc7c",
  "202608230002_time_aware_consultation_lifecycle.sql":
    "61e989e2f678826a90aa4613126674203dc279429e73a68cf10734a333ca46b0",
  "202608230003_complete_time_aware_consultation_prerequisites.sql":
    "43443f4d5659916288b9b2e65401530ac0ff590ebb04db3ab696c38739910aa7",
  "202608240001_automatic_consultation_allocation.sql":
    "20171c1093993dd12b61167e6a87e9ee8a1dc9f8cd070630481233306cc501fb",
  "202608240002_student_profile_documents.sql":
    "984aae4600646c6d780bccd127ce27552e03102aaabddeee8ed140385d0daf38",
  "202608250001_student_profile_v2_client_corrections.sql":
    "c70c7bd6aa479351a02e3d7d4d0b2ddcae839ec16dae6e031a94360931edddfb",
  "202608250002_counselor_journey_progress_semester_summaries.sql":
    "584477f3e3479e3651fb94bd9f1fbacf40e040a2e311932e92393d0107a3fce7",
  "202608250003_university_application_journey_extension.sql":
    "965c685dd2e61cc22e9a4d96b208f1e82c67879a906b5ac8b6ab7611424304a8",
  "202608250004_application_journey_rpc_acl_correction.sql":
    "bfdeb65d4790fdd96b56a8d9ae5b6a4588425c23a0566e3b737aa092007ff4df",
  "202608250005_parent_report_workflow.sql":
    "6308a713aaa10c90a02e47f3ceb3c1a4e4060a4de0a614970e6e8c0028a1dcbf",
  "202609020001_global_masters_readiness_index.sql":
    "1609bc37eae806491ec944603f2449e9179327f211cb247848be3a8f0fd56f8e",
  "202609020002_student_achievement_evidence.sql":
    "480d2451c4f7ea24aa63b5233f6da7d180a1113ce293ef94638838d53ee96b68",
  "202609180001_director_student_profile_detail.sql":
    "25e021d6caed648de22eed9e52e33d1d27b8f4c9afe4a9e5f1a56ed8bf67ca5e",
  "202609210001_student_preference_courses_and_field.sql":
    "b376ddb00647df548e01c4f723fb5c10efe43ae460ddee4bd2350e39bb6e4d29",
  "202609230001_student_preferences_merge2_tab.sql":
    "8ee1f302da33c14e7ab93ee8dc5f17352e0f8a188b1bc473ab7920089c0313fe",
  "202609290001_fix_eligibility_function_syntax.sql":
    "ae06ac7afe7ffbd69b6b9624779ef2ca1ec6a720fc7b67160d83e8b4a6deaae3",
  "202609290002_public_progress_funnel_validation.sql":
    "721fd5a5c8210adfbe0a62af640ee1b17605c98f488be1f77c692acf4f5538d6",
  "202610080001_single_counselor_authorization.sql":
    "05fe6d9a1623f8988a3a0faf510cad97a04fb40fe81254fa37d9a4465ed55970",
  "202610080002_student_multi_institution_auth.sql":
    "61d9c4f449d02ce3087a6ad6a0fb316fe2a98900d660a170db5864589675d778",
  "202610080003_student_graduation_year_range.sql":
    "8dc58379b5aae1dbb8c23a0c3bba2fe9c223b4fd77ad956f6c8515db05adb7f0",
} as const;

function hashFile(path: URL): string {
  return createHash("sha256")
    .update(readFileSync(path, "utf8").replace(/\r\n/g, "\n"))
    .digest("hex");
}

function splitTopLevelSqlStatements(source: string): string[] {
  const statements: string[] = [];
  let statementStart = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (inLineComment) {
      if (character === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (character === "*" && nextCharacter === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      if (character === "'" && nextCharacter === "'") {
        index += 1;
      } else if (character === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (character === '"' && nextCharacter === '"') {
        index += 1;
      } else if (character === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (character === "-" && nextCharacter === "-") {
      inLineComment = true;
      index += 1;
    } else if (character === "/" && nextCharacter === "*") {
      inBlockComment = true;
      index += 1;
    } else if (character === "'") {
      inSingleQuote = true;
    } else if (character === '"') {
      inDoubleQuote = true;
    } else if (character === ";") {
      const statement = source.slice(statementStart, index + 1).trim();
      if (statement.replace(/--.*$/gm, "").trim() !== "") {
        statements.push(statement);
      }
      statementStart = index + 1;
    }
  }

  assert.equal(inSingleQuote, false);
  assert.equal(inDoubleQuote, false);
  assert.equal(inBlockComment, false);
  assert.equal(source.slice(statementStart).trim(), "");

  return statements;
}

function maskSqlCommentsAndLiterals(source: string): string {
  return source
    .replace(/--.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/\s+/g, " ")
    .trim();
}

test("final canonical readiness is uniquely authoritative and covers every migration", () => {
  assert.equal(hashFile(canonicalReadinessUrl), activeReadinessHash);
  assert.equal(existsSync(reconstructedReadinessUrl), false);
  assert.match(verificationSource, /Phase E1\.3\.3 foundation/);
  assert.match(verificationSource, /Phase E1\.4\.1/);
  assert.match(verificationSource, /Phase A1\.4\.2A/);

  const migrationNames = readdirSync(migrationDirectoryUrl)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  assert.deepEqual(migrationNames, Object.keys(reviewedMigrationHashes));

  for (const [migrationName, expectedHash] of Object.entries(
    reviewedMigrationHashes,
  )) {
    const migrationUrl = new URL(migrationName, migrationDirectoryUrl);
    const migrationSource = readFileSync(migrationUrl, "utf8");

    assert.equal(hashFile(migrationUrl), expectedHash);
    assert.match(reconstructionInventory, new RegExp(migrationName));

    const coreObjects = new Set<string>();
    for (const pattern of [
      /create(?: or replace)?\s+(?:type|table|view|sequence|function)\s+(?:if not exists\s+)?(?:public\.)?([a-z][a-z0-9_]*)/gi,
      /create\s+(?:unique\s+)?index\s+(?:if not exists\s+)?(?:public\.)?([a-z][a-z0-9_]*)/gi,
      /create(?: or replace)?\s+trigger\s+([a-z][a-z0-9_]*)/gi,
      /(?:create|alter)\s+policy\s+([a-z][a-z0-9_]*)/gi,
    ]) {
      for (const match of migrationSource.matchAll(pattern)) {
        coreObjects.add(match[1]);
      }
    }

    for (const objectName of coreObjects) {
      assert.match(
        reconstructionInventory,
        new RegExp(`\\b${objectName}\\b`),
        `${migrationName} object ${objectName} lacks documented coverage`,
      );
    }
  }
});

test("single Counselor cutover has a read-only post-cutover verifier and leaves canonical readiness frozen", () => {
  const cutoverVerifier = readFileSync(
    new URL(
      "../../../supabase/verification/202610080001_single_counselor_authorization.sql",
      import.meta.url,
    ),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const executableVerifier = cutoverVerifier.replace(/--.*$/gm, "");

  // Read-only, catalog-and-aggregate only, label/boolean output.
  assert.match(executableVerifier, /begin transaction read only;/);
  assert.match(executableVerifier, /set local search_path = '';/);
  assert.match(executableVerifier, /rollback;\s*$/);
  assert.doesNotMatch(executableVerifier, /\bcommit\b/i);
  assert.doesNotMatch(
    executableVerifier,
    /^\s*(?:insert|update|delete|alter|create|drop|grant|revoke|truncate|do)\b/gim,
  );
  assert.doesNotMatch(executableVerifier, /set_config|request\.jwt/i);
  assert.match(
    executableVerifier,
    /select check_name, passed\s+from checks\s+order by check_name;/,
  );
  assert.doesNotMatch(
    executableVerifier,
    /select[^;]*\b(?:email|college_email|full_name|username)\b/i,
  );

  for (const checkName of [
    "CANONICAL_HELPER_METADATA_EXACT",
    "CANONICAL_HELPER_EXECUTE_AUTHENTICATED_ONLY",
    "CANONICAL_HELPER_REQUIRES_APPROVED_ACTIVE_VERIFIED_COUNSELOR",
    "COMPATIBILITY_HELPER_METADATA_EXACT",
    "COMPATIBILITY_HELPER_EXECUTE_AUTHENTICATED_ONLY",
    "COMPATIBILITY_HELPER_DELEGATES_AND_REQUIRES_STUDENT_TARGET",
    "ASSIGNMENT_HISTORY_IS_NOT_THE_HELPER_AUTHORIZATION_BOUNDARY",
    "NO_RLS_POLICY_READS_ASSIGNMENT_HISTORY_DIRECTLY",
    "ASSIGNMENT_HISTORY_TABLE_PRESERVED_AND_PROTECTED",
    "EXACTLY_ONE_OPERATIONAL_COUNSELOR",
    "REVIEWED_INSTITUTIONAL_COUNSELOR_IS_OPERATIONAL",
    "NO_OTHER_COUNSELOR_SATISFIES_AUTHORIZATION",
  ]) {
    assert.equal(
      executableVerifier.split(`'${checkName}'`).length - 1,
      1,
      checkName,
    );
  }

  // Exact metadata: both helpers, definer, stable, postgres, empty search path
  // in either catalog representation, authenticated-only EXECUTE.
  assert.equal(
    executableVerifier.match(
      /helper\.configuration in \(\s*array\['search_path='\]::text\[\],\s*array\['search_path=""'\]::text\[\]\s*\)/g,
    )?.length,
    2,
  );
  assert.equal(
    executableVerifier.match(/helper\.security_definer is true/g)?.length,
    2,
  );
  assert.equal(executableVerifier.match(/helper\.volatility = 's'/g)?.length, 2);
  assert.equal(
    executableVerifier.match(/helper\.owner_name = 'postgres'/g)?.length,
    2,
  );
  for (const role of ["anon", "service_role", "public"]) {
    assert.equal(
      executableVerifier.match(
        new RegExp(
          `not pg_catalog\\.has_function_privilege\\(\\s*'${role}', helper\\.function_oid, 'EXECUTE'`,
          "g",
        ),
      )?.length,
      2,
      role,
    );
  }

  // The operational-Counselor predicate matches the migration preflight.
  const migration = readFileSync(
    new URL(
      "202610080001_single_counselor_authorization.sql",
      migrationDirectoryUrl,
    ),
    "utf8",
  );
  for (const predicate of [
    "'counselor'::public.user_role",
    "is_active is true",
    "'approved'::public.counselor_approval_status",
    "email_confirmed_at is not null",
    "banned_until",
    "'eaaccd6a-9e05-46e4-bc59-60455f1da7f7'::uuid",
  ]) {
    assert.ok(migration.includes(predicate), predicate);
    assert.ok(executableVerifier.includes(predicate), predicate);
  }
  assert.match(
    executableVerifier,
    /'student_counselor_assignments'\s*\) = 0/,
  );
  assert.match(executableVerifier, /'''student''::public\.user_role'/);

  // The frozen canonical verifier keeps its historical helper expectation and
  // its pinned hash; the supplement supersedes it without rewriting it.
  assert.equal(hashFile(canonicalReadinessUrl), activeReadinessHash);
  assert.match(
    verificationSource,
    /'dbafccbd4bae61d5e20bce09ee3b66075664dc23f69943235344c3d123b9fb6b'/,
  );
  assert.doesNotMatch(
    verificationSource,
    /is_approved_active_verified_counselor/,
  );
  assert.match(
    reconstructionInventory,
    /supabase\/verification\/202610080001_single_counselor_authorization\.sql/,
  );
  assert.match(
    reconstructionInventory,
    /temporary\s+compatibility authorization bridge/,
  );
  assert.match(reconstructionInventory, /preserved unchanged as history/);
});

test("rejects schema-qualified SQL special forms in canonical and current cutover SQL", () => {
  const currentCutoverSql = readFileSync(
    new URL(
      "202608240001_automatic_consultation_allocation.sql",
      migrationDirectoryUrl,
    ),
    "utf8",
  );
  const rolloutSqlExamples = [databaseDocumentation, reconstructionInventory]
    .flatMap((source) =>
      Array.from(source.matchAll(/```sql\s*([\s\S]*?)```/g), (match) => match[1]),
    )
    .join("\n");

  for (const specialForm of [
    "coalesce",
    "nullif",
    "greatest",
    "least",
    "extract",
  ]) {
    const invalidQualifiedSpecialForm = new RegExp(
      `pg_catalog\\.${specialForm}\\s*\\(`,
    );
    assert.doesNotMatch(executableSql, invalidQualifiedSpecialForm);
    assert.doesNotMatch(currentCutoverSql, invalidQualifiedSpecialForm);
    assert.doesNotMatch(rolloutSqlExamples, invalidQualifiedSpecialForm);
  }
});

test("readiness verification is transactionally read-only and history-independent", () => {
  const statements = splitTopLevelSqlStatements(verificationSource);
  const maskedStatements = statements.map(maskSqlCommentsAndLiterals);

  assert.equal(statements.length, 60);
  assert.equal(
    maskedStatements.filter((statement) => /^begin transaction\b/i.test(statement))
      .length,
    1,
  );
  assert.equal(
    maskedStatements.filter((statement) => /^set local\b/i.test(statement))
      .length,
    2,
  );
  assert.equal(
    maskedStatements.filter((statement) => /^with\b/i.test(statement)).length,
    43,
  );
  assert.equal(
    maskedStatements.filter((statement) => /^select\b/i.test(statement)).length,
    13,
  );
  assert.equal(
    maskedStatements.filter((statement) => /^commit\b/i.test(statement)).length,
    1,
  );

  for (const statement of maskedStatements) {
    assert.match(
      statement,
      /^(?:begin transaction isolation level repeatable read read only|set local|select\b|with\b|commit\b)/i,
    );
  }

  assert.match(
    executableSql,
    /begin transaction isolation level repeatable read read only;/,
  );
  assert.match(executableSql, /set local statement_timeout = '30s';/);
  assert.match(executableSql, /\bcommit;/);
  assert.doesNotMatch(
    executableSql,
    /^\s*(?:insert|update|delete|merge|alter|create|drop|truncate|grant|revoke)\b/im,
  );
  assert.doesNotMatch(
    executableSql,
    /^\s*(?:select\s+)?pg_catalog\.(?:pg_)?advisory_(?:xact_)?lock\s*\(/im,
  );
  assert.doesNotMatch(
    executableSql,
    /^\s*select\s+(?:pg_catalog\.)?(?:nextval|setval)\s*\(/im,
  );
  assert.doesNotMatch(executableSql, /^\s*execute\s+format\b/im);
  assert.doesNotMatch(executableSql, /supabase_migrations/i);

  const maskedSql = maskedStatements.join("\n");
  assert.doesNotMatch(
    maskedSql,
    /\b(?:insert\s+into|update\s+(?:public|auth|storage)\.|delete\s+from|merge\s+into|truncate\b|create\s+(?:table|temp)\b|alter\s+table\b|drop\b|grant\b|revoke\b|comment\s+on\b|call\b|do\b|copy\b|refresh\b|vacuum\b|analyze\b|lock\b)/i,
  );
  assert.doesNotMatch(
    maskedSql,
    /\b(?:pg_catalog\.)?(?:pg_)?advisory_(?:xact_)?lock\s*\(/i,
  );
  assert.doesNotMatch(
    maskedSql,
    /\b(?:pg_catalog\.)?(?:nextval|setval)\s*\(/i,
  );
  assert.doesNotMatch(maskedSql, /\bexecute\s+format\b/i);
  assert.doesNotMatch(
    maskedSql,
    /\bpublic\.(?:record_consultation_outcome|save_student_identity|record_counselor_follow_up_status|record_student_counseling_progression|undo_latest_student_counseling_progression_event|create_student_university_application|update_student_university_application_details|record_student_university_application_status|set_primary_student_university_application|archive_student_university_application)\s*\(/i,
  );
});

test("readiness verification covers the required live object categories", () => {
  for (const category of [
    "enum",
    "table",
    "column",
    "column_default",
    "constraint",
    "function",
    "function_return_column",
    "trigger",
    "policy",
    "index",
    "row_level_security",
    "function_privilege",
    "privilege_boundary",
    "definition",
  ]) {
    assert.match(verificationSource, new RegExp(`'${category}'::text`));
  }
});

test("readiness enum assertions compare text arrays without catalog name coercion", () => {
  const requiredEnumsDefinition =
    executableSql.match(
      /with required_enums\(enum_name, expected_values\) as \([\s\S]*?\),\s*actual_enums as \(/,
    )?.[0] ?? "";

  assert.match(requiredEnumsDefinition, /'user_role'/);
  assert.equal(requiredEnumsDefinition.match(/\barray\[/g)?.length, 22);
  assert.equal(requiredEnumsDefinition.match(/\]::text\[\]/g)?.length, 22);

  assert.equal(
    executableSql.match(/\benum_value\.enumlabel::text\b/g)?.length,
    4,
  );
  assert.doesNotMatch(executableSql, /\benum_value\.enumlabel\b(?!::text)/);
  assert.doesNotMatch(
    executableSql,
    /array_agg\(\s*enum_value\.enumlabel/i,
  );

  assert.match(
    executableSql,
    /array\(\s*select enum_value\.enumlabel::text[\s\S]*?order by enum_value\.enumsortorder\s*\)\s*=\s*array\['pending', 'available', 'removed'\]::text\[\]/,
  );
});

test("readiness diagnostics expose only stable labels and aggregate values", () => {
  assert.doesNotMatch(
    executableSql,
    /as object_name,\s*(?:user_id|student_id|counselor_id|application_id|event_id|evidence_id|email|full_name|original_file_name|storage_path|signed_url)\b/i,
  );
  assert.doesNotMatch(
    executableSql,
    /select\s+'(?:aggregate_count|legacy_count)'::text as category,\s*(?:student_id|counselor_id|application_id|event_id|evidence_id)\b/i,
  );
});

test("D2 diagnostics verify structure without returning workload or identity values", () => {
  for (const checkName of [
    "D2 workload RPC has trusted ownership and authorization",
    "D2 workload RPC validates filters and Asia Kolkata boundaries",
    "D2 workload RPC searches only approved identity fields",
    "D2 workload RPC returns global metrics on empty pages",
    "D2 workload RPC uses deterministic operational ordering",
  ]) {
    assert.match(verificationSource, new RegExp(checkName));
  }

  const returnColumnSection =
    executableSql.match(
      /with expected_return_columns\([\s\S]*?order by expected\.column_position;/,
    )?.[0] ?? "";

  assert.match(returnColumnSection, /'follow_up_id'/);
  assert.match(returnColumnSection, /'total_pending_count'/);
  assert.doesNotMatch(
    returnColumnSection,
    /select[\s\S]*?from public\.(?:counselor_follow_ups|profiles|student_profiles)/i,
  );
});

test("readiness verification covers consultation reference privacy", () => {
  assert.match(
    verificationSource,
    /public\.get_counselor_consultation_references\(uuid\[\]\)/,
  );
  assert.match(
    verificationSource,
    /authenticated has no table-wide consultation select/,
  );
  assert.match(
    verificationSource,
    /authenticated cannot select consultation request number/,
  );
  assert.match(
    verificationSource,
    /authenticated retains safe consultation columns/,
  );
});

test("D1 diagnostics return structure and aggregate counts without private values", () => {
  const d1Marker = executableSql.indexOf("'counselor private notes'");
  const d1Section =
    d1Marker < 0
      ? ""
      : executableSql.slice(
          executableSql.lastIndexOf("select", d1Marker),
          executableSql.indexOf("order by count_name;", d1Marker) +
            "order by count_name;".length,
        );

  assert.match(d1Section, /'counselor private notes'/);
  assert.match(d1Section, /'counselor follow-ups'/);
  assert.equal(
    d1Section.match(/pg_catalog\.count\(\*\)::bigint/g)?.length,
    2,
  );
  assert.doesNotMatch(
    d1Section,
    /note_text|next_action|details|student_id|counselor_id|consultation_id/,
  );
});

test("D3.1 readiness covers every object and emits aggregate diagnostics only", () => {
  for (const objectName of [
    "counseling_progression_stage",
    "counseling_progression_state",
    "student_counseling_progressions",
    "student_counseling_progression_events",
    "public.record_student_counseling_progression(uuid,text,text,text)",
    "student_counseling_progressions_select_counselor",
    "student_counseling_progression_events_select_counselor",
    "student_counseling_progressions_state_stage_updated_idx",
    "student_counseling_progression_events_student_history_idx",
    "function_argument",
    "p_student_id",
    "p_stage",
    "p_state",
    "p_change_reason",
  ]) {
    assert.match(verificationSource, new RegExp(objectName.replace(/[()]/g, "\\$&")));
  }

  for (const checkName of [
    "D3 policies are counselor-only SELECT with no mutation policy",
    "D3 profile and history foreign keys retain records",
    "D3 initialization history is correction-aware",
    "D3 indexes match current and history access paths",
    "D3 RPC has trusted owner and counselor authorization",
    "D3 RPC validates student role and no browser audit actor",
    "D3 RPC validates enums and normalizes bounded reason",
    "D3 RPC uses first-writer concurrency and row locking",
    "D3 RPC enforces separate no-op completed and on-hold rules",
    "D3 RPC writes current and history atomically with one timestamp",
    "D3 RPC sanitizes unexpected failures",
    "D3 authenticated reads are column-limited",
    "D3 has no direct authenticated table mutations",
    "D3 enum usage is authenticated-only",
  ]) {
    assert.match(verificationSource, new RegExp(checkName));
  }

  const d3Section =
    verificationSource
      .match(
        /-- Aggregate-only D3 inventory[\s\S]*?-- Phase E1\.3\.3/,
      )?.[0]
      .replace(/--.*$/gm, "") ?? "";

  for (const countName of [
    "students without official progression",
    "active progression count",
    "on-hold progression count",
    "completed progression count",
    "current rows without history",
    "latest-event/current-row mismatches",
  ]) {
    assert.match(d3Section, new RegExp(countName));
  }

  assert.equal(
    d3Section.match(/pg_catalog\.count\(\*\)::bigint/g)?.length,
    6,
  );
  assert.match(
    d3Section,
    /select\s+'aggregate_count'::text as category,\s+count_name as object_name,\s+row_count\s+from/,
  );
  assert.doesNotMatch(
    d3Section,
    /as object_name,\s+(?:student_id|changed_by|change_reason|current_stage|new_stage)/,
  );
});

test("D3.3.1 readiness verifies evidence, Storage boundaries, and aggregate-only drift", () => {
  for (const checkName of [
    "D3.3.1 evidence enum has exact lifecycle values",
    "D3.3.1 evidence table has exact columns and nullability",
    "D3.3.1 evidence defaults are database controlled",
    "D3.3.1 evidence constraints enforce path file and lifecycle",
    "D3.3.1 evidence foreign keys retain event and actor history",
    "D3.3.1 evidence indexes match uniqueness event and expiry access",
    "D3.3.1 evidence RLS is enabled with counselor SELECT only",
    "D3.3.1 evidence grants are SELECT only for authenticated",
    "D3.3.1 RPC signatures and return contracts exist",
    "D3.3.1 RPCs are trusted SECURITY DEFINER with empty search path",
    "D3.3.1 RPC execution is authenticated only",
    "D3.3.1 prepare RPC validates actor event file and generated path",
    "D3.3.1 prepare RPC locks before enforcing five active files",
    "D3.3.1 finalize RPC is uploader-bound and object-existence only",
    "D3.3.1 removal RPC is final audited soft removal",
    "D3.3.1 Storage policies are exact INSERT and SELECT only",
    "D3.3.1 Storage denies UPDATE DELETE public and anonymous evidence access",
    "D3.3.1 Storage INSERT policy is pending uploader and expiry bound",
    "D3.3.1 Storage SELECT policy is available counselor only",
    "D3.3.1 private bucket has exact size and MIME configuration",
  ]) {
    assert.match(verificationSource, new RegExp(checkName));
  }

  const evidenceInventory =
    verificationSource
      .match(
        /-- Aggregate-only D3\.3\.1 inventory[\s\S]*?-- Aggregate-only D3 inventory/,
      )?.[0]
      .replace(/--.*$/gm, "") ?? "";

  for (const countName of [
    "available progression evidence",
    "pending progression evidence",
    "expired pending progression evidence",
    "removed progression evidence",
    "events at progression evidence limit",
    "available evidence missing Storage object",
    "pending evidence with Storage object",
    "removed evidence retaining Storage object",
  ]) {
    assert.match(evidenceInventory, new RegExp(countName));
  }

  assert.equal(
    evidenceInventory.match(/pg_catalog\.count\(\*\)::bigint/g)
      ?.length,
    8,
  );
  assert.doesNotMatch(
    evidenceInventory,
    /as object_name,\s+(?:storage_path|original_file_name|student_id|progression_event_id|uploaded_by|removed_by|removal_reason)/,
  );

  assert.match(
    verificationSource,
    /public-schema checks can pass after[\s\S]*?Storage-policy checks are expected to remain false[\s\S]*?Full readiness requires both[\s\S]*?stages/,
  );
});

test("D3.4.1 readiness covers contract repairs corrections and effective history", () => {
  for (const checkName of [
    "D3.4.1 correction enum has exact values",
    "D3.4.1 correction table has exact columns and nullability",
    "D3.4.1 correction constraints retain targets actors and consistency",
    "D3.4.1 event FK points to profiles with RESTRICT",
    "D3.4.1 lifetime initialization index is absent",
    "D3.4.1 correction RLS is counselor SELECT only",
    "D3.4.1 correction grants are narrow and append-only",
    "D3.4.1 RPC signatures and relational returns exist",
    "D3.4.1 RPCs are trusted and authenticated-only",
    "D3.4.1 normal RPC is correction-aware and lock-compatible",
    "D3.4.1 correction RPC uses ordered student event and row locks",
    "D3.4.1 correction RPC enforces latest effective event and current match",
    "D3.4.1 correction RPC enforces evidence gate without mutation",
    "D3.4.1 correction RPC restores stages and resets only projection",
    "D3.4.1 read RPC is counselor-only bounded and student-scoped",
    "D3.4.1 failures are sanitized",
  ]) {
    assert.match(verificationSource, new RegExp(checkName));
  }

  const correctionInventory =
    verificationSource
      .match(
        /-- Aggregate-only D3\.4\.1 inventory[\s\S]*?-- Phase D3\.3\.1/,
      )?.[0]
      .replace(/--.*$/gm, "") ?? "";

  for (const countName of [
    "total progression corrections",
    "transition progression corrections",
    "initialization progression resets",
    "current rows mismatching latest effective event",
    "effective histories missing current projection",
    "students with multiple effective initializations",
    "corrections with missing target event",
    "corrections with invalid restored-field shape",
  ]) {
    assert.match(correctionInventory, new RegExp(countName));
  }
  assert.match(
    correctionInventory,
    /event\.new_state <>\s*'active'::public\.counseling_progression_state/,
  );

  assert.equal(
    correctionInventory.match(/pg_catalog\.count\(\*\)::bigint/g)
      ?.length,
    8,
  );
  assert.doesNotMatch(
    correctionInventory,
    /as object_name,\s+(?:student_id|target_event_id|corrected_by|correction_reason|restored_stage)/,
  );

  const d3Inventory =
    verificationSource
      .match(
        /-- Aggregate-only D3 inventory[\s\S]*?-- Aggregate-only D1 inventory/,
      )?.[0]
      .replace(/--.*$/gm, "") ?? "";
  assert.match(
    d3Inventory,
    /student_counseling_progression_event_corrections/,
  );
  assert.doesNotMatch(
    d3Inventory,
    /latest_event\.changed_(?:by|at) is distinct from progression\.last_changed/,
  );
});

test("E1.1 readiness verifies application structure security atomicity and aggregate-only drift", () => {
  for (const objectName of [
    "university_application_status",
    "university_application_degree_level",
    "university_application_intake_term",
    "university_application_event_type",
    "student_university_applications",
    "student_university_application_events",
    "student_university_applications_one_primary_idx",
    "student_university_application_events_history_idx",
    "student_university_application_events_type_version_check",
    "public.create_student_university_application(uuid,text,text,text,text,text,integer,text,text,date)",
    "public.update_student_university_application_details(uuid,text,text,text,text,text,integer,text,text,date,text)",
    "public.record_student_university_application_status(uuid,text,text)",
    "public.set_primary_student_university_application(uuid,text)",
    "public.archive_student_university_application(uuid,text)",
  ]) {
    assert.match(
      verificationSource,
      new RegExp(objectName.replace(/[().]/g, "\\$&")),
    );
  }

  assert.match(
    verificationSource,
    /expected_constraint_definitions[\s\S]*?\[a-za-z0-9-\]\{0,61\}/,
  );
  assert.match(
    verificationSource,
    /student_university_application_events_type_version_check[\s\S]*?'version_number = 1'[\s\S]*?'version_number > 1'/,
  );
  assert.equal(
    verificationSource.match(
      /not pg_catalog\.has_any_column_privilege\([\s\S]*?'(?:INSERT|UPDATE|REFERENCES)'\s*\)/g,
    )?.length,
    12,
  );
  assert.match(
    verificationSource,
    /attribute\.attname::text = any\(array\[[\s\S]*?'last_changed_at'[\s\S]*?\]::text\[\]\)/,
  );
  assert.match(
    verificationSource,
    /attribute\.attname::text = any\(array\[[\s\S]*?'changed_at'[\s\S]*?\]::text\[\]\)/,
  );

  for (const checkName of [
    "E1.1 tables have no unexpected columns",
    "E1.1 application grants are counselor-column SELECT only",
    "E1.1 event grants are append-only counselor-column SELECT",
    "E1.1 enum usage is authenticated only",
    "E1.1 RPC execution is authenticated only",
    "E1.1 RPCs derive active verified counselor and student role",
    "E1.1 RPCs share one application lock domain and lock rows",
    "E1.1 creation fixes planning version and audit values",
    "E1.1 details update rejects no-op and audits one version",
    "E1.1 status graph and submitted timestamp are database controlled",
    "E1.1 primary switching is atomic and audits every affected row",
    "E1.1 archive is final soft retention with status preserved",
    "E1.1 has no progression Storage offer or visa mutation",
    "E1.1 failures are sanitized",
  ]) {
    assert.match(verificationSource, new RegExp(checkName));
  }

  const inventory =
    verificationSource
      .match(
        /-- Aggregate-only E1\.1 inventory[\s\S]*?-- Aggregate-only D3\.4\.1 inventory/,
      )?.[0]
      .replace(/--.*$/gm, "") ?? "";

  for (const countName of [
    "university application rows",
    "active university application rows",
    "archived university application rows",
    "primary university application rows",
    "students with more than one primary application",
    "archived or terminal primary applications",
    "applications without created events",
    "application version mismatches latest event",
    "application projections differing from latest snapshot",
    "duplicate application event versions",
    "application events without applications",
    "submitted lifecycle applications missing submitted timestamp",
    "pre-submission applications with submitted timestamp",
  ]) {
    assert.match(inventory, new RegExp(countName));
  }

  assert.doesNotMatch(
    inventory,
    /as object_name,\s+(?:student_id|application_id|changed_by|university_name|programme_name|application_reference|portal_url|change_reason)/,
  );
  assert.doesNotMatch(inventory, /select\s+application\.(?:student_id|id)\s+as object_name/);
  assert.match(
    inventory,
    /application\.submitted_at is null[\s\S]*?application\.current_status in \([\s\S]*?'withdrawn'[\s\S]*?'closed'[\s\S]*?exists \([\s\S]*?event\.application_status in \([\s\S]*?'submitted'/,
  );
  assert.match(
    inventory,
    /pre-submission applications with submitted timestamp[\s\S]*?application\.current_status in \([\s\S]*?'planning'[\s\S]*?'ready_to_submit'/,
  );
});

test("E1.3.1 readiness verifies the student-safe RPC and aggregate-only overflow drift", () => {
  for (const checkName of [
    "E1.3.1 student read RPC has zero arguments",
    "E1.3.1 student read RPC has exact relational return contract",
    "E1.3.1 student read RPC is trusted stable SECURITY DEFINER",
    "E1.3.1 student read RPC execution is authenticated only",
    "E1.3.1 tables retain counselor-only RLS and no table-wide grant",
    "E1.3.1 student read RPC derives and authorizes own identity",
    "E1.3.1 student read RPC excludes archives and bounds overflow",
    "E1.3.1 student read RPC uses deterministic safe ordering",
    "E1.3.1 student read RPC exposes no private or event fields",
    "E1.3.1 student read RPC has no mutation progression or dynamic SQL",
  ]) {
    assert.match(verificationSource, new RegExp(checkName));
  }

  const returnContract =
    verificationSource.match(
      /-- Phase E1\.3\.1[\s\S]*?expected_return_columns\([\s\S]*?\),\s*student_read_function as \(/,
    )?.[0] ?? "";

  for (const columnName of [
    "application_id",
    "university_name",
    "programme_name",
    "country_code",
    "degree_level",
    "intake_term",
    "intake_year",
    "current_status",
    "submission_deadline",
    "submitted_at",
    "is_primary",
    "last_changed_at",
  ]) {
    assert.match(returnContract, new RegExp(`'${columnName}'`));
  }
  assert.doesNotMatch(
    returnContract,
    /student_id|application_reference|portal_url|archive_reason|actor|version_number|reason|email/,
  );

  const driftDiagnostic =
    verificationSource.match(
      /-- Aggregate-only E1\.3\.1 drift diagnostic[\s\S]*?as oversized_student_application_sets;/,
    )?.[0] ?? "";

  assert.match(
    driftDiagnostic,
    /students with more than 100 nonarchived university applications/,
  );
  assert.match(driftDiagnostic, /pg_catalog\.count\(\*\)::bigint/);
  assert.doesNotMatch(
    driftDiagnostic,
    /as object_name,\s*(?:application\.student_id|application\.id|application\.university_name)/,
  );

  const e131Section =
    verificationSource.match(
      /-- Phase E1\.3\.1[\s\S]*?-- Aggregate-only E1\.3\.1 drift diagnostic/,
    )?.[0] ?? "";
  assert.match(
    e131Section,
    /application\.student_id = caller_id%application\.student_id = caller_id/,
  );
  assert.match(
    e131Section,
    /application\.is_archived is false%application\.is_archived is false/,
  );
  assert.match(
    e131Section,
    /%return query%order by%application\.is_primary desc nulls last,%application\.last_changed_at desc nulls last,%application\.id desc%limit 100%/,
  );
  assert.match(
    e131Section,
    /merge into public\.student_university_applications/,
  );
});

test("E1.3.3 readiness verifies private application documents and aggregate-only drift", () => {
  for (const checkName of [
    "E1.3.3 document enum has exact lifecycle values",
    "E1.3.3 document table has exact columns and nullability",
    "E1.3.3 document defaults are database controlled",
    "E1.3.3 document constraints enforce title path file size expiry and lifecycle",
    "E1.3.3 document foreign keys retain application and actor history",
    "E1.3.3 document indexes match unique path list and expiry access",
    "E1.3.3 document RLS is enabled with available counselor policy only",
    "E1.3.3 document table has no direct public anon or authenticated grants",
    "E1.3.3 document enum usage is authenticated only",
    "E1.3.3 document RPC signatures and relational returns exist",
    "E1.3.3 document RPC argument names and types are exact",
    "E1.3.3 document functions are trusted SECURITY DEFINER with empty search path",
    "E1.3.3 document function execution is authenticated only",
    "E1.3.3 prepare derives identity path expiry and bounded application lock",
    "E1.3.3 finalize is uploader-bound unexpired object-existence transition",
    "E1.3.3 list and view are application-bound available-only and bounded",
    "E1.3.3 removal is archived-safe final audited soft retention",
    "E1.3.3 Storage helpers bind pending upload and available viewing",
    "E1.3.3 Storage policies are exact INSERT and SELECT helper contracts",
    "E1.3.3 private bucket has exact size and MIME configuration",
    "E1.3.3 document functions do not mutate applications events progression or Storage",
  ]) {
    assert.match(verificationSource, new RegExp(checkName));
  }

  const section =
    verificationSource.match(
      /-- Phase E1\.3\.3[\s\S]*?-- Aggregate-only D1 inventory/,
    )?.[0] ?? "";
  assert.match(
    section,
    /array\(\s*select enum_value\.enumlabel::text[\s\S]*?array\['pending', 'available', 'removed'\]::text\[\]/,
  );
  assert.match(section, /file_size_limit = 10485760/);
  assert.match(
    section,
    /array\[\s*'application\/pdf',\s*'image\/jpeg',\s*'image\/png',\s*'image\/webp'\s*\]::text\[\]/,
  );
  assert.match(section, /active_document_count >= 20/);
  assert.match(section, /202608010001/);
  assert.match(section, /five-minute signed URL/);
  assert.match(
    section,
    /TABLE\(document_id uuid, application_id uuid, bucket_id text, storage_path text, document_title text, original_file_name text, mime_type text, file_size_bytes bigint, upload_expires_at timestamp with time zone\)/,
  );
  assert.match(
    section,
    /p_original_file_name <> normalized_file_name[\s\S]*?strpos\(normalized_file_name, ''\.\.''\) > 0/,
  );
  assert.equal(
    (section.match(/%EXCEPTION%WHEN OTHERS%RETURN false%/g) ?? []).length,
    2,
  );
  assert.match(
    section,
    /select pg_catalog\.count\(\*\) = 2[\s\S]*?university_application_document_object_%/,
  );
  assert.equal(
    (section.match(/coalesce\(\([\s\S]*?\), false\)/g) ?? [])
      .length >= 3,
    true,
  );

  for (const zeroRequiredLabel of [
    "invalid university application document lifecycle rows",
    "available university application documents missing available_at",
    "removed university application documents missing removal audit",
    "applications with more than 20 active university application documents",
    "duplicate university application document storage paths",
    "orphan university application document application references",
    "available university application documents missing Storage object",
  ]) {
    assert.match(section, new RegExp(zeroRequiredLabel));
  }
  for (const informationalLabel of [
    "expired pending university application documents",
    "pending university application documents with Storage object",
    "removed university application documents retaining Storage object",
  ]) {
    assert.match(section, new RegExp(informationalLabel));
  }

  assert.doesNotMatch(
    section,
    /as object_name,\s*(?:document_id|application_id|student_id|counselor_id|original_file_name|document_title|storage_path|removal_reason|signed_url)/,
  );
});

test("E1.4.1 readiness verifies the counselor workspace read boundary", () => {
  const section =
    verificationSource.match(
      /-- Phase E1\.4\.1[\s\S]*?-- Aggregate-only D1 inventory/,
    )?.[0] ?? "";

  for (const checkName of [
    "E1.4.1 workspace RPC signatures have no overloads",
    "E1.4.1 workspace list RPC has exact arguments",
    "E1.4.1 workspace metrics RPC has zero arguments",
    "E1.4.1 workspace RPCs have exact return-column counts",
    "E1.4.1 workspace RPCs are trusted stable SECURITY DEFINER",
    "E1.4.1 workspace RPC execution is authenticated only",
    "E1.4.1 workspace RPCs derive active verified counselor authorization",
    "E1.4.1 workspace list RPC searches only approved identity fields",
    "E1.4.1 workspace list RPC validates filters and bounded pagination",
    "E1.4.1 workspace list RPC uses exact lifecycle and academic allowlists",
    "E1.4.1 workspace list RPC uses deterministic static ordering",
    "E1.4.1 workspace list RPC returns sentinel count and available documents only",
    "E1.4.1 workspace metrics RPC is aggregate only and Asia Kolkata based",
    "E1.4.1 workspace RPCs do not mutate application data",
  ]) {
    assert.match(section, new RegExp(checkName));
  }

  assert.equal(
    section.match(/'E1\.4\.1:' \|\| expected\.function_name/g)?.length,
    1,
  );
  assert.equal(
    section.match(/'list_counselor_university_application_workspace'/g)
      ?.length !== undefined,
    true,
  );
  assert.match(section, /parameter\.parameter_mode = 'OUT'/);
  assert.match(section, /proconfig in \(array\['search_path='\]::text\[\]/);
  assert.match(section, /p_archive_filter text default ''active''/);
  assert.match(section, /p_page_size not between 1 and 25/);
  assert.match(section, /generate_series\(128, 159\)/);
  assert.match(section, /8303, 12288, 65279/);
  assert.match(section, /normalized_search ~~%/);
  assert.match(section, /collate pg_catalog\."c"/);
  assert.match(
    section,
    /count\(distinct application\.student_id\) filter%is_archived is false/,
  );
  assert.match(section, /workspace_application_id end desc/);
  assert.match(section, /workspace_application_id end asc/);
  assert.match(section, /status = ''available''/);
  assert.match(section, /at time zone ''asia\/kolkata''/);

  for (const zeroRequiredLabel of [
    "active primary applications without a student-role owner",
    "workspace applications missing an owning profile",
    "university applications with more than 20 available documents",
    "nonarchived university applications with invalid country codes",
  ]) {
    assert.match(section, new RegExp(zeroRequiredLabel));
  }

  assert.doesNotMatch(
    section,
    /as object_name,\s*(?:application_id|student_id|college_email|full_name|university_name|programme_name|application_reference|document_id)/,
  );
});

test("A1.1 readiness verifies the director dashboard read boundary", () => {
  const section =
    verificationSource.match(
      /-- Phase A1\.1[\s\S]*?-- Aggregate-only D1 inventory/,
    )?.[0] ?? "";

  for (const checkName of [
    "A1.1 director RPC signatures have no overloads",
    "A1.1 director metrics RPC has exact signature and returns",
    "A1.1 director workload RPC has exact signature and returns",
    "A1.1 director attention RPC has exact signature and returns",
    "A1.1 director RPCs are trusted stable SECURITY DEFINER",
    "A1.1 director RPC execution is authenticated only",
    "A1.1 director RPCs derive exact active verified director authorization",
    "A1.1 director RPCs use bounded generic errors",
    "A1.1 director list RPCs validate exact bounded one-page limits",
    "A1.1 attention uses exact kinds severities relationships and no follow-up rows",
    "A1.1 workload uses grouped aggregates and exact deterministic ordering",
    "A1.1 director metrics and attention use Asia Kolkata current state",
    "A1.1 director RPCs exclude private notes documents and sensitive fields",
    "A1.1 director RPCs contain no dynamic SQL or mutations",
  ]) {
    assert.match(section, new RegExp(checkName));
  }

  assert.match(section, /pg_get_function_identity_arguments/);
  assert.match(section, /pg_get_function_result/);
  assert.match(section, /proconfig in \(array\['search_path='\]::text\[\]/);
  assert.match(section, /'director'::public\.user_role/);
  assert.match(section, /p_limit integer DEFAULT 20/);
  assert.match(section, /p_limit integer DEFAULT 25/);
  assert.match(section, /asia\/kolkata/);
  assert.doesNotMatch(
    section,
    /as object_name,\s*(?:student_id|counselor_id|college_email|full_name|application_id|follow_up_id|consultation_id|next_action|details)/,
  );

  for (const diagnostic of [
    "profiles whose email violates their role policy",
    "follow-ups owned by a non-counselor profile",
    "assigned consultations referencing a non-counselor profile",
    "current applications with a non-counselor last changer",
  ]) {
    assert.match(section, new RegExp(diagnostic));
  }
});

test("A1.1.2 readiness verifies private one-time staff provisioning", () => {
  const section =
    verificationSource.match(
      /-- Phase A1\.1\.2 secure one-time staff identity provisioning[\s\S]*?-- Phase A1\.3 Director operational oversight foundation/,
    )?.[0] ?? "";

  for (const checkName of [
    "A1.1.2 profile email constraint remains normalized and role-aware",
    "A1.1.2 Auth trigger retains trusted ownership ACL and binding",
    "A1.1.2 public identity path remains exact KCT student only",
    "A1.1.2 private staff request has exact role-bound single-use structure",
    "A1.1.2 private staff request has no browser or service direct access",
    "A1.1.2 staff prepare RPC has exact volatile service-role-only contract",
    "A1.1.2 staff prepare RPC validates role email hash expiry and replacement",
    "A1.1.2 live SHA-256 pipeline resolves and matches known vector",
    "A1.1.2 has no additional public provisioning RPC surface",
    "A1.1.2 staff trigger uses only the exact token transport field",
    "A1.1.2 staff token locks exact request derives role and consumes atomically",
    "A1.1.2 Director authorization remains role active verified and admin denied",
  ]) {
    assert.match(section, new RegExp(checkName));
  }

  assert.match(section, /kgeo_staff_provisioning_requests/);
  assert.match(section, /prepare_staff_identity_provisioning/);
  assert.match(section, /request\.approved_role/);
  assert.match(section, /v_normalized_email text/);
  assert.match(section, /v_provisioning_token text/);
  assert.match(section, /v_token_hash text/);
  assert.match(section, /v_approved_role public\.user_role/);
  assert.match(
    section,
    /request\.normalized_email = v_normalized_email/,
  );
  assert.match(section, /request\.token_hash = v_token_hash/);
  assert.match(section, /request\.consumed_at is null/);
  assert.match(section, /request\.expires_at > v_request_time/);
  assert.match(section, /definition !~\*/);
  assert.match(section, /kgeo_staff_provisioning_token/);
  assert.match(section, /pg_catalog\.convert_to\(text,name\)/);
  assert.match(section, /pg_catalog\.sha256\(bytea\)/);
  assert.match(section, /pg_catalog\.encode\(bytea,text\)/);
  assert.match(
    section,
    /pg_catalog\.convert_to\('abc'::text, 'UTF8'::name\)/,
  );
  assert.match(section, /'hex'::text/);
  assert.match(
    section,
    /ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad/,
  );
  assert.match(section, /known_answer\.token_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(section, /pg_catalog\.pg_attrdef/);
  assert.match(section, /pg_catalog\.pg_get_expr/);
  assert.match(section, /constraint_record\.convalidated/);
  assert.match(section, /statement_timestamp\(\)/);
  assert.match(section, /consumed_at >= created_at/);
  assert.match(
    section,
    /has_schema_privilege\('public', 'private', 'USAGE'\)/,
  );
  assert.match(section, /has_table_privilege\(\s*'public', relation\.oid/);
  assert.match(section, /not like '%raw_app_meta_data%'/);
  assert.match(section, /for update/);
  assert.match(section, /raw_user_meta_data -> ''full_name''/);
  assert.match(section, /select pg_catalog\.count\(\*\) = 1[\s\S]*?on_auth_user_created/);
  assert.match(section, /auth_user\.email_confirmed_at is not null/);
  assert.match(section, /profile\.is_active is true/);
  assert.doesNotMatch(section, /kgeo_director_bootstrap_token/);
  assert.doesNotMatch(section, /director profiles with invalid institutional email/);
});

test("A1.3 readiness verifies the Director operational oversight boundary", () => {
  const section = verificationSource.match(
    /-- Phase A1\.3 Director operational oversight foundation[\s\S]*?-- Aggregate-only A1\.1 required-zero/,
  )?.[0] ?? "";

  for (const checkName of [
    "A1.3 Director oversight RPC signatures have no overloads",
    "A1.3 student oversight signature and return are exact",
    "A1.3 consultation oversight signature and return are exact",
    "A1.3 application oversight signature and return are exact",
    "A1.3 Director oversight RPCs are trusted stable SECURITY DEFINER",
    "A1.3 Director oversight RPC execution is authenticated only",
    "A1.3 RPCs derive exact active verified Director authorization",
    "A1.3 lists enforce bounded filters pagination and generic errors",
    "A1.3 list ordering has deterministic UUID tie breakers",
    "A1.3 Director oversight excludes private content and mutations",
  ]) {
    assert.match(section, new RegExp(checkName));
  }

  assert.match(section, /pg_get_function_identity_arguments/);
  assert.match(section, /pg_get_function_result/);
  assert.match(section, /proconfig in \(array\['search_path='\]::text\[\]/);
  assert.match(section, /has_function_privilege\(\s*'authenticated'/);
  assert.match(section, /p_page_size not between 1 and 50/);
  assert.match(section, /counselor_student_notes/);
  assert.match(section, /counselor_follow_ups/);
  const mutationCheck = section.match(
    /'A1\.3 Director oversight excludes private content and mutations'[\s\S]*?from director_oversight_functions[\s\S]*?\), false\)/,
  )?.[0] ?? "";
  assert.match(mutationCheck, /not like '%execute %'/);
  assert.match(mutationCheck, /not like '%insert into %'/);
  assert.match(mutationCheck, /not like '%delete from %'/);
  assert.match(
    mutationCheck,
    /definition !~\s*'\\mupdate\\M\[\[:space:\]\]\+'/,
  );
  assert.doesNotMatch(
    section,
    /as object_name,\s*(?:student_id|counselor_id|college_email|full_name|application_id|consultation_id|next_action|details)/,
  );
});

test("A1.4.1 readiness verifies consultation ownership and FCFS assignment", () => {
  const section = verificationSource.match(
    /-- Phase A1\.4\.1 consultation ownership and FCFS assignment foundation[\s\S]*?-- Aggregate-only A1\.1 required-zero/,
  )?.[0] ?? "";

  for (const checkName of [
    "A1.4.1 consultation function signatures have no overloads",
    "A1.4.1 consultation functions retain trusted ownership and search path",
    "A1.4.1 claim execution is authenticated only",
    "A1.4.1 student booking is fixed-slot assignment pending",
    "A1.4.1 claim derives exact active verified counselor authorization",
    "A1.4.1 claim locks the exact earliest eligible booked request",
    "A1.4.1 claim assigns atomically and repeats ownership eligibility",
    "A1.4.1 unresolved ownership states have the exact constraint",
    "A1.4.1 outcomes require the assigned counselor in lock and update paths",
    "A1.4.1 ownership functions exclude private content dynamic SQL and unrelated mutations",
  ]) {
    assert.match(section, new RegExp(checkName.replaceAll(".", "\\.")));
  }

  assert.match(section, /pg_get_function_identity_arguments/);
  assert.match(section, /procedure\.prorettype/);
  assert.match(section, /procedure\.proretset/);
  assert.match(section, /prorettype = 'uuid'::pg_catalog.regtype\s*and proretset is false/);
  assert.match(section, /proconfig in \(array\['search_path='\]::text\[\]/);
  assert.match(section, /owner_name = 'postgres'/);
  assert.match(section, /has_function_privilege\(\s*'authenticated'/);
  assert.match(section, /counselor_profile\.role = ''counselor''/);
  assert.match(section, /v_caller_id := \(select auth\.uid\(\)\)/);
  assert.match(section, /order by request\.submitted_at asc, request\.id asc/);
  assert.match(section, /limit 1 for update/);
  assert.match(section, /assigned_counselor_id = v_caller_id/);
  assert.match(section, /assigned_at = v_assignment_time/);
  assert.match(
    section,
    /''submitted''::\(public\\\.\)\?consultation_status/,
  );
  assert.doesNotMatch(section, /''\(public\\\.\)\?submitted''/);
  assert.match(
    section,
    /insert into \(\?!public\\\.student_counselor_assignments\)/,
  );
  assert.match(section, /update \(\?!public\\\.consultation_requests\)/);
  assert.match(section, /target_assigned_counselor_id is distinct from caller_id/);
  assert.match(section, /request\.assigned_counselor_id = caller_id/);
  assert.doesNotMatch(section, /%caller_id := \(select auth\.uid\(\)\)%/);
  assert.doesNotMatch(section, /not like '%insert into %'/);
  assert.doesNotMatch(
    section,
    /as object_name,\s*(?:student_id|consultation_id|counselor_id|college_email|request_number|student_name)/,
  );
});

test("A1.4.2A readiness verifies Primary Counselor assignment boundaries", () => {
  const section = verificationSource.match(
    /-- Phase A1\.4\.2A Primary Counselor assignment foundation[\s\S]*?-- Aggregate-only A1\.1 required-zero/,
  )?.[0] ?? "";

  for (const checkName of [
    "A1.4.2A assignment table is exact sealed forced-RLS history",
    "A1.4.2A one active assignment and history indexes exist",
    "A1.4.2A participant roles and history immutability are trusted",
    "A1.4.2A first claim inserts only absent assignment atomically",
    "A1.4.2A My Students is exact-counselor bounded and active-only",
    "A1.4.2A Director projections are bounded and Director-only",
    "A1.4.2A assignment RPCs are authenticated-only and private-safe",
  ]) {
    assert.match(section, new RegExp(checkName.replaceAll(".", "\\.")));
  }

  assert.match(section, /student_counselor_assignments_one_active_student_key/);
  assert.match(section, /on conflict \(student_id\)/);
  assert.match(section, /assignment\.counselor_id = v_caller_id/);
  assert.match(section, /has_active_verified_kgeo_role%''director''/);
  assert.doesNotMatch(
    section,
    /as object_name,\s*(?:student_id|counselor_id|college_email|full_name|assignment_id)/,
  );
});

test("legacy diagnostics return only the five requested aggregate counts", () => {
  const legacySection =
    executableSql.split("with business_clock as (").at(-1) ?? "";

  for (const label of [
    "missing canonical names",
    "unresolved past scheduled consultations",
    "completed consultations without outcome audit",
    "invalid outcome audit pairs",
    "profile-not-started students",
  ]) {
    assert.match(legacySection, new RegExp(`'${label}'`));
  }

  assert.equal(
    legacySection.match(/pg_catalog\.count\(\*\)::bigint/g)?.length,
    5,
  );
  assert.match(
    legacySection,
    /select\s+'legacy_count'::text as category,\s+count_name as object_name,\s+row_count\s+from[\s\S]/,
  );
});

test("Post-002 ACL and result type exact expectations", () => {
  const readinessPath = new URL("../../../supabase/verification/pre_phase_c2_readiness.sql", import.meta.url);
  const readinessSQL = fs.readFileSync(readinessPath, "utf8");
  const statement = readinessSQL;

  assert.ok(statement);

  // A. exact authenticated:f ACL expectation exists
  assert.match(statement, /array\['authenticated:f'\]::text\[\]/);

  // B. authenticated + service_role does NOT satisfy the installed function contract
  // The query uses strict EXCEPT set-operations against expected_case_functions
  assert.match(statement, /except\s+select \* from expected_case_functions/);

  // C. get_my_primary_counselor_case_access expects catalog result type text while the strict TABLE OUT contract remains mandatory
  assert.match(statement, /proallargtypes = array\[\s*'pg_catalog\.uuid'::pg_catalog\.regtype::oid,\s*'pg_catalog\.text'::pg_catalog\.regtype::oid\s*\]::oid\[\]/);
  assert.match(statement, /proargmodes = array\['i', 't'\]::"char"\[\]/);
  assert.match(statement, /proargnames = array\[\s*'p_student_id',\s*'access_state'\s*\]::text\[\]/);
});

test("Post-002 final gate lifecycle expectations", () => {
  const gatePath = new URL("../../../supabase/verification/a1_4_post002_final_gate.sql", import.meta.url);
  const gateSQL = fs.readFileSync(gatePath, "utf8");

  // D. post-002 gate cannot return TRUE when installed-function contract is false
  // Because it does NOT alias them to EXPECTED_PRE_002_FALSE
  assert.doesNotMatch(gateSQL, /EXPECTED_PRE_002_FALSE/);

  // E. post-002 gate cannot return TRUE when trigger inventory is false
  // It requires them to be strictly TRUE like all other checks via bool_and
  assert.match(gateSQL, /'POST_002_FINAL_GATE' as check_name/);
  assert.match(gateSQL, /bool_and\(passed\) as passed/);
});

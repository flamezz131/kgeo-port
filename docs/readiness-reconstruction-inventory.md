# Phase R1 readiness reconstruction inventory

This inventory was rebuilt from the immutable SQL migrations, in chronological
order. Migration SQL is authoritative. TypeScript contracts, focused tests,
database documentation, application code, and the previous readiness SQL are
corroborating evidence only.

Coverage states:

- **Fully covered**: catalog structure, effective privileges, definitions, and
  relevant aggregate drift are asserted automatically.
- **Manual verification required**: Supabase-managed ownership prevents a
  reliable catalog assertion in the SQL Editor role.
- **Intentionally not runtime-verifiable**: comments or historical migration
  text cannot be proven from the final live schema without migration history.

## Immutable migration hashes

| Migration | SHA-256 |
| --- | --- |
| `202607170001_initial_kgeo_schema.sql` | `5c3c7a5b4628db997f91d577b3f1b51400cf4693213e2daeaf7828c1f18024bb` |
| `202607180001_consultation_requests_v1.sql` | `f5beca24476a0c5d9f48cd3fbc222b9c278ebf9781291faa1cff8b250951e02d` |
| `202607190001_single_counselor_slot_booking.sql` | `5e814237b6230c04f517f2083393adc5818c3bd040fd3d7a26d1df8b541cc075` |
| `202607190002_student_profile_foundation.sql` | `370cf60acdef96ad57b5e1c384a1c4b29f7ee2f5cb0e822f77572c1db33c3219` |
| `202607200001_require_core_profile_for_preferences.sql` | `aec0c0207b54cd54387af6ce1d075de6a4830d6f8bc7dae9e8cd29e9b0fe3ab1` |
| `202607200002_counselor_student_directory_foundation.sql` | `38bdda3750f3c5398c1ae5144b93b40059327ae553bfffc9967b81bb385590ad` |
| `202607230001_canonical_names_and_consultation_outcomes.sql` | `500e575889108dad91bb6a08a6d01560f607707fac9656c3b5438ae476964b69` |
| `202607230002_atomic_student_identity_save.sql` | `0e8cf2228c80d3a58bdec3cdc520f65b0066aecccc14c51671e3a8960a171b64` |
| `202607230003_counselor_consultation_reference_rpc.sql` | `1cfd1e5ff871f76cacd290b3427d3652b537f18690056faa62e896422203a397` |
| `202607230004_consultation_reference_column_hardening.sql` | `11c7d770301f439ada3d4b8082c8bab48ebd4941cd331eeee9e1b7fdbfefbb51` |
| `202607250001_counselor_notes_and_follow_ups_foundation.sql` | `946782e65887ceacfe87bc028aed0f24f36519ab311390dd60e87dbb26b3d37f` |
| `202607250002_counselor_follow_up_workload.sql` | `8b03ad6970913d2d6e216e4985dda1f5ac5aa87f22a94d7ac670cd42c43c990f` |
| `202607250003_official_counseling_progression.sql` | `7f59a16d970db1e79b6dd9789f35e71c07b9f0a90d2802741cb76fd6141a523c` |
| `202607260001_progression_evidence_foundation.sql` | `c2161759110a1531ac3bb48189648c73123a89111f3d0aee29f78fd4075b9727` |
| `202607260002_progression_correction_foundation.sql` | `90d9a6e6f1b7fecb5a8a2e667c61eeb62b8546b33db402c3e1faf21a09e207fb` |
| `202607270001_university_application_foundation.sql` | `09d8c32734b159535387a4f6e21fda54d4b59ba4bbb60de4f93b7179794cb35b` |
| `202607280001_student_university_application_read_foundation.sql` | `3209de9d8bae1a8a2762fc9e539f3193cb9db2e6bd520cf60b420d85ea0d8875` |
| `202608010001_university_application_documents_foundation.sql` | `9cff3f5849fffa9d610b3d7a8bbab2ac0f04dc3e7729ca95bc46d0c0a6d548a1` |
| `202608020001_counselor_application_workspace_read_foundation.sql` | `d08643961a2bba54946cfd595fbc86f02b99b56696e705cf5b502fd5f467865d` |
| `202608060001_director_dashboard_read_foundation.sql` | `1179d59e46ba49904efe5bf610705aff6338dc52e92dd0b00ed57ad6630a0303` |
| `202608060002_director_identity_bootstrap_support.sql` | `944e1fc3d71c93d983f41efc244e8814f2c489c47627a89c85f5339d56d83b8c` |
| `202608060003_staff_identity_provisioning.sql` | `2f3a4780c9056cb619e58e9c50ad4d0dd96063550faec68585ee1585b69573b0` |
| `202608070001_staff_provisioning_trigger_ambiguity_fix.sql` | `ef5ac6f499b680245565a287bc7115901895d559297b3f96106c66a8789f972a` |
| `202608090001_director_operational_oversight_foundation.sql` | `74de642bf267dc9ae2798ec3c9a9bc158f2717275883d84efb1f106f563bb2ed` |
| `202608110001_consultation_ownership_fcfs_assignment.sql` | `9f0e2d2250168cb6d84ce570a73a16014fc2f92cff2666868b43c5691356f1cc` |
| `202608120001_primary_counselor_assignment_foundation.sql` | `4ce059cde852c11e8a9f160e5b62a0c972481ffbca431f6b37c0e56e50cd6051` |
| `202608130001_primary_counselor_storage_authorization_helpers.sql` | `420721812ead7f7c357836c396542c2ad6f3bad5707b94124f591689003808b3` |
| `202608130002_primary_counselor_case_ownership_enforcement.sql` | `6cb85edd3ab1bb93ddd6ee426cba9f14502e0d1a25859fcbd993f41596d05405` |
| `202608180001_record_consultation_outcome_acl_alignment.sql` | `1245ba55bf5cf3357f355e1bf997b12dfa86a1ac86f4469be0760e558f12e5fb` |
| `202608180002_counselor_registration_approval.sql` | `74eef63ccd6af184685d140824b100df4d98aaa1d8f4f88d460da1b9adb38792` |
| `202608200001_counselor_registration_insert_timing_fix.sql` | `a22247d7de234fdddc358c0e84f80ead743232a4f0fd81cc9df82baa07dc8134` |
| `202608210001_kgeo_public_progress_publishing.sql` | `0e8570547fb09429e59821b984424945284d61e625c413d5f2c6ca51972e7760` |
| `202608210002_counselor_student_workspace_read_security.sql` | `082227c809de0effbc8c9913c8c65c0ab7df1d9e067e118a995b342e4fa37424` |
| `202608210003_director_primary_counselor_assignment.sql` | `5d8a80ba10857214daf1e6bce36eb77b99c4dbb06d7f205857593261285614f4` |
| `202608220001_student_eligibility_assessment.sql` | `0be6f4f023cd7bf32df7813f3a4e89b6dcb8c56ec410f39425658493971d9d28` |
| `202608220002_controlled_legacy_consultation_closure.sql` | `19e1a56fc8df6c4de899cc80ea76233f7eb53ee71af38ad38603ee4674679dd3` |
| `202608230001_duplicate_future_waiting_consultation_closure.sql` | `f3041686ace391deea0f7bba005df93972995b7d54beaffab58f1eed39c1fc7c` |
| `202608230002_time_aware_consultation_lifecycle.sql` | `61e989e2f678826a90aa4613126674203dc279429e73a68cf10734a333ca46b0` |
| `202608230003_complete_time_aware_consultation_prerequisites.sql` | `43443f4d5659916288b9b2e65401530ac0ff590ebb04db3ab696c38739910aa7` |
| `202608240001_automatic_consultation_allocation.sql` | `20171c1093993dd12b61167e6a87e9ee8a1dc9f8cd070630481233306cc501fb` |
| `202608240002_student_profile_documents.sql` | `984aae4600646c6d780bccd127ce27552e03102aaabddeee8ed140385d0daf38` |
| `202608250001_student_profile_v2_client_corrections.sql` | `c70c7bd6aa479351a02e3d7d4d0b2ddcae839ec16dae6e031a94360931edddfb` |
| `202608250004_application_journey_rpc_acl_correction.sql` | `bfdeb65d4790fdd96b56a8d9ae5b6a4588425c23a0566e3b737aa092007ff4df` |
| `202608250005_parent_report_workflow.sql` | `6308a713aaa10c90a02e47f3ceb3c1a4e4060a4de0a614970e6e8c0028a1dcbf` |
| `202609020001_global_masters_readiness_index.sql` | `1609bc37eae806491ec944603f2449e9179327f211cb247848be3a8f0fd56f8e` |
| `202609020002_student_achievement_evidence.sql` | `480d2451c4f7ea24aa63b5233f6da7d180a1113ce293ef94638838d53ee96b68` |
| `202609180001_director_student_profile_detail.sql` | `25e021d6caed648de22eed9e52e33d1d27b8f4c9afe4a9e5f1a56ed8bf67ca5e` |
| `202609210001_student_preference_courses_and_field.sql` | `b376ddb00647df548e01c4f723fb5c10efe43ae460ddee4bd2350e39bb6e4d29` |
| `202609230001_student_preferences_merge2_tab.sql` | `8ee1f302da33c14e7ab93ee8dc5f17352e0f8a188b1bc473ab7920089c0313fe` |
| `202609290001_fix_eligibility_function_syntax.sql` | `ae06ac7afe7ffbd69b6b9624779ef2ca1ec6a720fc7b67160d83e8b4a6deaae3` |
| `202609290002_public_progress_funnel_validation.sql` | `721fd5a5c8210adfbe0a62af640ee1b17605c98f488be1f77c692acf4f5538d6` |
| `202610080001_single_counselor_authorization.sql` | `05fe6d9a1623f8988a3a0faf510cad97a04fb40fe81254fa37d9a4465ed55970` |
| `202610080002_student_multi_institution_auth.sql` | `61d9c4f449d02ce3087a6ad6a0fb316fe2a98900d660a170db5864589675d778` |
| `202610080003_student_graduation_year_range.sql` | `8dc58379b5aae1dbb8c23a0c3bba2fe9c223b4fd77ad956f6c8515db05adb7f0` |

## Migration coverage matrix

| Migration | Database domain and objects | Required readiness assertion | Drift diagnostic | Status | Evidence source |
| --- | --- | --- | --- | --- | --- |
| `202607170001_initial_kgeo_schema.sql` | Identity: `public.user_role`, `public.profiles`, `public.set_profiles_updated_at()`, `public.handle_new_user()`, `profiles_set_updated_at`, `on_auth_user_created`, `profiles_select_own`, `profiles_update_own` | Exact enum/table/columns/defaults/constraints, normalized institutional email, trigger definitions, RLS, own-profile grants and policies | Missing canonical student names | Fully covered | Migration; registration/profile tests |
| `202607180001_consultation_requests_v1.sql` | Consultation base: `public.higher_studies_interest`, `public.consultation_status`, `public.consultation_request_number_seq`, `public.consultation_requests`, `public.prepare_consultation_request_insert()`, base triggers/indexes/policies | Exact table/enum/sequence/defaults/constraints/FKs, trusted ownership trigger, student SELECT/INSERT boundary | Invalid consultation and outcome aggregates | Fully covered | Migration; consultation submission tests |
| `202607190001_single_counselor_slot_booking.sql` | Fixed slots: `public.consultation_slot_availability_status`, `public.get_consultation_slot_availability(date)`, `consultation_requests_active_slot_key`, `consultation_requests_student_history_idx`, counselor/director-admin read policies | Six-slot return contract, Asia/Kolkata expiry, concurrency-safe partial uniqueness, cancelled release, role read policies | Unresolved past scheduled consultations | Fully covered | Migration; availability/booking tests |
| `202607190002_student_profile_foundation.sql` | Profile tables, completion view, eight profile enums, ownership/normalization helpers, twelve triggers, eleven indexes, eighteen student/counselor policies | Exact columns/defaults/nullability/constraints/FKs, completion calculation, trusted ownership, narrow grants, student own access and counselor read-only access | Profile-not-started students | Fully covered | Migration; profile and directory contracts |
| `202607200001_require_core_profile_for_preferences.sql` | Alters `student_preferences_insert_own` and `student_preferences_update_own` | Both policies require matching `public.student_profiles` without recursion or broadened grants | Preferences-only records are covered by structural policy checks; row repair remains manual | Fully covered | Migration; optional-record tests |
| `202607200002_counselor_student_directory_foundation.sql` | `public.student_directory_profile_state`, `public.list_counselor_student_directory(...)`, `public.get_counselor_student_identity(uuid)` | Exact arguments/returns, SECURITY DEFINER owner/search path, verified counselor guard, bounded pagination/search, authenticated-only EXECUTE | Directory aggregate exposure is intentionally avoided | Fully covered | Migration; directory contract tests |
| `202607230001_canonical_names_and_consultation_outcomes.sql` | Alters `public.handle_new_user()`, extends `public.consultation_status`, adds outcome audit columns/FKs/index, `public.record_consultation_outcome(uuid,text)`, replaces counselor consultation policy | Canonical name trigger, `no_show`, audit pair constraints, counselor authorization, Asia/Kolkata lifecycle, atomic first transition | Missing names, overdue scheduled rows, missing/invalid outcome audits | Fully covered | Migration; outcome contracts |
| `202607230002_atomic_student_identity_save.sql` | `public.save_student_identity(text,text,text,text,text,text,text,integer,integer,integer)` and revoked direct identity mutations | Caller-derived student, atomic two-table save, exact safe inputs, normalized name, authenticated-only EXECUTE | Profile completion aggregate only | Fully covered | Migration; identity-save contract |
| `202607230003_counselor_consultation_reference_rpc.sql` | `public.get_counselor_consultation_references(uuid[])` | Counselor-only, bounded UUID array, exact safe return, authenticated-only EXECUTE | No request-number row output | Fully covered | Migration; counselor-reference tests |
| `202607230004_consultation_reference_column_hardening.sql` | Final consultation column SELECT grants; removes table-wide authenticated SELECT | `request_number` denied through direct table access while approved columns remain selectable under RLS | Not applicable | Fully covered | Migration; student-list/reference tests |
| `202607250001_counselor_notes_and_follow_ups_foundation.sql` | D1 enums/tables, ownership/normalization triggers, four indexes, seven policies, `public.record_counselor_follow_up_status(uuid,text)` | Exact private schemas, counselor ownership, cross-student link denial, pending-only transitions, completion audit, no student/admin/director access | Aggregate note and follow-up counts only | Fully covered | Migration; D1 contract tests |
| `202607250002_counselor_follow_up_workload.sql` | `public.list_counselor_follow_up_workload(text,text,text,date,date,integer,integer)` | Exact 20-column return, bounded filters/pagination, Asia/Kolkata lifecycle and global metrics, deterministic ordering | No private workload rows | Fully covered | Migration; D2 contract tests |
| `202607250003_official_counseling_progression.sql` | Progression enums/tables, two history/current indexes plus initial index, two policies, `public.record_student_counseling_progression(uuid,text,text,text)` | Exact projection/history schema, append-only history, counselor-only reads/writes through RPC, locks, state graph, audit timestamp identity | Six aggregate projection/history drift counts | Fully covered | Migration; D3.1 contracts |
| `202607260001_progression_evidence_foundation.sql` | Evidence enum/table/indexes/policy, prepare/finalize/remove RPCs, private `counseling-progression-evidence` bucket and two Storage policies | Exact metadata lifecycle, five-file lock, two-hour pending expiry, object existence, soft removal, bucket limits/MIME, private INSERT/SELECT only | Eight aggregate evidence/storage lifecycle counts | Manual verification required for Storage policies; public objects fully covered | Migration; D3.3.1 contracts; Supabase ownership note |
| `202607260002_progression_correction_foundation.sql` | Correction enum/table/policy, repaired progression event FK/index, replacement progression RPC, undo RPC, bounded correction-context RPC | Exact correction relationships, ordered advisory/row locks, latest-effective-event rules, evidence gate, correction-aware initialization, counselor-only reads | Eight aggregate correction/effective-history counts | Fully covered | Migration; D3.4.1 contracts |
| `202607270001_university_application_foundation.sql` | Four application enums, projection/event tables, four indexes, two policies, five mutation RPCs | Exact schemas/constraints/FKs/indexes, counselor-only column reads, atomic version/event history, transition graph, submitted/primary/archive semantics, trusted grants | Thirteen aggregate projection/event/lifecycle counts | Fully covered | Migration; E1.1 contracts |
| `202607280001_student_university_application_read_foundation.sql` | `public.get_my_university_applications()` | Zero arguments/no overload, exact 12-column return, STABLE SECURITY DEFINER, postgres owner/empty search path, own active verified student, nonarchived 100-row bound, no private/event/mutation access | Number of students with more than 100 nonarchived applications | Fully covered | Migration; E1.3.1 foundation test |
| `202608010001_university_application_documents_foundation.sql` | Document enum/table/indexes/policy, five lifecycle/read RPCs, two Storage predicates, private `university-application-documents` bucket and two Storage policies | Exact counselor-only lifecycle, UUID-only application path, 20-document lock, two-hour pending expiry, object-existence finalization, five-minute signed-view authorization, final soft removal, exact bucket/MIME and private INSERT/SELECT only | Seven required-zero drift counts and three informational Storage lifecycle counts | Manual verification required for Storage policies; public objects and bucket fully covered | Migration; E1.3.3 contracts; Supabase ownership note |
| `202608020001_counselor_application_workspace_read_foundation.sql` | `public.list_counselor_university_application_workspace(...)` and `public.get_counselor_university_application_workspace_metrics()` | Exact signatures/returns, active verified counselor guard, bounded Unicode-safe literal search, C-collated deterministic filter/sort/page contracts, strict empty-page sentinel, available-only document aggregate, active-only-student and Asia/Kolkata operational metrics, authenticated-only execution | Four aggregate-only required-zero workspace drift counts | Staging applied and fully verified on 2026-08-02; all structural checks passed, all required-zero diagnostics were zero, representative plans/latency were reviewed, and production remains unapproved | Migration; E1.4.1 contracts; `kgeo-stable-after-e1-4-1` |
| `202608060001_director_dashboard_read_foundation.sql` | `public.get_director_dashboard_metrics()`, `public.list_director_counselor_workload(integer)`, and `public.list_director_attention_items(integer)` | Exact signatures/returns, trusted stable definer ownership, exact active verified director guard, authenticated-only execution, bounded one-page limits, grouped workload aggregates, exact attention kinds/severities, projection-only reads, privacy exclusions, and Asia/Kolkata boundaries | Four expected-zero aggregate ownership/role integrity counts | Prepared for senior migration review; live database verification pending | Migration; A1.1 director and readiness tests |
| `202608060002_director_identity_bootstrap_support.sql` | Role-aware `profiles_college_email_check` and trusted `public.handle_new_user()` Director bootstrap path | Exact-KCT public students, exact trusted `raw_app_meta_data` Director marker, no user-metadata role trust, normalized domain-free Director email, preserved trigger/owner/ACL, and unchanged active verified Director RPC authorization | Aggregate profiles violating their role-specific email policy | Prepared for controlled staging verification; no Director UI or bootstrap credential is included | Migration; A1.1.1 identity-bootstrap tests |
| `202608060003_staff_identity_provisioning.sql` | Private `kgeo_staff_provisioning_requests`, service-role-only `prepare_staff_identity_provisioning(...)`, and final `handle_new_user()` | Exact private columns/constraints/RLS/ACLs, counselor-or-Director approved role, role-specific email, unique SHA-256 hash, bounded expiry, locked single-use consumption, exact token transport, exact-KCT student fallback, and unchanged role/active/verified authorization | Existing A1.1 role/email ownership diagnostics only; ordinary expired or consumed requests are not drift | Applied to staging; live Auth insertion exposed the trigger identifier ambiguity corrected by the additive 202608070001 hotfix | Migration; A1.1.2 staff-provisioning and readiness tests |
| `202608070001_staff_provisioning_trigger_ambiguity_fix.sql` | Conflict-safe replacement of `public.handle_new_user()` only | Exact `v_`-prefixed PL/pgSQL variables, qualified private-request columns, unchanged locked role derivation and atomic consumption, trusted ownership/search path/ACL, and exactly one existing Auth trigger binding | No new row-level drift; installed function shape is verified structurally | Prepared for controlled staging application after migration 003 | Migration; A1.1.2 staff-provisioning and readiness tests |
| `202608090001_director_operational_oversight_foundation.sql` | `public.list_director_student_oversight(...)`, `public.list_director_consultation_oversight(...)`, and `public.list_director_application_oversight(...)` | Exact signatures/returns, stable definer ownership, active verified Director-only authorization, authenticated-only invocation, bounded validated filters, deterministic pagination, safe projections, generic errors, and privacy/mutation exclusions | Existing aggregate-only integrity diagnostics remain sufficient; no private row output is added | Prepared for controlled staging verification; no SQL has been applied | Migration; A1.3 foundation, parser, UI, and readiness tests |

## Migration coverage matrix

| Migration | Database domain and objects | Required readiness assertion | Drift diagnostic | Status | Evidence source |
| --- | --- | --- | --- | --- | --- |
| `202607170001_initial_kgeo_schema.sql` | Identity: `public.user_role`, `public.profiles`, `public.set_profiles_updated_at()`, `public.handle_new_user()`, `profiles_set_updated_at`, `on_auth_user_created`, `profiles_select_own`, `profiles_update_own` | Exact enum/table/columns/defaults/constraints, normalized institutional email, trigger definitions, RLS, own-profile grants and policies | Missing canonical student names | Fully covered | Migration; registration/profile tests |
| `202607180001_consultation_requests_v1.sql` | Consultation base: `public.higher_studies_interest`, `public.consultation_status`, `public.consultation_request_number_seq`, `public.consultation_requests`, `public.prepare_consultation_request_insert()`, base triggers/indexes/policies | Exact table/enum/sequence/defaults/constraints/FKs, trusted ownership trigger, student SELECT/INSERT boundary | Invalid consultation and outcome aggregates | Fully covered | Migration; consultation submission tests |
| `202607190001_single_counselor_slot_booking.sql` | Fixed slots: `public.consultation_slot_availability_status`, `public.get_consultation_slot_availability(date)`, `consultation_requests_active_slot_key`, `consultation_requests_student_history_idx`, counselor/director-admin read policies | Six-slot return contract, Asia/Kolkata expiry, concurrency-safe partial uniqueness, cancelled release, role read policies | Unresolved past scheduled consultations | Fully covered | Migration; availability/booking tests |
| `202607190002_student_profile_foundation.sql` | Profile tables, completion view, eight profile enums, ownership/normalization helpers, twelve triggers, eleven indexes, eighteen student/counselor policies | Exact columns/defaults/nullability/constraints/FKs, completion calculation, trusted ownership, narrow grants, student own access and counselor read-only access | Profile-not-started students | Fully covered | Migration; profile and directory contracts |
| `202608250001_student_profile_v2_client_corrections.sql` | Profile V2 enums and structured preference columns, Sports and DMAT enum extensions, current-input compatibility triggers | Exact controlled values, study-area/domain pairing, Study Pathway/Global Track Programme pairing, current CGPA and study-mode write contracts, normally enabled triggers, unchanged Profile Documents boundary | Legacy CGPA-unavailable, study-mode, and Preferred Study Level rows remain readable and completion-compatible until a Student makes a current save | Source complete; live verification pending | Migration; feature verifier; Profile V2 focused tests |
| `202607200001_require_core_profile_for_preferences.sql` | Alters `student_preferences_insert_own` and `student_preferences_update_own` | Both policies require matching `public.student_profiles` without recursion or broadened grants | Preferences-only records are covered by structural policy checks; row repair remains manual | Fully covered | Migration; optional-record tests |
| `202607200002_counselor_student_directory_foundation.sql` | `public.student_directory_profile_state`, `public.list_counselor_student_directory(...)`, `public.get_counselor_student_identity(uuid)` | Exact arguments/returns, SECURITY DEFINER owner/search path, verified counselor guard, bounded pagination/search, authenticated-only EXECUTE | Directory aggregate exposure is intentionally avoided | Fully covered | Migration; directory contract tests |
| `202607230001_canonical_names_and_consultation_outcomes.sql` | Alters `public.handle_new_user()`, extends `public.consultation_status`, adds outcome audit columns/FKs/index, `public.record_consultation_outcome(uuid,text)`, replaces counselor consultation policy | Canonical name trigger, `no_show`, audit pair constraints, counselor authorization, Asia/Kolkata lifecycle, atomic first transition | Missing names, overdue scheduled rows, missing/invalid outcome audits | Fully covered | Migration; outcome contracts |
| `202607230002_atomic_student_identity_save.sql` | `public.save_student_identity(text,text,text,text,text,text,text,integer,integer,integer)` and revoked direct identity mutations | Caller-derived student, atomic two-table save, exact safe inputs, normalized name, authenticated-only EXECUTE | Profile completion aggregate only | Fully covered | Migration; identity-save contract |
| `202607230003_counselor_consultation_reference_rpc.sql` | `public.get_counselor_consultation_references(uuid[])` | Counselor-only, bounded UUID array, exact safe return, authenticated-only EXECUTE | No request-number row output | Fully covered | Migration; counselor-reference tests |
| `202607230004_consultation_reference_column_hardening.sql` | Final consultation column SELECT grants; removes table-wide authenticated SELECT | `request_number` denied through direct table access while approved columns remain selectable under RLS | Not applicable | Fully covered | Migration; student-list/reference tests |
| `202607250001_counselor_notes_and_follow_ups_foundation.sql` | D1 enums/tables, ownership/normalization triggers, four indexes, seven policies, `public.record_counselor_follow_up_status(uuid,text)` | Exact private schemas, counselor ownership, cross-student link denial, pending-only transitions, completion audit, no student/admin/director access | Aggregate note and follow-up counts only | Fully covered | Migration; D1 contract tests |
| `202607250002_counselor_follow_up_workload.sql` | `public.list_counselor_follow_up_workload(text,text,text,date,date,integer,integer)` | Exact 20-column return, bounded filters/pagination, Asia/Kolkata lifecycle and global metrics, deterministic ordering | No private workload rows | Fully covered | Migration; D2 contract tests |
| `202607250003_official_counseling_progression.sql` | Progression enums/tables, two history/current indexes plus initial index, two policies, `public.record_student_counseling_progression(uuid,text,text,text)` | Exact projection/history schema, append-only history, counselor-only reads/writes through RPC, locks, state graph, audit timestamp identity | Six aggregate projection/history drift counts | Fully covered | Migration; D3.1 contracts |
| `202607260001_progression_evidence_foundation.sql` | Evidence enum/table/indexes/policy, prepare/finalize/remove RPCs, private `counseling-progression-evidence` bucket and two Storage policies | Exact metadata lifecycle, five-file lock, two-hour pending expiry, object existence, soft removal, bucket limits/MIME, private INSERT/SELECT only | Eight aggregate evidence/storage lifecycle counts | Manual verification required for Storage policies; public objects fully covered | Migration; D3.3.1 contracts; Supabase ownership note |
| `202607260002_progression_correction_foundation.sql` | Correction enum/table/policy, repaired progression event FK/index, replacement progression RPC, undo RPC, bounded correction-context RPC | Exact correction relationships, ordered advisory/row locks, latest-effective-event rules, evidence gate, correction-aware initialization, counselor-only reads | Eight aggregate correction/effective-history counts | Fully covered | Migration; D3.4.1 contracts |
| `202607270001_university_application_foundation.sql` | Four application enums, projection/event tables, four indexes, two policies, five mutation RPCs | Exact schemas/constraints/FKs/indexes, counselor-only column reads, atomic version/event history, transition graph, submitted/primary/archive semantics, trusted grants | Thirteen aggregate projection/event/lifecycle counts | Fully covered | Migration; E1.1 contracts |
| `202607280001_student_university_application_read_foundation.sql` | `public.get_my_university_applications()` | Zero arguments/no overload, exact 12-column return, STABLE SECURITY DEFINER, postgres owner/empty search path, own active verified student, nonarchived 100-row bound, no private/event/mutation access | Number of students with more than 100 nonarchived applications | Fully covered | Migration; E1.3.1 foundation test |
| `202608010001_university_application_documents_foundation.sql` | Document enum/table/indexes/policy, five lifecycle/read RPCs, two Storage predicates, private `university-application-documents` bucket and two Storage policies | Exact counselor-only lifecycle, UUID-only application path, 20-document lock, two-hour pending expiry, object-existence finalization, five-minute signed-view authorization, final soft removal, exact bucket/MIME and private INSERT/SELECT only | Seven required-zero drift counts and three informational Storage lifecycle counts | Manual verification required for Storage policies; public objects and bucket fully covered | Migration; E1.3.3 contracts; Supabase ownership note |
| `202608020001_counselor_application_workspace_read_foundation.sql` | `public.list_counselor_university_application_workspace(...)` and `public.get_counselor_university_application_workspace_metrics()` | Exact signatures/returns, active verified counselor guard, bounded Unicode-safe literal search, C-collated deterministic filter/sort/page contracts, strict empty-page sentinel, available-only document aggregate, active-only-student and Asia/Kolkata operational metrics, authenticated-only execution | Four aggregate-only required-zero workspace drift counts | Staging applied and fully verified on 2026-08-02; all structural checks passed, all required-zero diagnostics were zero, representative plans/latency were reviewed, and production remains unapproved | Migration; E1.4.1 contracts; `kgeo-stable-after-e1-4-1` |
| `202608060001_director_dashboard_read_foundation.sql` | `public.get_director_dashboard_metrics()`, `public.list_director_counselor_workload(integer)`, and `public.list_director_attention_items(integer)` | Exact signatures/returns, trusted stable definer ownership, exact active verified director guard, authenticated-only execution, bounded one-page limits, grouped workload aggregates, exact attention kinds/severities, projection-only reads, privacy exclusions, and Asia/Kolkata boundaries | Four expected-zero aggregate ownership/role integrity counts | Prepared for senior migration review; live database verification pending | Migration; A1.1 director and readiness tests |
| `202608060002_director_identity_bootstrap_support.sql` | Role-aware `profiles_college_email_check` and trusted `public.handle_new_user()` Director bootstrap path | Exact-KCT public students, exact trusted `raw_app_meta_data` Director marker, no user-metadata role trust, normalized domain-free Director email, preserved trigger/owner/ACL, and unchanged active verified Director RPC authorization | Aggregate profiles violating their role-specific email policy | Prepared for controlled staging verification; no Director UI or bootstrap credential is included | Migration; A1.1.1 identity-bootstrap tests |
| `202608060003_staff_identity_provisioning.sql` | Private `kgeo_staff_provisioning_requests`, service-role-only `prepare_staff_identity_provisioning(...)`, and final `handle_new_user()` | Exact private columns/constraints/RLS/ACLs, counselor-or-Director approved role, role-specific email, unique SHA-256 hash, bounded expiry, locked single-use consumption, exact token transport, exact-KCT student fallback, and unchanged role/active/verified authorization | Existing A1.1 role/email ownership diagnostics only; ordinary expired or consumed requests are not drift | Applied to staging; live Auth insertion exposed the trigger identifier ambiguity corrected by the additive 202608070001 hotfix | Migration; A1.1.2 staff-provisioning and readiness tests |
| `202608070001_staff_provisioning_trigger_ambiguity_fix.sql` | Conflict-safe replacement of `public.handle_new_user()` only | Exact `v_`-prefixed PL/pgSQL variables, qualified private-request columns, unchanged locked role derivation and atomic consumption, trusted ownership/search path/ACL, and exactly one existing Auth trigger binding | No new row-level drift; installed function shape is verified structurally | Prepared for controlled staging application after migration 003 | Migration; A1.1.2 staff-provisioning and readiness tests |
| `202608090001_director_operational_oversight_foundation.sql` | `public.list_director_student_oversight(...)`, `public.list_director_consultation_oversight(...)`, and `public.list_director_application_oversight(...)` | Exact signatures/returns, stable definer ownership, active verified Director-only authorization, authenticated-only invocation, bounded validated filters, deterministic pagination, safe projections, generic errors, and privacy/mutation exclusions | Existing aggregate-only integrity diagnostics remain sufficient; no private row output is added | Prepared for controlled staging verification; no SQL has been applied | Migration; A1.3 foundation, parser, UI, and readiness tests |
| `202608110001_consultation_ownership_fcfs_assignment.sql` | Replacement `public.prepare_consultation_request_insert()`, new `public.claim_next_consultation()`, replacement `public.record_consultation_outcome(uuid,text)`, ownership constraint, and approved assignment read column | Assignment-pending fixed-slot booking, exact counselor-only claim signature, deterministic `submitted_at`/UUID FCFS locking, atomic ownership, assigned-only outcomes, trusted ownership/search path/grants, and private-content exclusion | Existing unresolved unassigned scheduled bookings enter the claim queue; final history remains unchanged; structural constraint detects invalid ownership states | Prepared for controlled staging verification; no SQL has been applied | Migration; A1.4.1 assignment, submission, outcome, UI, and readiness tests |
| `202608120001_primary_counselor_assignment_foundation.sql` | `public.student_counselor_assignments`, history-protection trigger, replacement `public.claim_next_consultation()`, `public.list_my_primary_students(integer,integer)`, and two bounded Director assignment enrichments | Exact sealed table, one active assignment per Student, exact participant roles, immutable history, atomic first-claim insertion without replacement, counselor caller scope, Director-only safe reads, authenticated-only invocation, and private-content exclusion | Existing Students remain unassigned; no historical consultation, note, follow-up, progression, application, or document row is rewritten | Prepared for independent senior review and controlled staging verification; no SQL has been applied | Migration; A1.4.2A foundation, parser, UI, and readiness tests |
| `202608130001_primary_counselor_storage_authorization_helpers.sql` | Private `public.is_active_primary_counselor_for_student(uuid)` | Exact active verified Primary Counselor derived from `auth.uid()` with active assignment, postgres owner, empty search path, and no browser-role execution | No metadata or Storage rows change | Normal migration preceding reservation enforcement | Migration; A1.4.2B helper and readiness contracts |
| `202608130002_primary_counselor_case_ownership_enforcement.sql` | Transaction-held reservation locks, exact three-policy live Storage INSERT/ALL inventory, exact three-policy applicable SELECT/ALL allowlist, complete protected-relation trigger inventories, pending-reservation prerequisite, bounded case-access projection, six mutation triggers, and replaced application-document upload predicate | Requires authenticated-only protected progression/document policies plus the reviewed bucket-isolated PUBLIC marksheet INSERT and SELECT policies by exact expression hash and object dependencies; rejects every unknown applicable SELECT/ALL policy without name or bucket prefiltering; blocks concurrent reservation writes through trigger installation; requires the exact four-trigger historical pre-install allowlist and exact ten-trigger post-install allowlist; fails on any unrelated, disabled, alternate-function, or otherwise unexpected authorization object; then enforces fail-closed long-term ownership, no Director/Admin bypass, and consultation-owner separation | Resume upload is deferred without deleting its bucket or historical data; no cleanup, backfill, assignment inference, Storage-policy change, or historical rewrite; incompatible pending rows must expire through the approved lifecycle | Prepared for another independent senior review under reservation-gated Storage authorization | Migration; A1.4.2B foundation, UI, security, and readiness tests |
| `202608180001_record_consultation_outcome_acl_alignment.sql` | Revokes service_role EXECUTE grant on `public.record_consultation_outcome(uuid,text)` | Exact function OID, identity arguments, return type, owner, language, volatility, prosecdef, search_path, body SHA-256, and exact post-revoke authenticated grant | Aligns ACL for consultation outcome recording | Prepared for outcome ACL alignment | Migration; outcome contract and readiness tests |
| `202608180002_counselor_registration_approval.sql` | `public.counselor_approval_status`, sealed `public.counselor_accounts`, `counselor_accounts_select_director`, `counselor_accounts_select_own`, role-aware profile email constraint, trusted `public.handle_new_user()` counselor branch, bounded `public.list_director_counselor_accounts()`, `public.approve_counselor(uuid)`, and `public.reject_counselor(uuid)` | Exact normalized unique username and approval audit constraints, app-metadata-only pending counselor creation, unchanged private staff-token and exact-KCT student branches, own/Director read boundaries, active verified Director-only listing and locked approval transitions, authenticated-only RPC execution, and no password or technical-email exposure | Existing active counselors require reviewed same-UUID adoption before C1 route enforcement is deployed | Prepared for migration and live workflow review; SQL not applied | Migration; C1 counselor registration security and readiness inventory tests |

## Authoritative table-column inventory

- `profiles`: `id`, `college_email`, `role`, `full_name`, `is_active`,
  `created_at`, `updated_at`.
- `counselor_accounts`: `user_id`, `username`, `approval_status`,
  `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `created_at`,
  `updated_at`.
- `private.kgeo_staff_provisioning_requests`: `normalized_email`,
  `approved_role`, `token_hash`, `expires_at`, `consumed_at`, `created_at`.
- `consultation_requests`: `id`, `student_id`, `request_number`,
  `student_name`, `roll_number`, `college_email`, `personal_email`,
  `college_end_year`, `department`, `course`, `mobile_number`,
  `higher_studies_interest`, `status`, `assigned_counselor_id`,
  `consultation_date`, `slot_start`, `slot_end`, `outcome_recorded_at`,
  `outcome_recorded_by`, `submitted_at`, `assigned_at`, `created_at`,
  `updated_at`.
- `student_counselor_assignments`: `id`, `student_id`, `counselor_id`,
  `assigned_at`, `assigned_by`, `ended_at`, `created_at`.
- `student_profiles`: `student_id`, `roll_number`, `personal_email`,
  `mobile_number`, `college`, `course`, `department`, `current_year`,
  `current_semester`, `graduation_year`, `cgpa`, `cgpa_scale`,
  `cgpa_unavailable`, `active_backlogs`, `cleared_backlogs`,
  `sslc_percentage`, `hsc_percentage`, `diploma_percentage`,
  `academic_remarks`, `profile_status`, `profile_submitted_at`, `created_at`,
  `updated_at`.
- `student_preferences`: `student_id`, `higher_studies_interest`,
  `preferred_study_level`, `preferred_countries`, `preferred_program_areas`,
  `target_intake`, `budget_range`, `scholarship_required`, `funding_required`,
  `study_mode`, `academic_preference`, `student_planning_stage`, `created_at`,
  `updated_at`.
- `student_test_scores`: `id`, `student_id`, `exam_name`,
  `custom_exam_name`, `exam_status`, `attempt_number`, `planned_date`,
  `completed_date`, `score`, `valid_until`, `remarks`, `created_at`,
  `updated_at`.
- `student_achievements`: `id`, `student_id`, `achievement_type`, `title`,
  `organization`, `achievement_date`, `description`, `created_at`, `updated_at`.
- `counselor_student_notes`: `id`, `student_id`, `counselor_id`,
  `consultation_id`, `note_text`, `is_pinned`, `created_at`, `updated_at`.
- `counselor_follow_ups`: `id`, `student_id`, `counselor_id`,
  `consultation_id`, `due_date`, `priority`, `status`, `next_action`, `details`,
  `completed_at`, `completed_by`, `created_at`, `updated_at`.
- `student_counseling_progressions`: `student_id`, `current_stage`,
  `workflow_state`, `stage_started_at`, `last_changed_at`, `last_changed_by`,
  `created_at`, `updated_at`.
- `student_counseling_progression_events`: `id`, `student_id`,
  `previous_stage`, `new_stage`, `previous_state`, `new_state`, `changed_by`,
  `change_reason`, `changed_at`.
- `student_counseling_progression_evidence`: `id`, `progression_event_id`,
  `bucket_id`, `storage_path`, `original_file_name`, `mime_type`,
  `file_size_bytes`, `status`, `uploaded_by`, `prepared_at`,
  `upload_expires_at`, `available_at`, `removed_at`, `removed_by`,
  `removal_reason`, `created_at`, `updated_at`.
- `student_counseling_progression_event_corrections`: `id`,
  `target_event_id`, `correction_type`, `restored_stage`, `restored_state`,
  `restored_stage_started_at`, `corrected_by`, `correction_reason`,
  `corrected_at`.
- `student_university_applications`: `id`, `student_id`, `country_code`,
  `university_name`, `programme_name`, `degree_level`, `intake_term`,
  `intake_year`, `current_status`, `application_reference`, `portal_url`,
  `submission_deadline`, `submitted_at`, `is_primary`, `is_archived`,
  `archived_at`, `archived_by`, `archive_reason`, `version_number`,
  `created_by`, `last_changed_by`, `created_at`, `updated_at`,
  `last_changed_at`.
- `student_university_application_events`: `id`, `application_id`,
  `event_type`, `version_number`, `country_code`, `university_name`,
  `programme_name`, `degree_level`, `intake_term`, `intake_year`,
  `application_status`, `application_reference`, `portal_url`,
  `submission_deadline`, `submitted_at`, `is_primary`, `is_archived`,
  `change_reason`, `changed_by`, `changed_at`.
- `student_university_application_documents`: `id`, `application_id`,
  `status`, `document_title`, `original_file_name`, `bucket_id`,
  `storage_path`, `mime_type`, `file_size_bytes`, `uploaded_by`,
  `prepared_at`, `upload_expires_at`, `available_at`, `removed_at`,
  `removed_by`, `removal_reason`, `created_at`, `updated_at`.

Defaults, nullability, generated expressions, check constraints, foreign-key
actions, index predicates, trigger timing, function return types, ownership,
`SECURITY DEFINER`, empty `search_path`, RLS, policies, table/column privileges,
enum usage, and RPC ACLs are asserted by the reconstructed catalog queries.
Migration comments and the fact that a statement originated in a particular
historical migration are intentionally not runtime-verifiable from the final
schema. No migration performs an automatic application-row data rewrite;
legacy diagnostics remain aggregate-only and require manual review before any
repair.

## Core object declaration coverage

This list is machine-checked against `CREATE` and `ALTER POLICY` declarations
in all twenty-eight migrations. Repeated names identify deliberate replacements.

- Identity and consultations: `user_role`, `profiles`,
  `set_profiles_updated_at`, `handle_new_user`, `profiles_set_updated_at`,
  `on_auth_user_created`, `profiles_select_own`, `profiles_update_own`,
  `higher_studies_interest`, `consultation_status`,
  `consultation_request_number_seq`, `consultation_requests`,
  `prepare_consultation_request_insert`, `consultation_requests_prepare_insert`,
  `consultation_requests_set_updated_at`, `consultation_requests_student_id_idx`,
  `consultation_requests_submitted_at_idx`, `consultation_requests_status_idx`,
  `consultation_requests_assigned_counselor_id_idx`,
  `consultation_requests_fcfs_idx`, `consultation_requests_select_own`,
  `consultation_requests_insert_own`, `consultation_slot_availability_status`,
  `get_consultation_slot_availability`, `consultation_requests_active_slot_key`,
  `consultation_requests_student_history_idx`,
  `consultation_requests_select_counselor_all`,
  `consultation_requests_select_director_admin_all`,
  `consultation_requests_scheduled_end_idx`, `claim_next_consultation`,
  `record_consultation_outcome`,
  `save_student_identity`, `get_counselor_consultation_references`.
- Student profile foundation: `student_profile_status`,
  `student_preferred_study_level`, `student_study_mode`,
  `student_academic_preference`, `student_planning_stage`, `student_exam_name`,
  `student_exam_status`, `student_achievement_type`, `student_profiles`,
  `student_preferences`, `student_test_scores`, `student_achievements`,
  `student_profile_completion`, `is_valid_student_profile_text_array`,
  `has_active_verified_kgeo_role`, `prepare_student_owned_insert`,
  `normalize_student_profile_record`, `normalize_student_preferences_record`,
  `normalize_student_test_score_record`, `normalize_student_achievement_record`,
  `student_profiles_10_prepare_insert`, `student_profiles_20_normalize`,
  `student_profiles_30_set_updated_at`,
  `student_preferences_10_prepare_insert`,
  `student_preferences_20_normalize`,
  `student_preferences_30_set_updated_at`,
  `student_test_scores_10_prepare_insert`,
  `student_test_scores_20_normalize`,
  `student_test_scores_30_set_updated_at`,
  `student_achievements_10_prepare_insert`,
  `student_achievements_20_normalize`,
  `student_achievements_30_set_updated_at`,
  `student_profiles_college_roll_number_key`,
  `student_profiles_status_updated_idx`, `student_profiles_academic_filter_idx`,
  `student_profiles_roll_number_pattern_idx`,
  `student_preferences_directory_filter_idx`,
  `student_preferences_countries_idx`, `student_preferences_program_areas_idx`,
  `student_test_scores_student_history_idx`, `student_test_scores_attempt_key`,
  `student_test_scores_directory_filter_idx`,
  `student_achievements_student_history_idx`, `student_profiles_select_own`,
  `student_profiles_insert_own`, `student_profiles_update_own`,
  `student_profiles_select_counselor_all`, `student_preferences_select_own`,
  `student_preferences_insert_own`, `student_preferences_update_own`,
  `student_preferences_select_counselor_all`, `student_test_scores_select_own`,
  `student_test_scores_insert_own`, `student_test_scores_update_own`,
  `student_test_scores_delete_own`, `student_test_scores_select_counselor_all`,
  `student_achievements_select_own`, `student_achievements_insert_own`,
  `student_achievements_update_own`, `student_achievements_delete_own`,
  `student_achievements_select_counselor_all`,
  `student_directory_profile_state`, `list_counselor_student_directory`,
  `get_counselor_student_identity`.
- Counselor private work: `counselor_follow_up_priority`,
  `counselor_follow_up_status`, `counselor_student_notes`,
  `counselor_follow_ups`, `prepare_counselor_private_record`,
  `normalize_counselor_student_note`, `normalize_counselor_follow_up`,
  `counselor_student_notes_10_prepare`, `counselor_student_notes_20_normalize`,
  `counselor_follow_ups_10_prepare`, `counselor_follow_ups_20_normalize`,
  `counselor_student_notes_student_history_idx`,
  `counselor_student_notes_counselor_activity_idx`,
  `counselor_follow_ups_student_status_due_idx`,
  `counselor_follow_ups_counselor_status_due_idx`,
  `record_counselor_follow_up_status`, `counselor_student_notes_select_own`,
  `counselor_student_notes_insert_own`, `counselor_student_notes_update_own`,
  `counselor_student_notes_delete_own`, `counselor_follow_ups_select_own`,
  `counselor_follow_ups_insert_own`, `counselor_follow_ups_update_pending_own`,
  `list_counselor_follow_up_workload`.
- Official progression: `counseling_progression_stage`,
  `counseling_progression_state`, `student_counseling_progressions`,
  `student_counseling_progression_events`,
  `record_student_counseling_progression`,
  `student_counseling_progressions_state_stage_updated_idx`,
  `student_counseling_progression_events_student_history_idx`,
  `student_counseling_progression_events_initial_key`,
  `student_counseling_progressions_select_counselor`,
  `student_counseling_progression_events_select_counselor`,
  `counseling_progression_evidence_status`,
  `student_counseling_progression_evidence`,
  `prepare_student_counseling_progression_evidence_upload`,
  `finalize_student_counseling_progression_evidence_upload`,
  `remove_student_counseling_progression_evidence`,
  `progression_evidence_event_status_available_idx`,
  `progression_evidence_status_expiry_idx`, `progression_evidence_select_counselor`,
  `counseling_progression_correction_type`,
  `student_counseling_progression_event_corrections`,
  `undo_latest_student_counseling_progression_event`,
  `get_counselor_progression_correction_context`,
  `progression_event_corrections_select_counselor`.
- University applications: `university_application_status`,
  `university_application_degree_level`, `university_application_intake_term`,
  `university_application_event_type`, `student_university_applications`,
  `student_university_application_events`,
  `student_university_applications_student_active_idx`,
  `student_university_applications_student_status_idx`,
  `student_university_applications_one_primary_idx`,
  `student_university_application_events_history_idx`,
  `create_student_university_application`,
  `update_student_university_application_details`,
  `record_student_university_application_status`,
  `set_primary_student_university_application`,
  `archive_student_university_application`,
  `student_university_applications_select_counselor`,
  `student_university_application_events_select_counselor`,
  `get_my_university_applications`,
  `university_application_document_status`,
  `student_university_application_documents`,
  `university_application_documents_application_available_idx`,
  `university_application_documents_status_expiry_idx`,
  `prepare_university_application_document_upload`,
  `finalize_university_application_document_upload`,
  `list_university_application_documents`,
  `authorize_university_application_document_view`,
  `soft_remove_university_application_document`,
  `can_upload_university_application_document_object`,
  `can_view_university_application_document_object`,
  `university_application_documents_select_counselor`,
  `list_counselor_university_application_workspace`,
  `get_counselor_university_application_workspace_metrics`.
- Director operational oversight: `list_director_student_oversight`,
  `list_director_consultation_oversight`,
  `list_director_application_oversight`. Counselor oversight reuses the
  existing `list_director_counselor_workload` aggregate RPC.
- Primary Counselor assignment: `student_counselor_assignments`,
  `student_counselor_assignments_one_active_student_key`,
  `student_counselor_assignments_active_counselor_idx`,
  `student_counselor_assignments_student_history_idx`,
  `protect_student_counselor_assignment_history`,
  `list_my_primary_students`,
  `list_director_primary_counselor_assignments`,
  `list_director_primary_counselor_counts`, and the A1.4.2A replacement of
  `claim_next_consultation`.
- Primary Counselor case enforcement:
  `is_active_primary_counselor_for_student`,
  `get_my_primary_counselor_case_access`,
  `enforce_primary_counselor_student_case_row`,
  `enforce_primary_counselor_progression_evidence`,
  `enforce_primary_counselor_application_document`,
  `enforce_primary_counselor_case_on_notes`,
  `enforce_primary_counselor_case_on_follow_ups`,
  `enforce_primary_counselor_case_on_progressions`,
  `enforce_primary_counselor_case_on_applications`,
  `enforce_primary_counselor_case_on_progression_evidence`,
  `enforce_primary_counselor_case_on_application_documents`, and the A1.4.2B replacement of
  `can_upload_university_application_document_object`.

## Post-C1 and consultation-cutover coverage

- `202608200001_counselor_registration_insert_timing_fix.sql`: private
  `kgeo_counselor_registration_requests`,
  `prepare_counselor_registration_provisioning`, and the final
  `handle_new_user` insertion-timing contract.
- `202608210001_kgeo_public_progress_publishing.sql`:
  `kgeo_public_progress`, `publish_kgeo_public_progress`, and
  `get_public_kgeo_progress`.
- `202608210002_counselor_student_workspace_read_security.sql`: exact
  Primary-Counselor policies `student_profiles_select_primary_counselor`,
  `student_preferences_select_primary_counselor`,
  `student_test_scores_select_primary_counselor`,
  `student_achievements_select_primary_counselor`,
  `student_counseling_progressions_select_primary_counselor`,
  `student_counseling_progression_events_select_primary_counselor`,
  `progression_event_corrections_select_primary_counselor`,
  `progression_evidence_select_primary_counselor`,
  `student_university_applications_select_primary_counselor`,
  `student_university_application_events_select_primary_counselor`, and
  `university_application_documents_select_primary_counselor`; Director
  policies `student_profiles_select_director_all`,
  `student_preferences_select_director_all`,
  `student_test_scores_select_director_all`, and
  `student_achievements_select_director_all`; hardened functions
  `get_counselor_student_identity`,
  `get_counselor_progression_correction_context`,
  `list_university_application_documents`,
  `authorize_university_application_document_view`, and
  `can_view_university_application_document_object`.
- `202608210003_director_primary_counselor_assignment.sql`:
  `protect_student_counselor_assignment_history`,
  `reassign_primary_counselor`, and
  `list_director_primary_counselor_assignment_history`.
- `202608220001_student_eligibility_assessment.sql`: enums
  `student_eligibility_status`, `student_eligibility_academic_status`,
  `student_eligibility_backlog_status`,
  `student_eligibility_english_readiness`,
  `student_eligibility_aptitude_readiness`,
  `student_eligibility_profile_strength`, and
  `student_eligibility_application_readiness`; table/index/policies
  `student_eligibility_assessments`,
  `student_eligibility_assessments_latest_idx`,
  `student_eligibility_assessments_select_primary_counselor`, and
  `student_eligibility_assessments_select_director`; functions/trigger
  `is_valid_eligibility_country_list`,
  `protect_student_eligibility_assessment_history`,
  `protect_student_eligibility_assessment_history`,
  `save_student_eligibility_assessment`,
  `get_counselor_student_eligibility_assessments`,
  `get_counselor_latest_student_eligibility_assessment`, and
  `get_director_latest_student_eligibility_assessment`.
- `202608220002_controlled_legacy_consultation_closure.sql`:
  `protect_legacy_consultation_cancellation_audit`,
  `consultation_requests_protect_legacy_cancellation_audit`,
  `list_director_legacy_waiting_consultations`, and
  `close_legacy_waiting_consultation`.
- `202608230001_duplicate_future_waiting_consultation_closure.sql`:
  `list_director_duplicate_future_waiting_consultations` and
  `close_duplicate_future_waiting_consultation`.
- `202608230002_time_aware_consultation_lifecycle.sql`:
  `get_kgeo_consultation_slot_catalog`,
  `get_consultation_slot_availability`,
  `prepare_consultation_request_insert`, and `claim_next_consultation`.
- `202608240001_automatic_consultation_allocation.sql`: sealed
  `counselor_consultation_slot_blocks`, indexes
  `counselor_consultation_slot_blocks_one_active_key`,
  `counselor_consultation_slot_blocks_active_schedule_idx`, and
  `consultation_requests_active_student_slot_key`, and
  `consultation_requests_active_counselor_slot_key`; trigger/function
  `protect_counselor_consultation_slot_block_history`; narrow functions
  `kgeo_consultation_slot_lock_key`, `block_my_consultation_slot`,
  `release_my_consultation_slot_block`,
  `list_my_active_consultation_slot_blocks`,
  `book_student_consultation`, `continue_with_kgeo`,
  `get_consultation_slot_availability`,
  `list_my_assigned_consultations`,
  `get_my_consultation_dashboard_metrics`, and
  `get_counselor_consultation_references`; final policy
  `consultation_requests_select_primary_counselor`.
- `202608240002_student_profile_documents.sql`: enums
  `student_profile_document_type` and `student_profile_document_status`; sealed
  table `student_profile_documents`; indexes
  `student_profile_documents_student_available_idx` and
  `student_profile_documents_pending_expiry_idx`; narrow functions
  `prepare_student_profile_document_upload`,
  `finalize_student_profile_document_upload`,
  `list_my_student_profile_documents`,
  `list_primary_counselor_student_profile_documents`,
  `authorize_student_profile_document_view`,
  `authorize_student_profile_document_delete`,
  `finalize_student_profile_document_delete`,
  `can_upload_student_profile_document_object`,
  `can_view_student_profile_document_object`, and
  `can_delete_student_profile_document_object`. Storage-owner policies are
  versioned separately and verified by the feature readiness script.
- `202608250001_student_profile_v2_client_corrections.sql`: enums
  `student_preferred_study_area`, `student_preferred_domain`,
  `student_study_pathway`, `student_global_track_program`, and
  `student_funding_method`; preference columns `preferred_study_area`,
  `preferred_domain`, `study_pathway`, `global_track_program`, and
  `funding_method`; compatibility view `student_profile_completion`; functions
  `enforce_student_profile_v2_input_contract` and
  `enforce_student_preference_v2_input_contract`; normally enabled triggers
  `student_profiles_25_enforce_v2_input` and
  `student_preferences_25_enforce_v2_input`.
- `202608250002_counselor_journey_progress_semester_summaries.sql`: sealed
  append-only table/index `counselor_student_semester_summaries` and
  `counselor_student_semester_summaries_student_history_idx`; current-Primary
  author read policies
  `counselor_student_notes_select_current_primary_own` and
  `counselor_follow_ups_select_current_primary_own`; bounded trusted functions
  `record_counselor_student_semester_summary` and
  `get_counselor_student_semester_summaries`.
- `202608250003_university_application_journey_extension.sql`: independent
  enums `university_application_decision`,
  `university_application_offer_status`,
  `university_application_student_decision`,
  `university_application_fee_status`, `university_application_visa_status`,
  and `university_application_enrollment_status`; sealed projection/history
  tables `student_university_application_journeys` and
  `student_university_application_journey_events`; history index
  `student_university_application_journey_events_history_idx`; bounded trusted
  functions `get_counselor_university_application_journey`,
  `get_counselor_university_application_journey_history`,
  `get_my_university_application_journeys`, and
  `record_university_application_journey`.
- `202608250004_application_journey_rpc_acl_correction.sql`: exact
  authenticated-only execution repair for
  `get_counselor_university_application_journey`,
  `get_counselor_university_application_journey_history`,
  `get_my_university_application_journeys`, and
  `record_university_application_journey`; no function body is replaced.
- `202608250005_parent_report_workflow.sql`: exact enums
  `parent_report_status`, `parent_report_event_type`,
  `parent_report_attachment_source`, and `parent_report_attachment_status`;
  sealed forced-RLS tables `parent_reports`, `parent_report_events`, and
  `parent_report_attachments`; indexes
  `parent_reports_one_active_period_idx`,
  `parent_reports_director_queue_idx`, `parent_report_events_history_idx`,
  `parent_report_attachments_available_idx`, and
  `parent_report_attachments_active_source_idx`; authenticated trusted RPCs
  `create_parent_report_draft`, `list_counselor_parent_reports`,
  `list_director_parent_reports`, `get_parent_report_workspace`,
  `get_parent_report_render_payload`,
  `save_counselor_parent_report_narrative`,
  `save_director_parent_report_narrative`, `submit_parent_report`,
  `request_parent_report_revision`, `approve_parent_report`,
  `finalize_parent_report`, `authorize_parent_report_download`,
  `list_parent_report_attachment_candidates`,
  `add_parent_report_existing_attachment`,
  `prepare_parent_report_attachment_upload`,
  `finalize_parent_report_attachment_upload`,
  `remove_parent_report_attachment`,
  `can_upload_parent_report_object`, `can_view_parent_report_object`, and
  `can_delete_parent_report_object`. The private bucket Storage policy change
  is versioned in the separate Storage-owner artifact. The feature verifier
  also requires exact live size/MIME metadata for available report uploads and
  finalized PDF artifacts.
- `202609020001_global_masters_readiness_index.sql`: exact
  `global_readiness_band` enum; sealed forced-RLS table
  `student_global_readiness_assessments`; latest-history index
  `student_global_readiness_latest_idx`; immutable-history trigger
  `protect_student_global_readiness_assessment_history`; private helpers
  `normalize_global_readiness_text`, `is_valid_global_readiness_rationale`,
  `global_readiness_count_evidence`, and
  `build_global_readiness_evidence_snapshot`; current-Primary read policy
  `student_global_readiness_select_current_primary`; and authenticated-only,
  current-Primary RPCs `get_primary_counselor_global_readiness_evidence`,
  `create_student_global_readiness_assessment`,
  `list_primary_counselor_global_readiness_assessments`, and
  `get_primary_counselor_latest_global_readiness_assessment`.
- `202609020002_student_achievement_evidence.sql`: exact
  `student_achievement_document_status` and
  `student_achievement_document_removal_reason` enums; sealed forced-RLS table
  `student_achievement_documents`; indexes
  `student_achievement_documents_achievement_available_idx`,
  `student_achievement_documents_student_available_idx`, and
  `student_achievement_documents_pending_expiry_idx`; trusted functions
  `enforce_student_achievement_document_owner`,
  `protect_achievement_with_active_evidence`,
  triggers `student_achievement_documents_enforce_owner` and
  `student_achievements_protect_active_evidence`;
  `prepare_student_achievement_document_upload`,
  `authorize_student_achievement_document_validation`,
  `record_student_achievement_document_signature_validation`,
  `reject_student_achievement_document_signature`,
  `finalize_student_achievement_document_upload`,
  `list_my_student_achievement_documents`,
  `list_primary_counselor_student_achievement_documents`,
  `authorize_student_achievement_document_view`,
  `authorize_student_achievement_document_delete`,
  `finalize_student_achievement_document_delete`,
  `can_upload_student_achievement_document_object`,
  `can_view_student_achievement_document_object`, and
  `can_delete_student_achievement_document_object`. Storage policies are
  versioned separately in the Storage-owner artifact and validated by the
  feature-specific read-only verifier.
- `202609180001_director_student_profile_detail.sql`: exact read-only,
  authenticated-only Director Student 360 functions
  `get_director_student_identity`,
  `list_director_student_achievement_documents`,
  `authorize_director_student_achievement_document_view`,
  `list_director_student_profile_documents`,
  `authorize_director_student_profile_document_view`, and
  `get_director_student_case_detail`. Authorization is derived from the active
  verified Director role. Page projections exclude raw Storage paths, signed
  URLs, private Counselor notes, private follow-ups, and Counselor-only
  commentary; raw paths are returned only by the two server-route view
  authorization functions.
- `202609210001_student_preference_courses_and_field.sql`: additive columns on `student_preferences` —
  `preferred_courses` (`text[]`, not null, default empty, guarded by
  `student_preferences_courses_check` through
  `is_valid_student_profile_text_array` with 10 items of 120 characters) and
  `same_as_ug` (`boolean`, nullable). Column-level insert and update grants to
  `authenticated` only. Every step is conditional (`add column if not
  exists`, a guarded constraint) so it also applies where `same_as_ug` was
  added by hand, as on the live project; there it relaxes `same_as_ug` to
  nullable with no default. No row data, constraint, trigger or policy is
  removed. Covered by the existing subset column check in the canonical
  readiness verifier, which does not enumerate these optional columns.
- `202609230001_student_preferences_merge2_tab.sql`: adopts the K-GEO-merge2
  My Profile Preferences contract. Drops trigger
  `student_preferences_25_enforce_v2_input` and function
  `enforce_student_preference_v2_input_contract`, so preference saves no
  longer require the Profile V2 study area, domain, pathway and funding method
  or restrict study mode to on-campus / online. Adds enum labels
  `student_preferred_study_level.global_track` and
  `student_funding_method` `education_loan`, `scholarship_fully_funded`,
  `scholarship_partially_funded`, `other`. Adds nullable columns
  `domain_specializations` (`text[]`, default empty, guarded by `not valid`
  `student_preferences_domain_specializations_check`) and
  `global_track_duration` (`text`, guarded by `not valid`
  `student_preferences_global_track_duration_check`), with column-level
  insert and update grants to `authenticated` only. Every step is
  conditional; no row data, Profile V2 column or Profile V2 check constraint
  is removed. The Profile V2 supplement verifier
  `supabase/verification/202608250001_student_profile_v2_client_corrections.sql`
  expects the dropped trigger and no longer applies after this migration.
- `202609290001_fix_eligibility_function_syntax.sql`: re-creates
  `save_student_eligibility_assessment`,
  `get_counselor_student_eligibility_assessments`, and
  `get_director_latest_student_eligibility_assessment` with identical
  signatures, return shapes and logic, replacing the schema-qualified SQL
  special forms (`NULLIF`, `COALESCE`) that failed at run time with 42883.
  `CREATE OR REPLACE` keeps owner, grants and comments. No data changes.
- `202609290002_public_progress_funnel_validation.sql`: re-creates
  `publish_kgeo_public_progress` with an added check that each published
  funnel stage does not exceed the stage before it (initiated, submitted,
  offers, acceptance, visa, enrolled). Stored figures are not changed.
- `202610080001_single_counselor_authorization.sql`: forward-only Phase 3A
  authorization cutover to the single institutional Counselor architecture.
  It creates no table, column, policy, trigger, or index and changes no row.
  A fail-closed preflight requires exactly one operational Counselor
  (Counselor role, active profile, approved `counselor_accounts` row,
  confirmed and unbanned Auth identity) and requires that Counselor to be the
  reviewed institutional identity. It introduces the canonical helper
  `public.is_approved_active_verified_counselor()`: zero arguments, boolean,
  SQL, STABLE, SECURITY DEFINER, postgres owner, empty search path, EXECUTE
  for `authenticated` only, true only when `auth.uid()` is that approved,
  active, verified Counselor. It redefines
  `public.is_active_primary_counselor_for_student(uuid)` as a temporary
  compatibility authorization bridge: the historical name, signature, owner,
  volatility, and security mode are retained because existing RLS policies,
  triggers, Storage predicates, and RPCs still call it, but it no longer
  means active Primary ownership. It now returns true when the caller
  satisfies `is_approved_active_verified_counselor` and the supplied profile
  has the Student role, with EXECUTE for `authenticated` only. Historical
  `student_counselor_assignments` rows, constraints, indexes, and the
  history-protection trigger are preserved unchanged as history; they are no
  longer read by either helper. Continue with K-GEO and Director reassignment
  are not retired by this migration. The current contract is validated by the
  feature-specific read-only verifier
  `supabase/verification/202610080001_single_counselor_authorization.sql`.
  Canonical readiness still records the earlier Phase A1.4.2B body hash and
  empty grantee list for `is_active_primary_counselor_for_student`; that
  historical expectation is superseded for this helper by the supplement and
  was deliberately not rewritten.
- `202610080002_student_multi_institution_auth.sql`: extends public Student
  registration from KCT-only to the exact approved Student institution
  domains `@kct.ac.in`, `@kclas.ac.in` and `@kctbs.ac.in`. It changes exactly
  two objects in one transaction behind a fail-closed preflight: it
  re-creates `handle_new_user` so the public Student branch accepts the three
  exact domains (owner, SECURITY DEFINER and search path retained; Counselor
  and Director provisioning unchanged), and it replaces
  `profiles_college_email_check` under the same name with explicit role
  handling: Counselor and Director keep the generic valid-email rule, Student
  requires one of the three exact domains, and any other role keeps the exact
  `@kct.ac.in` rule. The constraint is added validated; no row is rewritten
  and `profiles_full_name_check` is untouched. The institution selected in the
  UI is never trusted by the database. Covered by
  `src/lib/auth/student-multi-institution-migration.test.ts`.
- `202610080003_student_graduation_year_range.sql`: widens the database
  safety envelope `student_profiles_graduation_year_check` on
  `student_profiles.graduation_year` from 2024-2040 to 2000-2100 behind a
  fail-closed preflight. No other constraint, column, function, policy or
  trigger changes; the constraint is added validated and no row is rewritten.
  The selectable range (current calendar year, four years before and four
  after) is enforced by application validation, not the database. Covered by
  `src/lib/profiles/graduation-year-migration.test.ts`.

The automatic-allocation supplement
`supabase/verification/automatic_consultation_allocation_readiness.sql`
performs read-only post-application catalog and row-state checks. Canonical
readiness remains the sole whole-platform readiness authority.

## Storage limitation

The progression-evidence and university-application-document bucket
configurations and policies are catalog-visible and asserted by canonical
readiness. A1.4.2B leaves every Storage policy and ownership boundary unchanged.
The final enforcement migration reads the complete authenticated-applicable
INSERT/ALL and SELECT/ALL policy sets, including PUBLIC and recursively inherited
applicability. It requires exactly three reviewed INSERT contracts. The
protected progression and application-document INSERT policies must remain
permissive, `authenticated`, and match their complete schema-preserving
expressions. The unrelated PUBLIC marksheet INSERT policy is accepted only with
its reviewed expression SHA-256, exact `storage.objects` relation dependency,
and exact `auth.uid()` plus `storage.foldername(name text)` function
dependencies; that hash binds the `academic-documents` bucket. Resume upload is
deferred from current V1, so no resume INSERT policy is expected and the bucket
and historical data remain untouched. The complete applicable SELECT/ALL set
must equal the two reviewed protected `authenticated` policies plus the reviewed
PUBLIC marksheet SELECT policy without name or bucket substring prefiltering.
The marksheet SELECT is accepted only with its exact normalized expression hash
and dependencies; both protected policies must remain exact.
Transaction-held reservation locks close the scan-to-trigger race. Readiness
repeats every live Storage contract and additionally verifies complete critical
function-body hashes and exact trigger bindings before accepting the
installation. A false Storage assertion must never be bypassed by weakening
these fail-closed checks.

## Final senior-review prompt

Review `supabase/verification/pre_phase_c2_readiness.sql` against every immutable
migration hash above. Confirm that all statements execute inside a repeatable-
read, read-only transaction; every enum comparison constructs `text[]`; all
structural, function, RLS, grant, Storage, E1.3.1, and E1.3.3 assertions match the final
schema; every diagnostic returns only a stable label and boolean or aggregate
count; and no migration, database object, Storage policy, or application runtime
was changed by Phase R1. Treat successful static tests as contract evidence, not
as proof of the live database. Require a manual staging execution and separate
Dashboard verification of Supabase-owned Storage policies before approval.

1. `202608180001_record_consultation_outcome_acl_alignment.sql`

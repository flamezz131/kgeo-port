import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const migration = read(
  "../../../supabase/migrations/202608210001_kgeo_public_progress_publishing.sql",
);
const sql = migration.replace(/--.*$/gm, "");
const publishFunction = sql.match(
  /create function public\.publish_kgeo_public_progress\([\s\S]*?\$function\$;/,
)?.[0];
const publicFunction = sql.match(
  /create function public\.get_public_kgeo_progress\(\)[\s\S]*?\$function\$;/,
)?.[0];
const directorAction = read(
  "../../app/actions/director-public-progress-actions.ts",
);
const directorActionState = read("public-progress-action-state.ts");
const directorPage = read(
  "../../components/director/director-public-progress.tsx",
);
const homepage = read("../../app/(public)/page.tsx");
const publicSection = read(
  "../../components/public/public-progress-section.tsx",
);
const publicLoader = read("../public-progress-server.ts");

const metricKeys = [
  "registered_for_advisory",
  "applications_initiated",
  "applications_submitted",
  "offers_received",
  "confirmed_acceptance",
  "visa_approved",
  "enrolled_overseas",
] as const;

test("the use-server module exports only the async publication action", () => {
  assert.match(directorAction, /^"use server";/);
  assert.equal((directorAction.match(/\bexport\s+/g) ?? []).length, 1);
  assert.match(
    directorAction,
    /export async function publishPublicProgressAction\(/,
  );
  assert.doesNotMatch(directorAction, /export (?:const|let|var|class|type|interface)/);
  assert.doesNotMatch(directorActionState, /["']use server["']/);
  assert.match(
    directorActionState,
    /export const initialPublishPublicProgressActionState/,
  );
  assert.match(
    directorPage,
    /public-progress-action-state/,
  );
});

test("D1.2 remains one pending forward transaction", () => {
  assert.match(migration, /^--[\s\S]*?\nbegin;/);
  assert.match(migration, /commit;\s*$/);
  assert.equal((sql.match(/\bbegin;/g) ?? []).length, 1);
  assert.equal((sql.match(/\bcommit;/g) ?? []).length, 1);
});

test("the backing model is one minimal authoritative record", () => {
  assert.equal((sql.match(/create table public\.kgeo_public_progress/g) ?? []).length, 1);
  assert.match(sql, /singleton boolean primary key default true/);
  assert.match(sql, /check \(singleton is true\)/);
  assert.doesNotMatch(sql, /snapshot|metric_key|jsonb?/i);
});

test("all seven official statistics are non-null non-negative integers", () => {
  const table = sql.match(
    /create table public\.kgeo_public_progress \([\s\S]*?\n\);/,
  )?.[0];
  assert.ok(table);
  for (const key of metricKeys) {
    assert.match(table, new RegExp(`${key} bigint not null`));
    assert.match(table, new RegExp(`${key} >= 0`));
  }
});

test("the Director publish RPC accepts exactly seven numeric values", () => {
  assert.ok(publishFunction);
  const argumentsSource = publishFunction.match(
    /publish_kgeo_public_progress\([\s\S]*?\)\nreturns table/,
  )?.[0];
  assert.ok(argumentsSource);
  assert.equal((argumentsSource.match(/ bigint/g) ?? []).length, 7);
  for (const key of metricKeys) {
    assert.match(argumentsSource, new RegExp(`p_${key} bigint`));
  }
  assert.doesNotMatch(argumentsSource, /reason|provenance|override|uuid/i);
});

test("only an active verified Director can publish", () => {
  assert.ok(publishFunction);
  assert.match(publishFunction, /v_director_id := \(select auth\.uid\(\)\)/);
  assert.match(publishFunction, /has_active_verified_kgeo_role/);
  assert.match(publishFunction, /'director'::public\.user_role/);
  assert.match(publishFunction, /is distinct from true/);
  assert.match(publishFunction, /errcode = '42501'/);
  assert.doesNotMatch(
    publishFunction,
    /'(?:student|counselor|admin)'::public\.user_role/,
  );
});

test("missing and negative values fail before publication", () => {
  assert.ok(publishFunction);
  assert.equal((publishFunction.match(/ is null/g) ?? []).length, 8);
  assert.equal((publishFunction.match(/ < 0/g) ?? []).length, 7);
  assert.match(publishFunction, /All seven K-GEO public statistics are required/);
  assert.match(publishFunction, /statistics cannot be negative/);
  assert.match(directorAction, /\.int\(\)\.nonnegative\(\)\.safe\(\)/);
});

test("publication derives Director identity and timestamp in the database", () => {
  assert.ok(publishFunction);
  assert.match(publishFunction, /v_director_id := \(select auth\.uid\(\)\)/);
  assert.match(publishFunction, /v_published_at := pg_catalog\.statement_timestamp\(\)/);
  assert.match(publishFunction, /updated_by,[\s\S]*updated_at/);
  assert.match(publishFunction, /v_director_id,[\s\S]*v_published_at/);
  assert.doesNotMatch(directorAction, /updated_by|director_id|auth\.uid/);
});

test("saving all seven values is one atomic singleton upsert", () => {
  assert.ok(publishFunction);
  assert.equal(
    (publishFunction.match(/insert into public\.kgeo_public_progress/g) ?? []).length,
    1,
  );
  assert.match(publishFunction, /on conflict \(singleton\) do update/);
  for (const key of metricKeys) {
    assert.match(
      publishFunction,
      new RegExp(`${key} = excluded\\.${key}`),
    );
  }
});

test("backing storage is forced-RLS and has no direct application privileges", () => {
  assert.match(sql, /alter table public\.kgeo_public_progress owner to postgres/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /force row level security/);
  assert.match(
    sql,
    /revoke all on table public\.kgeo_public_progress\s+from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(sql, /create policy|grant (?:select|insert|update|delete) on table/i);
});

test("public RPC exposes only seven numbers and one timestamp", () => {
  assert.ok(publicFunction);
  const contract = publicFunction.match(/returns table \([\s\S]*?\)\nlanguage/)?.[0];
  assert.ok(contract);
  assert.equal((contract.match(/bigint/g) ?? []).length, 7);
  assert.equal((contract.match(/timestamp with time zone/g) ?? []).length, 1);
  for (const key of metricKeys) assert.match(contract, new RegExp(key));
  assert.doesNotMatch(
    contract,
    /updated_by|director|student|counselor|reason|provenance|internal_id/i,
  );
  assert.doesNotMatch(publicFunction, /progress\.updated_by/);
});

test("public receives safe read RPC execution but no write capability", () => {
  assert.match(
    sql,
    /grant execute on function public\.get_public_kgeo_progress\(\)\s+to anon, authenticated/,
  );
  assert.match(
    sql,
    /grant execute on function public\.publish_kgeo_public_progress\([\s\S]*?\) to authenticated/,
  );
  assert.ok(publishFunction);
  assert.match(publishFunction, /'director'::public\.user_role/);
});

test("the feature has no operational data calculation dependency", () => {
  assert.doesNotMatch(
    sql,
    /calculate_kgeo_public_progress|consultation_requests|student_university_applications|submitted_at|current_status|student_counseling_progressions/i,
  );
  assert.doesNotMatch(
    `${directorAction}\n${publicLoader}`,
    /\.from\(|consultation_requests|student_university_applications|submitted_at/,
  );
});

test("Director UI is seven uniform number inputs with no calculation metadata", () => {
  assert.match(directorPage, /K-GEO Public Statistics/);
  assert.match(directorPage, /Save & Publish/);
  assert.equal((directorPage.match(/type="number"/g) ?? []).length, 1);
  assert.match(directorPage, /PUBLIC_PROGRESS_METRICS\.map/);
  assert.doesNotMatch(
    directorPage,
    /Calculated from K-GEO|Manual for now|override|reason|provenance|operational counts/i,
  );
});

test("homepage displays only the latest saved public figures or a safe empty state", () => {
  assert.match(homepage, /loadPublicKgeoProgress\(\)/);
  assert.match(publicLoader, /rpc\("get_public_kgeo_progress"\)/);
  assert.match(publicSection, /PublicProgressFunnel/);
  assert.match(publicSection, /latest progress update is being prepared/i);
  assert.doesNotMatch(
    `${homepage}\n${publicSection}\n${publicLoader}`,
    /updated_by|director_id|reason|provenance|\.from\(/i,
  );
});

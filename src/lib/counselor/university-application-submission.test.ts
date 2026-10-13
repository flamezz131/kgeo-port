import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
type ResolveHook = (
  specifier: string,
  context: unknown,
  nextResolve: (specifier: string, context: unknown) => unknown,
) => unknown;
const { registerHooks } = require("node:module") as {
  registerHooks: (hooks: { resolve: ResolveHook }) => void;
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/counselor/university-applications") {
      return {
        shortCircuit: true,
        url: new URL("./university-applications.ts", import.meta.url).href,
      };
    }
    if (
      specifier ===
      "@/lib/counselor/university-application-management"
    ) {
      return {
        shortCircuit: true,
        url: new URL(
          "./university-application-management.ts",
          import.meta.url,
        ).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  submitArchiveUniversityApplication,
  submitChangeUniversityApplicationStatus,
  submitCreateUniversityApplication,
  submitSetPrimaryUniversityApplication,
  submitUpdateUniversityApplicationDetails,
} = require("./university-application-submission.ts") as typeof import(
  "./university-application-submission"
);
const {
  UNIVERSITY_APPLICATION_DEGREE_LEVELS,
  UNIVERSITY_APPLICATION_INTAKE_TERMS,
  UNIVERSITY_APPLICATION_STATUS_TRANSITIONS,
} = require("./university-applications.ts") as typeof import(
  "./university-applications"
);

const STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const APPLICATION_ID = "22222222-2222-4222-8222-222222222222";
const TIMESTAMP = "2026-07-28T10:00:00+05:30";

function createForm(
  overrides: Record<string, string> = {},
): FormData {
  const values = {
    studentId: STUDENT_ID,
    countryCode: " au ",
    universityName: " University   of Melbourne ",
    programmeName: " Master   of Data Science ",
    degreeLevel: "masters",
    intakeTerm: "fall",
    intakeYear: "2027",
    applicationReference: "",
    portalUrl: "",
    submissionDeadline: "",
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

function detailsForm(
  overrides: Record<string, string> = {},
): FormData {
  const formData = createForm({
    applicationId: APPLICATION_ID,
    changeReason: " Corrected   programme title ",
    universityName: "University of Sydney",
    ...overrides,
  });
  return formData;
}

function reasonForm(
  operation: "status" | "primary" | "archive",
  overrides: Record<string, string> = {},
): FormData {
  const values: Record<string, string> = {
    studentId: STUDENT_ID,
    applicationId: APPLICATION_ID,
    ...(operation === "status"
      ? { newStatus: "documents_collecting", changeReason: "Documents requested" }
      : operation === "primary"
        ? { changeReason: "Student confirmed first preference" }
        : { archiveReason: "Duplicate application record" }),
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

function presentation(overrides: Record<string, unknown> = {}) {
  return {
    id: APPLICATION_ID,
    countryCode: "AU",
    universityName: "University of Melbourne",
    programmeName: "Master of Data Science",
    degreeLevel: "masters" as const,
    degreeLevelLabel: "Master's",
    intakeTerm: "fall" as const,
    intakeLabel: "Fall",
    intakeYear: 2027,
    currentStatus: "planning" as const,
    currentStatusLabel: "Planning",
    currentStatusDescription: "Planning",
    applicationReference: null,
    portalUrl: null,
    submissionDeadline: null,
    submittedAt: null,
    isPrimary: false,
    isArchived: false,
    versionNumber: 1,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function mutationResult(overrides: Record<string, unknown> = {}) {
  return {
    application_id: APPLICATION_ID,
    student_id: STUDENT_ID,
    current_status: "planning",
    is_primary: false,
    is_archived: false,
    version_number: 1,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    last_changed_at: TIMESTAMP,
    ...overrides,
  };
}

test("create normalizes approved fields, converts blanks to null and validates the RPC result", async () => {
  let received: unknown;
  const state = await submitCreateUniversityApplication(createForm(), {
    verifyStudent: async () => ({ valid: true, error: null }),
    create: async (input) => {
      received = input;
      return { data: mutationResult(), error: null };
    },
  });
  assert.equal(state.status, "success");
  assert.deepEqual(received, {
    studentId: STUDENT_ID,
    applicationId: undefined,
    countryCode: "AU",
    universityName: "University of Melbourne",
    programmeName: "Master of Data Science",
    degreeLevel: "masters",
    intakeTerm: "fall",
    intakeYear: 2027,
    applicationReference: null,
    portalUrl: null,
    submissionDeadline: null,
    changeReason: undefined,
  });
});

test("create accepts every approved degree and intake enum", async () => {
  for (const degreeLevel of UNIVERSITY_APPLICATION_DEGREE_LEVELS) {
    for (const intakeTerm of UNIVERSITY_APPLICATION_INTAKE_TERMS) {
      const state = await submitCreateUniversityApplication(
        createForm({ degreeLevel, intakeTerm }),
        {
          verifyStudent: async () => ({ valid: true, error: null }),
          create: async () => ({
            data: mutationResult(),
            error: null,
          }),
        },
      );
      assert.equal(state.status, "success");
    }
  }
});

test("create rejects malformed, duplicate, unknown and protected fields before storage", async () => {
  let called = false;
  const invalidForms = [
    createForm({ countryCode: "Australia" }),
    createForm({ universityName: " " }),
    createForm({ intakeYear: "1900" }),
    createForm({ portalUrl: "http://apply.example.edu" }),
    createForm({ portalUrl: "https://user@example.edu" }),
    createForm({ portalUrl: "https://example.edu:8443" }),
    createForm({ universityName: "undefined" }),
    createForm({ applicationReference: "null" }),
  ];
  const unknown = createForm();
  unknown.set("initialStatus", "submitted");
  invalidForms.push(unknown);
  const duplicate = createForm();
  duplicate.append("studentId", STUDENT_ID);
  invalidForms.push(duplicate);
  const framework = createForm();
  framework.set("$ACTION_ID", "unexpected");
  invalidForms.push(framework);
  const fileValue = createForm();
  fileValue.set("portalUrl", new Blob(["private"]), "portal.txt");
  invalidForms.push(fileValue);

  for (const formData of invalidForms) {
    const state = await submitCreateUniversityApplication(formData, {
      verifyStudent: async () => {
        called = true;
        return { valid: true, error: null };
      },
      create: async () => {
        called = true;
        return { data: null, error: null };
      },
    });
    assert.equal(state.status, "error");
  }
  assert.equal(called, false);
});

test("mutation responses reject impossible timestamps and relational drift", async () => {
  const impossibleCreate = await submitCreateUniversityApplication(
    createForm(),
    {
      verifyStudent: async () => ({ valid: true, error: null }),
      create: async () => ({
        data: mutationResult({
          created_at: "2026-02-30T10:00:00+05:30",
          updated_at: "2026-02-30T10:00:00+05:30",
          last_changed_at: "2026-02-30T10:00:00+05:30",
        }),
        error: null,
      }),
    },
  );
  assert.equal(impossibleCreate.status, "error");

  const detailsPrimaryDrift =
    await submitUpdateUniversityApplicationDetails(detailsForm(), {
      verifyTarget: async () => ({
        valid: true,
        error: null,
        application: presentation({ isPrimary: true }),
      }),
      update: async () => ({
        data: mutationResult({
          is_primary: false,
          version_number: 2,
        }),
        error: null,
      }),
    });
  assert.equal(detailsPrimaryDrift.status, "error");

  const statusPrimaryDrift =
    await submitChangeUniversityApplicationStatus(
      reasonForm("status"),
      {
        verifyTarget: async () => ({
          valid: true,
          error: null,
          application: presentation({ isPrimary: true }),
        }),
        updateStatus: async () => ({
          data: mutationResult({
            current_status: "documents_collecting",
            is_primary: false,
            version_number: 2,
          }),
          error: null,
        }),
      },
    );
  assert.equal(statusPrimaryDrift.status, "error");

  const primaryStatusDrift =
    await submitSetPrimaryUniversityApplication(reasonForm("primary"), {
      verifyTarget: async () => ({
        valid: true,
        error: null,
        application: presentation(),
      }),
      setPrimary: async () => ({
        data: mutationResult({
          current_status: "documents_collecting",
          is_primary: true,
          version_number: 2,
        }),
        error: null,
      }),
    });
  assert.equal(primaryStatusDrift.status, "error");

  const archiveTimestampDrift =
    await submitArchiveUniversityApplication(reasonForm("archive"), {
      verifyTarget: async () => ({
        valid: true,
        error: null,
        application: presentation(),
      }),
      archive: async () => ({
        data: {
          application_id: APPLICATION_ID,
          student_id: STUDENT_ID,
          is_archived: true,
          is_primary: false,
          version_number: 2,
          archived_at: "2026-07-28T10:00:00.000001+05:30",
          updated_at: "2026-07-28T10:00:00.000002+05:30",
        },
        error: null,
      }),
    });
  assert.equal(archiveTimestampDrift.status, "error");
});

test("create fails closed for an untrusted student or malformed planning result", async () => {
  const denied = await submitCreateUniversityApplication(createForm(), {
    verifyStudent: async () => ({ valid: false, error: null }),
    create: async () => {
      assert.fail("create must not run");
    },
  });
  assert.equal(denied.status, "error");

  for (const data of [
    mutationResult({ current_status: "submitted" }),
    mutationResult({ version_number: 2 }),
    mutationResult({ is_primary: true }),
    mutationResult({ is_archived: true }),
  ]) {
    const state = await submitCreateUniversityApplication(createForm(), {
      verifyStudent: async () => ({ valid: true, error: null }),
      create: async () => ({ data, error: null }),
    });
    assert.equal(state.status, "error");
  }
});

test("details validates trusted ownership, changes, optional clearing and response version", async () => {
  let received: unknown;
  const state = await submitUpdateUniversityApplicationDetails(
    detailsForm({
      applicationReference: " APP-42 ",
      portalUrl: "https://apply.example.edu",
      submissionDeadline: "2027-03-31",
    }),
    {
      verifyTarget: async () => ({
        valid: true,
        error: null,
        application: presentation(),
      }),
      update: async (input) => {
        received = input;
        return {
          data: mutationResult({ version_number: 2 }),
          error: null,
        };
      },
    },
  );
  assert.equal(state.status, "success");
  assert.equal(
    (received as { applicationReference: string }).applicationReference,
    "APP-42",
  );
});

test("details rejects no-op, archived, cross-target and protected input", async () => {
  const noChange = await submitUpdateUniversityApplicationDetails(
    detailsForm({ universityName: "University of Melbourne" }),
    {
      verifyTarget: async () => ({
        valid: true,
        error: null,
        application: presentation(),
      }),
      update: async () => {
        assert.fail("no-op update must not run");
      },
    },
  );
  assert.equal(noChange.message, "The application details have not changed.");

  const archived = await submitUpdateUniversityApplicationDetails(
    detailsForm(),
    {
      verifyTarget: async () => ({
        valid: true,
        error: null,
        application: presentation({ isArchived: true }),
      }),
      update: async () => {
        assert.fail("archived update must not run");
      },
    },
  );
  assert.equal(archived.status, "error");

  const injected = detailsForm();
  injected.set("version", "99");
  const injectionState =
    await submitUpdateUniversityApplicationDetails(injected, {
      verifyTarget: async () => {
        assert.fail("protected input must fail before ownership lookup");
      },
      update: async () => {
        assert.fail("protected input must not mutate");
      },
    });
  assert.equal(injectionState.status, "error");
});

test("status accepts permitted transitions and rejects same, prohibited, terminal and archived states", async () => {
  for (const [currentStatus, nextStatuses] of Object.entries(
    UNIVERSITY_APPLICATION_STATUS_TRANSITIONS,
  )) {
    for (const newStatus of nextStatuses) {
      const state = await submitChangeUniversityApplicationStatus(
        reasonForm("status", { newStatus }),
        {
          verifyTarget: async () => ({
            valid: true,
            error: null,
            application: presentation({
              currentStatus,
              currentStatusLabel: currentStatus,
            }),
          }),
          updateStatus: async () => ({
            data: mutationResult({
              current_status: newStatus,
              version_number: 2,
              is_primary: false,
            }),
            error: null,
          }),
        },
      );
      assert.equal(state.status, "success", `${currentStatus} -> ${newStatus}`);
    }
  }

  for (const application of [
    presentation({ currentStatus: "planning" }),
    presentation({ currentStatus: "closed" }),
    presentation({ currentStatus: "withdrawn" }),
    presentation({ isArchived: true }),
  ]) {
    const state = await submitChangeUniversityApplicationStatus(
      reasonForm("status", {
        newStatus:
          application.currentStatus === "planning"
            ? "planning"
            : "documents_collecting",
      }),
      {
        verifyTarget: async () => ({
          valid: true,
          error: null,
          application,
        }),
        updateStatus: async () => {
          assert.fail("invalid transition must not run");
        },
      },
    );
    assert.equal(state.status, "error");
  }
});

test("status never accepts submittedAt, browser versions or progression fields", async () => {
  for (const field of [
    "submittedAt",
    "versionNumber",
    "counselorId",
    "officialProgressionStage",
  ]) {
    const formData = reasonForm("status");
    formData.set(field, "injected");
    const state = await submitChangeUniversityApplicationStatus(formData, {
      verifyTarget: async () => {
        assert.fail("injected status form must fail first");
      },
      updateStatus: async () => {
        assert.fail("injected status form must not mutate");
      },
    });
    assert.equal(state.status, "error");
  }

  const nullLikeReason = await submitChangeUniversityApplicationStatus(
    reasonForm("status", { changeReason: " null " }),
    {
      verifyTarget: async () => {
        assert.fail("null-like reason must fail before ownership lookup");
      },
      updateStatus: async () => {
        assert.fail("null-like reason must not mutate");
      },
    },
  );
  assert.equal(nullLikeReason.status, "error");
});

test("primary requires an eligible nonprimary application and a trusted true result", async () => {
  const state = await submitSetPrimaryUniversityApplication(
    reasonForm("primary"),
    {
      verifyTarget: async () => ({
        valid: true,
        error: null,
        application: presentation(),
      }),
      setPrimary: async () => ({
        data: mutationResult({
          is_primary: true,
          version_number: 2,
        }),
        error: null,
      }),
    },
  );
  assert.equal(state.status, "success");

  for (const application of [
    presentation({ isPrimary: true }),
    presentation({ isArchived: true }),
    presentation({ currentStatus: "withdrawn" }),
    presentation({ currentStatus: "closed" }),
  ]) {
    const rejected = await submitSetPrimaryUniversityApplication(
      reasonForm("primary"),
      {
        verifyTarget: async () => ({
          valid: true,
          error: null,
          application,
        }),
        setPrimary: async () => {
          assert.fail("ineligible primary update must not run");
        },
      },
    );
    assert.equal(rejected.status, "error");
  }
});

test("archive retains status server-side and requires archived/nonprimary response", async () => {
  const state = await submitArchiveUniversityApplication(
    reasonForm("archive"),
    {
      verifyTarget: async () => ({
        valid: true,
        error: null,
        application: presentation(),
      }),
      archive: async () => ({
        data: {
          application_id: APPLICATION_ID,
          student_id: STUDENT_ID,
          is_archived: true,
          is_primary: false,
          version_number: 2,
          archived_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
        error: null,
      }),
    },
  );
  assert.equal(state.status, "success");

  const repeated = await submitArchiveUniversityApplication(
    reasonForm("archive"),
    {
      verifyTarget: async () => ({
        valid: true,
        error: null,
        application: presentation({ isArchived: true }),
      }),
      archive: async () => {
        assert.fail("repeat archive must not run");
      },
    },
  );
  assert.equal(repeated.status, "error");
});

test("database errors are translated without exposing raw messages", async () => {
  for (const [code, expected] of [
    [
      "40001",
      "Another application update is in progress. Please try again.",
    ],
    ["22023", "Application data has changed. Refresh and try again."],
    ["P0001", "University application could not be created."],
  ]) {
    const state = await submitCreateUniversityApplication(createForm(), {
      verifyStudent: async () => ({ valid: true, error: null }),
      create: async () => ({
        data: null,
        error: { code, message: "private raw database detail" },
      }),
    });
    assert.equal(state.message, expected);
    assert.doesNotMatch(state.message ?? "", /private|database detail/i);
  }
});

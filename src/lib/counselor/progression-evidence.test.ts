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
    if (specifier === "@/lib/counselor/progression") {
      return {
        shortCircuit: true,
        url: new URL("./progression.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  PROGRESSION_EVIDENCE_MAX_BYTES,
  PROGRESSION_EVIDENCE_MAX_VISIBLE_ROWS,
  fetchAvailableProgressionEvidence,
  validateProgressionEvidenceFile,
} = require("./progression-evidence.ts") as typeof import("./progression-evidence");
const {
  isTrustedProgressionEvidenceSignedViewUrl,
} = require("./progression-evidence-view-url.ts") as typeof import("./progression-evidence-view-url");

const studentId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const evidenceId = "33333333-3333-4333-8333-333333333333";

function uuid(sequence: number): string {
  return `40000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
}

function availableRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: evidenceId,
    progression_event_id: eventId,
    storage_path: `${studentId}/${eventId}/${evidenceId}.pdf`,
    original_file_name: "Student confirmation.pdf",
    mime_type: "application/pdf",
    file_size_bytes: 320_000,
    status: "available",
    available_at: "2026-07-26T10:30:00+05:30",
    ...overrides,
  };
}

function pendingRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: evidenceId,
    progression_event_id: eventId,
    status: "pending",
    upload_expires_at: "2026-07-26T11:00:00.000Z",
    ...overrides,
  };
}

const noPending = async () => ({ data: [], error: null });

test("validates every supported evidence extension and MIME pairing", () => {
  for (const [name, type] of [
    ["evidence.pdf", "application/pdf"],
    [
      "evidence.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    ["evidence.jpg", "image/jpeg"],
    ["evidence.jpeg", "image/jpeg"],
    ["evidence.png", "image/png"],
    ["evidence.webp", "image/webp"],
  ] as const) {
    const result = validateProgressionEvidenceFile({
      name,
      type,
      size: 1,
    });
    assert.equal(result.success, true, name);
  }
});

test("rejects empty oversized unsupported and mismatched evidence files", () => {
  for (const file of [
    { name: "empty.pdf", type: "application/pdf", size: 0 },
    {
      name: "large.pdf",
      type: "application/pdf",
      size: PROGRESSION_EVIDENCE_MAX_BYTES + 1,
    },
    { name: "archive.zip", type: "application/zip", size: 1 },
    { name: "wrong.png", type: "image/jpeg", size: 1 },
    { name: " leading.pdf", type: "application/pdf", size: 1 },
    { name: "../unsafe.pdf", type: "application/pdf", size: 1 },
  ]) {
    assert.equal(validateProgressionEvidenceFile(file).success, false);
  }
});

test("zero visible history events skips the evidence query", async () => {
  let calls = 0;
  const result = await fetchAvailableProgressionEvidence(
    studentId,
    [],
    {
      loadAvailable: async () => {
        calls += 1;
        return { data: [], error: null };
      },
      loadPending: async () => {
        calls += 1;
        return { data: [], error: null };
      },
    },
  );
  assert.deepEqual(result, {
    kind: "ready",
    evidenceByEvent: {},
    correctionBlockByEvent: {},
  });
  assert.equal(calls, 0);
});

test("one bounded query groups only validated available evidence by event", async () => {
  const secondEventId = uuid(2);
  const secondEvidenceId = uuid(3);
  let calls = 0;
  const result = await fetchAvailableProgressionEvidence(
    studentId,
    [eventId, secondEventId],
    {
      loadAvailable: async (eventIds, maximumRows) => {
        calls += 1;
        assert.deepEqual(eventIds, [eventId, secondEventId]);
        assert.equal(
          maximumRows,
          PROGRESSION_EVIDENCE_MAX_VISIBLE_ROWS + 1,
        );
        return {
          data: [
            availableRow(),
            availableRow({
              id: secondEvidenceId,
              progression_event_id: secondEventId,
              storage_path: `${studentId}/${secondEventId}/${secondEvidenceId}.png`,
              original_file_name: "Counseling screenshot.png",
              mime_type: "image/png",
              file_size_bytes: 1_200_000,
            }),
          ],
          error: null,
        };
      },
      loadPending: noPending,
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.evidenceByEvent[eventId].length, 1);
  assert.equal(result.evidenceByEvent[secondEventId].length, 1);
  assert.deepEqual(Object.keys(result.evidenceByEvent[eventId][0]).sort(), [
    "availableAt",
    "fileSizeBytes",
    "id",
    "mimeType",
    "originalFileName",
    "progressionEventId",
  ]);
});

test("valid empty and five-file results remain distinct from unavailable", async () => {
  const empty = await fetchAvailableProgressionEvidence(
    studentId,
    [eventId],
    {
      loadAvailable: async () => ({ data: [], error: null }),
      loadPending: noPending,
    },
  );
  assert.deepEqual(empty, {
    kind: "ready",
    evidenceByEvent: { [eventId]: [] },
    correctionBlockByEvent: { [eventId]: null },
  });

  const fiveRows = Array.from({ length: 5 }, (_, index) => {
    const id = uuid(index + 10);
    return availableRow({
      id,
      storage_path: `${studentId}/${eventId}/${id}.pdf`,
    });
  });
  const five = await fetchAvailableProgressionEvidence(
    studentId,
    [eventId],
    {
      loadAvailable: async () => ({ data: fiveRows, error: null }),
      loadPending: noPending,
    },
  );
  assert.equal(five.kind, "ready");
  if (five.kind === "ready") {
    assert.equal(five.evidenceByEvent[eventId].length, 5);
  }
});

test("malformed cross-event duplicate excessive pending and removed rows fail closed", async () => {
  const cases: unknown[][] = [
    [
      availableRow(),
      availableRow(),
    ],
    [
      availableRow({
        progression_event_id: uuid(99),
      }),
    ],
    [
      availableRow({
        storage_path: `${uuid(98)}/${eventId}/${evidenceId}.pdf`,
      }),
    ],
    [availableRow({ original_file_name: "wrong.png" })],
    [availableRow({ mime_type: "image/svg+xml" })],
    [availableRow({ file_size_bytes: 0 })],
    [availableRow({ available_at: "not-a-timestamp" })],
    [availableRow({ status: "pending" })],
    [availableRow({ status: "removed" })],
    Array.from({ length: 6 }, (_, index) => {
      const id = uuid(index + 100);
      return availableRow({
        id,
        storage_path: `${studentId}/${eventId}/${id}.pdf`,
      });
    }),
  ];

  for (const data of cases) {
    const result = await fetchAvailableProgressionEvidence(
      studentId,
      [eventId],
      {
        loadAvailable: async () => ({ data, error: null }),
        loadPending: noPending,
      },
    );
    assert.deepEqual(result, { kind: "unavailable" });
  }
});

test("database failure is isolated as evidence unavailable", async () => {
  const result = await fetchAvailableProgressionEvidence(
    studentId,
    [eventId],
    {
      loadAvailable: async () => ({
        data: null,
        error: new Error("private raw failure"),
      }),
      loadPending: noPending,
    },
  );
  assert.deepEqual(result, { kind: "unavailable" });

  const pendingFailure = await fetchAvailableProgressionEvidence(
    studentId,
    [eventId],
    {
      loadAvailable: async () => ({ data: [], error: null }),
      loadPending: async () => ({
        data: null,
        error: new Error("private pending failure"),
      }),
    },
  );
  assert.deepEqual(pendingFailure, { kind: "unavailable" });
});

test("the maximum 20-event page supports at most 100 evidence rows", async () => {
  const eventIds = Array.from({ length: 20 }, (_, index) =>
    uuid(index + 200),
  );
  const rows = eventIds.flatMap((currentEventId, eventIndex) =>
    Array.from({ length: 5 }, (_, fileIndex) => {
      const id = uuid(1000 + eventIndex * 5 + fileIndex);
      return availableRow({
        id,
        progression_event_id: currentEventId,
        storage_path: `${studentId}/${currentEventId}/${id}.pdf`,
      });
    }),
  );
  const result = await fetchAvailableProgressionEvidence(
    studentId,
    eventIds,
    {
      loadAvailable: async () => ({ data: rows, error: null }),
      loadPending: noPending,
    },
  );
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.equal(
      Object.values(result.evidenceByEvent).flat().length,
      PROGRESSION_EVIDENCE_MAX_VISIBLE_ROWS,
    );
  }
});

test("available and unexpired pending evidence block correction without exposing file details", async () => {
  const now = new Date("2026-07-26T10:30:00.000Z");
  const available = await fetchAvailableProgressionEvidence(
    studentId,
    [eventId],
    {
      loadAvailable: async () => ({ data: [availableRow()], error: null }),
      loadPending: noPending,
    },
    now,
  );
  assert.equal(available.kind, "ready");
  if (available.kind === "ready") {
    assert.equal(available.correctionBlockByEvent[eventId], "available");
  }

  const pending = await fetchAvailableProgressionEvidence(
    studentId,
    [eventId],
    {
      loadAvailable: async () => ({ data: [], error: null }),
      loadPending: async (eventIds, nowIso, maximumRows) => {
        assert.deepEqual(eventIds, [eventId]);
        assert.equal(nowIso, now.toISOString());
        assert.equal(maximumRows, PROGRESSION_EVIDENCE_MAX_VISIBLE_ROWS + 1);
        return { data: [pendingRow()], error: null };
      },
    },
    now,
  );
  assert.deepEqual(pending, {
    kind: "ready",
    evidenceByEvent: { [eventId]: [] },
    correctionBlockByEvent: { [eventId]: "pending" },
  });
});

test("expired pending evidence and removed evidence do not block correction", async () => {
  const result = await fetchAvailableProgressionEvidence(
    studentId,
    [eventId],
    {
      loadAvailable: async () => ({ data: [], error: null }),
      loadPending: noPending,
    },
    new Date("2026-07-26T12:00:00.000Z"),
  );
  assert.deepEqual(result, {
    kind: "ready",
    evidenceByEvent: { [eventId]: [] },
    correctionBlockByEvent: { [eventId]: null },
  });
});

test("signed evidence views require the exact trusted origin bucket path and token", () => {
  const supabaseUrl = "https://project.supabase.co";
  const storagePath = `${studentId}/${eventId}/${evidenceId}.pdf`;
  const valid =
    `${supabaseUrl}/storage/v1/object/sign/` +
    `counseling-progression-evidence/${storagePath}?token=signed-token`;

  assert.equal(
    isTrustedProgressionEvidenceSignedViewUrl(
      valid,
      supabaseUrl,
      "counseling-progression-evidence",
      storagePath,
    ),
    true,
  );

  for (const candidate of [
    valid.replace("project.supabase.co", "attacker.example"),
    valid.replace(
      "counseling-progression-evidence",
      "another-bucket",
    ),
    valid.replace(evidenceId, uuid(9999)),
    valid.replace("/object/sign/", "/object/public/"),
    valid.replace("?token=signed-token", ""),
    valid.replace("signed-token", ""),
    valid.replace(
      "https://",
      "https://user:password@",
    ),
    `${valid}#private-fragment`,
    "not-a-url",
  ]) {
    assert.equal(
      isTrustedProgressionEvidenceSignedViewUrl(
        candidate,
        supabaseUrl,
        "counseling-progression-evidence",
        storagePath,
      ),
      false,
      candidate,
    );
  }
});

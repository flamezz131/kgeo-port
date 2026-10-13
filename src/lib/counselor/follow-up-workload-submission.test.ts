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
    const aliases: Record<string, string> = {
      "@/lib/counselor/private-records": "./private-records.ts",
      "@/lib/validation/counselor-private-records":
        "../validation/counselor-private-records.ts",
    };
    const target = aliases[specifier];
    if (target) {
      return {
        shortCircuit: true,
        url: new URL(target, import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { submitUpdateCounselorWorkloadFollowUp } = require(
  "./private-record-submission.ts",
) as typeof import("./private-record-submission");

const STUDENT_ID = "33333333-3333-4333-8333-333333333333";
const FOLLOW_UP_ID = "11111111-1111-4111-8111-111111111111";

function validFormData() {
  const formData = new FormData();
  formData.set("studentId", STUDENT_ID);
  formData.set("recordId", FOLLOW_UP_ID);
  formData.set("dueDate", "2026-08-01");
  formData.set("priority", "high");
  formData.set("nextAction", "  Review   final shortlist  ");
  return formData;
}

test("workload edit updates only approved pending fields after trusted target validation", async () => {
  let verifiedStudentId = "";
  let mutation:
    | {
        studentId: string;
        recordId: string;
        payload: {
          due_date: string;
          priority: "low" | "normal" | "high";
          next_action: string;
        };
      }
    | undefined;
  const state = await submitUpdateCounselorWorkloadFollowUp(validFormData(), {
    verifyTarget: async (studentId, consultationId) => {
      verifiedStudentId = studentId;
      assert.equal(consultationId, null);
      return { valid: true, error: null };
    },
    update: async (studentId, recordId, payload) => {
      mutation = { studentId, recordId, payload };
      return { affected: true, error: null };
    },
  });

  assert.equal(state.status, "success");
  assert.equal(verifiedStudentId, STUDENT_ID);
  assert.deepEqual(mutation, {
    studentId: STUDENT_ID,
    recordId: FOLLOW_UP_ID,
    payload: {
      due_date: "2026-08-01",
      priority: "high",
      next_action: "Review final shortlist",
    },
  });
});

test("workload edit rejects duplicate and protected values before mutation", async () => {
  for (const formData of [
    (() => {
      const data = validFormData();
      data.append("nextAction", "Injected");
      return data;
    })(),
    (() => {
      const data = validFormData();
      data.set("counselorId", STUDENT_ID);
      return data;
    })(),
    (() => {
      const data = validFormData();
      data.set("details", "Private detail");
      return data;
    })(),
    (() => {
      const data = validFormData();
      data.set("status", "completed");
      return data;
    })(),
  ]) {
    let mutated = false;
    const state = await submitUpdateCounselorWorkloadFollowUp(formData, {
      verifyTarget: async () => ({ valid: true, error: null }),
      update: async () => {
        mutated = true;
        return { affected: true, error: null };
      },
    });
    assert.equal(state.status, "error");
    assert.equal(mutated, false);
  }
});

test("untrusted, final, concurrent, and database failures remain sanitized", async () => {
  const untrusted = await submitUpdateCounselorWorkloadFollowUp(
    validFormData(),
    {
      verifyTarget: async () => ({ valid: false, error: null }),
      update: async () => ({ affected: true, error: null }),
    },
  );
  const missing = await submitUpdateCounselorWorkloadFollowUp(validFormData(), {
    verifyTarget: async () => ({ valid: true, error: null }),
    update: async () => ({ affected: false, error: null }),
  });
  const failure = await submitUpdateCounselorWorkloadFollowUp(validFormData(), {
    verifyTarget: async () => ({ valid: true, error: null }),
    update: async () => ({
      affected: false,
      error: new Error("private database detail"),
    }),
  });

  assert.equal(untrusted.status, "error");
  assert.equal(missing.status, "error");
  assert.equal(failure.status, "error");
  assert.doesNotMatch(
    [untrusted.message, missing.message, failure.message].join(" "),
    /private database detail/,
  );
});

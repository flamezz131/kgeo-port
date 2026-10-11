import "server-only";

import { createDirectorStudentDiagnostic } from "@/lib/director/student-profile-diagnostics";

/**
 * Records why a server-side data section fell back to its "temporarily
 * unavailable" state. Only the section name, error code and a sanitized
 * message are logged (see createDirectorStudentDiagnostic), never raw rows.
 */
export function logDataLoadFailure(section: string, error: unknown): void {
  console.error(createDirectorStudentDiagnostic(section, error));
}

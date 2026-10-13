type DirectorStudentDiagnostic = {
  section: string;
  error_code: string;
  error_message: string;
};

function sanitizeCode(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(value)) {
    return "UNKNOWN";
  }
  return value;
}

function sanitizeMessage(value: unknown): string {
  if (typeof value !== "string") return "No error message was provided.";
  const sanitized = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      "[redacted-id]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[redacted-token]",
    )
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(
      /\b(token|authorization|service[_ -]?role|signed[_ -]?url|storage[_ -]?path|bucket[_ -]?id|api[_ -]?key|password|secret|credential|cookie|session)\b\s*[:=]?\s*[^,;. ]+/gi,
      "$1 [redacted]",
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b\d{10,}\b/g, "[redacted-number]")
    .replace(/(?:[A-Za-z]:\\|\/)[^\s,;]+/g, "[redacted-path]")
    .replace(
      /\b(?:[A-Za-z0-9._-]+\/){1,}[A-Za-z0-9._/-]+\b/g,
      "[redacted-path]",
    )
    .trim()
    .slice(0, 240);
  return sanitized || "No error message was provided.";
}

export function createDirectorStudentDiagnostic(
  section: string,
  error: unknown,
): DirectorStudentDiagnostic {
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;
  return {
    section: section.slice(0, 160),
    error_code: sanitizeCode(record?.code),
    error_message: sanitizeMessage(record?.message ?? error),
  };
}

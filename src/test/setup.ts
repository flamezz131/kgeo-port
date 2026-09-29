import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type { PathLike } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const originalReadFileSync = fs.readFileSync.bind(fs);

function resolvePath(path: PathLike | number): string | null {
  if (typeof path === "number") {
    return null;
  }
  if (path instanceof URL) {
    return fileURLToPath(path);
  }
  return path.toString();
}

function requestedEncoding(options: object | string | null | undefined): BufferEncoding | null {
  if (typeof options === "string") {
    return Buffer.isEncoding(options) ? options : null;
  }
  if (options && "encoding" in options && typeof options.encoding === "string") {
    return Buffer.isEncoding(options.encoding) ? options.encoding : null;
  }
  return null;
}

fs.readFileSync = ((path: PathLike | number, options?: object | string | null) => {
  const absolutePath = resolvePath(path);
  const encoding = requestedEncoding(options);

  if (absolutePath) {
    const repositoryPath = relative(repositoryRoot, absolutePath).split(sep).join("/");
    if (
      /^supabase\/migrations\/202\d{9}_[a-z0-9_]+[.]sql$/.test(repositoryPath) ||
      repositoryPath === "supabase/verification/pre_phase_c2_readiness.sql"
    ) {
      try {
        const revision = repositoryPath ===
          "supabase/verification/pre_phase_c2_readiness.sql"
          ? "origin/main"
          : "HEAD";
        const committedBlob = execFileSync(
          "git",
          ["show", `${revision}:${repositoryPath}`],
          { cwd: repositoryRoot, encoding: null },
        );
        return encoding ? committedBlob.toString(encoding) : committedBlob;
      } catch {
        // New uncommitted migrations deliberately fall through to the workspace.
      }
    }
  }

  const value = options === undefined || options === null
    ? originalReadFileSync(path, options)
    : typeof options === "string"
      ? originalReadFileSync(path, options as BufferEncoding)
      : encoding
        ? originalReadFileSync(path, {
            ...options,
            encoding,
          })
        : originalReadFileSync(path, {
            ...options,
            encoding: null,
          });
  return typeof value === "string" ? value.replace(/\r\n/g, "\n") : value;
}) as typeof fs.readFileSync;

syncBuiltinESMExports();

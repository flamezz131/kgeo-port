export function isTrustedUniversityApplicationDocumentSignedViewUrl(
  value: string,
  expectedSupabaseUrl: string,
  bucketId: string,
  storagePath: string,
): boolean {
  try {
    const signedUrl = new URL(value);
    const supabaseUrl = new URL(expectedSupabaseUrl);
    const tokenValues = signedUrl.searchParams.getAll("token");
    const queryEntries = Array.from(signedUrl.searchParams.entries());
    const token = tokenValues[0] ?? "";
    return (
      signedUrl.origin === supabaseUrl.origin &&
      signedUrl.username === "" &&
      signedUrl.password === "" &&
      signedUrl.hash === "" &&
      signedUrl.pathname ===
        `/storage/v1/object/sign/${bucketId}/${storagePath}` &&
      queryEntries.length === 1 &&
      queryEntries[0]?.[0] === "token" &&
      tokenValues.length === 1 &&
      token.length >= 1 &&
      token.length <= 4096
    );
  } catch {
    return false;
  }
}

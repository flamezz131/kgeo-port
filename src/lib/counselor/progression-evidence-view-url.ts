export function isTrustedProgressionEvidenceSignedViewUrl(
  value: string,
  expectedSupabaseUrl: string,
  bucketId: string,
  storagePath: string,
): boolean {
  try {
    const signedUrl = new URL(value);
    const supabaseUrl = new URL(expectedSupabaseUrl);
    const expectedPath =
      `/storage/v1/object/sign/${bucketId}/${storagePath}`;
    return (
      signedUrl.origin === supabaseUrl.origin &&
      signedUrl.username === "" &&
      signedUrl.password === "" &&
      signedUrl.hash === "" &&
      signedUrl.pathname === expectedPath &&
      Boolean(signedUrl.searchParams.get("token"))
    );
  } catch {
    return false;
  }
}

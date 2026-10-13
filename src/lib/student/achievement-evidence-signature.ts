import type { StudentAchievementDocumentMimeType } from "@/types";

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
const PNG_SIGNATURE = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
] as const;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return (
    bytes.length >= signature.length &&
    signature.every((value, index) => bytes[index] === value)
  );
}

function hasReasonableJpegStructure(bytes: Uint8Array): boolean {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  ) {
    return false;
  }

  let offset = 2;
  let sawFrame = false;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0x00 || marker === 0xd8) return false;
    if (marker === 0xd9) return false;
    if (marker === 0xda) {
      if (!sawFrame || offset + 2 > bytes.length - 2) return false;
      const scanLength = (bytes[offset] ?? 0) * 256 + (bytes[offset + 1] ?? 0);
      const componentCount = bytes[offset + 2] ?? 0;
      return (
        componentCount > 0 &&
        scanLength === 6 + 2 * componentCount &&
        offset + scanLength <= bytes.length - 2
      );
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length - 2) return false;
    const segmentLength = (bytes[offset] ?? 0) * 256 + (bytes[offset + 1] ?? 0);
    if (segmentLength < 2 || offset + segmentLength > bytes.length - 2) {
      return false;
    }
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      const componentCount = bytes[offset + 7] ?? 0;
      if (
        segmentLength < 11 ||
        componentCount < 1 ||
        segmentLength !== 8 + 3 * componentCount
      ) {
        return false;
      }
      sawFrame = true;
    }
    offset += segmentLength;
  }
  return false;
}

/** Identifies a supported file family. This is not antivirus scanning. */
export function detectAchievementEvidenceMimeType(
  bytes: Uint8Array,
): StudentAchievementDocumentMimeType | null {
  if (startsWith(bytes, PDF_SIGNATURE)) return "application/pdf";
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (hasReasonableJpegStructure(bytes)) return "image/jpeg";
  return null;
}

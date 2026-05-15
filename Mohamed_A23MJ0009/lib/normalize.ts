import SHA256 from "crypto-js/sha256";

export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

export function hashText(normalizedText: string): string {
  return SHA256(normalizedText.toLowerCase()).toString();
}

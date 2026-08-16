export function normalizeRequest(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ").replace(/[.!?。！？]+$/u, "");
}

export async function createFingerprint(repository: string, request: string, identifiers: string[] = []): Promise<string> {
  const stable = [...new Set(identifiers.map((value) => value.trim()).filter(Boolean))].sort();
  const input = `v1\n${repository.toLowerCase()}\n${normalizeRequest(request)}\n${stable.join("\n")}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function fingerprintMarker(fingerprint: string): string {
  return `<!-- agent-issue-console:fingerprint=${fingerprint} -->`;
}


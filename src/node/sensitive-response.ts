/** Inspect decoded JSON strings, including object keys. Never redact and publish changed data. */
export function containsCredential(value: unknown, credentials: readonly string[]): boolean {
  const secrets = credentials.filter(secret => secret.length > 0);
  if (!secrets.length) return false;
  const pending: unknown[] = [value];
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === "string") {
      if (secrets.some(secret => current.includes(secret))) return true;
    } else if (Array.isArray(current)) {
      for (const entry of current) pending.push(entry);
    } else if (current !== null && typeof current === "object") {
      for (const [key, entry] of Object.entries(current)) pending.push(key, entry);
    }
  }
  return false;
}

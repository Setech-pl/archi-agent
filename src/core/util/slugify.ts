export function toPlantUmlAlias(name: string): string {
  const alias = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^\[NEW\]\s*/i, "NEW_")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return alias.length > 0 ? alias : "Element";
}

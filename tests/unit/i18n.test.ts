import en from "@/messages/en.json";
import es from "@/messages/es.json";

function keys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("i18n catalogs", () => {
  it("es and en define exactly the same keys", () => {
    const esKeys = keys(es).sort();
    const enKeys = keys(en).sort();
    expect(enKeys.filter((k) => !esKeys.includes(k))).toEqual([]);
    expect(esKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });

  it("has no empty strings", () => {
    const empty = (obj: unknown, path: string): string[] =>
      typeof obj === "string"
        ? obj.trim() === ""
          ? [path]
          : []
        : typeof obj === "object" && obj !== null
          ? Object.entries(obj).flatMap(([k, v]) => empty(v, `${path}.${k}`))
          : [];
    expect(empty(es, "es")).toEqual([]);
    expect(empty(en, "en")).toEqual([]);
  });
});

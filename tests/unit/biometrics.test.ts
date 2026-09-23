import { randomBytes } from "node:crypto";
import { biometricSchema, canonicalJson, computeMetrics } from "@/lib/signing/biometrics";
import { decryptEvidence, encryptEvidence } from "@/lib/signing/evidence-crypto";

function stroke(
  n: number,
  t0: number,
  pointerType: "pen" | "touch" | "mouse" = "touch",
  pressure?: (i: number) => number,
) {
  return {
    pointerType,
    points: Array.from({ length: n }, (_, i) => ({
      x: 20 + i * 3,
      y: 60 + Math.sin(i / 3) * 15,
      t: t0 + i * 16,
      p: pressure ? pressure(i) : 0.5,
      tx: 0,
      ty: 0,
    })),
  };
}

const canvas = { width: 600, height: 240, dpr: 2 };

describe("biometric schema", () => {
  it("accepts a realistic signature", () => {
    const res = biometricSchema.safeParse({
      version: 1,
      canvas,
      strokes: [stroke(30, 1000), stroke(12, 1700)],
    });
    expect(res.success).toBe(true);
  });

  it("requires at least 20 points", () => {
    const res = biometricSchema.safeParse({ version: 1, canvas, strokes: [stroke(10, 0)] });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe("too_few_points");
  });

  it("rejects signatures faster than 300 ms", () => {
    const fast = stroke(25, 0);
    fast.points.forEach((p, i) => (p.t = i * 5));
    expect(
      biometricSchema.safeParse({ version: 1, canvas, strokes: [fast] }).error?.issues[0]?.message,
    ).toBe("too_fast");
  });

  it("rejects non-monotonic timestamps", () => {
    const s = stroke(30, 1000);
    s.points[10]!.t = 10;
    expect(
      biometricSchema.safeParse({ version: 1, canvas, strokes: [s] }).error?.issues[0]?.message,
    ).toBe("non_monotonic_time");
    // …also across strokes
    expect(
      biometricSchema.safeParse({
        version: 1,
        canvas,
        strokes: [stroke(20, 2000), stroke(20, 1000)],
      }).error?.issues[0]?.message,
    ).toBe("non_monotonic_time");
  });

  it("rejects out of range values and unknown fields", () => {
    const s = stroke(30, 0);
    s.points[3]!.p = 3;
    expect(biometricSchema.safeParse({ version: 1, canvas, strokes: [s] }).success).toBe(false);
    expect(
      biometricSchema.safeParse({ version: 1, canvas, strokes: [stroke(30, 0)], extra: 1 }).success,
    ).toBe(false);
    const far = stroke(30, 0);
    far.points[0]!.x = 5000;
    expect(
      biometricSchema.safeParse({ version: 1, canvas, strokes: [far] }).error?.issues[0]?.message,
    ).toBe("out_of_bounds");
  });
});

describe("metrics", () => {
  it("computes counts, duration, velocity and pressure support", () => {
    const m = computeMetrics({
      strokes: [stroke(30, 1000, "pen", (i) => 0.2 + i / 100), stroke(10, 1600, "pen")],
    });
    expect(m.strokeCount).toBe(2);
    expect(m.pointsCount).toBe(40);
    expect(m.durationMs).toBe(1600 + 9 * 16 - 1000);
    expect(m.avgVelocity).toBeGreaterThan(0);
    expect(m.pressureSupported).toBe(true);
    expect(m.pointerType).toBe("pen");
    expect(computeMetrics({ strokes: [stroke(30, 0, "mouse")] }).pressureSupported).toBe(false);
  });

  it("canonical JSON is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(
      canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }),
    );
  });
});

describe("evidence encryption", () => {
  const key1 = randomBytes(32).toString("base64");
  const key2 = randomBytes(32).toString("base64");

  afterEach(() => {
    delete process.env.EVIDENCE_ENCRYPTION_KEY;
    delete process.env.EVIDENCE_ENCRYPTION_KEYS_OLD;
  });

  it("round-trips and detects tampering", () => {
    process.env.EVIDENCE_ENCRYPTION_KEY = key1;
    const { data, keyId } = encryptEvidence(Buffer.from("secret biometrics"));
    expect(keyId).toMatch(/^[0-9a-f]{16}$/);
    expect(decryptEvidence(data).toString()).toBe("secret biometrics");
    const tampered = Buffer.from(data);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptEvidence(tampered)).toThrow();
  });

  it("decrypts with rotated (old) keys", () => {
    process.env.EVIDENCE_ENCRYPTION_KEY = key1;
    const { data } = encryptEvidence(Buffer.from("v1"));
    process.env.EVIDENCE_ENCRYPTION_KEY = key2;
    process.env.EVIDENCE_ENCRYPTION_KEYS_OLD = key1;
    expect(decryptEvidence(data).toString()).toBe("v1");
    delete process.env.EVIDENCE_ENCRYPTION_KEYS_OLD;
    expect(() => decryptEvidence(data)).toThrow(/No evidence key/);
  });

  it("rejects keys of the wrong size", () => {
    process.env.EVIDENCE_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => encryptEvidence(Buffer.from("x"))).toThrow(/32 bytes/);
  });
});

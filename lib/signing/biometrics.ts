import { z } from "zod";

/**
 * Biometric signature capture (spec §8.4). One point per pointer event:
 *   x, y  – CSS pixels relative to the pad's top-left corner
 *   t     – high-resolution timestamp (performance.now(), ms)
 *   p     – pressure 0..1 (0.5 constant when the device doesn't report it)
 *   tx/ty – tilt in degrees (-90..90), 0 when unsupported
 */
export const pointSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    t: z.number().finite().nonnegative(),
    p: z.number().finite().min(0).max(1),
    tx: z.number().finite().min(-90).max(90).default(0),
    ty: z.number().finite().min(-90).max(90).default(0),
  })
  .strict();

export const strokeSchema = z
  .object({
    pointerType: z.enum(["pen", "touch", "mouse"]),
    points: z.array(pointSchema).min(1).max(5000),
  })
  .strict();

export const BIOMETRIC_LIMITS = {
  minPoints: 20,
  minDurationMs: 300,
  maxPoints: 20_000,
  maxStrokes: 200,
} as const;

export const biometricSchema = z
  .object({
    version: z.literal(1),
    canvas: z.object({
      width: z.number().int().min(100).max(4000),
      height: z.number().int().min(50).max(4000),
      dpr: z.number().min(0.5).max(6),
    }),
    strokes: z.array(strokeSchema).min(1).max(BIOMETRIC_LIMITS.maxStrokes),
  })
  .strict()
  .superRefine((data, ctx) => {
    const all = data.strokes.flatMap((s) => s.points);
    if (all.length < BIOMETRIC_LIMITS.minPoints) {
      ctx.addIssue({ code: "custom", message: "too_few_points" });
      return;
    }
    if (all.length > BIOMETRIC_LIMITS.maxPoints) {
      ctx.addIssue({ code: "custom", message: "too_many_points" });
      return;
    }
    // Timestamps must be monotonic (non-decreasing) inside and across strokes.
    let last = -Infinity;
    for (const p of all) {
      if (p.t < last) {
        ctx.addIssue({ code: "custom", message: "non_monotonic_time" });
        return;
      }
      last = p.t;
    }
    const duration = all[all.length - 1].t - all[0].t;
    if (duration < BIOMETRIC_LIMITS.minDurationMs) {
      ctx.addIssue({ code: "custom", message: "too_fast" });
    }
    // Points must lie inside the pad (small tolerance for pointer capture overshoot).
    const tol = 40;
    if (
      all.some(
        (p) =>
          p.x < -tol ||
          p.y < -tol ||
          p.x > data.canvas.width + tol ||
          p.y > data.canvas.height + tol,
      )
    ) {
      ctx.addIssue({ code: "custom", message: "out_of_bounds" });
    }
  });

export type BiometricData = z.infer<typeof biometricSchema>;
export type BiometricPoint = z.infer<typeof pointSchema>;

export type BiometricMetrics = {
  strokeCount: number;
  pointsCount: number;
  durationMs: number;
  penDownMs: number;
  avgVelocity: number; // px/ms while the pen is down
  maxVelocity: number;
  avgAcceleration: number; // px/ms²
  pressureSupported: boolean;
  avgPressure: number;
  tiltSupported: boolean;
  pointerType: "pen" | "touch" | "mouse";
};

/** Derived metrics (computed identically on client and server). */
export function computeMetrics(data: Pick<BiometricData, "strokes">): BiometricMetrics {
  const all = data.strokes.flatMap((s) => s.points);
  let distance = 0;
  let penDown = 0;
  let maxV = 0;
  let accSum = 0;
  let accN = 0;
  for (const stroke of data.strokes) {
    let prevV: number | null = null;
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1];
      const b = stroke.points[i];
      const dt = b.t - a.t;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      distance += d;
      penDown += dt;
      if (dt > 0) {
        const v = d / dt;
        maxV = Math.max(maxV, v);
        if (prevV !== null) {
          accSum += Math.abs(v - prevV) / dt;
          accN += 1;
        }
        prevV = v;
      }
    }
  }
  const pressures = all.map((p) => p.p);
  const distinct = new Set(pressures.map((p) => Math.round(p * 100)));
  const types = data.strokes.map((s) => s.pointerType);
  const pointerType = (["pen", "touch", "mouse"] as const).reduce((best, t) =>
    types.filter((x) => x === t).length > types.filter((x) => x === best).length ? t : best,
  );
  const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
  return {
    strokeCount: data.strokes.length,
    pointsCount: all.length,
    durationMs: Math.round(all.length ? all[all.length - 1].t - all[0].t : 0),
    penDownMs: Math.round(penDown),
    avgVelocity: round(penDown > 0 ? distance / penDown : 0),
    maxVelocity: round(maxV),
    avgAcceleration: round(accN ? accSum / accN : 0, 6),
    // Devices without pressure report a constant 0.5 (or 0/1 for mouse buttons).
    pressureSupported:
      distinct.size > 2 || (distinct.size === 1 && ![0, 50, 100].includes([...distinct][0]!)),
    avgPressure: round(pressures.reduce((s, p) => s + p, 0) / Math.max(1, pressures.length), 3),
    tiltSupported: all.some((p) => p.tx !== 0 || p.ty !== 0),
    pointerType,
  };
}

/** Deterministic serialisation (stable key order) used for hashing and storage. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

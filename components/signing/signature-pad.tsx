"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { BiometricData, BiometricPoint } from "@/lib/signing/biometrics";
import { cn } from "@/lib/utils";

type Stroke = { pointerType: "pen" | "touch" | "mouse"; points: BiometricPoint[] };

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  getData: () => BiometricData | null;
  toPng: () => string | null;
};

const INK = "#0B1B3F";

function pointerTypeOf(e: PointerEvent): Stroke["pointerType"] {
  return e.pointerType === "pen" ? "pen" : e.pointerType === "touch" ? "touch" : "mouse";
}

/** Width of a segment from pressure and speed: faster → thinner, harder → thicker. */
function segmentWidth(a: BiometricPoint, b: BiometricPoint, base: number) {
  const dt = Math.max(1, b.t - a.t);
  const v = Math.hypot(b.x - a.x, b.y - a.y) / dt; // px/ms
  const speedFactor = Math.max(0.45, Math.min(1.25, 1.3 - v * 0.35));
  const pressure = b.p > 0 && b.p !== 0.5 ? 0.55 + b.p * 0.9 : 1;
  return base * speedFactor * pressure;
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, scale: number, base: number) {
  const pts = stroke.points;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0]!.x * scale, pts[0]!.y * scale, (base * scale) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const prev = pts[i - 2] ?? a;
    ctx.lineWidth = segmentWidth(a, b, base) * scale;
    ctx.beginPath();
    // Quadratic smoothing through midpoints.
    const m1 = { x: (prev.x + a.x) / 2, y: (prev.y + a.y) / 2 };
    const m2 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    ctx.moveTo(m1.x * scale, m1.y * scale);
    ctx.quadraticCurveTo(a.x * scale, a.y * scale, m2.x * scale, m2.y * scale);
    ctx.stroke();
  }
}

export function SignaturePad({
  ref,
  height = 220,
  className,
  label,
  hint,
  onChange,
  fill = false,
}: {
  ref?: Ref<SignaturePadHandle>;
  height?: number;
  className?: string;
  label: string;
  hint: string;
  onChange?: (empty: boolean) => void;
  /** Fill the parent (full-screen mode) instead of using a fixed height. */
  fill?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const active = useRef<{ id: number; stroke: Stroke } | null>(null);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const baseWidth = () => Math.max(2.2, Math.min(3.6, size.current.w / 200));

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes.current) drawStroke(ctx, s, size.current.dpr, baseWidth());
  }, []);

  // Size the backing store to the element (crisp on HiDPI). A resize clears the pad: the
  // captured coordinates are only meaningful for one canvas geometry.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const apply = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const w = Math.round(rect.width);
      const h = Math.round(fill ? rect.height : height);
      if (w === size.current.w && h === size.current.h && dpr === size.current.dpr) return;
      const hadInk = strokes.current.length > 0;
      size.current = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      strokes.current = [];
      redraw();
      if (hadInk) onChangeRef.current?.(true);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [height, fill, redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const toPoint = (e: PointerEvent): BiometricPoint => {
      const rect = canvas.getBoundingClientRect();
      const pressure = Number.isFinite(e.pressure) ? Math.min(1, Math.max(0, e.pressure)) : 0.5;
      return {
        x: Math.round((e.clientX - rect.left) * 100) / 100,
        y: Math.round((e.clientY - rect.top) * 100) / 100,
        t: Math.round(e.timeStamp * 1000) / 1000,
        p: Math.round(pressure * 1000) / 1000,
        tx: Math.max(-90, Math.min(90, Math.round(e.tiltX || 0))),
        ty: Math.max(-90, Math.min(90, Math.round(e.tiltY || 0))),
      };
    };

    const drawLast = () => {
      const ctx = canvas.getContext("2d");
      const s = active.current?.stroke;
      if (!ctx || !s) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const last = { ...s, points: s.points.slice(-3) };
      drawStroke(ctx, last, size.current.dpr, baseWidth());
    };

    const down = (e: PointerEvent) => {
      if (active.current || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const stroke: Stroke = { pointerType: pointerTypeOf(e), points: [toPoint(e)] };
      active.current = { id: e.pointerId, stroke };
      drawLast();
    };
    const move = (e: PointerEvent) => {
      if (!active.current || active.current.id !== e.pointerId) return;
      e.preventDefault();
      const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [e];
      for (const ev of events.length ? events : [e]) {
        const p = toPoint(ev);
        const pts = active.current.stroke.points;
        const last = pts[pts.length - 1]!;
        if (p.t < last.t) p.t = last.t; // enforce monotonic time
        if (p.x === last.x && p.y === last.y) continue;
        pts.push(p);
        drawLast();
      }
    };
    const up = (e: PointerEvent) => {
      if (!active.current || active.current.id !== e.pointerId) return;
      strokes.current.push(active.current.stroke);
      active.current = null;
      onChangeRef.current?.(false);
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    clear: () => {
      strokes.current = [];
      active.current = null;
      redraw();
      onChangeRef.current?.(true);
    },
    isEmpty: () => strokes.current.length === 0,
    getData: () => {
      if (strokes.current.length === 0) return null;
      return {
        version: 1,
        canvas: { width: size.current.w, height: size.current.h, dpr: size.current.dpr },
        strokes: strokes.current.map((s) => ({
          pointerType: s.pointerType,
          points: s.points.map((p) => ({ ...p })),
        })),
      };
    },
    toPng: () => {
      if (strokes.current.length === 0) return null;
      const scale = 2;
      const off = document.createElement("canvas");
      off.width = size.current.w * scale;
      off.height = size.current.h * scale;
      const ctx = off.getContext("2d");
      if (!ctx) return null;
      for (const s of strokes.current) drawStroke(ctx, s, scale, baseWidth());
      return off.toDataURL("image/png");
    },
  }));

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative w-full touch-none overflow-hidden rounded-xl border-2 border-dashed border-primary/30 bg-white select-none",
        fill && "h-full",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="block cursor-crosshair touch-none"
        style={{ touchAction: "none" }}
        data-testid="signature-pad"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 bottom-10 flex items-end gap-2 text-ink-muted/60"
      >
        <span className="text-lg leading-none">×</span>
        <span className="h-px flex-1 bg-ink-muted/30" />
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute right-4 bottom-3 text-xs text-ink-muted/60"
      >
        {hint}
      </span>
    </div>
  );
}

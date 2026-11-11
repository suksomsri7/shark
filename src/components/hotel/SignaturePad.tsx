"use client";
// SVC H.4 ▸ ช่องลงลายมือชื่อบนแท็บเล็ต (ร.ร.3) — canvas + pointer events ไม่มีไลบรารี (แบบลายเซ็นสัญญาหอ)
//   touch-action: none กันหน้าเลื่อนตอนเซ็น · ส่งออกเป็น PNG (toDataURL) · ว่าง = ปุ่มบันทึกกดไม่ได้
import { useEffect, useRef, useState } from "react";

type Props = { onSave: (pngDataUrl: string) => unknown; busy?: boolean; label?: string };

export default function SignaturePad({ onSave, busy = false, label = "ลงชื่อผู้พัก" }: Props) {
  const ref = useRef(null as HTMLCanvasElement | null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const w = c.clientWidth || 320;
    const h = c.clientHeight || 160;
    c.width = Math.round(w * ratio);
    c.height = Math.round(h * ratio);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  const point = (e: React.PointerEvent) => {
    const c = ref.current;
    const r = c ? c.getBoundingClientRect() : { left: 0, top: 0 };
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ref.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setEmpty(false);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    drawing.current = false;
    if (ref.current?.hasPointerCapture(e.pointerId)) ref.current.releasePointerCapture(e.pointerId);
  };
  const clear = () => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
    setEmpty(true);
  };
  const save = async () => {
    const c = ref.current;
    if (!c || empty) return;
    await onSave(c.toDataURL("image/png"));
  };

  return (
    <div data-signature-pad="" className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <canvas
        ref={ref}
        aria-label="ช่องลงลายมือชื่อ"
        className="h-40 w-full touch-none rounded-xl border border-dashed border-[color:var(--color-line)] bg-white"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={clear} className="inline-flex min-h-11 items-center rounded-lg border border-[color:var(--color-line)] px-3 text-sm">
          ล้าง
        </button>
        <button type="button" onClick={save} disabled={empty || busy} className="inline-flex min-h-11 items-center rounded-lg bg-[color:var(--color-accent)] px-4 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "กำลังบันทึก…" : "บันทึกลายมือชื่อ"}
        </button>
      </div>
    </div>
  );
}

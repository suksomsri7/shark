"use client";

import { useActionState, useEffect, useRef, useState } from "react";

// สถานะผลลัพธ์ของ action อัปโหลด (โครงเดียวกับ ImageState ใน actions ของแต่ละโมดูล)
export type EditorState = { status: "idle" } | { status: "ok"; message: string } | { status: "error"; message: string };

// ตัวแก้รูปในเบราว์เซอร์ (เจ้าของสั่งข้อ 16) — ครอป · ปรับสี · ใส่ข้อความ · ย่อ/ขยาย
// ทำงานฝั่งเครื่องผู้ใช้ทั้งหมด (canvas) แล้วส่งรูปที่แต่งเสร็จขึ้น storage ครั้งเดียว
//   ครอป = ซูม/เลื่อนรูปในกรอบสัดส่วนที่เลือก (แบบเดียวกับตั้งรูปโปรไฟล์ — นิ้วเดียวก็ทำได้บนมือถือ)
//   ข้อความ = เลือกตำแหน่ง 9 ช่อง (ไม่ต้องลากให้แม่น) + ขนาด + สี
const RATIOS: { label: string; value: number | null }[] = [
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
  { label: "ตามรูป", value: null },
];
const SIZES = [640, 960, 1280];
const POSITIONS = ["ซ้ายบน", "กลางบน", "ขวาบน", "ซ้ายกลาง", "กลาง", "ขวากลาง", "ซ้ายล่าง", "กลางล่าง", "ขวาล่าง"];

// generic: ผู้ใช้ส่ง server action (bind ค่าที่ต้องใช้มาแล้ว) — inventory/pages ใช้ตัวเดียวกัน
export default function ImageEditor({
  action,
  itemName,
}: {
  action: (prev: EditorState, formData: FormData) => Promise<EditorState>;
  itemName: string;
}) {
  const [state, formAction, pending] = useActionState<EditorState, FormData>(action, { status: "idle" });
  const [src, setSrc] = useState<string | null>(null);
  const [ratio, setRatio] = useState<number | null>(1);
  const [outW, setOutW] = useState(960);
  const [zoom, setZoom] = useState(1);
  const [offX, setOffX] = useState(0);
  const [offY, setOffY] = useState(0);
  const [bright, setBright] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [sat, setSat] = useState(100);
  const [text, setText] = useState("");
  const [textSize, setTextSize] = useState(8); // % ของความสูงรูป
  const [textColor, setTextColor] = useState("#ffffff");
  const [pos, setPos] = useState(7); // กลางล่าง
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dataUrl, setDataUrl] = useState("");
  const muted = "text-[color:var(--color-muted)]";

  // โหลดไฟล์ที่เลือก → เก็บเป็น dataURL (ไม่อัปขึ้นเซิร์ฟเวอร์จนกดบันทึก)
  const onFile = (f: File | null) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      setSrc(String(r.result));
      setZoom(1);
      setOffX(0);
      setOffY(0);
    };
    r.readAsDataURL(f);
  };

  // วาดรูปตามค่าที่ตั้ง แล้วเก็บผลเป็น dataURL สำหรับส่ง
  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const r = ratio ?? img.width / img.height;
      const w = outW;
      const h = Math.round(w / r);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      ctx.filter = `brightness(${bright}%) contrast(${contrast}%) saturate(${sat}%)`;
      // ครอป: ขยายรูปให้เต็มกรอบ (cover) × ซูม แล้วเลื่อนตาม offset
      const scale = Math.max(w / img.width, h / img.height) * zoom;
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = (w - dw) / 2 + (offX / 100) * w;
      const dy = (h - dh) / 2 + (offY / 100) * h;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.filter = "none";
      if (text.trim()) {
        const fs = Math.max(10, Math.round((textSize / 100) * h));
        ctx.font = `bold ${fs}px "IBM Plex Sans Thai", sans-serif`;
        ctx.textBaseline = "middle";
        const col = pos % 3;
        const row = Math.floor(pos / 3);
        ctx.textAlign = col === 0 ? "left" : col === 1 ? "center" : "right";
        const x = col === 0 ? fs * 0.5 : col === 1 ? w / 2 : w - fs * 0.5;
        const y = row === 0 ? fs : row === 1 ? h / 2 : h - fs * 0.8;
        // เงาบาง ๆ ให้อ่านออกบนรูปสว่างและรูปมืด
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = Math.round(fs / 5);
        ctx.fillStyle = textColor;
        ctx.fillText(text.trim(), x, y);
        ctx.shadowBlur = 0;
      }
      setDataUrl(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.src = src;
  }, [src, ratio, outW, zoom, offX, offY, bright, contrast, sat, text, textSize, textColor, pos]);

  useEffect(() => {
    if (state.status === "ok") {
      setSrc(null);
      setDataUrl("");
      setText("");
    }
  }, [state]);

  return (
    <div className="flex flex-col gap-3">
      <label className={`flex flex-col gap-1 text-xs ${muted}`}>
        เลือกรูปจากเครื่อง (jpg/png/webp)
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </label>

      {src && (
        <>
          <canvas ref={canvasRef} className="w-full max-w-sm rounded-lg border" />

          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <span className={`text-xs ${muted}`}>สัดส่วน (ครอป)</span>
              <div className="flex gap-1">
                {RATIOS.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => setRatio(r.value)}
                    className={`btn-sm min-h-[36px] border ${ratio === r.value ? "border-[color:var(--color-ink)] font-medium" : ""}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className={`text-xs ${muted}`}>ขนาดรูป (กว้าง px)</span>
              <div className="flex gap-1">
                {SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setOutW(s)}
                    className={`btn-sm min-h-[36px] border ${outW === s ? "border-[color:var(--color-ink)] font-medium" : ""}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className={`flex flex-col text-xs ${muted}`}>
              ซูม {zoom.toFixed(2)}×
              <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            </label>
            <label className={`flex flex-col text-xs ${muted}`}>
              เลื่อนซ้าย-ขวา
              <input type="range" min={-50} max={50} value={offX} onChange={(e) => setOffX(Number(e.target.value))} />
            </label>
            <label className={`flex flex-col text-xs ${muted}`}>
              เลื่อนขึ้น-ลง
              <input type="range" min={-50} max={50} value={offY} onChange={(e) => setOffY(Number(e.target.value))} />
            </label>
            <label className={`flex flex-col text-xs ${muted}`}>
              ความสว่าง {bright}%
              <input type="range" min={50} max={150} value={bright} onChange={(e) => setBright(Number(e.target.value))} />
            </label>
            <label className={`flex flex-col text-xs ${muted}`}>
              คอนทราสต์ {contrast}%
              <input type="range" min={50} max={150} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} />
            </label>
            <label className={`flex flex-col text-xs ${muted}`}>
              ความอิ่มสี {sat}%
              <input type="range" min={0} max={200} value={sat} onChange={(e) => setSat(Number(e.target.value))} />
            </label>
          </div>

          <div className="flex flex-col gap-2 border-t pt-2">
            <label className={`flex w-full flex-col gap-1 text-xs ${muted}`}>
              ข้อความบนรูป (ไม่ใส่ก็ได้)
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={40} placeholder={itemName} className="input w-full" />
            </label>
            <div className="flex flex-wrap items-end gap-3">
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              ขนาด
              <input type="range" min={4} max={16} value={textSize} onChange={(e) => setTextSize(Number(e.target.value))} />
            </label>
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              สีตัวอักษร
              <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-9 w-14 rounded border" />
            </label>
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              ตำแหน่ง
              <select value={pos} onChange={(e) => setPos(Number(e.target.value))} className="input">
                {POSITIONS.map((p, i) => (
                  <option key={p} value={i}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            </div>
          </div>

          <form action={formAction} className="flex items-center gap-3">
            <input type="hidden" name="dataUrl" value={dataUrl} />
            <input type="hidden" name="alt" value={itemName} />
            <button type="submit" disabled={pending || !dataUrl} className="btn btn-primary min-h-[44px] text-sm disabled:opacity-50">
              {pending ? "กำลังบันทึกรูป…" : "บันทึกรูปนี้"}
            </button>
            <button type="button" onClick={() => setSrc(null)} className="btn btn-ghost min-h-[44px] text-sm">
              ยกเลิก
            </button>
          </form>
        </>
      )}

      {state.status === "error" && <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>}
      {state.status === "ok" && <p className={`text-sm ${muted}`}>{state.message}</p>}
    </div>
  );
}

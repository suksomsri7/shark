"use client";

import { useRef, useState, useTransition } from "react";
import { uploadLogoAction } from "@/lib/storage/actions";

const inputCls = "rounded-lg border px-2 py-1.5 text-sm";

/**
 * ช่องรูปในหน้าตั้งค่าเอกสาร (โลโก้ / ตราประทับ / ลายเซ็น)
 *
 * ทำไมรวมเป็นตัวเดียว: เดิมมีแต่โลโก้ที่อัปโหลดได้ ส่วนตราประทับ/ลายเซ็นให้ "วาง URL เอง"
 * ซึ่งเจ้าของร้านทั่วไปทำไม่ได้ (ต้องไปหาที่ฝากรูปเอง) → ทั้งสามช่องใช้ตัวเดียวกันหมด
 *
 * ปุ่ม "ลบพื้นหลัง": ตราประทับ/ลายเซ็นมักถ่ายหรือสแกนมาจากกระดาษ → พื้นขาวทับเนื้อเอกสารเวลาพิมพ์
 * ประมวลผลในเครื่องผู้ใช้ด้วย canvas (ไม่ส่งรูปไปบริการภายนอก ไม่มีค่าใช้จ่าย ไม่ต้องรอ)
 */
export function ImageAssetField({
  name,
  label,
  hint,
  defaultUrl,
  enabled,
  previewClass = "h-12 object-contain",
}: {
  name: string;
  label: string;
  hint?: string;
  defaultUrl: string;
  enabled: boolean;
  previewClass?: string;
}) {
  const [url, setUrl] = useState(defaultUrl);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function upload(file: File | Blob, filename: string) {
    const fd = new FormData();
    fd.set("file", file instanceof File ? file : new File([file], filename, { type: "image/png" }));
    startTransition(async () => {
      try {
        const res = await uploadLogoAction(fd);
        if (res.ok) {
          setUrl(res.cdnUrl);
        } else {
          setError(res.error);
        }
      } catch {
        setError("อัปโหลดไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง");
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setNote(null);
    upload(file, file.name);
  }

  async function removeBackground() {
    setError(null);
    setNote(null);
    try {
      const blob = await stripBackground(url);
      upload(blob, "no-bg.png");
      setNote("ลบพื้นหลังแล้ว — ตรวจตัวอย่างก่อนกดบันทึก");
    } catch {
      setError(
        "ลบพื้นหลังไม่ได้ — รูปนี้มาจากที่อื่นและไม่อนุญาตให้ประมวลผลข้ามเว็บ ลองอัปโหลดไฟล์เข้ามาก่อน",
      );
    }
  }

  return (
    <div className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
      {label}
      <input
        name={name}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        className={inputCls}
      />
      {hint && <span className="text-[11px]">{hint}</span>}
      {url && (
        // พื้นตารางหมากรุกจาง ๆ — ให้เห็นว่าพื้นหลังโปร่งจริงไหมหลังกดลบพื้นหลัง
        <div
          className="mt-1 inline-flex w-fit rounded border p-1"
          style={{
            backgroundImage:
              "linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)",
            backgroundSize: "10px 10px",
            backgroundPosition: "0 0,0 5px,5px -5px,-5px 0px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`ตัวอย่าง${label}`} className={previewClass} crossOrigin="anonymous" />
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {enabled && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            className="btn btn-ghost text-xs disabled:opacity-50"
          >
            {pending ? "กำลังอัปโหลด…" : url ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
          </button>
        )}
        {url && (
          <button
            type="button"
            onClick={removeBackground}
            disabled={pending}
            className="btn btn-ghost text-xs disabled:opacity-50"
          >
            ลบพื้นหลัง
          </button>
        )}
        {url && (
          <button
            type="button"
            onClick={() => {
              setUrl("");
              setNote(null);
              setError(null);
            }}
            disabled={pending}
            className="btn btn-ghost text-xs disabled:opacity-50"
          >
            เอารูปออก
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={onPick}
          className="hidden"
        />
      </div>
      {note && <span>{note}</span>}
      {error && <span className="text-[color:var(--color-danger)]">{error}</span>}
    </div>
  );
}

/**
 * ลบพื้นหลังแบบ "สีมุมภาพ" — เหมาะกับตราประทับ/ลายเซ็นที่สแกนจากกระดาษ (พื้นเรียบสีเดียว)
 * เทียบทุกพิกเซลกับสีพื้นที่อ่านได้จาก 4 มุม: ใกล้มาก = โปร่งใส · ใกล้ปานกลาง = จางลงตามระยะ
 * (ไล่ระดับเพื่อไม่ให้ขอบตัวอักษรเป็นรอยหยัก) · ไกล = เก็บไว้เต็ม
 */
async function stripBackground(src: string): Promise<Blob> {
  const img = document.createElement("img");
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(img, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height); // โยน error ถ้า canvas โดน taint
  const px = image.data;

  const corner = (x: number, y: number) => {
    const i = (y * canvas.width + x) * 4;
    return [px[i]!, px[i + 1]!, px[i + 2]!] as const;
  };
  const corners = [
    corner(0, 0),
    corner(canvas.width - 1, 0),
    corner(0, canvas.height - 1),
    corner(canvas.width - 1, canvas.height - 1),
  ];
  const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((a, k) => a + k[c]!, 0) / corners.length));

  const NEAR = 60;  // ใกล้กว่านี้ = พื้นหลังแน่ ๆ → โปร่งใส
  const FAR = 110;  // ไกลกว่านี้ = เนื้อหาแน่ ๆ → เก็บเต็ม
  for (let i = 0; i < px.length; i += 4) {
    const d = Math.hypot(px[i]! - bg[0]!, px[i + 1]! - bg[1]!, px[i + 2]! - bg[2]!);
    if (d <= NEAR) px[i + 3] = 0;
    else if (d < FAR) px[i + 3] = Math.round((px[i + 3]! * (d - NEAR)) / (FAR - NEAR));
  }
  ctx.putImageData(image, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

export default ImageAssetField;

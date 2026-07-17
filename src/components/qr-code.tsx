"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// QR ทั่วไปจากข้อความ/URL — client เท่านั้น (วาดผ่าน lib qrcode เดียวกับ PromptPayQr, ไม่เพิ่ม dependency)
// value ว่าง/ผิด → กล่องช่วยเหลือแทน (ไม่ throw)
export function QrCode({
  value,
  size = 180,
  caption,
}: {
  value: string | null;
  size?: number;
  caption?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!value) {
      setDataUrl(null);
      setError(false);
      return;
    }
    QRCode.toDataURL(value, { margin: 1, width: size, errorCorrectionLevel: "M" })
      .then((url: string) => {
        if (alive) {
          setDataUrl(url);
          setError(false);
        }
      })
      .catch(() => {
        if (alive) {
          setDataUrl(null);
          setError(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [value, size]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex items-center justify-center rounded-xl border bg-[color:var(--color-surface)] p-3"
        style={{ width: size + 24, height: size + 24 }}
      >
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt="QR รับบัตรคิว" width={size} height={size} />
        ) : (
          <span className="px-4 text-center text-xs text-[color:var(--color-muted)]">
            {error ? "สร้าง QR ไม่สำเร็จ" : "กำลังสร้าง QR…"}
          </span>
        )}
      </div>
      {caption && <div className="text-center text-sm font-medium">{caption}</div>}
    </div>
  );
}

export default QrCode;

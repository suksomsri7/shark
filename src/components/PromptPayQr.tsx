"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// แสดง QR PromptPay จาก payload (สตริง EMVCo) — client เท่านั้น (วาดบน canvas ผ่าน lib qrcode)
// payload ว่าง/ผิด → แสดงกล่องช่วยเหลือแทน (ไม่ throw)
export function PromptPayQr({
  payload,
  size = 220,
  caption,
}: {
  payload: string | null;
  size?: number;
  caption?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!payload) {
      setDataUrl(null);
      setError(false);
      return;
    }
    QRCode.toDataURL(payload, { margin: 1, width: size, errorCorrectionLevel: "M" })
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
  }, [payload, size]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex items-center justify-center rounded-xl border bg-[color:var(--color-surface)] p-3"
        style={{ width: size + 24, height: size + 24 }}
      >
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt="QR PromptPay" width={size} height={size} />
        ) : (
          <span className="px-4 text-center text-xs text-[color:var(--color-muted)]">
            {error ? "สร้าง QR ไม่สำเร็จ" : "กรอก PromptPay ID เพื่อดูตัวอย่าง QR"}
          </span>
        )}
      </div>
      {caption && dataUrl && (
        <div className="text-center text-sm font-medium">{caption}</div>
      )}
    </div>
  );
}

export default PromptPayQr;

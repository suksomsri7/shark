"use client";

// QrCodeImage.tsx — ภาพ QR จากข้อความ (ลิงก์หน้าโต๊ะ/ลิงก์สั่งล่วงหน้า/พร้อมเพย์) · POS P2.7U
//   วาดฝั่งเครื่องด้วย lib qrcode (ไม่มีการเรียกเซิร์ฟเวอร์) · ข้อความว่าง/วาดไม่ได้ = กล่องข้อความแทน (ไม่ throw)
//   🔴 ไม่มีข้อความไทยในไฟล์ (ST7) — ข้อความแทนภาพ/กล่องสำรองมาจากผู้เรียก

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCodeImage(p: { value: string | null; size?: number; alt: string; fallback?: string; testid?: string; className?: string }) {
  const size = p.size ?? 220;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!p.value) {
      setUrl(null);
      setFailed(false);
      return;
    }
    QRCode.toDataURL(p.value, { margin: 1, width: size * 2, errorCorrectionLevel: "M" })
      .then((u: string) => {
        if (alive) {
          setUrl(u);
          setFailed(false);
        }
      })
      .catch(() => {
        if (alive) {
          setUrl(null);
          setFailed(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [p.value, size]);
  return (
    <div data-testid={p.testid} data-ready={url ? "1" : "0"} className={`grid place-items-center bg-white ${p.className ?? ""}`} style={{ width: size, height: size }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={p.alt} width={size} height={size} className="block" />
      ) : (
        <span className="px-3 text-center text-[12px] text-[color:var(--color-muted)]">{failed || !p.value ? (p.fallback ?? "") : ""}</span>
      )}
    </div>
  );
}

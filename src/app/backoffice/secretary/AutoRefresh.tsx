"use client";

// รีเฟรชหน้า (server component) ทุก N วินาที — คิวเลขา G5 (S2.23) · หยุดเมื่อแท็บไม่ได้เปิดดูอยู่
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const ms = Math.max(5, seconds) * 1000;
    const t = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") router.refresh();
    }, ms);
    return () => clearInterval(t);
  }, [router, seconds]);
  return (
    <span className="text-xs text-[color:var(--color-muted)]" data-testid="auto-refresh">
      อัปเดตเองทุก {seconds} วินาที
    </span>
  );
}

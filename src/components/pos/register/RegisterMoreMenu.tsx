"use client";

// RegisterMoreMenu.tsx — ปุ่ม "⋯" ท้ายแถบโหมดของหน้าขาย (POS P2.6U · มติ 1 · Q12): เมนูทางเข้าหน้าที่ไม่อยู่ในแถบ — "จอครัว" (/pos/kds?unit=)
//   ไม่มีคีย์ POS_NAV_KEYS ใหม่ (มติ 1) · เมนูวางแบบ fixed (แถบโหมดเลื่อนแนวนอน = overflow ตัดเมนูแบบ absolute) · ไม่มีข้อความไทยในไฟล์ (ST7)
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function RegisterMoreEntry({ systemId, unitId }: { systemId: string; unitId?: string }) {
  const t = useTranslations("pos.register");
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!at) return;
    const close = (e: MouseEvent) => {
      const n = e.target as Node;
      if (box.current?.contains(n) || btn.current?.contains(n)) return;
      setAt(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAt(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", () => setAt(null), { once: true });
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [at]);
  const unitQ = unitId ? `?unit=${encodeURIComponent(unitId)}` : "";
  return (
    <>
      <button
        ref={btn}
        type="button"
        data-testid="pos-reg-more"
        aria-haspopup="menu"
        aria-expanded={!!at}
        aria-label={t("more.label")}
        title={t("more.label")}
        className="relative -mb-px ml-auto grid min-h-11 min-w-11 shrink-0 place-items-center self-center rounded-[10px] text-[18px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
        onClick={() => {
          if (at) return setAt(null);
          const r = btn.current?.getBoundingClientRect();
          if (r) setAt({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
        }}
      >
        {"⋯"}
      </button>
      {at && (
        <div ref={box} role="menu" style={{ top: at.top, right: at.right }} className="fixed z-50 w-56 rounded-[12px] border bg-[color:var(--color-surface)] p-1.5 shadow-xl">
          <Link
            role="menuitem"
            data-testid="pos-reg-more-kds"
            href={`/app/sys/${systemId}/pos/kds${unitQ}`}
            className="flex h-11 items-center rounded-[8px] px-2.5 text-[14px] hover:bg-[color:var(--color-surface-2)]"
            onClick={() => setAt(null)}
          >
            {t("more.kds")}
          </Link>
        </div>
      )}
    </>
  );
}

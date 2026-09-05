"use client";

// HelpTip.tsx — ปุ่ม "?" เส้นบาง เปิด popover คำอธิบายศัพท์บัญชี (WO 9.4 §0.3 ข้อ 9)
// ใช้ PortalMenu ของ WO 7.1 (หลุดจาก overflow ของตาราง/การ์ด) — เปิดได้ทั้ง hover (เมาส์) / focus (คีย์บอร์ด)
// / คลิก-แตะ (มือถือ ไม่มี hover) ปิดเมื่อ blur/mouseleave/คลิกนอก/Esc (พฤติกรรมปิดมาจาก PortalMenu เอง)
import { useRef, useState } from "react";
import { AccountIcon } from "./AccountIcon";
import { PortalMenu } from "./PortalMenu";
import { HELP_TEXTS } from "@/lib/modules/account/help-texts";

export function HelpTip({
  helpKey,
  text,
  testId,
}: {
  /** คีย์ใน HELP_TEXTS (แนะนำ) — ไม่พบคีย์ = ไม่เรนเดอร์อะไรเลย (กันคำอธิบายว่างโผล่เงียบ ๆ) */
  helpKey?: string;
  /** ข้อความตรง ๆ (ใช้เมื่อไม่สะดวกผ่านคีย์กลาง) — ถ้าใส่ทั้งคู่ ใช้ text ก่อน */
  text?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const resolved = text ?? (helpKey ? HELP_TEXTS[helpKey] : undefined);
  if (!resolved) return null;

  return (
    <span className="inline-flex align-middle">
      <button
        ref={btnRef}
        type="button"
        aria-label="คำอธิบาย"
        aria-expanded={open}
        data-testid={testId ?? "help-tip-btn"}
        className="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)] focus:text-[color:var(--color-ink)] focus:outline-none"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <AccountIcon name="help" className="h-3.5 w-3.5" />
      </button>
      <PortalMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        align="left"
        testId={testId ? `${testId}-popover` : "help-tip-popover"}
        className="max-w-[260px] rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-xs font-normal leading-relaxed text-[color:var(--color-ink)] shadow-[0_8px_24px_rgba(10,10,10,.14)]"
      >
        {resolved}
      </PortalMenu>
    </span>
  );
}

export default HelpTip;

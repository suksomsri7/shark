"use client";

import { useEffect, useState } from "react";

// การ์ด section ของฟอร์มเอกสาร (g1-invoice-form.png): หัวการ์ด "ชื่อ" + วงกลม ✓ ดำเมื่อครบ + action เสริม
// ยุบ/ขยายได้บนมือถือผ่าน <details> (g17-invoice-form.png) — desktop แสดงเปิดอยู่เสมอ ไม่โชว์ chevron
export function SectionCard({
  title,
  complete,
  actions,
  children,
  defaultOpen = true,
  /** WO 9.1 รอบ 2 (§13 · g17): "เงินมัดจำ/หมายเหตุ/แนบไฟล์" ต้องยุบไว้ก่อนบนมือถือ (สรุปจำนวน/ยอดใน title/actions
   *  ก็เห็นได้แล้ว) แต่เดสก์ท็อปยังเปิดอยู่เสมอเหมือนเดิม — ไม่ส่ง = พฤติกรรมเดิมทั้ง 2 จอ (ตาม defaultOpen อย่างเดียว)
   *  ใช้ media query ตรวจจอจริงตอน mount (ไม่ใช่ CSS ล้วน เพราะ <details open> ควบคุมด้วย attribute เดียวกันทั้ง
   *  2 จอ) — เนื้อหายังคง mount อยู่เสมอ (ไม่ remount) กันพัง component ที่มี state ภายใน (DepositSection/DocAttachments) */
  mobileDefaultOpen,
  testId,
}: {
  title: React.ReactNode;
  complete?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  mobileDefaultOpen?: boolean;
  testId?: string;
}) {
  // ค่าเริ่มต้นตอน render ครั้งแรก (SSR+ก่อน hydrate เสร็จ) = defaultOpen เสมอ กัน hydration mismatch
  // แล้วค่อยแก้ตามขนาดจอจริงใน effect (เร็วมาก ก่อนที่ผู้ใช้จะทันเห็น หรือก่อนกล้อง QC กดชัตเตอร์เสมอ)
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (mobileDefaultOpen === undefined) return; // ไม่ส่งมา = พฤติกรรมเดิมเป๊ะ ไม่ต้องยุ่งกับ state เลย
    const mq = window.matchMedia("(max-width: 767px)");
    setOpen(mq.matches ? mobileDefaultOpen : defaultOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <details
      open={open}
      // details ปิด/เปิดเองได้จากคลิกผู้ใช้ (native) — ต้อง sync กลับเข้า state ไม่งั้นปุ่มเดียวกันกดครั้งที่ 2 ไม่ทำงาน
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group card flex min-w-0 flex-col gap-0 p-0"
      data-testid={testId}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
        <span className="text-sm font-medium">{title}</span>
        <span className="flex items-center gap-3">
          {actions}
          {complete && (
            <span
              aria-label="ครบถ้วน"
              className="flex h-6 w-6 items-center justify-center rounded-full text-xs"
              style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
            >
              ✓
            </span>
          )}
          <span className="text-[color:var(--color-muted)] transition-transform group-open:rotate-180 md:hidden">▾</span>
        </span>
      </summary>
      <div className="flex min-w-0 flex-col gap-4 px-5 pb-5">{children}</div>
    </details>
  );
}

export default SectionCard;

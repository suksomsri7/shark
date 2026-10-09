"use client";

// MemberChip.tsx — การ์ดสมาชิกในตะกร้า (POS P1.12U มติ 3 · ภาพ 01)
//   ว่าง = แถว "+ เพิ่มสมาชิก" (pos-reg-member-pick) เปิดแผงสมาชิก 14A
//   มีสมาชิก = การ์ดมุมมน: วงกลมอักษรแรก · ชื่อหนา · "Gold · 1,240 แต้ม · ซื้อครั้งที่ 18" · ปุ่มเม็ดยาขอบฟ้า "ใช้แต้ม" · ลิงก์ "ถอด"
//     ส่วนที่ไม่มีข้อมูลตัดทิ้ง: ไม่มีระดับ = "ทั่วไป" · สาขาไม่มีระบบแต้ม = ไม่มีส่วนแต้ม · ไม่เคยซื้อ = "ยังไม่เคยซื้อ"
//     ระหว่างโหลดสิทธิ์ (registerMemberBenefitsAction) = ชื่ออย่างเดียว · "ใช้แต้ม" ซ่อนเมื่อไม่มีระบบแต้มหรือแต้ม 0
//   แตะชื่อ/วงกลม = เปิดแผงสมาชิกแบบ "มีสมาชิกแล้ว" (รางวัลรอรับ R13 + เปลี่ยนคน)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ (ไฟล์มี testid pos-reg- · S5.3) · ปุ่ม pos-reg-member-pick ต้องมีคลาส ≥44px (S5.9)

import { useTranslations } from "next-intl";
import type { RegisterMemberItem } from "@/lib/modules/pos/register-shared";
import { memberInitial } from "@/lib/modules/pos/register-member-shared";
import { RegisterIcon } from "./RegisterIcon";

export type MemberChipProps = {
  /** สมาชิกของบิล · null = ยังไม่ผูก */
  member: RegisterMemberItem | null;
  /** ข้อมูลครบแล้ว (มาจาก benefits ของสมาชิกคนนี้) — false = แสดงชื่ออย่างเดียว */
  ready: boolean;
  /** แต้มของสาขา · null = สาขาไม่มีระบบแต้ม (หรือยังไม่รู้) */
  points: number | null;
  frozen: boolean;
  onPick: () => void;
  onOpen: () => void;
  onUsePoints: () => void;
  onDetach: () => void;
};

export function MemberChip(p: MemberChipProps) {
  const t = useTranslations("pos.member");
  if (!p.member) {
    return (
      <button
        data-testid="pos-reg-member-pick"
        className="flex min-h-12 w-full items-center gap-3 rounded-[18px] border bg-[color:var(--color-surface-2)] px-3 py-[9px] text-left text-[15px] text-[color:var(--color-ink-soft)] disabled:opacity-60 xl:min-h-14 xl:px-4 xl:py-[14px]"
        type="button"
        disabled={p.frozen}
        onClick={p.onPick}
      >
        <RegisterIcon name="users" size={18} className="text-[color:var(--color-muted)]" />
        <span className="flex-1">{t("chip.add")}</span>
      </button>
    );
  }
  const m = p.member;
  const parts = p.ready
    ? [
        m.tier?.name ?? t("chip.general"),
        p.points !== null ? t("chip.points", { points: p.points.toLocaleString("th-TH") }) : null,
        m.purchaseCount > 0 ? t("chip.purchaseNo", { count: m.purchaseCount.toLocaleString("th-TH") }) : t("panel.never"),
      ].filter((x): x is string => !!x)
    : [];
  const canUsePoints = p.ready && p.points !== null && p.points > 0;
  return (
    <div
      data-testid="pos-member-chip"
      className="flex min-h-12 items-center gap-3 rounded-[18px] border bg-[color:var(--color-surface-2)] px-3 py-[7px] xl:min-h-14 xl:px-4 xl:py-[9px]"
    >
      <button
        data-testid="pos-member-chip-open"
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
        type="button"
        disabled={p.frozen}
        aria-label={t("chip.open", { name: m.name })}
        onClick={p.onOpen}
      >
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full border bg-[color:var(--color-surface)] text-[14px] font-bold">
          {memberInitial(m.name)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span data-testid="pos-member-chip-name" className="truncate text-[14.5px] font-bold text-[color:var(--color-ink)]">
            {m.name}
          </span>
          {parts.length > 0 && (
            <span data-testid="pos-member-chip-sub" className="truncate text-[12px] text-[color:var(--color-muted)]">
              {parts.join(" · ")}
            </span>
          )}
        </span>
      </button>
      {canUsePoints && (
        <button
          data-testid="pos-member-chip-usepoints"
          className="h-11 shrink-0 px-0.5 disabled:opacity-50"
          type="button"
          disabled={p.frozen}
          onClick={p.onUsePoints}
        >
          <span className="inline-flex h-7 items-center rounded-[8px] border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-2.5 text-[12.5px] font-bold text-[color:var(--color-accent)]">
            {t("chip.usePoints")}
          </span>
        </button>
      )}
      <button
        data-testid="pos-member-chip-detach"
        className="h-11 shrink-0 px-1 text-[12.5px] text-[color:var(--color-muted)] underline underline-offset-2 disabled:opacity-50"
        type="button"
        disabled={p.frozen}
        onClick={p.onDetach}
      >
        {t("chip.detach")}
      </button>
    </div>
  );
}

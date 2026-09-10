// TierCardPreview.tsx — ตัวอย่างบัตรสมาชิกที่ลูกค้าเห็นบน LINE (M1.10 · ภาพ 15 คอลัมน์ขวา)
// แสดงชื่อระดับ + สี + สิทธิประโยชน์ 3 ข้อแรกที่เปิดใช้งานอยู่ — ข้อมูลจริงจากสิทธิประโยชน์ที่บันทึกไว้แล้ว
// (ยังไม่ได้บันทึกในฟอร์มก็เห็นตัวอย่างสด เพราะรับค่าจากสถานะที่กำลังแก้ ไม่ใช่แค่ค่าที่เซฟแล้ว)

import { MemberIcon } from "./MemberIcon";
import { TierChip } from "./TierChip";
import type { TierBenefitDto } from "@/lib/modules/member/tiers";

function labelOf(b: TierBenefitDto): string | null {
  const c = b.config as Record<string, unknown>;
  switch (b.type) {
    case "DISCOUNT_PCT":
      return `ส่วนลด ${Number(c.pct ?? 0)}%${c.maxSatang ? ` (สูงสุด ฿${Math.round(Number(c.maxSatang) / 100).toLocaleString("th-TH")}/ปี)` : ""}`;
    case "DISCOUNT_FIXED":
      return `ส่วนลด ฿${Math.round(Number(c.satang ?? 0) / 100).toLocaleString("th-TH")}`;
    case "POINT_MULTIPLIER":
      return `แต้มสะสม ×${Number(c.x ?? 1)}`;
    case "WELCOME_VOUCHER":
      return "voucher ต้อนรับตอนเลื่อนระดับ";
    case "BIRTHDAY_GIFT":
      return "ของขวัญวันเกิด";
    case "FREE_SERVICE":
      return `บริการฟรี${c.perYear ? ` ${Number(c.perYear)} ครั้ง/ปี` : ""}`;
    case "PRIORITY_BOOKING":
      return `จองก่อนใคร ${Number(c.daysAhead ?? 0)} วัน`;
    case "NO_POINT_EXPIRY":
      return "แต้มไม่มีวันหมดอายุ";
    case "CANCEL_FEE_DISCOUNT":
      return `ค่าธรรมเนียมยกเลิกลด ${Number(c.pct ?? 0)}%`;
    case "EXCLUSIVE_ITEMS":
      return "เข้าถึงสินค้าเฉพาะระดับ";
    default:
      return null;
  }
}

export type TierCardPreviewProps = {
  shopName: string;
  tierName: string;
  color: string;
  benefits: TierBenefitDto[];
  memberCount: number;
};

/** ตัวอย่างบัตรสมาชิกฝั่งลูกค้าบน LINE (`tiers-card-preview` · ภาพ 15) — ไม่มีการยิง action ใด ๆ ในนี้ */
export function TierCardPreview({ shopName, tierName, color, benefits, memberCount }: TierCardPreviewProps) {
  const lines = benefits
    .filter((b) => b.active)
    .map(labelOf)
    .filter((x): x is string => !!x)
    .slice(0, 5);

  return (
    <div data-testid="tiers-card-preview" className="flex flex-col gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--color-line)" }}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <MemberIcon name="chat" />
        ตัวอย่างที่ลูกค้าเห็นบน LINE
      </div>
      <div className="rounded-2xl p-4" style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}>
        <p className="text-xs opacity-80">{shopName} · บัตรสมาชิก</p>
        <div className="mt-2 flex items-center gap-2">
          <TierChip name={tierName} color={color} />
        </div>
        <ul className="mt-3 flex flex-col gap-1 text-xs opacity-90">
          {lines.length === 0 && <li>ยังไม่มีสิทธิประโยชน์ที่เปิดใช้งาน</li>}
          {lines.map((l, i) => (
            <li key={i}>· {l}</li>
          ))}
        </ul>
      </div>
      <p className="text-xs" style={{ color: "var(--color-muted)" }}>
        คนในระดับนี้ {memberCount.toLocaleString("th-TH")} คน
      </p>
    </div>
  );
}

export default TierCardPreview;

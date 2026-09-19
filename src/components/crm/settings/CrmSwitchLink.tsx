// CrmSwitchLink.tsx — ลิงก์ "ลองใช้ CRM ใหม่" บนหน้าภาพรวม CRM เดิม (CrmHub) ไปหน้าสลับรุ่นหน้าจอ (ใบ C1.11 · มติ C23) — แสดงผลล้วน
// 🔴 ผู้เรียก (CrmHub) ตัดสินแล้วว่าผู้ดูเป็นเจ้าของร้าน + ร้านนี้เปิดให้เห็นสวิตช์ (env) — ร้านจริงโดยปริยายไม่มีลิงก์นี้
import Link from "next/link";

export function CrmSwitchLink({ systemId, uiVersion }: { systemId: string; uiVersion: 1 | 2 }) {
  return (
    <Link
      href={`/app/sys/${systemId}/crm/settings`}
      className="card flex flex-col gap-1 p-4 text-sm transition-colors hover:bg-[color:var(--color-surface-2)]"
      data-testid="crm-hub-switch-link"
    >
      <span className="font-medium">ลองใช้ CRM ใหม่</span>
      <span className="text-xs text-[color:var(--color-muted)]">
        {uiVersion === 2 ? "ร้านนี้ใช้ CRM ใหม่อยู่ — สลับกลับหน้าจอเดิมได้ทุกเมื่อ" : "เปิดหน้าจอ CRM รุ่นใหม่ได้เอง และสลับกลับหน้าจอเดิมได้ทุกเมื่อ"}
      </span>
    </Link>
  );
}

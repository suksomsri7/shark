// register-legacy-page.tsx — โครงหน้าของ "หน้าขายเดิม" ที่ย้ายออกจาก register/page.tsx (POS P1.3 · มติ Q4 · สเปก §4.7)
//
// ธง settings.pos.registerV2 !== true ⇒ หน้าเพจวาดโครงเดิมนี้ + <PosRegister> (register-ui.tsx · ห้ามแตะ — ตรงไบต์ S5.12)
// markup ยกจาก page.tsx ฐาน eb30aa5f ทุกตัวอักษร (PageHeader · ModuleTabs · ชิปเลือกสาขา · คำชวนตั้ง PromptPay · Section)
// 🔴 หนี้ปุ่มไร้ testid ของหน้าเดิม (ModuleTabs ×2 · EmptyState ×1 · Link ×2 = 5) ย้ายมาพร้อม markup — แถว baselineDebt ของไฟล์นี้
//    ใน scripts/pos-ui-inventory.json ("under the same debt rules" ของสเปก §4.7) · ปิดหนี้เมื่อ P1.12 ลบหน้าขายเดิมทั้งชุด
// 🔴 ส่วนต่างเดียวจากเดิม: เส้นทาง /pos/register เป็น "โหมดรางไอคอน" แล้ว (NavRail.isRailPath — มติ Q2 · ตัดสินจาก path ไม่รู้ธง)
//    ⇒ main ไม่มี padding ⇒ กรอบนี้ใส่ padding เท่าเดิมคืนเอง (px-4/sm:px-6 · บน 1rem ใต้แถบ · ล่าง 2.5rem · ซ้าย 1.5rem ต่อจากราง)
//    ผู้ใช้ที่เลือก "แถบเมนูเต็ม" จะเห็นรางไอคอนแทนบนหน้านี้ — บันทึกในโน้ต B2 ให้ผู้คุมงานตัดสิน

import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleTabs } from "@/components/module-tabs";

type Tab = { href: string; label: string };
const LEGACY_PAD = "px-4 pb-10 pt-4 sm:px-6";

/** ยังไม่ผูก POS กับกิจการใด → ขายไม่ได้ (createSale ต้องมี unit) → ชี้ไปเชื่อม (ใช้ทั้งจอเดิมและจอใหม่) */
export function PosRegisterUnlinked({ title, tabs, systemId }: { title: string; tabs: Tab[]; systemId: string }) {
  return (
    <div className={LEGACY_PAD}>
      <div className="flex max-w-2xl flex-col gap-5">
        <PageHeader title={title} desc="หน้าขาย" />
        <ModuleTabs items={tabs} />
        <EmptyState
          text="ยังเปิดขายไม่ได้ — เชื่อมระบบขายนี้กับกิจการ (สาขา/หน้าร้าน) ก่อนที่หน้าภาพรวม"
          action={{ href: `/app/sys/${systemId}`, label: "ไปเชื่อมกิจการ" }}
        />
      </div>
    </div>
  );
}

/** โครงหน้าขายเดิม — children = <PosRegister …/> (page.tsx วาดเองเพื่อให้เห็นทั้งสองจอในไฟล์เดียว — ข้อสอบ S5.11) */
export function PosLegacyRegisterFrame({
  title,
  tabs,
  systemId,
  units,
  activeUnitId,
  wide,
  hasPromptPay,
  children,
}: {
  title: string;
  tabs: Tab[];
  systemId: string;
  units: { id: string; name: string }[];
  activeUnitId: string;
  wide: boolean;
  hasPromptPay: boolean;
  children: React.ReactNode;
}) {
  // M2.8: สาขาที่เปิดใช้ระบบสมาชิกมีแผงสิทธิ์ทางขวา → ต้องการความกว้างมากกว่าบิลเปล่า
  // (ยังไม่เลือกสมาชิก = ฝั่งซ้ายจัดกลางที่ความกว้างเดิม ไม่เปลี่ยนหน้าตาของร้านที่ไม่มีระบบสมาชิก)
  return (
    <div className={LEGACY_PAD}>
      <div className={`flex flex-col gap-5 ${wide ? "max-w-6xl" : "max-w-2xl"}`}>
        <PageHeader title={title} desc="หน้าขาย — เปิดบิลเก็บเงิน" />
        <ModuleTabs items={tabs} />

        {/* เลือกจุดขาย (เมื่อมีหลายสาขาผูก POS นี้) */}
        {units.length > 1 && (
          <div className="-mb-1 flex flex-wrap gap-2">
            {units.map((u) => (
              <Link
                key={u.id}
                href={`/app/sys/${systemId}/pos/register?unit=${u.id}`}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  u.id === activeUnitId ? "border-[color:var(--color-accent)] bg-[color:var(--color-surface-2)] font-medium" : "hover:bg-[color:var(--color-surface-2)]"
                }`}
              >
                {u.name}
              </Link>
            ))}
          </div>
        )}

        {!hasPromptPay && (
          <p className="rounded-xl border border-dashed p-2.5 text-xs text-[color:var(--color-muted)]">
            รับพร้อมเพย์ได้ด้วย —{" "}
            <Link href="/app/settings/payment" className="text-[color:var(--color-accent)] underline">
              ตั้ง PromptPay ID ของร้าน
            </Link>
          </p>
        )}

        <Section>{children}</Section>
      </div>
    </div>
  );
}

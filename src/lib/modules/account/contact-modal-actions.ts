"use server";

// ACCOUNT-FIX B4 — ข้อมูลตั้งต้นของ ContactModal เมื่อเปิดซ้อนจากฟอร์มเอกสาร ("+ สร้างผู้ติดต่อ")
//   เดิมปุ่มพาออกจากฟอร์มไปหน้าผู้ติดต่อ (ร่างที่ยังไม่มีผู้ติดต่อบันทึกไม่ได้ ⇒ ที่กรอกไว้หายหมด)
//   ตอนนี้โหลดข้อมูลชุดเดียวกับหน้าผู้ติดต่อ (เลขถัดไป · กลุ่ม · ผู้ดูแล · อัตรา WHT · DBD) แล้วเปิด modal ในฟอร์มเลย
import { loadAccountSystem } from "./guard";
import { assertAccountCan } from "./access";
import { nextContactCode, listTenantMembers } from "./service";
import { loadContactsSidebar } from "./contacts-list";
import { isDbdConfigured, DBD_REASON } from "./dbd";
import { legalUiOptionsAt } from "./legal-values";
import { getAccMode } from "@/components/account-v2/mode";

export type ContactModalBoot = {
  nextCode: string;
  groups: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  dbdEnabled: boolean;
  dbdDisabledReason: string;
  whtRates: number[];
  defaultTab: "basic" | "advanced";
};

export async function contactModalBootAction(systemId: string): Promise<ContactModalBoot> {
  const { auth, tenantId } = await loadAccountSystem(String(systemId).slice(0, 40));
  assertAccountCan(auth, "account.contact.manage");
  const ctx = { tenantId, systemId };
  const [nextCode, owners, sidebar, legal, mode] = await Promise.all([
    nextContactCode(systemId),
    listTenantMembers(tenantId),
    loadContactsSidebar(ctx),
    legalUiOptionsAt(ctx, new Date()),
    getAccMode(),
  ]);
  return {
    nextCode,
    groups: sidebar.counts.custom.map((g) => ({ id: g.id, name: g.name })),
    owners,
    dbdEnabled: isDbdConfigured(),
    dbdDisabledReason: DBD_REASON.noKey,
    whtRates: legal.whtRates,
    defaultTab: mode === "easy" ? "basic" : "advanced",
  };
}

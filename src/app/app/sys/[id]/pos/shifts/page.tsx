import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canAccessUnit, canViewPayroll, evaluate } from "@/lib/core/rbac"; // POS P3.5U ▸ + canViewPayroll (ชั่วโมงของกะ · มติ 7) ◂
import { systemDef } from "@/lib/systems";
import { posTabs } from "@/lib/modules/pos/tabs";
import { posMembership } from "@/lib/modules/pos/access";
import { posUnits } from "@/lib/modules/pos/register";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { ShiftsClient } from "./ShiftsClient";
import { posClockOnShift } from "@/lib/modules/pos/settings-shared"; // POS P3.5U ▸ มติ 7 ◂
import { shiftHoursForOwner } from "@/lib/modules/pos/hr-link"; // POS P3.5U ▸ มติ 7: ตัวอ่านฝั่งเซิร์ฟเวอร์ (ระดับหน้าเท่านั้น) ◂
import { posOfflineEnabled } from "@/lib/modules/pos/offline-shared"; // POS P3.4U ▸ มติ 9 ◂
// POS P3.8U ▸ CD-P38U-6: ชิปการ์ดตรวจเงินของกะที่ปิดแล้ว (posCardsForKeys — ตัวอ่านไม่มีด่านข้างใน ⇒ เรียกจากหน้าเท่านั้น หลังด่าน pos.shift.manage) +
//   บรรทัด "เมื่อปิดกะ" จากตัวอ่านบริสุทธิ์ (ห้องทีม = ทุกคน · การ์ด = ผู้จัดการเท่านั้น) ◂
import { posCardsForKeys } from "@/lib/pos-board-bridges";
import { posBoardIdForUnit, posBoardKeys, posBoardSettings, posRoomForUnit, posTeamRoomSettings } from "@/lib/modules/pos/board-settings-shared";

// POS P1.9 / P1.9 U — หน้ากะและลิ้นชักเงิน (ภาพ 07 + เปิดกะ 13A ส่วน A) · ข้อมูลทั้งหน้าโหลดจาก shiftsPageDataAction คำขอเดียว
//   (รหัสเครื่องอยู่ใน localStorage ของเบราว์เซอร์ ⇒ อ่านฝั่ง client) · คำปฏิเสธเป็นข้อมูล
// 🔴 สิทธิ์จริงตัดสินใน shift.ts (operate/manage) — หน้านี้แค่เลือกสาขาที่เข้าได้ + บอกจอว่าเห็นเมนูผู้จัดการไหม (manage เห็นทุกกะ · operate เห็นของตัวเอง)
export default async function PosShiftsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ unit?: string }> }) {
  const { id } = await params;
  const { unit } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  const m = posMembership(auth.active);
  const units = (await posUnits(tenantId, id)).filter((u) => canAccessUnit(m, u.id)).map((u) => ({ id: u.id, name: u.name }));
  if (units.length === 0) notFound();
  const unitId = units.some((u) => u.id === unit) ? unit! : units[0]!.id;
  const canManage = evaluate(m, { module: "pos", action: "pos.shift.manage", unitId });
  const def = systemDef(sys.type);
  const t = await getTranslations("pos.shift");
  // POS P3.5U ▸ มติ 7: ถามลงเวลาหลังเปิด/ปิดกะ = clockOnShift ASK (ร้านมีระบบ HR) · ชั่วโมงของกะ = ผู้ดูเงินเดือน (canViewPayroll) ·
  //   กะ 50 กะล่าสุดของสาขา (ชุดเดียวกับประวัติของหน้า) → shiftHoursForOwner (ตัวอ่านตรวจสิทธิ์ซ้ำ · ปฏิเสธ/พัง = ไม่มีบรรทัดชั่วโมง) ◂
  const hrLinked = (await prisma.appSystem.count({ where: { tenantId, type: "HR" } })) > 0;
  const clockAsk = posClockOnShift(sys.settings, hrLinked) === "ASK";
  let hours: Record<string, { shiftId: string; durationMin: number; workedMin: number | null; warnings: string[] }> | null = null;
  if (hrLinked && canViewPayroll(m)) {
    const recent = await prisma.posShift.findMany({ where: { tenantId, systemId: id, unitId }, orderBy: [{ openedAt: "desc" }, { id: "desc" }], take: 50, select: { id: true } });
    if (recent.length) {
      const r = await shiftHoursForOwner({ tenantId, systemId: id, unitId }, { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions }, { shiftIds: recent.map((x) => x.id) });
      if (r.ok) hours = Object.fromEntries(r.items.map((x) => [x.shiftId, { ...x, warnings: [...x.warnings] }]));
    }
  }
  // POS P3.4U ▸ มติ 9 (CD-P34U-4): การ์ดบิลออฟไลน์รอผู้จัดการ — ผู้จัดการเท่านั้น · ชื่อผู้ใช้ของร้าน (ผู้ขายที่เครื่องอ้าง / ที่ตรวจแล้ว · แสดงเท่านั้น) ◂
  let offline: { enabled: boolean; names: Record<string, string> } | null = null;
  if (canManage) {
    // fix1 F4: ชื่อสมาชิกโหลดเฉพาะเมื่อธงเปิด หรือสาขามีแถวรอผู้จัดการ (REJECTED · ACCEPTED ที่ยังไม่มีบิล — ชุดเดียวกับ listOfflineRejected) ·
    //   ส่งแค่ชื่อที่แสดง (ไม่มีอีเมล — ไม่มีชื่อ = "ไม่ทราบชื่อ" ที่จอ) · ปิดธง + ไม่มีแถว = ไม่ส่งรายชื่อเลย
    const enabled = posOfflineEnabled(sys.settings);
    const pending = enabled
      ? 1
      : await prisma.posOfflineSale.count({ where: { tenantId, systemId: id, unitId, OR: [{ status: "REJECTED" }, { status: "ACCEPTED_BY_MANAGER", saleId: null }] } });
    const ms = pending > 0 ? await prisma.membership.findMany({ where: { tenantId }, select: { userId: true, user: { select: { name: true } } }, take: 500 }) : [];
    offline = { enabled, names: Object.fromEntries(ms.flatMap((x) => (x.user.name?.trim() ? [[x.userId, x.user.name.trim()]] : []))) };
  }
  // POS P3.8U ▸ CD-P38U-6 · CD-P38U-10: การ์ดของ 50 กะล่าสุดของสาขา (ชุดเดียวกับประวัติ) เมื่อ pos.shift.manage ∧ บอร์ดงานเปิด · ไม่มีชื่อคน ◂
  const boardCfg = posBoardSettings(sys.settings);
  const roomCfg = posTeamRoomSettings(sys.settings);
  const sd = boardCfg.rules.shiftDiff;
  const boardHint = {
    room: roomCfg.enabled && roomCfg.posts.shiftClose && !!posRoomForUnit(roomCfg, unitId),
    card: canManage && boardCfg.enabled && sd.enabled && !!posBoardIdForUnit(boardCfg, unitId) ? { minSatang: sd.minAbsSatang, every: sd.everyClose } : null,
  };
  let shiftCards: Record<string, { cardNo: number | null; href: string; completed: boolean }> | null = null;
  if (canManage && boardCfg.enabled) {
    const recent = await prisma.posShift.findMany({ where: { tenantId, systemId: id, unitId }, orderBy: [{ openedAt: "desc" }, { id: "desc" }], take: 50, select: { id: true } });
    const byKey = new Map(recent.map((x) => [posBoardKeys.shift(x.id), x.id]));
    const cards = byKey.size ? await posCardsForKeys(tenantId, [...byKey.keys()]) : [];
    shiftCards = Object.fromEntries(cards.flatMap((c) => (byKey.has(c.key) ? [[byKey.get(c.key)!, { cardNo: c.cardNo, href: c.href, completed: c.completed }]] : [])));
  }
  return (
    <div className="flex w-full min-w-0 max-w-7xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("desc")} />
      <ModuleTabs items={posTabs(id, await getTranslations("pos"))} />
      <ShiftsClient systemId={id} units={units} unitId={unitId} canManage={canManage} meName={auth.user.name?.trim() || auth.user.email || "-"} meUserId={auth.user.id} /* POS P3.5U ▸ มติ 5 ◂ */ clockAsk={clockAsk} hours={hours} /* POS P3.5U ▸ มติ 7 ◂ */ offline={offline} /* POS P3.4U ▸ มติ 9 ◂ */ boardHint={boardHint} shiftCards={shiftCards} /* POS P3.8U ▸ CD-P38U-6 ◂ */ />
    </div>
  );
}

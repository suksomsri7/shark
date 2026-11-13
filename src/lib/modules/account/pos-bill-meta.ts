// ─────────────────────────────────────────────────────────────
// pos-bill-meta.ts — ทางอ่าน POS → บัญชี (ACC T1.1 · อ่านอย่างเดียว)
// รายงานภาษีขายต้องรู้ของบิล POS: เลขใบเสร็จ/ใบกำกับอย่างย่อ · วันที่ขาย · สาขา · เครื่องขาย (+ เลขประจำเครื่อง POS)
// โมดูลบัญชีไม่มีตารางเหล่านี้ ⇒ อ่านตรงจาก PosSale/PosShift/PosDevice/BusinessUnit ที่นี่ที่เดียว (ผูกร้านเสมอ)
// ─────────────────────────────────────────────────────────────
import { tenantDb } from "@/lib/core/db";

export type PosBillMeta = {
  saleId: string;
  receiptNo: string | null;
  docType: "SALE" | "REFUND";
  status: string;
  refSaleId: string | null;
  paidAt: Date | null;
  createdAt: Date;
  grandTotalSatang: number;
  vatSatang: number;
  unitId: string;
  unitName: string | null;
  deviceCode: string | null;
  deviceName: string | null;
  posRegNo: string | null;
  /** บิลนี้จ่ายด้วยมัดจำ (VAT บางส่วนออกไปแล้วตอนรับมัดจำ — ยอด VAT ของบิลต้นทางไม่เท่า GL โดยตั้งใจ) */
  hasDeposit: boolean;
  sourceModule: string;
};

/** posSystemIds = ระบบ POS ที่อาจเป็นต้นทาง (ผูกสมุด + refSystemId ของเอกสาร) — ตาราง POS ผูกขอบเขตระบบ POS (tenantDb) */
export async function posBillMeta(tenantId: string, posSystemIds: string[], saleIds: string[]): Promise<Map<string, PosBillMeta>> {
  const out = new Map<string, PosBillMeta>();
  const ids = [...new Set(saleIds.filter(Boolean))];
  if (ids.length === 0) return out;
  for (const posSys of [...new Set(posSystemIds.filter(Boolean))]) {
    const left = ids.filter((id) => !out.has(id));
    if (left.length === 0) break;
    await readSystem(tenantId, posSys, left, out);
  }
  return out;
}

async function readSystem(tenantId: string, posSystemId: string, ids: string[], out: Map<string, PosBillMeta>): Promise<void> {
  const db = tenantDb({ tenantId, systemId: posSystemId });
  const sales = await db.posSale.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      receiptNo: true,
      docType: true,
      status: true,
      refSaleId: true,
      paidAt: true,
      createdAt: true,
      grandTotalSatang: true,
      vatSatang: true,
      unitId: true,
      shiftId: true,
      sourceModule: true,
      payments: { where: { type: "DEPOSIT" }, select: { id: true }, take: 1 },
    },
  });
  const shiftIds = [...new Set(sales.map((s) => s.shiftId).filter((x): x is string => !!x))];
  const unitIds = [...new Set(sales.map((s) => s.unitId))];
  const [shifts, units] = await Promise.all([
    shiftIds.length ? db.posShift.findMany({ where: { id: { in: shiftIds } }, select: { id: true, unitId: true, deviceId: true, deviceLabel: true } }) : [],
    tenantDb({ tenantId }).businessUnit.findMany({ where: { id: { in: unitIds } }, select: { id: true, name: true } }),
  ]);
  const shiftMap = new Map(shifts.map((s) => [s.id, s]));
  const devKeys = shifts.map((s) => ({ unitId: s.unitId, deviceCode: s.deviceId }));
  const devices = devKeys.length
    ? await db.posDevice.findMany({ where: { OR: devKeys }, select: { unitId: true, deviceCode: true, name: true, posRegNo: true } })
    : [];
  const devMap = new Map(devices.map((d) => [`${d.unitId}|${d.deviceCode}`, d]));
  const unitMap = new Map(units.map((u) => [u.id, u.name]));
  for (const s of sales) {
    const sh = s.shiftId ? shiftMap.get(s.shiftId) : undefined;
    const dev = sh ? devMap.get(`${sh.unitId}|${sh.deviceId}`) : undefined;
    out.set(s.id, {
      saleId: s.id,
      receiptNo: s.receiptNo,
      docType: s.docType,
      status: s.status,
      refSaleId: s.refSaleId,
      paidAt: s.paidAt,
      createdAt: s.createdAt,
      grandTotalSatang: s.grandTotalSatang,
      vatSatang: s.vatSatang,
      unitId: s.unitId,
      unitName: unitMap.get(s.unitId) ?? null,
      deviceCode: sh?.deviceId ?? null,
      deviceName: dev?.name ?? sh?.deviceLabel ?? null,
      posRegNo: dev?.posRegNo ?? null,
      hasDeposit: s.payments.length > 0,
      sourceModule: s.sourceModule,
    });
  }
}

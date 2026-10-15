// tip-ledger.ts — POS P2.9U ▸ ตัวอ่าน (อ่านอย่างเดียว) บัญชีของสมุดที่เชื่อมกับ POS นี้ ให้ตัวเลือกบัญชีพักทิป — แบบเดียวกับ payment-settings.tipLedgerOk ◂
// 🔴 ไม่ใช่ไฟล์ "use server" — action (tip-ledger-actions.ts) ตรวจ session/สิทธิ์แล้วเรียกตัวนี้ · ไม่เขียนอะไร
// 🔴 คืนทุกหมวดที่ยังไม่เก็บ (จอกรอง LIABILITY) · ความถูกต้องของบัญชีที่เลือกตัดสินที่ updatePosPaymentSettings (tipLedgerOk)

import { prisma } from "./db";
import type { PosTipLedgersResult } from "./tip-ledger-shared";

export async function posTipLedgers(ctx: { tenantId: string; systemId: string }): Promise<PosTipLedgersResult> {
  const { tenantId, systemId } = ctx;
  const pos = systemId ? await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { id: true } }) : null;
  if (!pos) return { ok: false, code: "NOT_FOUND", message: "ไม่พบจุดขายนี้" };
  // สมุดที่เชื่อมกับ POS นี้ (เงื่อนไขเดียวกับ payment-settings.tipLedgerOk)
  const link = await prisma.accountSystemLink.findFirst({ where: { tenantId, linkedKind: "POS", linkedId: pos.id, archivedAt: null, enabled: true }, select: { systemId: true } });
  if (!link) return { ok: true, linked: false, ledgers: [] };
  const rows = await prisma.accountLedger.findMany({
    where: { tenantId, systemId: link.systemId, archivedAt: null },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { code: "asc" },
    take: 500,
  });
  return { ok: true, linked: true, ledgers: rows.map((r) => ({ id: r.id, code: r.code, name: r.name, type: String(r.type) })) };
}

// ops/sync.ts — op ซิงก์บิลออฟไลน์ (POS P3.4 S · R5 · มติ 2 · CD-8) // POS P3.4 ▸ ไฟล์ใหม่ทั้งไฟล์ ◂
//   POST /sync/sales = ทางของแอป/คีออสก์ภายนอกที่ขายตอนออฟไลน์แล้วส่งบิลทีหลัง (หน้าขายของร้านใช้ route ของ session /api/pos/sync)
// 🔴 ตรรกะทั้งหมดอยู่ที่ facade pos/offline-sync.ts (ราคา ณ soldAt / snapshot · นาฬิกา · กะ · เครื่อง · ผู้ขาย · เลข OFF · คิวผู้จัดการ)
//    ที่นี่: ด่านสาขาของคีย์ (requirePosUnit) · โครงคำขอตรงตัว (.strict · ≤ 50 รายการ) · ส่งต่อ · แปลคำปฏิเสธ
import { z } from "zod";
import { syncOfflineSales } from "../../offline-sync";
import { posRegisterActorOf } from "../actor";
import { posResult, toPosApiError } from "../http-errors";
import { definePosOp, POS_SCOPES, type ApiOp } from "../op";
import { requirePosUnit } from "../units";

const item = z
  .object({
    offlineRef: z.string().min(1).max(40).describe("Temporary number the device printed, OFF-<device code>-<seq> (e.g. OFF-C1-0007)."),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/).describe("The bill key the device created when it sold (same key as an online retry)."),
    soldAt: z.string().min(1).max(40).describe("ISO time the device sold the bill (device clock; checked against server time, the shift and the price snapshot)."),
    shiftId: z.string().min(1).max(64).optional().describe("Shift that was open on the device when it sold. Omit = off-shift."),
    staffToken: z.string().min(1).max(1000).optional().describe("Staff token of the seller on this device (checked at soldAt, never stored)."),
    sellerUserId: z.string().min(1).max(64).optional().describe("Seller the device claims. Must be the staff token user, or the API key itself."),
    snapshotHash: z.string().min(1).max(100).describe("hash of the price snapshot the device used."),
    sale: z.record(z.string(), z.unknown()).describe("The bill exactly as for POST /sales on the register (lines, payMethods CASH/TRANSFER, cashReceivedSatang, expectedGrandTotalSatang = the total the device charged), without idempotencyKey/staffToken."),
  })
  .strict();

const syncSales = definePosOp({
  id: "sync.sales",
  method: "POST",
  path: "/sync/sales",
  kind: "write",
  action: POS_SCOPES.offlineSync,
  summary:
    "Sync bills a register sold while offline (max 50 per call, processed in sold time order). Each bill is re-priced at its sold time or at the device's price snapshot; every bill gets its own result: OK (new bill), DUPLICATE (already synced) or REJECTED with a reason for the manager queue.",
  label: "ซิงก์บิลที่ขายตอนออฟไลน์",
  test: "sync.sales",
  input: z
    .object({
      unitId: z.string().min(1).max(64).describe("Branch (BusinessUnit id) of this POS system."),
      deviceId: z.string().min(8).max(64).describe("Device code of the register that sold the bills (registered at this branch)."),
      items: z.array(item).max(50).describe("Bills to sync (max 50)."),
    })
    .strict(),
  async handler({ actor, input }) {
    const unitId = await requirePosUnit(actor, input.unitId);
    const r = await syncOfflineSales(
      { tenantId: actor.tenantId, systemId: actor.systemId, unitId, ...(actor.kind === "apikey" && actor.keyId ? { apiKeyId: actor.keyId } : {}) },
      posRegisterActorOf(actor),
      { deviceId: input.deviceId, items: input.items as never },
    );
    // ร้านยังไม่เปิดขายออฟไลน์ = สถานะไม่เอื้อ (409) · อื่น ๆ แปลตามตารางกลาง
    if (!r.ok && r.code === "OFFLINE_DISABLED") throw toPosApiError({ ok: false, code: "NOT_ELIGIBLE", message: r.message });
    return posResult(r);
  },
});

export const SYNC_OPS: ApiOp[] = [syncSales];

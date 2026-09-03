// outbox-consumers.ts — composition root ของ outbox (อยู่นอก core → import โมดูลได้)
// ผูก event type → handler · handler อ่านข้อมูลจาก prisma ตรง แล้วส่งให้ pos/account-bridge
// WO-0002: "pos.sale.paid" (ขายสด→บัญชี) · "pos.sale.voided" (void→กลับรายการ)

import { after } from "next/server";
import { prisma } from "@/lib/core/db";
import { drainOutbox, type OutboxHandler } from "@/lib/core/outbox";
import { bridgePosSalePaid, bridgePosSaleVoided } from "@/lib/modules/pos/account-bridge";
import { runForEvent } from "@/lib/automation/engine";
import { dispatchWebhooks } from "@/lib/webhooks/service";
import { entityLabel } from "@/lib/modules/approval/labels";
import { applyApprovalEffect } from "@/lib/approval-effects";
import { logOps } from "@/lib/core/ops";

const saleIdOf = (payload: unknown): string | null => {
  const p = payload as { saleId?: unknown } | null;
  return p && typeof p.saleId === "string" ? p.saleId : null;
};

// ขายสด POS → บัญชี
const posSalePaid: OutboxHandler = async (evt) => {
  const saleId = saleIdOf(evt.payload);
  if (!saleId) return;
  const sale = await prisma.posSale.findFirst({
    where: { id: saleId, tenantId: evt.tenantId },
    include: {
      payments: true,
      // WO 4.2: อ่านบรรทัดเต็ม (เดิมอ่านแค่ serviceId/lineTotal) → ส่งต่อให้บัญชีสร้างเอกสารต่อสินค้า
      lines: {
        select: {
          id: true,
          name: true,
          qty: true,
          unitPriceSatang: true,
          discountSatang: true,
          lineTotalSatang: true,
          itemId: true,
          serviceId: true,
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!sale) return;
  if (sale.status !== "PAID") return; // ถูก void ก่อน drain → ไม่ต้อง post (void handler จัดการ)
  // ยอดฝั่งบริการ → ลงบัญชี 4030 รายได้ค่าบริการ (ที่เหลือเข้า 4000 ขายสินค้า)
  // ใช้ยอดก่อนหักส่วนลดท้ายบิล — facade ถอด VAT/ปรับสัดส่วนให้เอง
  const serviceGross = sale.lines.reduce((n, l) => n + (l.serviceId ? l.lineTotalSatang : 0), 0);
  // WO 4.2 (MAP §F.13): ลูกค้าของบิล — สมาชิกที่ผูกไว้ (Customer) พร้อม partyId เพื่อจับคู่ผู้ติดต่อฝั่งบัญชี
  //   ไม่มีสมาชิก = ลูกค้าเดินเข้าร้าน (walk-in) → ไม่ส่ง customer → เอกสารไม่ผูกผู้ติดต่อ
  const member = sale.memberId
    ? await prisma.customer.findFirst({
        where: { id: sale.memberId, tenantId: evt.tenantId },
        select: { id: true, name: true, phone: true, partyId: true },
      })
    : null;
  await bridgePosSalePaid(sale, sale.payments, serviceGross, {
    lines: sale.lines.map((l) => ({
      name: l.name,
      qty: l.qty,
      unitPriceSatang: l.unitPriceSatang,
      discountSatang: l.discountSatang,
      lineTotalSatang: l.lineTotalSatang,
      itemId: l.itemId,
    })),
    customer: member
      ? { memberId: member.id, partyId: member.partyId, name: member.name, phone: member.phone }
      : null,
  });
};

// void บิล POS → กลับรายการบัญชี
const posSaleVoided: OutboxHandler = async (evt) => {
  const saleId = saleIdOf(evt.payload);
  if (!saleId) return;
  const sale = await prisma.posSale.findFirst({
    where: { id: saleId, tenantId: evt.tenantId },
    select: { id: true, tenantId: true, systemId: true },
  });
  if (!sale) return;
  await bridgePosSaleVoided(sale);
};

// ห่อ handler หลักด้วย Automation (WO-0026): หลัง handler หลักสำเร็จ (event กำลังจะ DONE)
// เรียก engine แบบ best-effort — engine พัง (rule/webhook ล่ม) ห้ามล้ม consumer หลัก
// (ไม่งั้น event จะถูก retry แล้ว post บัญชีซ้ำ) → ครอบ try/catch เงียบ
const withAutomation =
  (handler: OutboxHandler): OutboxHandler =>
  async (evt) => {
    // งานหลักก่อน — พังต้องโยนต่อเหมือนเดิม (drain จะ retry/backoff) เพียงแต่ log ERROR ก่อน
    try {
      await handler(evt);
    } catch (e) {
      await logOps("ERROR", "outbox", `handler "${evt.type}" ล้มเหลว`, {
        tenantId: evt.tenantId,
        detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
      throw e; // โยนต่อ — พฤติกรรมเดิมห้ามเปลี่ยน
    }
    try {
      await runForEvent({ tenantId: evt.tenantId, type: evt.type, payload: evt.payload });
    } catch (e) {
      // automation ล้มเหลว = เรื่องรอง — event หลัก DONE ตามปกติ · แค่บันทึก WARN
      await logOps("WARN", "outbox", `automation ของ "${evt.type}" ล้มเหลว`, {
        tenantId: evt.tenantId,
        detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
    }
  };

// ── Approval Engine (WO-0049): แจ้งเตือนร้านเมื่อคำขออนุมัติเปลี่ยนสถานะ ──
const approvalMeta = (payload: unknown): { entityType: string; entityId: string } => {
  const p = (payload ?? {}) as { entityType?: unknown; entityId?: unknown };
  return {
    entityType: typeof p.entityType === "string" ? p.entityType : "",
    entityId: typeof p.entityId === "string" ? p.entityId : "",
  };
};

const approvalNotify =
  (title: (label: string) => string, body: string): OutboxHandler =>
  async (evt) => {
    const { entityType } = approvalMeta(evt.payload);
    await prisma.appNotification.create({
      data: { tenantId: evt.tenantId, title: title(entityLabel(entityType)), body },
    });
  };

const approvalSubmitted = approvalNotify(
  (label) => `มีคำขออนุมัติใหม่: ${label}`,
  "มีคำขอรอการอนุมัติ เปิดหน้า “รออนุมัติของฉัน” เพื่อตรวจสอบ",
);
const approvalApproved = approvalNotify(
  (label) => `คำขออนุมัติผ่านแล้ว: ${label}`,
  "คำขอผ่านการอนุมัติครบทุกขั้นแล้ว",
);
const approvalRejected = approvalNotify(
  (label) => `คำขอถูกปฏิเสธ: ${label}`,
  "คำขออนุมัติถูกปฏิเสธ ไม่ไปขั้นถัดไป",
);

// WO-0049b: ห่อ notify ของ approved/rejected ด้วย effect — หลัง notify เดิมทำงาน (ห้ามหาย)
//   applyApprovalEffect นำผลกลับ entity ต้นทาง (PO→ORDERED / ใบลา→APPROVED|REJECTED)
//   effect เป็น updateMany + guard สถานะ → idempotent (ถ้า drain retry ก็ไม่พัง)
const withApprovalEffect =
  (handler: OutboxHandler): OutboxHandler =>
  async (evt) => {
    await handler(evt); // notify เดิมก่อนเสมอ
    if (evt.type === "approval.request.approved" || evt.type === "approval.request.rejected") {
      await applyApprovalEffect({ tenantId: evt.tenantId, type: evt.type, payload: evt.payload });
    }
  };

// ── Webhooks ขาออก (WO-0062): ห่อเพิ่มอีกชั้นหลัง handler หลัก(+automation) สำเร็จ ──
// ยิงฮุคไปทุก endpoint ที่ร้าน subscribe event นี้ — best-effort เหมือน automation
// (dispatch จับ error ต่อ endpoint อยู่แล้ว · ห่อ try/catch กัน error ระดับ query ไม่ให้ล้ม consumer)
const withWebhooks =
  (handler: OutboxHandler): OutboxHandler =>
  async (evt) => {
    await handler(evt); // handler หลัก(+automation) — พังต้องโยนต่อ (drain retry) ตามเดิม
    try {
      await dispatchWebhooks({ tenantId: evt.tenantId, type: evt.type, payload: evt.payload });
    } catch (e) {
      await logOps("WARN", "outbox", `webhook ของ "${evt.type}" ล้มเหลว`, {
        tenantId: evt.tenantId,
        detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
    }
  };

const baseConsumers: Record<string, OutboxHandler> = {
  "pos.sale.paid": withAutomation(posSalePaid),
  "pos.sale.voided": withAutomation(posSaleVoided),
  "approval.request.submitted": withAutomation(approvalSubmitted),
  "approval.request.approved": withAutomation(withApprovalEffect(approvalApproved)),
  "approval.request.rejected": withAutomation(withApprovalEffect(approvalRejected)),
  // WO-0038: AppNotification ถูกสร้างแล้วใน sweepExpiringLots — consumer นี้มีไว้ปิด event เป็น DONE
  // (ไม่งั้นค้าง PENDING โดน drain วนตลอด) + เป็นจุดให้ Automation rules ยิงตามกติกาที่ร้านตั้ง
  "inventory.lot.expiring": withAutomation(async () => {}),
  // Wave4-A: AppNotification "ลูกค้าทักเข้ามา" ถูกสร้างแล้วใน chat.announceInbound (de-dup) —
  // consumer นี้ปิด event เป็น DONE + เป็นจุดให้ Automation rules / Webhooks ยิงราย inbound message
  "chat.message.received": withAutomation(async () => {}),
  // WO-C2 (§3.4): แอดมินตอบ / เธรดเปลี่ยนสถานะ — ผลข้างเคียงเกิดใน service ไปแล้ว
  // consumer เป็น no-op เพื่อ **ปิด event เป็น DONE** (ไม่มี handler = ค้าง PENDING ตลอดกาล
  // พร้อม lastError "ไม่มี consumer…" — outbox.ts:111) + เป็นจุดให้ Automation/Webhooks ยิงต่อ
  // ตัวที่ส่งออกจริงคือ withWebhooks ข้างล่าง → SiamDive รับ chat.message.sent ไปส่ง push
  "chat.message.sent": withAutomation(async () => {}),
  // WO-C3b: คำตอบของทีมงานที่ระบบภายนอก "สะท้อน" เข้ามา (`/api/v1/chat/replies`)
  // 🔴 แยก type จาก `chat.message.sent` โดยเจตนา — ตัวนั้นแปลว่า "แอดมินใน SHARK ตอบ" และ
  // WO-C6 ผูกไว้กับการ push แจ้งลูกค้า · ยิงกลับไปหาระบบที่เพิ่งส่งข้อความนั้นเอง = push ซ้ำ
  // และวนลูปได้ · ตัวนี้แปลว่า "คัดลอกเข้ามาแล้ว ไม่ต้องส่งอะไรต่อ" — no-op เพื่อปิด event เป็น DONE
  // (ไม่มี handler = ค้าง PENDING ตลอดกาล — outbox.ts:111) + เป็นจุดให้ Automation/Webhooks ยิงต่อ
  "chat.message.mirrored": withAutomation(async () => {}),
  "chat.conversation.status": withAutomation(async () => {}),
  // 🔴 30 ส.ค. 2026 — เพิ่ม type ใหม่แล้ว **ลืมลงทะเบียนตรงนี้** ⇒ event ค้าง PENDING
  //    พร้อม lastError "ไม่มี consumer…" · webhook ไม่เคยถูกยิง ⇒ ติ๊กคู่ ✓✓ ไม่มีวันขึ้น
  //    (ข้อสอบ CP-6 สแกนซอร์สแล้วเทียบกับตารางนี้ ห้ามให้เกิดซ้ำ)
  //    ผลข้างเคียงเกิดใน markRead ไปแล้ว — no-op เพื่อปิด event เป็น DONE + ให้ withWebhooks ยิงต่อ
  "chat.conversation.read": withAutomation(async () => {}),
  // Wave4-B: AppNotification "มีคนกรอกฟอร์ม" ถูกสร้างแล้วใน submitPublicForm —
  // consumer นี้ปิด event เป็น DONE + เป็นจุดให้ Automation rules / Webhooks ยิงราย lead ใหม่
  "forms.submission.received": withAutomation(async () => {}),
  // Wave4-C: AppNotification "ได้รับมอบหมายงาน" ถูกสร้างแล้วใน kanban.notifyAssignment —
  // consumer ปิด event DONE + จุดให้ Automation/Webhooks ยิงเมื่อมอบหมายการ์ด
  "kanban.card.assigned": withAutomation(async () => {}),
};

// ห่อทุก consumer ด้วย withWebhooks → ทุก event ที่ drain สำเร็จจะ dispatch ฮุคให้อัตโนมัติ
export const consumers: Record<string, OutboxHandler> = Object.fromEntries(
  Object.entries(baseConsumers).map(([type, handler]) => [type, withWebhooks(handler)]),
);

export async function drainAll() {
  return drainOutbox(consumers);
}

/**
 * ระบายคิวหลังตอบ response — ใช้แทน `void drainAll().catch(() => {})` ทุกที่
 *
 * 🔴 บั๊กจริงที่เจ้าของเจอ 1 ก.ย. 2026 ("ส่งข้อความไม่ออก"):
 *    `void drainAll()` เป็น floating promise · บน Vercel แลมบ์ดาถูก **แช่แข็งทันทีที่ response จบ**
 *    งานที่ยังค้างอยู่จึงถูกตัดกลางคัน ⇒ event ค้างในคิวจนกว่า cron รายชั่วโมงจะมาเก็บ
 *    วัดจาก prod: ข้อความของทีมหน่วง **557–600 วินาที** กว่าจะถึงลูกค้า (ของเดิมหน่วง 0 วิ)
 *    กรณีแย่สุด = รอถึงนาทีที่ 0 ของชั่วโมงถัดไป ≈ เกือบ 1 ชม.
 *
 * `after()` ของ Next บอกรันไทม์ว่า "ยังมีงานค้าง อย่าเพิ่งตัด" (บน Vercel ผูกกับ waitUntil)
 * ⇒ ผู้ใช้ไม่ต้องรอ (ไม่ได้ await ก่อนตอบ) แต่ของก็ไม่หาย
 *
 * ⚠️ `after()` เรียกได้เฉพาะในบริบทของคำขอ — สคริปต์/ข้อสอบ/cron ที่เรียก service ตรง ๆ
 *    จะโยน error ⇒ ตกกลับไปใช้แบบเดิมซึ่งใช้ได้ดีนอก serverless
 */
export function scheduleDrain(): void {
  try {
    after(() => {
      void drainAll().catch(() => {});
    });
  } catch {
    void drainAll().catch(() => {});
  }
}

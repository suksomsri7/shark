// Automation v1 (WO-0026) — engine: Trigger(outbox event) → Condition → Action
//
// runForEvent: รับ event ที่ drain สำเร็จ → หากติกาที่เข้าเงื่อนไข → ยิง action
//   match  = enabled + event ตรง + (minAmountSatang == null หรือ payload.amountSatang >= min)
//   NOTIFY  → สร้าง AppNotification (ปลายทางศูนย์แจ้งเตือน) + AutomationRun OK
//   WEBHOOK → POST JSON {event, payload} ไป url (deps.post ฉีดได้ · ของจริง fetch timeout ~5s)
//             post พัง → AutomationRun FAILED **ห้าม throw** (เป็นเรื่องปกติของ webhook ปลายทางล่ม)
//   กติกาตัวหนึ่งพัง ต้องไม่ล้มตัวอื่น (try รอบตัว) · บันทึก AutomationRun ทุกครั้ง (OK/FAILED)
//   คืนค่า = จำนวนกติกาที่ยิง (match แล้วลงมือ ไม่ว่าจะ OK หรือ FAILED)
//
// tenant-scoped ผ่าน tenantDb({ tenantId }) — inject tenantId ทุก query (ร้านอื่นเห็น 0 กติกา)

import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { formatBaht } from "@/lib/ui/money";
import { eventLabel } from "./labels";

// CRM C2.1 ▸ event อาจพก `id` (OutboxEvent.id → กุญแจกันซ้ำ) · `systemId` (ระบบของ event) · `idempotencyKey` ◂
// C5.4 (L3-m4) ▸ เอนจิน v1 ใช้ `id` เป็นกุญแจ "ครั้งเดียวต่อ (กฎ, event)" แล้ว (ดู runForEvent) ◂
export type AutomationEvent = { tenantId: string; type: string; payload: unknown; id?: string | null; systemId?: string | null; idempotencyKey?: string | null };
export type AutomationDeps = { post?: (url: string, body: unknown) => Promise<void> };

// ดึง amountSatang จาก payload แบบปลอดภัย (event ที่ไม่มียอด → null)
const amountSatangOf = (payload: unknown): number | null => {
  const p = payload as { amountSatang?: unknown } | null;
  return p && typeof p.amountSatang === "number" ? p.amountSatang : null;
};

// ยิง webhook ของจริง (เมื่อไม่ได้ฉีด deps.post) — POST JSON, timeout ~5s, ไม่ 2xx = พัง
// 🔴 C5.4 (L4-M2): เดิม fetch ตรง ๆ ไม่มีด่าน SSRF เลย (และตาม redirect) — URL ของกฎมาจากร้าน ⇒ ผ่าน `outboundFetch`
//    ตัวเดียวของแพลตฟอร์ม (บล็อกที่อยู่ภายในทุกรูป · ตรึง IP ตอนต่อ · 3xx = ล้ม) · lazy import กันวง import
//    รอบ 2 (มติผู้คุมงาน): 3xx = ส่งถึงแล้ว (ปลายทางทำงานไปแล้ว เช่น Apps Script) ⇒ run OK พร้อมหมายเหตุ ไม่ใช่ FAILED/ไม่ตาม
async function postWebhook(url: string, body: unknown): Promise<string | null> {
  const { outboundFetch, redirectWarning } = await import("@/lib/webhooks/service");
  const res = await outboundFetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), timeoutMs: 5000, maxBytes: 65_536 });
  const moved = redirectWarning(res.status);
  if (moved) return moved;
  if (!res.ok) throw new Error(`ปลายทางตอบรหัส ${res.status}`);
  return null;
}

export async function runForEvent(evt: AutomationEvent, deps?: AutomationDeps): Promise<number> {
  const db = tenantDb({ tenantId: evt.tenantId });
  // เฉพาะกติกาที่เปิดอยู่ + event ตรง (index [tenantId, event, enabled])
  // 🔴 K2.9: `boardId: null` = **กฎระดับร้านเท่านั้น** (POS/คลัง/ธีม) — กฎของบอร์ดงานมีรูปคนละแบบ
  //    (เงื่อนไข/การกระทำอยู่ใน `conditions`/`actions` ส่วน `actionType` เป็นแค่ placeholder NOTIFY)
  //    ถ้าไม่กรอง เอนจินเดิมจะเห็นกฎบอร์ดแล้วยิงแจ้งเตือนทั้งร้านมั่ว ๆ ทุกครั้งที่การ์ดขยับ
  // 🔴 M1.9: `scope: "KANBAN"` = **กฎของร้านแบบเดิมเท่านั้น** — กฎระดับสมาชิก (MEMBER_TIER) และ
  //    journey (MEMBER_JOURNEY) ใช้ตารางเดียวกันแต่คนละรูป (`event = ""` · เงื่อนไข/การกระทำอยู่ใน
  //    conditions/actions และถูกประเมินโดย `member/tiers.ts`) ⇒ เอนจินเดิมต้องมองไม่เห็น
  //    (ตามคอมเมนต์ที่ enum `AutomationScope` ใน automation.prisma: "ทุกขาอ่านของ v1 กรอง scope = KANBAN")
  const rules = await db.automationRule.findMany({
    where: { event: evt.type, enabled: true, boardId: null, scope: "KANBAN" },
    orderBy: { createdAt: "asc" },
  });

  const amountSatang = amountSatangOf(evt.payload);
  // C5.4 รอบ 2: ตัวส่งจริงคืน "หมายเหตุ" (3xx = ส่งถึงแต่ไม่ตามที่อยู่ใหม่) · ตัวที่ฉีดมาคืน void ตามเดิม
  const post = async (url: string, body: unknown): Promise<string | null> => (deps?.post ? (await deps.post(url, body), null) : postWebhook(url, body));
  let fired = 0;
  // 🔴 C5.4 (L3-m4): กฎ v1 ทำงาน **ครั้งเดียวต่อ (กฎ, event)** — `withAutomation` เรียกเอนจินทุกครั้งที่คิว retry event ที่งานหลักล้ม
  //    (สูงสุด 5 รอบ) และ drainer ซ้อนอาจหยิบ event เดียวกันได้ ⇒ เดิม NOTIFY/WEBHOOK ออกซ้ำทุกรอบ
  //    กุญแจ = `v1:<OutboxEvent.id>` ในคอลัมน์ `eventKey` (มีอยู่แล้ว — ไม่ต้อง migration) · จองแถว run ก่อนลงมือภายใต้
  //    advisory lock ต่อ (กฎ, กุญแจ) ⇒ สองโพรเซสพร้อมกันก็ได้แถวเดียว · event ที่ไม่มี id (เรียกนอกคิว) = ทำงานทุกครั้งเหมือนเดิม
  //    ผลที่ยอมรับ: ถ้าโพรเซสตายหลังจองก่อนลงมือ การกระทำนั้นหาย (at-most-once — ตรงกับสัญญา "ฮุค/แจ้งเตือนรอบเดียวต่อ event")
  const v1Key = evt.id ? `v1:${evt.id}` : null;

  for (const rule of rules) {
    // ── เงื่อนไข: ยอดขั้นต่ำ (มีค่า → ต้องมียอดและถึงเกณฑ์) ──
    if (rule.minAmountSatang != null) {
      if (amountSatang == null || amountSatang < rule.minAmountSatang) continue;
    }
    let claimedRunId: string | null = null;
    if (v1Key) {
      const key = v1Key;
      claimedRunId = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`automation-v1:${rule.id}:${key}`}, 0))`;
        const seen = await tx.automationRun.findFirst({ where: { ruleId: rule.id, eventKey: key }, select: { id: true } });
        if (seen) return null;
        const row = await tx.automationRun.create({
          data: { tenantId: evt.tenantId, ruleId: rule.id, status: "OK", eventKey: key },
          select: { id: true },
        });
        return row.id;
      });
      if (!claimedRunId) continue; // event นี้เคยทำให้กฎนี้ทำงานแล้ว (รอบ retry/drainer ซ้อน) ⇒ ไม่ทำซ้ำ ไม่นับ
    }
    fired++; // นับตอน match แล้วลงมือ (webhook พังก็ถือว่ายิงไปแล้ว)

    const cfg = (rule.actionConfig ?? {}) as { title?: unknown; url?: unknown };
    let runNote: string | null = null;
    try {
      if (rule.actionType === "NOTIFY") {
        const title =
          typeof cfg.title === "string" && cfg.title.trim() ? cfg.title.trim() : rule.name;
        const body =
          amountSatang != null
            ? `${eventLabel(evt.type)} · ยอด ${formatBaht(amountSatang)}`
            : eventLabel(evt.type);
        await db.appNotification.create({ data: { tenantId: evt.tenantId, title, body } });
      } else {
        const url = typeof cfg.url === "string" ? cfg.url.trim() : "";
        if (!url) throw new Error("ยังไม่ได้ตั้ง URL ปลายทาง");
        const note = await post(url, { event: evt.type, payload: evt.payload });
        if (typeof note === "string" && note) runNote = note.slice(0, 500);
      }
      // แถวที่จองไว้แล้ว (มี id ของ event) เป็น OK อยู่แล้ว · เรียกนอกคิว = สร้างแถวตามเดิม
      if (!claimedRunId) {
        await db.automationRun.create({
          data: { tenantId: evt.tenantId, ruleId: rule.id, status: "OK", ...(runNote ? { detail: runNote } : {}) },
        });
      } else if (runNote) {
        await db.automationRun.updateMany({ where: { id: claimedRunId }, data: { detail: runNote } });
      }
    } catch (e) {
      // action พัง (เช่น webhook ปลายทางล่ม) → บันทึก FAILED แล้วไปกติกาถัดไป ห้าม throw
      const detail = e instanceof Error ? e.message.slice(0, 500) : String(e);
      await (claimedRunId
        ? db.automationRun.updateMany({ where: { id: claimedRunId }, data: { status: "FAILED", detail } })
        : db.automationRun.create({ data: { tenantId: evt.tenantId, ruleId: rule.id, status: "FAILED", detail } })
      ).catch(() => {});
    }
  }

  // 🔴 K2.9 — กฎของ "บอร์ดงาน" มีเอนจินของตัวเองในโมดูล (เงื่อนไข AND + การกระทำเป็นลำดับ + กันวน + โควตา)
  //    lazy import กัน import วงกลม (kanban/automation.ts → notify/service → outbox-consumers → engine)
  //    `runForKanbanEvent` **ห้าม throw** ตามสัญญาของมันเอง ⇒ ที่นี่บวกค่าที่คืนมาตรง ๆ ได้
  if (evt.type.startsWith("kanban.")) {
    const { runForKanbanEvent } = await import("@/lib/modules/kanban/automation");
    fired += await runForKanbanEvent(evt, deps);
  }

  // CRM C2.1 ▸ กฎของ CRM (scope CRM + crmSystemId) มีเอนจินของตัวเองในโมดูล — delegation แบบเดียวกับบอร์ดงานข้างบน
  //   lazy import กัน import วงกลม (crm/automation → contacts/deals → … → outbox-consumers → engine) · `runForCrmEvent` ห้าม throw
  //   AUDIT-CLASS X1: เอนจิน CRM เห็นเฉพาะกฎ scope "CRM" ของระบบของ event (โหลดตัวตนด้วย id ในร้านนั้น) — ตัวกรอง v1 ข้างบนไม่เปลี่ยน
  //   N1 ทางลัด: ร้านไม่มีกฎ CRM ที่เปิดอยู่สำหรับ event นี้ = ไม่โหลดกราฟของโมดูล CRM เลย (index [tenantId, event, enabled])
  if (
    (evt.type.startsWith("crm.") || evt.type.startsWith("custom.record.")) &&
    (await db.automationRule.findFirst({ where: { event: evt.type, enabled: true, scope: "CRM" }, select: { id: true } }))
  ) {
    const { runForCrmEvent } = await import("@/lib/modules/crm/automation");
    fired += (await runForCrmEvent(evt, deps?.post ? { deps: { post: deps.post } } : {})).runs;
  }
  // ◂ CRM C2.1

  return fired;
}

// ชนิด actionConfig ที่บันทึก (ช่วยฝั่ง service/UI) — Json ใน DB
export type NotifyConfig = { title?: string };
export type WebhookConfig = { url: string };
export type AutomationActionConfig = Prisma.InputJsonValue;

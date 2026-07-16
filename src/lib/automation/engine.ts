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

export type AutomationEvent = { tenantId: string; type: string; payload: unknown };
export type AutomationDeps = { post?: (url: string, body: unknown) => Promise<void> };

// ดึง amountSatang จาก payload แบบปลอดภัย (event ที่ไม่มียอด → null)
const amountSatangOf = (payload: unknown): number | null => {
  const p = payload as { amountSatang?: unknown } | null;
  return p && typeof p.amountSatang === "number" ? p.amountSatang : null;
};

// ยิง webhook ของจริง (เมื่อไม่ได้ฉีด deps.post) — POST JSON, timeout ~5s, ไม่ 2xx = พัง
async function postWebhook(url: string, body: unknown): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`ปลายทางตอบรหัส ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function runForEvent(evt: AutomationEvent, deps?: AutomationDeps): Promise<number> {
  const db = tenantDb({ tenantId: evt.tenantId });
  // เฉพาะกติกาที่เปิดอยู่ + event ตรง (index [tenantId, event, enabled])
  const rules = await db.automationRule.findMany({
    where: { event: evt.type, enabled: true },
    orderBy: { createdAt: "asc" },
  });

  const amountSatang = amountSatangOf(evt.payload);
  const post = deps?.post ?? postWebhook;
  let fired = 0;

  for (const rule of rules) {
    // ── เงื่อนไข: ยอดขั้นต่ำ (มีค่า → ต้องมียอดและถึงเกณฑ์) ──
    if (rule.minAmountSatang != null) {
      if (amountSatang == null || amountSatang < rule.minAmountSatang) continue;
    }
    fired++; // นับตอน match แล้วลงมือ (webhook พังก็ถือว่ายิงไปแล้ว)

    const cfg = (rule.actionConfig ?? {}) as { title?: unknown; url?: unknown };
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
        await post(url, { event: evt.type, payload: evt.payload });
      }
      await db.automationRun.create({
        data: { tenantId: evt.tenantId, ruleId: rule.id, status: "OK" },
      });
    } catch (e) {
      // action พัง (เช่น webhook ปลายทางล่ม) → บันทึก FAILED แล้วไปกติกาถัดไป ห้าม throw
      const detail = e instanceof Error ? e.message.slice(0, 500) : String(e);
      await db.automationRun
        .create({ data: { tenantId: evt.tenantId, ruleId: rule.id, status: "FAILED", detail } })
        .catch(() => {});
    }
  }

  return fired;
}

// ชนิด actionConfig ที่บันทึก (ช่วยฝั่ง service/UI) — Json ใน DB
export type NotifyConfig = { title?: string };
export type WebhookConfig = { url: string };
export type AutomationActionConfig = Prisma.InputJsonValue;

// member-journey-senders.ts — composition root: "ตัวส่งจริง" ปริยายของ journey อัตโนมัติ (M3.3)
//
// 🔴 ทำไมอยู่นอก `src/lib/modules/member/`
//    ตัวส่งต้องแตะแชท (LINE) และบอร์ดงาน (การ์ด) — เส้น member→chat / member→kanban **ไม่อยู่ใน allowlist
//    ของ fitness F2** (ตั้งใจให้โมดูลสมาชิกไม่รู้จักแชท/บอร์ดงาน) ⇒ ต่อสายที่ composition root แบบเดียวกับ
//    `member-bridges.ts` / `member-hooks.ts` แล้วส่งเข้าเอนจินผ่าน `deps` (ผู้เรียก = คิว outbox + cron)
// 🔴 **ไม่เขียนตัวส่งใหม่**: ใช้ประตูเดียวกับแคมเปญ M3.2 ทุกช่องทาง
//    LINE = `chat.pushToContact` · อีเมล = `core/email.sendEmail` · SMS = `core/sms.getSmsProvider`
//    push = `core/push.sendPushToCustomerTokens` (เครื่องของ **ลูกค้า** `MemberPushDevice`)
//    การ์ดงาน = `kanban/links.createCardFromExternal` (ประตูเดียวที่โมดูลอื่นเขียนบอร์ดได้)
// 🔴 ด่านความยินยอมชั้นที่ 2 อยู่ที่นี่: ส่งจริงเฉพาะ `consent === "GRANTED"` (§7.1 เงียบ ≠ ยินยอม)
//    ชั้นที่ 1 (ถอนความยินยอม = ไม่ส่งไม่ว่าตัวส่งจะเป็นอะไร) อยู่ในเอนจิน `member/journeys.ts`
// 🔴 ทุกตัว **ห้าม throw** — ส่งไม่ถึง 1 คนต้องไม่ทำให้ทั้ง journey ล้ม (คืน `{ ok: false, error }` แทน)
// 🔴 `core/email` import แบบ dynamic: `@/lib/env` ตรวจ env ตอนโหลดไฟล์ (fitness โหมดไม่มี env)

import { prisma } from "@/lib/core/db";
import { getSmsProvider } from "@/lib/core/sms";
import { sendPushToCustomerTokens } from "@/lib/core/push";
import { pushToContact } from "@/lib/modules/chat";
import { createCardFromExternal } from "@/lib/modules/kanban/links";
import type { JourneyDeps, JourneySendRequest, JourneySendResult } from "@/lib/modules/member/journeys-shared";

const CHANNEL_NAME: Record<string, string> = { LINE: "LINE", EMAIL: "อีเมล", SMS: "SMS", PUSH: "แจ้งเตือนในแอป" };

/** ด่านร่วมของทุกช่องทาง: ยินยอมแล้ว + มีที่อยู่ปลายทาง — ไม่ผ่าน = ข้าม (ไม่ใช่ล้ม) */
function precheck(req: JourneySendRequest): JourneySendResult | null {
  const name = CHANNEL_NAME[req.channel] ?? req.channel;
  if (req.consent !== "GRANTED") {
    return { ok: false, skipped: true, error: `ลูกค้ายังไม่ได้ยินยอมรับข่าวสารทาง${name}` };
  }
  if (!req.to.trim()) {
    const what = req.channel === "LINE" ? "ยังไม่ได้ผูกบัญชีไลน์" : req.channel === "EMAIL" ? "ยังไม่มีอีเมลในโปรไฟล์" : req.channel === "SMS" ? "ยังไม่มีเบอร์ในโปรไฟล์" : "ยังไม่ได้ลงแอป/เปิดแจ้งเตือน";
    return { ok: false, skipped: true, error: `${what} — ส่งทาง${name}ไม่ได้` };
  }
  return null;
}

const errText = (e: unknown, fallback: string): string => (e instanceof Error ? e.message.slice(0, 200) : fallback);

export const journeySenders: Required<JourneyDeps> = {
  line: async (req) => {
    const pre = precheck(req);
    if (pre) return pre;
    try {
      // systemId ของ pushToContact = ระบบ "แชท" (ไม่ใช่ระบบสมาชิก) — null = ใช้การเชื่อมต่อ LINE ที่ร้านเปิดอยู่
      const r = await pushToContact({ tenantId: req.tenantId, channel: "LINE", externalUserId: req.to, text: req.body, customerId: req.customerId, systemId: null });
      return { ok: r.ok, ...(r.reason ? { error: r.reason } : {}) };
    } catch (e) {
      return { ok: false, error: errText(e, "ส่ง LINE ไม่สำเร็จ") };
    }
  },
  email: async (req) => {
    const pre = precheck(req);
    if (pre) return pre;
    try {
      const { sendEmail } = await import("@/lib/core/email");
      await sendEmail(req.to, req.subject ?? "ข่าวสารจากร้าน", req.body);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errText(e, "ส่งอีเมลไม่สำเร็จ") };
    }
  },
  sms: async (req) => {
    const pre = precheck(req);
    if (pre) return pre;
    const provider = getSmsProvider();
    if (!provider) return { ok: false, skipped: true, error: "ร้านยังไม่ได้เชื่อมเกตเวย์ SMS" };
    try {
      const r = await provider.send({ to: req.to, text: req.body });
      return { ok: r.ok, ...(r.error ? { error: r.error } : {}) };
    } catch (e) {
      return { ok: false, error: errText(e, "ส่ง SMS ไม่สำเร็จ") };
    }
  },
  push: async (req) => {
    const pre = precheck(req);
    if (pre) return pre;
    try {
      const r = await sendPushToCustomerTokens(req.tenantId, req.to.split(","), { title: req.title ?? "ข่าวสารจากร้าน", body: req.body });
      return r.sent > 0 ? { ok: true } : { ok: false, error: r.failures[0] ?? "ส่งแจ้งเตือนไม่ถึงเครื่องของลูกค้า" };
    } catch (e) {
      return { ok: false, error: errText(e, "ส่งแจ้งเตือนไม่สำเร็จ") };
    }
  },
  kanban: async (req) => {
    try {
      const board = await prisma.kanbanBoard.findFirst({ where: { id: req.boardId, tenantId: req.tenantId }, select: { systemId: true } });
      if (!board) return { ok: false, error: "ไม่พบบอร์ดปลายทางของการ์ดนี้ — เลือกบอร์ดใหม่ใน journey" };
      const r = await createCardFromExternal(
        { tenantId: req.tenantId, systemId: board.systemId, actorUserId: null },
        { boardId: req.boardId, title: req.title, description: req.description ?? null, sourceType: "AUTOMATION", sourceKey: req.sourceKey },
      );
      return { ok: true, cardId: r.cardId };
    } catch (e) {
      return { ok: false, error: errText(e, "เปิดการ์ดงานไม่สำเร็จ") };
    }
  },
};
